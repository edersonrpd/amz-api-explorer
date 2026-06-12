import React, { useEffect, useState } from "react";
import { AmazonOrder, OrderItem, OrderFinancesResponse, ShipmentEvent, ServiceFeeEvent, OrderMoney, OrderItemFeeEstimate } from "../types";

interface OrderDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: AmazonOrder & Record<string, any>; // Support dynamic extra fields from JSON
  itemsCacheEntry?: { loading: boolean; items?: OrderItem[]; error?: string };
  financesCacheEntry?: { loading: boolean; finances?: OrderFinancesResponse; error?: string };
  feesEstimateCacheEntry?: { loading: boolean; estimates?: OrderItemFeeEstimate[]; error?: string };
  onLoadItems: (orderId: string) => void;
  onLoadFinances: (orderId: string) => void;
  onLoadFeesEstimates: (orderId: string, items: OrderItem[], isAmazonFulfilled: boolean) => void;
  onToast: (msg: string) => void;
}

const TZ = 'America/Sao_Paulo';

const fmtMoney = (v: any) => {
  const numVal = parseFloat(v);
  if (isNaN(numVal)) return "R$ 0,00";
  return numVal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const fmtDT = (iso?: string) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('pt-BR', {
    timeZone: TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).replace(',', ' ·');
};

const fmtD = (iso?: string) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('pt-BR', {
    timeZone: TZ,
    day: '2-digit',
    month: '2-digit'
  });
};

const fmtCEP = (c?: string) => {
  if (!c) return "—";
  const cleaned = c.replace(/\D/g, '');
  if (cleaned.length === 8) {
    return cleaned.slice(0, 5) + '-' + cleaned.slice(5);
  }
  return c;
};

const esc = (s?: string) => {
  if (!s) return "";
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
};

const STATUS_PT: Record<string, string> = {
  Shipped: 'ENVIADO',
  Pending: 'PENDENTE',
  Unshipped: 'NÃO ENVIADO',
  PartiallyShipped: 'PARCIAL',
  Canceled: 'CANCELADO',
  Delivered: 'ENTREGUE'
};

const CHARGE_TYPE_PT: Record<string, string> = {
  Principal: 'Preço do produto (Principal)',
  Tax: 'Imposto sobre o produto',
  ShippingCharge: 'Frete cobrado do cliente',
  ShippingTax: 'Imposto sobre o frete',
  GiftWrap: 'Embalagem para presente',
  GiftWrapTax: 'Imposto sobre embalagem',
  Goodwill: 'Cortesia / Goodwill',
  Discount: 'Desconto',
  RestockingFee: 'Taxa de reposição de estoque',
  ReturnShipping: 'Frete de devolução',
  PointsFee: 'Taxa de pontos',
  GenericDeduction: 'Dedução genérica',
  FreeReplacementReturnShipping: 'Frete de devolução (reposição gratuita)',
  PaymentMethodFee: 'Taxa do método de pagamento',
  ExportCharge: 'Encargo de exportação',
  'MarketplaceFacilitatorTax-Principal': 'Imposto retido pela Amazon (produto)',
  'MarketplaceFacilitatorTax-Shipping': 'Imposto retido pela Amazon (frete)',
  'MarketplaceFacilitatorVAT-Principal': 'VAT retido pela Amazon (produto)',
  'MarketplaceFacilitatorVAT-Shipping': 'VAT retido pela Amazon (frete)'
};

const FEE_TYPE_PT: Record<string, string> = {
  Commission: 'Comissão da Amazon (referral fee)',
  FixedClosingFee: 'Tarifa fixa de fechamento',
  VariableClosingFee: 'Tarifa variável de fechamento',
  RefundCommission: 'Comissão retida sobre reembolso',
  FBAPerUnitFulfillmentFee: 'Tarifa de logística FBA (por unidade)',
  FBAPerOrderFulfillmentFee: 'Tarifa de logística FBA (por pedido)',
  FBAWeightBasedFee: 'Tarifa FBA baseada em peso',
  FBAStorageFee: 'Tarifa de armazenagem FBA',
  ShippingChargeback: 'Estorno de frete (chargeback)',
  ShippingHB: 'Frete (shipping holdback)',
  GiftwrapChargeback: 'Estorno de embalagem para presente',
  SalesTaxCollectionFee: 'Taxa de coleta de imposto',
  DigitalServicesFee: 'Taxa de serviços digitais',
  PerItemFee: 'Tarifa por item (plano individual)',
  TechnologyFee: 'Taxa de tecnologia',
  HighVolumeListingFee: 'Taxa de listagem de alto volume',
  ReferralFee: 'Comissão da Amazon (referral fee)',
  FulfillmentFees: 'Tarifas de logística (FBA)',
  MFNPostageFee: 'Etiqueta de envio MFN (Comprar Envio)',
  MFNShippingChargeback: 'Estorno de frete MFN',
  Subscription: 'Mensalidade do plano profissional',
  StorageFee: 'Tarifa de armazenagem',
  StorageRenewalBilling: 'Renovação de armazenagem'
};

const FIN_EVENT_GROUP_PT: Record<string, string> = {
  ShipmentEventList: 'Envio (Shipment)',
  RefundEventList: 'Reembolso (Refund)',
  GuaranteeClaimEventList: 'Garantia A-a-Z (Claim)',
  ChargebackEventList: 'Chargeback',
  ServiceFeeEventList: 'Taxa de serviço (Service Fee)'
};

const finLabel = (dict: Record<string, string>, code?: string) => {
  if (!code) return '—';
  return dict[code] || code;
};

const moneyOf = (m?: OrderMoney) => {
  if (!m || m.Amount === undefined) return 0;
  const v = parseFloat(m.Amount);
  return isNaN(v) ? 0 : v;
};

interface FinRow {
  group: string;      // ex: Envio (Shipment), Reembolso (Refund)
  category: 'Crédito' | 'Taxa Amazon' | 'Promoção' | 'Imposto retido';
  sku: string;
  typeCode: string;
  typeLabel: string;
  amount: number;
}

// Flatten financial events (charges, fees, promotions, withheld taxes) into table rows
function buildFinRows(events: ShipmentEvent[], groupLabel: string): FinRow[] {
  const rows: FinRow[] = [];
  for (const ev of events) {
    const itemLists = [...(ev.ShipmentItemList || []), ...(ev.ShipmentItemAdjustmentList || [])];
    for (const it of itemLists) {
      const sku = it.SellerSKU || '—';
      for (const c of [...(it.ItemChargeList || []), ...(it.ItemChargeAdjustmentList || [])]) {
        rows.push({
          group: groupLabel,
          category: 'Crédito',
          sku,
          typeCode: c.ChargeType || '—',
          typeLabel: finLabel(CHARGE_TYPE_PT, c.ChargeType),
          amount: c.ChargeAmount?.CurrencyAmount ?? 0
        });
      }
      for (const f of [...(it.ItemFeeList || []), ...(it.ItemFeeAdjustmentList || [])]) {
        rows.push({
          group: groupLabel,
          category: 'Taxa Amazon',
          sku,
          typeCode: f.FeeType || '—',
          typeLabel: finLabel(FEE_TYPE_PT, f.FeeType),
          amount: f.FeeAmount?.CurrencyAmount ?? 0
        });
      }
      for (const p of [...(it.PromotionList || []), ...(it.PromotionAdjustmentList || [])]) {
        rows.push({
          group: groupLabel,
          category: 'Promoção',
          sku,
          typeCode: p.PromotionId || p.PromotionType || '—',
          typeLabel: p.PromotionType ? `Promoção (${p.PromotionType})` : 'Promoção',
          amount: p.PromotionAmount?.CurrencyAmount ?? 0
        });
      }
      for (const tw of it.ItemTaxWithheldList || []) {
        for (const t of tw.TaxesWithheld || []) {
          rows.push({
            group: groupLabel,
            category: 'Imposto retido',
            sku,
            typeCode: t.ChargeType || '—',
            typeLabel: finLabel(CHARGE_TYPE_PT, t.ChargeType),
            amount: t.ChargeAmount?.CurrencyAmount ?? 0
          });
        }
      }
    }
    for (const f of [...(ev.ShipmentFeeList || []), ...(ev.OrderFeeList || [])]) {
      rows.push({
        group: groupLabel,
        category: 'Taxa Amazon',
        sku: '— (nível do pedido)',
        typeCode: f.FeeType || '—',
        typeLabel: finLabel(FEE_TYPE_PT, f.FeeType),
        amount: f.FeeAmount?.CurrencyAmount ?? 0
      });
    }
  }
  return rows;
}

// Flatten ServiceFeeEventList (ex: etiqueta de envio MFN comprada via Amazon) into table rows
function buildServiceFeeRows(events: ServiceFeeEvent[], groupLabel: string): FinRow[] {
  const rows: FinRow[] = [];
  for (const ev of events) {
    for (const f of ev.FeeList || []) {
      rows.push({
        group: groupLabel,
        category: 'Taxa Amazon',
        sku: ev.SellerSKU || '— (nível do pedido)',
        typeCode: f.FeeType || ev.FeeReason || '—',
        typeLabel: finLabel(FEE_TYPE_PT, f.FeeType || ev.FeeReason),
        amount: f.FeeAmount?.CurrencyAmount ?? 0
      });
    }
  }
  return rows;
}

function highlight(obj: any) {
  let json = JSON.stringify(obj, null, 2);
  json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, m => {
    let cls = 'jn';
    if (/^"/.test(m)) cls = /:$/.test(m) ? 'jk' : 'js';
    else if (/true|false/.test(m)) cls = 'jb';
    else if (/null/.test(m)) cls = 'jnull';
    return '<span class="' + cls + '">' + m + '</span>';
  });
}

function badge(cls: string, txt: string) {
  return (
    <span key={txt} className={`badge ${cls}`}>
      {txt}
    </span>
  );
}

function prow(k: string, v: React.ReactNode, mono?: boolean) {
  return (
    <div className="prow">
      <span className="pk">{k}</span>
      <span className={`pv${mono ? ' mono' : ''}`}>{v}</span>
    </div>
  );
}

function fpill(on: boolean | undefined, label: string) {
  const ic = on ? (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
  return (
    <span key={label} className={`fpill ${on ? 'on' : 'off'}`}>
      {ic}
      {label}
    </span>
  );
}

export function OrderDetailsModal({
  isOpen,
  onClose,
  order,
  itemsCacheEntry,
  financesCacheEntry,
  feesEstimateCacheEntry,
  onLoadItems,
  onLoadFinances,
  onLoadFeesEstimates,
  onToast
}: OrderDetailsModalProps) {
  const [activeTab, setActiveTab] = useState<"detail" | "json">("detail");

  useEffect(() => {
    if (isOpen) {
      setActiveTab("detail");
      // Load items immediately if not already in cache and not loading
      if (!itemsCacheEntry) {
        onLoadItems(order.AmazonOrderId);
      }
      if (!financesCacheEntry) {
        onLoadFinances(order.AmazonOrderId);
      }
    }
  }, [isOpen, order.AmazonOrderId]);

  // Quando a venda ainda não foi lançada na Finances API, estima a comissão
  // via Product Fees API usando o preço real de cada item do pedido
  useEffect(() => {
    if (!isOpen || feesEstimateCacheEntry) return;
    const items = itemsCacheEntry?.items;
    const fe = financesCacheEntry?.finances?.FinancialEvents;
    if (!items || items.length === 0 || !fe) return;
    if ((fe.ShipmentEventList || []).length > 0) return;
    onLoadFeesEstimates(order.AmazonOrderId, items, order.FulfillmentChannel === "AFN");
  }, [isOpen, itemsCacheEntry, financesCacheEntry, feesEstimateCacheEntry, order.AmazonOrderId]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener("keydown", handleEsc);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      window.removeEventListener("keydown", handleEsc);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Header badges list
  const badgesList: React.ReactNode[] = [];
  badgesList.push(badge('green', STATUS_PT[order.OrderStatus] || order.OrderStatus));
  if (order.EasyShipShipmentStatus === 'Delivered') {
    badgesList.push(badge('green', 'ENTREGUE'));
  }
  if (order.ElectronicInvoiceStatus === 'Accepted') {
    badgesList.push(badge('blue', 'NF-E ACEITA'));
  }
  if (order.FulfillmentChannel) {
    badgesList.push(badge('gray', order.FulfillmentChannel));
  }

  // Summary strip details
  const pay = order.PaymentExecutionDetail?.[0] || {};
  const orderTotalAmount = order.OrderTotal?.Amount || "0";
  const valPaymentMethodValue = pay.CardBrand || order.PaymentMethodDetails?.[0] || '—';
  const valPaymentMethodText = pay.PaymentMethod === 'CreditCard' ? 'Cartão de crédito' : pay.PaymentMethod || '';

  // Shipping destination & origin information
  const sa = order.ShippingAddress || {};
  const sf = order.DefaultShipFromLocationAddress || {};

  // Buyer Info
  const bi = order.BuyerInfo || {};

  // Handle copies
  const triggerCopyId = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(order.AmazonOrderId);
      onToast("ID copiado!");
    }
  };

  const triggerCopyJson = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(JSON.stringify(order, null, 2));
      onToast("JSON copiado!");
    }
  };

  return (
    <>
      <div 
        className={`overlay ${isOpen ? 'open' : ''}`} 
        id="overlay" 
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            onClose();
          }
        }}
      >
        <div className="modal" role="dialog" aria-modal="true">
          {/* MODAL HEADER */}
          <div className="m-head">
            <div className="m-head-top">
              <div className="m-otitle">
                <div className="lbl">Pedido Amazon</div>
                <div className="m-oid">
                  <span className="v" id="mOid">{order.AmazonOrderId}</span>
                  <button className="m-copy-btn" onClick={triggerCopyId} title="Copiar ID">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect width="13" height="13" x="9" y="9" rx="2"/>
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                    </svg>
                  </button>
                </div>
                <div className="m-badges" id="mBadges">
                  {badgesList}
                </div>
              </div>
              <button className="m-close" onClick={onClose} title="Fechar">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>
            <div className="m-tabs">
              <button 
                type="button"
                className={`m-tab ${activeTab === 'detail' ? 'active' : ''}`} 
                onClick={() => setActiveTab('detail')}
              >
                Detalhes
              </button>
              <button 
                type="button"
                className={`m-tab ${activeTab === 'json' ? 'active' : ''}`} 
                onClick={() => setActiveTab('json')}
              >
                JSON Original
              </button>
            </div>
          </div>

          <div className="m-body">
            {/* DETAIL PANE */}
            <div className={`m-pane ${activeTab === 'detail' ? 'active' : ''}`}>
              <div className="strip" id="mStrip">
                <div className="stat">
                  <div className="sk">Total do Pedido</div>
                  <div className="sv big">{fmtMoney(orderTotalAmount)}</div>
                  <div className="ss">{(order.OrderTotal?.CurrencyCode || "BRL")} · {order.SalesChannel || "Amazon.com.br"}</div>
                </div>
                <div className="stat">
                  <div className="sk">Pagamento</div>
                  <div className="sv">{valPaymentMethodValue}</div>
                  <div className="ss">{valPaymentMethodText}</div>
                </div>
                <div className="stat">
                  <div className="sk">Itens</div>
                  <div className="sv">{order.NumberOfItemsShipped || 0} enviado{(order.NumberOfItemsShipped !== 1 ? 's' : '')}</div>
                  <div className="ss">{order.NumberOfItemsUnshipped || 0} pendente{(order.NumberOfItemsUnshipped === 1 ? '' : 's')}</div>
                </div>
                <div className="stat">
                  <div className="sk">Serviço de Envio</div>
                  <div className="sv font-sans text-sm font-semibold" style={{ fontSize: "14px" }}>
                    {order.ShipServiceLevel || "Standard"}
                  </div>
                  <div className="ss">{order.ShipmentServiceLevelCategory || "Standard"} · {order.OrderType?.replace('StandardOrder', 'Pedido padrão') || "Pedido padrão"}</div>
                </div>
              </div>

              <div className="m-grid">
                {/* ITEMS PANEL */}
                <div className="panel full">
                  <div className="panel-head">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m7.5 4.27 9 5.15" />
                      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
                    </svg>
                    <h3>Itens do Pedido</h3>
                  </div>

                  {itemsCacheEntry?.loading && (
                    <div className="p-8 text-center text-xs text-muted font-semibold flex items-center justify-center gap-2">
                       <span className="w-5 h-5 border-2 border-accent border-t-transparent animate-spin rounded-full"></span>
                       Carregando itens da Amazon SP-API...
                    </div>
                  )}

                  {itemsCacheEntry?.error && (
                    <div className="p-5 text-xs font-mono text-red-600 bg-red-50 border-b border-red-200">
                      <strong>Erro ao carregar itens:</strong> {itemsCacheEntry.error}
                    </div>
                  )}

                  {!itemsCacheEntry?.loading && (
                    <table className="items-tbl">
                      <thead>
                        <tr>
                          <th>SKU</th>
                          <th>ASIN</th>
                          <th>Título do Produto</th>
                          <th style={{ textAlign: 'right' }}>Qtd.</th>
                          <th style={{ textAlign: 'right' }}>Preço</th>
                          <th style={{ textAlign: 'right' }}>Frete</th>
                          <th style={{ textAlign: 'right' }}>Descontos</th>
                          <th style={{ textAlign: 'right' }}>Impostos</th>
                        </tr>
                      </thead>
                      <tbody id="mItems">
                        {itemsCacheEntry?.items && itemsCacheEntry.items.length > 0 ? (
                          itemsCacheEntry.items.map((it, idx) => {
                            const sku = it.SellerSKU || (it as any).sku || "—";
                            const asin = it.ASIN || (it as any).asin || "—";
                            const title = it.Title || (it as any).title || "Nenhum título retornado";
                            const qty = it.QuantityOrdered !== undefined ? it.QuantityOrdered : ((it as any).qty !== undefined ? (it as any).qty : 0);
                            const price = it.ItemPrice?.Amount !== undefined ? it.ItemPrice.Amount : ((it as any).price !== undefined ? (it as any).price : 0);
                            const shipping = moneyOf(it.ShippingPrice);
                            const discounts = moneyOf(it.PromotionDiscount) + moneyOf(it.ShippingDiscount);
                            const taxes = moneyOf(it.ItemTax) + moneyOf(it.ShippingTax);

                            return (
                              <tr key={idx}>
                                <td className="mono">{sku}</td>
                                <td className="mono">{asin}</td>
                                <td>{title}</td>
                                <td className="num">{qty}</td>
                                <td className="num">{fmtMoney(price)}</td>
                                <td className="num">{fmtMoney(shipping)}</td>
                                <td className="num" style={discounts > 0 ? { color: '#c62828' } : undefined}>
                                  {discounts > 0 ? `- ${fmtMoney(discounts)}` : fmtMoney(0)}
                                </td>
                                <td className="num">{fmtMoney(taxes)}</td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan={8} style={{ textAlign: 'center', padding: '16px', color: 'var(--muted)' }}>
                              Nenhum item retornado para este pedido.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* FINANCES / FEES PANEL */}
                <div className="panel full">
                  <div className="panel-head">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" />
                      <path d="M12 18V6" />
                    </svg>
                    <h3>Custos e Taxas da Amazon (Finances API)</h3>
                  </div>

                  {financesCacheEntry?.loading && (
                    <div className="p-8 text-center text-xs text-muted font-semibold flex items-center justify-center gap-2">
                      <span className="w-5 h-5 border-2 border-accent border-t-transparent animate-spin rounded-full"></span>
                      Carregando eventos financeiros da Amazon SP-API...
                    </div>
                  )}

                  {financesCacheEntry?.error && (
                    <div className="p-5 text-xs font-mono text-red-600 bg-red-50 border-b border-red-200">
                      <strong>Erro ao carregar dados financeiros:</strong> {financesCacheEntry.error}
                    </div>
                  )}

                  {!financesCacheEntry?.loading && !financesCacheEntry?.error && (() => {
                    const fe = financesCacheEntry?.finances?.FinancialEvents || {};
                    const finRows: FinRow[] = [
                      ...buildFinRows(fe.ShipmentEventList || [], FIN_EVENT_GROUP_PT.ShipmentEventList),
                      ...buildFinRows(fe.RefundEventList || [], FIN_EVENT_GROUP_PT.RefundEventList),
                      ...buildFinRows(fe.GuaranteeClaimEventList || [], FIN_EVENT_GROUP_PT.GuaranteeClaimEventList),
                      ...buildFinRows(fe.ChargebackEventList || [], FIN_EVENT_GROUP_PT.ChargebackEventList),
                      ...buildServiceFeeRows(fe.ServiceFeeEventList || [], FIN_EVENT_GROUP_PT.ServiceFeeEventList)
                    ];
                    const saleNotPostedYet = (fe.ShipmentEventList || []).length === 0;
                    const netTotalPosted = finRows.reduce((acc, r) => acc + r.amount, 0);

                    // Seção de taxas estimadas (Product Fees API), exibida enquanto a venda não foi lançada
                    const estimatesJsx = !saleNotPostedYet ? null : (() => {
                      if (feesEstimateCacheEntry?.loading) {
                        return (
                          <div className="p-6 text-center text-xs text-muted font-semibold flex items-center justify-center gap-2 border-t border-border">
                            <span className="w-5 h-5 border-2 border-accent border-t-transparent animate-spin rounded-full"></span>
                            Estimando comissão e taxas via Product Fees API...
                          </div>
                        );
                      }
                      if (feesEstimateCacheEntry?.error) {
                        return (
                          <div className="p-5 text-xs font-mono text-red-600 bg-red-50 border-t border-red-200">
                            <strong>Erro ao estimar taxas:</strong> {feesEstimateCacheEntry.error}
                          </div>
                        );
                      }
                      const estimates = feesEstimateCacheEntry?.estimates;
                      if (!estimates || estimates.length === 0) return null;

                      let totalItems = 0;
                      let totalEstimatedFees = 0;
                      const estRows: { sku: string; typeCode: string; typeLabel: string; unit: number; qty: number; total: number }[] = [];
                      const estErrors: { sku: string; msg: string }[] = [];

                      for (const est of estimates) {
                        totalItems += est.lineTotal;
                        if (est.error) {
                          estErrors.push({ sku: est.sku || '—', msg: est.error });
                          continue;
                        }
                        if (est.result?.Status && est.result.Status !== 'Success') {
                          estErrors.push({ sku: est.sku || '—', msg: est.result?.Error?.Message || `Status: ${est.result.Status}` });
                          continue;
                        }
                        for (const fd of est.result?.FeesEstimate?.FeeDetailList || []) {
                          const unitFee = fd.FinalFee?.Amount ?? fd.FeeAmount?.Amount ?? 0;
                          if (unitFee === 0) continue;
                          estRows.push({
                            sku: est.sku,
                            typeCode: fd.FeeType || '—',
                            typeLabel: finLabel(FEE_TYPE_PT, fd.FeeType),
                            unit: unitFee,
                            qty: est.quantity,
                            total: unitFee * est.quantity
                          });
                        }
                        totalEstimatedFees += (est.result?.FeesEstimate?.TotalFeesEstimate?.Amount ?? 0) * est.quantity;
                      }

                      const projectedNet = totalItems - totalEstimatedFees + netTotalPosted;

                      return (
                        <div className="border-t border-border">
                          <div className="px-4 pt-3 pb-1 text-[12px] font-bold text-ink flex items-center gap-2">
                            Taxas estimadas (Product Fees API)
                            <span className="badge blue">PRÉVIA</span>
                          </div>
                          <div className="px-4 pb-2 text-[11px] text-muted">
                            Estimativa calculada com o preço de venda real de cada item do pedido.
                            O valor definitivo será lançado na Finances API após a cobrança/envio.
                          </div>
                          {estRows.length > 0 && (
                            <table className="items-tbl">
                              <thead>
                                <tr>
                                  <th>SKU</th>
                                  <th>Taxa</th>
                                  <th>Código (SP-API)</th>
                                  <th style={{ textAlign: 'right' }}>Por unidade</th>
                                  <th style={{ textAlign: 'right' }}>Qtd.</th>
                                  <th style={{ textAlign: 'right' }}>Total estimado</th>
                                </tr>
                              </thead>
                              <tbody>
                                {estRows.map((r, idx) => (
                                  <tr key={idx}>
                                    <td className="mono">{r.sku}</td>
                                    <td>{r.typeLabel}</td>
                                    <td className="mono">{r.typeCode}</td>
                                    <td className="num">{fmtMoney(r.unit)}</td>
                                    <td className="num">{r.qty}</td>
                                    <td className="num" style={{ color: '#c62828', fontWeight: 600 }}>- {fmtMoney(r.total)}</td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot>
                                <tr style={{ background: 'var(--surface-2)' }}>
                                  <td colSpan={5} style={{ textAlign: 'right', fontWeight: 700, fontSize: '12px' }}>Total dos itens do pedido</td>
                                  <td className="num" style={{ fontWeight: 700 }}>{fmtMoney(totalItems)}</td>
                                </tr>
                                <tr style={{ background: 'var(--surface-2)' }}>
                                  <td colSpan={5} style={{ textAlign: 'right', fontWeight: 700, fontSize: '12px' }}>Total de taxas estimadas</td>
                                  <td className="num" style={{ fontWeight: 700, color: '#c62828' }}>- {fmtMoney(totalEstimatedFees)}</td>
                                </tr>
                                {netTotalPosted !== 0 && (
                                  <tr style={{ background: 'var(--surface-2)' }}>
                                    <td colSpan={5} style={{ textAlign: 'right', fontWeight: 700, fontSize: '12px' }}>Eventos já lançados (ex: etiqueta de envio)</td>
                                    <td className="num" style={{ fontWeight: 700, color: netTotalPosted < 0 ? '#c62828' : '#0f7a4f' }}>{fmtMoney(netTotalPosted)}</td>
                                  </tr>
                                )}
                                <tr style={{ background: 'var(--green-soft)' }}>
                                  <td colSpan={5} style={{ textAlign: 'right', fontWeight: 800, fontSize: '12.5px' }}>Líquido projetado (estimativa)</td>
                                  <td className="num" style={{ fontWeight: 800, color: projectedNet < 0 ? '#c62828' : '#0f7a4f', fontSize: '14px' }}>{fmtMoney(projectedNet)}</td>
                                </tr>
                              </tfoot>
                            </table>
                          )}
                          {estErrors.map((e, idx) => (
                            <div key={idx} className="px-4 py-2 text-[11px] font-mono text-red-600 bg-red-50 border-t border-red-200">
                              <strong>{e.sku}:</strong> {e.msg}
                            </div>
                          ))}
                        </div>
                      );
                    })();

                    if (finRows.length === 0) {
                      return (
                        <>
                          <div className="p-6 text-center text-xs text-muted font-semibold">
                            Nenhum evento financeiro disponível para este pedido ainda.
                            <br />
                            <span className="font-normal">
                              As taxas só são registradas pela Amazon após a cobrança/envio do pedido
                              (pedidos Pendentes/Não Enviados ainda não possuem eventos financeiros).
                            </span>
                          </div>
                          {estimatesJsx}
                        </>
                      );
                    }

                    const sumBy = (cat: FinRow['category']) =>
                      finRows.filter(r => r.category === cat).reduce((acc, r) => acc + r.amount, 0);
                    const totalCharges = sumBy('Crédito');
                    const totalFees = sumBy('Taxa Amazon');
                    const totalPromos = sumBy('Promoção');
                    const totalWithheld = sumBy('Imposto retido');
                    const netTotal = netTotalPosted;

                    const postedDates = Array.from(new Set(
                      [...(fe.ShipmentEventList || []), ...(fe.RefundEventList || [])]
                        .map(ev => ev.PostedDate)
                        .filter(Boolean)
                    )) as string[];

                    const catColor = (cat: FinRow['category']) => {
                      if (cat === 'Taxa Amazon') return '#c62828';
                      if (cat === 'Promoção') return '#e8861a';
                      if (cat === 'Imposto retido') return '#6a1b9a';
                      return '#0f7a4f';
                    };

                    return (
                      <>
                        <table className="items-tbl">
                          <thead>
                            <tr>
                              <th>Evento</th>
                              <th>Categoria</th>
                              <th>Descrição</th>
                              <th>Código (SP-API)</th>
                              <th>SKU</th>
                              <th style={{ textAlign: 'right' }}>Valor</th>
                            </tr>
                          </thead>
                          <tbody>
                            {finRows.map((r, idx) => (
                              <tr key={idx}>
                                <td style={{ fontSize: '12px' }}>{r.group}</td>
                                <td>
                                  <span style={{ color: catColor(r.category), fontWeight: 700, fontSize: '12px' }}>
                                    {r.category}
                                  </span>
                                </td>
                                <td>{r.typeLabel}</td>
                                <td className="mono">{r.typeCode}</td>
                                <td className="mono">{r.sku}</td>
                                <td className="num" style={{ color: r.amount < 0 ? '#c62828' : 'var(--ink)' }}>
                                  {fmtMoney(r.amount)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr style={{ background: 'var(--surface-2)' }}>
                              <td colSpan={5} style={{ textAlign: 'right', fontWeight: 700, fontSize: '12px' }}>Total cobrado do cliente (créditos)</td>
                              <td className="num" style={{ fontWeight: 700 }}>{fmtMoney(totalCharges)}</td>
                            </tr>
                            <tr style={{ background: 'var(--surface-2)' }}>
                              <td colSpan={5} style={{ textAlign: 'right', fontWeight: 700, fontSize: '12px' }}>Total de taxas da Amazon</td>
                              <td className="num" style={{ fontWeight: 700, color: '#c62828' }}>{fmtMoney(totalFees)}</td>
                            </tr>
                            {totalPromos !== 0 && (
                              <tr style={{ background: 'var(--surface-2)' }}>
                                <td colSpan={5} style={{ textAlign: 'right', fontWeight: 700, fontSize: '12px' }}>Total de promoções</td>
                                <td className="num" style={{ fontWeight: 700, color: '#e8861a' }}>{fmtMoney(totalPromos)}</td>
                              </tr>
                            )}
                            {totalWithheld !== 0 && (
                              <tr style={{ background: 'var(--surface-2)' }}>
                                <td colSpan={5} style={{ textAlign: 'right', fontWeight: 700, fontSize: '12px' }}>Impostos retidos pela Amazon</td>
                                <td className="num" style={{ fontWeight: 700, color: '#6a1b9a' }}>{fmtMoney(totalWithheld)}</td>
                              </tr>
                            )}
                            <tr style={{ background: 'var(--green-soft)' }}>
                              <td colSpan={5} style={{ textAlign: 'right', fontWeight: 800, fontSize: '12.5px' }}>
                                {saleNotPostedYet ? 'Saldo dos eventos lançados até agora' : 'Valor líquido do vendedor (estimado)'}
                              </td>
                              <td className="num" style={{ fontWeight: 800, color: netTotal < 0 ? '#c62828' : '#0f7a4f', fontSize: '14px' }}>{fmtMoney(netTotal)}</td>
                            </tr>
                          </tfoot>
                        </table>
                        {saleNotPostedYet && (
                          <div className="px-4 py-2 text-[11px] text-muted border-t border-border">
                            A receita da venda (preço do produto, comissão, etc.) ainda não foi lançada pela Amazon —
                            isso ocorre somente após a cobrança/envio do pedido. Os valores acima são apenas os eventos já registrados (ex: etiqueta de envio).
                          </div>
                        )}
                        {postedDates.length > 0 && (
                          <div className="px-4 py-2 text-[11px] text-muted border-t border-border">
                            Lançamento(s) registrado(s) em: {postedDates.map(d => fmtDT(d)).join(' · ')}
                          </div>
                        )}
                        {estimatesJsx}
                      </>
                    );
                  })()}
                </div>

                {/* TIMELINE PANEL */}
                <div className="panel">
                  <div className="panel-head">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                    <h3>Linha do Tempo</h3>
                  </div>
                  <div className="tl" id="mTimeline">
                    <div className="tl-item donept">
                      <span className="tl-dot"></span>
                      <div>
                        <div className="tl-t">Compra realizada</div>
                        <div className="tl-d">{fmtDT(order.PurchaseDate)}</div>
                      </div>
                    </div>
                    <div className="tl-item donept">
                      <span className="tl-dot"></span>
                      <div>
                        <div className="tl-t">Janela de envio</div>
                        <div className="tl-d">{fmtD(order.EarliestShipDate)} – {fmtD(order.LatestShipDate)}</div>
                      </div>
                    </div>
                    <div className={`tl-item ${order.EasyShipShipmentStatus === 'Delivered' ? 'donept' : ''}`}>
                      <span className="tl-dot"></span>
                      <div>
                        <div className="tl-t">Janela de entrega</div>
                        <div className="tl-d">{fmtD(order.EarliestDeliveryDate)} – {fmtD(order.LatestDeliveryDate)}</div>
                      </div>
                    </div>
                    <div className="tl-item accent">
                      <span className="tl-dot"></span>
                      <div>
                        <div className="tl-t">Última atualização</div>
                        <div className="tl-d">{fmtDT(order.LastUpdateDate)}</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* DELIVERY PANEL */}
                <div className="panel">
                  <div className="panel-head">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                    <h3>Entrega</h3>
                  </div>
                  <div className="panel-body" id="mShipping">
                    <div className="prow" style={{ flexDirection: "column", gap: "2px", alignItems: "stretch" }}>
                      <span className="addr-tag">Destino</span>
                      <div className="addr">
                        {sa.City || '—'} · {sa.StateOrRegion || ''} ({sa.CountryCode || ''})
                        <br />
                        <span className="cep">CEP {fmtCEP(sa.PostalCode)}</span>
                      </div>
                    </div>
                    <div className="prow" style={{ flexDirection: "column", gap: "2px", alignItems: "stretch" }}>
                      <span className="addr-tag">Origem (Ship From)</span>
                      <div className="addr">
                        {sf.City && sf.City !== "null" ? sf.City : '—'} · {sf.StateOrRegion && sf.StateOrRegion !== "null" ? sf.StateOrRegion : ''} ({sf.CountryCode && sf.CountryCode !== "null" ? sf.CountryCode : ''})
                        <br />
                        <span className="cep">CEP {sf.PostalCode && sf.PostalCode !== "null" ? fmtCEP(sf.PostalCode) : '—'}</span>
                      </div>
                    </div>
                    {prow('EasyShip', order.EasyShipShipmentStatus === 'Delivered' ? (
                      <span className="badge green">ENTREGUE</span>
                    ) : (
                      order.EasyShipShipmentStatus || '—'
                    ))}
                  </div>
                </div>

                {/* PAYMENT PANEL */}
                <div className="panel">
                  <div className="panel-head">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect width="20" height="14" x="2" y="5" rx="2" />
                      <line x1="2" x2="22" y1="10" y2="10" />
                    </svg>
                    <h3>Pagamento</h3>
                  </div>
                  <div className="panel-body" id="mPayment">
                    {prow('Valor', <b>{fmtMoney(pay.Payment?.Amount || orderTotalAmount)}</b>)}
                    {prow('Método', (pay.PaymentMethod === 'CreditCard' ? 'Cartão de crédito' : '—') + (pay.CardBrand ? ' · ' + pay.CardBrand : ''))}
                    {prow('Autorização', pay.AuthorizationCode || '—', true)}
                    {prow('Adquirente (CNPJ)', pay.AcquirerId || '—', true)}
                    {prow('NF-e', order.ElectronicInvoiceStatus === 'Accepted' ? (
                      <span className="badge blue">ACEITA</span>
                    ) : (
                      order.ElectronicInvoiceStatus || '—'
                    ))}
                  </div>
                </div>

                {/* BUYER PANEL */}
                <div className="panel">
                  <div className="panel-head">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                    <h3>Comprador</h3>
                  </div>
                  <div className="panel-body" id="mBuyer">
                    {prow('E-mail (anônimo)', bi.BuyerEmail || '—', true)}
                    {prow('Bairro/Região', bi.BuyerCounty || '—')}
                    {prow('Marketplace', order.MarketplaceId || '—', true)}
                  </div>
                </div>

                {/* FLAGS PANEL (FULL WIDTH) */}
                <div className="panel full">
                  <div className="panel-head">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 22c5.5 0 10-4.5 10-10S17.5 2 12 2 2 6.5 2 12s4.5 10 10 10Z" />
                      <path d="m9 12 2 2 4-4" />
                    </svg>
                    <h3>Características do Pedido</h3>
                  </div>
                  <div className="flags" id="mFlags">
                    {fpill(order.IsPrime, 'Prime')}
                    {fpill(order.IsPremiumOrder, 'Premium')}
                    {fpill(order.IsBusinessOrder, 'Empresarial (B2B)')}
                    {fpill(order.IsReplacementOrder === 'true' || order.IsReplacementOrder === true, 'Reposição')}
                    {fpill(order.HasRegulatedItems, 'Itens regulados')}
                    {fpill(order.IsGlobalExpressEnabled, 'Global Express')}
                    {fpill(order.IsISPU, 'Retirada na loja (ISPU)')}
                    {fpill(order.IsAccessPointOrder, 'Ponto de coleta')}
                    {fpill(order.AutomatedShippingSettings?.HasAutomatedShippingSettings, 'Envio automatizado')}
                    {fpill(order.IsSoldByAB, 'Vendido por AB')}
                  </div>
                </div>
              </div>
            </div>

            {/* JSON PANE */}
            <div className={`m-pane ${activeTab === 'json' ? 'active' : ''}`} id="pane-json">
              <div className="json-pane">
                <div className="json-bar">
                  <span className="t" id="jsonTitle">getOrder · {order.AmazonOrderId}</span>
                  <div className="right">
                    <button className="m-copy-btn" onClick={triggerCopyJson} title="Copiar JSON" style={{ borderColor: 'rgba(255,255,255,.16)' }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect width="13" height="13" x="9" y="9" rx="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                    </button>
                  </div>
                </div>
                <div className="json-scroll">
                  <pre id="mJson" dangerouslySetInnerHTML={{ __html: highlight(order) }} />
                </div>
              </div>
              {financesCacheEntry?.finances && (
                <div className="json-pane" style={{ marginTop: '14px' }}>
                  <div className="json-bar">
                    <span className="t">listFinancialEventsByOrderId · {order.AmazonOrderId}</span>
                    <div className="right">
                      <button
                        className="m-copy-btn"
                        onClick={() => {
                          if (navigator.clipboard) {
                            navigator.clipboard.writeText(JSON.stringify(financesCacheEntry.finances, null, 2));
                            onToast("JSON financeiro copiado!");
                          }
                        }}
                        title="Copiar JSON financeiro"
                        style={{ borderColor: 'rgba(255,255,255,.16)' }}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect width="13" height="13" x="9" y="9" rx="2" />
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  <div className="json-scroll">
                    <pre dangerouslySetInnerHTML={{ __html: highlight(financesCacheEntry.finances) }} />
                  </div>
                </div>
              )}
              {feesEstimateCacheEntry?.estimates && (
                <div className="json-pane" style={{ marginTop: '14px' }}>
                  <div className="json-bar">
                    <span className="t">getMyFeesEstimateForSKU (por item) · {order.AmazonOrderId}</span>
                    <div className="right">
                      <button
                        className="m-copy-btn"
                        onClick={() => {
                          if (navigator.clipboard) {
                            navigator.clipboard.writeText(JSON.stringify(feesEstimateCacheEntry.estimates, null, 2));
                            onToast("JSON de estimativas copiado!");
                          }
                        }}
                        title="Copiar JSON de estimativas"
                        style={{ borderColor: 'rgba(255,255,255,.16)' }}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect width="13" height="13" x="9" y="9" rx="2" />
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  <div className="json-scroll">
                    <pre dangerouslySetInnerHTML={{ __html: highlight(feesEstimateCacheEntry.estimates) }} />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <style>{`
        /* Custom scoped/modal styles to match reference */
        .overlay {
          position: fixed;
          inset: 0;
          background: rgba(16, 29, 49, 0.55);
          backdrop-filter: blur(3px);
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.22s;
          display: grid;
          place-items: center;
          padding: 28px;
          z-index: 100;
        }
        .overlay.open {
          opacity: 1;
          pointer-events: auto;
        }
        .modal {
          width: min(920px, 100%);
          max-height: calc(100vh - 56px);
          background: var(--surface);
          border-radius: 18px;
          box-shadow: var(--shadow-lg);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          transform: translateY(14px) scale(0.985);
          transition: transform 0.25s cubic-bezier(.3,1.1,.4,1);
        }
        .overlay.open .modal {
          transform: none;
        }
        .m-head {
          background: linear-gradient(160deg, var(--navy-800), var(--navy-900));
          color: #fff;
          padding: 22px 26px 0;
          flex-shrink: 0;
        }
        .m-head-top {
          display: flex;
          align-items: flex-start;
          gap: 14px;
          text-align: left;
        }
        .m-otitle .lbl {
          font-size: 11px;
          font-weight: 700;
          color: #8497af;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
        .m-oid {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-top: 3px;
        }
        .m-oid .v {
          font-family: var(--font-mono);
          font-size: 21px;
          font-weight: 700;
          letter-spacing: -0.01em;
          color: #fff;
        }
        .m-badges {
          display: flex;
          gap: 7px;
          flex-wrap: wrap;
          margin-top: 11px;
          margin-bottom: 2px;
        }
        .m-close {
          margin-left: auto;
          width: 34px;
          height: 34px;
          border-radius: 9px;
          flex-shrink: 0;
          border: 1px solid rgba(255,255,255,.14);
          background: rgba(255,255,255,.06);
          color: #cdd8e6;
          display: grid;
          place-items: center;
          transition: 0.15s;
          cursor: pointer;
        }
        .m-close:hover {
          background: rgba(255,255,255,.14);
          color: #fff;
        }
        .m-close svg {
          width: 16px;
          height: 16px;
        }
        .m-copy-btn {
          width: 26px;
          height: 26px;
          border-radius: 6px;
          border: 1px solid rgba(255,255,255,.16);
          background: rgba(255,255,255,.06);
          display: grid;
          place-items: center;
          color: #9fb0c7;
          transition: 0.15s;
          cursor: pointer;
        }
        .m-copy-btn:hover {
          color: #fff;
          border-color: rgba(255,255,255,0.4);
        }
        .m-copy-btn svg {
          width: 13px;
          height: 13px;
        }
        .m-tabs {
          display: flex;
          gap: 2px;
          margin-top: 18px;
        }
        .m-tab {
          appearance: none;
          background: none;
          border: none;
          color: #8497af;
          font-size: 13px;
          font-weight: 700;
          padding: 11px 16px;
          border-bottom: 2px solid transparent;
          transition: color 0.15s;
          cursor: pointer;
        }
        .m-tab:hover {
          color: #cdd8e6;
        }
        .m-tab.active {
          color: #fff;
          border-bottom-color: var(--accent);
        }
        .m-body {
          overflow-y: auto;
          background: var(--bg);
          flex: 1;
          text-align: left;
        }
        .m-pane {
          padding: 22px 26px;
          display: none;
        }
        .m-pane.active {
          display: block;
        }
        .strip {
          display: grid;
          grid-template-columns: 1.2fr 1fr 1fr 1fr;
          gap: 12px;
          margin-bottom: 18px;
        }
        .stat {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 14px 16px;
          text-align: left;
        }
        .stat .sk {
          font-size: 10.5px;
          font-weight: 700;
          color: var(--muted-2);
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        .stat .sv {
          font-size: 16px;
          font-weight: 800;
          margin-top: 4px;
          letter-spacing: -0.01em;
          color: var(--ink);
        }
        .stat .sv.big {
          font-size: 23px;
          color: var(--accent-strong);
        }
        .stat .sv.big small {
          font-size: 13px;
          font-weight: 600;
          color: var(--muted);
          margin-right: 2px;
        }
        .stat .ss {
          font-size: 11px;
          color: var(--muted);
          margin-top: 2px;
        }
        .m-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }
        .m-grid .full {
          grid-column: 1 / -1;
        }
        .panel {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 12px;
          overflow: hidden;
        }
        .panel-head {
          display: flex;
          align-items: center;
          gap: 9px;
          padding: 12px 16px;
          border-bottom: 1px solid var(--border);
          background: var(--surface-2);
        }
        .panel-head svg {
          width: 14px;
          height: 14px;
          color: var(--muted);
        }
        .panel-head h3 {
          font-size: 12.5px;
          font-weight: 700;
          letter-spacing: -0.01em;
          margin: 0;
          color: var(--ink);
        }
        .panel-body {
          padding: 6px 16px 12px;
        }
        .prow {
          display: flex;
          gap: 14px;
          padding: 9px 0;
          border-bottom: 1px solid var(--border);
          align-items: baseline;
          text-align: left;
        }
        .prow:last-child {
          border-bottom: none;
        }
        .prow .pk {
          flex: 0 0 128px;
          font-size: 12px;
          font-weight: 600;
          color: var(--muted);
        }
        .prow .pv {
          flex: 1;
          font-size: 13px;
          font-weight: 600;
          min-width: 0;
          word-break: break-word;
          color: var(--ink);
        }
        .prow .pv.mono {
          font-family: var(--font-mono);
          font-size: 12px;
          font-weight: 500;
        }
        .items-tbl {
          width: 100%;
          border-collapse: collapse;
        }
        .items-tbl th {
          text-align: left;
          font-size: 10px;
          font-weight: 700;
          color: var(--muted-2);
          text-transform: uppercase;
          letter-spacing: 0.06em;
          padding: 9px 16px;
          border-bottom: 1px solid var(--border);
          background: var(--surface-2);
        }
        .items-tbl td {
          padding: 11px 16px;
          font-size: 13px;
          border-bottom: 1px solid var(--border);
          color: var(--ink);
        }
        .items-tbl tr:last-child td {
          border-bottom: none;
        }
        .items-tbl .mono {
          font-family: var(--font-mono);
          font-size: 12px;
          font-weight: 600;
          color: var(--navy-700);
        }
        .items-tbl .num {
          text-align: right;
          font-family: var(--font-mono);
          white-space: nowrap;
        }
        .tl {
          padding: 14px 16px 16px;
          position: relative;
          text-align: left;
        }
        .tl-item {
          display: flex;
          gap: 13px;
          position: relative;
          padding-bottom: 18px;
        }
        .tl-item:last-child {
          padding-bottom: 0;
        }
        .tl-item::before {
          content: "";
          position: absolute;
          left: 5.5px;
          top: 16px;
          bottom: 2px;
          width: 1.5px;
          background: var(--border-strong);
        }
        .tl-item:last-child::before {
          display: none;
        }
        .tl-dot {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          flex-shrink: 0;
          margin-top: 3px;
          border: 3px solid var(--border-strong);
          background: var(--surface);
          position: relative;
          z-index: 1;
        }
        .tl-item.donept .tl-dot {
          border-color: var(--green);
          background: var(--green-soft);
        }
        .tl-item.accent .tl-dot {
          border-color: var(--accent);
          background: var(--accent-soft);
        }
        .tl-t {
          font-size: 12.5px;
          font-weight: 700;
          color: var(--ink);
        }
        .tl-d {
          font-size: 11.5px;
          color: var(--muted);
          font-family: var(--font-mono);
          margin-top: 1px;
        }
        .addr {
          font-size: 13px;
          font-weight: 600;
          line-height: 1.55;
          color: var(--ink);
        }
        .addr .cep {
          font-family: var(--font-mono);
          font-size: 12px;
          color: var(--ink-2);
          font-weight: 500;
        }
        .addr-tag {
          display: inline-block;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.06em;
          color: var(--muted);
          text-transform: uppercase;
          margin-bottom: 5px;
        }
        .flags {
          display: flex;
          flex-wrap: wrap;
          gap: 7px;
          padding: 14px 16px;
          text-align: left;
        }
        .fpill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 11.5px;
          font-weight: 600;
          border-radius: 6px;
          padding: 4px 10px;
        }
        .fpill svg {
          width: 11px;
          height: 11px;
        }
        .fpill.on {
          background: var(--green-soft);
          color: #0f7a4f;
        }
        .fpill.off {
          background: #f1f3f7;
          color: var(--muted-2);
        }
        .json-pane {
          background: var(--navy-900);
          border-radius: 12px;
          overflow: hidden;
        }
        .json-bar {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 11px 16px;
          border-bottom: 1px solid rgba(255,255,255,.09);
        }
        .json-bar .t {
          font-family: var(--font-mono);
          font-size: 11px;
          color: #8497af;
          font-weight: 600;
        }
        .json-bar .right {
          margin-left: auto;
        }
        .json-scroll {
          max-height: 52vh;
          overflow: auto;
          padding: 16px 18px;
        }
        .json-scroll pre {
          font-family: var(--font-mono);
          font-size: 12px;
          line-height: 1.7;
          white-space: pre-wrap;
          word-break: break-all;
          color: #dbe4f0;
          text-align: left;
        }
        
        @media(max-width:900px){
          .strip{grid-template-columns:1fr 1fr}
          .m-grid{grid-template-columns:1fr}
        }
      `}</style>
    </>
  );
}
