# Checkpoint: Gestao de Plantoes

Este documento rastreia o estado atual da arquitetura, integracoes e proximos passos do projeto.

## 0. Regra Operacional (Codex)
- Toda alteracao no projeto deve incluir validacao de regressao da tela `Visão Analítica` (Dashboard e Relatórios), cobrindo:
- integridade visual/textual (sem caracteres corrompidos como `VisÃ£o`, `RelatÃ³rios`, `MÃªs`);
- fluxo funcional (sem loops, sem erro 500, sem falha de carregamento de filtros e abas);
- verificacao backend+frontend apos mudancas (`npm run dev`/`npm run dev:full` e build do web).

## 1. Arquitetura e Estrutura [Status: CONCLUIDO]
- Modularizacao: aplicacao organizada em estrutura de servicos na pasta `api/`.
- Limpeza: codigo otimizado e focado em um motor de predicao robusto.
- Relatorios Summary-First: processamento de totais no backend para evitar carga excessiva na interface.

## 2. Componentes do Sistema
| Componente | Funcao |
| :--- | :--- |
| `DataTransportService` | ETL incremental (Delta Sync) com janela continua de atualizacao. |
| `PredictionEngine` | Motor analitico (MAD, regressao, sazonalidade) e multiplicadores IA. |
| `CalibrationService` | Auto-ajuste semanal para deteccao de tendencias (domingo 01h). |
| `AdminService` | Relatorios de auditoria (produtividade, trocas, cancelamentos) com saida CSV/HTML. |
| `CronService` | Orquestrador de jobs de retaguarda. |
| `dbModel.js` | Camada de abstracao do banco (Supabase/Postgres). |

## 3. Banco de Dados e Integracao
- Destino: `historico_predicao` (Postgres local/Supabase).
- Fonte: buffer de teste (`historico_tasy`), com arquitetura pronta para fonte Oracle.
- Sanitizacao: anonimização aplicada no trafego do dado de origem.

## 4. Entregas Concluidas (Recentes)
- [x] Trocas sem aprovacao do gestor: aceite entre medicos finaliza com status final.
- [x] Gestor em modo ciencia no menu `Trocas` (feed unificado `TROCA | ASSUMIR_VAGO`, sem botoes de decisao).
- [x] Predicao e Relatorios com filtros por Regional, Turno e Unidade.
- [x] Comparacao multiunidade sincronizada com regional selecionada (predicao, relatorios e dashboard).
- [x] Dashboard com filtro regional e unidades dinamicas por regional.
- [x] Ajustes de layout no modulo de Relatorios (acao de gerar relatorio sem overflow/corte).
- [x] Correcao de loops de carregamento ao trocar filtros de regional/unidade.
- [x] Correcao de persistencia de cancelamentos aprovados para manter historico e alimentar relatorios.
- [x] Criada migracao SQL: `model/migrations/2026-04-03_fix_fk_cancelamento_escala.sql`.

## 5. Proximos Passos
- [ ] Faturamento e Custos: parametrizar valor/hora por unidade para calculo financeiro completo.
- [ ] Integracao WhatsApp: avancar com Meta Developers e tokenizacao.
- [ ] Executar em todos os ambientes a migracao `2026-04-03_fix_fk_cancelamento_escala.sql`.
- [ ] Transicao transparente do ETL para a fonte Oracle oficial.

---
*Ultima Atualizacao: 2026-04-03*
