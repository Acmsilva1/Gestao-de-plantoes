# Checkpoint: Gestão de Plantões

Este documento rastreia o estado atual da arquitetura, integrações e próximos passos do projeto.

## 1. Arquitetura e Limpeza [Status: CONCLUÍDO]
- **Modularização**: A aplicação foi organizada em uma estrutura de serviços na pasta `api/`.
- **Limpeza**: Arquivos redundantes e metadata de IDE (`.cursor`, `.codex-logs`) foram removidos.
- **Destaque**: O projeto agora possui um único motor de predição oficial.

## 2. Componentes do Sistema
| Componente | Função |
| :--- | :--- |
| **`DataTransportService`** | ETL Incremental (Delta Sync) com janela deslizante de 365 dias. |
| **`AnalyticalPredictionV2`** | Motor de Predição desacoplado que consome o buffer Postgres local. |
| **`CalibrationService`** | IA de Auto-Ajuste que detecta tendências semanais e gera multiplicadores. |
| **`CronService`** | Agendador central das tarefas de transporte e calibração automática. |
| **`dbModel.js`** | Camada de persistência (Supabase) otimizada para o fluxo analítico. |

## 3. Banco de Dados e Integração [Status: EM TESTE]
- **Destino**: `historico_predicao` (Postgres local/Supabase).
- **Fonte**: Mapeado para `historico_tasy` (buffer de teste) com arquitetura "Bridge" pronta para Oracle (`v_censo_hospitalar`).
- **Sanitização**: Dados importados são anonimizados e normalizados antes da persistência.

## 4. Próximos Passos
- [x] Implementação do `DataTransportService` e `CronService`.
- [x] Refatoração do Preditor Analítico para consumir tabela `historico_predicao`.
- [x] Implementação do `CalibrationService` (IA de Auto-Ajuste semanal).
- [ ] Migração de fonte de dados (Postgres Teste -> Oracle Produção).
- [ ] Dashboard de Monitoramento de Performance do Preditor (Assertividade).

---
*Última Atualização: 2026-04-02*
