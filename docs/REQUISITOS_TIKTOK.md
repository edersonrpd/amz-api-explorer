# Levantamento de Requisitos — TikTok Shop API Explorer

> Documento de requisitos (sem código) para construir uma aplicação análoga à
> `amz-api-explorer`, porém integrada à **TikTok Shop Partner API**.
> Base do mapeamento: painel de vendedor (produtos, pedidos, finanças, catálogo)
> com frontend React 19 + Vite + Tailwind e proxy Express.

## 0. Decisões fechadas com o solicitante

| # | Pergunta | Decisão |
|---|----------|---------|
| 1 | Ecossistema TikTok | **TikTok Shop** (Partner/Seller API) — análogo de e-commerce da SP-API |
| 2 | Mercado-alvo | **Brasil** (TikTok Shop BR) |
| 3 | Modelo de credenciais | **Token colado pelo usuário** (mesma UX do app atual). O usuário cola o `access_token`; `app_key`/`app_secret` ficam no backend para assinar as requisições |
| 4 | Estimativa de taxas | **Sim**, incluir estimativa de taxas/comissão (com ressalva: TikTok não tem API oficial de estimativa pré-venda — será cálculo aproximado, ver §7) |

> **Segurança:** nenhum token real é versionado neste repositório. O exemplo de
> token fornecido durante o levantamento é tratado como segredo e deve ser
> revogado/rotacionado, pois foi exposto em texto aberto. Tokens reais vivem
> apenas em variáveis de ambiente do backend ou são colados em runtime pelo
> usuário — nunca em arquivos do projeto.

## 1. Objetivo

Replicar a experiência da `amz-api-explorer` (inspeção de catálogo, pedidos e
finanças de um vendedor) usando a **TikTok Shop Partner API** no lugar da Amazon
SP-API, preservando a UX (abas, tabela-resumo, drawer de JSON cru, exportação
XLS, toasts, estados de loading/empty) e adaptando à autenticação e ao modelo de
dados do TikTok Shop para o mercado brasileiro.

## 2. Mapeamento conceitual Amazon → TikTok Shop

| Conceito Amazon (atual) | Equivalente TikTok Shop | Observação |
|---|---|---|
| Access Token (LWA) colado | `access_token` colado | Mantém a UX atual de colar o token |
| Seller ID | `shop_id` / `shop_cipher` | Obtido automaticamente via "Get Authorized Shops" a partir do token |
| Marketplace ID (fixo BR) | Loja/região BR | Domínio único `open-api.tiktokglobalshop.com`; tokens BR começam com `ROW_` |
| `getListingsItem` / `searchListingsItems` | **Product API** — search / detail | Busca por `product_id` ou `seller_sku` |
| Orders API (`getOrders`, `getOrderItems`) | **Order API** — order search / detail | |
| Finances API (eventos financeiros) | **Finance API** — statements / settlements | Dados de acerto pós-venda |
| Product Fees API (estimativa) | **Cálculo aproximado** | Sem API oficial pré-venda (ver §7) |
| Reports API (extração de todos anúncios) | **Product list paginada** | Loop de `page_token`, não gera documento TSV/S3 |
| Exportação XLS (`xlsx`) | Igual | Biblioteca e lógica reaproveitáveis |
| Proxy hex-encode anti-WAF | Proxy de **assinatura HMAC** | Mudança arquitetural central (ver §4) |

## 3. Requisitos Funcionais (RF)

### Autenticação & Conexão
- **RF-01** — Campo para o usuário colar o `access_token` (UX idêntica ao app atual).
- **RF-02** — A partir do token, chamar "Get Authorized Shops" para obter e
  selecionar automaticamente o `shop_cipher` / `shop_id` da loja BR (sem o usuário
  precisar digitá-lo).
- **RF-03** — Indicador de status de conexão (token válido / expirado / loja
  selecionada), análogo ao "Conectado / Credenciais ativas" atual.
- **RF-04** — Mensagem clara quando o token estiver expirado, orientando o usuário
  a gerar/colar um novo (já que o fluxo é por token colado, não há refresh
  automático nesta versão).

### Aba Produtos (análogo a "Listings / Itens")
- **RF-05** — Buscar produtos por `seller_sku` / `product_id`, com suporte a lote
  e paginação, respeitando o rate limit (QPS) da Product API.
- **RF-06** — Tabela-resumo reaproveitando o layout atual: SKU, título, ID do
  produto, status, preço, estoque e status da consulta.
- **RF-07** — Detalhe do produto: atributos, variações/SKUs, imagens, preço,
  estoque e status de aprovação — com drawer de JSON cru.
- **RF-08** — Exportar produto individual e lote para XLS.

### Aba Pedidos
- **RF-09** — Buscar pedidos por período (presets 7/30/90 dias + data customizada)
  e por ID(s) de pedido.
- **RF-10** — Filtro por status do TikTok Shop: `UNPAID`, `AWAITING_SHIPMENT`,
  `AWAITING_COLLECTION`, `IN_TRANSIT`, `DELIVERED`, `COMPLETED`, `CANCELLED`
  (rótulos traduzidos para PT-BR).
- **RF-11** — Detalhe do pedido em modal: itens, valores, quantidades e dados de
  acerto financeiro quando disponíveis. Respeitar mascaramento de PII
  (comprador/endereço) conforme regras do TikTok.
- **RF-12** — Paginação ("carregar mais") via `next_page_token` e ordenação por
  data / ID / total.

### Aba Catálogo Completo (análogo a "Todos os Anúncios")
- **RF-13** — Extrair todos os produtos da loja percorrendo a paginação completa
  (loop de `page_token`), com indicador de progresso.
- **RF-14** — Preview limitado (ex.: 200 linhas) + exportação completa para XLS.

### Estimativa de taxas (RF-04 do escopo)
- **RF-15** — Calcular estimativa de taxas/comissão por produto ou item de pedido
  a partir de parâmetros configuráveis (ver §7), exibindo a taxa estimada e o
  valor líquido aproximado ao vendedor.

### Transversais
- **RF-16** — Tratamento de erros traduzido (PT-BR) com mensagens específicas por
  código: token expirado/ inválido, falta de permissão/escopo, rate limit (QPS),
  assinatura inválida, loja não autorizada.
- **RF-17** — Toasts de feedback e estados de loading/empty (reaproveitáveis do
  app atual).

## 4. Diferenças arquiteturais críticas (o que muda de verdade)

1. **Assinatura HMAC-SHA256 obrigatória por requisição.** Toda chamada exige um
   parâmetro `sign` calculado com `app_secret` + path + parâmetros ordenados +
   body + `timestamp`. Consequência: **`app_secret` vive somente no backend**. O
   proxy deixa de ser "anti-WAF" e passa a ser o componente que **assina** cada
   requisição. Mesmo com o token colado pelo usuário, o backend precisa de
   `app_key`/`app_secret` para montar a assinatura.
2. **`shop_cipher` por loja.** A maioria dos endpoints exige o cipher correto;
   ele é obtido via "Get Authorized Shops" a partir do token (RF-02).
3. **Versionamento por data nos endpoints** (ex.: `/product/202309/...`). As
   versões devem ser confirmadas contra a documentação vigente do TikTok Shop.
4. **Sem "Reports document" via S3.** A extração de catálogo é paginação direta,
   não geração assíncrona + download de TSV comprimido (GZIP). O fluxo de polling
   do app atual (createReport → getReport → getReportDocument → download) é
   removido e substituído por loop de paginação.
5. **Rate limits por QPS por API.** A estratégia de backoff exponencial em 429 já
   existente é reaproveitável, mas precisa recalibração por endpoint.
6. **PII / compliance.** Dados de comprador e endereço no TikTok Shop têm regras
   de acesso e mascaramento mais rígidas — requisito de compliance.
7. **Sem estimativa de taxa pré-venda nativa** (detalhado em §7).

## 5. Requisitos Não-Funcionais (RNF)

- **RNF-01** — `app_key` / `app_secret` nunca expostos ao frontend (somente no
  `.env` do backend).
- **RNF-02** — Tokens reais nunca versionados; colados em runtime ou em `.env`.
- **RNF-03** — Stack mantida: React 19 + Vite + Tailwind + Express (proxy) +
  `xlsx`, maximizando reaproveitamento do código atual.
- **RNF-04** — i18n em PT-BR; formatação de moeda em BRL (R$) e fuso
  `America/Sao_Paulo` (já existentes no app atual).
- **RNF-05** — Resiliência a rate limit (backoff exponencial) e a respostas
  não-JSON, reaproveitando o tratamento atual.

## 6. Fluxo de credenciais (modelo "token colado")

```
Usuário cola access_token (ROW_…)
        │
        ▼
Backend (proxy) ── lê app_key/app_secret do .env
        │
        ├─ Get Authorized Shops  → obtém shop_cipher/shop_id da loja BR (RF-02)
        │
        └─ Para cada chamada: monta params + timestamp + body
                              → calcula sign (HMAC-SHA256 com app_secret)
                              → envia com header x-tts-access-token
```

Variáveis de ambiente do backend (`.env`, fora do versionamento):
- `TIKTOK_APP_KEY`
- `TIKTOK_APP_SECRET`
- `APP_URL` (callback/links self-referential, já existe no app atual)

O `access_token` **não** vai no `.env`: é colado pelo usuário na UI, como hoje.

## 7. Estimativa de taxas no TikTok Shop (ponto de atenção)

O TikTok Shop **não oferece** um endpoint equivalente ao `getMyFeesEstimate` da
Amazon (estimativa pré-venda). As taxas reais aparecem no **acerto financeiro
(settlement) pós-venda**. Para atender RF-15, opções de design:

- **Opção A (recomendada) — Estimativa por parâmetros configuráveis:** o app
  calcula a taxa a partir de uma tabela de fees editável (ex.: comissão % por
  categoria + taxa de transação % + eventual comissão de afiliado %). Transparente
  e funciona pré-venda, mas depende dos valores informados.
- **Opção B — Taxa efetiva histórica:** derivar o percentual médio de taxa a
  partir dos settlements reais (Finance API) e aplicá-lo como estimativa. Mais
  preciso, mas exige histórico de vendas e só reflete o passado.
- **Opção C — Híbrido:** usar settlement quando o pedido já tem acerto; cair para
  parâmetros configuráveis quando não há.

> Decisão pendente: qual opção adotar (sugestão: começar pela **A**, evoluir para
> **C**).

## 8. Pré-requisitos externos (conta TikTok)

- Conta no **TikTok Shop Partner Center** com **app aprovado** e escopos: Product,
  Order, Finance, Authorization.
- Loja BR autorizada ao app (gera o `access_token` que o usuário cola).
- `app_key`, `app_secret` e URL de callback registrada.

## 9. Roadmap sugerido (fases)

1. **Fundação (maior risco — fazer primeiro):** proxy backend com assinatura HMAC
   + leitura do token colado + "Get Authorized Shops" + seleção de loja.
2. **Produtos:** busca por SKU/ID, detalhe, drawer JSON, export XLS.
3. **Pedidos:** lista, filtros por status/período/ID, modal de detalhe, paginação.
4. **Catálogo completo + Finanças + Estimativa de taxas (§7).**

## 10. Perguntas remanescentes

1. **Estimativa de taxas:** confirmar a opção de §7 (sugestão: A → C).
2. **Escopos do app:** o app TikTok já possui as permissions Product/Order/Finance
   aprovadas?
3. **Renovação de token:** ok manter sem refresh automático nesta v1 (usuário
   recola quando expira), ou já prever refresh token no backend numa v2?
4. **Variações de produto:** exibir cada variação/SKU como linha própria na tabela
   ou agrupar por produto-pai?
