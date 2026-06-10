import { useState, FormEvent, useEffect } from "react";
import { getListingsItem, searchListingsItems, getOrders, getOrderItems } from "./services/amazonService";
import { useLocalStorage } from "./hooks/useLocalStorage";
import { AmazonCredentials, AmazonListing, SkuResult, AmazonOrder, OrderItem } from "./types";
import { MARKETPLACES } from "./constants";
import { ListingResult } from "./components/ListingResult";
import { JsonDrawer } from "./components/JsonDrawer";
import { exportListingToExcel, exportAllListingsToExcel } from "./lib/export";

const ORDER_STATUS_OPTIONS = [
  { id: "Pending", label: "Pendente" },
  { id: "Unshipped", label: "Não Enviado" },
  { id: "PartiallyShipped", label: "Parcialmente Enviado" },
  { id: "Shipped", label: "Enviado" },
  { id: "Canceled", label: "Cancelado" }
];

export default function App() {
  const [activeTab, setActiveTab] = useState("Listings / Itens");
  
  const [credentials, setCredentials] = useLocalStorage<AmazonCredentials>("amz_credentials", {
    accessToken: "",
    sellerId: "",
    marketplaceId: MARKETPLACES[0].id,
  });
  const [lastSku, setLastSku] = useLocalStorage<string>("amz_last_sku", "");

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [skuResults, setSkuResults] = useState<SkuResult[]>([]);
  const [selectedSku, setSelectedSku] = useState<string | null>(null);
  const [batchProgress, setBatchProgress] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerData, setDrawerData] = useState<any | null>(null);
  const [drawerTitle, setDrawerTitle] = useState("");

  // Orders State
  const [orders, setOrders] = useState<AmazonOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [ordersNextToken, setOrdersNextToken] = useState<string | null>(null);
  const [ordersDatePreset, setOrdersDatePreset] = useState<"7" | "30" | "90" | "custom">("30");
  const [ordersCustomDate, setOrdersCustomDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [ordersStatuses, setOrdersStatuses] = useState<string[]>(["Unshipped", "Shipped"]);
  const [expandedOrders, setExpandedOrders] = useState<Record<string, boolean>>({});
  const [ordersItemsCache, setOrdersItemsCache] = useState<Record<string, { loading: boolean; items?: OrderItem[]; error?: string }>>({});

  const [toastMsg, setToastMsg] = useState("");
  const [showToast, setShowToast] = useState(false);

  const TABS = ["Listings / Itens", "Pedidos", "Estoque FBA", "Catálogo"];

  const parseSkus = (input: string): string[] => {
    if (!input) return [];
    // Split on commas, line breaks, or spaces, and clean up empty items
    const rawArray = input.split(/[\n,\s]+/);
    return Array.from(new Set(rawArray.map(s => s.trim()).filter(s => s.length > 0)));
  };

  const handleConsult = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    const targetSkus = parseSkus(lastSku);
    if (targetSkus.length === 0) return;

    setIsLoading(true);
    setError(null);
    setBatchProgress(null);
    
    let results: SkuResult[] = targetSkus.map(sku => ({ sku, status: "pending" }));
    setSkuResults(results);
    setSelectedSku(targetSkus[0]);

    const fixedCreds = { ...credentials, marketplaceId: "A2Q3Y263D00KWC" };

    try {
      const batches: string[][] = [];
      for (let i = 0; i < targetSkus.length; i += 20) {
        batches.push(targetSkus.slice(i, i + 20));
      }

      for (let bIndex = 0; bIndex < batches.length; bIndex++) {
        const batch = batches[bIndex];
        setBatchProgress(`Lote ${bIndex + 1} de ${batches.length}...`);

        results = results.map(item => 
          batch.includes(item.sku) ? { ...item, status: "searching" } : item
        );
        setSkuResults([...results]);

        let attempt = 0;
        let success = false;
        let batchResponse: any = null;
        let batchError = "";

        while (attempt < 4 && !success) {
          try {
            if (attempt > 0) {
              const delay = Math.pow(2, attempt) * 1000;
              setBatchProgress(`Lote ${bIndex + 1}/${batches.length}: Erro 429 (rate-limit), aguardando ${delay/1000}s para tentar novamente...`);
              await new Promise(r => setTimeout(r, delay));
            }
            batchResponse = await searchListingsItems(fixedCreds, { skus: batch });
            success = true;
          } catch (err: any) {
            console.error(err);
            const errMsg = err.message || "";
            if (errMsg.includes("429") || errMsg.includes("Too Many Requests")) {
              attempt++;
            } else {
              batchError = errMsg || "Erro ao consultar lote.";
              break;
            }
          }
        }

        if (success && batchResponse) {
          const foundItems = batchResponse.items || [];
          const foundSkus = foundItems.map((item: any) => item.sku);

          results = results.map(item => {
            if (batch.includes(item.sku)) {
              if (foundSkus.includes(item.sku)) {
                const itemData = foundItems.find((itm: any) => itm.sku === item.sku);
                return {
                  ...item,
                  status: "success",
                  data: itemData
                };
              } else {
                return {
                  ...item,
                  status: "not_found",
                  errorMsg: `SKU não encontrado no Seller ID/Marketplace informado.`
                };
              }
            }
            return item;
          });
        } else {
          results = results.map(item => 
            batch.includes(item.sku) 
              ? { ...item, status: "error", errorMsg: batchError || "Falha ao consultar lote." } 
              : item
          );
        }

        setSkuResults([...results]);

        if (bIndex < batches.length - 1) {
          await new Promise(r => setTimeout(r, 600));
        }
      }

      const succeededCount = results.filter(r => r.status === "success").length;
      displayToast(`Consulta finalizada! ${succeededCount} de ${targetSkus.length} carregados.`);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Erro desconhecido ao consultar SP-API.");
    } finally {
      setBatchProgress(null);
      setIsLoading(false);
    }
  };

  const displayToast = (msg: string) => {
    setToastMsg(msg);
    setShowToast(true);
  };

  const openJsonDrawer = (data: any, titleStr: string) => {
    setDrawerData(data);
    setDrawerTitle(titleStr);
    setIsDrawerOpen(true);
  };

  const formatPrice = (total: any) => {
    if (!total || total.Amount === undefined) return "-";
    const amt = parseFloat(total.Amount);
    return `${total.CurrencyCode === 'BRL' ? 'R$' : total.CurrencyCode} ${amt.toFixed(2).replace('.', ',')}`;
  };

  const handleQueryOrders = async (isLoadMore: boolean = false) => {
    setOrdersLoading(true);
    setOrdersError(null);

    // Calculate createdAfter
    let createdAfterISO = "";
    if (ordersDatePreset === "custom") {
      if (!ordersCustomDate) {
        setOrdersError("Por favor, selecione uma data inicial.");
        setOrdersLoading(false);
        return;
      }
      createdAfterISO = new Date(ordersCustomDate + "T00:00:00").toISOString();
    } else {
      const days = parseInt(ordersDatePreset);
      const d = new Date();
      d.setDate(d.getDate() - days);
      createdAfterISO = d.toISOString();
    }

    try {
      const activeNextToken = isLoadMore ? (ordersNextToken || undefined) : undefined;
      const fixedCreds = { ...credentials, marketplaceId: "A2Q3Y263D00KWC" };
      
      const response = await getOrders(fixedCreds, {
        createdAfter: createdAfterISO,
        orderStatuses: ordersStatuses,
        nextToken: activeNextToken
      });

      const newOrders = response.Orders || [];
      if (isLoadMore) {
        setOrders(prev => [...prev, ...newOrders]);
      } else {
        setOrders(newOrders);
      }
      setOrdersNextToken(response.NextToken || null);
      displayToast(isLoadMore ? `${newOrders.length} novos pedidos carregados` : `${newOrders.length} pedidos carregados`);
    } catch (err: any) {
      console.error(err);
      setOrdersError(err.message || "Erro desconhecido ao consultar SP-API.");
    } finally {
      setOrdersLoading(false);
    }
  };

  const handleToggleOrderItems = async (orderId: string) => {
    // Toggle expand state
    const isExpanded = !expandedOrders[orderId];
    setExpandedOrders(prev => ({ ...prev, [orderId]: isExpanded }));

    // Load items if not cached and going to expand
    if (isExpanded && !ordersItemsCache[orderId]) {
      setOrdersItemsCache(prev => ({
        ...prev,
        [orderId]: { loading: true }
      }));

      try {
        const fixedCreds = { ...credentials, marketplaceId: "A2Q3Y263D00KWC" };
        const response = await getOrderItems(fixedCreds, { orderId });
        setOrdersItemsCache(prev => ({
          ...prev,
          [orderId]: { loading: false, items: response.OrderItems || [] }
        }));
      } catch (err: any) {
        console.error(err);
        setOrdersItemsCache(prev => ({
          ...prev,
          [orderId]: { loading: false, error: err.message || "Erro ao carregar itens." }
        }));
      }
    }
  };

  useEffect(() => {
    if (showToast) {
      const timer = setTimeout(() => setShowToast(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [showToast]);

  const selectedMarketplace = MARKETPLACES.find(m => m.id === credentials.marketplaceId)?.name || 'Desconhecido';
  const shortToken = credentials.accessToken ? `•••••••• ${credentials.accessToken.slice(-4)}` : "Não configurado";
  const sellerIdDisp = credentials.sellerId || "Não configurado";

  const selectedResult = skuResults.find(r => r.sku === selectedSku)?.data || null;

  return (
    <>
      {/* Top header */}
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8 12 3 3 8l9 5 9-5Z"/><path d="M3 8v8l9 5 9-5V8"/><path d="m12 13 0 8"/></svg>
          </div>
          <span className="brand-name">Amazon <b>Listings</b> Explorer</span>
        </div>
        <span className="topbar-right">SP-API DEV TOOL</span>
      </header>

      <div className="shell">
        {/* Tabs */}
        <nav className="tabs">
          {TABS.map(tab => (
            <button 
              key={tab} 
              className={`tab ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </nav>

        {activeTab === "Listings / Itens" ? (
          <>
            {/* Compact connection bar */}
            <section className="conn flex flex-col">
              {/* credentials */}
              <div className="conn-edit">
                <div className="conn-edit-grid">
                  <div className="field">
                    <label>Access Token (LWA)</label>
                    <input 
                      className="input mono" 
                      type="password" 
                      value={credentials.accessToken}
                      onChange={e => setCredentials({...credentials, accessToken: e.target.value})}
                      placeholder="Atza|IwEBI..."
                    />
                  </div>
                  <div className="field">
                    <label>Seller ID</label>
                    <input 
                      className="input mono" 
                      value={credentials.sellerId}
                      onChange={e => setCredentials({...credentials, sellerId: e.target.value})}
                      placeholder="A1ZR..."
                    />
                  </div>
                </div>
              </div>

              <div className="conn-row">
                <div className="conn-status">
                  <span className="pulse"></span>
                  <div>
                    <div className="lbl">Conectado</div>
                    <div className="sub">Credenciais ativas</div>
                  </div>
                </div>
                <div className="chips">
                  <span className="chip"><span className="k">Token</span><span className="v">{shortToken}</span></span>
                  <span className="chip"><span className="k">Seller</span><span className="v">{sellerIdDisp}</span></span>
                  <span className="chip"><span className="flag"></span><span className="v">Brasil (BR)</span></span>
                </div>
                <div className="conn-spacer"></div>
                <form className="conn-query flex-1 flex items-stretch gap-2.5" onSubmit={handleConsult}>
                  <div className="field flex-1" style={{ minWidth: "200px" }}>
                    <label htmlFor="sku">Sku(s) separado por virgula</label>
                    <textarea 
                      className="input mono" 
                      id="sku" 
                      value={lastSku}
                      onChange={(e) => setLastSku(e.target.value)}
                      style={{ height: "42px", minHeight: "42px", maxHeight: "150px", resize: "vertical", padding: "8px 12px" }}
                      required
                    />
                  </div>
                  <button type="submit" disabled={isLoading} className="btn btn-primary self-end" style={{ height: "42px" }}>
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
                    {isLoading ? "Consultando..." : "Consultar Item(ns)"}
                  </button>
                </form>
              </div>
            </section>

            {/* Error Message */}
            {error && (
              <div className="conn mt-4 !border-[#f5b76b] !bg-[#fffaf0] p-4 text-[#e8861a] font-mono text-sm leading-relaxed whitespace-pre-wrap">
                <strong className="text-red-700 block mb-1">Erro de Consulta:</strong>
                {error}
              </div>
            )}

            {/* Progress indicator */}
            {batchProgress && (
              <div className="conn mt-4 p-4 bg-[#fffaf0] border-[#f5b76b] text-[#e8861a] text-sm font-semibold flex items-center gap-2">
                <div className="pulse"></div>
                <span>{batchProgress}</span>
              </div>
            )}

            {/* Table layout of multiple queried products */}
            {skuResults.length > 0 && (
              <div className="card mt-6 overflow-hidden">
                <div className="border-b border-border p-4 bg-surface-2 flex items-center justify-between flex-wrap gap-2">
                  <h3 className="text-[13.5px] font-bold text-ink flex items-center gap-2">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>
                    Resumo de Listagens ({skuResults.length} SKU{skuResults.length > 1 ? 's' : ''})
                  </h3>
                  <button className="btn btn-ghost" style={{ padding: "6px 12px", fontSize: "12px" }} onClick={() => { displayToast('Exportando relatório geral...'); exportAllListingsToExcel(skuResults); }}>
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="m9 13 6 6"/><path d="m15 13-6 6"/></svg>
                    Exportar Tabela (XLS)
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-[13px]">
                    <thead>
                      <tr className="border-b border-border bg-surface text-muted text-xs font-semibold uppercase tracking-wider">
                        <th className="p-3">SKU</th>
                        <th className="p-3">Título</th>
                        <th className="p-3">ASIN</th>
                        <th className="p-3">Status do Anúncio</th>
                        <th className="p-3">Preço</th>
                        <th className="p-3">Estoque</th>
                        <th className="p-3" style={{ textAlign: "right", paddingRight: "16px" }}>Status Consulta</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {skuResults.map((r) => {
                        const isSelected = selectedSku === r.sku;
                        const itemData = r.data || {};
                        const summary = itemData.summaries?.[0] || {};
                        const attributes = itemData.attributes || {};
                        const qty = itemData.fulfillmentAvailability?.[0]?.quantity;
                        const title = summary.itemName || attributes.item_name?.[0]?.value || "-";
                        const asin = summary.asin || attributes.merchant_suggested_asin?.[0]?.value || "-";
                        const statusList = summary.status || [];
                        
                        const priceAttr = attributes.purchasable_offer?.[0];
                        const sellPrice = priceAttr?.our_price?.[0]?.schedule?.[0]?.value_with_tax || itemData.offers?.[0]?.price?.amount;
                        const priceFormatted = sellPrice !== undefined && sellPrice !== null ? `R$ ${sellPrice.toFixed(2).replace('.', ',')}` : "-";

                        return (
                          <tr 
                            key={r.sku}
                            onClick={() => setSelectedSku(r.sku)}
                            className={`hover:bg-surface-2 cursor-pointer transition-colors ${isSelected ? 'bg-accent/10 border-l-4 border-l-accent' : ''}`}
                          >
                            <td className="p-3 font-semibold font-mono text-ink select-all">{r.sku}</td>
                            <td className="p-3 max-w-[280px] truncate text-ink-2" title={title}>{title}</td>
                            <td className="p-3 font-mono text-muted select-all">{asin}</td>
                            <td className="p-3">
                              <div className="flex gap-1 flex-wrap">
                                {statusList.length > 0 ? statusList.map((st: string) => (
                                  <span key={st} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#e1f5fe] text-[#0288d1] uppercase">{st}</span>
                                )) : <span className="text-muted-2">-</span>}
                              </div>
                            </td>
                            <td className="p-3 font-mono text-ink font-medium">{priceFormatted}</td>
                            <td className="p-3 font-mono text-ink-2">{qty !== undefined ? qty : "-"}</td>
                            <td className="p-3" style={{ textAlign: "right", paddingRight: "16px" }}>
                              {r.status === "pending" && (
                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold bg-surface-2 text-muted-2">
                                  Pendente
                                </span>
                              )}
                              {r.status === "searching" && (
                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold bg-[#fff3e0] text-[#f57c00] animate-pulse">
                                  Buscando
                                </span>
                              )}
                              {r.status === "success" && (
                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold bg-green-50 text-green-700">
                                  Lido
                                </span>
                              )}
                              {r.status === "not_found" && (
                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold bg-red-10 text-red-600" title={r.errorMsg}>
                                  Não Encontrado
                                </span>
                              )}
                              {r.status === "error" && (
                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold bg-yellow-10 text-yellow-700" title={r.errorMsg}>
                                  Erro de Consulta
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Results selection detail */}
            {selectedResult && (
              <>
                <div className="results-head">
                  <h1>Resultados para <span>{selectedResult.sku}</span></h1>
                  <div className="results-actions">
                    <button className="btn btn-ghost" onClick={() => { displayToast('Exportando XLS...'); exportListingToExcel(selectedResult); }}>
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="m9 13 6 6"/><path d="m15 13-6 6"/></svg>
                      Exportar este SKU (XLS)
                    </button>
                    <button className="btn btn-dark" onClick={() => setIsDrawerOpen(true)}>
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m8 18 4-4-4-4"/><path d="m16 6-4 4 4 4" transform="translate(0,4)"/><path d="M10 4 6 20" /></svg>
                      Ver JSON Original
                    </button>
                  </div>
                </div>

                {/* Main grid */}
                <ListingResult data={selectedResult} onToast={displayToast} />
              </>
            )}
          </>
        ) : activeTab === "Pedidos" ? (
          <>
            {/* Connection & Filters Bar */}
            <section className="conn flex flex-col">
              {/* Credentials editing block */}
              <div className="conn-edit">
                <div className="conn-edit-grid">
                  <div className="field">
                    <label>Access Token (LWA)</label>
                    <input 
                      className="input mono" 
                      type="password" 
                      value={credentials.accessToken}
                      onChange={e => setCredentials({...credentials, accessToken: e.target.value})}
                      placeholder="Atza|IwEBI..."
                    />
                  </div>
                  <div className="field">
                    <label>Seller ID</label>
                    <input 
                      className="input mono" 
                      value={credentials.sellerId}
                      onChange={e => setCredentials({...credentials, sellerId: e.target.value})}
                      placeholder="A1ZR..."
                    />
                  </div>
                </div>
              </div>

              {/* Status and Filters row */}
              <div className="p-4 border-t border-border flex flex-col md:flex-row gap-4 items-stretch bg-surface-2">
                <div className="flex flex-wrap gap-4 flex-1">
                  <div className="field" style={{ minWidth: "160px" }}>
                    <label>Período</label>
                    <select 
                      className="input w-full" 
                      value={ordersDatePreset} 
                      onChange={e => setOrdersDatePreset(e.target.value as any)}
                    >
                      <option value="7">Últimos 7 dias</option>
                      <option value="30">Últimos 30 dias</option>
                      <option value="90">Últimos 90 dias</option>
                      <option value="custom">Data customizada</option>
                    </select>
                  </div>

                  {ordersDatePreset === "custom" && (
                    <div className="field" style={{ minWidth: "160px" }}>
                      <label>A partir de</label>
                      <input 
                        type="date" 
                        className="input w-full" 
                        value={ordersCustomDate} 
                        onChange={e => setOrdersCustomDate(e.target.value)} 
                      />
                    </div>
                  )}

                  <div className="field flex-1" style={{ minWidth: "250px" }}>
                    <label>Status do Pedido</label>
                    <div className="flex gap-1.5 flex-wrap items-center mt-1">
                      {ORDER_STATUS_OPTIONS.map(opt => {
                        const isChecked = ordersStatuses.includes(opt.id);
                        return (
                          <button
                            type="button"
                            key={opt.id}
                            onClick={() => {
                              if (isChecked) {
                                setOrdersStatuses(ordersStatuses.filter(s => s !== opt.id));
                              } else {
                                setOrdersStatuses([...ordersStatuses, opt.id]);
                              }
                            }}
                            className={`chip cursor-pointer text-xs font-semibold uppercase px-2 py-0.5 border ${
                              isChecked 
                                ? 'bg-[#e1f5fe] border-[#0288d1] text-[#0288d1] font-bold' 
                                : 'bg-surface border-border text-muted hover:text-ink'
                            }`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="flex items-end">
                  <button 
                    type="button" 
                    onClick={() => handleQueryOrders(false)} 
                    disabled={ordersLoading} 
                    className="btn btn-primary w-full md:w-auto flex items-center justify-center gap-2" 
                    style={{ height: "42px" }}
                  >
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
                    {ordersLoading && orders.length === 0 ? "Buscando..." : "Buscar Pedidos"}
                  </button>
                </div>
              </div>
            </section>

            {/* Error Message */}
            {ordersError && (
              <div className="conn mt-4 !border-[#f5b76b] !bg-[#fffaf0] p-4 text-[#e8861a] font-mono text-sm leading-relaxed whitespace-pre-wrap">
                <strong className="text-red-700 block mb-1">Erro de Consulta:</strong>
                {ordersError}
              </div>
            )}

            {/* Orders List Container */}
            {orders.length > 0 ? (
              <div className="card mt-6 overflow-hidden">
                <div className="border-b border-border p-4 bg-surface flex items-center justify-between">
                  <h3 className="text-[13.5px] font-bold text-ink flex items-center gap-2">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
                    Pedidos Encontrados ({orders.length})
                  </h3>
                  <span className="text-xs text-muted">Selecione um pedido para visualizar os itens</span>
                </div>
                
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-[13px]">
                    <thead>
                      <tr className="border-b border-border bg-surface-2 text-muted text-xs font-semibold uppercase tracking-wider">
                        <th className="p-3 w-10"></th>
                        <th className="p-3">ID do Pedido (Amazon)</th>
                        <th className="p-3">Data de Compra</th>
                        <th className="p-3">Status</th>
                        <th className="p-3">Canal de Envio</th>
                        <th className="p-3">Itens</th>
                        <th className="p-3">Total do Pedido</th>
                        <th className="p-3 text-right" style={{ paddingRight: "16px" }}>Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {orders.map((ord) => {
                        const isExpanded = !!expandedOrders[ord.AmazonOrderId];
                        const itemsInfo = ordersItemsCache[ord.AmazonOrderId];
                        
                        const purchaseDateObj = new Date(ord.PurchaseDate);
                        const formattedDate = isNaN(purchaseDateObj.getTime())
                          ? ord.PurchaseDate
                          : purchaseDateObj.toLocaleDateString("pt-BR", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit"
                            });

                        // Badges for status
                        let statusColorClass = "bg-gray-10 text-gray-700";
                        if (ord.OrderStatus === "Pending") statusColorClass = "bg-[#fff9c4] text-[#f57f17] border-[#fbc02d]";
                        if (ord.OrderStatus === "Unshipped") statusColorClass = "bg-[#e3f2fd] text-[#0d47a1] border-[#90caf9]";
                        if (ord.OrderStatus === "PartiallyShipped") statusColorClass = "bg-[#f3e5f5] text-[#4a148c] border-[#ce93d8]";
                        if (ord.OrderStatus === "Shipped") statusColorClass = "bg-[#e8f5e9] text-[#1b5e20] border-[#a5d6a7]";
                        if (ord.OrderStatus === "Canceled") statusColorClass = "bg-[#ffebee] text-[#b71c1c] border-[#ef9a9a]";

                        return (
                          <span key={ord.AmazonOrderId} className="contents">
                            <tr 
                              onClick={() => handleToggleOrderItems(ord.AmazonOrderId)}
                              className={`hover:bg-surface-2 cursor-pointer transition-colors ${isExpanded ? 'bg-accent/5' : ''}`}
                            >
                              <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                                <button 
                                  onClick={() => handleToggleOrderItems(ord.AmazonOrderId)}
                                  className="text-muted hover:text-ink w-6 h-6 flex items-center justify-center rounded-full hover:bg-surface-3 transition-colors"
                                >
                                  <svg 
                                    viewBox="0 0 24 24" 
                                    width="16" 
                                    height="16" 
                                    fill="none" 
                                    stroke="currentColor" 
                                    strokeWidth="2.5" 
                                    className={`transform transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                                  >
                                    <path d="m9 18 6-6-6-6"/>
                                  </svg>
                                </button>
                              </td>
                              <td className="p-3 font-semibold font-mono text-ink select-all">{ord.AmazonOrderId}</td>
                              <td className="p-3 text-ink-2">{formattedDate}</td>
                              <td className="p-3">
                                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border uppercase ${statusColorClass}`}>
                                  {ord.OrderStatus === "Pending" && "Pendente"}
                                  {ord.OrderStatus === "Unshipped" && "Não Enviado"}
                                  {ord.OrderStatus === "PartiallyShipped" && "Enviado Parcialmente"}
                                  {ord.OrderStatus === "Shipped" && "Enviado"}
                                  {ord.OrderStatus === "Canceled" && "Cancelado"}
                                  {ord.OrderStatus !== "Pending" && ord.OrderStatus !== "Unshipped" && ord.OrderStatus !== "PartiallyShipped" && ord.OrderStatus !== "Shipped" && ord.OrderStatus !== "Canceled" && ord.OrderStatus}
                                </span>
                              </td>
                              <td className="p-3">
                                {ord.FulfillmentChannel === "AFN" ? (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#efebe9] text-[#5d4037] uppercase">FBA / AFN</span>
                                ) : ord.FulfillmentChannel === "MFN" ? (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#eceff1] text-[#37474f] uppercase">FBM / MFN</span>
                                ) : (
                                  <span className="text-muted">-</span>
                                )}
                              </td>
                              <td className="p-3 text-ink-2">
                                <span className="font-medium text-ink">{ord.NumberOfItemsShipped || 0}</span> enviado{ord.NumberOfItemsShipped !== 1 ? 's' : ''} / <span className="font-medium text-ink">{ord.NumberOfItemsUnshipped || 0}</span> pendente{ord.NumberOfItemsUnshipped !== 1 ? 's' : ''}
                              </td>
                              <td className="p-3 font-mono font-bold text-ink">{formatPrice(ord.OrderTotal)}</td>
                              <td className="p-3 text-right" style={{ paddingRight: "16px" }} onClick={(e) => e.stopPropagation()}>
                                <button 
                                  className="btn btn-ghost font-semibold text-accent" 
                                  style={{ padding: "4px 8px", fontSize: "11px" }}
                                  onClick={() => openJsonDrawer(ord, `Pedido: ${ord.AmazonOrderId}`)}
                                >
                                  Ver JSON
                                </button>
                              </td>
                            </tr>

                            {/* Expanded items section */}
                            {isExpanded && (
                              <tr>
                                <td colSpan={8} className="p-0 bg-surface">
                                  <div className="border-l-4 border-l-accent bg-surface-2 p-4 m-3 rounded shadow-sm border border-border">
                                    <h4 className="text-xs font-bold text-ink uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                                      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>
                                      Itens do Pedido ({ord.AmazonOrderId})
                                    </h4>

                                    {itemsInfo?.loading && (
                                      <div className="py-6 flex items-center justify-center gap-2 text-muted text-xs font-semibold">
                                        <div className="spinner animate-spin"></div>
                                        <span>Carregando itens da Amazon SP-API...</span>
                                      </div>
                                    )}

                                    {itemsInfo?.error && (
                                      <div className="p-3 bg-red-10 border border-red-200 text-red-700 text-xs rounded font-mono">
                                        <strong>Erro ao carregar itens:</strong> {itemsInfo.error}
                                      </div>
                                    )}

                                    {itemsInfo && !itemsInfo.loading && !itemsInfo.error && (
                                      itemsInfo.items && itemsInfo.items.length > 0 ? (
                                        <div className="overflow-hidden rounded border border-border bg-surface">
                                          <table className="w-full text-left text-xs border-collapse">
                                            <thead>
                                              <tr className="border-b border-border bg-surface-2 text-muted font-bold uppercase tracking-wider text-[10px]">
                                                <th className="p-2.5 pl-3">SKU</th>
                                                <th className="p-2.5">ASIN</th>
                                                <th className="p-2.5">Título do Produto</th>
                                                <th className="p-2.5 text-center">Quantidade Pedida</th>
                                                <th className="p-2.5 text-right pr-4">Preço Unitário</th>
                                              </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border">
                                              {itemsInfo.items.map((it) => (
                                                <tr key={it.OrderItemId} className="hover:bg-surface-2">
                                                  <td className="p-2.5 pl-3 font-mono font-medium text-ink select-all">{it.SellerSKU || "-"}</td>
                                                  <td className="p-2.5 font-mono text-muted select-all">{it.ASIN}</td>
                                                  <td className="p-2.5 text-ink-2 max-w-[350px] truncate" title={it.Title}>{it.Title || "Nenhum título retornado"}</td>
                                                  <td className="p-2.5 text-center text-ink font-semibold">{it.QuantityOrdered}</td>
                                                  <td className="p-2.5 text-right font-mono text-ink-2 pr-4">{formatPrice(it.ItemPrice)}</td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>
                                      ) : (
                                        <div className="py-4 text-center text-xs text-muted">
                                          Nenhum item retornado para este pedido.
                                        </div>
                                      )
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </span>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {ordersNextToken && (
                  <div className="p-4 border-t border-border bg-surface-2 flex justify-center">
                    <button 
                      type="button" 
                      onClick={() => handleQueryOrders(true)} 
                      disabled={ordersLoading} 
                      className="btn btn-ghost px-6 py-2 text-sm flex items-center gap-2"
                    >
                      {ordersLoading ? (
                        <>
                          <div className="spinner animate-spin"></div>
                          Carregando mais...
                        </>
                      ) : (
                        <>
                          Carregar Mais Pedidos
                          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m6 9 6 6 6-6"/></svg>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              !ordersLoading && (
                <div className="card mt-6 p-12 text-center flex flex-col items-center justify-center">
                  <div className="ok-ico !bg-surface-2 !text-muted">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
                  </div>
                  <h2 className="text-[14.5px] font-bold text-ink transition-colors">Nenhum pedido encontrado no período</h2>
                  <p className="text-muted text-[13px] mt-1 max-w-md">Para carregar dados de vendas, configure as credenciais da SP-API, selecione os filtros desejados e clique em "Buscar Pedidos".</p>
                </div>
              )
            )}

            {/* General state skeleton loading during the first query */}
            {ordersLoading && orders.length === 0 && (
              <div className="card mt-6 p-12 text-center flex flex-col items-center justify-center gap-3">
                <span className="relative flex h-6 w-6">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-6 w-6 bg-accent"></span>
                </span>
                <h2 className="text-[14px] font-bold text-ink">Buscando pedidos...</h2>
                <p className="text-xs text-muted">Aguardando resposta da Orders API v0 da Amazon SP-API</p>
              </div>
            )}
          </>
        ) : (
          <div className="card mt-6 p-10 text-center flex flex-col items-center justify-center">
             <div className="ok-ico !bg-surface-2 !text-muted"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg></div>
             <h2 className="text-[14.5px] font-bold text-ink">Aba em desenvolvimento</h2>
             <p className="text-muted text-[13px] mt-1">Utilize a aba "Listings / Itens" ou "Pedidos" por enquanto.</p>
          </div>
        )}
      </div>

      {isDrawerOpen && drawerData && (
        <JsonDrawer 
          isOpen={isDrawerOpen} 
          onClose={() => { setIsDrawerOpen(false); setDrawerData(null); }} 
          data={drawerData} 
          title={drawerTitle}
          onToast={displayToast} 
        />
      )}

      {/* Toast */}
      <div className={`toast ${showToast ? 'show' : ''}`}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
        <span>{toastMsg}</span>
      </div>
    </>
  );
}
