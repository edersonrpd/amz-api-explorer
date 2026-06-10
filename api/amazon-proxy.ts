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

    const { credentials, params, operation } = JSON.parse(decodeURIComponent(decodedStr));

    const { accessToken, sellerId, marketplaceId } = credentials;

    const BASE_URL_NA = "https://sellingpartnerapi-na.amazon.com";
    const encodedSellerId = encodeURIComponent(sellerId);
    
    let op = operation;
    if (!op) {
      op = (params && params.skus && Array.isArray(params.skus)) ? "searchListingsItems" : "getListingsItem";
    }

    let url = "";
    if (op === "getListingsItem") {
      const encodedSku = encodeURIComponent(params?.sku || "");
      const queryParams = new URLSearchParams({
        marketplaceIds: marketplaceId,
        includedData: "summaries,attributes,issues,offers,fulfillmentAvailability",
        issueLocale: "en_US"
      });
      url = `${BASE_URL_NA}/listings/2021-08-01/items/${encodedSellerId}/${encodedSku}?${queryParams.toString()}`;
    } else if (op === "searchListingsItems") {
      const queryParams = new URLSearchParams({
        marketplaceIds: marketplaceId,
        identifiers: (params?.skus || []).join(","),
        identifiersType: "SKU",
        includedData: "summaries,attributes,issues,offers,fulfillmentAvailability",
        pageSize: "20"
      });
      url = `${BASE_URL_NA}/listings/2021-08-01/items/${encodedSellerId}?${queryParams.toString()}`;
    } else if (op === "getOrders") {
      const queryParams = new URLSearchParams();
      queryParams.set("MarketplaceIds", marketplaceId);
      if (params?.createdAfter) {
        queryParams.set("CreatedAfter", params.createdAfter);
      }
      if (params?.nextToken) {
        queryParams.set("NextToken", params.nextToken);
      }
      if (params?.orderStatuses && Array.isArray(params.orderStatuses)) {
        params.orderStatuses.forEach((st: string) => {
          queryParams.append("OrderStatuses", st);
        });
      }
      queryParams.set("MaxResultsPerPage", "100");
      url = `${BASE_URL_NA}/orders/v0/orders?${queryParams.toString()}`;
    } else if (op === "getOrderItems") {
      const encodedOrderId = encodeURIComponent(params?.orderId || "");
      url = `${BASE_URL_NA}/orders/v0/orders/${encodedOrderId}/orderItems`;
    } else {
      return res.status(400).json({ error: `Operation not supported: ${op}` });
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
