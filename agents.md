# Agentes (Cursor / automação) — Gestão de plantões

## Contexto

Monorepo **workspaces** `api` + `web`. API Express com handlers por domínio em **`api/features/{direcionador,manager,admin}/`**; lógica longa e infra em `api/services`, `api/models`, `api/lib`, `api/messaging`. Web em **`web/src/features/{auth,doctor,manager}/`** e **`web/src/shared/`** (AuthContext, `models/api.js`, componentes reutilizáveis, `devTestProfiles.js`).

## Fronteiras

- **Não** misturar rotas de médico com as de gestor no mesmo ficheiro sem domínio claro; seguir ficheiro da feature correspondente.
- Proxy Vite: `/api` → `GDP_API_PORT` ou `PORT` ou **3000** (ver `web/vite.config.js` e `.env` na raiz do repo).

## Comandos

- `npm run dev` (raiz) — só **API**.
- `npm run dev:web` ou `npm run dev:full` — web **5180** + API conforme `.env`.
- `cd web && npm run dev` — Vite com porta do `vite.config.js` (**5180**).

## Documentação humana

- `doc/documentacao.md` — rotas e fluxos.
- `mudanca_arquitetura.md` — mapa de arquitetura e portas.

## Checkpoint

- [ ] Alterações na API que mexam em imports relativos testadas com `node --check` nos ficheiros grandes (`ManagerService.js`) e com `npm run dev` + fluxo no browser.
- [ ] `web`: imports de `shared/context`, `shared/models`, `shared/components` corretos; sem `../context` legacy.
- [ ] `npm run build -w web` (ou `npm run build` na raiz) sem erros.
- [ ] Pipeline guard (`pipeline_guard_config.json`) continua a apontar para `api/features/manager/ManagerService.js` se esse check existir.
