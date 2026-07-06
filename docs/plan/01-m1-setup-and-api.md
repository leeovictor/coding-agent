# Fase M1 — Setup do Projeto + Chamada Simples à API

## Objetivo

Validar a base do projeto: estrutura de pastas, `package.json`, vitest configurado, parser de `.env` funcional, e uma chamada simples à API OpenRouter (sem tools ainda) para confirmar autenticação e formato de resposta.

## Pré-requisitos

- Node.js v18+ instalado (`node --version`)
- Uma chave válida do OpenRouter (`sk-or-...`)

## Arquivos a criar nesta fase

### `package.json`

```json
{
  "name": "cli-agent",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:integration": "OPENROUTER_RUN_INTEGRATION=1 vitest run test/integration.test.js",
    "dev": "node src/cli.js"
  },
  "devDependencies": {
    "vitest": "^1.6.0"
  }
}
```

### `vitest.config.js`

```js
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.js"],
    exclude: ["test/integration.test.js"],
  },
});
```

> Nota: `integration.test.js` é excluído do `test` padrão para não depender de rede/chave. Roda só via `npm run test:integration`.

### `.env` (não commitar — adicionar ao `.gitignore`)

```
OPENROUTER_API_KEY=sk-or-...
OPENROUTER_MODEL=anthropic/claude-sonnet-4.5
OPENROUTER_MAX_ITERATIONS=20
```

### `.gitignore`

```
node_modules/
.env
logs/
```

### `src/env.js` — parser `.env` à mão

**Contrato da função pura:**

```js
/**
 * Faz parse de um conteúdo .env (string) e retorna um objeto chave/valor.
 * Regras:
 * - Linhas em branco são ignoradas.
 * - Linhas começando com # são comentários (ignoradas).
 * - Suporta KEY=value e KEY="value" e KEY='value'.
 * - Valor com aspas pode conter = e espaços.
 * - Sem aspas, valor é tudo após o primeiro = (trim), sem comentário inline.
 * - Chave: somente [A-Za-z_][A-Za-z0-9_]* — outras linhas são ignoradas.
 *
 * @param {string} content
 * @returns {Record<string, string>}
 */
export function parseEnvFile(content) { ... }
```

**Casos de teste esperados** (ver `test/env.test.js` abaixo).

**Carregamento em runtime** — função `loadEnv(filePath)`:

```js
import { readFileSync } from "node:fs";

export function loadEnv(filePath = ".env") {
  try {
    const content = readFileSync(filePath, "utf8");
    return parseEnvFile(content);
  } catch {
    return {};
  }
}
```

### `src/cli.js` — entrada M1

Nesta fase, apenas faz uma chamada simples sem tools:

```js
import { loadEnv } from "./env.js";

const env = loadEnv();
const apiKey = env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY;
const model = env.OPENROUTER_MODEL || process.env.OPENROUTER_MODEL || "anthropic/claude-sonnet-4.5";

const task = process.argv[2];
if (!task) {
  console.error("Uso: node src/cli.js <tarefa>");
  process.exit(1);
}

const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": "https://localhost",
    "X-Title": "cli-agent-study",
  },
  body: JSON.stringify({
    model,
    messages: [
      { role: "user", content: task },
    ],
  }),
});

const data = await response.json();
console.log(data.choices[0].message.content);
```

## Testes unitários — `test/env.test.js`

```js
import { describe, it, expect } from "vitest";
import { parseEnvFile } from "../src/env.js";

describe("parseEnvFile", () => {
  it("faz parse de chave simples", () => {
    expect(parseEnvFile("KEY=value")).toEqual({ KEY: "value" });
  });

  it("faz parse de múltiplas chaves", () => {
    expect(parseEnvFile("A=1\nB=2")).toEqual({ A: "1", B: "2" });
  });

  it("ignora linhas em branco", () => {
    expect(parseEnvFile("A=1\n\nB=2")).toEqual({ A: "1", B: "2" });
  });

  it("ignora comentários com #", () => {
    expect(parseEnvFile("# comment\nA=1")).toEqual({ A: "1" });
  });

  it("suporta valor com aspas duplas contendo =", () => {
    expect(parseEnvFile('KEY="a=b"')).toEqual({ KEY: "a=b" });
  });

  it("suporta valor com aspas simples", () => {
    expect(parseEnvFile("KEY='hello world'")).toEqual({ KEY: "hello world" });
  });

  it("valor sem aspas é tudo após o primeiro =", () => {
    expect(parseEnvFile("URL=https://example.com?a=b")).toEqual({
      URL: "https://example.com?a=b",
    });
  });

  it("ignora linhas com chave inválida", () => {
    expect(parseEnvFile("123KEY=val\nVALID=ok")).toEqual({ VALID: "ok" });
  });

  it("string vazia retorna objeto vazio", () => {
    expect(parseEnvFile("")).toEqual({});
  });

  it("preserva espaços internos em valores aspeados", () => {
    expect(parseEnvFile('KEY="some value here"')).toEqual({
      KEY: "some value here",
    });
  });
});
```

## Comandos de validação da fase

```bash
# 1. Instalar deps
npm install

# 2. Rodar testes — devem passar
npm test

# 3. Demo executável: chamada real à API
node src/cli.js "diga oi em uma palavra"
# esperado: imprime uma resposta curta do modelo
```

## Critérios de aceite da fase

- [ ] `npm install` funciona sem erros
- [ ] `npm test` passa com todos os testes de `parseEnvFile`
- [ ] `node src/cli.js "diga oi"` imprime uma resposta real da API OpenRouter
- [ ] Arquivo `.env` é lido corretamente (chave e modelo carregados)
- [ ] `.gitignore` exclui `node_modules/`, `.env`, `logs/`

## Riscos e armadilhas

- **Chave inválida/não configurada**: o agente deve falhar com mensagem clara. Não há tratamento elaborado nesta fase — só deixar o erro estourar.
- **`fetch` não disponível**: Node 18+ é obrigatório. Confirmar versão.
- **Parser `.env` com casos extremos**: focar nos casos testados; não tentar suportar escape de aspas ou multiline — fora do escopo v1.
- **Headers do OpenRouter**: `HTTP-Referer` e `X-Title` são opcionais mas ajudam a evitar 4xx. Usar valores placeholder.

## Dependências para a próxima fase

- `parseEnvFile` funcionando e testado
- `cli.js` fazendo chamada HTTP básica com `fetch`
- Vitest configurado e rodando
