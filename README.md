# cli-agent

Agente CLI mínimo em Node.js que chama a API OpenRouter e executa ferramentas
(read_file, write_file, run_bash) num loop agente.

## Setup

1. `npm install`
2. Copiar `.env.example` para `.env` e preencher `OPENROUTER_API_KEY`

## Modos de Uso

### Single-shot

```
node src/cli.js "leia src/agent.js"
```

Executa a tarefa e encerra.

### REPL interativo

```
node src/cli.js
```

Entra em modo interativo com prompt `agent>`. Comandos:

| Comando | Descrição |
|---------|-----------|
| `/exit` | Encerra o REPL |
| `/clear` | Limpa o histórico e o terminal |
| `/help` | Mostra a lista de comandos |

O histórico de mensagens é mantido entre turnos, permitindo
conversas contextuais.

## Streaming

Tokens são exibidos em tempo real:

- **reasoning** (pensamento do modelo): texto em cinza com prefixo `›`
- **content** (resposta final): texto normal, streamado sem quebras de linha

## Tool Calls Compactos

Decisions de ferramentas exibem argumentos de forma legível:

```
[iter 1] → read_file src/agent.js
[iter 1] → write_file teste.txt
[iter 2] → run_bash ls -la
```

Confirmações continuam mostrando JSON completo para análise.

## Logs

Todas as interações são salvas em `logs/agent-<timestamp>.jsonl`.

## Testes

```
npm test                         # testes unitários
npm run test:integration         # testes de integração (exige chave)
```
