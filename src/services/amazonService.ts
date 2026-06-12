import { AmazonCredentials, ListingParams, AmazonListing, AmazonSearchItemsResponse, OrdersResponse, OrderItemsResponse, OrderFinancesResponse, FeesEstimateResult } from "../types";

const BASE_URL_NA = "https://sellingpartnerapi-na.amazon.com";

export const getListingsItem = async (
  credentials: AmazonCredentials,
  params: ListingParams
): Promise<AmazonListing> => {
  const { sku } = params;

  // Hex encode payload to bypass WAF inspecting Amazon tokens
  const jsonStr = encodeURIComponent(JSON.stringify({ credentials, params }));
  let payload = "";
  for (let i = 0; i < jsonStr.length; i++) {
    payload += jsonStr.charCodeAt(i).toString(16).padStart(2, "0");
  }

  const response = await fetch("/amazon-proxy", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ payload }),
  });

  const contentType = response.headers.get("content-type");
  if (!contentType || !contentType.includes("application/json")) {
    const text = await response.text();
    console.error("Non-JSON response from server:", text);
    throw new Error(`The server returned an unexpected HTML response. This often means the request was blocked by a firewall or the server crashed. Response: ${text.substring(0, 150)}`);
  }

  const data = await response.json();

  if (!response.ok) {
    const errorDetails = data.text 
      ? `Resposta retornou texto/HTML: ${data.text.substring(0, 150)}...`
      : (data.message || JSON.stringify(data.errors || data));

    if (response.status === 403) {
      throw new Error(`403 Forbidden: O Access Token pode estar expirado ou inválido. Detalhes: ${errorDetails}`);
    }
    if (response.status === 404) {
      throw new Error(`404 Not Found: SKU '${sku}' não encontrado para o Seller ID/Marketplace informado.\nDetalhes: ${errorDetails}`);
    }
    if (response.status === 400) {
       throw new Error(`400 Bad Request: Parâmetros inválidos. Detalhes: ${errorDetails}`);
    }
    throw new Error(`Error ${response.status}: ${errorDetails}`);
  }

  // Se houver array de errors no corpo 200, SP-API costuma retornar como resposta às vezes, 
  // mas o status geralmente é erro. Vamos garantir:
  if (data.errors && data.errors.length > 0) {
      throw new Error(`API Error: ${data.errors[0].message}`);
  }

  return data as AmazonListing;
};

export const searchListingsItems = async (
  credentials: AmazonCredentials,
  params: { skus: string[] }
): Promise<AmazonSearchItemsResponse> => {
  const { skus } = params;

  // Hex encode payload to bypass WAF inspecting Amazon tokens
  const jsonStr = encodeURIComponent(JSON.stringify({ credentials, params }));
  let payload = "";
  for (let i = 0; i < jsonStr.length; i++) {
    payload += jsonStr.charCodeAt(i).toString(16).padStart(2, "0");
  }

  const response = await fetch("/amazon-proxy", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ payload }),
  });

  const contentType = response.headers.get("content-type");
  if (!contentType || !contentType.includes("application/json")) {
    const text = await response.text();
    console.error("Non-JSON response from server:", text);
    throw new Error(`O servidor retornou uma resposta inesperada. Detalhes: ${text.substring(0, 150)}`);
  }

  const data = await response.json();

  if (!response.ok) {
    const errorDetails = data.text 
      ? `Resposta retornou texto/HTML: ${data.text.substring(0, 150)}...`
      : (data.message || JSON.stringify(data.errors || data));

    if (response.status === 403) {
      throw new Error(`403 Forbidden: O Access Token pode estar expirado ou inválido. Detalhes: ${errorDetails}`);
    }
    if (response.status === 400) {
       throw new Error(`400 Bad Request: Parâmetros inválidos. Detalhes: ${errorDetails}`);
    }
    throw new Error(`Erro ${response.status}: ${errorDetails}`);
  }

  if (data.errors && data.errors.length > 0) {
      throw new Error(`Erro da API: ${data.errors[0].message}`);
  }

  return data as AmazonSearchItemsResponse;
};

export const getOrders = async (
  credentials: AmazonCredentials,
  params: { createdAfter?: string; orderStatuses?: string[]; nextToken?: string; amazonOrderIds?: string[] }
): Promise<OrdersResponse> => {
  const jsonStr = encodeURIComponent(JSON.stringify({ credentials, params, operation: "getOrders" }));
  let payload = "";
  for (let i = 0; i < jsonStr.length; i++) {
    payload += jsonStr.charCodeAt(i).toString(16).padStart(2, "0");
  }

  const response = await fetch("/amazon-proxy", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ payload }),
  });

  const contentType = response.headers.get("content-type");
  if (!contentType || !contentType.includes("application/json")) {
    const text = await response.text();
    console.error("Non-JSON response from server:", text);
    throw new Error(`O servidor retornou uma resposta inesperada. Detalhes: ${text.substring(0, 150)}`);
  }

  const data = await response.json();

  if (!response.ok) {
    const errorDetails = data.text 
      ? `Resposta retornou texto/HTML: ${data.text.substring(0, 150)}...`
      : (data.message || JSON.stringify(data.errors || data));

    if (response.status === 403) {
      throw new Error(`403 Forbidden: O Access Token pode estar expirado ou inválido. Detalhes: ${errorDetails}`);
    }
    if (response.status === 400) {
       throw new Error(`400 Bad Request: Parâmetros inválidos. Detalhes: ${errorDetails}`);
    }
    if (response.status === 429) {
       throw new Error(`Too Many Requests (Erro 429): Limite de requisições atingido na Orders API da Amazon. Aguarde um minuto antes de tentar novamente.`);
    }
    throw new Error(`Erro ${response.status}: ${errorDetails}`);
  }

  if (data.errors && data.errors.length > 0) {
      const isRateLimit = data.errors.some((e: any) => e.code === "QuotaExceeded" || e.message?.includes("429") || e.message?.includes("Too Many Requests"));
      if (isRateLimit || response.status === 429) {
        throw new Error(`Too Many Requests (Erro 429): Limite de requisições atingido. Aguarde um momento antes de tentar novamente.`);
      }
      throw new Error(`Erro da API: ${data.errors[0].message}`);
  }

  if (data.payload) {
    return data.payload as OrdersResponse;
  }
  return data as OrdersResponse;
};

export const getOrderItems = async (
  credentials: AmazonCredentials,
  params: { orderId: string }
): Promise<OrderItemsResponse> => {
  const jsonStr = encodeURIComponent(JSON.stringify({ credentials, params, operation: "getOrderItems" }));
  let payload = "";
  for (let i = 0; i < jsonStr.length; i++) {
    payload += jsonStr.charCodeAt(i).toString(16).padStart(2, "0");
  }

  const response = await fetch("/amazon-proxy", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ payload }),
  });

  const contentType = response.headers.get("content-type");
  if (!contentType || !contentType.includes("application/json")) {
    const text = await response.text();
    console.error("Non-JSON response from server:", text);
    throw new Error(`O servidor retornou uma resposta inesperada. Detalhes: ${text.substring(0, 150)}`);
  }

  const data = await response.json();

  if (!response.ok) {
    const errorDetails = data.text 
      ? `Resposta retornou texto/HTML: ${data.text.substring(0, 150)}...`
      : (data.message || JSON.stringify(data.errors || data));

    if (response.status === 403) {
      throw new Error(`403 Forbidden: O Access Token pode estar expirado ou inválido. Detalhes: ${errorDetails}`);
    }
    if (response.status === 400) {
       throw new Error(`400 Bad Request: Parâmetros inválidos. Detalhes: ${errorDetails}`);
    }
    if (response.status === 429) {
       throw new Error(`Too Many Requests (Erro 429): Limite de requisições atingido na Order Items API da Amazon. Aguarde um momento.`);
    }
    throw new Error(`Erro ${response.status}: ${errorDetails}`);
  }

  if (data.errors && data.errors.length > 0) {
      const isRateLimit = data.errors.some((e: any) => e.code === "QuotaExceeded" || e.message?.includes("429") || e.message?.includes("Too Many Requests"));
      if (isRateLimit || response.status === 429) {
        throw new Error(`Too Many Requests (Erro 429): Limite de requisições atingido. Aguarde um momento antes de tentar novamente.`);
      }
      throw new Error(`Erro da API: ${data.errors[0].message}`);
  }

  if (data.payload) {
    return data.payload as OrderItemsResponse;
  }
  return data as OrderItemsResponse;
};

export const getOrderFinances = async (
  credentials: AmazonCredentials,
  params: { orderId: string }
): Promise<OrderFinancesResponse> => {
  const jsonStr = encodeURIComponent(JSON.stringify({ credentials, params, operation: "getOrderFinances" }));
  let payload = "";
  for (let i = 0; i < jsonStr.length; i++) {
    payload += jsonStr.charCodeAt(i).toString(16).padStart(2, "0");
  }

  const response = await fetch("/amazon-proxy", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ payload }),
  });

  const contentType = response.headers.get("content-type");
  if (!contentType || !contentType.includes("application/json")) {
    const text = await response.text();
    console.error("Non-JSON response from server:", text);
    throw new Error(`O servidor retornou uma resposta inesperada. Detalhes: ${text.substring(0, 150)}`);
  }

  const data = await response.json();

  if (!response.ok) {
    const errorDetails = data.text
      ? `Resposta retornou texto/HTML: ${data.text.substring(0, 150)}...`
      : (data.message || JSON.stringify(data.errors || data));

    if (response.status === 403) {
      throw new Error(`403 Forbidden: O Access Token pode estar expirado/inválido ou a aplicação SP-API não possui o role "Finance and Accounting". Detalhes: ${errorDetails}`);
    }
    if (response.status === 404) {
      throw new Error(`404 Not Found: Nenhum evento financeiro encontrado para este pedido. Detalhes: ${errorDetails}`);
    }
    if (response.status === 400) {
       throw new Error(`400 Bad Request: Parâmetros inválidos. Detalhes: ${errorDetails}`);
    }
    if (response.status === 429) {
       throw new Error(`Too Many Requests (Erro 429): Limite de requisições atingido na Finances API da Amazon. Aguarde um momento.`);
    }
    throw new Error(`Erro ${response.status}: ${errorDetails}`);
  }

  if (data.errors && data.errors.length > 0) {
      const isRateLimit = data.errors.some((e: any) => e.code === "QuotaExceeded" || e.message?.includes("429") || e.message?.includes("Too Many Requests"));
      if (isRateLimit || response.status === 429) {
        throw new Error(`Too Many Requests (Erro 429): Limite de requisições atingido. Aguarde um momento antes de tentar novamente.`);
      }
      throw new Error(`Erro da API: ${data.errors[0].message}`);
  }

  if (data.payload) {
    return data.payload as OrderFinancesResponse;
  }
  return data as OrderFinancesResponse;
};

export const getFeesEstimateForSku = async (
  credentials: AmazonCredentials,
  params: { sku: string; price: number; currencyCode?: string; isAmazonFulfilled?: boolean }
): Promise<FeesEstimateResult> => {
  const jsonStr = encodeURIComponent(JSON.stringify({ credentials, params, operation: "getFeesEstimateForSku" }));
  let payload = "";
  for (let i = 0; i < jsonStr.length; i++) {
    payload += jsonStr.charCodeAt(i).toString(16).padStart(2, "0");
  }

  const response = await fetch("/amazon-proxy", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ payload }),
  });

  const contentType = response.headers.get("content-type");
  if (!contentType || !contentType.includes("application/json")) {
    const text = await response.text();
    console.error("Non-JSON response from server:", text);
    throw new Error(`O servidor retornou uma resposta inesperada. Detalhes: ${text.substring(0, 150)}`);
  }

  const data = await response.json();

  if (!response.ok) {
    const errorDetails = data.text
      ? `Resposta retornou texto/HTML: ${data.text.substring(0, 150)}...`
      : (data.message || JSON.stringify(data.errors || data));

    if (response.status === 403) {
      throw new Error(`403 Forbidden: O Access Token pode estar expirado/inválido ou a aplicação SP-API não possui o role "Pricing". Detalhes: ${errorDetails}`);
    }
    if (response.status === 400) {
       throw new Error(`400 Bad Request: Parâmetros inválidos. Detalhes: ${errorDetails}`);
    }
    if (response.status === 429) {
       throw new Error(`Too Many Requests (Erro 429): Limite de requisições atingido na Product Fees API da Amazon. Aguarde um momento.`);
    }
    throw new Error(`Erro ${response.status}: ${errorDetails}`);
  }

  if (data.errors && data.errors.length > 0) {
      throw new Error(`Erro da API: ${data.errors[0].message}`);
  }

  const result = data.payload?.FeesEstimateResult || data.FeesEstimateResult || data.payload || data;
  return result as FeesEstimateResult;
};
