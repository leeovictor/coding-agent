# Visão Geral do Projeto — cli-agent

## Objetivo

Construir um agente de código CLI mínimo em Node.js que entenda na prática o ciclo:

```
prompt → decisão do modelo → execução de ferramenta → retorno → repetição
```

O agente chama a API OpenRouter de verdade e executa ferramentas de verdade.
É uma versão educacional, mas funcional, do padrão usado por Claude Code, Cursor, Aider, etc.

## Princípios norteadores

1. **Zero dependências de runtime** — só módulos nativos do Node (`fs`, `child_process`, `readline`, `fetch`).
2. **Vitest como única devDependency** — para testes unitários.
3. **Cada milestone é testável, validável e executável**:
   - **Testável**: tem testes unitários cobrindo a funcionalidade.
   - **Validável**: `npm test` passa ao fim da fase.
   - **Executável**: há um comando de demonstração que mostra a feature em ação.
4. **Funções puras em módulos próprios** — lógica extraída para módulos testáveis isoladamente, sem acoplamento a rede/sistema de arquivos/terminal.
5. **Injeção de dependências** — o loop do agente recebe `callApi` injetável, permitindo testes sem rede.

## Stack técnica

- **Node.js** v18+ (usa `fetch` nativo)
- **Vitest** (devDependency)
- **OpenRouter API** — endpoint OpenAI-compatible: `https://openrouter.ai/api/v1/chat/completions`
- Sem SDK, sem dotenv — chamadas HTTP e parser `.env` feitos à mão

## Estrutura de pastas final

```
cli-agent/
├── package.json              # type: module, scripts: test, dev, test:integration
├── vitest.config.js          # config do vitest
├── .env                      # OPENROUTER_API_KEY, OPENROUTER_MODEL
├── logs/                     # arquivos .jsonl por execução
├── docs/plan/                # estes documentos
├── src/
│   ├── agent.js              # loop principal + formatDecision + confirmAction
│   ├── logger.js             # createLogger() -> logEvent()
│   ├── env.js                # parseEnvFile() à mão
│   ├── parseResponse.js      # extractToolCalls, extractContent, parseToolArgs, buildToolResultMessage
│   ├── tools/
│   │   ├── index.js          # registro {name → {schema, execute, sensitive}} + getToolSchema()
│   │   ├── readFile.js
│   │   ├── writeFile.js
│   │   └── runBash.js
│   └── cli.js                # entrada, parsing de args, integra tudo
├── test/
│   ├── env.test.js
│   ├── parseResponse.test.js
│   ├── logger.test.js
│   ├── agent.test.js
│   ├── tools.index.test.js
│   ├── tools/
│   │   ├── readFile.test.js
│   │   ├── writeFile.test.js
│   │   └── runBash.test.js
│   └── integration.test.js   # skip se sem OPENROUTER_API_KEY
└── README.md
```

## Variáveis de ambiente (`.env`)

```
OPENROUTER_API_KEY=sk-or-...
OPENROUTER_MODEL=anthropic/claude-sonnet-4.5
OPENROUTER_MAX_ITERATIONS=20
```

Fallbacks no código caso as env vars não existam:
- `OPENROUTER_MODEL` → `anthropic/claude-sonnet-4.5`
- `OPENROUTER_MAX_ITERATIONS` → `20`

## Ferramentas do agente

| Nome | Parâmetros | Ação | Sensível (pede confirmação)? |
|---|---|---|---|
| `read_file` | `path` | Lê conteúdo de arquivo texto | Não |
| `write_file` | `path`, `content` | Cria/sobrescreve arquivo | Sim |
| `run_bash` | `command` | Executa comando no shell (cwd = dir de invocação) | Sim |

## Fluxo arquitetural

```
┌─────────────┐     ┌──────────────┐     ┌────────────────────┐
│   CLI input  │ --> │  Agent Loop   │ --> │  OpenRouter API      │
└─────────────┘     └──────┬───────┘     │ (chat/completions)   │
                            │              └────────┬────────────┘
                            │  tool_calls            │
                            v                        v
                     ┌──────────────┐       (schema OpenAI-like)
                     │ Tool Executor │
                     │ (fs, exec)    │
                     └──────┬───────┘
                            │ tool result (role: "tool")
                            v
                     volta pro loop  ──>  Logger (JSONL)
```

## Pseudocódigo do loop (versão final)

```
mensagens = [ {role:"system", content: system_prompt}, {role:"user", content: tarefa} ]
iter = 0

repita:
  iter += 1
  se iter > MAX_ITERATIONS:
      logEvent("loop_end", {motivo: "limite_atingido", iteracoes: iter})
      encerrar com aviso

  logEvent("request", {iteracao: iter, modelo, mensagens_preview})
  resposta = callApi(mensagens, tools)        # injetável
  logEvent("response", {iteracao: iter, finish_reason, content, tool_calls, usage})

  message = resposta.choices[0].message

  // PRIORIZA tool_calls sobre finish_reason
  se message.tool_calls && message.tool_calls.length > 0:
      mensagens.push(message)
      para cada tool_call em message.tool_calls:
          {args, error} = parseToolArgs(tool_call.function.arguments)
          nome = tool_call.function.name
          formatDecision({iteracao: iter, tool: nome, args})

          precisa_confirmar = toolRecord[nome]?.sensitive
          se precisa_confirmar:
              confirmado = confirmAction(nome, args, readline)
              logEvent("tool_confirmation", {iteracao: iter, tool: nome, args, decisao: confirmado})
              se !confirmado:
                  resultado = "Usuário recusou a execução."
              senao:
                  resultado = (error) ? error : executar_tool(nome, args)
          senao:
              resultado = (error) ? error : executar_tool(nome, args)

          logEvent("tool_execution", {iteracao: iter, tool: nome, args, resultado, duration_ms, error})
          mensagens.push(buildToolResultMessage(tool_call.id, resultado))
      continuar loop

  senao:
      se message.content: formatFinal(message.content)
      logEvent("loop_end", {motivo: "concluido", iteracoes: iter})
      encerrar
```

## System Prompt (constante em `src/agent.js`)

```
Você é um agente de código que opera em um terminal.
Você tem acesso às ferramentas: read_file, write_file, run_bash.
- Use read_file para inspecionar arquivos antes de decidir o que fazer.
- Use write_file para criar ou sobrescrever arquivos.
- Use run_bash para executar comandos do sistema.
- Quando a tarefa estiver concluída, responda com um resumo em texto natural, sem chamar mais ferramentas.
- Não tente adivinhar conteúdos de arquivos: leia antes.
- Trabalhe em passos pequenos e verificáveis.
```

## Milestones

| Fase | Documento | Foco |
|---|---|---|
| M1 | `01-m1-setup-and-api.md` | Setup projeto, env parser, chamada API simples |
| M1.5 | `02-m1.5-parse-response.md` | Parser de resposta (content + tool_calls) |
| M2 | `03-m2-tools.md` | Schema + executores das 3 tools |
| M3 | `04-m3-agent-loop.md` | Loop com tool_calls, callApi injetável |
| M4 | `05-m4-console-logs.md` | Formatação legível no console |
| M5 | `06-m5-logger.md` | Logger JSONL |
| M6 | `07-m6-confirmation.md` | Confirmação manual para ações sensíveis |
| M7 | `08-m7-integration.md` | Testes de integração com API real |

**Ordem de dependência**: M1 → M1.5 → M2 → M3 → (M4, M5, M6 paralelizáveis) → M7.

## Scripts do `package.json`

```json
{
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:integration": "OPENROUTER_RUN_INTEGRATION=1 vitest run test/integration.test.js",
    "dev": "node src/cli.js"
  }
}
```

## Critérios de aceite finais

- `node src/cli.js "crie um arquivo notas.txt dizendo oi"` resulta no arquivo criado
- Terminal mostra cada decisão do modelo visivelmente
- Agente para sozinho ao concluir (sem loop infinito)
- `write_file` e `run_bash` pedem confirmação (`y/n`)
- Trocar modelo via `OPENROUTER_MODEL` não quebra o parsing
- Cada execução gera `logs/agent-<timestamp>.jsonl` com todos os eventos
- `npm test` passa com 100% dos testes unitários
- Erros de tool viram string e voltam ao modelo (não crasham o agente)
- Múltiplos tool_calls por turno são processados
- `npm run test:integration` valida o fluxo completo (opcional, exige chave)
