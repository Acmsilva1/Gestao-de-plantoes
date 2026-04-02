# GESTÃO DE PLANTOES - Eco-Sistema de Escalas Médicas

Sistema robusto para orquestração de escalas médicas, integrando predição de demanda baseada em histórico Tasy e gestão bilateral de trocas.

## 🏗️ Arquitetura (Modular Vertical Slicing)

O projeto está em transição para o padrão de fatiamento vertical conforme a Diretiva de Engenharia. Cada domínio de negócio possui sua própria lógica, contratos e infraestrutura.

### Módulos Principais
- **`auth`**: Governança de acesso e perfis.
- **`escala`**: Core business de alocação e negociação de plantões.
- **`predicao`**: Inteligência de demanda e geração automatizada de vagas.
- **`gestao`**: Visibilidade executiva e administração de recursos.

## 📋 Funcionalidades Principais

### Perfil Médico
- Reserva instantânea de vagas.
- Fluxo de permuta bilateral (trocas) com aceite do colega.
- Visualização de agenda consolidada.

### Perfil Gestor
- Dashboard de ocupação em tempo real.
- Aprovação de trocas e cancelamentos.
- Editor de escala e importação de templates inteligentes.

## 🚀 Como Executar

### Pré-requisitos
- Node.js 18+
- Supabase Key/URL (ver `.env.example` ou `.env`)

### Instalação
```bash
npm install
cd web && npm install
```

### Desenvolvimento
```bash
# Sobe API (3000) e Web (5173) simultaneamente
npm run dev:full
```

## 🛠️ Stack Tecnológica
- **Backend**: Node.js, Express, Supabase (PostgreSQL).
- **Frontend**: React, Vite, TailwindCSS (PWA support).
- **Data**: Heurísticas SQL para predição.

---
*Este projeto segue RIGOROSAMENTE a Diretiva de Engenharia 001/2026.*
