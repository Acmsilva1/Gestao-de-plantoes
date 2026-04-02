# Status do Projeto: Alinhamento Arquitetural
**Última Atualização:** 2026-04-02 00:30

## 1. Contexto Atual
- **Objetivo:** Adequação à Nova Diretiva de Engenharia (Vertical Slicing).
- **Etapa:** Sprint 1# Checkpoint - Gestão de Plantões

## Sprint 1: Alinhamento Arquitetural (Concluída)
- [x] Estrutura de pastas `src/modules` criada (Modular Vertical Slicing).
- [x] Documentação base (`README.md` raiz e por módulo) atualizada com diagramas Mermaid.
- [x] Consolidação de Banco de Dados: Criado `model/master.sql` (Skeleton) como bússola para migração corporativa.
- [x] Limpeza de arquivos SQL redundantes no diretório `model/`.

## Próximos Passos (Sprint 2):
1.  **Migração de Lógica**: Mover funções de `api/` para os domínios em `src/modules/`.
2.  **Repositórios**: Implementar `infrastructure` em cada módulo usando `dbModel.js` como base.
3.  **Testes**: Iniciar cobertura de testes unitários nas fatias verticais.
- [ ] Mover lógica de cálculo de demanda para `src/modules/predicao/domain`.
- [ ] Iniciar testes unitários na nova estrutura de domínio.