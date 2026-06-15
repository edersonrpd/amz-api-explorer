import { TikTokOrder, FeeConfig } from "../types";
import { estimateFees } from "../services/tiktokService";
import { ORDER_STATUS_PT } from "../constants";
import { fmtEpoch, fmtMoney } from "../lib/utils";

interface Props {
  order: TikTokOrder;
  feeConfig: FeeConfig;
  onClose: () => void;
  onViewJson: (data: any, title: string) => void;
}

export function OrderDetailsModal({ order, feeConfig, onClose, onViewJson }: Props) {
  const currency = order.payment?.currency || "BRL";
  const gross = parseFloat(order.payment?.total_amount || "0");
  const fees = estimateFees(gross, feeConfig);
  const statusLabel = order.status ? ORDER_STATUS_PT[order.status] || order.status : "—";

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div style={{ flex: 1 }}>
            <h2>Pedido</h2>
            <span className="oid">{order.id}</span>
          </div>
          <button className="btn btn-ghost" onClick={() => onViewJson(order, `Pedido · ${order.id}`)} style={{ padding: "6px 12px", fontSize: "12px" }}>
            Ver JSON
          </button>
          <button className="icon-btn" style={{ background: "var(--surface-2)", color: "var(--ink-2)", borderColor: "var(--border)" }} onClick={onClose} title="Fechar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>

        <div className="modal-body">
          {/* Cabecalho do pedido */}
          <div className="flex flex-wrap gap-4 mb-5">
            <div className="field"><label>Status</label><span className="badge green" style={{ width: "fit-content" }}>{statusLabel}</span></div>
            <div className="field"><label>Criado em</label><span className="text-[13px] text-ink-2">{fmtEpoch(order.create_time)}</span></div>
            <div className="field"><label>Fulfillment</label><span className="text-[13px] text-ink-2 font-mono">{order.fulfillment_type || "—"}</span></div>
            <div className="field"><label>Total</label><span className="ototal">{fmtMoney(order.payment?.total_amount, currency)}</span></div>
          </div>

          {/* Itens */}
          <h3 className="text-[13px] font-bold text-ink mb-2">Itens ({order.line_items?.length || 0})</h3>
          <div className="overflow-x-auto mb-6">
            <table className="orders">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Seller SKU</th>
                  <th style={{ textAlign: "right" }}>Qtd</th>
                  <th style={{ textAlign: "right" }}>Preco</th>
                </tr>
              </thead>
              <tbody>
                {(order.line_items || []).map((li) => (
                  <tr key={li.id}>
                    <td className="text-ink-2 max-w-[260px] truncate" title={li.product_name}>{li.product_name || "—"}</td>
                    <td className="font-mono text-[12px]">{li.seller_sku || "—"}</td>
                    <td style={{ textAlign: "right" }}>{li.quantity ?? 1}</td>
                    <td style={{ textAlign: "right" }} className="ototal">{fmtMoney(li.sale_price, li.currency || currency)}</td>
                  </tr>
                ))}
                {(!order.line_items || order.line_items.length === 0) && (
                  <tr><td colSpan={4} className="text-muted text-center">Sem itens detalhados.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Estimativa de taxas (calculo aproximado) */}
          <h3 className="text-[13px] font-bold text-ink mb-2">Estimativa de taxas (aproximada)</h3>
          <div className="card" style={{ padding: "14px 16px" }}>
            <FeeLine label="Valor bruto" value={fmtMoney(fees.grossAmount, currency)} />
            <FeeLine label={`Comissao (${feeConfig.commissionRate}%)`} value={`- ${fmtMoney(fees.commission, currency)}`} />
            <FeeLine label={`Taxa de transacao (${feeConfig.transactionRate}%)`} value={`- ${fmtMoney(fees.transactionFee, currency)}`} />
            <div style={{ borderTop: "1px solid var(--border)", marginTop: 8, paddingTop: 8 }}>
              <FeeLine label="Liquido estimado" value={fmtMoney(fees.netAmount, currency)} strong />
            </div>
            <p className="text-[11px] text-muted mt-2">
              O TikTok Shop nao oferece estimativa de taxa pre-venda; este calculo usa percentuais
              configuraveis. As taxas reais aparecem no acerto (settlement) pos-venda.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function FeeLine({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className={`text-[13px] ${strong ? "font-bold text-ink" : "text-ink-2"}`}>{label}</span>
      <span className={`font-mono text-[13px] ${strong ? "font-bold text-accent-strong" : "text-ink-2"}`}>{value}</span>
    </div>
  );
}
