import { AuthorizedShop, TikTokOrder, TikTokProduct, FeeConfig, FeeEstimate } from "../types";

// Cliente do proxy. O frontend nunca assina requisicoes nem ve o app_secret:
// envia operacao + token + shop_cipher e o backend cuida da assinatura HMAC.
async function callProxy<T = any>(body: {
  operation: string;
  accessToken: string;
  shopCipher?: string;
  params?: any;
}): Promise<T> {
  const response = await fetch("/tiktok-proxy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const contentType = response.headers.get("content-type");
  if (!contentType || !contentType.includes("application/json")) {
    const text = await response.text();
    console.error("Resposta nao-JSON do servidor:", text);
    throw new Error(
      `O servidor retornou uma resposta inesperada (possivel bloqueio de firewall ou crash). Detalhes: ${text.substring(0, 150)}`
    );
  }

  const data = await response.json();

  if (!response.ok) {
    throw mapError(response.status, data);
  }

  // A Open API encapsula o resultado em { code, message, data }. code !== 0 = erro.
  if (typeof data.code === "number" && data.code !== 0) {
    throw mapTikTokBusinessError(data);
  }

  return (data.data ?? data) as T;
}

function mapError(status: number, data: any): Error {
  const detail = data?.message || data?.error || JSON.stringify(data);
  if (status === 401 || status === 403) {
    return new Error(
      `${status}: Token invalido/expirado ou sem permissao (escopo). Verifique o access_token e os scopes do app. Detalhes: ${detail}`
    );
  }
  if (status === 429) {
    return new Error(
      "Erro 429 (rate limit): limite de requisicoes atingido na API do TikTok Shop. Aguarde um momento e tente novamente."
    );
  }
  return new Error(`Erro ${status}: ${detail}`);
}

function mapTikTokBusinessError(data: any): Error {
  const code = data.code;
  const msg = data.message || "Erro de negocio da API.";
  // 105002 / 105000 costumam indicar problemas de assinatura ou token.
  if (code === 105002 || code === 36004003) {
    return new Error(`Assinatura ou token invalido (code ${code}): ${msg}`);
  }
  return new Error(`API TikTok (code ${code}): ${msg}`);
}

// ---- Operacoes ----

export interface ShopsResponse {
  shops: AuthorizedShop[];
}

export const getAuthorizedShops = (accessToken: string): Promise<ShopsResponse> =>
  callProxy({ operation: "getAuthorizedShops", accessToken });

export interface ProductSearchResponse {
  products: TikTokProduct[];
  next_page_token?: string;
  total_count?: number;
}

export const searchProducts = (
  accessToken: string,
  shopCipher: string,
  params: { sellerSkus?: string[]; status?: string; pageSize?: number; pageToken?: string }
): Promise<ProductSearchResponse> =>
  callProxy({ operation: "searchProducts", accessToken, shopCipher, params });

export const getProduct = (
  accessToken: string,
  shopCipher: string,
  productId: string
): Promise<TikTokProduct> =>
  callProxy({ operation: "getProduct", accessToken, shopCipher, params: { productId } });

export interface OrderSearchResponse {
  orders: TikTokOrder[];
  next_page_token?: string;
  total_count?: number;
}

export const searchOrders = (
  accessToken: string,
  shopCipher: string,
  params: {
    orderStatus?: string;
    createTimeGe?: number;
    createTimeLt?: number;
    pageSize?: number;
    pageToken?: string;
  }
): Promise<OrderSearchResponse> =>
  callProxy({ operation: "searchOrders", accessToken, shopCipher, params });

export interface OrderDetailResponse {
  orders: TikTokOrder[];
}

export const getOrderDetail = (
  accessToken: string,
  shopCipher: string,
  ids: string[]
): Promise<OrderDetailResponse> =>
  callProxy({ operation: "getOrderDetail", accessToken, shopCipher, params: { ids } });

// ---- Estimativa de taxas (calculo local) ----
// O TikTok Shop nao expoe um endpoint de estimativa pre-venda (como a Amazon).
// Aqui calculamos uma aproximacao a partir de percentuais configuraveis.
export function estimateFees(grossAmount: number, config: FeeConfig): FeeEstimate {
  const commission = grossAmount * (config.commissionRate / 100);
  const transactionFee = grossAmount * (config.transactionRate / 100);
  const totalFees = commission + transactionFee;
  return {
    grossAmount,
    commission,
    transactionFee,
    totalFees,
    netAmount: grossAmount - totalFees,
  };
}
