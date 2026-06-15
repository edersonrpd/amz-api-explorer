import express from "express";
import path from "path";
import crypto from "crypto";
import "dotenv/config";
import { createServer as createViteServer } from "vite";

// ---------------------------------------------------------------------------
// TikTok Shop Partner API proxy
//
// Diferente da Amazon (que so encaminha o access token), o TikTok Shop exige
// uma assinatura HMAC-SHA256 em CADA requisicao, calculada com o app_secret.
// Por isso o app_secret vive somente aqui no backend e nunca chega ao browser.
//
// Contrato do proxy (chamado pelo frontend):
//   POST /tiktok-proxy
//   { operation, accessToken, shopCipher, params }
// O servidor monta a URL, ordena os parametros, assina e encaminha.
// ---------------------------------------------------------------------------

const APP_KEY = process.env.TIKTOK_APP_KEY || "";
const APP_SECRET = process.env.TIKTOK_APP_SECRET || "";
const BASE_URL = process.env.TIKTOK_BASE_URL || "https://open-api.tiktokglobalshop.com";

type Query = Record<string, string>;

// Algoritmo de assinatura do TikTok Shop (Open API 2023+):
//  1. Reune os query params (exceto `sign` e `access_token`) e ordena por chave.
//  2. Concatena no formato {key}{value} sem separador.
//  3. Prefixa o path da requisicao.
//  4. Anexa o corpo cru (quando content-type for application/json).
//  5. Envolve a string com o app_secret nas duas pontas.
//  6. HMAC-SHA256 com o app_secret como chave, saida em hex.
function signRequest(reqPath: string, query: Query, body: string): string {
  const keys = Object.keys(query)
    .filter((k) => k !== "sign" && k !== "access_token")
    .sort();

  let baseString = APP_SECRET + reqPath;
  for (const k of keys) {
    baseString += k + query[k];
  }
  if (body) {
    baseString += body;
  }
  baseString += APP_SECRET;

  return crypto.createHmac("sha256", APP_SECRET).update(baseString).digest("hex");
}

interface SignedRequest {
  path: string;
  method: "GET" | "POST" | "PUT";
  // query params especificos da operacao (alem de app_key/timestamp/shop_cipher)
  query?: Query;
  bodyObj?: any;
  accessToken: string;
  shopCipher?: string;
}

async function callTikTok({ path: reqPath, method, query, bodyObj, accessToken, shopCipher }: SignedRequest) {
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const finalQuery: Query = {
    app_key: APP_KEY,
    timestamp,
    ...(shopCipher ? { shop_cipher: shopCipher } : {}),
    ...(query || {}),
  };

  const body = bodyObj !== undefined && bodyObj !== null ? JSON.stringify(bodyObj) : "";
  const sign = signRequest(reqPath, finalQuery, body);
  finalQuery.sign = sign;

  const qs = new URLSearchParams(finalQuery).toString();
  const url = `${BASE_URL}${reqPath}?${qs}`;

  const headers = new Headers();
  headers.set("x-tts-access-token", accessToken);
  headers.set("content-type", "application/json");
  headers.set("user-agent", "TikTok-Shop-Explorer/1.0 (Language=Node.js)");

  const options: RequestInit = { method, headers };
  if (body) {
    options.body = body;
  }

  console.log(`[TIKTOK] ${method} ${reqPath}`);
  const response = await fetch(url, options);
  const text = await response.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    data = { text };
  }
  return { status: response.status, data };
}

// Mapeia uma operacao logica para a chamada concreta na Open API.
// Versoes (ex.: 202309) seguem a documentacao vigente do TikTok Shop.
async function dispatch(operation: string, accessToken: string, shopCipher: string | undefined, params: any) {
  switch (operation) {
    // Lojas autorizadas ao app pelo token (nao exige shop_cipher).
    case "getAuthorizedShops":
      return callTikTok({
        path: "/authorization/202309/shops",
        method: "GET",
        accessToken,
      });

    // Busca paginada de produtos. Filtros opcionais por status e seller_skus.
    case "searchProducts":
      return callTikTok({
        path: "/product/202309/products/search",
        method: "POST",
        query: {
          page_size: String(params?.pageSize || 50),
          ...(params?.pageToken ? { page_token: params.pageToken } : {}),
        },
        bodyObj: {
          ...(params?.status ? { status: params.status } : {}),
          ...(params?.sellerSkus && params.sellerSkus.length ? { seller_skus: params.sellerSkus } : {}),
        },
        accessToken,
        shopCipher,
      });

    // Detalhe de um produto pelo product_id.
    case "getProduct":
      return callTikTok({
        path: `/product/202309/products/${encodeURIComponent(params?.productId || "")}`,
        method: "GET",
        accessToken,
        shopCipher,
      });

    // Busca paginada de pedidos. Filtros por status / janela de criacao / ids.
    case "searchOrders":
      return callTikTok({
        path: "/order/202309/orders/search",
        method: "POST",
        query: {
          page_size: String(params?.pageSize || 50),
          ...(params?.pageToken ? { page_token: params.pageToken } : {}),
        },
        bodyObj: {
          ...(params?.orderStatus ? { order_status: params.orderStatus } : {}),
          ...(params?.createTimeGe ? { create_time_ge: params.createTimeGe } : {}),
          ...(params?.createTimeLt ? { create_time_lt: params.createTimeLt } : {}),
        },
        accessToken,
        shopCipher,
      });

    // Detalhe de um ou mais pedidos por id (ate 50 por chamada).
    case "getOrderDetail":
      return callTikTok({
        path: "/order/202309/orders",
        method: "GET",
        query: { ids: (params?.ids || []).join(",") },
        accessToken,
        shopCipher,
      });

    // Acerto financeiro (settlement) de um pedido.
    case "getOrderSettlements":
      return callTikTok({
        path: "/finance/202309/orders/settlements",
        method: "GET",
        query: { ids: (params?.ids || []).join(",") },
        accessToken,
        shopCipher,
      });

    default:
      return { status: 400, data: { error: `Operacao nao suportada: ${operation}` } };
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  app.post("/tiktok-proxy", async (req, res) => {
    try {
      if (!APP_KEY || !APP_SECRET) {
        return res.status(500).json({
          error:
            "TIKTOK_APP_KEY/TIKTOK_APP_SECRET nao configurados no servidor. Defina-os no arquivo .env.",
        });
      }

      const { operation, accessToken, shopCipher, params } = req.body || {};

      if (!operation) {
        return res.status(400).json({ error: "Missing operation" });
      }
      if (!accessToken) {
        return res.status(400).json({ error: "Missing accessToken" });
      }

      const { status, data } = await dispatch(operation, accessToken, shopCipher, params || {});
      res.status(status).json(data);
    } catch (error: any) {
      console.error("[TIKTOK ERROR]:", error.message);
      res.status(400).json({ error: `Proxy falhou ao acessar o destino: ${error.message}` });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`TikTok Shop Explorer running on http://localhost:${PORT}`);
  });
}

startServer();
