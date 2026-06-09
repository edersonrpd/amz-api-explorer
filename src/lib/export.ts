import * as XLSX from "xlsx";
import { AmazonListing } from "../types";

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

  XLSX.writeFile(wb, `${data.sku}_listing.xlsx`);
};
