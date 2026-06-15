# TikTok Shop API Explorer

Aplicação independente para inspecionar **produtos, pedidos e catálogo** de uma
loja **TikTok Shop** (mercado Brasil), via TikTok Shop Partner/Open API.

É um **sistema separado** do `amz-api-explorer` (Amazon SP-API): tem seu próprio
`package.json`, servidor e frontend, sem nenhum acoplamento de código.

## Arquitetura

- **Frontend** React 19 + Vite + Tailwind (`src/`).
- **Backend/proxy** Express (`server.ts`) que **assina** cada requisição com
  HMAC-SHA256. O `app_secret` vive somente no servidor e nunca chega ao browser.
- Modelo de credencial: o usuário **cola o access token** na UI; a loja BR é
  selecionada automaticamente via "Get Authorized Shops" (obtém o `shop_cipher`).

## Pré-requisitos

- Node.js
- Um app aprovado no **TikTok Shop Partner Center** com os escopos Product,
  Order, Finance e Authorization, e uma loja BR autorizada.

## Configuração

1. `npm install`
2. Copie `.env.example` para `.env` e preencha:
   - `TIKTOK_APP_KEY`
   - `TIKTOK_APP_SECRET`
   - `TIKTOK_BASE_URL` (padrão `https://open-api.tiktokglobalshop.com`)
3. `npm run dev` e acesse `http://localhost:3000`
4. Cole o `access_token` da loja e clique em **Conectar**.

## Abas

- **Produtos** — busca por Seller SKU(s) ou listagem; detalhe em JSON; export XLS.
- **Pedidos** — busca por período/status; detalhe em modal com **estimativa de
  taxas** (percentuais configuráveis); export XLS.
- **Catálogo Completo** — percorre toda a paginação e exporta a lista inteira.

## Observações

- **Estimativa de taxas:** o TikTok Shop não oferece estimativa pré-venda como a
  Amazon. O cálculo aqui é aproximado, baseado em comissão e taxa de transação
  configuráveis. As taxas reais aparecem no acerto (settlement) pós-venda.
- As versões de endpoint (ex.: `202309`) seguem a documentação vigente do
  TikTok Shop e podem precisar de atualização.
- Nunca versione tokens/segredos reais — eles ficam no `.env` (ignorado pelo git).
