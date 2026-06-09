import { useState } from "react";
import { Tabs } from "./components/Tabs";
import { CredentialsForm } from "./components/CredentialsForm";
import { ListingResult } from "./components/ListingResult";
import { JsonModal } from "./components/JsonModal";
import { getListingsItem } from "./services/amazonService";
import { useLocalStorage } from "./hooks/useLocalStorage";
import { AmazonCredentials, AmazonListing } from "./types";
import { MARKETPLACES } from "./constants";
import { AlertCircle, PackageSearch } from "lucide-react";

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
  const [isModalOpen, setIsModalOpen] = useState(false);

  const TABS = ["Listings / Itens", "Pedidos", "Estoque FBA", "Catálogo"];

  const handleConsult = async (creds: AmazonCredentials, sku: string) => {
    setCredentials(creds);
    setLastSku(sku);
    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const data = await getListingsItem(creds, { sku });
      setResult(data);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Erro desconhecido ao consultar SP-API.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans selection:bg-amz-orange/20">
      {/* Header */}
      <header className="bg-amz-blue text-white shadow-md">
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <PackageSearch className="w-8 h-8 text-amz-orange" />
            <h1 className="text-xl font-bold tracking-tight">
              Amazon Listings Explorer
            </h1>
          </div>
          <div className="text-xs text-gray-300 font-mono tracking-wider hidden sm:block">
            SP-API DEV TOOL
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        
        {/* Navigation */}
        <div className="bg-white rounded-t-xl px-1 pt-1 border-b border-gray-200">
          <Tabs tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />
        </div>

        {activeTab === "Listings / Itens" ? (
          <div className="space-y-8">
            {/* Formulario */}
            <div className="max-w-4xl">
              <CredentialsForm
                initialCredentials={credentials}
                initialSku={lastSku}
                onSubmit={handleConsult}
                isLoading={isLoading}
              />
            </div>

            {/* Error Message */}
            {error && (
              <div className="p-4 bg-red-50 border-l-4 border-red-500 rounded-r-lg max-w-4xl">
                <div className="flex items-start">
                  <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 mr-3 shrink-0" />
                  <p className="text-red-800 text-sm font-medium whitespace-pre-wrap">{error}</p>
                </div>
              </div>
            )}

            {/* Loading Skeleton (Simples) */}
            {isLoading && (
              <div className="animate-pulse space-y-6">
                 <div className="h-16 bg-gray-200 rounded-2xl w-full"></div>
                 <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 h-96 bg-gray-200 rounded-2xl"></div>
                    <div className="h-96 bg-gray-200 rounded-2xl"></div>
                 </div>
              </div>
            )}

            {/* Resulados */}
            {result && !isLoading && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <ListingResult data={result} onViewJson={() => setIsModalOpen(true)} />
              </div>
            )}
          </div>
        ) : (
          <div className="py-20 text-center text-gray-500 max-w-lg mx-auto">
             <PackageSearch className="w-12 h-12 text-gray-300 mx-auto mb-4" />
             <h2 className="text-lg font-medium text-gray-900 mb-2">Aba em desenvolvimento</h2>
             <p className="text-sm">A aba "{activeTab}" está preparada para expansão futura. No momento, utilize a aba "Listings / Itens".</p>
          </div>
        )}
      </main>

      {/* JSON Modal */}
      {result && (
        <JsonModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          data={result}
          title={`JSON Retornado: ${result.sku}`}
        />
      )}
    </div>
  );
}
