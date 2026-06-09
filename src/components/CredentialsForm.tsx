import React, { useState } from "react";
import { AmazonCredentials } from "../types";
import { MARKETPLACES } from "../constants";

interface CredentialsFormProps {
  initialCredentials: AmazonCredentials;
  initialSku: string;
  onSubmit: (credentials: AmazonCredentials, sku: string) => void;
  isLoading: boolean;
}

export function CredentialsForm({
  initialCredentials,
  initialSku,
  onSubmit,
  isLoading,
}: CredentialsFormProps) {
  const [credentials, setCredentials] = useState<AmazonCredentials>(initialCredentials);
  const [sku, setSku] = useState(initialSku);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(credentials, sku);
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="col-span-1 md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Access Token (LWA)
          </label>
          <input
            type="password"
            required
            value={credentials.accessToken}
            onChange={(e) => setCredentials({ ...credentials, accessToken: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amz-orange focus:border-transparent font-mono text-sm"
            placeholder="Atza|IwEB..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Seller ID
          </label>
          <input
            type="text"
            required
            value={credentials.sellerId}
            onChange={(e) => setCredentials({ ...credentials, sellerId: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amz-orange focus:border-transparent font-mono text-sm"
            placeholder="Ex: A1ZR68P0CII4BN"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Marketplace
          </label>
          <select
            value={credentials.marketplaceId}
            onChange={(e) => setCredentials({ ...credentials, marketplaceId: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amz-orange focus:border-transparent"
          >
            {MARKETPLACES.map((mp) => (
              <option key={mp.id} value={mp.id}>
                {mp.name}
              </option>
            ))}
          </select>
        </div>

        <div className="md:col-span-2 mt-2">
          <label className="block text-sm font-bold text-gray-900 mb-1">
            SKU do Produto
          </label>
          <div className="flex gap-3">
            <input
              type="text"
              required
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amz-orange focus:border-transparent font-mono text-sm"
              placeholder="Ex: MEU-SKU-123"
            />
            <button
              type="submit"
              disabled={isLoading}
              className="px-6 py-2 bg-amz-orange hover:bg-amz-hover text-white font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amz-orange disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? "Consultando..." : "Consultar Item"}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
