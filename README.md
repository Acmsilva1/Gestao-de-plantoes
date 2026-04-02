# GESTÃO DE PLANTOES - Eco-Sistema de Escalas Médicas

Sistema robusto para orquestração de escalas médicas, integrando predição de demanda baseada em histórico de atendimento e gestão bilateral de trocas.

## 🏗️ Arquitetura e Serviços (api/)

O projeto utiliza uma arquitetura baseada em **Serviços Modulares**, onde cada domínio de negócio é isolado para garantir manutenções limpas e escalabilidade.

### Módulos Principais
- **`DataTransportService`**: Camada de ETL (Extração, Transformação e Carga) com importação incremental (Delta Sync).
- **`PredictionEngine`**: O "Cérebro" do sistema. Motor puramente analítico de predição de demanda.
- **`SchedulerService`**: Orquestrador de tarefas periódicas e geração automática de escalas.
- **`CronService`**: Gerenciador de tarefas em segundo plano (Sincronização agendada 06h/18h).
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
- **Mediana Sazonal (50%)**: Mediana histórica do mesmo dia da semana nos últimos 12 meses.
- **Média Recente (30%)**: Média simples dos últimos 10 dias úteis.
- **Tendência Linear (20%)**: Regressão linear baseada na inclinação da demanda dos últimos 8 dias.

### 3. Fatores de Ajuste (Multiplicadores)
- **Calendário**: Multiplicadores automáticos para fins de semana (1.08x) e "correria de segunda-feira" (1.12x).
- **Feriados e Sazonalidade**: Integração com `analise_feriados.json` para prever impactos de datas comemorativas nacionais e regionais.
- **Confiança**: Atribui um score (Alta, Média, Baixa) baseado no tamanho da amostra histórica e na volatilidade do contexto.

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
*Este projeto segue RIGOROSAMENTE a Diretiva de Engenharia 001/2026.*
