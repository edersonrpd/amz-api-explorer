import { AmazonOrder, OrderItem } from "./types";

export interface MockOrderWithItems {
  order: AmazonOrder & Record<string, any>;
  items: OrderItem[];
}

const BASE_ORDER_DATA = {
  BuyerInfo: { BuyerEmail: "g7bncrz9n1mbhd5@marketplace.amazon.com.br", BuyerCounty: "Bom Viver" },
  AmazonOrderId: "702-7789795-7275410",
  EarliestDeliveryDate: "2026-05-17T03:00:00Z",
  EarliestShipDate: "2026-05-14T03:00:00Z",
  SalesChannel: "Amazon.com.br",
  AutomatedShippingSettings: { HasAutomatedShippingSettings: false },
  OrderStatus: "Shipped" as const,
  NumberOfItemsShipped: 1,
  OrderType: "StandardOrder",
  IsPremiumOrder: false,
  IsPrime: false,
  ElectronicInvoiceStatus: "Accepted",
  FulfillmentChannel: "MFN" as const,
  NumberOfItemsUnshipped: 0,
  HasRegulatedItems: false,
  IsReplacementOrder: "false",
  IsSoldByAB: false,
  LatestShipDate: "2026-05-15T02:59:59Z",
  PaymentExecutionDetail: [{
    AuthorizationCode: "sdbyVGKKqgQcV2oRBJFs",
    Payment: { CurrencyCode: "BRL", Amount: "26.69" },
    PaymentMethod: "CreditCard",
    AcquirerId: "01425787000104",
    CardBrand: "MasterCard"
  }],
  ShipServiceLevel: "Std EZ Regional",
  DefaultShipFromLocationAddress: {
    AddressLine2: "null", StateOrRegion: "SÃO PAULO", AddressLine1: "null",
    PostalCode: "14170580", City: "Sertãozinho", CountryCode: "BR", Name: "null"
  },
  IsISPU: false,
  MarketplaceId: "A2Q3Y263D00KWC",
  LatestDeliveryDate: "2026-05-18T02:59:59Z",
  PurchaseDate: "2026-05-14T00:11:13Z",
  ShippingAddress: { StateOrRegion: "SC", PostalCode: "88160628", City: "Biguaçu", CountryCode: "BR" },
  IsAccessPointOrder: false,
  PaymentMethod: "Other",
  IsBusinessOrder: false,
  OrderTotal: { CurrencyCode: "BRL", Amount: "26.69" },
  EasyShipShipmentStatus: "Delivered",
  PaymentMethodDetails: ["CreditCard"],
  IsGlobalExpressEnabled: false,
  LastUpdateDate: "2026-05-18T13:21:18Z",
  ShipmentServiceLevelCategory: "Standard"
};

function cloneBaseOrder(overrides: Partial<typeof BASE_ORDER_DATA> & Record<string, any>): any {
  const cloned = JSON.parse(JSON.stringify(BASE_ORDER_DATA));
  Object.assign(cloned, overrides);
  if (overrides.OrderTotal) {
    cloned.PaymentExecutionDetail[0].Payment.Amount = overrides.OrderTotal.Amount;
    cloned.PaymentExecutionDetail[0].Payment.CurrencyCode = overrides.OrderTotal.CurrencyCode;
  }
  return cloned;
}

export const MOCK_ORDERS_WITH_ITEMS: MockOrderWithItems[] = [
  {
    order: cloneBaseOrder({}),
    items: [
      {
        SellerSKU: "01829",
        ASIN: "B07D6ZT89F",
        Title: "Luva de Segurança em PVC 35cm Tamanho G-KALIPSO-02.10.1.2",
        QuantityOrdered: 1,
        OrderItemId: "item-1a",
        ItemPrice: { CurrencyCode: "BRL", Amount: "26.69" }
      }
    ]
  },
  {
    order: cloneBaseOrder({
      AmazonOrderId: "702-4848111-0167432",
      PurchaseDate: "2026-05-16T13:47:21Z",
      EarliestShipDate: "2026-05-17T03:00:00Z",
      LatestShipDate: "2026-05-18T02:59:59Z",
      EarliestDeliveryDate: "2026-05-20T03:00:00Z",
      LatestDeliveryDate: "2026-05-21T02:59:59Z",
      LastUpdateDate: "2026-05-21T10:02:44Z",
      OrderTotal: { CurrencyCode: "BRL", Amount: "19.44" },
      ShippingAddress: { StateOrRegion: "PR", PostalCode: "80035110", City: "Curitiba", CountryCode: "BR" }
    }),
    items: [
      {
        SellerSKU: "00347",
        ASIN: "B079Q4HKZ1",
        Title: "Bico de Ar para Câmara de Pneu TR413 - Schweers",
        QuantityOrdered: 2,
        OrderItemId: "item-2a",
        ItemPrice: { CurrencyCode: "BRL", Amount: "9.72" }
      }
    ]
  },
  {
    order: cloneBaseOrder({
      AmazonOrderId: "702-7181534-9819466",
      PurchaseDate: "2026-05-17T02:46:09Z",
      EarliestShipDate: "2026-05-18T03:00:00Z",
      LatestShipDate: "2026-05-19T02:59:59Z",
      EarliestDeliveryDate: "2026-05-21T03:00:00Z",
      LatestDeliveryDate: "2026-05-22T02:59:59Z",
      LastUpdateDate: "2026-05-22T08:15:30Z",
      OrderTotal: { CurrencyCode: "BRL", Amount: "19.44" },
      PaymentExecutionDetail: [{
        AuthorizationCode: "kpQwe81LmNxYtRvZsAb2",
        Payment: { CurrencyCode: "BRL", Amount: "19.44" },
        PaymentMethod: "CreditCard",
        AcquirerId: "01425787000104",
        CardBrand: "Visa"
      }],
      ShippingAddress: { StateOrRegion: "MG", PostalCode: "30130010", City: "Belo Horizonte", CountryCode: "BR" }
    }),
    items: [
      {
        SellerSKU: "00347",
        ASIN: "B079Q4HKZ1",
        Title: "Bico de Ar para Câmara de Pneu TR413 - Schweers",
        QuantityOrdered: 2,
        OrderItemId: "item-3a",
        ItemPrice: { CurrencyCode: "BRL", Amount: "9.72" }
      }
    ]
  },
  {
    order: cloneBaseOrder({
      AmazonOrderId: "702-3546886-6809813",
      PurchaseDate: "2026-05-25T01:03:55Z",
      EarliestShipDate: "2026-05-25T03:00:00Z",
      LatestShipDate: "2026-05-26T02:59:59Z",
      EarliestDeliveryDate: "2026-05-28T03:00:00Z",
      LatestDeliveryDate: "2026-05-29T02:59:59Z",
      LastUpdateDate: "2026-05-29T14:40:12Z",
      OrderTotal: { CurrencyCode: "BRL", Amount: "20.88" },
      ShippingAddress: { StateOrRegion: "RS", PostalCode: "90010280", City: "Porto Alegre", CountryCode: "BR" }
    }),
    items: [
      {
        SellerSKU: "00244",
        ASIN: "B076XW77BT",
        Title: 'Bico para Encher Pneus com Bocal Duplo 1/2" x 1/4" 170mm - Schweers 825',
        QuantityOrdered: 1,
        OrderItemId: "item-4a",
        ItemPrice: { CurrencyCode: "BRL", Amount: "20.88" }
      }
    ]
  },
  {
    order: cloneBaseOrder({
      AmazonOrderId: "701-0814761-8856249",
      PurchaseDate: "2026-05-29T00:58:33Z",
      EarliestShipDate: "2026-05-29T03:00:00Z",
      LatestShipDate: "2026-05-30T02:59:59Z",
      EarliestDeliveryDate: "2026-06-01T03:00:00Z",
      LatestDeliveryDate: "2026-06-02T02:59:59Z",
      LastUpdateDate: "2026-06-02T09:21:07Z",
      OrderTotal: { CurrencyCode: "BRL", Amount: "19.44" },
      ShippingAddress: { StateOrRegion: "SP", PostalCode: "01310100", City: "São Paulo", CountryCode: "BR" }
    }),
    items: [
      {
        SellerSKU: "00347",
        ASIN: "B079Q4HKZ1",
        Title: "Bico de Ar para Câmara de Pneu TR413 - Schweers",
        QuantityOrdered: 2,
        OrderItemId: "item-5a",
        ItemPrice: { CurrencyCode: "BRL", Amount: "9.72" }
      }
    ]
  },
  {
    order: cloneBaseOrder({
      AmazonOrderId: "701-5661788-7211401",
      PurchaseDate: "2026-05-30T01:37:46Z",
      EarliestShipDate: "2026-05-30T03:00:00Z",
      LatestShipDate: "2026-06-01T02:59:59Z",
      EarliestDeliveryDate: "2026-06-03T03:00:00Z",
      LatestDeliveryDate: "2026-06-04T02:59:59Z",
      LastUpdateDate: "2026-06-04T11:55:01Z",
      OrderTotal: { CurrencyCode: "BRL", Amount: "20.88" },
      ShippingAddress: { StateOrRegion: "BA", PostalCode: "40020210", City: "Salvador", CountryCode: "BR" }
    }),
    items: [
      {
        SellerSKU: "00244",
        ASIN: "B076XW77BT",
        Title: 'Bico para Encher Pneus com Bocal Duplo 1/2" x 1/4" 170mm - Schweers 825',
        QuantityOrdered: 1,
        OrderItemId: "item-6a",
        ItemPrice: { CurrencyCode: "BRL", Amount: "20.88" }
      }
    ]
  },
  {
    order: cloneBaseOrder({
      AmazonOrderId: "702-2640183-4698608",
      PurchaseDate: "2026-05-31T22:32:18Z",
      NumberOfItemsShipped: 10,
      EarliestShipDate: "2026-06-01T03:00:00Z",
      LatestShipDate: "2026-06-02T02:59:59Z",
      EarliestDeliveryDate: "2026-06-04T03:00:00Z",
      LatestDeliveryDate: "2026-06-05T02:59:59Z",
      LastUpdateDate: "2026-06-05T16:08:53Z",
      OrderTotal: { CurrencyCode: "BRL", Amount: "99.04" },
      ShippingAddress: { StateOrRegion: "RJ", PostalCode: "20040020", City: "Rio de Janeiro", CountryCode: "BR" }
    }),
    items: [
      {
        SellerSKU: "01829",
        ASIN: "B07D6ZT89F",
        Title: "Luva de Segurança em PVC 35cm Tamanho G-KALIPSO-02.10.1.2",
        QuantityOrdered: 6,
        OrderItemId: "item-7a",
        ItemPrice: { CurrencyCode: "BRL", Amount: String((26.69 * 0.37).toFixed(2)) }
      },
      {
        SellerSKU: "00347",
        ASIN: "B079Q4HKZ1",
        Title: "Bico de Ar para Câmara de Pneu TR413 - Schweers",
        QuantityOrdered: 4,
        OrderItemId: "item-7b",
        ItemPrice: { CurrencyCode: "BRL", Amount: "9.72" }
      }
    ]
  }
];
