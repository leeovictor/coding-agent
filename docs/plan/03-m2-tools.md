# Fase M2 — Schema e Executores das 3 Tools

## Objetivo

Implementar as 3 ferramentas do agente (`read_file`, `write_file`, `run_bash`) e um registro central que:
1. Define o schema OpenAI de cada tool.
2. Implementa a função `execute(args)` de cada uma.
3. Marca quais tools são "sensíveis" (pedem confirmação).
4. Expõe `getToolSchema()` que retorna o array no formato esperado pela API.

## Princípios desta fase

- **Executores nunca lançam** — sempre retornam string (sucesso ou erro).
- Erros viram string para que o modelo possa reagir (loop em M3 depende disso).
- `run_bash` executa com `cwd` explícito = diretório de invocação do CLI.
- `write_file` cria diretórios pais se necessário (comportamento útil e previsível).
- `read_file` trunca saída muito longa para não estourar o contexto (limite ~50KB).

## Arquivos a criar nesta fase

### `src/tools/readFile.js`

```js
import { readFileSync } from "node:fs";

const MAX_BYTES = 50_000;

export const schema = {
  type: "function",
  function: {
    name: "read_file",
    description: "Lê o conteúdo de um arquivo de texto.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Caminho do arquivo (relativo ou absoluto)." },
      },
      required: ["path"],
    },
  },
};

export const sensitive = false;

/**
 * @param {{path: string}} args
 * @returns {string} conteúdo ou mensagem de erro
 */
export function execute({ path }) {
  if (!path) return "ERRO: parâmetro 'path' é obrigatório.";
  try {
    const buf = readFileSync(path);
    if (buf.length > MAX_BYTES) {
      const truncated = buf.subarray(0, MAX_BYTES).toString("utf8");
      return truncated + `\n\n... [truncado: arquivo tem ${buf.length} bytes, mostrando os primeiros ${MAX_BYTES}]`;
    }
    return buf.toString("utf8");
  } catch (e) {
    return `ERRO ao ler '${path}': ${e.message}`;
  }
}
```

### `src/tools/writeFile.js`

```js
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export const schema = {
  type: "function",
  function: {
    name: "write_file",
    description: "Cria ou sobrescreve um arquivo com o conteúdo fornecido.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Caminho do arquivo." },
        content: { type: "string", description: "Conteúdo a ser escrito." },
      },
      required: ["path", "content"],
    },
  },
};

export const sensitive = true;

export function execute({ path, content }) {
  if (!path) return "ERRO: parâmetro 'path' é obrigatório.";
  if (content === undefined || content === null) return "ERRO: parâmetro 'content' é obrigatório.";
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, String(content), "utf8");
    const bytes = Buffer.byteLength(String(content), "utf8");
    return `OK: arquivo '${path}' escrito (${bytes} bytes).`;
  } catch (e) {
    return `ERRO ao escrever '${path}': ${e.message}`;
  }
}
```

### `src/tools/runBash.js`

```js
import { execSync } from "node:child_process";

export const schema = {
  type: "function",
  function: {
    name: "run_bash",
    description: "Executa um comando no shell do sistema. Use com cuidado.",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "Comando bash a ser executado." },
      },
      required: ["command"],
    },
  },
};

export const sensitive = true;

export function execute({ command }) {
  if (!command) return "ERRO: parâmetro 'command' é obrigatório.";
  try {
    const stdout = execSync(command, {
      encoding: "utf8",
      cwd: process.cwd(),
      maxBuffer: 1_000_000,
      timeout: 30_000,
    });
    const trimmed = stdout.length > 50_000
      ? stdout.slice(0, 50_000) + "\n...[saída truncada]"
      : stdout;
    return trimmed || "(sem saída)";
  } catch (e) {
    const stderr = e.stderr ? e.stderr.toString() : "";
    const stdout = e.stdout ? e.stdout.toString() : "";
    return `ERRO (exit ${e.status ?? "?"}):\n--- stdout ---\n${stdout}\n--- stderr ---\n${stderr}`;
  }
}
```

### `src/tools/index.js` — registro central

```js
import * as readFile from "./readFile.js";
import * as writeFile from "./writeFile.js";
import * as runBash from "./runBash.js";

export const toolRegistry = {
  read_file: { schema: readFile.schema, execute: readFile.execute, sensitive: readFile.sensitive },
  write_file: { schema: writeFile.schema, execute: writeFile.execute, sensitive: writeFile.sensitive },
  run_bash: { schema: runBash.schema, execute: runBash.execute, sensitive: runBash.sensitive },
};

/**
 * Retorna o array de schemas no formato OpenAI para enviar na requisição.
 * @returns {object[]}
 */
export function getToolSchema() {
  return Object.values(toolRegistry).map((t) => t.schema);
}

/**
 * Executa uma tool pelo nome.
 * @param {string} name
 * @param {object} args
 * @returns {string} resultado (sempre string, nunca lança)
 */
export function executeTool(name, args) {
  const tool = toolRegistry[name];
  if (!tool) return `ERRO: tool '${name}' não existe.`;
  try {
    return tool.execute(args ?? {});
  } catch (e) {
    return `ERRO inesperado em '${name}': ${e.message}`;
  }
}

/**
 * Verifica se uma tool é sensível (pede confirmação).
 * @param {string} name
 * @returns {boolean}
 */
export function isSensitive(name) {
  return Boolean(toolRegistry[name]?.sensitive);
}
```

## Testes unitários

### `test/tools/readFile.test.js`

```js
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execute } from "../../src/tools/readFile.js";

let tmpDir;
beforeEach(() => { tmpDir = mkdtempSync(join(tmpdir(), "agent-")); });
afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

describe("readFile.execute", () => {
  it("lê conteúdo corretamente", () => {
    const p = join(tmpDir, "a.txt");
    writeFileSync(p, "hello world");
    expect(execute({ path: p })).toBe("hello world");
  });

  it("retorna erro (não lança) para arquivo inexistente", () => {
    const out = execute({ path: join(tmpDir, "nope.txt") });
    expect(out).toMatch(/ERRO/);
  });

  it("retorna erro se path não fornecido", () => {
    expect(execute({})).toMatch(/'path' é obrigatório/);
  });

  it("trunca arquivos grandes", () => {
    const p = join(tmpDir, "big.txt");
    const big = "x".repeat(60_000);
    writeFileSync(p, big);
    const out = execute({ path: p });
    expect(out).toMatch(/truncado/);
    expect(out.length).toBeLessThan(60_000);
  });
});
```

### `test/tools/writeFile.test.js`

```js
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execute } from "../../src/tools/writeFile.js";

let tmpDir;
beforeEach(() => { tmpDir = mkdtempSync(join(tmpdir(), "agent-")); });
afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

describe("writeFile.execute", () => {
  it("cria arquivo com conteúdo correto", () => {
    const p = join(tmpDir, "out.txt");
    const res = execute({ path: p, content: "abc" });
    expect(res).toMatch(/OK/);
    expect(readFileSync(p, "utf8")).toBe("abc");
  });

  it("sobrescreve arquivo existente", () => {
    const p = join(tmpDir, "o.txt");
    writeFileSync(p, "velho");
    execute({ path: p, content: "novo" });
    expect(readFileSync(p, "utf8")).toBe("novo");
  });

  it("cria diretórios pais se necessário", () => {
    const p = join(tmpDir, "sub", "dir", "f.txt");
    execute({ path: p, content: "x" });
    expect(existsSync(p)).toBe(true);
  });

  it("retorna erro se path não fornecido", () => {
    expect(execute({ content: "x" })).toMatch(/'path'/);
  });

  it("retorna erro se content não fornecido", () => {
    expect(execute({ path: "x" })).toMatch(/'content'/);
  });
});
```

### `test/tools/runBash.test.js`

```js
import { describe, it, expect } from "vitest";
import { execute } from "../../src/tools/runBash.js";

describe("runBash.execute", () => {
  it("executa echo e captura stdout", () => {
    const out = execute({ command: "echo hello" });
    expect(out).toMatch(/hello/);
  });

  it("retorna erro em string para comando inexistente", () => {
    const out = execute({ command: "comando_que_nao_existe_xyz" });
    expect(out).toMatch(/ERRO/);
    expect(out).toMatch(/exit/);
  });

  it("retorna erro para exit code não-zero", () => {
    const out = execute({ command: "exit 1" });
    expect(out).toMatch(/ERRO/);
  });

  it("retorna mensagem para comando sem saída", () => {
    const out = execute({ command: "true" });
    expect(out).toMatch(/sem saída/);
  });

  it("retorna erro se command não fornecido", () => {
    expect(execute({})).toMatch(/'command'/);
  });
});
```

### `test/tools.index.test.js`

```js
import { describe, it, expect } from "vitest";
import { toolRegistry, getToolSchema, executeTool, isSensitive } from "../src/tools/index.js";

describe("tools registry", () => {
  it("tem exatamente 3 tools", () => {
    expect(Object.keys(toolRegistry).sort()).toEqual(["read_file", "run_bash", "write_file"]);
  });

  it("getToolSchema retorna array no formato OpenAI", () => {
    const schemas = getToolSchema();
    expect(schemas).toHaveLength(3);
    schemas.forEach((s) => {
      expect(s.type).toBe("function");
      expect(s.function.name).toBeTruthy();
      expect(s.function.parameters.type).toBe("object");
      expect(s.function.parameters.properties).toBeDefined();
    });
  });

  it("read_file tem required: ['path']", () => {
    const s = getToolSchema().find((s) => s.function.name === "read_file");
    expect(s.function.parameters.required).toEqual(["path"]);
  });

  it("write_file tem required: ['path','content']", () => {
    const s = getToolSchema().find((s) => s.function.name === "write_file");
    expect(s.function.parameters.required).toEqual(["path", "content"]);
  });

  it("run_bash tem required: ['command']", () => {
    const s = getToolSchema().find((s) => s.function.name === "run_bash");
    expect(s.function.parameters.required).toEqual(["command"]);
  });

  it("isSensitive: read_file=false, write_file=true, run_bash=true", () => {
    expect(isSensitive("read_file")).toBe(false);
    expect(isSensitive("write_file")).toBe(true);
    expect(isSensitive("run_bash")).toBe(true);
  });

  it("isSensitive retorna false para tool inexistente", () => {
    expect(isSensitive("inexistente")).toBe(false);
  });

  it("executeTool retorna erro para tool inexistente", () => {
    expect(executeTool("nope", {})).toMatch(/não existe/);
  });

  it("executeTool nunca lança — captura exceção do executor", () => {
    const out = executeTool("read_file", { path: "/caminho/que/nao/existe/xxx" });
    expect(out).toMatch(/ERRO/);
  });
});
```

## Comandos de validação da fase

```bash
npm test src/tools/
npm test src/tools.index.test.js
npm test                    # tudo (incluindo M1 e M1.5) ainda passa
```

## Critérios de aceite da fase

- [ ] 3 executores implementados e testados
- [ ] Nenhum executor lança exceção — erros viram strings
- [ ] `getToolSchema()` retorna array válido OpenAI com 3 entradas
- [ ] `executeTool` é a função única usada pelo agente
- [ ] `isSensitive` marca corretamente as tools sensíveis
- [ ] Testes usam diretórios temporários (`mkdtempSync`) para isolamento
- [ ] `read_file` trunca arquivos grandes
- [ ] `write_file` cria diretórios pais
- [ ] `run_bash` tem timeout e maxBuffer definidos

## Riscos e armadilhas

- **Comandos bash perigosos em testes**: nunca usar `rm -rf` ou similar em testes. Usar `echo`, `true`, `exit 1`, comandos inócuos.
- **Paths relativos em testes**: sempre usar `join(tmpDir, ...)` para não poluir o projeto.
- **`execSync` com timeout**: definir `timeout: 30_000` para não travar testes em comandos pendentes.
- **Race conditions em `mkdtempSync`**: criar um diretório por `beforeEach`, nunca compartilhar entre testes.

## Dependências para a próxima fase

- `getToolSchema()` pronto para enviar na requisição em M3
- `executeTool(name, args)` pronto para chamar dentro do loop
- `isSensitive(name)` pronto para M6 (confirmação)
