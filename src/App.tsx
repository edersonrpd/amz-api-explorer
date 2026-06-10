import { useState, FormEvent, useEffect } from "react";
import { getListingsItem } from "./services/amazonService";
import { useLocalStorage } from "./hooks/useLocalStorage";
import { AmazonCredentials, AmazonListing } from "./types";
import { MARKETPLACES } from "./constants";
import { ListingResult } from "./components/ListingResult";
import { JsonDrawer } from "./components/JsonDrawer";

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
  const [result, setResult] = useState<AmazonListing | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const [toastMsg, setToastMsg] = useState("");
  const [showToast, setShowToast] = useState(false);

  const TABS = ["Listings / Itens", "Pedidos", "Estoque FBA", "Catálogo"];

  const handleConsult = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    if (!lastSku) return;

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      // Force marketplace to Brasil
      const fixedCreds = { ...credentials, marketplaceId: "A2Q3Y263D00KWC" };
      const data = await getListingsItem(fixedCreds, { sku: lastSku });
      setResult(data);
      displayToast(`Item ${lastSku} carregado`);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Erro desconhecido ao consultar SP-API.");
    } finally {
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
                <form className="conn-query" onSubmit={handleConsult}>
                  <div className="field" style={{minWidth: "180px"}}>
                    <label htmlFor="sku">SKU do Produto</label>
                    <input 
                      className="input mono" 
                      id="sku" 
                      value={lastSku}
                      onChange={(e) => setLastSku(e.target.value)}
                      placeholder="SKU"
                      required
                    />
                  </div>
                  <button type="submit" disabled={isLoading} className="btn btn-primary">
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
                    {isLoading ? "Consultando..." : "Consultar Item"}
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

            {/* Results */}
            {result && !isLoading && (
              <>
                <div className="results-head">
                  <h1>Resultados para <span>{result.sku}</span></h1>
                  <div className="results-actions">
                    <button className="btn btn-ghost" onClick={() => displayToast('Exportando XLS...')}>
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="m9 13 6 6"/><path d="m15 13-6 6"/></svg>
                      Exportar XLS
                    </button>
                    <button className="btn btn-dark" onClick={() => setIsDrawerOpen(true)}>
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m8 18 4-4-4-4"/><path d="m16 6-4 4 4 4" transform="translate(0,4)"/><path d="M10 4 6 20" /></svg>
                      Ver JSON Original
                    </button>
                  </div>
                </div>

                {/* Main grid */}
                <ListingResult data={result} onToast={displayToast} />
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

      {result && <JsonDrawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} data={result} onToast={displayToast} />}

      {/* Toast */}
      <div className={`toast ${showToast ? 'show' : ''}`}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
        <span>{toastMsg}</span>
      </div>
    </>
  );
}
