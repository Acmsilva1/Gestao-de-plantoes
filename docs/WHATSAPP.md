# 📱 Integração Estratégica: WhatsApp Business API (Meta)

Este documento detalha o roteiro técnico e funcional para fundir a plataforma de **Gestão de Plantões** com a comunicação oficial do WhatsApp, transformando a eficiência operacional em engajamento em tempo real.

---

## 🚀 Passo a Passo da Implementação

### 1. Preparação da Infraestrutura (Meta Developer)
1.  **Criação de App na Meta**: Criar um aplicativo do tipo "Business" no portal [developers.facebook.com](https://developers.facebook.com).
2.  **Configuração do Número**: Vincular um número de telefone exclusivo (que não possua conta ativa de WhatsApp) à plataforma de API.
3.  **Verificação da Empresa**: Realizar a Verificação de Negócio (Business Verification) enviando documentos da empresa à Meta.
4.  **Geração de Token**: Obter o "Permanent Access Token" para autorizar o servidor Node.js a enviar mensagens.

### 2. Desenvolvimento do Backend (Node.js)
1.  **Módulo de Mensageria**: Criar um serviço no backend (ex: `backend/services/WhatsAppService.js`) utilizando a biblioteca oficial ou consumindo a REST API da Meta.
2.  **Configuração de Webhooks**: Disponibilizar um endpoint público (HTTPS) para que a Meta avise o sistema quando um médico responder a uma mensagem.
3.  **Mapeamento de Médicos**: Vincular o campo `telefone` da tabela de médicos ao ID de conversa do WhatsApp (WAID).

### 3. Gestão de Templates (Modelos Aprovados)
*   **Aprovação**: Mensagens enviadas pelo sistema (mensagens ativas) precisam ser aprovadas pela Meta para evitar SPAM.
*   **Exemplo de Template**: *"Olá Dr. {{1}}, um novo plantão de {{2}} está disponível para o Hospital {{3}}. Deseja assumir? [Botão: Sim/Não]"*

---

## ⚡ Funcionalidades de Alto Impacto

A fusão da escala com o WhatsApp desbloqueia ferramentas antes impossíveis:

### 📢 Alertas de Plantão "Quente"
Quando uma vaga surge de última hora (furo de escala), o sistema dispara um alerta para todos os médicos da especialidade. O primeiro que clicar no botão "Assumir" no WhatsApp garante o plantão automaticamente.

### 🔄 Permutas Bi-Laterais e Aprovações
Esqueça os grupos de WhatsApp informais. Quando o Médico A propõe troca ao Médico B no sistema:
*   O Médico B recebe a proposta no WhatsApp com os detalhes (Data, Unidade, Valor).
*   A aprovação é feita com 1 clique.
*   O **Gestor** recebe uma notificação final para validar.

### 📅 Distribuição de Escala (PDF)
Assim que o gestor clica em "Liberar Visibilidade" no dashboard:
*   O sistema gera o PDF da escala.
*   Dispara o arquivo individualmente para cada médico da unidade.

### ⏰ Lembrete de Jornada (Anti-Esquecimento)
Disparo automático de mensagem 3 horas antes do início do plantão:
> *"Dr. João, seu plantão no Hospital Vitória (Noite) começa em 3 horas. Bom trabalho!"*

### 📊 Consultas Rápidas (Chatbot)
O médico pode digitar *"Escala"* ou *"Meus Plantões"* para o número do sistema e receber instantaneamente sua agenda da semana sem precisar abrir o navegador.

---

## ⚠️ Considerações Importantes

> [!IMPORTANT]
> **Privacidade (LGPD)**: O sistema deve ter um campo de "Opt-in" (Autorização) onde o médico concorda em receber notificações via WhatsApp.

> [!TIP]
> **Economia**: Utilize o WhatsApp para mensagens críticas e de alto valor. Para avisos genéricos, continue usando as notificações internas do Dashboard para otimizar os custos da Meta.

---

**Elaborado pela Antigravity AI** 🧠✨
*Documento de Visão Estratégica v1.0*
