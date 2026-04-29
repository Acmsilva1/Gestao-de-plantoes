# Documentação técnica — GESTÃO DE PLANTÕES (repositório agregado)

Corpo técnico, impessoal. Âmbitos: **[B]** `api/` (servidor Node), **[F]** `web/` (SPA Vite + React), **[T]** contrato transversal. Layout modular alinhado a workspaces npm (`api`, `web`); ver também [docs/PIPELINE_E_ARQUITETURA.md](../docs/PIPELINE_E_ARQUITETURA.md).

## 0. Identificação do artefato **[T]**

| Campo | Valor |
|--------|--------|
| **DOC-ID** | `GDP-WEB-CORE-TEC-R01` |
| **Módulo** | Plataforma de gestão de plantões médicos (escala, trocas, cancelamentos, relatórios, predição operacional). |
| **Repositório** | `Gestao-de-plantoes` (monorepo npm workspaces: `api/`, `web/`). |
| **Plano** | Não aplicável. Não existe ficheiro `PLANO_*.md` na raiz do repositório. |
| **Identificação de artefatos** | Não aplicável. Não existe `IDENTIFICACAO_PADRAO.md` na raiz do repositório. |

---

## 1. Resumo funcional e utilizadores impactados **[T]**

O sistema expõe uma SPA React (Vite) consumindo uma API Express em Node. Os perfis de utilização são: **médico** (calendário, agenda, pedidos de troca, assumir vaga, cancelamento), **gestor** (acessos, editor de escala, modelos, ciência de trocas/assumir, decisão de cancelamentos, dashboards e relatórios analíticos) e **administrativo** (relatórios de produtividade, trocas e cancelamentos com exportação). O backend integra serviços de ETL, predição, calibração, agendamento (`CronService`), cache Redis e fila RabbitMQ opcionais, e persiste dados operacionais através da camada **dblocal** (Parquet/CSV em memória com orquestrador DuckDB). Utilizadores impactados: corpo clínico, gestão de unidade/rede e equipas de faturamento/auditoria que consomem exportações.

Dependências externas relevantes: ficheiros em `api/data/local/` (ou caminho `GDP_DBLLOCAL_CSV_DIR`), infra opcional Redis/RabbitMQ, e documentação complementar em `README.md`, `doc/`, `doc/PIPELINE_GUARD.md`, `docs/PIPELINE_E_ARQUITETURA.md`.

---

## 2. Superfícies, rotas e estrutura de navegação **[F]**

| ID interno | Rota SPA | Componente raiz (`web/src/...`) | Nota |
|------------|-----------|----------------------------------------|------|
| `LOGIN` | `/` | `features/auth/views/LoginView.jsx` | Entrada pública; escolha de perfil e redirecionamento. |
| `MED` | `/medico/*` | `features/doctor/views/DoctorView.jsx` | Protegida (`PrivateRoute`, `perfil === 'medico'`). |
| `GEST` | `/gestor/*` | `features/manager/views/ManagerView.jsx` | Protegida (`perfil === 'gestor'`); sub-rotas internas via `react-router-dom`. |
| `ADM` | `/admin/*` | `features/auth/views/AdminView.jsx` | Protegida (`perfil === 'admin'`). |

### 2.1 Elementos de UI oficiais em relação às superfícies

Não aplicável. Não existe registo formal de biblioteca de componentes “oficiais” além do uso de React, Tailwind via CDN no `index.html`, Lucide e estilos globais em `src/index.css` (classes utilitárias da app, por exemplo `app-shell-bg`, `glass-panel`).

---

## 3. Interface (frontend) **[F]**

A montagem da aplicação ocorre em `web/src/main.jsx` (React 18, `BrowserRouter` em `App.jsx`). O estado de sessão (`session`, `login`, `logout`, `loading`) reside em **`shared/context/AuthContext.jsx`**, com persistência em `localStorage` (`maestro-session`). A UI de negócio está em **`web/src/features/<domínio>/`** (auth, doctor, manager); código transversal em **`web/src/shared/`** (`models/api.js`, `components/`, `devTestProfiles.js`).

Integração HTTP: chamadas relativas a `/api/...`; em desenvolvimento o `vite.config.js` define `server.proxy['/api']` para `http://127.0.0.1:${GDP_API_PORT||PORT||3000}`. O consumo está distribuído pelas views e componentes (por exemplo `LoginView` chama `/api/medicos` e `/api/manager/perfis`; páginas de gestor e médico chamam rotas alinhadas ao inventário da secção 4).

Fluxo transversal **[F]** → **[B]**: a UI dispara `fetch`/`readApiResponse`; o processamento de negócio e persistência concretizam-se nos controllers e serviços referidos na secção 4.

---

## 4. Backend, API e processamento **[B]**

O servidor arranca em `api/server.js` (Express, CORS, JSON). Middleware em `/api` verifica disponibilidade de configuração de base (`hasDatabaseEnv` em `config/env.js`); rotas não encontradas respondem 404 JSON. Há serviço de ficheiros estáticos para `web/dist` quando existe build de produção.

Controllers principais: **`features/direcionador/DirecionadorService.js`** (médico, vagas públicas), **`features/manager/ManagerService.js`** (gestor), **`features/admin/AdminController.js`** (admin). A lógica de negócio extensa encontra-se em **`services/`** (por exemplo `PredictionEngine`, `CalibrationService`, `SchedulerService`, `CronService`, `DataTransportService`, `AdminService`, filas e cache).

### Inventário de API (resumo por superfície / módulo)

| ID ou módulo | Método e caminho | Observação |
|--------------|------------------|------------|
| `MODULO_UNICO` | `GET /api/health` | Estado da API, cache, fila e variáveis em falta. |
| `LOGIN` | `GET /api/medicos` | Lista de médicos para seleção no login. |
| `LOGIN` | `GET /api/manager/perfis` | Lista de perfis de gestor. |
| `MED` | `GET /api/medicos/:medicoId/calendario` | Calendário do médico. |
| `MED` | `GET /api/medicos/:medicoId/agenda` | Agenda. |
| `MED` | `GET /api/medicos/:medicoId/escala/opcoes-troca` | Opções para troca. |
| `MED` | `POST /api/medicos/:medicoId/escala/assumir` | Assumir escala. |
| `MED` | `POST /api/medicos/:medicoId/escala/pedido-assumir` | Pedido assumir. |
| `MED` | `POST /api/medicos/:medicoId/escala/pedido-troca` | Pedido de troca. |
| `MED` | `POST /api/medicos/:medicoId/escala/pedido-cancelamento` | Pedido de cancelamento. |
| `MED` | `GET /api/medicos/:medicoId/trocas` | Lista de trocas do médico. |
| `MED` | `POST /api/medicos/:medicoId/trocas/:pedidoId/responder` | Resposta do colega à troca. |
| `MED` | `POST /api/medicos/:medicoId/perfil` | Atualização de perfil. |
| `MED` | `GET /api/vagas` | Vagas públicas. |
| `MED` | `POST /api/vagas/:id/bloquear`, `DELETE .../bloquear`, `POST .../selecionar` | Reserva e seleção de vaga. |
| `GEST` | `GET /api/manager/analise-atendimento` | Dados analíticos históricos. |
| `GEST` | `GET /api/manager/dashboard-summary` | Resumo de dashboard. |
| `GEST` | `GET /api/manager/perfis` | Perfis gestor. |
| `GEST` | `GET /api/manager/medicos`, `POST .../acessos`, `POST .../perfil`, `POST /api/manager/medicos`, `DELETE ...` | Gestão de médicos e acessos. |
| `GEST` | `GET /api/manager/unidades` | Unidades. |
| `GEST` | `GET /api/manager/calendario/:unidadeId`, `GET /api/manager/agenda`, `GET /api/manager/agenda/resumo` | Calendário e agenda gestor. |
| `GEST` | `POST /api/manager/previsao`, `POST /api/manager/previsao/:unidadeId` | Ciclo de previsão / previsão por unidade. |
| `GEST` | `GET /api/manager/trocas-pendentes` | Feed de ciência (trocas). |
| `GEST` | `POST /api/manager/trocas/:pedidoId/decidir` | `410` — fluxo de aprovação de troca pelo gestor desativado. |
| `GEST` | `GET /api/manager/assumir-pendentes`, `POST /api/manager/assumir/:pedidoId/decidir` | Assumir vago — decisão gestor. |
| `GEST` | `GET /api/manager/cancelamentos-pendentes`, `POST /api/manager/cancelamentos/:pedidoId/decidir` | Cancelamentos. |
| `GEST` | `GET/POST/PATCH/DELETE/PUT` sob `/api/manager/escala*` | Editor de escala, visibilidade, importação, linhas. |
| `GEST` | `GET/POST/PUT/DELETE /api/manager/templates*` | Modelos de escala. |
| `GEST` | `POST /api/manager/escala/importar-template`, `POST .../limpar-mes` | Aplicar template / limpar mês. |
| `GEST` | `GET /api/manager/reports` | Dados de relatórios gestor. |
| `GEST` | `POST /api/manager/perfil/:id` | Perfil do gestor. |
| `ADM` | `GET /api/admin/reports/productivity`, `.../summary`, `.../exchanges`, `.../cancellations` | Relatórios (inclui formatos query conforme implementação). |
| `ADM` | `GET /api/admin/units`, `GET /api/admin/doctors` | Metadados de filtros. |
| `ADM` | `POST /api/admin/perfil/:id` | Perfil administrativo. |

---

## 5. Persistência, dados e consultas **[B]**

A persistência operacional em modo demonstração/local passa por **`api/data/local/db.js`**: singleton **`DblocalCsvOrchestrator`** (`lib/dblocalCsv/`), carregamento a partir de `env.dblocalCsvDir` (por omissão **`api/data/local/`**), integração DuckDB, seed sintético opcional (`seed.js`) e escrita Parquet condicionada a `GDP_DEMO_READ_ONLY` e `GDP_DBLLOCAL_SKIP_BOOT_PARQUET_SNAPSHOT`. Existência de esquemas de referência em `api/schema/` (por exemplo `db_schema_inference.json`, `supabase_schema.json`).

### Mapeamento de dados (exemplos)

| Área UI (ID §2) | Entrada de dados | Ficheiro backend / frontend | Objeto ou origem de dados |
|-----------------|------------------|----------------------------|---------------------------|
| `LOGIN` | Seleção de médico/gestor | `web/src/features/auth/views/LoginView.jsx` → `GET /api/medicos`, `GET /api/manager/perfis` | Tabelas carregadas no store dblocal conforme orquestrador |
| `MED` | Calendário e pedidos | `DoctorView.jsx` + chamadas `/api/medicos/...` | Linhas de escala, pedidos de troca/cancelamento no modelo local |
| `GEST` | Editor de escala | `ManagerEscalaEditorPage.jsx` etc. → `/api/manager/escala*` | Persistência via orquestrador em ficheiros Parquet/CSV |
| `GEST` | Dashboard / BI | `ManagerVisaoAnaliticaPage.jsx` → `/api/manager/dashboard-summary`, `analise-atendimento` | Agregados e séries derivadas dos dados locais |
| `ADM` | Relatórios | `AdminView.jsx` → `/api/admin/reports/*` | Consultas agregadas no `AdminService` / controlador |

SQL no browser: Não aplicável. Não há execução SQL no cliente; consultas ocorrem no servidor (DuckDB / serviços).

---

## 6. Segurança e conformidade (LGPD) **[T]**

- **Autenticação na UI**: o fluxo de login documentado na interface indica ausência de palavra-passe nesta versão de demonstração; a sessão é um objeto JSON em `localStorage`, identificador `maestro-session`. Não constitui autenticação forte nem adequada a produção sem camadas adicionais (OAuth, sessão servidor, HTTPS obrigatório).
- **Autorização**: separação por `perfil` no router (`PrivateRoute`); o servidor deve validar identidade e autorização em cada rota sensível — qualquer omissão na API expõe dados (revisão periódica recomendada).
- **Dados pessoais**: nomes, CRM, especialidade, unidade e identificadores de profissionais transitam na API e na UI; tratam-se como dados clínicos/identificativos sujeitos a LGPD em ambiente real. O `README.md` refere anonimização no pipeline ETL de produção; o modo local depende do conteúdo carregado em **`api/data/local/`**.
- **Medidas**: uso de HTTPS em produção, políticas de retenção, minimização de campos nas exportações administrativas e controlos de acesso por perfil institucional devem ser definidos fora deste documento quando o deploy for além de demonstração.

---

## 7. Infraestrutura, ambiente e operações **[B]**

| Tema | Detalhe |
|------|---------|
| Workspaces | Raiz `package.json`: workspaces `api`, `web`; scripts `dev:full` (API + Vite), `dev`, `build`, `infra:*` para Docker opcional. |
| Portas | API: `GDP_API_PORT` ou `PORT` ou `3000`. Frontend Vite: `5173` (configurável na linha de comando). |
| Variáveis | Ver `api/config/env.js`, `infra/env.example` e `README.md`: `ENABLE_REDIS`, `REDIS_URL`, `ENABLE_QUEUE`, `RABBITMQ_URL`, `GDP_DBLLOCAL_CSV_DIR`, `GDP_DEMO_READ_ONLY`, `DISABLE_PREDICTOR_SCHEDULER`, entre outras. |
| Web build | `web/vite.config.js`; variáveis `VITE_*` não são obrigatórias para o proxy (usa `loadEnv` para `PORT` alinhado à API). |
| Migrations SQL | O repositório referencia migrações em `model/` no `README.md` (ex.: ajustes de FK); operação `npm run sql:run -w api` para ficheiros SQL pontuais. |
| Pipeline | `pipeline:watch` / `pipeline:once` na raiz; configuração em `pipeline_guard_config.json`; documentação em `doc/PIPELINE_GUARD.md`. |
| CI | Não aplicável. Não há ficheiro de pipeline CI referenciado na raiz analisada para este documento. |

---

## 8. Observações técnicas e registo de revisão **[T]**

- O layout do repositório usa pastas **`api/`** e **`web/`**; na API os handlers HTTP de domínio estão em **`api/features/<domínio>/`** (direcionador, manager, admin) e serviços transversais em `services/`, `models/`, etc. Na web: **`web/src/features/<domínio>/`** + **`web/src/shared/`**. O mapeamento **[B]/[F]/[T]** mantém-se conceptualmente.
- A rota `POST /api/manager/trocas/:pedidoId/decidir` permanece registada como `410`, coerente com o fluxo em que trocas entre médicos não exigem aprovação do gestor (`README.md`, atualizações 2026-04-03).
- Riscos: sessão apenas no cliente; dados locais sensíveis em disco se **`api/data/local/`** contiver informação real; Redis/RabbitMQ desligados não impedem o modo de desenvolvimento descrito no `README.md`.

Documento revisado em 2026-04-24 — `GDP-WEB-CORE-TEC-R01`.
