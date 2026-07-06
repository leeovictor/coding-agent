# Plano de Implementação: REPL, Streaming de Tokens e Tool Calls Compactos

## Visão Geral

Três melhorias no `cli-agent`:

1. **Streaming de tokens + reasoning** — mostrar tokens em tempo real no terminal, com estilo distinto para tokens de `reasoning` (cinza/prefixo `›`).
2. **Tool calls compactos** — em vez de `JSON.stringify(args)`, mostrar `read_file <path>`, `write_file <path>`, `run_bash <command>`.
3. **REPL interativo** — loop de readline multi-turno com comandos `/exit`, `/clear`, `/help`.

Cada fase termina com `npm test` passando.

---

## Fase 1 — Streaming de Tokens + Reasoning

### Objetivo
- `callApi` suporta `stream: true` e devolve um **async generator** de chunks SSE parseados, não mais um JSON pronto.
- `agent.js` consome o generator, acumula deltas com `reduceDelta` e emite `onEvent("token", { type, text })` para cada pedaço.
- `format.js` (ou handler) exibe tokens de **reasoning** em cinza com prefixo `›`; tokens de **content** são exibidos normalmente.
- Toda a lógica de redução de deltas é uma função pura (`reduceDelta`), testável isoladamente.

### Passos

#### 1.1. `src/streamReduce.js` — reducer puro de deltas SSE

- Exporta `reduceDelta(acc, delta)` puro (sem side effects).
- `acc` = `{ role: "assistant", content: "", reasoning: "", tool_calls: [], finish_reason: null }`.
- `delta` = o objeto `choices[0].delta` da linha `data: {...}` do SSE.
- Lida com:
  - `delta.content` (string) → concatena em `acc.content`.
  - `delta.reasoning` (string) → concatena em `acc.reasoning`.
  - `delta.tool_calls` → acumula índices parciais (cada chunk pode ter `index`, `id`, `function.name`, `function.arguments`):
    ```js
    // ideia
    for (const tc of delta.tool_calls) {
      let entry = acc.tool_calls[tc.index] ??= { id: "", type: "function", function: { name: "", arguments: "" } };
      if (tc.id) entry.id += tc.id;
      if (tc.function?.name) entry.function.name += tc.function.name;
      if (tc.function?.arguments) entry.function.arguments += tc.function.arguments;
    }
    ```
- Ao final, o `finish_reason` vem no último chunk: `choices[0].finish_reason`.
- Exporta também `createStreamReducer()` que retorna `{ acc, next(delta) }` com estado interno (conveniência).

**Testes** (`test/streamReduce.test.js`):
- `reduceDelta` com delta content puro → content acumulado.
- `reduceDelta` com delta reasoning puro → reasoning acumulado.
- `reduceDelta` com tool_calls parciais em 2 deltas → monta tool_call completa.
- `reduceDelta` misto: content + reasoning + tool_calls.
- `reduceDelta` com finish_reason.

#### 1.2. `src/openrouter.js` — suporte a streaming

- Adiciona `async function* callApiStream(messages, tools)`:
  - Faz POST com `body: { ...body, stream: true }`.
  - Lê o body com `response.body.getReader()` em UTF-8.
  - Faz chunked parse das linhas `data: {...}` (formato SSE do OpenRouter).
  - Dá `yield` de cada chunk parseado como objeto `{ delta, finish_reason }`.
  - Ignora linhas `data: [DONE]` e linhas vazias.
- Refatora `callApi` atual para ser um wrapper simples que coleta o generator e retorna JSON (modo não-stream mantido para testes).
  - Ou melhor: renomeia a atual para `callApiNonStreaming` e cria uma nova `callApi` que é o wrapper.
  - Mas para não quebrar assinatura, melhor: `callApi` ganha parâmetro `stream = false`.
    - Se `false`: comportamento atual (retorna Promise de JSON).
    - Se `true`: retorna `{ [Symbol.asyncIterator]() { return callApiStream(messages, tools); } }`.

**Testes** (`test/openrouter.test.js` — unitário com mock de `fetch`):
- `callApi(messages, tools, false)` retorna JSON como hoje.
- `callApiStream` faz fetch com `stream: true` no body.
- SSE line parser: `data: {"foo":"bar"}\n\n` → objeto parseado.
- Linha `data: [DONE]` → encerra iterador.
- Erro de rede → lança exceção.

#### 1.3. `src/agent.js` — integrar streaming

- `runAgent` ganha parâmetro `opts.stream = true` (default).
- Substitui `callApi(messages, tools)` por consumo do generator:
  ```js
  const response = await callApi(messages, tools, opts.stream);
  if (opts.stream) {
    const reducer = createStreamReducer();
    for await (const chunk of response) {
      if (chunk.choices?.[0]?.delta) {
        reducer.next(chunk.choices[0].delta);
      }
      // emit token events
    }
    const message = reducer.getFinalMessage();
    // message tem a estrutura igual ao que vinha pronto do JSON
  } else {
    // modo não-stream (testes usam)
    const response = await callApi(messages, tools, false);
    const message = response.choices[0].message;
    // ...
  }
  ```
- Durante o consumo, emite `onEvent("token", { type: "reasoning"|"content", text })` para cada delta parcial.
  - Agrupa pequenos deltas para não sobrecarregar: max 1 evento por ~50ms ou merge de deltas consecutivos do mesmo tipo.
  - Na prática, pode emitir cada delta individualmente (SSE já vem otimizado pelo servidor).

**Testes** (ampliar `test/agent.test.js`):
- Novo teste: `callApi` mockada como async generator que yield chunks de content + reasoning; verificar que `onEvent` recebe `token` events com tipo correto.
- Teste com tool_calls em streaming: generator que yield tool_call deltas → `tool_decision` emitido com args completos.

#### 1.4. `src/format.js` — exibição de tokens streaming

- Adiciona handler para evento `"token"` em `createConsoleEventHandler`:
  ```js
  case "token":
    if (data.type === "reasoning") {
      log(`› ${data.text}`); // cinza via escape ANSI \x1b[90m
    } else {
      log(data.text);        // sem \n, stdout normal
    }
    break;
  ```
  - **Decisão**: reasoning com cor cinza ANSI (`\x1b[90m...\x1b[0m`) + prefixo `› `. Quebra de linha separada.
  - content: escreve no stdout (sem `\n`) — acumulador de linha para não quebrar no meio da palavra.
- **Mudança importante**: tools calls e resultado final exigem `\n` antes para separar do stream. O handler deve pular linha quando transiciona de token → tool_decision ou token → final_content.
- Para simplificar Fase 1, podemos manter content inline (append sem newline) e reasoning com newline + prefixo.

**Testes** (`test/format.test.js`):
- `"token"` com `type: "reasoning"` → saída contém prefixo `›`.
- `"token"` com `type: "content"` → saída é só o texto.

#### 1.5. `src/cli.js` — ativar streaming

- Passa `stream: true` para `runAgent`.
- `console.log` direto de tokens no stdout, sem `\n` extra.

### Critério de sucesso da Fase 1

```
node src/cli.js "lista os arquivos .js no diretório src/"
```

- Vê tokens aparecendo um a um no terminal.
- Se o modelo emitir reasoning, vê linhas `› texto...` em cinza antes da resposta.
- `npm test` verde.

---

## Fase 2 — Tool Calls Compactos

### Objetivo
- `formatDecision` exibe `read_file src/foo.js` em vez de `read_file {"path":"src/foo.js"}`.
- `formatConfirmation` mantém JSON completo (precisa de detalhe para aprovação).
- Logger continua registrando args completos (já acontece hoje).

### Passos

#### 2.1. Adicionar `summarize(args)` no tool registry

- Cada tool module ganha export `summarize(args)`:
  - `readFile.js`: `return args.path` (se existir).
  - `writeFile.js`: `return args.path` (se existir).
  - `runBash.js`: `return args.command` (se existir). Trunca a 80 chars com `…`.
- `src/tools/index.js`:
  - Adiciona campo `summarize` em cada entrada do registry.
  - Exporta `summarizeTool(name, args)` que procura no registry; se não tiver, usa fallback que retorna primeira string curta dos valores do args, ou `JSON.stringify(args)` se não achar string.

```js
export function summarizeTool(name, args) {
  const tool = toolRegistry[name];
  if (tool && tool.summarize) return tool.summarize(args);
  // fallback: primeira propriedade string com <= 60 chars
  const firstStr = Object.values(args ?? {}).find(v => typeof v === "string" && v.length <= 60);
  return firstStr ?? JSON.stringify(args);
}
```

**Testes** (`test/tools.index.test.js`):
- `summarizeTool("read_file", { path: "a.txt" })` → `"a.txt"`.
- `summarizeTool("write_file", { path: "b.js", content: "..." })` → `"b.js"`.
- `summarizeTool("run_bash", { command: "ls -la" })` → `"ls -la"`.
- `summarizeTool("run_bash", { command: "x".repeat(100) })` → trunca para 80 chars com `…`.
- Tool desconhecida → fallback `JSON.stringify(args)`.

#### 2.2. Atualizar `format.js`

- `formatDecision` recebe `summarized` pronto (ou chama `summarizeTool` internamente). Opção 1: receber `summarized` já resolvido vindo do event handler. Opção 2: format.js importar `summarizeTool` e chamar. A segunda é mais encapsulada e não quebra interface de evento.

```js
export function formatDecision({ iteracao, tool, args }) {
  const summary = summarizeTool(tool, args);
  return `[iter ${iteracao}] → ${tool} ${summary}`;
}
```

- Mantém `formatConfirmation` intacta (usa `JSON.stringify(args)` como antes).

#### 2.3. Atualizar `cli.js`

- Garantir que `onEvent("tool_decision", data)` está passando `args` (já passa).
- `format.js::formatDecision` agora vai exibir compacto automaticamente.

#### 2.4. Atualizar agent.js

- `onEvent("tool_decision")` continua passando `{ iteracao, tool, args, error }`. A mudança é só visual no format.js.

### Critério de sucesso da Fase 2

```
node src/cli.js "leia src/agent.js e src/cli.js"
```

- Vê `[iter 1] → read_file src/agent.js` (sem JSON verbose).
- `[iter 2] → read_file src/cli.js`.
- Confirm: `node src/cli.js "crie um arquivo teste.txt"` → vê `[iter 1] → write_file teste.txt` no decision e `[iter 1] ? confirmar write_file {"path":"teste.txt","content":"..."} (y/n):` no confirmation.
- `npm test` verde.

---

## Fase 3 — REPL Interativo

### Objetivo
- `runAgent` aceita mensagens iniciais via `opts.messages` e retorna `messages` atualizadas no resultado.
- Novo `src/repl.js` com loop readline, comandos `/exit`, `/clear`, `/help`.
- `cli.js` detecta se `argv[2]` existe: single-shot; senão: REPL.

### Passos

#### 3.1. Refatorar `src/agent.js` — `messages` configurável

- `runAgent` ganha suporte a `opts.messages`:
  ```js
  const messages = opts.messages ?? [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: task },
  ];
  ```
- Se `opts.messages` foi passado, **não usa** `opts.task` (ou usa apenas se messages não veio).
- Resultado `{ iterations, reason, messages, finalContent }` inclui `messages` completas (já inclui hoje).
- **Compatibilidade**: se só `task` for passado, cria messages do zero como antes. Nada quebra.

**Testes** (`test/agent.test.js`):
- `runAgent` com `messages` pré-definidas → usa essas mensagens em vez de criar.
- `runAgent` sem `messages` + com `task` → cria como antes.
- Mensagens retornadas no resultado contêm todas as mensagens trocadas.

#### 3.2. Novo `src/repl.js`

- Função `runRepl(opts)` que:
  - Cria `messages` com system prompt (sem user message inicial).
  - Entra em loop `while (true)` com `readline.createInterface`.
  - Prompt: `\x1b[34magent>\x1b[0m ` (azul).
  - Comandos:
    - `/exit` → break e encerra.
    - `/clear` → limpa histórico (mantém system prompt) + console.clear().
    - `/help` → mostra comandos disponíveis.
    - Input normal → adiciona `{ role: "user", content: line }` em messages; chama `runAgent({ messages, callApi, executeTool, ... })` com `maxIterations` razoável (ex.: 15) e `stream: true`.
      - Ao retornar, pega `result.messages` e substitui `messages` (ou mescla mensagens novas).
      - Exibe `finalContent` ou indica que terminou.
      - Em caso de erro, mostra e mantém loop vivo.
- Ctrl-D (`close` event) → trata como `/exit`.
- Exporta `runRepl`.

#### 3.3. Atualizar `src/cli.js`

```js
if (task) {
  // modo single-shot (atual)
  const result = await runAgent({ ... });
  // ...
} else {
  // modo REPL
  const { runRepl } = await import("./repl.js");
  await runRepl({ callApi, executeTool, getToolSchema, confirm, ... });
}
```

- REPL usa as mesmas instâncias de `callApi`, `executeTool`, `confirm`, `logger`.
- Logger: cada turno do REPL loga separadamente ou append no mesmo arquivo. Pode iniciar logger novo por turno ou usar o mesmo.

#### 3.4. Logger no REPL

- Iniciar `logger` com `createLogger("logs")` no início do REPL.
- Logar cada interação do `runAgent` com prefixo do epoch/turno.
- Ao final do REPL, mostrar caminho do arquivo de log.

### Testes

#### `test/repl.test.js` (unitário)

- Mock de `createInterface` (readline):
  ```js
  import { createInterface } from "node:readline";
  vi.mock("node:readline");
  ```
- Testar dispatch de comandos:
  - Input `/exit` → chama `rl.close()` e loop termina.
  - Input `/clear` → chama `console.clear()` e mantém loop.
  - Input `/help` → imprime ajuda e mantém loop.
  - Input normal → chama `runAgent` com mensagens acumuladas.
- Testar acúmulo de mensagens entre turnos:
  - Mock `runAgent` retorna `{ messages: [system, user, assistant, tool...] }`.
  - Após 1º turno, mensagens do resultado são a base do 2º turno.
- Testar Ctrl-D (`close` event) → loop encerra.

#### `test/agent.test.js`

- Testar `messages` passado como opt: deve pular criação e usar o array fornecido.

### Critério de sucesso da Fase 3

```
node src/cli.js
```

- Vê prompt `agent>`.
- Digita "lista os arquivos do diretório src" → vê streaming, tool calls, resultado.
- Digita "agora leia o arquivo agent.js" → contexto mantido.
- `/exit` → volta ao terminal.
- `node src/cli.js "tarefa unica"` → modo single-shot funciona como antes.

---

## Fase 4 — Polish Final

### 4.1. README.md

Atualizar com:
- Descrição dos modos (REPL e single-shot).
- Exemplo de streaming e reasoning.
- Comandos do REPL (`/exit`, `/clear`, `/help`).

### 4.2. Verificação final

- `npm test` (todos os testes unitários, sem integração).
- Teste manual: `node src/cli.js` → REPL.
- Teste manual: `node src/cli.js "hello"` → single-shot.

---

## Diagrama de Fluxo do Streaming

```
callApiStream(messages, tools)
  │
  ├─ POST /v1/chat/completions { stream: true }
  │
  └─ for each SSE chunk "data: {...}"
       │
       ├─ reduceDelta(acc, chunk.choices[0].delta)
       │    ├─ delta.content   → acc.content
       │    ├─ delta.reasoning → acc.reasoning
       │    └─ delta.tool_calls → acc.tool_calls[idx].{id,name,arguments}
       │
       └─ onEvent("token", { type, text })
            ├─ type="reasoning" → prefixo "› " + cor ANSI 90 (cinza)
            └─ type="content"   → stdout sem newline
```

## Diagrama do REPL

```
cli.js
  │
  ├─ argv[2] presente? → runAgent (single-shot) → exit
  │
  └─ sem argv → runRepl()
                  │
                  ├─ readline loop
                  │    ├─ user input → { role: "user" } → append messages
                  │    ├─ runAgent({ messages, stream: true })
                  │    │    └─ retorna messages atualizadas + finalContent
                  │    └─ messages = result.messages (próximo turno)
                  │
                  ├─ "/exit" → break
                  ├─ "/clear" → messages = [system] + console.clear()
                  └─ "/help" → print commands
```

## Dependências entre Fases

```
Fase 1 (streaming) ──────► Fase 3 (REPL) ─────► Fase 4 (polish)
                              │
Fase 2 (compact) ───────────►┘
```

Fase 1 e Fase 2 são independentes entre si. Fase 3 depende do `messages` no `runAgent` (criado na Fase 1) e das mudanças de display (Fase 2 e Fase 1). A ordem 1→2→3→4 minimiza retrabalho.

---

## Checklist de Entrega por Fase

### Fase 1
- [ ] `src/streamReduce.js` com `reduceDelta` + `createStreamReducer`
- [ ] `src/openrouter.js` com `callApiStream` +
      `callApi` suportando `stream: true/false`
- [ ] `src/agent.js` consumindo generator, emitindo `"token"` events
- [ ] `src/format.js` exibindo `"token"` com estilo de reasoning
- [ ] `test/streamReduce.test.js` (4+ testes)
- [ ] `test/openrouter.test.js` (4+ testes)
- [ ] Testes de `agent` ampliados
- [ ] `npm test` verde

### Fase 2
- [ ] `summarize(args)` em cada tool module
- [ ] `summarizeTool(name, args)` em `tools/index.js`
- [ ] `formatDecision` atualizado
- [ ] `formatConfirmation` mantido intacto
- [ ] `test/tools.index.test.js` (5+ testes)
- [ ] `test/format.test.js` atualizado
- [ ] `npm test` verde

### Fase 3
- [ ] `runAgent` aceita `opts.messages`
- [ ] `src/repl.js` com `runRepl`
- [ ] `src/cli.js` bifurca modo REPL vs single-shot
- [ ] Logger integrado no REPL
- [ ] `test/repl.test.js` (4+ testes)
- [ ] `test/agent.test.js` ampliado
- [ ] `npm test` verde

### Fase 4
- [ ] README atualizado
- [ ] Teste manual REPL + single-shot
- [ ] `npm test` verde
