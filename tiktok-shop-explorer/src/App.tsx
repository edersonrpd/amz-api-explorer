import { useEffect, useState, type ReactNode } from "react";
import { getAuthorizedShops, searchProducts, searchOrders } from "./services/tiktokService";
import { useLocalStorage } from "./hooks/useLocalStorage";
import { TikTokCredentials, ProductRow, TikTokProduct, TikTokOrder, FeeConfig } from "./types";
import { ORDER_STATUS_OPTIONS, ORDER_STATUS_PT, PRODUCT_STATUS_OPTIONS, DEFAULT_FEE_CONFIG } from "./constants";
import { JsonDrawer } from "./components/JsonDrawer";
import { OrderDetailsModal } from "./components/OrderDetailsModal";
import { exportProductsToExcel, exportProductDetailToExcel, exportCatalogToExcel, exportOrdersToExcel } from "./lib/export";
import { fmtEpoch, fmtMoney } from "./lib/utils";

const TABS = ["Produtos", "Pedidos", "Catalogo Completo"];

const EMPTY_CREDS: TikTokCredentials = { accessToken: "", shopCipher: "", shopId: "", shopName: "" };

export default function App() {
  const [activeTab, setActiveTab] = useState("Produtos");
  const [creds, setCreds] = useLocalStorage<TikTokCredentials>("ttshop_creds", EMPTY_CREDS);
  const [tokenInput, setTokenInput] = useState(creds.accessToken);

  const [connecting, setConnecting] = useState(false);
  const [connError, setConnError] = useState<string | null>(null);

  const [feeConfig, setFeeConfig] = useLocalStorage<FeeConfig>("ttshop_fees", DEFAULT_FEE_CONFIG);

  // Drawer JSON
  const [drawerData, setDrawerData] = useState<any | null>(null);
  const [drawerTitle, setDrawerTitle] = useState("");

  // Toast
  const [toastMsg, setToastMsg] = useState("");
  const [showToast, setShowToast] = useState(false);

  // ---- Produtos ----
  const [skuInput, setSkuInput] = useState("");
  const [productStatus, setProductStatus] = useState("");
  const [productRows, setProductRows] = useState<ProductRow[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState<string | null>(null);

  // ---- Pedidos ----
  const [orderStatus, setOrderStatus] = useState("");
  const [datePreset, setDatePreset] = useState<"7" | "30" | "90">("30");
  const [orders, setOrders] = useState<TikTokOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [orderPageToken, setOrderPageToken] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<TikTokOrder | null>(null);

  // ---- Catalogo ----
  const [catalog, setCatalog] = useState<TikTokProduct[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogProgress, setCatalogProgress] = useState<string | null>(null);

  const isConnected = !!creds.accessToken && !!creds.shopCipher;

  useEffect(() => {
    if (showToast) {
      const t = setTimeout(() => setShowToast(false), 2200);
      return () => clearTimeout(t);
    }
  }, [showToast]);

  const toast = (msg: string) => {
    setToastMsg(msg);
    setShowToast(true);
  };

  const openJson = (data: any, title: string) => {
    setDrawerData(data);
    setDrawerTitle(title);
  };

  const parseList = (input: string): string[] =>
    Array.from(new Set(input.split(/[\n,\s]+/).map((s) => s.trim()).filter(Boolean)));

  // ---- Conexao: token -> lojas autorizadas -> seleciona loja BR ----
  const handleConnect = async () => {
    const token = tokenInput.trim();
    if (!token) return;
    setConnecting(true);
    setConnError(null);
    try {
      const { shops } = await getAuthorizedShops(token);
      if (!shops || shops.length === 0) {
        throw new Error("Nenhuma loja autorizada para este token.");
      }
      const br = shops.find((s) => (s.region || "").toUpperCase() === "BR") || shops[0];
      setCreds({ accessToken: token, shopCipher: br.cipher, shopId: br.id, shopName: br.name });
      toast(`Conectado a loja ${br.name}`);
    } catch (err: any) {
      console.error(err);
      setConnError(err.message || "Falha ao conectar.");
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = () => {
    setCreds(EMPTY_CREDS);
    setTokenInput("");
    setProductRows([]);
    setOrders([]);
    setCatalog([]);
    toast("Desconectado");
  };

  // ---- Produtos ----
  const handleSearchProducts = async () => {
    if (!isConnected) return;
    setProductsLoading(true);
    setProductsError(null);
    const skus = parseList(skuInput);
    try {
      const resp = await searchProducts(creds.accessToken, creds.shopCipher, {
        sellerSkus: skus,
        status: productStatus || undefined,
        pageSize: 50,
      });
      const products = resp.products || [];

      let rows: ProductRow[];
      if (skus.length > 0) {
        rows = skus.map((sku) => {
          const match = products.find((p) => p.skus?.some((s) => s.seller_sku === sku));
          return match
            ? { productId: match.id, sellerSku: sku, status: "success", data: match }
            : { productId: "", sellerSku: sku, status: "not_found", errorMsg: "SKU nao encontrado na loja." };
        });
      } else {
        rows = products.map((p) => ({
          productId: p.id,
          sellerSku: p.skus?.[0]?.seller_sku || "—",
          status: "success",
          data: p,
        }));
      }
      setProductRows(rows);
      const ok = rows.filter((r) => r.status === "success").length;
      toast(`${ok} produto(s) carregado(s).`);
    } catch (err: any) {
      console.error(err);
      setProductsError(err.message || "Erro ao buscar produtos.");
    } finally {
      setProductsLoading(false);
    }
  };

  // ---- Pedidos ----
  const handleSearchOrders = async (loadMore = false) => {
    if (!isConnected) return;
    setOrdersLoading(true);
    setOrdersError(null);
    const days = parseInt(datePreset);
    const createTimeGe = Math.floor((Date.now() - days * 86400000) / 1000);
    try {
      const resp = await searchOrders(creds.accessToken, creds.shopCipher, {
        orderStatus: orderStatus || undefined,
        createTimeGe,
        pageSize: 50,
        pageToken: loadMore ? orderPageToken || undefined : undefined,
      });
      const list = resp.orders || [];
      setOrders((prev) => (loadMore ? [...prev, ...list] : list));
      setOrderPageToken(resp.next_page_token || null);
      toast(`${list.length} pedido(s) ${loadMore ? "adicionais " : ""}carregado(s).`);
    } catch (err: any) {
      console.error(err);
      setOrdersError(err.message || "Erro ao buscar pedidos.");
    } finally {
      setOrdersLoading(false);
    }
  };

  // ---- Catalogo completo (paginacao ate o fim) ----
  const handleExtractCatalog = async () => {
    if (!isConnected) return;
    setCatalogLoading(true);
    setCatalogError(null);
    setCatalog([]);
    setCatalogProgress("Iniciando extracao...");
    try {
      let all: TikTokProduct[] = [];
      let pageToken: string | undefined;
      let page = 0;
      do {
        page++;
        setCatalogProgress(`Carregando pagina ${page}...`);
        const resp = await searchProducts(creds.accessToken, creds.shopCipher, {
          pageSize: 100,
          pageToken,
        });
        all = [...all, ...(resp.products || [])];
        pageToken = resp.next_page_token || undefined;
        setCatalog([...all]);
        if (pageToken) await new Promise((r) => setTimeout(r, 400));
      } while (pageToken && page < 200);
      toast(`${all.length} produto(s) extraido(s).`);
    } catch (err: any) {
      console.error(err);
      setCatalogError(err.message || "Erro ao extrair catalogo.");
    } finally {
      setCatalogProgress(null);
      setCatalogLoading(false);
    }
  };

  const productPrice = (p?: TikTokProduct) => {
    const sku = p?.skus?.[0];
    return sku?.price?.sale_price ? fmtMoney(sku.price.sale_price, sku.price.currency || "BRL") : "—";
  };
  const productStock = (p?: TikTokProduct) => {
    if (!p?.skus?.length) return "—";
    return p.skus.reduce((acc, s) => acc + (s.inventory || []).reduce((a, i) => a + (i.quantity || 0), 0), 0);
  };

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 3c.3 2.1 1.6 3.7 3.7 4v2.6c-1.3 0-2.6-.4-3.7-1.1v5.9a5.4 5.4 0 1 1-5.4-5.4c.3 0 .6 0 .9.1v2.7a2.7 2.7 0 1 0 1.9 2.6V3H16Z"/></svg>
          </div>
          <span className="brand-name">TikTok Shop <b>API</b> Explorer</span>
        </div>
        <span className="topbar-right">PARTNER API · BR</span>
      </header>

      <div className="shell">
        {/* Connection bar */}
        <section className="conn flex flex-col">
          <div className="conn-edit">
            <div className="conn-edit-grid">
              <div className="field">
                <label>Access Token (TikTok Shop)</label>
                <input
                  className="input mono"
                  type="password"
                  placeholder="ROW_..."
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                />
              </div>
              <div className="field" style={{ justifyContent: "flex-end" }}>
                {isConnected ? (
                  <button className="btn btn-ghost" onClick={handleDisconnect}>Desconectar</button>
                ) : (
                  <button className="btn btn-primary" disabled={connecting || !tokenInput.trim()} onClick={handleConnect}>
                    {connecting ? "Conectando..." : "Conectar"}
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="conn-row">
            <div className="conn-status">
              <span className={`pulse ${isConnected ? "" : "off"}`}></span>
              <div>
                <div className="lbl">{isConnected ? "Conectado" : "Desconectado"}</div>
                <div className="sub">{isConnected ? "Token e loja ativos" : "Cole o token e clique em Conectar"}</div>
              </div>
            </div>
            <div className="chips">
              {isConnected && (
                <>
                  <span className="chip"><span className="k">Loja</span><span className="v">{creds.shopName || "—"}</span></span>
                  <span className="chip"><span className="k">Cipher</span><span className="v">{creds.shopCipher.slice(0, 8)}…</span></span>
                  <span className="chip"><span className="flag"></span><span className="v">Brasil (BR)</span></span>
                </>
              )}
            </div>
          </div>
        </section>

        {connError && <ErrorBox title="Erro de conexao">{connError}</ErrorBox>}

        {/* Tabs */}
        <nav className="tabs mt-2">
          {TABS.map((tab) => (
            <button key={tab} className={`tab ${activeTab === tab ? "active" : ""}`} onClick={() => setActiveTab(tab)}>
              {tab}
            </button>
          ))}
        </nav>

        {!isConnected && (
          <div className="card mt-6 p-12 text-center">
            <div className="ok-ico !bg-surface-2 !text-muted">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            </div>
            <h2 className="text-[14.5px] font-bold text-ink">Conecte-se para comecar</h2>
            <p className="text-muted text-[13px] mt-1 max-w-md mx-auto">Cole o access token da sua loja TikTok Shop e clique em "Conectar". A loja BR e selecionada automaticamente.</p>
          </div>
        )}

        {/* ---- Aba Produtos ---- */}
        {isConnected && activeTab === "Produtos" && (
          <>
            <section className="conn flex flex-col mt-6">
              <div className="flex flex-wrap gap-4 items-end p-4">
                <div className="field flex-1" style={{ minWidth: 220 }}>
                  <label>Seller SKU(s) — separados por virgula (vazio = listar)</label>
                  <textarea
                    className="input mono"
                    style={{ height: 42, minHeight: 42, maxHeight: 150, resize: "vertical", padding: "8px 12px" }}
                    value={skuInput}
                    onChange={(e) => setSkuInput(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Status</label>
                  <select className="input" value={productStatus} onChange={(e) => setProductStatus(e.target.value)}>
                    <option value="">Todos</option>
                    {PRODUCT_STATUS_OPTIONS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </div>
                <button className="btn btn-primary" disabled={productsLoading} onClick={handleSearchProducts}>
                  {productsLoading ? "Buscando..." : "Buscar Produtos"}
                </button>
              </div>
            </section>

            {productsError && <ErrorBox title="Erro de consulta">{productsError}</ErrorBox>}

            {productRows.length > 0 && (
              <div className="card mt-6 overflow-hidden">
                <div className="card-head">
                  <h2>Produtos ({productRows.length})</h2>
                  <button className="btn btn-ghost ml-auto" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => { exportProductsToExcel(productRows); toast("Exportando..."); }}>
                    Exportar (XLS)
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="orders">
                    <thead>
                      <tr>
                        <th>Seller SKU</th><th>Titulo</th><th>Product ID</th><th>Status</th><th>Preco</th><th>Estoque</th><th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {productRows.map((r) => (
                        <tr key={r.sellerSku + r.productId} className="row" onClick={() => r.data && openJson(r.data, `Produto · ${r.sellerSku}`)}>
                          <td className="font-mono font-semibold">{r.sellerSku}</td>
                          <td className="text-ink-2 max-w-[260px] truncate" title={r.data?.title}>{r.data?.title || "—"}</td>
                          <td className="font-mono text-muted text-[12px]">{r.data?.id || "—"}</td>
                          <td>{r.status === "not_found" ? <span className="badge gray">NAO ENCONTRADO</span> : r.status === "error" ? <span className="badge pink">ERRO</span> : <span className="badge green">{r.data?.status || "OK"}</span>}</td>
                          <td className="ototal">{productPrice(r.data)}</td>
                          <td className="text-ink-2">{productStock(r.data)}</td>
                          <td style={{ textAlign: "right" }}>
                            {r.data && (
                              <button className="btn btn-ghost" style={{ padding: "4px 10px", fontSize: 11 }} onClick={(e) => { e.stopPropagation(); exportProductDetailToExcel(r.data!); }}>XLS</button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {/* ---- Aba Pedidos ---- */}
        {isConnected && activeTab === "Pedidos" && (
          <>
            <section className="conn flex flex-col mt-6">
              <div className="flex flex-wrap gap-4 items-end p-4">
                <div className="field">
                  <label>Periodo</label>
                  <select className="input" value={datePreset} onChange={(e) => setDatePreset(e.target.value as any)}>
                    <option value="7">Ultimos 7 dias</option>
                    <option value="30">Ultimos 30 dias</option>
                    <option value="90">Ultimos 90 dias</option>
                  </select>
                </div>
                <div className="field">
                  <label>Status</label>
                  <div className="status-pills">
                    {ORDER_STATUS_OPTIONS.map((opt) => (
                      <button key={opt.id} type="button" className={`spill ${orderStatus === opt.id ? "on" : ""}`} onClick={() => setOrderStatus(orderStatus === opt.id ? "" : opt.id)}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex-1" />
                <button className="btn btn-primary" disabled={ordersLoading} onClick={() => handleSearchOrders(false)}>
                  {ordersLoading && orders.length === 0 ? "Buscando..." : "Buscar Pedidos"}
                </button>
              </div>
            </section>

            {/* Config de taxas */}
            <div className="card mt-4 p-4 flex flex-wrap gap-4 items-end">
              <div className="field"><label>Comissao (%)</label><input className="input" type="number" style={{ width: 110 }} value={feeConfig.commissionRate} onChange={(e) => setFeeConfig({ ...feeConfig, commissionRate: parseFloat(e.target.value) || 0 })} /></div>
              <div className="field"><label>Taxa de transacao (%)</label><input className="input" type="number" style={{ width: 130 }} value={feeConfig.transactionRate} onChange={(e) => setFeeConfig({ ...feeConfig, transactionRate: parseFloat(e.target.value) || 0 })} /></div>
              <span className="text-[11.5px] text-muted">Usado na estimativa de taxas dentro do detalhe do pedido.</span>
            </div>

            {ordersError && <ErrorBox title="Erro de consulta">{ordersError}</ErrorBox>}

            {orders.length > 0 && (
              <section className="card mt-6">
                <div className="card-head">
                  <h2>Pedidos ({orders.length})</h2>
                  <span className="hint">Clique para ver detalhes</span>
                  <button className="btn btn-ghost ml-3" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => { exportOrdersToExcel(orders); toast("Exportando..."); }}>Exportar (XLS)</button>
                </div>
                <div className="overflow-x-auto">
                  <table className="orders">
                    <thead><tr><th>Order ID</th><th>Criado em</th><th>Status</th><th>Itens</th><th style={{ textAlign: "right" }}>Total</th></tr></thead>
                    <tbody>
                      {orders.map((o) => {
                        const st = o.status || "";
                        const cls = st === "CANCELLED" || st === "UNPAID" ? "gray" : st === "COMPLETED" || st === "DELIVERED" ? "green" : "blue";
                        return (
                          <tr key={o.id} className="row" onClick={() => setSelectedOrder(o)}>
                            <td><span className="oid">{o.id}</span></td>
                            <td className="odate">{fmtEpoch(o.create_time)}</td>
                            <td><span className={`badge ${cls}`}>{ORDER_STATUS_PT[st] || st || "—"}</span></td>
                            <td className="text-ink-2">{o.line_items?.length ?? 0}</td>
                            <td className="ototal" style={{ textAlign: "right" }}>{fmtMoney(o.payment?.total_amount, o.payment?.currency || "BRL")}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {orderPageToken && (
                  <div className="p-4 border-t border-border flex justify-center">
                    <button className="btn btn-ghost" disabled={ordersLoading} onClick={() => handleSearchOrders(true)}>
                      {ordersLoading ? "Carregando..." : "Carregar mais"}
                    </button>
                  </div>
                )}
              </section>
            )}
          </>
        )}

        {/* ---- Aba Catalogo ---- */}
        {isConnected && activeTab === "Catalogo Completo" && (
          <>
            <section className="conn flex flex-col mt-6">
              <div className="flex flex-wrap gap-4 items-end p-4">
                <div>
                  <h2 className="text-[14px] font-bold text-ink">Extrair todo o catalogo</h2>
                  <p className="text-[12.5px] text-muted">Percorre toda a paginacao da Product API e monta a lista completa de produtos da loja.</p>
                </div>
                <div className="flex-1" />
                <button className="btn btn-primary" disabled={catalogLoading} onClick={handleExtractCatalog}>
                  {catalogLoading ? "Extraindo..." : "Extrair catalogo"}
                </button>
              </div>
            </section>

            {catalogProgress && (
              <div className="card mt-4 p-4 flex items-center gap-2 text-[13px] font-semibold text-accent-strong">
                <span className="pulse" /> {catalogProgress}
              </div>
            )}
            {catalogError && <ErrorBox title="Erro na extracao">{catalogError}</ErrorBox>}

            {catalog.length > 0 && (
              <div className="card mt-6 overflow-hidden">
                <div className="card-head">
                  <h2>Catalogo ({catalog.length})</h2>
                  <button className="btn btn-ghost ml-auto" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => { exportCatalogToExcel(catalog); toast("Exportando..."); }}>Exportar tudo (XLS)</button>
                </div>
                <div className="overflow-x-auto">
                  <table className="orders">
                    <thead><tr><th>Product ID</th><th>Titulo</th><th>Status</th><th>Seller SKU</th><th>Preco</th><th>Estoque</th></tr></thead>
                    <tbody>
                      {catalog.slice(0, 200).map((p) => (
                        <tr key={p.id} className="row" onClick={() => openJson(p, `Produto · ${p.id}`)}>
                          <td className="font-mono text-[12px]">{p.id}</td>
                          <td className="text-ink-2 max-w-[280px] truncate" title={p.title}>{p.title || "—"}</td>
                          <td><span className="badge green">{p.status || "—"}</span></td>
                          <td className="font-mono text-[12px]">{p.skus?.[0]?.seller_sku || "—"}</td>
                          <td className="ototal">{productPrice(p)}</td>
                          <td className="text-ink-2">{productStock(p)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {catalog.length > 200 && (
                  <div className="p-3 border-t border-border text-center text-xs text-muted">
                    Exibindo os primeiros 200 de {catalog.length}. Use "Exportar tudo (XLS)" para a lista completa.
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {drawerData && (
        <JsonDrawer isOpen={!!drawerData} onClose={() => setDrawerData(null)} data={drawerData} title={drawerTitle} onToast={toast} />
      )}

      {selectedOrder && (
        <OrderDetailsModal order={selectedOrder} feeConfig={feeConfig} onClose={() => setSelectedOrder(null)} onViewJson={(d, t) => { setSelectedOrder(null); openJson(d, t); }} />
      )}

      <div className={`toast ${showToast ? "show" : ""}`}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
        <span>{toastMsg}</span>
      </div>
    </>
  );
}

function ErrorBox({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="conn mt-4 !border-[#f6a5b5] !bg-[#fff5f7] p-4 text-[#c81e42] font-mono text-sm leading-relaxed whitespace-pre-wrap">
      <strong className="block mb-1">{title}:</strong>
      {children}
    </div>
  );
}
