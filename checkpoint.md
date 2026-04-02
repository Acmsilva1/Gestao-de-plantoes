# Checkpoint: Gestão de Plantões

Este documento rastreia o estado atual da arquitetura, integrações e próximos passos do projeto.

## 1. Arquitetura e Limpeza [Status: CONCLUÍDO]
- **Modularização**: A aplicação foi organizada em uma estrutura de serviços na pasta `api/`.
- **Limpeza**: Arquivos redundantes e metadata de IDE (`.cursor`, `.codex-logs`) foram removidos.
- **Destaque**: O projeto agora possui um único motor de predição oficial.

## 2. Motor de Predição (PredictionEngine) [Status: ATIVO]
- **Unificação**: Agora existe apenas o `PredictionEngine.js` que atende tanto à escala operacional quanto aos relatórios analíticos.
- **Analista Puro**: O preditor foi desacoplado de tarefas de busca de dados, funcionando puramente como um motor matemático.

## 3. ETL e Sincronização (Data Transport) [Status: ATIVO]
- **Sincronização Incremental (Delta Sync)**: O `DataTransportService` verifica se há novos dados no DB principal antes de rodar.
- **Janela Deslizante**: Mantém automaticamente apenas os últimos 365 dias de histórico para predição.
- **Agendamento (Cron)**: Execução automática às **06:00** e **18:00** via `CronService`.

## 4. Banco de Dados e Integração [Status: EM TESTE]
- **Destino**: `historico_predicao` (Postgres local/Supabase).
- **Fonte**: Mapeado para `historico_tasy` (buffer de teste) com arquitetura "Bridge" pronta para Oracle (`v_censo_hospitalar`).
- **Sanitização**: Dados importados são anonimizados e normalizados antes da persistência.

## 5. Próximos Passos
- [ ] Configuração das credenciais Oracle no `.env`.
- [ ] Validação das métricas de demanda com dados reais de produção.
- [ ] Implementação de novos filtros analíticos para o gestor.

---
*Última Atualização: 2026-04-02*
