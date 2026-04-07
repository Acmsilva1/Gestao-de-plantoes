# Pipeline Guard (Python)

Aplicação de monitoramento contínuo que roda validações a cada mudança no projeto e registra logs automáticos.

## Comandos

```bash
# modo observação contínua
npm run pipeline:watch

# execução única da bateria de validação
npm run pipeline:once

# instala hooks versionados do projeto (.githooks)
npm run hooks:install
```

## O que é validado

1. Sintaxe do backend:
- `node --check api/ManagerService.js`
- `node --check api/CronService.js`

2. Build do frontend:
- `npm run build` na pasta `web`

3. Scanner de caracteres corrompidos (mojibake):
- procura padrões como `Ã` e `�` em arquivos críticos da Visão Analítica e serviços.

## Logs

Os logs são gravados automaticamente em:

- `pipeline_guard_logs/events.log` (resumo legível)
- `pipeline_guard_logs/events.jsonl` (estruturado para auditoria e automação)
- `pipeline_guard_logs/latest_report.md` (relatório visual com bugs + sugestão de correção)

## Gatilho de Commit (pre-commit)

Após `npm run hooks:install`, todo `git commit` executa automaticamente:

```bash
python pipeline_guard.py --once
```

Se houver falha na inspeção, o commit é bloqueado.

## Leitura rápida de bug

Quando houver falha:

1. abra `pipeline_guard_logs/latest_report.md`;
2. veja o bloco `Bugs encontrados`;
3. aplique as sugestões de `como corrigir`;
4. rode `npm run pipeline:once` para confirmar;
5. faça o commit novamente.

## Configuração

Arquivo: `pipeline_guard_config.json`

Nele você pode ajustar:
- caminhos monitorados (`watch_roots`)
- padrões ignorados (`ignore_globs`)
- comandos de validação (`commands`)
- arquivos para scanner de encoding (`scan_files_for_encoding`)
