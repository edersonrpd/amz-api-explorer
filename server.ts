import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Add JSON parsing middleware to handle request body properly
  app.use(express.json());

  // Amazon SP-API Proxy Endpoint
  app.post("/amazon-proxy", async (req, res) => {
    try {
      const { payload } = req.body;
      
      if (!payload) {
        return res.status(400).json({ error: "Missing payload" });
      }

      let decodedStr = "";
      for (let i = 0; i < payload.length; i += 2) {
        decodedStr += String.fromCharCode(parseInt(payload.substring(i, i + 2), 16));
      }

      const { credentials, params } = JSON.parse(decodeURIComponent(decodedStr));

      const { accessToken, sellerId, marketplaceId } = credentials;
      const { sku } = params;

      const BASE_URL_NA = "https://sellingpartnerapi-na.amazon.com";
      const encodedSellerId = encodeURIComponent(sellerId);
      const encodedSku = encodeURIComponent(sku);
      
      const queryParams = new URLSearchParams({
        marketplaceIds: marketplaceId,
        includedData: "summaries,attributes,issues,offers,fulfillmentAvailability",
        issueLocale: "en_US"
      });

      const url = `${BASE_URL_NA}/listings/2021-08-01/items/${encodedSellerId}/${encodedSku}?${queryParams.toString()}`;

      const fetchHeaders = new Headers();
      fetchHeaders.set("x-amz-access-token", accessToken);
      fetchHeaders.set("accept", "application/json");
      fetchHeaders.set("user-agent", "Amazon-Listings-Explorer/1.0 (Language=Node.js)");

      const fetchOptions: RequestInit = {
        method: "GET",
        headers: fetchHeaders,
      };

      console.log(`[AMAZON] Fetching: ${url}`);
      const response = await fetch(url, fetchOptions);
      const isJson = response.headers.get("content-type")?.includes("application/json");

      const text = await response.text();
      let responseData;
      
      if (isJson) {
        try {
          responseData = JSON.parse(text);
        } catch (parseError) {
          console.warn("[AMAZON] Failed to parse JSON even though content-type was JSON");
          responseData = { text, parseError: String(parseError) };
        }
      } else {
        responseData = { text };
      }

      res.status(response.status).json(responseData);
    } catch (error: any) {
      console.error("[AMAZON ERROR]:", error.message);
      res.status(400).json({ error: `Proxy failed to reach target: ${error.message}` });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production static serving
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
