// Mercado-alvo desta versao: Brasil (TikTok Shop BR).
export const TARGET_REGION = "BR";

// Status de produto do TikTok Shop.
export const PRODUCT_STATUS_OPTIONS = [
  { id: "ACTIVATE", label: "Ativo" },
  { id: "DEACTIVATED", label: "Inativo" },
  { id: "DRAFT", label: "Rascunho" },
  { id: "PENDING", label: "Em revisao" },
  { id: "FAILED", label: "Reprovado" },
  { id: "FROZEN", label: "Congelado" },
];

// Status de pedido do TikTok Shop.
export const ORDER_STATUS_OPTIONS = [
  { id: "UNPAID", label: "Nao pago" },
  { id: "AWAITING_SHIPMENT", label: "Aguardando envio" },
  { id: "AWAITING_COLLECTION", label: "Aguardando coleta" },
  { id: "IN_TRANSIT", label: "Em transito" },
  { id: "DELIVERED", label: "Entregue" },
  { id: "COMPLETED", label: "Concluido" },
  { id: "CANCELLED", label: "Cancelado" },
];

// Traducao de status de pedido para exibicao.
export const ORDER_STATUS_PT: Record<string, string> = {
  UNPAID: "NAO PAGO",
  AWAITING_SHIPMENT: "AGUARD. ENVIO",
  AWAITING_COLLECTION: "AGUARD. COLETA",
  IN_TRANSIT: "EM TRANSITO",
  DELIVERED: "ENTREGUE",
  COMPLETED: "CONCLUIDO",
  CANCELLED: "CANCELADO",
};

// Parametros padrao para a estimativa de taxas (editaveis na UI).
// Valores ilustrativos — ajuste conforme o contrato/categoria da sua loja.
export const DEFAULT_FEE_CONFIG = {
  commissionRate: 8,
  transactionRate: 2,
};
