// ---------------------------------------------------------------------------
// Tipos do TikTok Shop API Explorer (simplificados para a UI)
// ---------------------------------------------------------------------------

export interface TikTokCredentials {
  // Token colado pelo usuario (mesma UX do app Amazon). O app_secret usado para
  // assinar fica no backend; o frontend nunca o ve.
  accessToken: string;
  // shop_cipher da loja selecionada (obtido automaticamente via getAuthorizedShops).
  shopCipher: string;
  shopId: string;
  shopName: string;
}

export interface AuthorizedShop {
  id: string;
  name: string;
  region: string;
  seller_type?: string;
  cipher: string;
  code?: string;
}

// ---- Produtos ----
export interface TikTokSkuPrice {
  currency?: string;
  sale_price?: string;
  tax_exclusive_price?: string;
}

export interface TikTokSkuInventory {
  warehouse_id?: string;
  quantity?: number;
}

export interface TikTokSku {
  id: string;
  seller_sku?: string;
  price?: TikTokSkuPrice;
  inventory?: TikTokSkuInventory[];
}

export interface TikTokProduct {
  id: string;
  title?: string;
  status?: string;
  category_chains?: { id: string; local_name?: string }[];
  main_images?: { thumb_urls?: string[]; urls?: string[] }[];
  skus?: TikTokSku[];
  create_time?: number;
  update_time?: number;
}

export interface ProductRow {
  productId: string;
  sellerSku: string;
  status: "pending" | "searching" | "success" | "not_found" | "error";
  errorMsg?: string;
  data?: TikTokProduct;
}

// ---- Pedidos ----
export interface TikTokOrderLineItem {
  id: string;
  product_id?: string;
  product_name?: string;
  seller_sku?: string;
  sku_id?: string;
  sku_name?: string;
  currency?: string;
  sale_price?: string;
  original_price?: string;
  quantity?: number;
}

export interface TikTokOrderPayment {
  currency?: string;
  total_amount?: string;
  sub_total?: string;
  shipping_fee?: string;
  tax?: string;
  original_total_product_price?: string;
}

export interface TikTokOrder {
  id: string;
  status?: string;
  create_time?: number;
  update_time?: number;
  fulfillment_type?: string;
  delivery_option?: string;
  payment?: TikTokOrderPayment;
  line_items?: TikTokOrderLineItem[];
}

// ---- Estimativa de taxas (calculo aproximado, ver REQUISITOS) ----
export interface FeeConfig {
  // Comissao de plataforma por categoria (percentual, ex.: 8 = 8%).
  commissionRate: number;
  // Taxa de transacao/pagamento (percentual).
  transactionRate: number;
}

export interface FeeEstimate {
  grossAmount: number;
  commission: number;
  transactionFee: number;
  totalFees: number;
  netAmount: number;
}
