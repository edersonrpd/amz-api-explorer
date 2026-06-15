import { useState, FormEvent, useEffect } from "react";
import { getListingsItem, searchListingsItems, getOrders, getOrderItems, getOrderFinances, getFeesEstimateForSku, createReport, getReport, getReportDocument, downloadReportDocument } from "./services/amazonService";
import { useLocalStorage } from "./hooks/useLocalStorage";
import { AmazonCredentials, AmazonListing, SkuResult, AmazonOrder, OrderItem, OrderFinancesResponse, OrderItemFeeEstimate } from "./types";
import { MARKETPLACES } from "./constants";
import { ListingResult } from "./components/ListingResult";
import { JsonDrawer } from "./components/JsonDrawer";
import { OrderDetailsModal } from "./components/OrderDetailsModal";
import { exportListingToExcel, exportAllListingsToExcel, exportReportListingsToExcel } from "./lib/export";

const ORDER_STATUS_OPTIONS = [
  { id: "Pending", label: "Pendente" },
  { id: "Unshipped", label: "Não Enviado" },
  { id: "PartiallyShipped", label: "Parcialmente Enviado" },
  { id: "Shipped", label: "Enviado" },
  { id: "Canceled", label: "Cancelado" }
];

export default function App() {
  const [activeTab, setActiveTab] = useState("Listings / Itens");
  
  const [credentials, setCredentials] = useState<AmazonCredentials>({
    accessToken: "",
    sellerId: "",
    marketplaceId: MARKETPLACES[0].id,
  });
  const [lastSku, setLastSku] = useState<string>("");

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
  const [ordersCustomDate, setOrdersCustomDate] = useState<string>("");
  const [ordersStatuses, setOrdersStatuses] = useState<string[]>(["Shipped"]);
  const [ordersSearchMode, setOrdersSearchMode] = useState<"period" | "ids">("period");
  const [ordersSearchIds, setOrdersSearchIds] = useState<string>("");
  const [ordersNotFoundIds, setOrdersNotFoundIds] = useState<string[]>([]);
  const [expandedOrders, setExpandedOrders] = useState<Record<string, boolean>>({});
  const [ordersItemsCache, setOrdersItemsCache] = useState<Record<string, { loading: boolean; items?: OrderItem[]; error?: string }>>({});
  const [ordersFinancesCache, setOrdersFinancesCache] = useState<Record<string, { loading: boolean; finances?: OrderFinancesResponse; error?: string }>>({});
  const [ordersFeesEstimateCache, setOrdersFeesEstimateCache] = useState<Record<string, { loading: boolean; estimates?: OrderItemFeeEstimate[]; error?: string }>>({});
  const [selectedOrderForModal, setSelectedOrderForModal] = useState<AmazonOrder | null>(null);

  // Reports / Extração de todos os anúncios
  const [reportType, setReportType] = useState<string>("GET_MERCHANT_LISTINGS_ALL_DATA");
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportProgress, setReportProgress] = useState<string | null>(null);
  const [reportRows, setReportRows] = useState<Record<string, string>[]>([]);

  const [toastMsg, setToastMsg] = useState("");
  const [showToast, setShowToast] = useState(false);

  const TABS = ["Listings / Itens", "Pedidos", "Todos os Anúncios"];

  const parseSkus = (input: string): string[] => {
    if (!input) return [];
    // Split on commas, line breaks, or spaces, and clean up empty items
    const rawArray = input.split(/[\n,\s]+/);
    return Array.from(new Set(rawArray.map(s => s.trim()).filter(s => s.length > 0)));
  };

  const handleConsult = async (e?: FormEvent, skuOverride?: string) => {
    if (e) e.preventDefault();
    const targetSkus = parseSkus(skuOverride ?? lastSku);
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

  // Ao clicar em um item dentro do modal de pedido, navega para a aba de
  // Listings e carrega automaticamente o anúncio daquele SKU.
  const handleViewItem = (sku: string) => {
    if (!sku || sku === "—") return;
    setSelectedOrderForModal(null);
    setActiveTab("Listings / Itens");
    setLastSku(sku);
    displayToast(`Carregando anúncio do SKU ${sku}…`);
    handleConsult(undefined, sku);
  };

  const openJsonDrawer = (data: any, titleStr: string) => {
    setDrawerData(data);
    setDrawerTitle(titleStr);
    setIsDrawerOpen(true);
  };

  const STATUS_PT: Record<string, string> = {
    Shipped: 'ENVIADO',
    Pending: 'PENDENTE',
    Unshipped: 'NÃO ENVIADO',
    PartiallyShipped: 'PARCIAL',
    Canceled: 'CANCELADO',
    Delivered: 'ENTREGUE'
  };

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

  const formatPrice = (total: any) => {
    if (!total || total.Amount === undefined) return "-";
    const amt = parseFloat(total.Amount);
    return `${total.CurrencyCode === 'BRL' ? 'R$' : total.CurrencyCode} ${amt.toFixed(2).replace('.', ',')}`;
  };

  const handleQueryOrders = async (isLoadMore: boolean = false) => {
    setOrdersLoading(true);
    setOrdersError(null);
    setOrdersNotFoundIds([]);

    const fixedCreds = { ...credentials, marketplaceId: "A2Q3Y263D00KWC" };

    if (ordersSearchMode === "ids") {
      // Por ID
      if (!isLoadMore) {
        setOrders([]);
      }
      
      const rawIds = ordersSearchIds.split(/[\n,\s]+/).map(i => i.trim()).filter(i => i.length > 0);
      const targetIds: string[] = Array.from(new Set(rawIds));
      
      if (targetIds.length === 0) {
        setOrdersError("Por favor, preencha ao menos um ID de pedido.");
        setOrdersLoading(false);
        return;
      }

      const invalidIds = targetIds.filter(id => !/^\d{3}-\d{7}-\d{7}$/.test(id));
      if (invalidIds.length > 0) {
        setOrdersError(`IDs com formato inválido (o formato correto é 000-0000000-0000000):\n${invalidIds.join(', ')}`);
        setOrdersLoading(false);
        return;
      }

      try {
        let allOrders: AmazonOrder[] = [];
        
        // Chunk into batches of 50
        const chunkSize = 50;
        for (let i = 0; i < targetIds.length; i += chunkSize) {
          const chunk = targetIds.slice(i, i + chunkSize);
          
          if (i > 0) {
            // Delay for rate limit
            setOrdersLoading(true); // Optional: keep it set
            await new Promise(res => setTimeout(res, 2000));
          }
          
          const response = await getOrders(fixedCreds, {
            amazonOrderIds: chunk
          });
          
          allOrders = [...allOrders, ...(response.Orders || [])];
        }

        setOrders(allOrders);
        const returnedIds = allOrders.map(o => o.AmazonOrderId);
        const missing = targetIds.filter(id => !returnedIds.includes(id));
        setOrdersNotFoundIds(missing);
        setOrdersNextToken(null);
        displayToast(`${allOrders.length} de ${targetIds.length} pedidos encontrados`);
      } catch (err: any) {
        console.error(err);
        setOrdersError(err.message || "Erro desconhecido ao consultar SP-API (IDs).");
      } finally {
        setOrdersLoading(false);
      }

    } else {
      // Por Período (comportamento original)
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
    }
  };

  const handleLoadOrderItems = async (orderId: string) => {
    if (ordersItemsCache[orderId]?.items) return;
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
  };

  const handleLoadOrderFinances = async (orderId: string) => {
    if (ordersFinancesCache[orderId]?.finances) return;
    setOrdersFinancesCache(prev => ({
      ...prev,
      [orderId]: { loading: true }
    }));

    try {
      const fixedCreds = { ...credentials, marketplaceId: "A2Q3Y263D00KWC" };
      const response = await getOrderFinances(fixedCreds, { orderId });
      setOrdersFinancesCache(prev => ({
        ...prev,
        [orderId]: { loading: false, finances: response }
      }));
    } catch (err: any) {
      console.error(err);
      setOrdersFinancesCache(prev => ({
        ...prev,
        [orderId]: { loading: false, error: err.message || "Erro ao carregar dados financeiros." }
      }));
    }
  };

  const handleLoadOrderFeesEstimates = async (orderId: string, items: OrderItem[], isAmazonFulfilled: boolean) => {
    if (ordersFeesEstimateCache[orderId]) return;
    setOrdersFeesEstimateCache(prev => ({
      ...prev,
      [orderId]: { loading: true }
    }));

    const fixedCreds = { ...credentials, marketplaceId: "A2Q3Y263D00KWC" };
    const estimates: OrderItemFeeEstimate[] = [];

    try {
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const sku = it.SellerSKU || "";
        const qty = it.QuantityOrdered || 1;
        const lineTotal = parseFloat(it.ItemPrice?.Amount || "0");
        const unitPrice = qty > 0 ? lineTotal / qty : lineTotal;

        const entry: OrderItemFeeEstimate = {
          sku,
          orderItemId: it.OrderItemId,
          quantity: qty,
          unitPrice,
          lineTotal
        };

        if (!sku || !(unitPrice > 0)) {
          entry.error = !sku ? "Item sem SKU." : "Item sem preço (a estimativa exige o preço de venda).";
          estimates.push(entry);
          continue;
        }

        // Rate limit da Product Fees API: ~1 req/s
        if (i > 0) {
          await new Promise(r => setTimeout(r, 1100));
        }

        try {
          entry.result = await getFeesEstimateForSku(fixedCreds, {
            sku,
            price: Math.round(unitPrice * 100) / 100,
            currencyCode: it.ItemPrice?.CurrencyCode || "BRL",
            isAmazonFulfilled
          });
        } catch (err: any) {
          console.error(err);
          entry.error = err.message || "Erro ao estimar taxas.";
        }
        estimates.push(entry);
      }

      setOrdersFeesEstimateCache(prev => ({
        ...prev,
        [orderId]: { loading: false, estimates }
      }));
    } catch (err: any) {
      console.error(err);
      setOrdersFeesEstimateCache(prev => ({
        ...prev,
        [orderId]: { loading: false, error: err.message || "Erro ao estimar taxas." }
      }));
    }
  };

  const handleToggleOrderItems = async (orderId: string) => {
    // Toggle expand state
    const isExpanded = !expandedOrders[orderId];
    setExpandedOrders(prev => ({ ...prev, [orderId]: isExpanded }));

    // Load items if not cached and going to expand
    if (isExpanded) {
      await handleLoadOrderItems(orderId);
    }
  };

  const parseTsv = (text: string): Record<string, string>[] => {
    const lines = text.split(/\r\n|\n|\r/).filter(l => l.length > 0);
    if (lines.length === 0) return [];
    const headers = lines[0].split("\t").map(h => h.trim());
    const rows: Record<string, string>[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i].split("\t");
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => {
        row[h] = (cells[idx] ?? "").trim();
      });
      rows.push(row);
    }
    return rows;
  };

  const handleExtractAllListings = async () => {
    setReportLoading(true);
    setReportError(null);
    setReportRows([]);
    setReportProgress("Solicitando geração do relatório...");

    const fixedCreds = { ...credentials, marketplaceId: "A2Q3Y263D00KWC" };

    try {
      // 1. Cria o relatório
      const created = await createReport(fixedCreds, { reportType });
      const reportId = created.reportId;
      if (!reportId) throw new Error("A Amazon não retornou um reportId.");

      // 2. Faz polling até concluir (~5 min com intervalo de 5s)
      let documentId: string | undefined;
      const maxAttempts = 60;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        await new Promise(r => setTimeout(r, 5000));
        setReportProgress(`Aguardando a Amazon processar o relatório... (tentativa ${attempt + 1})`);
        const status = await getReport(fixedCreds, { reportId });
        if (status.processingStatus === "DONE") {
          documentId = status.reportDocumentId;
          break;
        }
        if (status.processingStatus === "CANCELLED") {
          throw new Error("O relatório foi cancelado pela Amazon. Isso normalmente significa que não há dados para os parâmetros informados.");
        }
        if (status.processingStatus === "FATAL") {
          throw new Error("A Amazon retornou um erro fatal ao gerar o relatório. Verifique se a aplicação SP-API possui o role necessário.");
        }
      }

      if (!documentId) {
        throw new Error("Tempo limite excedido aguardando o relatório ficar pronto. Tente novamente em alguns minutos.");
      }

      // 3. Obtém a URL pré-assinada do documento
      setReportProgress("Baixando o documento do relatório...");
      const doc = await getReportDocument(fixedCreds, { reportDocumentId: documentId });

      // 4. Baixa e descomprime o conteúdo via proxy
      const downloaded = await downloadReportDocument(fixedCreds, {
        url: doc.url,
        compressionAlgorithm: doc.compressionAlgorithm
      });

      // 5. Faz o parse do TSV retornado
      setReportProgress("Processando os dados...");
      const rows = parseTsv(downloaded.content || "");
      setReportRows(rows);
      displayToast(`${rows.length} anúncio(s) extraído(s)!`);
    } catch (err: any) {
      console.error(err);
      setReportError(err.message || "Erro desconhecido ao extrair anúncios.");
    } finally {
      setReportProgress(null);
      setReportLoading(false);
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

  // Colunas exibidas na tabela do relatório de anúncios (a exportação inclui todas).
  const reportHeaders = reportRows.length > 0 ? Object.keys(reportRows[0]) : [];
  const PREFERRED_REPORT_COLS = ["seller-sku", "item-name", "asin1", "price", "quantity", "open-date", "status"];
  const preferredReportCols = PREFERRED_REPORT_COLS.filter(c => reportHeaders.includes(c));
  const reportDisplayCols = preferredReportCols.length > 0 ? preferredReportCols : reportHeaders.slice(0, 7);
  const MAX_REPORT_PREVIEW = 200;

  return (
    <>
      {/* Top header */}
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8 12 3 3 8l9 5 9-5Z"/><path d="M3 8v8l9 5 9-5V8"/><path d="m12 13 0 8"/></svg>
          </div>
          <span className="brand-name">Amazon <b>API</b> Explorer</span>
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
                    />
                  </div>
                  <div className="field">
                    <label>Seller ID</label>
                    <input 
                      className="input mono" 
                      value={credentials.sellerId}
                      onChange={e => setCredentials({...credentials, sellerId: e.target.value})}
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
                    />
                  </div>
                  <div className="field">
                    <label>Seller ID</label>
                    <input 
                      className="input mono" 
                      value={credentials.sellerId}
                      onChange={e => setCredentials({...credentials, sellerId: e.target.value})}
                    />
                  </div>
                </div>
              </div>

              {/* Status and Filters row */}
              <div className="flex flex-col gap-4 p-4 md:p-[16px_18px]">
                <div className="flex justify-start mb-2">
                  <div className="status-pills">
                    <button 
                      type="button" 
                      className={`spill ${ordersSearchMode === "period" ? "on" : ""}`}
                      onClick={() => setOrdersSearchMode("period")}
                    >Por Período</button>
                    <button 
                      type="button" 
                      className={`spill ${ordersSearchMode === "ids" ? "on" : ""}`}
                      onClick={() => setOrdersSearchMode("ids")}
                    >Por ID do Pedido</button>
                  </div>
                </div>

                {ordersSearchMode === "period" ? (
                  <>
                    <div className="flex flex-wrap gap-[18px] items-end">
                      <div className="field">
                        <label>Período</label>
                        <select 
                          className="input" 
                          value={ordersDatePreset} 
                          onChange={e => setOrdersDatePreset(e.target.value as any)}
                        >
                          <option value="7">Últimos 7 dias</option>
                          <option value="30">Últimos 30 dias</option>
                          <option value="90">Últimos 90 dias</option>
                          <option value="custom">Data customizada</option>
                        </select>
                      </div>
                      <div className="field">
                        <label>A partir de</label>
                        <input 
                          type="date" 
                          className="input" 
                          value={ordersCustomDate} 
                          onChange={e => setOrdersCustomDate(e.target.value)} 
                          disabled={ordersDatePreset !== "custom"}
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-[18px] items-end">
                      <div className="field">
                        <label>Status do Pedido</label>
                        <div className="status-pills">
                          {[
                            { id: "Pending", label: "Pendente" },
                            { id: "Unshipped", label: "Não enviado" },
                            { id: "PartiallyShipped", label: "Parcialmente enviado" },
                            { id: "Shipped", label: "Enviado" },
                            { id: "Canceled", label: "Cancelado" }
                          ].map(opt => {
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
                                className={`spill ${isChecked ? 'on' : ''}`}
                              >
                                {opt.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="flex-1"></div>

                      <button 
                        type="button" 
                        onClick={() => handleQueryOrders(false)} 
                        disabled={ordersLoading} 
                        className="btn btn-primary"
                      >
                        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
                        {ordersLoading && orders.length === 0 ? "Buscando..." : "Buscar Pedidos"}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-wrap gap-[18px] items-end">
                    <div className="field flex-1" style={{ minWidth: "200px" }}>
                      <label>ID(s) do(s) pedido(s) (separados por vírgula ou linha)</label>
                      <textarea
                        placeholder="Ex: 000-0000000-0000000"
                        className="input mono"
                        style={{ height: "42px", minHeight: "42px", maxHeight: "150px", resize: "vertical", padding: "8px 12px" }}
                        value={ordersSearchIds}
                        onChange={(e) => setOrdersSearchIds(e.target.value)}
                      />
                    </div>
                    <button 
                      type="button" 
                      onClick={() => handleQueryOrders(false)} 
                      disabled={ordersLoading || !ordersSearchIds.trim()} 
                      className="btn btn-primary"
                      style={{ height: "42px" }}
                    >
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
                      {ordersLoading && orders.length === 0 ? "Buscando..." : "Buscar Pedidos"}
                    </button>
                  </div>
                )}
              </div>
            </section>

            {/* Error Message */}
            {ordersError && (
              <div className="conn mt-4 !border-[#f5b76b] !bg-[#fffaf0] p-4 text-[#e8861a] font-mono text-sm leading-relaxed whitespace-pre-wrap">
                <strong className="text-red-700 block mb-1">Erro de Consulta:</strong>
                {ordersError}
              </div>
            )}

            {/* Orders Not Found Message */}
            {ordersNotFoundIds.length > 0 && (
              <div className="conn mt-4 !border-[#f5b76b] !bg-[#fffaf0] p-4 text-[#e8861a] font-mono text-sm leading-relaxed whitespace-pre-wrap">
                <strong className="text-red-700 block mb-1">Pedidos não encontrados:</strong>
                {ordersNotFoundIds.join(", ")}
              </div>
            )}

            {/* Orders List Container */}
            {orders.length > 0 ? (
              <section className="card mt-6">
                <div className="card-head">
                  <span className="ico">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M16 3h5v5" />
                      <path d="M8 3H3v5" />
                      <path d="M3 16v5h5" />
                      <path d="M21 16v5h-5" />
                      <rect x="8" y="8" width="8" height="8" rx="1" />
                    </svg>
                  </span>
                  <h2>
                    Pedidos Encontrados <span style={{ color: "var(--muted)", fontWeight: 600 }}>({orders.length})</span>
                  </h2>
                  <span className="hint">Clique em um pedido para ver os detalhes completos</span>
                </div>
                
                <div className="overflow-x-auto">
                  <table className="orders">
                    <thead>
                      <tr>
                        <th>ID do Pedido (Amazon)</th>
                        <th>Data de Compra</th>
                        <th>Status</th>
                        <th>Canal</th>
                        <th>Itens</th>
                        <th style={{ textAlign: 'right' }}>Total</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map((ord) => {
                        const statusLabelPT = STATUS_PT[ord.OrderStatus] || ord.OrderStatus;
                        
                        let badgeClass = "badge green";
                        if (ord.OrderStatus === "Pending" || ord.OrderStatus === "PartiallyShipped") {
                          badgeClass = "badge blue";
                        } else if (ord.OrderStatus === "Canceled" || ord.OrderStatus === "Unshipped" || ord.OrderStatus === "Unfulfilled") {
                          badgeClass = "badge gray";
                        }

                        const purchaseDateLabel = fmtDT(ord.PurchaseDate);
                        const valTotal = ord.OrderTotal?.Amount ? fmtMoney(ord.OrderTotal.Amount) : "R$ 0,00";

                        const shippedCount = ord.NumberOfItemsShipped || 0;
                        const unshippedCount = ord.NumberOfItemsUnshipped || 0;
                        const itemsTxt = `${shippedCount} env. / ${unshippedCount} pend.`;

                        const channelLabel = ord.FulfillmentChannel === "AFN" 
                          ? "FBA / AFN" 
                          : ord.FulfillmentChannel === "MFN" 
                            ? "FBM / MFN" 
                            : `FBM / ${ord.FulfillmentChannel || 'MFN'}`;

                        return (
                          <tr 
                            key={ord.AmazonOrderId} 
                            className="row" 
                            onClick={() => setSelectedOrderForModal(ord)}
                          >
                            <td><span className="oid">{ord.AmazonOrderId}</span></td>
                            <td className="odate">{purchaseDateLabel}</td>
                            <td><span className={badgeClass}>{statusLabelPT}</span></td>
                            <td><span className="chan">{channelLabel}</span></td>
                            <td style={{ color: 'var(--ink-2)' }}>{itemsTxt}</td>
                            <td className="ototal" style={{ textAlign: 'right' }}>{valTotal}</td>
                            <td style={{ textAlign: 'right' }}>
                              <span className="openlbl">
                                Abrir
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M7 17 17 7" strokeLinecap="round" strokeLinejoin="round" />
                                  <path d="M7 7h10v10" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              </span>
                            </td>
                          </tr>
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
              </section>
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
        ) : activeTab === "Todos os Anúncios" ? (
          <>
            {/* Connection & report controls */}
            <section className="conn flex flex-col">
              <div className="conn-edit">
                <div className="conn-edit-grid">
                  <div className="field">
                    <label>Access Token (LWA)</label>
                    <input
                      className="input mono"
                      type="password"
                      value={credentials.accessToken}
                      onChange={e => setCredentials({...credentials, accessToken: e.target.value})}
                    />
                  </div>
                  <div className="field">
                    <label>Seller ID</label>
                    <input
                      className="input mono"
                      value={credentials.sellerId}
                      onChange={e => setCredentials({...credentials, sellerId: e.target.value})}
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-[18px] items-end p-4 md:p-[16px_18px]">
                <div className="field" style={{ minWidth: "260px" }}>
                  <label>Tipo de relatório</label>
                  <select
                    className="input"
                    value={reportType}
                    onChange={e => setReportType(e.target.value)}
                    disabled={reportLoading}
                  >
                    <option value="GET_MERCHANT_LISTINGS_ALL_DATA">Todos os anúncios (ativos + inativos)</option>
                    <option value="GET_MERCHANT_LISTINGS_DATA">Apenas anúncios ativos</option>
                    <option value="GET_MERCHANT_LISTINGS_INACTIVE_DATA">Apenas anúncios inativos</option>
                  </select>
                </div>

                <div className="flex-1"></div>

                <button
                  type="button"
                  onClick={handleExtractAllListings}
                  disabled={reportLoading || !credentials.accessToken || !credentials.sellerId}
                  className="btn btn-primary"
                >
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>
                  {reportLoading ? "Extraindo..." : "Extrair todos os anúncios"}
                </button>
              </div>
            </section>

            {/* Error Message */}
            {reportError && (
              <div className="conn mt-4 !border-[#f5b76b] !bg-[#fffaf0] p-4 text-[#e8861a] font-mono text-sm leading-relaxed whitespace-pre-wrap">
                <strong className="text-red-700 block mb-1">Erro na extração:</strong>
                {reportError}
              </div>
            )}

            {/* Progress indicator */}
            {reportProgress && (
              <div className="conn mt-4 p-4 bg-[#fffaf0] border-[#f5b76b] text-[#e8861a] text-sm font-semibold flex items-center gap-2">
                <div className="pulse"></div>
                <span>{reportProgress}</span>
              </div>
            )}

            {/* Results */}
            {reportRows.length > 0 && (
              <div className="card mt-6 overflow-hidden">
                <div className="border-b border-border p-4 bg-surface-2 flex items-center justify-between flex-wrap gap-2">
                  <h3 className="text-[13.5px] font-bold text-ink flex items-center gap-2">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>
                    Anúncios encontrados ({reportRows.length})
                  </h3>
                  <button className="btn btn-ghost" style={{ padding: "6px 12px", fontSize: "12px" }} onClick={() => { displayToast('Exportando relatório completo...'); exportReportListingsToExcel(reportRows); }}>
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="m9 13 6 6"/><path d="m15 13-6 6"/></svg>
                    Exportar tudo (XLS)
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-[13px]">
                    <thead>
                      <tr className="border-b border-border bg-surface text-muted text-xs font-semibold uppercase tracking-wider">
                        {reportDisplayCols.map(col => (
                          <th key={col} className="p-3 whitespace-nowrap">{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {reportRows.slice(0, MAX_REPORT_PREVIEW).map((row, idx) => {
                        const rowSku = row["seller-sku"];
                        const canView = !!rowSku;
                        return (
                          <tr
                            key={idx}
                            onClick={canView ? () => handleViewItem(rowSku) : undefined}
                            title={canView ? "Ver anúncio deste item" : undefined}
                            className={`transition-colors ${canView ? "cursor-pointer hover:bg-accent/10" : "hover:bg-surface-2"}`}
                          >
                            {reportDisplayCols.map(col => (
                              <td
                                key={col}
                                className={`p-3 max-w-[280px] truncate font-mono ${col === "seller-sku" && canView ? "text-accent font-bold" : "text-ink-2"}`}
                                title={row[col]}
                              >
                                {row[col] || "-"}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {reportRows.length > MAX_REPORT_PREVIEW && (
                  <div className="p-3 border-t border-border bg-surface-2 text-center text-xs text-muted">
                    Exibindo os primeiros {MAX_REPORT_PREVIEW} de {reportRows.length} anúncios. Use "Exportar tudo (XLS)" para obter a lista completa.
                  </div>
                )}
              </div>
            )}

            {/* Empty state */}
            {!reportLoading && reportRows.length === 0 && !reportError && (
              <div className="card mt-6 p-12 text-center flex flex-col items-center justify-center">
                <div className="ok-ico !bg-surface-2 !text-muted">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>
                </div>
                <h2 className="text-[14.5px] font-bold text-ink">Extraia todos os seus anúncios</h2>
                <p className="text-muted text-[13px] mt-1 max-w-md">Gera um relatório completo da conta via Reports API da SP-API (sem precisar digitar SKUs). O processamento pode levar de alguns segundos a poucos minutos.</p>
              </div>
            )}

            {/* Loading state */}
            {reportLoading && reportRows.length === 0 && (
              <div className="card mt-6 p-12 text-center flex flex-col items-center justify-center gap-3">
                <span className="relative flex h-6 w-6">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-6 w-6 bg-accent"></span>
                </span>
                <h2 className="text-[14px] font-bold text-ink">Extraindo anúncios...</h2>
                <p className="text-xs text-muted">{reportProgress || "Comunicando com a Reports API da Amazon SP-API"}</p>
              </div>
            )}
          </>
        ) : (
          <div className="card mt-6 p-10 text-center flex flex-col items-center justify-center">
             <div className="ok-ico !bg-surface-2 !text-muted"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg></div>
             <h2 className="text-[14.5px] font-bold text-ink">Aba em desenvolvimento</h2>
             <p className="text-muted text-[13px] mt-1">Utilize as abas disponíveis por enquanto.</p>
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

      {selectedOrderForModal && (
        <OrderDetailsModal
          isOpen={!!selectedOrderForModal}
          onClose={() => setSelectedOrderForModal(null)}
          order={selectedOrderForModal}
          itemsCacheEntry={ordersItemsCache[selectedOrderForModal.AmazonOrderId]}
          financesCacheEntry={ordersFinancesCache[selectedOrderForModal.AmazonOrderId]}
          feesEstimateCacheEntry={ordersFeesEstimateCache[selectedOrderForModal.AmazonOrderId]}
          onLoadItems={handleLoadOrderItems}
          onLoadFinances={handleLoadOrderFinances}
          onLoadFeesEstimates={handleLoadOrderFeesEstimates}
          onViewItem={handleViewItem}
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
