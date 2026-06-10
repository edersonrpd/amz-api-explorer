export interface AmazonCredentials {
  accessToken: string;
  sellerId: string;
  marketplaceId: string;
}

export interface ListingParams {
  sku?: string;
  skus?: string[];
}

export interface AmazonSearchItemsResponse {
  items: AmazonListing[];
  numberOfResults: number;
}

export interface AppConfig {
  credentials: AmazonCredentials;
  lastSku: string;
}

// SP-API types (simplified for UI)
export interface SPAPIError {
  code: string;
  message: string;
  details?: string;
}

export interface SPAPIResponse<T> {
  errors?: SPAPIError[];
  payload?: T;
  // Sometime HTTP exceptions return just:
  message?: string;
}

export interface Issue {
  code: string;
  message: string;
  severity: "ERROR" | "WARNING" | "INFO";
  attributeNames?: string[];
}

export interface ItemSummary {
  marketplaceId: string;
  asin: string;
  productType: string;
  conditionType: string;
  status: string[];
  itemName: string;
  createdDate: string;
  lastUpdatedDate: string;
  mainImage?: {
    link: string;
    height: number;
    width: number;
  };
}

export interface AmazonListing {
  sku: string;
  summaries: ItemSummary[];
  attributes: Record<string, any>;
  issues: Issue[];
  offers: any[];
  fulfillmentAvailability: any[];
  procurementType: any;
  relationships: any[];
  productTypes: any[];
}

export interface SkuResult {
  sku: string;
  status: "pending" | "searching" | "success" | "not_found" | "error";
  errorMsg?: string;
  data?: AmazonListing;
}

export interface AmazonOrder {
  AmazonOrderId: string;
  PurchaseDate: string;
  LastUpdateDate: string;
  OrderStatus: "Pending" | "Unshipped" | "PartiallyShipped" | "Shipped" | "Canceled" | "Unfulfilled";
  FulfillmentChannel?: "AFN" | "MFN";
  OrderTotal?: {
    CurrencyCode: string;
    Amount: string;
  };
  NumberOfItemsShipped?: number;
  NumberOfItemsUnshipped?: number;
  SalesChannel?: string;
  OrderType?: string;
}

export interface OrderItem {
  ASIN: string;
  SellerSKU?: string;
  OrderItemId: string;
  Title?: string;
  QuantityOrdered: number;
  QuantityShipped?: number;
  ItemPrice?: {
    CurrencyCode: string;
    Amount: string;
  };
  PromotionDiscount?: {
    CurrencyCode: string;
    Amount: string;
  };
}

export interface OrdersResponse {
  Orders: AmazonOrder[];
  NextToken?: string;
  LastUpdatedBefore?: string;
  CreatedBefore?: string;
}

export interface OrderItemsResponse {
  OrderItems: OrderItem[];
  NextToken?: string;
  AmazonOrderId: string;
}

