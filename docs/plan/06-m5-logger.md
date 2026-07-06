# Fase M5 — Logger JSONL

## Objetivo

Registrar **todos os eventos** da execução do agente num arquivo `.jsonl` (uma linha JSON por evento) para análise posterior com `jq`, scripts, notebooks, etc.

Cada execução gera um arquivo `logs/agent-<timestamp>.jsonl`.

## Princípios

- Função factory `createLogger(logDir)` retorna um objeto com `logEvent(event, data)`.
- `logEvent` faz **append** de uma linha JSON no arquivo da execução atual.
- Sanitiza valores `undefined` (substitui por `null`) para não quebrar `JSON.stringify`.
- Trunca campos potencialmente grandes (`resultado`, `mensagens`) para não gerar arquivos gigantes — mas sempre mantém um preview.
- Nunca lança — logging é best-effort (erros de I/O viram `console.error` mas não quebram o agente).
- Timestamp ISO 8601 em todos os eventos.

## Arquivos a criar nesta fase

### `src/logger.js`

```js
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const MAX_FIELD_LEN = 10_000;
const PREVIEW_LEN = 2_000;

function preview(value, len = PREVIEW_LEN) {
  const str = typeof value === "string" ? value : JSON.stringify(value);
  if (!str) return str;
  if (str.length <= len) return value;
  return str.slice(0, len) + `… [+${str.length - len} chars]`;
}

function sanitize(data) {
  // substitui undefined por null e trunca campos grandes recursivamente (1 nível)
  const out = {};
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) { out[k] = null; continue; }
    if (typeof v === "string" && v.length > MAX_FIELD_LEN) {
      out[k] = preview(v);
    } else if (v && typeof v === "object" && !Array.isArray(v)) {
      out[k] = {};
      for (const [k2, v2] of Object.entries(v)) {
        out[k][k2] = (typeof v2 === "string" && v2.length > MAX_FIELD_LEN) ? preview(v2) : (v2 === undefined ? null : v2);
      }
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Cria um logger que escreve eventos num arquivo JSONL.
 *
 * @param {string} logDir - diretório onde criar o arquivo
 * @param {object} [deps]
 * @param {function} [deps.now] - injetável para testes (default: () => new Date())
 * @param {function} [deps.errorHandler] - (err) => void, default console.error
 * @returns {{logEvent: (event: string, data: object) => void, filePath: string}}
 */
export function createLogger(logDir, deps = {}) {
  const now = deps.now ?? (() => new Date());
  const errorHandler = deps.errorHandler ?? ((e) => console.error("logger error:", e.message));

  mkdirSync(logDir, { recursive: true });
  const stamp = now().toISOString().replace(/[:.]/g, "-");
  const filePath = join(logDir, `agent-${stamp}.jsonl`);

  function logEvent(event, data) {
    try {
      const line = JSON.stringify({
        event,
        timestamp: now().toISOString(),
        ...sanitize(data ?? {}),
      });
      appendFileSync(filePath, line + "\n", "utf8");
    } catch (e) {
      errorHandler(e);
    }
  }

  return { logEvent, filePath };
}
```

## Decisões de design

1. **`createLogger` é factory**: facilita testes — cada teste cria um logger com `logDir` num diretório temporário.
2. **`now` injetável**: permite testes determinísticos (timestamps previsíveis).
3. **Sanitização de `undefined`**: `JSON.stringify({a: undefined})` produz `{}`, perdendo a chave. Substituir por `null` preserva a chave — útil para debug.
4. **Truncamento**: `resultado` de `read_file` num arquivo de 50KB não deve gerar linha de 50KB no log. Limita a 2000 chars com indicador `+N chars`.
5. **Não lança**: logging nunca deve quebrar o agente.
6. **Um arquivo por execução**: o timestamp no nome garante uniqueness.

## Testes unitários — `test/logger.test.js`

```js
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLogger } from "../src/logger.js";

let tmpDir;
beforeEach(() => { tmpDir = mkdtempSync(join(tmpdir(), "log-")); });
afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

function readLines(filePath) {
  return readFileSync(filePath, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse);
}

describe("createLogger", () => {
  it("cria arquivo .jsonl no diretório informado", () => {
    const { filePath } = createLogger(tmpDir);
    expect(existsSync(filePath)).toBe(true);
    expect(filePath).toMatch(/\.jsonl$/);
  });

  it("nome do arquivo contém timestamp ISO", () => {
    const fixed = new Date("2026-07-06T14:32:01.000Z");
    const { filePath } = createLogger(tmpDir, { now: () => fixed });
    expect(filePath).toMatch(/agent-2026-07-06T14-32-01-000Z/);
  });

  it("logEvent escreve uma linha JSON válida com event e timestamp", () => {
    const fixed = new Date("2026-07-06T14:32:01.000Z");
    const { logEvent, filePath } = createLogger(tmpDir, { now: () => fixed });
    logEvent("request", { modelo: "x", iteracao: 1 });
    const lines = readLines(filePath);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toEqual({
      event: "request",
      timestamp: "2026-07-06T14:32:01.000Z",
      modelo: "x",
      iteracao: 1,
    });
  });

  it("múltiplos logEvent produzem múltiplas linhas (append)", () => {
    const { logEvent, filePath } = createLogger(tmpDir);
    logEvent("request", { i: 1 });
    logEvent("response", { i: 1 });
    logEvent("tool_execution", { tool: "x" });
    const lines = readLines(filePath);
    expect(lines).toHaveLength(3);
    expect(lines.map((l) => l.event)).toEqual(["request", "response", "tool_execution"]);
  });

  it("substitui undefined por null", () => {
    const { logEvent, filePath } = createLogger(tmpDir);
    logEvent("x", { a: undefined, b: 1 });
    const [line] = readLines(filePath);
    expect(line.a).toBeNull();
    expect(line.b).toBe(1);
  });

  it("trunca strings muito longas com indicador", () => {
    const { logEvent, filePath } = createLogger(tmpDir);
    const longo = "x".repeat(5000);
    logEvent("tool_execution", { resultado: longo });
    const [line] = readLines(filePath);
    expect(line.resultado.length).toBeLessThan(5000);
    expect(line.resultado).toMatch(/\+\d+ chars\]/);
  });

  it("não lança mesmo com objeto com chave circular-like (usando sanitização)", () => {
    const { logEvent, filePath } = createLogger(tmpDir);
    const obj = { normal: 1 };
    obj.self = obj; // referência circular
    // JSON.stringify lança em referência circular — logger deve capturar
    const errors = [];
    const { logEvent: logSafe } = createLogger(tmpDir, { errorHandler: (e) => errors.push(e) }).logEvent
      ? createLogger(tmpDir, { errorHandler: (e) => errors.push(e) })
      : null;
    // como createLogger retorna {logEvent, filePath}, acessar assim:
    const logger2 = createLogger(tmpDir, { errorHandler: (e) => errors.push(e) });
    expect(() => logger2.logEvent("x", obj)).not.toThrow();
    expect(errors.length).toBeGreaterThan(0);
  });

  it("cria diretório se não existir", () => {
    const nested = join(tmpDir, "nested", "deep");
    const { filePath } = createLogger(nested);
    expect(existsSync(filePath)).toBe(true);
  });

  it("logEvent com data null/undefined não quebra", () => {
    const { logEvent, filePath } = createLogger(tmpDir);
    expect(() => logEvent("x", null)).not.toThrow();
    expect(() => logEvent("x", undefined)).not.toThrow();
    const lines = readLines(filePath);
    expect(lines).toHaveLength(2);
  });
});
```

## Como integrar com o `runAgent`

No `cli.js` (M7):

```js
import { createLogger } from "./logger.js";
import { createConsoleEventHandler } from "./format.js";

const logger = createLogger("logs");
const consoleHandler = createConsoleEventHandler();

await runAgent({
  ...
  onEvent: (event, data) => {
    consoleHandler(event, data);       // saída legível no terminal
    logger.logEvent(event, data);      // persistência em JSONL
  },
});

console.log(`\nLogs da execução em: ${logger.filePath}`);
```

## Eventos logados (referência)

| Evento | Campos | Origem |
|---|---|---|
| `request` | iteracao, modelo, mensagens | M3 (loop) |
| `response` | iteracao, response (object completo) | M3 |
| `tool_decision` | iteracao, tool, args, error | M3 |
| `tool_confirmation` | iteracao, tool, args, decisao | M3 |
| `tool_execution` | iteracao, tool, args, resultado, duration_ms | M3 |
| `final_content` | content | M3 |
| `loop_end` | motivo, iteracoes | M3 |

## Comandos de validação da fase

```bash
npm test src/logger.test.js
npm test                    # tudo passa
```

## Critérios de aceite da fase

- [ ] `createLogger(logDir)` retorna `{logEvent, filePath}`
- [ ] Arquivo `.jsonl` criado no diretório informado
- [ ] Cada `logEvent` gera exatamente uma linha JSON válida
- [ ] Múltiplos eventos são appended (não sobrescritos)
- [ ] `undefined` vira `null` (preserva chave)
- [ ] Strings longas são truncadas com indicador
- [ ] Referências circulares não crasham o logger
- [ ] Diretório é criado se não existir (`recursive: true`)
- [ ] `now` injetável permite testes determinísticos

## Riscos e armadilhas

- **`appendFileSync` síncrono**: pode ser gargalo em loops com muitas iterações. Para v1 é aceitável — simplicidade > performance. Anotar como possível melhoria.
- **Race condition em testes**: cada teste deve ter seu próprio `tmpDir` (via `beforeEach`) para não interferir.
- **Timestamp no nome do arquivo**: usar `replace(/[:.]/g, "-")` para evitar caracteres inválidos em nomes de arquivo no Windows.
- **`JSON.stringify` com referência circular**: lança `TypeError`. O try/catch no `logEvent` captura e chama `errorHandler`.

## Dependências para a próxima fase

- `createLogger` pronto para ser plugado no `onEvent` do `runAgent`
- Eventos já são emitidos pelo `runAgent` (M3) — só plugar
