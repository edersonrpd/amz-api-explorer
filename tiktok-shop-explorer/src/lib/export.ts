import * as XLSX from "xlsx";
import { ProductRow, TikTokOrder, TikTokProduct } from "../types";

function firstPrice(p?: TikTokProduct): string {
  const sku = p?.skus?.[0];
  const price = sku?.price?.sale_price;
  if (!price) return "-";
  const cur = sku?.price?.currency || "BRL";
  return `${cur} ${price}`;
}

function totalStock(p?: TikTokProduct): number | string {
  if (!p?.skus?.length) return "-";
  let total = 0;
  for (const sku of p.skus) {
    for (const inv of sku.inventory || []) {
      total += inv.quantity || 0;
    }
  }
  return total;
}

// Exporta a tabela-resumo da aba Produtos.
export function exportProductsToExcel(rows: ProductRow[]) {
  const wb = XLSX.utils.book_new();
  const data = rows.map((r) => {
    const p = r.data;
    let displayStatus = "Pendente";
    if (r.status === "searching") displayStatus = "Buscando";
    if (r.status === "success") displayStatus = "Sucesso";
    if (r.status === "not_found") displayStatus = "Nao encontrado";
    if (r.status === "error") displayStatus = "Erro";
    return {
      "Seller SKU": r.sellerSku,
      "Product ID": p?.id || r.productId || "-",
      "Titulo": p?.title || "-",
      "Status do Produto": p?.status || "-",
      "Preco": firstPrice(p),
      "Estoque": totalStock(p),
      "Status da Consulta": displayStatus,
      "Detalhes do Erro": r.status === "error" || r.status === "not_found" ? r.errorMsg || "" : "",
    };
  });
  const sheet = XLSX.utils.json_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, sheet, "Produtos");
  XLSX.writeFile(wb, `TikTok_Produtos_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// Exporta o detalhe de um unico produto (abas Summary / SKUs).
export function exportProductDetailToExcel(p: TikTokProduct) {
  const wb = XLSX.utils.book_new();

  const summary = [
    {
      "Product ID": p.id,
      "Titulo": p.title || "-",
      "Status": p.status || "-",
      "Categoria": p.category_chains?.map((c) => c.local_name).filter(Boolean).join(" > ") || "-",
    },
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), "Summary");

  const skus = (p.skus || []).map((s) => ({
    "SKU ID": s.id,
    "Seller SKU": s.seller_sku || "-",
    "Moeda": s.price?.currency || "-",
    "Preco": s.price?.sale_price || "-",
    "Estoque": (s.inventory || []).reduce((acc, inv) => acc + (inv.quantity || 0), 0),
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(skus.length ? skus : [{}]), "SKUs");

  XLSX.writeFile(wb, `${p.id}_produto.xlsx`);
}

// Exporta a lista completa de produtos (aba Catalogo).
export function exportCatalogToExcel(products: TikTokProduct[]) {
  const wb = XLSX.utils.book_new();
  const rows = products.map((p) => ({
    "Product ID": p.id,
    "Titulo": p.title || "-",
    "Status": p.status || "-",
    "Seller SKU (1o)": p.skus?.[0]?.seller_sku || "-",
    "Preco (1o)": firstPrice(p),
    "Estoque total": totalStock(p),
  }));
  const sheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, sheet, "Catalogo");
  XLSX.writeFile(wb, `TikTok_Catalogo_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// Exporta a lista de pedidos.
export function exportOrdersToExcel(orders: TikTokOrder[]) {
  const wb = XLSX.utils.book_new();
  const rows = orders.map((o) => ({
    "Order ID": o.id,
    "Status": o.status || "-",
    "Criado em (epoch)": o.create_time || "-",
    "Tipo": o.fulfillment_type || "-",
    "Moeda": o.payment?.currency || "-",
    "Total": o.payment?.total_amount || "-",
    "Itens": o.line_items?.length || 0,
  }));
  const sheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, sheet, "Pedidos");
  XLSX.writeFile(wb, `TikTok_Pedidos_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
