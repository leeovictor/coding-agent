# Fase M7 — Integração: CLI + Testes de Integração com API Real

## Objetivo

Conectar todos os módulos das fases anteriores num `cli.js` executável, e adicionar testes de integração que exercitam o fluxo completo contra a API real do OpenRouter.

Esta fase **não cria nova lógica de negócio** — apenas costura os módulos existentes e valida o conjunto.

## Pré-requisitos

- Todas as fases M1–M6 implementadas e testadas
- `npm test` passando 100%
- Uma chave `OPENROUTER_API_KEY` válida em `.env` para os testes de integração

## Arquivos a criar nesta fase

### `src/openrouter.js` — adapter real para a API

Função `callApi` concreta, injetada no `runAgent`. Separada do `cli.js` para ser testável isoladamente (em M7 com mock, ou futuramente em testes de contrato).

```js
import { loadEnv } from "./env.js";

const env = loadEnv();

export const OPENROUTER_MODEL =
  env.OPENROUTER_MODEL || process.env.OPENROUTER_MODEL || "anthropic/claude-sonnet-4.5";

const API_KEY =
  env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY;

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

/**
 * Faz uma chamada real à API OpenRouter.
 * @param {object[]} messages
 * @param {object[]} tools - schemas OpenAI
 * @returns {Promise<object>} resposta JSON
 */
export async function callApi(messages, tools) {
  if (!API_KEY) throw new Error("OPENROUTER_API_KEY não configurada.");

  const body = {
    model: OPENROUTER_MODEL,
    messages,
  };
  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = "auto";
  }

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://localhost",
      "X-Title": "cli-agent-study",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenRouter ${res.status}: ${text}`);
  }

  return res.json();
}
```

### `src/cli.js` — entrada final (substitui a versão M1)

```js
import { runAgent } from "./agent.js";
import { createLogger } from "./logger.js";
import { createConsoleEventHandler } from "./format.js";
import { createConfirm } from "./confirm.js";
import { formatConfirmation } from "./format.js";
import { getToolSchema, executeTool } from "./tools/index.js";
import { callApi, OPENROUTER_MODEL } from "./openrouter.js";
import { loadEnv } from "./env.js";

const env = loadEnv();
const maxIterations = parseInt(
  env.OPENROUTER_MAX_ITERATIONS || process.env.OPENROUTER_MAX_ITERATIONS || "20",
  10
);

const task = process.argv[2];
if (!task) {
  console.error("Uso: node src/cli.js <tarefa>");
  process.exit(1);
}

const logger = createLogger("logs");
const consoleHandler = createConsoleEventHandler();
const confirm = createConfirm({ formatConfirmation });

console.log(`Modelo: ${OPENROUTER_MODEL}`);
console.log(`Máx. iterações: ${maxIterations}`);
console.log(`Logs: ${logger.filePath}\n`);

try {
  const result = await runAgent({
    task,
    tools: getToolSchema(),
    callApi,
    executeTool,
    confirm,
    maxIterations,
    onEvent: (event, data) => {
      consoleHandler(event, data);
      logger.logEvent(event, data);
    },
  });

  console.log(`\nConcluído em ${result.iterations} iteração(ões). Motivo: ${result.reason}`);
  console.log(`Logs completos em: ${logger.filePath}`);
} catch (e) {
  console.error("\nErro fatal:", e.message);
  logger.logEvent("fatal_error", { message: e.message, stack: e.stack });
  process.exit(1);
}

process.exit(0);
```

> O `process.exit(0)` no fim garante que o `readline` (se criado pela confirmação) não pendure o processo.

### `test/integration.test.js` — testes de integração com API real

```js
import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAgent } from "../src/agent.js";
import { callApi, OPENROUTER_MODEL } from "../src/openrouter.js";
import { getToolSchema, executeTool } from "../src/tools/index.js";
import { createLogger } from "../src/logger.js";

const RUN = process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_RUN_INTEGRATION;

describe.skipIf(!RUN)("integração com OpenRouter", () => {
  const tools = getToolSchema();
  let tmpDir;

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "agent-int-"));
  });

  it("modelo configurado é uma string não-vazia", () => {
    expect(typeof OPENROUTER_MODEL).toBe("string");
    expect(OPENROUTER_MODEL.length).toBeGreaterThan(0);
  });

  it("tarefa simples sem tools retorna texto e conclui", async () => {
    const result = await runAgent({
      task: "Responda apenas a palavra 'pronto'.",
      tools: [],
      callApi,
      executeTool,
      maxIterations: 3,
    });
    expect(result.reason).toBe("concluido");
    expect(result.iterations).toBe(1);
    expect(result.finalContent).toBeTruthy();
  }, 30_000);

  it("tarefa que exige read_file funciona", async () => {
    // cria arquivo de teste
    const p = join(tmpDir, "alvo.txt");
    require("node:fs").writeFileSync(p, "conteudo-secreto-123");

    const result = await runAgent({
      task: `Leia o arquivo ${p} e responda apenas o seu conteúdo, sem usar outras ferramentas.`,
      tools,
      callApi,
      executeTool,
      maxIterations: 5,
    });
    expect(result.reason).toBe("concluido");
    expect(result.finalContent).toMatch(/conteudo-secreto-123/);
  }, 60_000);

  it("tarefa que exige write_file cria arquivo de verdade", async () => {
    const p = join(tmpDir, "saida.txt");
    const result = await runAgent({
      task: `Crie o arquivo ${p} contendo o texto "hello mundo". Use write_file.`,
      tools,
      callApi,
      executeTool,
      confirm: async () => true, // auto-confirma
      maxIterations: 5,
    });
    expect(result.reason).toBe("concluido");
    expect(existsSync(p)).toBe(true);
    expect(readFileSync(p, "utf8")).toMatch(/hello mundo/);
  }, 60_000);

  it("logger JSONL é gerado e contém eventos esperados", async () => {
    const logger = createLogger(tmpDir);
    await runAgent({
      task: "Responda apenas 'ok'.",
      tools: [],
      callApi,
      executeTool,
      maxIterations: 3,
      onEvent: (event, data) => logger.logEvent(event, data),
    });
    expect(existsSync(logger.filePath)).toBe(true);
    const lines = readFileSync(logger.filePath, "utf8").trim().split("\n").map(JSON.parse);
    const types = lines.map((l) => l.event);
    expect(types).toContain("request");
    expect(types).toContain("response");
    expect(types).toContain("loop_end");
  }, 30_000);
});
```

### Atualizar `vitest.config.js`

Confirmar que `integration.test.js` continua excluído do `test` padrão:

```js
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.js"],
    exclude: ["test/integration.test.js", "node_modules/**"],
  },
});
```

### `README.md`

Criar documentação básica:

```markdown
# cli-agent

Agente CLI mínimo em Node.js que chama a API OpenRouter e executa ferramentas
(read_file, write_file, run_bash) num loop agent.

## Setup

1. `npm install`
2. Copiar `.env.example` para `.env` e preencher `OPENROUTER_API_KEY`

## Uso

node src/cli.js "tarefa aqui"

## Testes

npm test                         # testes unitários
npm run test:integration         # testes de integração (exige chave)
```

### `.env.example`

```
OPENROUTER_API_KEY=sk-or-...
OPENROUTER_MODEL=anthropic/claude-sonnet-4.5
OPENROUTER_MAX_ITERATIONS=20
```

## Comandos de validação da fase

```bash
# 1. Todos os testes unitários
npm test

# 2. Testes de integração (exige chave real)
npm run test:integration

# 3. Demo executável 1: tarefa simples
node src/cli.js "diga oi"

# 4. Demo executável 2: criação de arquivo
node src/cli.js "crie um arquivo hello.txt com a palavra mundo"
# esperado: pergunta y/n, cria arquivo, mostra logs

# 5. Demo executável 3: tarefa com leitura
node src/cli.js "liste os arquivos .js na pasta src e me diga quantas linhas cada um tem"
# esperado: chama run_bash, pede confirmação, mostra resultado
```

## Critérios de aceite da fase (critérios finais do projeto)

- [ ] `npm test` passa com 100% dos testes unitários
- [ ] `npm run test:integration` passa (com chave configurada)
- [ ] `node src/cli.js "diga oi"` imprime resposta real da API
- [ ] `node src/cli.js "crie um arquivo notas.txt dizendo oi"` cria o arquivo de verdade após confirmação `y`
- [ ] Terminal mostra cada decisão do modelo (tool, args, resultado)
- [ ] `write_file` e `run_bash` pedem confirmação `y/n`; `read_file` não pede
- [ ] Trocar `OPENROUTER_MODEL` no `.env` não quebra o parsing
- [ ] Cada execução gera `logs/agent-<timestamp>.jsonl`
- [ ] Arquivo JSONL contém eventos: `request`, `response`, `tool_*`, `loop_end`
- [ ] Agente para sozinho ao concluir (não entra em loop infinito)
- [ ] Agente respeita `OPENROUTER_MAX_ITERATIONS` (default 20)
- [ ] Erros de tool viram string e voltam ao modelo (não crasham o agente)
- [ ] README.md existe e explica setup + uso

## Riscos e armadilhas

- **Custo de API**: cada iteração do loop é uma chamada. Testes de integração fazem 3-4 chamadas por execução. Usar modelo barato (ex: `google/gemini-flash-1.5` ou `openai/gpt-4o-mini`) durante desenvolvimento.
- **Variação entre modelos**: o teste "responda apenas 'pronto'" pode falhar com modelos verbosos. Ajustar asserções para `toMatch(/pronto/)` em vez de `toBe("pronto")`.
- **Rate limit do OpenRouter**: se os testes de integração forem muitos, espaçar com timeout. Vitest respeita o `timeout` por teste (30s+).
- **`readline` pendurando o processo**: o `process.exit(0)` no fim do `cli.js` garante encerramento. Em testes, não usar `readline` real — injetar `confirm: async () => true`.
- **Arquivos criados pelos testes de integração**: sempre em `tmpDir`, nunca no projeto. `beforeAll`/`afterAll` limpam.
- **`require("node:fs")` em ESM**: o teste acima usa `require` — em projeto ESM, trocar por `import` no topo. (Ajustar na implementação final.)

## Estrutura final do projeto (referência)

```
cli-agent/
├── package.json
├── vitest.config.js
├── .env.example
├── .env                    # gitignored
├── .gitignore
├── README.md
├── docs/plan/              # estes documentos
├── logs/                   # gitignored
├── src/
│   ├── agent.js
│   ├── cli.js
│   ├── env.js
│   ├── openrouter.js
│   ├── parseResponse.js
│   ├── logger.js
│   ├── format.js
│   ├── confirm.js
│   └── tools/
│       ├── index.js
│       ├── readFile.js
│       ├── writeFile.js
│       └── runBash.js
└── test/
    ├── env.test.js
    ├── parseResponse.test.js
    ├── logger.test.js
    ├── format.test.js
    ├── confirm.test.js
    ├── agent.test.js
    ├── tools.index.test.js
    ├── tools/
    │   ├── readFile.test.js
    │   ├── writeFile.test.js
    │   └── runBash.test.js
    └── integration.test.js
```

## Resumo do fluxo de execução final

```
cli.js recebe argv[2] como tarefa
  → carrega .env (model, maxIterations, apiKey)
  → cria logger (arquivo JSONL novo)
  → cria console handler (saída legível)
  → cria confirm (readline)
  → chama runAgent({task, tools, callApi, executeTool, confirm, onEvent})
      └── onEvent dispara consoleHandler + logger.logEvent para cada evento
  → runAgent faz loop:
      callApi(messages, tools) → response
      se response.tool_calls → executar cada um (com confirm se sensível) → empilhar role:tool → repetir
      senão → mostrar content final → encerrar
  → imprime resumo (iterações, motivo, caminho do log)
  → process.exit(0)
```

## Pós-implementação (extensões futuras, fora do escopo v1)

- Streaming de tokens
- REPL interativo (chat contínuo)
- Subagentes
- Sandboxing de `run_bash`
- Resumo automático de contexto longo
- Permissões granulares por path/comando
