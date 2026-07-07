# dux

Agente de código autônomo para terminal. Conecta-se ao OpenRouter, pilota ferramentas
(read, write, edit, bash, grep, glob, etc.) em loop até concluir a tarefa.

<img width="800" height="450" alt="ezgif-5909fea3f603e10a" src="https://github.com/user-attachments/assets/54e0b061-a741-4397-a9e7-1423a6e37dbe" />

## Quick start

```bash
npm install
npx dux "leia src/agent.js e explique em português"
```

Na primeira execução sem argumentos, entra no modo interativo e solicita a API Key:

```bash
npx dux
```

## Funcionalidades

- **Dois modos de uso**: single-shot (`dux "tarefa"`) e REPL interativo (`dux`)
- **Streaming em tempo real**: reasoning (pensamento) e content (resposta) exibidos incrementalmente
- **Loop agente**: chama a API, executa ferramentas, alimenta o resultado de volta, repete
- **8 ferramentas**: read_file, write_file, edit_file, patch_file, run_bash, grep, glob, todos, question
- **Confirmação interativa**: comandos sensíveis (write, edit, patch, bash) pedem confirmação
- **Reasoning effort**: controlável via `/effort` (none a xhigh)
- **Seleção de modelo**: via `/models` com busca interativa
- **Chave persistente**: armazenada em `~/.dux/config.json` (permissão 0600) com input mascarado
- **Configuração na primeira execução**: detecta ausência de chave e guia o setup
- **Override via ambiente**: `OPENROUTER_API_KEY` tem prioridade sobre o arquivo de config
- **Logs em JSONL**: todas as iterações registradas em `logs/` para auditoria

## Comandos do REPL

| Comando | Descrição |
|---------|-----------|
| `/exit` | Encerra o REPL |
| `/clear` | Limpa terminal e histórico |
| `/help` | Lista os comandos disponíveis |
| `/models` | Busca e seleciona modelo OpenRouter |
| `/effort` | Altera nível de reasoning effort |
| `/api-key` | Troca a chave de API |
| `qualquer texto` | Enviado como mensagem para o agente |

## Configuração

O arquivo `~/.dux/config.json` armazena:

```json
{
  "apiKey": "sk-or-v1-...",
  "model": "deepseek/deepseek-v4-flash",
  "reasoningEffort": "medium"
}
```

Use o comando `/api-key` no REPL para definir a chave (input mascarado).
Modelo e reasoning effort persistem automaticamente ao alterar com `/models` e `/effort`.

## Estrutura

```
src/
  cli.js           # Entry point (single-shot + REPL dispatch)
  repl.js          # Modo interativo com readline
  agent.js         # Loop agente (request → tool → result → repeat)
  openrouter.js    # Cliente OpenRouter (chat, streaming, list models)
  config.js        # Config persistente (~/.dux/config.json)
  ensureKey.js     # Setup de primeira execução
  format.js        # Saída formatada com markdown e reasoning
  logger.js        # Logs em JSONL
  confirm.js       # Confirmação interativa (y/n)
  parseResponse.js # Parsing de tool_calls e content
  streamReduce.js  # Redutor de chunks SSE
  permissions.js   # Allowlist de bash + path safety
  commands/        # Handlers de slash commands
  tools/           # Implementações das ferramentas
test/              # Testes Vitest (396 testes)
```

## Stack

**Runtime**: Node.js 18+ (ES modules, zero runtime deps além de `@inquirer/prompts`)
**API**: OpenRouter (`/chat/completions` com SSE streaming)
**Testes**: Vitest

## Scripts

```bash
npm test                   # Testes unitários (396 testes)
npm run test:integration   # Testes de integração (exige chave OpenRouter)
npm run test:watch         # Modo watch
```
