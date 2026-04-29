# Mudança de arquitetura — pastas por *features* + camadas na API

Este documento define o **alvo de organização** alinhado ao padrão usado em projetos como *command-center-web*: **feature slices** no frontend e na API, com **rotas → controllers → services → repositories** dentro de cada feature, e código partilhado em `shared` / `core`.

## Referência de pastas (alvo)

```
Gestao-de-plantoes/
  web/
    features/<nome-da-feature>/
      components/
      hooks/
      lib/
    shared/
      components/
      lib/
  api/
    features/<nome-da-feature>/
      <nome>Routes.js
      controllers/
      services/
      repositories/
      index.js
    core/          # db global, migrations, middleware
    config/
    lib/           # apenas utilitários transversais (csv, etc.) — ou mover para shared/core
```

**Regras:**

- Handlers HTTP por domínio vivem em **`api/features/<x>/`**; serviços transversais (cache, filas, ETL) permanecem em `api/services`, `api/models`, `api/lib` até eventual extração para `api/core` ou `api/shared`.
- Nada de feature A importar implementação interna de feature B; usar `api/shared` ou interfaces em `core` quando necessário.

## Situação atual neste repositório

**API (handlers por domínio):** `api/features/direcionador/DirecionadorService.js`, `api/features/manager/ManagerService.js`, `api/features/admin/AdminController.js`; `server.js` importa destas pastas. Serviços e modelos transversais mantêm-se em `api/services`, `api/models`, etc. **Web (alinhado):** `web/src/features/auth|doctor|manager/`, `web/src/shared/` (context, models, components, `devTestProfiles.js`). O `App.jsx` importa só a partir de `features/` e `shared/`.

## Etapas do processo (checklist)

1. **Mapa de domínios** — Listar rotas e agrupar por capacidade (admin, direcionador, ETL, filas, etc.).
2. **Criar casca de features na API** — `api/features/admin/`, `api/features/organizer/`, … com subpastas `controllers`, `services`, `repositories`.
3. **Mover ficheiros** — Um domínio de cada vez; atualizar `server.js` para registar rotas a partir de `api/features/<x>/index.js`.
4. **Shared na API** — `api/lib` e modelos verdadeiramente transversais → `api/shared` ou `api/core` com nomes claros.
5. **Web** — Reorganizar `web/src` em `features/` + `shared`; alinhar chamadas HTTP com as novas rotas se renomear prefixos.
6. **Testes** — `server.test.js` e outros: atualizar imports e URLs.
7. **Documentação** — Atualizar `doc/documentacao.md` com o mapa de pastas.

**Ordem sugerida:** feature com menos superfície (ex.: um controller isolado) como piloto; depois blocos grandes (Manager, Admin, Scheduler).

## Critério de conclusão

- Cada conjunto de rotas relacionadas vive sob um único `api/features/<nome>/`.
- Frontend espelha o mesmo vocabulário de features para facilitar navegação no código.

## Ambiente local (dev)

| Alvo | Comando típico | Porta |
|--------|----------------|--------|
| Web (Vite) | `npm run dev:web` (na raiz do monorepo) ou `cd web && npm run dev` | **5180** (`strictPort`; proxy `/api` lê `GDP_API_PORT` / `PORT` / `.env`, default **3000**) |
| API (Express) | `npm run dev` (raiz) ou `cd api && npm run dev` | **3000** por defeito (`GDP_API_PORT` ou `PORT` no `.env` da raiz) |
| Full stack | `npm run dev:full` | API + web em paralelo |
