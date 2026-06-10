import { AmazonCredentials, ListingParams, AmazonListing, AmazonSearchItemsResponse } from "../types";

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
