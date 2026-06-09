export interface AmazonCredentials {
  accessToken: string;
  sellerId: string;
  marketplaceId: string;
}

export interface ListingParams {
  sku: string;
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
