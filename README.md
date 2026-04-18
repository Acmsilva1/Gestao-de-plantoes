# GEST?O DE PLANTOES - Eco-Sistema de Escalas M?dicas

Sistema robusto para orquestra??o de escalas m?dicas, integrando predi??o de demanda baseada em hist?rico de atendimento e gest?o bilateral de trocas.

## Estrutura do reposit?rio

- **`frontend/`** ? SPA (Vite + React); scripts na raiz com npm workspaces.
- **`backend/`** ? API Express, utilit?rios, Docker Compose de infra, pipeline Python e documenta??o em **`backend/docs/`** (checkpoint, WhatsApp, pipeline guard); guia para agentes: **`agents.md`** na raiz.
- **Raiz** ? `package.json` com workspaces, `README.md`, `iniciar-gestao-plantoes.bat`, **`DB local/`**, `.env`.

## ??? Arquitetura e Servi?os (backend/)

O projeto utiliza uma arquitetura baseada em **Servi?os Modulares**, onde cada dom?nio de neg?cio ? isolado para garantir manuten??es limpas e escalabilidade.

### M?dulos Principais
- **`DataTransportService`**: Camada de ETL (Extra??o, Transforma??o e Carga) com importa??o incremental (Delta Sync).
- **`PredictionEngine`**: O "C?rebro" do sistema. Motor puramente anal?tico de predi??o de demanda.
- **`CalibrationService`**: IA de Auto-Ajuste que detecta tend?ncias semanais e gera multiplicadores.
- **`SchedulerService`**: Orquestrador de tarefas peri?dicas e gera??o autom?tica de escalas.
- **`CronService`**: Gerenciador de tarefas em segundo plano (Sincroniza??o agendada e Calibra??o IA).
- **`ManagerService` & `DirecionadorService`**: Interfaces de neg?cio para Gestores e M?dicos.

---

## ?? Pipeline de Dados & ETL

A pipeline foi desenhada para manter o sistema sempre atualizado com o banco de produ??o (Oracle/Source), garantindo anonimiza??o e performance:

1. **Check de Novidade**: O sistema verifica o "checkpoint" local (?ltima data no Postgres).
2. **Importa??o Incremental**: Se houver dados novos, o ETL os transporta e normaliza. 
3. **Janela Deslizante de 365 Dias**: O banco local mant?m rigorosamente apenas os ?ltimos 365 dias de uso, removendo dados obsoletos para manter a performance do Analista.
4. **Sanitiza??o**: Dados sens?veis s?o filtrados no transporte, persistindo apenas IDs de unidade e m?tricas de volume.

---

## ?? L?gica do Preditor (Analista)

O **PredictionEngine** atua como um analista estat?stico puro. Ele n?o toca em dados brutos sem processamento. Sua l?gica de c?lculo segue os seguintes pilares:

### 1. Limpeza de Outliers (MAD)
Utiliza a t?cnica de **Median Absolute Deviation (MAD)** para identificar e ignorar dias at?picos (ex: picos s?bitos por eventos externos ?nicos), garantindo que a predi??o n?o seja distorcida por ru?dos.

### 2. Composi??o da Demanda Base
A predi??o final ? uma m?dia ponderada de tr?s modelos:
- **Mediana Sazonal (50%)**: Mediana hist?rica do mesmo dia da semana nos ?ltimos 12 meses (Captura feriados recorrentes e h?bitos de escala).
- **M?dia Recente (30%)**: M?dia simples das ?ltimas 10 ocorr?ncias (Captura surtos ou mudan?as graduais).
- **Tend?ncia Linear (20%)**: Regress?o linear baseada na inclina??o da demanda dos ?ltimos 8 dias (Captura o crescimento ou queda imediata).

### 3. Fatores de Ajuste e Camada de IA (ML)
- **Calend?rio**: Multiplicadores autom?ticos para fins de semana (1.08x) e segundas-feiras (1.12x).
- **Feriados e Sazonalidade**: Integra??o com `analise_feriados.json` para prever impactos de datas comemorativas nacionais e regionais.
- **Camada de Intelig?ncia (ML)**: O motor busca pela tabela `historico_tasy_ml` multiplicadores espec?ficos para contextos de alta volatilidade.
- **Confian?a**: Score (Alta, M?dia, Baixa) baseado no tamanho da amostra hist?rica (m?nimo 10 dias) e na volatilidade (dispers?o).

---

## ?? Auto-Calibra??o (Feedback Loop)

O sistema possui um ciclo de aprendizado aut?nomo atrav?s do **`CalibrationService`**:

- **An?lise Semanal**: Todo Domingo ?s 01:00 AM, o sistema compara a **Previs?o Realizada** contra o **Afastamento Real**.
- **Detec??o de Tend?ncia**: Se o desvio for consistentemente superior a 5%, ele gera um novo multiplicador na tabela de ML.
- **Auto-Ajuste**: Isso garante que o preditor "aprenda" novas tend?ncias (ex: crescimento populacional ou novos servi?os na unidade) sem interven??o humana.

---

## ? Agendamento de Tarefas (Crontab)

| Tarefa | Agendamento | Fun??o |
| :--- | :--- | :--- |
| **Sincroniza??o Incremental** | 06:00 e 18:00 | Atualizar banco local com dados do Oracle. |
| **Auto-Calibra??o IA** | Domingo, 01:00 | Ajustar multiplicadores baseados na demanda real. |
| **Recalcular Predi??o** | Logo ap?s Calibra??o | Atualizar proje??es de 30 dias com os novos pesos. |

---

## ?? M?dulo Administrativo & Faturamento

O sistema conta com um painel administrativo voltado para auditoria e presta??o de contas, constru?do sob a arquitetura de alta performance **Summary-First**:
- **Vis?o Consolidada na Interface**: O painel exibe um agregado de produtividade de forma instant?nea (total de horas e plant?es agrupados por profissional), processado diretamente no servidor. Isso evita o tr?fego abusivo de registros individuais para o navegador (evitando travamentos em consultas longas).
- **Exporta??es para Auditoria**: As planilhas geradas (CSV) e os laudos em HTML para confer?ncia financeira recebem, automaticamente, o bloco de dados consolidados como cabe?alho principal, sendo seguido pelas linhas em formato transacional.
- **Relat?rios Operacionais**: Rastreabilidade completa de todas as permutas bilaterais e cancelamentos efetuados pelos m?dicos.

---

## ?? Roadmap & Integra??es Futuras

O sistema est? em constante evolu??o para reduzir o atrito na comunica??o entre gest?o e corpo cl?nico.

### ?? Integra??o WhatsApp Business (Meta)
Em desenvolvimento para transformar o engajamento:
- **Alertas de Plant?o "Quente"**: Notifica??o instant?nea para vagas de ?ltima hora.
- **Orquestra??o via Chat**: Aceite de plant?es e aprova??o de permutas diretamente pelo WhatsApp.
- **PDF Autom?tico**: Envio individual das escalas mensais assim que liberadas.
- **Lembrete de Jornada**: Mensagens autom?ticas pr?-plant?o para redu??o de faltas.

Veja o detalhamento completo em **[WHATSAPP.md](./backend/docs/WHATSAPP.md)**.

---

## ?? Como Executar

### Instala??o
```bash
npm install
```

Instala a raiz e os workspaces `backend/` e `frontend/`. O agendamento em segundo plano usa `node-cron` em `backend/package.json`.

### Desenvolvimento
```bash
# Sobe API (3000) e Web (5173) simultaneamente
npm run dev:full
```

---
*Este projeto segue RIGOROSAMENTE a Diretiva de Engenharia 001/2026. Sincronia entre predi??o e opera??o via automa??o de mensageria ? prioridade N?vel 1.*

### Infra Opcional (Produ??o antecipada)
Vari?veis para ativar cache tempor?rio e mensageria sem quebrar o fluxo atual (fallback autom?tico se indispon?vel):

```bash
# Redis (cache de baixa lat?ncia)
ENABLE_REDIS=1
REDIS_URL=redis://localhost:6379
REDIS_PREFIX=gdp
ESCALA_EDITOR_CACHE_TTL_SEC=45

# RabbitMQ (eventos ass?ncronos)
ENABLE_QUEUE=1
RABBITMQ_URL=amqp://localhost:5672
RABBITMQ_EXCHANGE=gestao.events
```

Com `ENABLE_REDIS`/`ENABLE_QUEUE` desligados, o sistema continua operando normalmente usando apenas banco.

---

## Atualizacoes Recentes (2026-04-03)

### Fluxos de troca, assumir e cancelamento
- Troca entre medicos: nao exige mais aprovacao manual do gestor; com aceite do colega o pedido finaliza automaticamente.
- Assumir dia vago: permanece com processamento automatico e evento para ciencia do gestor.
- Gestor: menu `Trocas` virou feed de ciencia unificado (`TROCA` e `ASSUMIR_VAGO`), sem botoes de aprovar/recusar.
- Cancelamentos: continuam exigindo autorizacao do gestor, com persistencia de historico apos aprovacao para exibicao em relatorios.

### Filtros e UX (Gestor Master)
- Predicao: filtros por Regional, Turno e Unidade (inclusive com comparacao multiunidade).
- Relatorios: filtros por Regional e Turno, com comparacao multiunidade sincronizada por regional.
- Dashboard: filtro por regional e lista de unidades/comparacao restritas a regional selecionada.
- Correcao visual no bloco de relatorios para evitar overflow/corte no botao de gerar relatorio.

### Banco de dados
- Nova migracao: `model/migrations/2026-04-03_fix_fk_cancelamento_escala.sql`.
- Ajuste recomendado em `pedidos_cancelamento_escala.escala_id` para `ON DELETE SET NULL`, preservando historico quando a linha da escala for removida durante aprovacao do cancelamento.
- `model/master.sql` atualizado com a estrutura de pedidos de assumir/cancelamento e a FK correta para cancelamentos.
