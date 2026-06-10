import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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
    const { sku, skus } = params;

    const BASE_URL_NA = "https://sellingpartnerapi-na.amazon.com";
    const encodedSellerId = encodeURIComponent(sellerId);
    
    let url = "";
    if (skus && Array.isArray(skus)) {
      const queryParams = new URLSearchParams({
        marketplaceIds: marketplaceId,
        identifiers: skus.join(","),
        identifiersType: "SKU",
        includedData: "summaries,attributes,issues,offers,fulfillmentAvailability",
        pageSize: "20"
      });
      url = `${BASE_URL_NA}/listings/2021-08-01/items/${encodedSellerId}?${queryParams.toString()}`;
    } else {
      const encodedSku = encodeURIComponent(sku);
      const queryParams = new URLSearchParams({
        marketplaceIds: marketplaceId,
        includedData: "summaries,attributes,issues,offers,fulfillmentAvailability",
        issueLocale: "en_US"
      });
      url = `${BASE_URL_NA}/listings/2021-08-01/items/${encodedSellerId}/${encodedSku}?${queryParams.toString()}`;
    }

    const fetchHeaders = new Headers();
    fetchHeaders.set("x-amz-access-token", accessToken);
    fetchHeaders.set("accept", "application/json");
    fetchHeaders.set("user-agent", "Amazon-Listings-Explorer/1.0 (Language=Node.js, Environment=Vercel)");

    const fetchOptions: RequestInit = {
      method: "GET",
      headers: fetchHeaders,
    };

    console.log(`[AMAZON VERCEL] Fetching: ${url}`);
    const response = await fetch(url, fetchOptions);
    const isJson = response.headers.get("content-type")?.includes("application/json");

    const text = await response.text();
    let responseData;
    
    if (isJson) {
      try {
        responseData = JSON.parse(text);
      } catch (parseError) {
        console.warn("[AMAZON VERCEL] Failed to parse JSON even though content-type was JSON");
        responseData = { text, parseError: String(parseError) };
      }
    } else {
      responseData = { text };
    }

    res.status(response.status).json(responseData);
  } catch (error: any) {
    console.error("[AMAZON VERCEL ERROR]:", error.message);
    res.status(400).json({ error: `Proxy failed to reach target: ${error.message}` });
  }
}
