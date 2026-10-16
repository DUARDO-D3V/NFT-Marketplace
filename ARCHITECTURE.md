# Arquitetura Kurio

## Aplicação e navegação

- React + TypeScript com Vite.
- TanStack Router define as rotas para catálogo, detalhe, carrinho, pagamento, conta e recibo. Busca e filtros do catálogo, incluindo limites de preço, ficam nos search params, permitindo restaurar o estado via histórico/refresh.
- TanStack Query mantém catálogo, sessão, carrinho e recibos no cache. Ações do carrinho atualizam o cache após sucesso; as consultas têm janela de frescor curta e uma tentativa de retry.
- Axios é o cliente REST usado pelas telas.
- Tailwind CSS está configurado e usado nas primitives compartilhadas de UI, com classes utilitárias para estados de foco, disabled e variantes.
- shadcn/ui segue o padrão copy-paste: `Button` e `Input` ficam em `src/components/ui/`, usando Radix Slot, CVA, `cn` e Tailwind. A configuração do gerador está em `components.json`.
- As telas continuam usando os seletores CSS Kurio existentes; as primitives são aplicadas pontualmente no envio do login/cadastro, checkout e campos de autenticação para preservar a geometria visual. Componentes ainda não migrados mantêm CSS próprio.
- O Playwright inclui snapshots de regressão para início, detalhe, carrinho e checkout em 390 px e 1440 px, além de fluxos mobile de perfil, carteiras e recibo. Os arquivos de referência ficam versionados em `tests/e2e/marketplace.spec.ts-snapshots/`.
- Executei o Lighthouse contra a build de produção servida pelo preview. `npm run audit:lighthouse` mede início e detalhe em perfis mobile e desktop, três vezes por página e perfil, e salva os relatórios HTML/JSON e as medianas em `lighthouse/reports/`. Os resultados e a justificativa para a Performance mobile, que ficou abaixo de 90, estão no README.

## Mocks REST e persistência

O MSW intercepta `/api/*` no navegador. Handlers e contratos ficam em `src/mocks/handlers.ts`, isolados da interface. A sessão, carrinho, cupom, perfil, carteiras, favoritos e pedidos ficam no Local Storage para sobreviver a refresh. O carrinho visitante é mesclado ao carrinho da conta no primeiro acesso autenticado; carrinhos e dados da conta ficam associados ao e-mail da sessão. O reset da demonstração ("Reiniciar demonstração" no seletor DEMO) restaura o catálogo e limpa todo o estado `kurio:*`.

Rotas REST simuladas:

`GET /api/nfts` retorna obras por página e recebe busca, rede, coleção, categoria, modo, ordenação, faixa de preço e página. A faixa de preço é ajustada por controles deslizantes acessíveis e aplicada ao catálogo.

| Método e caminho | Uso |
| --- | --- |
| `GET /api/nfts?q=&category=` | Listagem, busca e filtros |
| `GET /api/nfts/:id` | Detalhe |
| `GET /api/cart` | Consulta do carrinho e cotação |
| `POST /api/cart/items` | Inclusão |
| `PATCH /api/cart/items/:id` | Edição de quantidade |
| `DELETE /api/cart/items/:id` | Remoção |
| `POST /api/cart/coupon` | Validação de cupom |
| `GET /api/session`, `POST /api/session`, `DELETE /api/session` | Consulta, login e logout demonstrativos |
| `POST /api/accounts` | Cadastro com validação de conflito |
| `GET /api/profile`, `PUT /api/profile`, `PUT /api/profile/password` | Leitura/edição do perfil e alteração de senha |
| `GET /api/wallets`, `PUT /api/wallets`, `DELETE /api/wallets/:id` | CRUD de carteiras simuladas |
| `GET /api/favorites`, `PUT /api/favorites/:id` | Favoritos associados à sessão |
| `POST /api/orders` | Criação de pedido com `Idempotency-Key` |
| `GET /api/orders/:id` | Consulta do recibo |
| `GET /api/related-nfts` | NFTs relacionados (`exclude`, `offset`, `limit`) |

Valores de preço são mantidos como strings no transporte. O mock calcula a cotação e responde o recibo com snapshot dos itens e totais.

## Eventos

O handler `ws.link` do MSW intercepta a conexão WebSocket same-origin padrão do cliente Socket.IO (`/socket.io/`, normalizada pelo MSW para a origem); `@mswjs/socket.io-binding` adapta a conexão para os eventos Socket.IO. No modo mock, o cliente usa apenas o transporte WebSocket. Ele emite `nft.updated` com identificador do NFT, preço, versão e data. Para pedidos, a tela do recibo observa `mock.order.watch` e recebe `order.updated`; o cliente valida a sessão por REST antes de aplicar a transição terminal. Versões repetidas/antigas são ignoradas. O pedido nasce `pending` (inclusive o recusado) e o resultado final chega por `order.updated`, com `version` e usuário verificados. Hooks de teste no servidor simulado: `mock.nft.update` (altera preço/disponibilidade e emite `nft.updated`) e `mock.emit` (reemite payload arbitrário, para duplicatas e eventos antigos). Com mocks ativos, `window.__kurioSocket` expõe o socket para os testes E2E; eles disparam eventos sempre pelo cliente Socket.IO. Em reconexões, catálogo, carrinho e pedidos são reconciliados, e pedidos ainda pendentes voltam a ser observados.

O roteador e o cliente Socket.IO são importados somente após iniciar o MSW, pois o cliente captura o construtor WebSocket ao ser carregado.

O modo de mock não inicia um servidor de eventos separado e não requer backend. Para integração real, desative `VITE_MOCK_API` e configure `VITE_SOCKET_URL` para um servidor compatível com Socket.IO.

## Sessão e compra

Login, cadastro e logout são requests mockados. Contas criadas guardam apenas um hash SHA-256 da senha; login verifica uma conta cadastrada ou a conta de demonstração `colecionador@kurio.test` (`kurio123`), e rejeita credenciais desconhecidas. A autenticação pelo modal mantém a rota atual, incluindo o checkout e o contexto necessário para retomar após nova autenticação.

O checkout valida nome, usuário, e-mail da sessão, aceite dos termos e endereço da carteira conforme a rede; os mocks repetem as validações. A edição selecionada acompanha o item do carrinho ao snapshot do pedido, com limite de unidades validado no servidor mock. Para evitar composições de cadeia ambíguas, cada pedido da demonstração só aceita NFTs de uma rede. Antes de criar pedido, a API mock recalcula a cotação e compara preço, desconto, taxas e itens com a confirmação atual do cliente; qualquer divergência rejeita a tentativa para revisão. O REST cria o pedido como `pending`; o recibo só é apresentado depois do evento `order.updated` confirmado. A confirmação remove do carrinho apenas as quantidades registradas no snapshot do pedido, enquanto uma recusa mantém os itens. A chave de idempotência e a impressão digital da tentativa ficam em Session Storage até a confirmação, permitindo repetir ou reconciliar a mesma tentativa após timeout/refresh sem duplicar a compra. O seletor DEMO configura as falhas simuladas via cabeçalho Axios, sem colocar lógica de cenário na interface.

## Interface e assets

As artes são recortes locais dos previews fornecidos (substituição de asset em relação ao Figma), pois o arquivo de entrada não continha as imagens individuais. A página inicial reproduz a composição da referência em 768 px: hero, catálogo em três colunas, filtros/capa lateral, chamadas promocionais, diário e rodapé completo. A interface usa Roboto Mono empacotada localmente (licença OFL em `public/fonts/RobotoMono-OFL.txt`), cores e molduras inspiradas nas capturas. Breakpoints adaptam catálogo, navegação, detalhes, carrinho e checkout para telas estreitas; `prefers-reduced-motion` reduz animações.

As primitives shadcn/ui são adaptadas à paleta e tipografia Kurio, com Tailwind para estados e variantes; o CSS existente continua responsável pela composição das telas. Isso permite migrar controles por área sem substituir de uma vez os estilos e arriscar divergência do Figma.

O hero tem um carrossel de trés destaques, com pontos clicçveis em desktop e mobile, arraste horizontal em telas de toque e troca automçtica a cada 6 s, pausada com mouse ou foco no hero e desligada com prefers-reduced-motion. Entre pçginas uso um fade de 0,18 s apenas em CSS (opacidade), aplicado apõs a navegação, sem atrasar a rota nem alterar o CLS.

A página de detalhes usa o mesmo layout para todos os NFTs, com galeria, abas de detalhes/avaliações e recomendações. As opções de edição são botões selecionáveis e limitam a quantidade conforme o tamanho da edição (até o máximo de 10 unidades suportado pelo carrinho demonstrativo). A identidade textual da marca é apresentada como KURIO, sem símbolo de letra.

A confirmação do pedido é apresentada como recibo compacto com dados da transação, itens, taxa e total, usando a composição de referência; o atalho do explorador abre a busca da transação simulada no Etherscan.

Em telas estreitas, navegação de conta, formulários de perfil e carteiras e recibos são reorganizados para leitura e interação por toque, sem alterar a composição desktop. A inscrição na newsletter informa que não está disponível na demonstração; links de coleções aplicam filtros reais no catálogo e links de redes sociais abrem seus destinos externos.

## Contratos REST

Todas as chamadas passam pelo cliente Axios (`src/api.ts`) e são atendidas por handlers MSW (`src/mocks/handlers.ts`). Erros seguem `{ "message": string }` com os status abaixo.

| Recurso | Endpoint | Observações |
| --- | --- | --- |
| Sessão | `POST /api/accounts`, `POST /api/session`, `GET /api/session`, `DELETE /api/session` | 409 e-mail já cadastrado, 401 credenciais inválidas ou sessão expirada |
| NFTs | `GET /api/nfts?q&network&collection&category&mode&sort&minPriceCents&maxPriceCents&page`, `GET /api/nfts/:id` | resposta paginada `{ items, total, page, pageSize }`; 404 para id inexistente |
| Favoritos | `GET /api/favorites`, `PUT /api/favorites/:id` | por usuário; inclusão e remoção idempotentes |
| Carrinho | `GET /api/cart`, `POST /api/cart/items`, `PATCH`/`DELETE /api/cart/items/:id`, `POST /api/cart/coupon` | a resposta já é a cotação (subtotal, desconto, taxa, total); 422 cupom inválido |
| Pedidos | `POST /api/orders`, `GET /api/orders/:id` | cabeçalho `Idempotency-Key`; mesma chave e mesmo conteúdo recupera o mesmo pedido, conteúdo diferente gera 409; 409 também para cotação desatualizada ou edição esgotada; 403 para pedido de outro usuário |
| Perfil | `GET`/`PUT /api/profile`, `PUT /api/profile/password` | 422 validação, 403 sem permissão |
| Carteiras | `GET`/`PUT /api/wallets`, `DELETE /api/wallets/:id` | 422 endereço inválido para a rede |

Falha transitória é representada por 503 com `Retry-After`; sessão inválida por 401.

## Política de cache, retries e sincronização

- `staleTime` de 30 s e sem refetch ao focar a janela: a sincronização vem dos eventos Socket.IO e da reconciliação após reconexão.
- Consultas tentam uma nova vez em falhas transitórias (rede, 5xx); respostas 4xx nunca são repetidas. Mutations nunca repetem sozinhas; a criação de pedido usa a chave de idempotência para uma nova tentativa manual segura.
- Todas as consultas recebem o `signal` do TanStack Query, então respostas de buscas antigas são canceladas ou descartadas.
- Chaves de favoritos, perfil e carteiras incluem o e-mail do usuário; ao entrar ou sair o cache é limpo, isolando dados entre usuários.
- Um 401 em qualquer consulta ou mutation zera a sessão em cache, e as rotas privadas (`/account/profile`, `/account/wallets`, `/order/$orderId`) redirecionam para `/account?redirect=...` via `beforeLoad` do TanStack Router.
- Favoritar usa atualização otimista com rollback em caso de falha.
- Após mutations, o carrinho e a lista de NFTs são invalidados; eventos `nft.updated` e `order.updated` só são aplicados se a versão for maior que a já conhecida.

## Transporte Socket.IO nos mocks

O cliente usa `socket.io-client` e o MSW intercepta o WebSocket com `ws.link` e `@mswjs/socket.io-binding`. Limitações: apenas o transporte `websocket` (sem long-polling); o servidor existe só no navegador da aba, então não há sincronização entre abas ou dispositivos; eventos duplicados ou antigos são descartados pelo cliente por versão; após reconectar, o cliente reconcilia catálogo, carrinho e pedidos pendentes pela API REST.

## Cenários de demonstração e reset

Seletor DEMO (ou `localStorage["kurio:scenario"]`): `slow`, `variable-latency`, `out-of-order`, `offline`, `catalog-error`, `empty-catalog`, `transient-failure`, `forbidden`, `session-revoked` (401 em `/api/profile` com sessão local ativa), `coupon-expired`, `payment-declined`, `session-expired`, `quote-changed-before-order`, `sold-out-before-order`, `order-timeout`, `favorites-error`, `live-prices` (deriva aleatória de preços por Socket.IO) e `price-change`. Os dados seed ficam em `src/mocks/fixtures.ts` (16 NFTs, 2 páginas). O catálogo devolve `facets` com contagens para os filtros. Usuários de teste: `colecionador@kurio.test` / `kurio123` e `aurora@kurio.test` / `kurio456`. "Reiniciar demonstração" restaura o catálogo, limpa todo o estado `kurio:*` e volta ao cenário padrão.

## Acessibilidade

Diálogos e drawers prendem o foco e fecham com Escape; campos inválidos usam `aria-invalid` e `aria-describedby`; mutations e eventos em tempo real são anunciados em regiões `aria-live`. Na home mobile o cabeçalho é omitido conforme o layout do Figma (desvio de acessibilidade que decidi manter); o login continua acessível pelas demais telas. Para atingir contraste 4,5:1, clareei os textos secundários marrom-acinzentados em relação ao Figma, e a paginação dos relacionados ganhou `role="img"` com rótulo. O axe-core (WCAG A/AA) passa em início, detalhe, carrinho, pagamento, perfil e carteiras em 390 e 1440 px.

## Limitações conhecidas

- O perfil e as carteiras têm os campos essenciais do protótipo, mas não incluem upload remoto nem validação de endereço em uma rede real.
- O login, as carteiras e o checkout são autenticação e validação demonstrativas no navegador; não conectam extensões nem submetem transações reais.
- O carrinho do protótipo aceita uma rede por pedido e no máximo 10 unidades por edição; não há inventário on-chain nem estoque autoritativo.
- O estado pendente e os eventos de pedido são simulados localmente por MSW; não há persistência distribuída entre dispositivos.
- Filtros de coleção/rede, ordenação e paginação são aplicados no cliente após a consulta de busca; não há backend remoto.
- A cotação é uma simulação e não representa preços ou taxas reais.
- A Performance mobile do Lighthouse ficou entre 83 e 85, abaixo da meta de 90. O motivo é a camada de mocks, que precisa ser iniciada antes do roteador e do socket (ver "Eventos").

## Testes e isolamento dos mocks

- O seletor DEMO vive em `src/mocks/demo-controls.tsx`, carregado sob demanda apenas com os mocks ativos. O hook `window.__kurioSocket`, usado pelos testes, fica em `src/mocks/test-hooks.ts`. Mantive a lógica de mock fora da interface de produção.
- O projeto Playwright `mobile` (Pixel 5) executa todas as specs; os testes de controles exclusivos do desktop são pulados com `test.skip(isMobile)`.
- Os testes cobrem os 12 itens do desafio: `marketplace`, `flows`, `journeys`, `commerce` (cupom, carrinho, troca de usuário, idempotência 409, carteiras, filtros combinados com histórico, 401), `realtime` (eventos duplicados ou antigos, reconexão, pedido pendente, limpeza de listeners) e `a11y` (axe-core). Há também a medição de CLS dos skeletons e a regressão visual.
