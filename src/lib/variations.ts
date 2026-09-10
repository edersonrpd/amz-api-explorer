import { AmazonListing, ListingVariations, VariationAttribute } from "../types";

// Lê o valor textual de um atributo da SP-API (sempre um array de objetos {value}).
const attrValue = (attributes: Record<string, any>, key: string): string | undefined => {
  const arr = attributes?.[key];
  if (!Array.isArray(arr) || arr.length === 0) return undefined;
  const v = arr[0];
  if (v && typeof v === "object") {
    if (v.value !== undefined && v.value !== null) return String(v.value);
    if (v.name !== undefined && v.name !== null) return String(v.name);
    return undefined;
  }
  return v === undefined || v === null ? undefined : String(v);
};

const uniq = (list: string[]): string[] => Array.from(new Set(list.filter(Boolean)));

// Consolida as informações de variação de um anúncio.
//
// Fonte principal: bloco `relationships` (exige includedData=relationships).
// Fallback: atributos `parentage_level`, `child_parent_sku_relationship` e
// `variation_theme`, que a Amazon devolve mesmo sem o bloco de relacionamentos.
export function getListingVariations(data: AmazonListing | undefined | null): ListingVariations {
  const attributes: Record<string, any> = data?.attributes || {};
  const parentSkus: string[] = [];
  const childSkus: string[] = [];
  let theme: string | undefined;
  let themeAttributes: string[] = [];

  for (const byMarketplace of data?.relationships || []) {
    for (const rel of byMarketplace?.relationships || []) {
      if (rel.type && rel.type !== "VARIATION") continue;
      if (Array.isArray(rel.parentSkus)) parentSkus.push(...rel.parentSkus);
      if (Array.isArray(rel.childSkus)) childSkus.push(...rel.childSkus);
      if (!theme && rel.variationTheme?.theme) theme = rel.variationTheme.theme;
      if (themeAttributes.length === 0 && Array.isArray(rel.variationTheme?.attributes)) {
        themeAttributes = rel.variationTheme!.attributes!;
      }
    }
  }

  // Fallback pelos atributos do próprio anúncio.
  const relAttr = attributes.child_parent_sku_relationship;
  if (Array.isArray(relAttr)) {
    for (const r of relAttr) {
      if (r?.parent_sku) parentSkus.push(String(r.parent_sku));
    }
  }
  if (!theme) theme = attrValue(attributes, "variation_theme");

  // Tema "SIZE_NAME/COLOR_NAME" -> atributos size_name / color_name
  if (themeAttributes.length === 0 && theme) {
    themeAttributes = theme
      .split("/")
      .map(t => t.trim().toLowerCase())
      .filter(Boolean);
  }

  const parentageAttr = attrValue(attributes, "parentage_level")?.toLowerCase();
  let level: ListingVariations["level"] = "standalone";
  if (parentageAttr === "parent" || childSkus.length > 0) level = "parent";
  else if (parentageAttr === "child" || parentSkus.length > 0) level = "child";

  // Valores da variação neste SKU (ex: color_name = Azul), úteis no filho.
  const ownValues: VariationAttribute[] = [];
  for (const name of themeAttributes) {
    const value = attrValue(attributes, name);
    if (value) ownValues.push({ name, value });
  }

  return {
    level,
    parentSkus: uniq(parentSkus),
    childSkus: uniq(childSkus),
    theme,
    themeAttributes,
    ownValues,
  };
}

// Rótulo curto em pt-BR para o nível do anúncio.
export function parentageLabel(level: ListingVariations["level"]): string {
  if (level === "parent") return "Pai (parent)";
  if (level === "child") return "Variação (child)";
  return "Sem variações";
}
