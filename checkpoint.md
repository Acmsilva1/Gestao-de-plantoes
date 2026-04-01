# Status do Projeto: [Nome do Módulo]
**Última Atualização:** 2026-04-01 18:10
**Hash do Último Commit:** `a1b2c3d`

## 1. Contexto Atual
- **Objetivo:** Migração da persistência para Docker.
- **Etapa:** Configuração do volume de dados.

## 2. O que já foi feito (DONE)
- [x] Criação do Dockerfile.
- [x] Definição da imagem base.

## 3. Onde parou (Ponto de Interrupção)
- Erro de permissão ao montar o volume no diretório `/data`. O servidor caiu durante o log de erro.

## 4. Próximos Passos (TODO)
- [ ] Ajustar o `chown` no entrypoint.
- [ ] Validar a conexão com o Postgres.
- 