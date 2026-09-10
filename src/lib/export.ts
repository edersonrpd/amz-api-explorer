import * as XLSX from "xlsx";
import { AmazonListing } from "../types";
import { getListingVariations, parentageLabel } from "./variations";

const flattenAttributes = (attributes: Record<string, any>) => {
  const flat: Record<string, string> = {};
  if (!attributes) return flat;
  
  Object.entries(attributes).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      flat[key] = value.map(v => typeof v === 'object' ? JSON.stringify(v) : v).join(", ");
    } else if (typeof value === 'object' && value !== null) {
      flat[key] = JSON.stringify(value);
    } else {
      flat[key] = String(value);
    }
  });
  return flat;
};

export const exportListingToExcel = (data: AmazonListing) => {
  const wb = XLSX.utils.book_new();

  // 1. Summary Sheet
  const summarySheet = XLSX.utils.json_to_sheet(
    data.summaries?.map(s => ({
      MarketplaceId: s.marketplaceId,
      ASIN: s.asin,
      ItemName: s.itemName,
      ProductType: s.productType,
      Condition: s.conditionType,
      Status: s.status?.join(", "),
      CreatedDate: s.createdDate,
      LastUpdatedDate: s.lastUpdatedDate
    })) || []
  );
  XLSX.utils.book_append_sheet(wb, summarySheet, "Summary");

  // 2. Attributes Sheet
  const flatAttrs = flattenAttributes(data.attributes);
  const attributesSheet = XLSX.utils.json_to_sheet(
    Object.entries(flatAttrs).map(([key, value]) => ({ Attribute: key, Value: value }))
  );
  XLSX.utils.book_append_sheet(wb, attributesSheet, "Attributes");

  // 3. Offers Sheet
  if (data.offers?.length) {
    const offersSheet = XLSX.utils.json_to_sheet(data.offers);
    XLSX.utils.book_append_sheet(wb, offersSheet, "Offers");
  }

  // 4. Issues Sheet
  if (data.issues?.length) {
    const issuesSheet = XLSX.utils.json_to_sheet(data.issues);
    XLSX.utils.book_append_sheet(wb, issuesSheet, "Issues");
  }

  // 5. Relationships Sheet (parent/child): uma linha por SKU relacionado
  const variations = getListingVariations(data);
  if (variations.level !== "standalone") {
    const relRows = [
      ...variations.parentSkus.map(sku => ({ Relacao: "Pai (parent)", SKU: sku, Tema: variations.theme || "" })),
      ...variations.childSkus.map(sku => ({ Relacao: "Variação (child)", SKU: sku, Tema: variations.theme || "" })),
    ];
    if (relRows.length === 0) {
      relRows.push({ Relacao: parentageLabel(variations.level), SKU: data.sku, Tema: variations.theme || "" });
    }
    const relSheet = XLSX.utils.json_to_sheet(relRows);
    XLSX.utils.book_append_sheet(wb, relSheet, "Relationships");
  }

  XLSX.writeFile(wb, `${data.sku}_listing.xlsx`);
};

export const exportAllListingsToExcel = (results: { sku: string; status: string; errorMsg?: string; data?: any }[]) => {
  const wb = XLSX.utils.book_new();

  const rows = results.map(r => {
    const data = r.data || {};
    const summary = data.summaries?.[0] || {};
    const attributes = data.attributes || {};
    const qty = data.fulfillmentAvailability?.[0]?.quantity !== undefined ? data.fulfillmentAvailability[0].quantity : "-";
    const title = summary.itemName || attributes.item_name?.[0]?.value || "-";
    const asin = summary.asin || attributes.merchant_suggested_asin?.[0]?.value || "-";
    const statuses = summary.status?.join(", ") || "-";
    
    const priceAttr = attributes.purchasable_offer?.[0];
    const sellPrice = priceAttr?.our_price?.[0]?.schedule?.[0]?.value_with_tax || data.offers?.[0]?.price?.amount;
    const priceFormatted = sellPrice !== undefined && sellPrice !== null ? `R$ ${sellPrice.toFixed(2).replace('.', ',')}` : "-";

    const variations = getListingVariations(r.data);
    const variationValues = variations.ownValues.map(v => `${v.name}=${v.value}`).join("; ");

    let displayStatus = "Pendente";
    if (r.status === "searching") displayStatus = "Buscando";
    if (r.status === "success") displayStatus = "Sucesso";
    if (r.status === "not_found") displayStatus = "Não Encontrado";
    if (r.status === "error") displayStatus = `Erro`;

    return {
      "SKU": r.sku,
      "Título": title,
      "ASIN": asin,
      "Preço": priceFormatted,
      "Estoque": qty,
      "Status do Anúncio": statuses,
      "Tipo": r.data ? parentageLabel(variations.level) : "-",
      "SKU Pai": variations.parentSkus.join(", ") || "-",
      "SKUs Filhos": variations.childSkus.join(", ") || "-",
      "Tema Variação": variations.theme || "-",
      "Valores Variação": variationValues || "-",
      "Status da Consulta": displayStatus,
      "Detalhes do Erro": r.status === "error" || r.status === "not_found" ? r.errorMsg || r.status : ""
    };
  });

  const sheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, sheet, "Resultados");

  XLSX.writeFile(wb, `Amazon_Listings_Batch_${new Date().toISOString().slice(0, 10)}.xlsx`);
};

// Exporta o relatório completo de anúncios (Reports API) preservando todas as colunas do TSV.
// As colunas mais relevantes são movidas para o início; o restante mantém a ordem original.
export const exportReportListingsToExcel = (rows: Record<string, string>[]) => {
  const wb = XLSX.utils.book_new();

  const LEAD_COLS = ["seller-sku", "listing-id", "price", "quantity"];
  const allKeys = rows.length > 0 ? Object.keys(rows[0]) : [];
  const orderedHeader = [
    ...LEAD_COLS.filter(c => allKeys.includes(c)),
    ...allKeys.filter(c => !LEAD_COLS.includes(c)),
  ];

  const sheet = XLSX.utils.json_to_sheet(rows, { header: orderedHeader });
  XLSX.utils.book_append_sheet(wb, sheet, "Anúncios");
  XLSX.writeFile(wb, `Amazon_Todos_Anuncios_${new Date().toISOString().slice(0, 10)}.xlsx`);
};
