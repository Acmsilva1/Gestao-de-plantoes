# GESTÃO DE PLANTÕES

Aplicação web para gestão de plantões médicos com dois perfis principais:

- `Médico`: consulta calendário, visualiza agenda, aceita plantões e atualiza perfil.
- `Gestor`: acompanha dashboards, consulta calendário por unidade, gerencia acessos e mantém cadastros.

O projeto roda:

- localmente no `localhost`
- em produção/preview na `Vercel`
- como `PWA` instalável no mobile

## Stack

- Backend: `Node.js` + `Express`
- Frontend: `React` + `Vite`
- Banco: `Supabase`
- Deploy: `Vercel`
- PWA: `manifest.webmanifest` + `service worker`

## Estrutura

```text
.
├─ api/                # serviços e regras de negócio
├─ config/             # leitura de ambiente
├─ model/              # acesso ao banco/cache
├─ web/                # frontend React + Vite + PWA
├─ server.js           # servidor Express
├─ vercel.json         # configuração de deploy na Vercel
└─ package.json        # scripts da raiz
```

## Funcionalidades

### Médico

- Login por `CRM + senha`
- Calendário mensal de plantões
- Seleção de unidade base/auxiliar
- Visualização de meses sem previsão com alerta
- Reserva de vaga com bloqueio temporário
- Confirmação de plantão
- Visualização da própria agenda
- Atualização de perfil e senha

### Gestor

- Login administrativo
- Dashboard mensal por unidade ou visão geral
- Alerta para mês fora da janela de previsão
- Calendário de plantões por unidade
- Gestão de acessos de médicos por unidade
- Atualização de perfil do gestor
- Criação de médico
- Exclusão de médico

### PWA

- Instalação no mobile
- Banner de instalação
- Ícones e manifesto
- Página offline
- Atualização forçada de cache/service worker para evitar versão antiga

## Como o preditor funciona

Esta é a parte mais sensível do sistema e vale deixar claro: o projeto não usa um modelo estatístico avançado ou IA treinada externamente. A previsão atual é uma heurística operacional construída em cima do histórico recente do banco.

### Objetivo do preditor

O preditor gera, para cada unidade:

- a quantidade prevista de atendimento por período
- a necessidade estimada de médicos por período
- os plantões do mês atual e do próximo mês
- a quantidade de `vagas_totais` gravada na tabela `disponibilidade`

### Janela de histórico usada

O cálculo considera uma janela móvel dos últimos `60 dias`.

Essa regra vem de `api/PredictionService.js`:

- `FORECAST_HISTORY_WINDOW_DAYS = 60`

Ou seja:

- o sistema busca histórico recente da tabela `tasy_raw_history`
- ignora períodos fora dessa janela
- recalcula a previsão sempre em cima desse recorte

### Como o histórico é tratado

O sistema aceita dois cenários:

1. O histórico já vem quebrado por período
2. O histórico vem apenas com total diário

Quando existe apenas total diário, o sistema distribui esse total entre os turnos usando pesos fixos:

- `Manhã`: `32%`
- `Tarde`: `28%`
- `Noite`: `25%`
- `Madrugada`: `15%`

Esses pesos estão em `api/PredictionService.js` no objeto `PERIOD_WEIGHTS`.

### Como a demanda é estimada

Para cada período, o sistema calcula:

- média do volume histórico
- desvio padrão do volume histórico

Depois aplica esta lógica:

```text
pacientes previstos = ceil(media + desvio_padrao * fator_de_seguranca)
```

O fator de segurança atual é:

- `SAFETY_FACTOR = 1.15`

Na prática isso faz o preditor ser mais conservador, adicionando folga sobre a média histórica.

### Como o sistema converte demanda em médicos

Depois de prever a quantidade de pacientes por período, o sistema divide pelo parâmetro:

- `DEFAULT_PATIENTS_PER_DOCTOR = 10`

Fórmula:

```text
médicos necessários = ceil(pacientes_previstos / pacientes_por_médico)
```

E o sistema ainda garante um mínimo de:

- `1 médico`
- `1 paciente previsto`

Mesmo com histórico muito baixo ou ausente, ele não gera zero por padrão nessa etapa base.

### Como o dia da semana influencia

O cálculo final não usa só média geral do período.

Ele monta também um perfil por:

- dia da semana
- período

Exemplo:

- segunda de manhã
- sábado à noite
- domingo de madrugada

Então a regra real usada para gerar a necessidade de um plantão em uma data específica é:

- tentar a previsão daquele `dia da semana + período`
- se não houver dados suficientes, usar o fallback do período geral

Isso faz o sistema respeitar diferenças de comportamento entre dias úteis e fim de semana.

### Como os feriados entram na previsão

Agora o preditor consulta primeiro o arquivo `model/analise_feriados.json` antes de definir a necessidade do plantão.

A lógica atual:

- identifica a `data real` do plantão sendo gerado
- resolve a `região` da unidade a partir do contexto disponível da unidade
- procura uma regra compatível no bloco `analise_feriados`
- se encontrar, aplica uma consulta/perfil específico de feriado sobre a base calculada
- se não encontrar, mantém a heurística padrão por dia da semana + período

Formato provisório aceito pelo arquivo:

- `datas`: datas exatas no formato `YYYY-MM-DD`
- `datasRecorrentes`: recorrência anual no formato `MM-DD`
- `regioes`: lista de chaves que combinem com a região/nome/endereço da unidade
- `metricas`: multiplicadores por período (`Manhã`, `Tarde`, `Noite`, `Madrugada`)

Observação:

- o nome `analise_feriados` foi mantido no JSON apenas como marcador temporário até a entrada do ETL real

### Como os plantões são gerados

O organizador cria uma grade completa para:

- mês atual
- próximo mês

Para cada dia do mês, ele cria 4 turnos:

- `Manhã`
- `Tarde`
- `Noite`
- `Madrugada`

Depois grava na tabela `disponibilidade`:

- `unidade_id`
- `data_plantao`
- `turno`
- `vagas_totais`
- `status = ABERTO`

A `vagas_totais` de cada turno é exatamente o número de médicos necessários calculado para aquela data/período.

### Como a atualização no banco funciona

O sistema não sobrescreve tudo cegamente.

Ele compara:

- linhas já existentes em `disponibilidade`
- linhas desejadas pela previsão nova

E só atualiza o que mudou.

Regras importantes:

- se o turno já existir e não mudou, ele é preservado
- se `vagas_ocupadas >= vagas_totais`, o status vira `OCUPADO`
- se ainda existir ao menos uma vaga livre, o status fica `ABERTO`
- caso contrário, o status fica `ABERTO`

### Quando a previsão roda

Fora da Vercel, localmente no servidor Node, o scheduler:

- roda uma execução inicial ao subir a aplicação
- agenda execuções diárias

O horário diário é controlado por:

- `PREDICTOR_SCHEDULE_HOUR`

Se não for definido, o padrão é:

- `22`

Na Vercel, esse agendamento automático não roda pelo `app.listen`, porque o ambiente é serverless. Nesse caso, o comportamento esperado é usar a aplicação como API serverless e disparar geração por fluxo controlado do ambiente.

### Como os dashboards mostram “demanda”

No estado atual do projeto, o dashboard do gestor não exibe demanda histórica pura.

Ele agrega os dados já previstos/gravados em `disponibilidade` e monta:

- vagas totais
- vagas ocupadas
- vagas disponíveis
- distribuição por turno

Então, hoje, a “demanda” vista nos gráficos está fortemente acoplada à saída do preditor e ao número de vagas geradas, não a uma projeção independente separada em outra tabela analítica.

### Limitações importantes

Essa parte é a mais discutível justamente porque o modelo atual tem simplificações fortes:

- usa apenas `60 dias` de histórico
- depende de pesos fixos quando o histórico não vem por período
- assume `10 pacientes por médico` como base fixa
- usa `média + desvio padrão * 1.15`, o que é uma heurística, não uma calibração clínica/operacional validada
- gera os 4 turnos para todos os dias do mês, sem distinguir feriados, sazonalidade longa, eventos externos ou regras específicas de unidade
- a “demanda” do dashboard deriva da disponibilidade prevista, então previsão e oferta ficam parcialmente misturadas

### Resumo executivo do preditor

Hoje a lógica é:

1. Buscar `60 dias` de histórico por unidade
2. Normalizar o histórico por turno
3. Calcular média e desvio padrão por período
4. Calcular também perfil por dia da semana + período
5. Aplicar fator de segurança
6. Converter pacientes previstos em médicos necessários
7. Gerar 4 turnos por dia para o mês atual e o próximo
8. Sincronizar a tabela `disponibilidade`

Se a regra de negócio evoluir, esta é provavelmente a primeira seção do projeto que merece revisão técnica e validação com operação.

## Requisitos

- `Node.js 18+`
- `npm 9+`
- acesso ao projeto Supabase usado pela aplicação

## Variáveis de ambiente

A aplicação lê o `.env` na raiz do projeto.

Crie um arquivo `.env` usando o modelo abaixo:

```env
PORT=3000
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_KEY=SUA_CHAVE_SUPABASE
PREDICTOR_SCHEDULE_HOUR=3
```

Variáveis obrigatórias:

- `SUPABASE_URL`
- `SUPABASE_KEY`

Variáveis opcionais:

- `PORT`
- `PREDICTOR_SCHEDULE_HOUR`

## Instalação local

Na raiz do projeto:

```bash
npm install
cd web
npm install
cd ..
```

## Como rodar localmente

### Opção 1: backend + frontend juntos

Na raiz:

```bash
npm run dev:full
```

Isso sobe:

- backend Express em `http://localhost:3000`
- frontend Vite em `http://localhost:5173`

No modo local, o Vite usa proxy para `/api`, então o frontend conversa com o backend automaticamente.

### Opção 2: só backend

```bash
npm run dev
```

Servidor em:

```text
http://localhost:3000
```

### Opção 3: só frontend

```bash
npm run web:dev
```

Frontend em:

```text
http://localhost:5173
```

## Build local

```bash
npm run build
```

Esse comando gera o build do frontend em:

```text
web/dist
```

Para testar o frontend buildado:

```bash
npm run web:preview
```

## Rotas principais da API

### Saúde

- `GET /api/health`

### Médico

- `POST /api/auth/login`
- `GET /api/medicos`
- `GET /api/medicos/:medicoId/calendario`
- `GET /api/medicos/:medicoId/agenda`
- `POST /api/medicos/:medicoId/perfil`
- `GET /api/vagas`
- `POST /api/vagas/:id/bloquear`
- `DELETE /api/vagas/:id/bloquear`
- `POST /api/vagas/:id/selecionar`

### Gestor

- `POST /api/manager/login`
- `GET /api/manager/dashboard`
- `GET /api/manager/medicos`
- `GET /api/manager/unidades`
- `GET /api/manager/calendario/:unidadeId`
- `POST /api/manager/medicos/:id/acessos`
- `POST /api/manager/medicos/:id/perfil`
- `POST /api/manager/perfil/:id`
- `POST /api/manager/medicos`
- `DELETE /api/manager/medicos/:id`

## Deploy na Vercel

O projeto está preparado para rodar na Vercel com:

- frontend buildado a partir de `web/`
- backend Express como função Node
- rotas SPA e assets do PWA configurados em `vercel.json`

### Passo a passo

1. Conecte o repositório à Vercel.
2. Garanta que o projeto esteja usando a raiz do repositório.
3. Faça deploy da branch desejada.

### Variáveis na Vercel

Se quiser usar configuração padrão da plataforma, cadastre:

- `SUPABASE_URL`
- `SUPABASE_KEY`
- `PREDICTOR_SCHEDULE_HOUR` se necessário

Observação:

- o projeto também consegue ler `.env` da raiz quando esse arquivo faz parte do ambiente de execução
- para Git Integration da Vercel, o mais confiável continua sendo usar Environment Variables no painel da Vercel

## PWA

Arquivos principais:

- `web/public/manifest.webmanifest`
- `web/public/sw.js`
- `web/public/offline.html`

Comportamento esperado:

- no Android/Chrome aparece o banner de instalação
- no iPhone/iPad o app mostra a instrução para `Adicionar à Tela de Início`
- após mudança de nome/layout do PWA, o service worker força renovação de cache

Se o celular continuar abrindo uma versão antiga:

1. abra o link online uma vez
2. feche e abra de novo
3. remova o app/atalho instalado antigo
4. instale novamente

## Fluxo de teste recomendado

### Localhost

1. criar `.env`
2. rodar `npm install` na raiz
3. rodar `npm install` em `web/`
4. subir `npm run dev:full`
5. acessar `http://localhost:5173`

### Vercel

1. subir commit para o GitHub
2. redeploy na Vercel
3. verificar `/api/health`
4. abrir a home
5. testar instalação do PWA no mobile

## Troubleshooting

### `/api` retorna `503`

Faltam variáveis:

- `SUPABASE_URL`
- `SUPABASE_KEY`

### PWA mostra nome/layout antigo

Normalmente é cache antigo do service worker ou atalho já instalado. Abra o link online, atualize e reinstale o app.

### Home abre antiga no celular

Confirme se o deploy novo foi publicado e se o navegador não está usando uma aba/app antigo em modo standalone.

### Build local funciona, mas Vercel não

Verifique:

- variáveis de ambiente
- branch correta
- se `vercel.json` está no commit publicado

## Scripts úteis

```bash
npm run dev
npm run start
npm run build
npm run web:dev
npm run web:build
npm run web:preview
npm run dev:full
```
