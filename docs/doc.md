# Documentação Técnica — Gestão de Plantões

## 1. Visão Geral da Arquitetura

O sistema **Gestão de Plantões** é uma aplicação hospitalar focada na gestão, acompanhamento, predição e dashboard operacional de escalas médicas. É estruturado como um **Monorepo** arquitetado sobre o ecossistema JavaScript (Node.js e React).

* **Frontend:** Single Page Application (SPA) utilizando React.js em ambiente Vite.
* **Backend:** API REST construída em Node.js com Express.
* **Persistência de Dados:** Modelo híbrido. O banco principal é o Postgres (gerenciado via Supabase), mas possui suporte a uso de tabelas SQLite/CSV locais (`DB local/`) via camada de abstração para modo analítico offline ou ambientes isolados.
* **Comunicação em Tempo Real / Infraestrutura Avançada:** Integrações (podendo ser geridas via Docker Compose) de Redis (cacheamento rápido) e RabbitMQ (mensageria baseada em eventos de escalonamento).

---

## 2. Padrões de Projeto (MVC Adaptado)

As diretrizes do projeto ditam uma segregação de responsabilidades forte, deixando o frontend restrito a um "Thin Client" (cliente magro) e alocando toda a robustez de cálculo no backend (Node.js).

### 2.1. Backend (`/backend`)
* **`controllers/`**: Recebe requisições HTTP, valida escopo (Scope Checking) e faz proxy para a camada de serviços. (Ex: `ManagerService.js`).
* **`repositories/`**: Centraliza chamadas ao banco. Onde ocorre a orquestração de leituras concorrentes antes de devolver ao model/controller. (Ex: `dashboardOrchestrator.js`).
* **`models/`**: Scripts de conexão física com o banco, queries de Supabase SDK e leitura de CSV. (`dbModel.js`).
* **`services/`**: Concentra lógicas pesadas: motores de predição de alta demanda, inteligência de ETL, formatação e agregação BI (Business Intelligence).
* **`lib/`**: Centraliza constantes de negócio puras (limites de tempo, cálculos de calendários mensais, regras de horas por plantão).

### 2.2. Frontend (`/frontend`)
* **`views/`**: Componentes-chave de roteamento. Páginas que abrigam layout macro e fetch de dados da API.
* **`components/`**: Arquivos puros de UI como Modais, Filtros, Botões.
* **`models/`**: Onde as chamadas raw do Fetch (`api.js`) são tratadas e convertidas de JSON para o formato tolerado pelos componentes.
* **`context/`**: Regula os JWT/Tokens de acesso com os Providers de React Context (`AuthContext`), gerenciando de maneira universal qual o `gestorId` / Regional atualmente setado.

---

## 3. Lógica Analítica e Dashboard

Um dos maiores diferenciais recentes da plataforma é que o cálculo de "Breakdown de Ocupações", totais de escalas (ocupadas vs. vazias) e comparações entre unidades foi estritamente **movido para o Backend**.

**O Fluxo de Dashboard (Ex: Visão Comparativa BI):**
1. O usuário (Gestor) clica em duas unidades para comparar (Ex: *PS Sul* e *PS Norte*).
2. O React dispara: `GET /api/manager/dashboard-summary?month=2026-04&unidadeIds=id_A,id_B`
3. O Backend recebe as _query params_, o `dashboardOrchestrator` executa Queries no Postgres isolando aqueles *IDs*.
4. O Backend consolida, iterando as matrizes e devolve um bloco embutido `"summary"` contendo todos os totais.
5. O React apenas exibe no pacote Recharts (PieChart, BarChart), sem nenhum `useMemo` iterador local, garantindo zero latência no device do cliente (Thin Client).

---

## 4. Workspaces e Ferramentas

O projeto utiliza **NPM Workspaces**. Fazer `npm install` na root do projeto instala simultaneamente as dependências nas pastas `frontend` e `backend`.

### Comandos Principais:
| Comando Base | Efeito |
| -- | -- |
| `npm run dev:full` | Sobe paralelamente Porta 3000 (API) e Porta 5173 (Vite). Ideal para ambiente de desenvolvimento. |
| `npm run dev` | Apenas servidor Express em modo `--watch`. |
| `npm run frontend:dev` | Sobe o HMR (Hot Module Replacement) puro do frontend React. |
| `npm run build` | Processa o Vite, gerando o bundle SPA de produção `/dist`. O script `server.js` do lado backend está desenhado para hospedar este SPA estático na raiz em ambientes Live (sem uso de dois servidores). |
| `npm run pipeline:once` | Um Hook automático que valida segurança de API e sanidade de código em Python antes de cada commit. |

---

## 5. Práticas de Segurança e Auth

- **Scope Injection:** Todo endpoint gerencial passa por `getScopedManager(req, res)`. Administradores só consultam/modificam plantas e escalas restritas às suas propriedades e perfis delegados.
- **Master Admin Bypass:** Gestores Máster possuem a `flag` `isMaster = true`, isentando-os dos filtros de restrição de array nas listagens de unidades.
- **Environment Isolation:** As chaves de JWT e URLs de DB ficam apenas no Server Layer (`.env`). O "Thin client" nunca possui conexões diretas via SDK do Supabase; ele as requisita via `/api/...`, o que corta qualquer exploração de vetores por injeção na UI.

---

## 6. Stack e Tecnologias Adicionais

* **Recharts:** Biblioteca para painéis gráficos e tortas analíticas no React.
* **Tailwind CSS:** Engine funcional para CSS, altamente adotada de forma limpa nos arquivos JSX (dispensando `.css` monstruosos).
* **Date-fns & Dayjs:** Manipuladores de timezone e calendário cruciais na engenharia dos turnos hospitalares.
* **Integração Futura:** `WhatsAppService` e Oracles ETLs previstos em Roadmap. (Mais sobre nas docs isoladas: `checkpoint.md` e `WHATSAPP.md`).
