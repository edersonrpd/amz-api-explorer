import type { VercelRequest, VercelResponse } from '@vercel/node';
import zlib from 'zlib';

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

    // Download do documento de relatório (URL pré-assinada S3, pode vir comprimida em GZIP).
    // Tratado separadamente porque não usa BASE_URL_NA nem o access token.
    if (op === "downloadReportDocument") {
      const docUrl = params?.url;
      if (!docUrl) {
        return res.status(400).json({ error: "Missing report document url" });
      }
      const docResponse = await fetch(docUrl);
      const arrayBuffer = await docResponse.arrayBuffer();
      let buffer = Buffer.from(arrayBuffer);
      if (params?.compressionAlgorithm === "GZIP") {
        buffer = zlib.gunzipSync(buffer);
      }
      // Relatórios de listings podem vir em UTF-8 ou Latin-1 (Cp1252).
      // Decodifica como UTF-8 e, se houver caractere de substituição, refaz em latin1.
      let content = buffer.toString("utf-8");
      if (content.includes("�")) {
        content = buffer.toString("latin1");
      }
      return res.status(docResponse.status).json({ content });
    }

    let url = "";
    let method = "GET";
    let requestBody: string | undefined;
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
      
      if (params?.amazonOrderIds && Array.isArray(params.amazonOrderIds) && params.amazonOrderIds.length > 0) {
        queryParams.set("AmazonOrderIds", params.amazonOrderIds.join(","));
      } else {
        if (params?.createdAfter) {
          queryParams.set("CreatedAfter", params.createdAfter);
        }
        if (params?.orderStatuses && Array.isArray(params.orderStatuses)) {
          params.orderStatuses.forEach((st: string) => {
            queryParams.append("OrderStatuses", st);
          });
        }
      }

      if (params?.nextToken) {
        queryParams.set("NextToken", params.nextToken);
      }
      queryParams.set("MaxResultsPerPage", "100");
      url = `${BASE_URL_NA}/orders/v0/orders?${queryParams.toString()}`;
    } else if (op === "getOrderItems") {
      const encodedOrderId = encodeURIComponent(params?.orderId || "");
      url = `${BASE_URL_NA}/orders/v0/orders/${encodedOrderId}/orderItems`;
    } else if (op === "getOrderFinances") {
      const encodedOrderId = encodeURIComponent(params?.orderId || "");
      url = `${BASE_URL_NA}/finances/v0/orders/${encodedOrderId}/financialEvents`;
    } else if (op === "getFeesEstimateForSku") {
      const encodedSku = encodeURIComponent(params?.sku || "");
      url = `${BASE_URL_NA}/products/fees/v0/listings/${encodedSku}/feesEstimate`;
      method = "POST";
      requestBody = JSON.stringify({
        FeesEstimateRequest: {
          MarketplaceId: marketplaceId,
          IsAmazonFulfilled: !!params?.isAmazonFulfilled,
          PriceToEstimateFees: {
            ListingPrice: {
              CurrencyCode: params?.currencyCode || "BRL",
              Amount: params?.price
            }
          },
          Identifier: `fees-${Date.now()}`
        }
      });
    } else if (op === "createReport") {
      url = `${BASE_URL_NA}/reports/2021-06-30/reports`;
      method = "POST";
      requestBody = JSON.stringify({
        reportType: params?.reportType || "GET_MERCHANT_LISTINGS_ALL_DATA",
        marketplaceIds: [marketplaceId]
      });
    } else if (op === "getReport") {
      const encodedReportId = encodeURIComponent(params?.reportId || "");
      url = `${BASE_URL_NA}/reports/2021-06-30/reports/${encodedReportId}`;
    } else if (op === "getReportDocument") {
      const encodedDocId = encodeURIComponent(params?.reportDocumentId || "");
      url = `${BASE_URL_NA}/reports/2021-06-30/documents/${encodedDocId}`;
    } else {
      return res.status(400).json({ error: `Operation not supported: ${op}` });
    }

    const fetchHeaders = new Headers();
    fetchHeaders.set("x-amz-access-token", accessToken);
    fetchHeaders.set("accept", "application/json");
    fetchHeaders.set("user-agent", "Amazon-Listings-Explorer/1.0 (Language=Node.js, Environment=Vercel)");
    if (requestBody) {
      fetchHeaders.set("content-type", "application/json");
    }

    const fetchOptions: RequestInit = {
      method,
      headers: fetchHeaders,
      body: requestBody,
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
