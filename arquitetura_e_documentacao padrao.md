Diretiva de Engenharia: Padronização de Arquitetura e Documentação

1. Organização Estrutural (Modular Vertical Slicing):
Todo desenvolvimento deve ser organizado em Módulos de Domínio. Cada módulo deve ser auto-contido, seguindo a estrutura:

src/modules/[module_name]/domain: Regras de negócio puras e entidades.

src/modules/[module_name]/application: Casos de uso e orquestração.

src/modules/[module_name]/infrastructure: Implementações técnicas (bancos de dados, chamadas externas).

src/modules/[module_name]/features/[feature_name]: Ponto de entrada e lógica específica da funcionalidade.

2. Padrão de Documentação (Technical Specs):
Para cada nova funcionalidade (feature), o agente deve obrigatoriamente gerar (ou atualizar) um arquivo README.md no diretório da feature contendo:

Visão Geral: Descrição técnica do propósito da funcionalidade.

Fluxo Lógico: Representação em diagrama Mermaid (sequência ou fluxo).

Contratos de Interface: Definição rigorosa de entradas (Inputs), saídas (Outputs) e Exceptions.

Dependências: Lista de serviços ou módulos internos que esta funcionalidade consome.

Compliance & Segurança: Checklist de tratamento de dados sensíveis e conformidade com normas de privacidade vigentes.

3. Premissas de Código:

Aplicar rigorosamente princípios SOLID e DRY.

Priorizar a composição sobre a herança.

O código deve ser projetado para ser testável e compatível com ambientes containerizados (Docker).

Abstrair integrações externas para garantir que a troca de tecnologia não afete o core do módulo.

4. Instrução de Saída:
Ao finalizar a implementação, resuma a arquitetura adotada e aponte onde os artefatos de documentação foram localizados.