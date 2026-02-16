# CRM Orcamentos

Plataforma React para montar orcamentos usando a planilha QQP e Orcamento.xlsx (SharePoint/Graph). Autenticacao Entra ID via MSAL, escolha de Materiais e Servicos diretamente das abas da planilha, calculo de totais (desconto/impostos) e exportacao (PDF/CSV/Excel).

## Stack
- React 18 + Vite 5 (JS) - React Router v7
- Tailwind 3 - lucide-react - Recharts
- Auth MSAL: `@azure/msal-browser` + `@azure/msal-react`
- Graph/SharePoint: `axios` + `xlsx`
- Exportacao: `jspdf` + `jspdf-autotable`
- Deploy: `gh-pages`

## Estrutura
- `index.html` restaura rota salva no sessionStorage (compat gh-pages).
- `public/404.html` salva `redirect-path` e envia para `/OrcamentoCRM/index.html`.
- `src/auth.js` MSAL config via env (clientId/authority/redirect/scopes/cache).
- `src/main.jsx` inicializa MSAL e aplica `BrowserRouter` com basename `/OrcamentoCRM`.
- `src/App.jsx` exige login popup, guarda usuario e protege rotas.
- `src/services/api.js` le a planilha do Graph (abas Materiais/Servicos) com cache em memoria e refresh manual.
- `src/services/quotes.js` CRUD/localStorage dos orcamentos + calculo de totais.
- Paginas: `Dashboard`, `Orcamentos` (montar/editar), `Produtos` (catalogo Materiais/Servicos), `Relatorios`.
- Componentes: `QuoteModal` (builder Materiais/Servicos + cliente), `QuotesTable`, `ProductsTable`, `ExportButtons`, `ScrollToTopButton`, `LogoutButton`.

## Env (.env)
Ja preenchido para QQP e Orcamento.xlsx:
```
VITE_MSAL_CLIENT_ID=2d7bcc44-8337-42ec-a3e2-6ba7c9bda91f
VITE_MSAL_AUTHORITY=https://login.microsoftonline.com/common
VITE_MSAL_REDIRECT_URI=http://localhost:5173/OrcamentoCRM/
VITE_MSAL_REDIRECT_URI_PROD=https://cleverconnection.github.io/OrcamentoCRM/
VITE_MSAL_SCOPES=User.Read Files.Read Files.Read.All Sites.Read.All
VITE_MSAL_CACHE_LOCATION=localStorage

VITE_ROUTER_BASENAME=/OrcamentoCRM
VITE_APP_TITLE=CRM Orcamentos

VITE_GRAPH_SITE_ID=d21efab6-83a1-47d8-86ec-68296b31442f
VITE_GRAPH_DRIVE_ID=b!tvoe0qGD2EeG7GgpazFEL5xBSoVgpDdMqENBL3FYLvPKjufZ6TUjRq1KvbMjsPUY
VITE_GRAPH_ITEM_ID=01S4Q2WRY2BQNWH4RWMRELZIDQQ6IBN4DW
VITE_GRAPH_SHEET_MATERIAIS=Materiais
VITE_GRAPH_SHEET_SERVICOS=Servicos
```

## Como funciona
- Autenticacao: loginPopup se nao houver conta; logoutPopup no header; cache no localStorage.
- Catalogo: Materiais e Servicos lidos via Graph `usedRange(valuesOnly=true)`; numeros de preco/quantidade sao normalizados (suporta "R$ 1.234,56").
- Builder de orcamento: em Orcamentos clique em "Novo orcamento", escolha cliente (nome/email/telefone), selecione Materiais ou Servicos, busque por nome/SKU/categoria, defina quantidade e adicione; aplique desconto/impostos; salva em localStorage.
- Exportacoes: PDF individual, CSV e Excel da lista de orcamentos.

## Scripts
- `npm run dev`
- `npm run build`
- `npm run preview`
- `npm run predeploy`
- `npm run deploy`

## Passos para testar
1) `npm install`
2) `npm run dev` e abrir http://localhost:5173/OrcamentoCRM/
3) Login MSAL (clientId ja configurado).
4) Em Produtos, confira Materiais/Servicos vindos da planilha QQP e Orcamento.xlsx.
5) Em Orcamentos, monte um novo orcamento escolhendo itens das abas, informe o cliente e salve/exporte.
