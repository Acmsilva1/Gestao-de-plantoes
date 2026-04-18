# agents.md — Gestão de Plantões

**Ficheiro único** na **raiz** do repositório (`Gestao-de-plantoes/agents.md`), nome em **minúsculas**. Não usar `AGENTS.md` nem duplicar este conteúdo em `backend/docs/`.

Instruções para assistentes de código e para quem opera o projeto.

## Visão geral

Monorepo Node + React: API **Express** em `backend/`, SPA **Vite + React** em `frontend/`. O `.env` na **raiz** é carregado por `backend/config/env.js`. SQLite e seeds em `DB local/` na raiz.

## Como correr localmente

| Objetivo | Comando (na raiz) |
|----------|-------------------|
| API com watch | `npm run dev` |
| Só frontend (Vite) | `npm run frontend:dev` ou `npm run frontend:dev:5180` |
| API + Vite em paralelo | `npm run dev:full` ou `npm run dev:full:5180` |
| Build do SPA | `npm run build` |
| Windows | `iniciar-gestao-plantoes.bat` (atalho; lógica em `backend/iniciar-gestao-plantoes.bat`) |

O proxy do Vite encaminha `/api` para `127.0.0.1` na porta `GDP_API_PORT`, `PORT` no `.env` ou `3000`.

## Organização MVC

### Backend (`backend/`)

| Pasta | Papel |
|-------|--------|
| `controllers/` | Handlers HTTP: `DirecionadorService.js`, `ManagerService.js`, `AdminController.js` (*dois primeiros: nome histórico “Service”, papel de controller*). |
| `services/` | Negócio, jobs, infra: predição, ETL, Redis, AMQP, cron. |
| `models/` | Dados: `dbModel.js`, `localSupabaseClient.js`, `CacheModel.js`, SQL/JSON. |
| `config/` | `env.js`. |
| `lib/` | Regras reutilizáveis: `businessRules.js` (texto, datas de mês, turnos). |
| `messaging/` | `messagingGateway.js` — eventos de domínio (RabbitMQ via `QueueService`). |
| `repositories/` | Orquestração de leituras, ex.: `dashboardOrchestrator.js`. |
| `scripts/` | Utilitários (ETL pontual, SQL SQLite, PowerShell de portas). |
| `server.js` | Express + servir `frontend/dist` em produção. |

### Frontend (`frontend/src/`)

| Pasta | Papel |
|-------|--------|
| `views/` | Ecrãs / rotas. |
| `components/` | UI reutilizável. |
| `models/` | Cliente HTTP (`api.js`). |
| `context/` | Sessão (`AuthContext`) — orquestração de estado no cliente. |

Centralizar `fetch` em `models/` quando fizer sentido.

## Contratos da API

Prefixo `/api/...` inalterado para browser e PWA. Alterar contrato implica **frontend** e entradas em `backend/pipeline_guard_config.json`.

## Integrações

- Postgres/Supabase: `backend/models/`.
- SQLite: `DB local/`.
- Redis/RabbitMQ: opcionais — `CacheService.js`, `QueueService.js`.

## Roadmap / checkpoint

Referência: `backend/docs/checkpoint.md`.

| Tema | Estado |
|------|--------|
| Serviços ETL, predição, calibração, cron | Alinhado — `backend/services/`. |
| `dbModel` | Alinhado — `backend/models/dbModel.js`. |
| Relatórios / dashboard / visão analítica | Alinhado — `ManagerService` + `frontend/src/views/` (Lógica 100% no backend, UI apenas exibe). |
| Trocas sem aprovação do gestor | Alinhado — rota 410 em `server.js`. |
| Faturamento/custos | Pendente. |
| WhatsApp (Meta) | Pendente — `backend/docs/WHATSAPP.md`; serviço futuro em `backend/services/WhatsAppService.js`. |
| ETL Oracle | Parcial — `DataTransportService`. |

## Qualidade

- Após mudanças sensíveis: validar **Visão Analítica**, **Dashboard**, **Relatórios** (UTF-8, sem loops, sem 500) — ver `backend/docs/checkpoint.md`.
- `npm run pipeline:once` — `backend/pipeline_guard.py` + `backend/pipeline_guard_config.json`. Hooks: `.githooks/pre-commit`.

## Monorepo (npm workspaces)

`backend/package.json` e `frontend/package.json`; na raiz `npm install` instala ambos. Scripts `npm run dev`, `npm run build`, etc., delegam com `-w`.

## Artefactos

- ETL/testes: `backend/scripts/`.
- Docker Redis/Rabbit: `backend/docker-compose.infra.yml`.
- Esquemas JSON: `backend/schema/`.
- Pipeline: `backend/pipeline_guard.py`, `backend/pipeline_guard_config.json`.
- Outra documentação operacional: `backend/docs/` (checkpoint, PIPELINE_GUARD, WHATSAPP) — **não** duplicar aqui o papel deste `agents.md`.

Código antigo em `api/` ou `web/` → usar `backend/` e `frontend/`.

## API: filtros regionais

`GET /api/manager/dashboard-summary` e `GET /api/manager/reports` podem incluir `filters.allowedUnidadeIdsForRegional` quando há filtro regional — o UI deve preferir IDs em vez de reimplementar normalização de texto.
