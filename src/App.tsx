import { useState, FormEvent, useEffect } from "react";
import { getListingsItem, searchListingsItems } from "./services/amazonService";
import { useLocalStorage } from "./hooks/useLocalStorage";
import { AmazonCredentials, AmazonListing, SkuResult } from "./types";
import { MARKETPLACES } from "./constants";
import { ListingResult } from "./components/ListingResult";
import { JsonDrawer } from "./components/JsonDrawer";
import { exportListingToExcel, exportAllListingsToExcel } from "./lib/export";

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
        ) : (
          <div className="card mt-6 p-10 text-center flex flex-col items-center justify-center">
             <div className="ok-ico !bg-surface-2 !text-muted"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg></div>
             <h2 className="text-[14.5px] font-bold text-ink">Aba em desenvolvimento</h2>
             <p className="text-muted text-[13px] mt-1">Utilize a aba "Listings / Itens" por enquanto.</p>
          </div>
        )}
      </div>

      {selectedResult && <JsonDrawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} data={selectedResult} onToast={displayToast} />}

      {/* Toast */}
      <div className={`toast ${showToast ? 'show' : ''}`}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
        <span>{toastMsg}</span>
      </div>
    </>
  );
}
