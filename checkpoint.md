# Checkpoint: Gestão de Plantões

Este documento rastreia o estado atual da arquitetura, integrações e próximos passos do projeto.

## 1. Arquitetura e Limpeza [Status: CONCLUÍDO]
- **Modularização**: A aplicação foi organizada em uma estrutura de serviços na pasta `api/`.
- **Limpeza**: Arquivos redundantes e metadata de IDE (`.cursor`, `.codex-logs`) foram removidos.
- **Destaque**: O projeto agora possui um único motor de predição oficial.

## 2. Componentes do Sistema
| Componente | Função |
| :--- | :--- |
| **`DataTransportService`** | ETL Incremental (Delta Sync) com janela de 365 dias (800 nos testes). |
| **`PredictionEngine`** | Motor Analítico (MAD, Regressão, Sazonalidade) e Multiplicadores. |
| **`CalibrationService`** | IA de Auto-Ajuste Semanal para detecção de novas tendências. |
| **`AdminService`** | Relatórios operacionais (Produtividade/Horas, Trocas e Cancelamentos). |
| **`CronService`** | Orquestrador de tarefas (06h/18h - Sync | Dom 01h - Calibração). |
| **`dbModel.js`** | Camada de persistência otimizada (Supabase/Postgres). |
| **`analise_feriados.json`** | Base de Sazonalidade Real populada para 2024, 2025 e 2026. |

## 3. Banco de Dados e Integração [Status: EM TESTE]
- **Destino**: `historico_predicao` (Postgres local/Supabase).
- **Fonte**: Mapeado para `historico_tasy` (buffer de teste) com arquitetura "Bridge" pronta para Oracle (`v_censo_hospitalar`).
- **Sanitização**: Dados importados são anonimizados e normalizados antes da persistência.

## 4. Próximos Passos
- [x] Implementação do `DataTransportService` e `CronService`.
- [x] Refatoração do Preditor Analítico para consumir tabela `historico_predicao`.
- [x] Implementação do `CalibrationService` (IA de Auto-Ajuste semanal).
- [x] Povoamento de Sazonalidade Proativa (`analise_feriados.json` 2024-2026).
- [x] Módulo Administrativo (Relatórios de Faturamento em CSV/HTML/JSON).
- [ ] Migração de fonte de dados (Postgres Teste -> Oracle Produção).
- [ ] Dashboard de Monitoramento de Performance do Preditor (Assertividade).

---
*Última Atualização: 2026-04-02*
