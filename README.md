## Implementação Kurio

Esta é a minha solução do desafio: um marketplace de NFTs (Kurio) com catálogo, detalhe, carrinho, checkout simulado, recibo, conta, perfil e carteiras, tudo responsivo. Os dados vêm de mocks MSW na camada de rede (REST e Socket.IO), sem backend. A Roboto Mono é servida localmente em `public/fonts/` (licença OFL). Como o arquivo de design não trouxe as artes isoladas, recortei os retratos de `public/art/` dos previews (`preview*.webp`) para uso local; essa é a única substituição de asset.

**URL pública:** https://kuriomarketplace.netlify.app/ · **Repositório:** https://github.com/DUARDO-D3V/NFT-Marketplace

### Requisitos

- Node.js 20 ou superior
- npm
- Chromium do Playwright para executar os testes E2E

### Executar localmente

```bash
npm install
npx playwright install chromium
npm run dev
```

Abra `http://localhost:5173`. O comando inicia o Vite; a aplicação ativa os handlers REST e WebSocket do MSW. Não é necessário um servidor de backend separado. Para testar a build otimizada, execute `npm run build` e depois `npm run preview`.

Os componentes `Button` e `Input` seguem o padrão shadcn/ui e usam Tailwind CSS. Foram integrados pontualmente às telas de autenticação e checkout para manter os estilos e layouts Kurio existentes durante a migração.

Copie `.env.example` para `.env` para ajustar a configuração:

| Variável | Padrão | Descrição |
| --- | --- | --- |
| `VITE_MOCK_API` | `true` | Inicia os handlers MSW; use `false` somente ao conectar um backend compatível. |
| `VITE_SOCKET_URL` | Origem atual | Endpoint Socket.IO opcional para backend real quando `VITE_MOCK_API=false`. |

### Fluxos de demonstração

- **Conta:** o botão “Entrar” abre um pop-up sem abandonar a tela atual; também é possível alternar para cadastro no próprio pop-up. Use `colecionador@kurio.test` / `kurio123` ou crie uma conta. O mock rejeita e-mail sem conta e senha incorreta; a sessão demonstrativa persiste no navegador.
- **Cadastro:** crie uma conta com nome, e-mail e senha de pelo menos oito caracteres. O mock rejeita e-mails repetidos e guarda uma credencial protegida por hash SHA-256.
- **Perfil e carteiras:** após entrar, abra “Minha conta” para editar dados, avatar, senha e carteiras simuladas. Carteiras EVM aceitam endereços Ethereum/Polygon de 20 bytes (`0x` + 40 dígitos hexadecimais); Solana usa endereços Base58. Carteiras e favoritos são associados ao e-mail da sessão.
- **Cupom:** `KURIO10` aplica 10% de desconto; qualquer outro código apresenta erro de validação.
- **Compra:** selecione a edição e quantidade, adicione o NFT, entre na conta, informe os dados e a carteira da rede correspondente e revise o resumo. A edição acompanha o item até o recibo; uma edição não pode exceder o limite de unidades do protótipo (máximo 10). Para esta demonstração, o carrinho aceita NFTs de uma rede por pedido. A API compara a cotação enviada com o preço e as taxas atuais antes de criar o pedido; alterações exigem revisão e nova confirmação. O REST cria um pedido pendente e os eventos WebSocket do MSW simulam a confirmação; o carrinho só é atualizado após confirmação. Nenhum pagamento ou transação real ocorre.
- **Tempo real:** handlers WebSocket do MSW, ligados por `@mswjs/socket.io-binding`, publicam alterações periódicas de preço e atualizações de status de pedidos. No mock, `socket.io-client` usa o transporte WebSocket (sem polling), e os eventos são reconciliados por REST.
- **Usuários fictícios:** `colecionador@kurio.test` / `kurio123` e `aurora@kurio.test` / `kurio456`.
- **Cenários de falha:** o seletor DEMO do cabeçalho (ou `localStorage["kurio:scenario"]`, enviado como `X-Kurio-Scenario`) oferece: rede lenta, latência variável, respostas fora de ordem, sem conexão, erro no catálogo, catálogo vazio, falha transitória (503), sem permissão (403), sessão revogada (401), cupom expirado, pagamento recusado, sessão expirada no pagamento, preço alterado ou edição esgotada ao confirmar, timeout após criar o pedido, falha ao favoritar, preços ao vivo e "Alterar preço via Socket.IO". Para reproduzir um fluxo de falha, escolha o cenário, execute a ação (por exemplo, confirmar o pedido) e volte para Normal para recuperar. A sessão expirada abre o login sobre o checkout, preservando os dados para retomar.
- **Reset:** "Reiniciar demonstração" no seletor DEMO restaura o catálogo, limpa todo o estado `kurio:*` (sessão, carrinhos, favoritos, perfis, carteiras e pedidos) e volta ao cenário Normal. Alternativamente, limpe os dados do site no navegador.

### Comandos

```bash
npm run dev
npm run typecheck
npm run lint
npm run build
npm run preview
npm run test:e2e
npm run audit:lighthouse
```

### Deploy no Netlify

O repositório inclui `netlify.toml` (build `npm run build`, publicação em `dist`, Node 20, `VITE_MOCK_API=true`) e o fallback `/* → /index.html` (status 200), que permite acesso direto e refresh de qualquer rota. Como os mocks (REST e Socket.IO) rodam no navegador via MSW, **nenhum backend ou servidor Socket.IO é necessário** na publicação.

Como publiquei (ou como publicar):

1. `npm ci && npm run build`, e conferir com `npm run preview`.
2. Arrastar a pasta `dist/` em *Netlify → Add new site → Deploy manually* (ou `npx netlify deploy --prod --dir=dist` após `npx netlify login`).
3. Alternativamente, conectar o repositório; as configurações vêm do `netlify.toml`.
4. Validar no site publicado: abrir uma rota direta (por exemplo `/nft/emerald-ape-042`), atualizar a página e usar o seletor DEMO em “Alterar preço via Socket.IO”.

O service worker do MSW (`public/mockServiceWorker.js`) é servido na raiz do site; o HTTPS do Netlify satisfaz o requisito do navegador.


Meus testes Playwright verificam pesquisa/filtros, eventos de preço pelo cliente Socket.IO, edição e quantidade no carrinho, login inválido, compra simulada com recibo, retomada após expiração de sessão e timeout, layout móvel, cadastro/perfil/carteiras, favoritos, recusa de pagamento, preservação do carrinho e snapshots visuais das telas principais em 390 px e 1440 px. Há também `flows`, `realtime` (eventos duplicados/antigos, reconexão, pedido pendente, clique repetido) e `journeys` (paginação com histórico, logout, rollback de favoritos, senha/avatar, 403, skeleton, reduced-motion, foco e overflow em 390/768/1440 px). Também há `commerce` (cupom, carrinho, isolamento entre usuários, idempotência, filtros combinados) e `a11y` (axe-core). Todas as specs rodam também no projeto `mobile`. A execução gera o relatório HTML em `playwright-report/`, snapshots em `tests/e2e/marketplace.spec.ts-snapshots/` e traces para falhas em `test-results/`.

Cada teste roda em um contexto novo do navegador, portanto com `localStorage` e estado MSW vazios (equivalente ao reset da demonstração); o cenário é definido por `kurio:scenario`, a latência pelos cenários `slow`/`variable-latency`/`out-of-order`, e o relógio do aviso em tempo real é controlado com `page.clock`. Os eventos dos testes de tempo real passam sempre pelo cliente Socket.IO.

A auditoria de acessibilidade (`a11y.spec.ts`) usa axe-core (WCAG A/AA) em início, detalhe, carrinho, pagamento, perfil e carteiras em 390 e 1440 px, além de alternativas textuais, menu móvel e foco do diálogo de sessão expirada. Ajustes de acessibilidade em relação ao layout: textos secundários (cinza-marrom) foram clareados para atingir contraste 4,5:1, e a paginação dos relacionados recebeu `role="img"` com rótulo. A regressão visual também tem baselines em 768 px.

Para atualizar os snapshots de forma intencional, execute `npm run test:e2e -- --update-snapshots` e revise as imagens geradas antes de incluí-las.

### Auditoria Lighthouse

Instale o Chromium do Playwright uma vez com `npx playwright install chromium` e execute `npm run audit:lighthouse`. O comando gera o build otimizado, sobe `vite preview` (cenário padrão dos mocks) e roda o Lighthouse 12.8.2 em um Chromium limpo, sem extensões e com perfil novo a cada medição. São 3 medições por página (início e detalhe do NFT) e perfil (mobile e desktop). A configuração está em [lighthouse/run.mjs](./lighthouse/run.mjs); os relatórios HTML/JSON de cada medição, `summary.json` e `summary.md` (medianas, versões e ambiente) ficam em `lighthouse/reports/`.

Resultado (mediana, Windows 10, Node 24, 16 CPUs):

| Página | Perfil | Perf | A11y | BP | SEO | LCP | CLS | TBT |
|---|---|---|---|---|---|---|---|---|
| Início | mobile | 85 | 100 | 96 | 92 | 3,69 s | 0 | 116 ms |
| Detalhe | mobile | 86 | 96 | 96 | 92 | 3,67 s | 0,006 | 104 ms |
| Início | desktop | 99 | 96 | 100 | 92 | 0,81 s | 0,004 | 0 ms |
| Detalhe | desktop | 99 | 96 | 100 | 92 | 0,83 s | 0,029 | 0 ms |

Abaixo da meta: Performance no mobile (83 e 85; meta 90). Causa: o app só renderiza depois de registrar o service worker do MSW e carregar o roteador (a ordem é obrigatória, pois o `socket.io-client` precisa herdar o WebSocket interceptado), formando uma cadeia de requisições que o throttling "Slow 4G" do perfil mobile penaliza (FCP ≈ 2,5 s, LCP ≈ 3,7 s). Esse custo existe apenas por causa da camada de mocks exigida no build. Melhorias aplicadas: preload da fonte e da imagem principal, `fetchpriority`, imagens abaixo da dobra com `loading="lazy"`, favicon embutido e skeletons com as dimensões do conteúdo (CLS ≈ 0). Medições feitas com extensões ativas ou no servidor de desenvolvimento (`npm run dev`) não são representativas.

### Limitações desta versão

A solução é uma demonstração: não há carteiras reais, gateway de pagamento nem backend de produção. Tudo roda com dependências públicas e mocks no navegador (MSW para REST e Socket.IO), sem serviços privados, e os dados do mock são locais ao navegador. O checkout aceita NFTs de uma única rede por pedido e até 10 cópias por edição, sem estoque real. O pedido fica pendente até um evento Socket.IO ser reconciliado pelo REST; em caso de timeout, repito a tentativa com a mesma chave de idempotência, sem duplicar a compra. A publicação depende do fallback de rotas do `netlify.toml`. Apenas a Performance mobile do Lighthouse ficou abaixo da meta (justificativa na seção anterior). Contratos, cache, sessão, reconciliação REST/Socket.IO, decisões de UX e desvios do Figma estão em `ARCHITECTURE.md` como solicitado.

O seletor DEMO fica em `src/mocks/demo-controls.tsx` (carregado sob demanda somente com mocks ativos) e o hook `window.__kurioSocket`, usado pelos testes, em `src/mocks/test-hooks.ts`; a interface de produção não contém lógica de mock. O projeto Playwright `mobile` (Pixel 5) executa todas as specs, pulando apenas controles exclusivos do desktop; `commerce.spec.ts` cobre cupom, carrinho, isolamento entre usuários, idempotência (409), validação de carteira e filtros combinados com histórico.
