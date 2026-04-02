# Checkpoint: Gestão de Plantões

Este documento rastreia o estado atual da arquitetura, integrações e próximos passos do projeto.

## 1. Arquitetura e Estrutura [Status: CONCLUÍDO]
- **Modularização**: Aplicação organizada em uma estrutura de serviços na pasta `api/`.
- **Limpeza**: Código otimizado e focado em um motor de predição sólido.
- **Relatórios Summary-First**: Arquitetura do módulo administrativo modernizada para não trafegar grandes volumes de linhas à interface gráfica, processando os totais diretamente no back-end.

## 2. Componentes do Sistema
| Componente | Função |
| :--- | :--- |
| **`DataTransportService`** | ETL Incremental (Delta Sync) com janela de atualização contínua. |
| **`PredictionEngine`** | Motor Analítico (MAD, Regressão, Sazonalidade) e Multiplicadores IA. |
| **`CalibrationService`** | Motor de Auto-Ajuste Semanal para detecção de tendências (Dom 01h). |
| **`AdminService`** | Relatórios de auditoria financeira (Produtividade, Trocas, Cancelamentos) com geração estática (CSV/HTML). |
| **`CronService`** | Orquestrador de jobs automáticos de retaguarda. |
| **`dbModel.js`** | Camada de abstração do Banco de Dados (Supabase/Postgres). |

## 3. Banco de Dados e Integração
- **Destino**: `historico_predicao` (Postgres local/Supabase).
- **Fonte**: Mapeado no buffer de teste (`historico_tasy`), arquitetura desenhada em "Bridge" para aceitar a view Oracle original.
- **Sanitização**: Padrão rígido de anonimização no momento do tráfego do dado fonte.

## 4. Entregas Concluídas (Recentes)
- [x] Otimização e sincronismo visual do Card de Confiança de Predição vs Modal Detalhado.
- [x] Filtros Dinâmicos no Editor de Escalas: Busca inteligente e limitador de Médicos filtráveis pela Unidade ativa.
- [x] **Módulo Administrativo (Summary-First)**: Tela blindada contra travamentos, exibindo métricas agregadas (Horas, Médicos Ativos).
- [x] Downloads Ricos (CSV/HTML): O sistema acopla um formulário cabeçalho consolidado no topo de cada arquivo fornecido pelo backend, seguido dos dados das transações.
- [x] Correção do pipeline de download HTML, bloqueando renderização pelo browser (forçando `blob`).
- [x] Definição formal de Casos de Uso Meta / WhatsApp (`WHATSAPP.md`).

## 5. Próximos Passos
- [ ] **Faturamento e Custos**: Inserir a parametrização de "Valor da Hora" nas unidades para liberação de cálculo financeiro.
- [ ] **Integração WhatsApp**: Prosseguir para o "Meta Developers" e tokenização.
- [ ] **Agrupamento Regional**: Disponibilizar o macro filtro de regional no dashboard de predições.
- [ ] Transição transparente do ETL para a fonte Oracle verdadeira.

---
*Última Atualização: 2026-04-02*
