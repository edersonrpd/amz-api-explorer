import { AmazonListing, Issue, ItemSummary } from "../types";
import { Badge } from "./Badge";
import { CopyButton } from "./CopyButton";
import { AlertCircle, AlertTriangle, Box, Info, Package, Tag, Layers, FileJson } from "lucide-react";
import { exportListingToExcel } from "../lib/export";

interface ListingResultProps {
  data: AmazonListing;
  onViewJson: () => void;
}

export function ListingResult({ data, onViewJson }: ListingResultProps) {
  const summary = data.summaries?.[0]; // Usually we fetch for one marketplace, taking the first

  const getIssueIcon = (severity: string) => {
    switch (severity) {
      case "ERROR": return <AlertCircle className="w-4 h-4 text-red-500" />;
      case "WARNING": return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      default: return <Info className="w-4 h-4 text-blue-500" />;
    }
  };

  const getIssueBadge = (severity: string) => {
    switch (severity) {
      case "ERROR": return "error";
      case "WARNING": return "warning";
      default: return "info";
    }
  };

  const flattenAttributeValue = (val: any): string => {
    if (Array.isArray(val)) {
      return val.map(v => typeof v === 'object' ? v.value || JSON.stringify(v) : String(v)).join(", ");
    }
    if (typeof val === 'object' && val !== null) {
      return val.value || JSON.stringify(val);
    }
    return String(val);
  };

  return (
    <div className="space-y-6">
      {/* Action Bar */}
      <div className="flex items-center justify-between bg-white px-6 py-4 rounded-2xl shadow-sm border border-gray-100">
        <h2 className="text-xl font-bold font-sans text-gray-900">
          Resultados para <span className="font-mono text-amz-blue">{data.sku}</span>
        </h2>
        <div className="flex gap-3">
          <button
            onClick={() => exportListingToExcel(data)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Exportar XLS
          </button>
          <button
            onClick={onViewJson}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 transition-colors"
          >
            <FileJson className="w-4 h-4" />
            Ver JSON Original
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Main Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Summary Card */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <div className="flex items-center gap-2 text-gray-900 font-semibold">
                <Box className="w-5 h-5 text-gray-500" />
                Resumo (Summaries)
              </div>
            </div>
            <div className="p-6">
              {summary ? (
                <div className="flex flex-col sm:flex-row gap-6">
                  {summary.mainImage && (
                    <div className="shrink-0">
                      <img 
                        src={summary.mainImage.link} 
                        alt="Product" 
                        className="w-32 h-32 object-contain rounded-lg border border-gray-200 p-1"
                      />
                    </div>
                  )}
                  <div className="flex-1 space-y-4">
                    <div>
                      <h3 className="text-lg font-bold text-gray-900 leading-tight">
                        {summary.itemName}
                      </h3>
                      <div className="flex items-center gap-4 mt-2">
                        <div className="flex items-center gap-1.5 border border-gray-200 px-2 py-1 rounded bg-gray-50 text-sm">
                          <span className="text-gray-500 font-medium">ASIN</span>
                          <span className="font-mono font-bold">{summary.asin}</span>
                          <CopyButton text={summary.asin} />
                        </div>
                        <Badge variant="orange">{summary.productType}</Badge>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="block text-gray-500 mb-1">Status</span>
                        <div className="flex gap-1 flex-wrap">
                          {summary.status?.map(s => (
                            <Badge key={s} variant={s === "BUYABLE" ? "success" : "default"}>{s}</Badge>
                          ))}
                        </div>
                      </div>
                      <div>
                        <span className="block text-gray-500 mb-1">Condição</span>
                        <span className="font-medium text-gray-900">{summary.conditionType}</span>
                      </div>
                      <div>
                        <span className="block text-gray-500 mb-1">Data Criação</span>
                        <span className="text-gray-900">{new Date(summary.createdDate).toLocaleDateString()}</span>
                      </div>
                      <div>
                        <span className="block text-gray-500 mb-1">Última Att.</span>
                        <span className="text-gray-900">{new Date(summary.lastUpdatedDate).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-gray-500 italic">Nenhum resumo encontrado.</p>
              )}
            </div>
          </div>

          {/* Attributes Card */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <div className="flex items-center gap-2 text-gray-900 font-semibold">
                <Tag className="w-5 h-5 text-gray-500" />
                Principais Atributos
              </div>
              <Badge>{Object.keys(data.attributes || {}).length} atr.</Badge>
            </div>
            <div className="p-0">
              {data.attributes && Object.keys(data.attributes).length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50 text-gray-500">
                      <tr>
                        <th className="px-6 py-3 font-medium border-b">Atributo</th>
                        <th className="px-6 py-3 font-medium border-b">Valor</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {Object.entries(data.attributes).map(([key, rawValue]) => {
                        const valueStr = flattenAttributeValue(rawValue);
                        return (
                          <tr key={key} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-6 py-3 font-mono text-gray-600">{key}</td>
                            <td className="px-6 py-3 text-gray-900 max-w-md truncate" title={valueStr}>
                              {valueStr}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-6 text-gray-500 italic">Nenhum atributo encontrado.</div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column - Secondary Details */}
        <div className="space-y-6">
          {/* Issues Card */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <div className="flex items-center gap-2 text-gray-900 font-semibold">
                <AlertCircle className="w-5 h-5 text-gray-500" />
                Problemas (Issues)
              </div>
              {data.issues && data.issues.length > 0 && (
                 <Badge variant="error">{data.issues.length}</Badge>
              )}
            </div>
            <div className="p-4">
              {data.issues && data.issues.length > 0 ? (
                <div className="space-y-3">
                  {data.issues.map((issue, idx) => (
                    <div key={idx} className="p-3 bg-gray-50 border border-gray-100 rounded-lg text-sm">
                      <div className="flex gap-2 items-start">
                        <div className="mt-0.5">{getIssueIcon(issue.severity)}</div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-bold text-gray-900">{issue.code}</span>
                            <Badge variant={getIssueBadge(issue.severity) as any}>{issue.severity}</Badge>
                          </div>
                          <p className="text-gray-600 leading-relaxed mb-2">{issue.message}</p>
                          {issue.attributeNames && issue.attributeNames.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                               {issue.attributeNames.map(attr => (
                                 <span key={attr} className="text-xs bg-gray-200 text-gray-700 px-1.5 py-0.5 rounded font-mono">
                                   {attr}
                                 </span>
                               ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-gray-500">
                  <div className="inline-flex w-12 h-12 rounded-full bg-green-50 items-center justify-center mb-2">
                    <AlertCircle className="w-6 h-6 text-green-500" />
                  </div>
                  <p>Nenhum problema encontrado.</p>
                </div>
              )}
            </div>
          </div>

          {/* Fulfillment & Offers */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <div className="flex items-center gap-2 text-gray-900 font-semibold">
                <Package className="w-5 h-5 text-gray-500" />
                Estoque & Ofertas
              </div>
            </div>
            <div className="p-6 space-y-6">
              {/* Fulfillment */}
              <div>
                <h4 className="text-sm font-bold text-gray-900 mb-3 uppercase tracking-wider">Fulfillment</h4>
                {data.fulfillmentAvailability && data.fulfillmentAvailability.length > 0 ? (
                  <div className="space-y-3">
                    {data.fulfillmentAvailability.map((f, i) => (
                      <div key={i} className="flex justify-between items-center bg-gray-50 px-3 py-2 rounded-lg">
                        <span className="text-sm font-medium text-gray-700">{f.fulfillmentChannelCode}</span>
                        <Badge>{f.quantity ?? 0} unid.</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 italic">Nenhum dado de fulfillment.</p>
                )}
              </div>

              {/* Offers */}
              <div>
                <h4 className="text-sm font-bold text-gray-900 mb-3 uppercase tracking-wider">Offers</h4>
                {data.offers && data.offers.length > 0 ? (
                  <div className="space-y-3">
                    {data.offers.map((o, i) => (
                       <div key={i} className="bg-gray-50 p-3 rounded-lg text-sm border border-gray-100">
                          <div className="flex justify-between mb-2">
                            <span className="font-medium text-gray-900">{o.offerType}</span>
                            <Badge variant="orange">{o.price?.currencyCode} {o.price?.amount}</Badge>
                          </div>
                       </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 italic">Nenhuma oferta encontrada.</p>
                )}
              </div>
            </div>
          </div>

          {/* Relationships */}
           <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <div className="flex items-center gap-2 text-gray-900 font-semibold">
                <Layers className="w-5 h-5 text-gray-500" />
                Relacionamentos
              </div>
            </div>
            <div className="p-4">
               {data.relationships && data.relationships.length > 0 ? (
                 <p className="text-sm text-gray-700">{data.relationships.length} relacionamentos encontrados.</p>
               ) : (
                 <p className="text-sm text-gray-500 italic">Sem relacionamentos (parent/child).</p>
               )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
