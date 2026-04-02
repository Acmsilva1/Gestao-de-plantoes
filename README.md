# GESTÃO DE PLANTOES - Eco-Sistema de Escalas Médicas

Sistema robusto para orquestração de escalas médicas, integrando predição de demanda baseada em histórico de atendimento e gestão bilateral de trocas.

## 🏗️ Arquitetura e Serviços (api/)

O projeto utiliza uma arquitetura baseada em **Serviços Modulares**, onde cada domínio de negócio é isolado para garantir manutenções limpas e escalabilidade.

### Módulos Principais
- **`DataTransportService`**: Camada de ETL (Extração, Transformação e Carga) com importação incremental (Delta Sync).
- **`PredictionEngine`**: O "Cérebro" do sistema. Motor puramente analítico de predição de demanda.
- **`CalibrationService`**: IA de Auto-Ajuste que detecta tendências semanais e gera multiplicadores.
- **`SchedulerService`**: Orquestrador de tarefas periódicas e geração automática de escalas.
- **`CronService`**: Gerenciador de tarefas em segundo plano (Sincronização agendada e Calibração IA).
- **`ManagerService` & `DirecionadorService`**: Interfaces de negócio para Gestores e Médicos.

---

## 📊 Pipeline de Dados & ETL

A pipeline foi desenhada para manter o sistema sempre atualizado com o banco de produção (Oracle/Source), garantindo anonimização e performance:

1. **Check de Novidade**: O sistema verifica o "checkpoint" local (última data no Postgres).
2. **Importação Incremental**: Se houver dados novos, o ETL os transporta e normaliza. 
3. **Janela Deslizante de 365 Dias**: O banco local mantém rigorosamente apenas os últimos 365 dias de uso, removendo dados obsoletos para manter a performance do Analista.
4. **Sanitização**: Dados sensíveis são filtrados no transporte, persistindo apenas IDs de unidade e métricas de volume.

---

## 🧠 Lógica do Preditor (Analista)

O **PredictionEngine** atua como um analista estatístico puro. Ele não toca em dados brutos sem processamento. Sua lógica de cálculo segue os seguintes pilares:

### 1. Limpeza de Outliers (MAD)
Utiliza a técnica de **Median Absolute Deviation (MAD)** para identificar e ignorar dias atípicos (ex: picos súbitos por eventos externos únicos), garantindo que a predição não seja distorcida por ruídos.

### 2. Composição da Demanda Base
A predição final é uma média ponderada de três modelos:
- **Mediana Sazonal (50%)**: Mediana histórica do mesmo dia da semana nos últimos 12 meses (Captura feriados recorrentes e hábitos de escala).
- **Média Recente (30%)**: Média simples das últimas 10 ocorrências (Captura surtos ou mudanças graduais).
- **Tendência Linear (20%)**: Regressão linear baseada na inclinação da demanda dos últimos 8 dias (Captura o crescimento ou queda imediata).

### 3. Fatores de Ajuste e Camada de IA (ML)
- **Calendário**: Multiplicadores automáticos para fins de semana (1.08x) e segundas-feiras (1.12x).
- **Feriados e Sazonalidade**: Integração com `analise_feriados.json` para prever impactos de datas comemorativas nacionais e regionais.
- **Camada de Inteligência (ML)**: O motor busca pela tabela `historico_tasy_ml` multiplicadores específicos para contextos de alta volatilidade.
- **Confiança**: Score (Alta, Média, Baixa) baseado no tamanho da amostra histórica (mínimo 10 dias) e na volatilidade (dispersão).

---

## 🔁 Auto-Calibração (Feedback Loop)

O sistema possui um ciclo de aprendizado autônomo através do **`CalibrationService`**:

- **Análise Semanal**: Todo Domingo às 01:00 AM, o sistema compara a **Previsão Realizada** contra o **Afastamento Real**.
- **Detecção de Tendência**: Se o desvio for consistentemente superior a 5%, ele gera um novo multiplicador na tabela de ML.
- **Auto-Ajuste**: Isso garante que o preditor "aprenda" novas tendências (ex: crescimento populacional ou novos serviços na unidade) sem intervenção humana.

---

## ⏰ Agendamento de Tarefas (Crontab)

| Tarefa | Agendamento | Função |
| :--- | :--- | :--- |
| **Sincronização Incremental** | 06:00 e 18:00 | Atualizar banco local com dados do Oracle. |
| **Auto-Calibração IA** | Domingo, 01:00 | Ajustar multiplicadores baseados na demanda real. |
| **Recalcular Predição** | Logo após Calibração | Atualizar projeções de 30 dias com os novos pesos. |

---

## 🔮 Roadmap & Integrações Futuras

O sistema está em constante evolução para reduzir o atrito na comunicação entre gestão e corpo clínico.

### 📱 Integração WhatsApp Business (Meta)
Em desenvolvimento para transformar o engajamento:
- **Alertas de Plantão "Quente"**: Notificação instantânea para vagas de última hora.
- **Orquestração via Chat**: Aceite de plantões e aprovação de permutas diretamente pelo WhatsApp.
- **PDF Automático**: Envio individual das escalas mensais assim que liberadas.
- **Lembrete de Jornada**: Mensagens automáticas pré-plantão para redução de faltas.

Veja o detalhamento completo em **[WHATSAPP.md](./WHATSAPP.md)**.

---

## 🚀 Como Executar

### Instalação
```bash
npm install
cd web && npm install
npm install node-cron  # Necessário para os agendamentos
```

### Desenvolvimento
```bash
# Sobe API (3000) e Web (5173) simultaneamente
npm run dev:full
```

---
*Este projeto segue RIGOROSAMENTE a Diretiva de Engenharia 001/2026. Sincronia entre predição e operação via automação de mensageria é prioridade Nível 1.*
