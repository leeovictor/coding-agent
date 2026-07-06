# Fase M4 — Logs Legíveis no Console

## Objetivo

Tornar o agente **observável em tempo real** no terminal. Cada decisão do modelo (qual tool chamou, com quais args, qual resultado) deve aparecer de forma legível para o usuário, sem ser uma caixa-preta.

Esta fase pluga um formatador no callback `onEvent` do `runAgent` (definido em M3).

## Princípios

- Funções de formatação são **puras**: recebem dados, retornam string. Testáveis isoladamente.
- Não acoplam a `console.log` diretamente — retornam a string; o `cli.js` decide imprimir.
- Visual compacto: uma linha por decisão, com prefixos consistentes.
- Resultados de tool são truncados para não inundar o terminal (~500 chars).
- Erros aparecem em destaque (prefixo `✗` ou `ERRO`).

## Arquivos a criar nesta fase

### `src/format.js`

```js
const PREVIEW_LEN = 500;

function preview(s, len = PREVIEW_LEN) {
  const str = String(s ?? "");
  if (str.length <= len) return str;
  return str.slice(0, len) + `… [+${str.length - len} chars]`;
}

/**
 * Formata a decisão de chamar uma tool.
 * @param {{iteracao: number, tool: string, args: object, error?: string|null}} data
 * @returns {string}
 */
export function formatDecision({ iteracao, tool, args, error }) {
  const argsStr = error
    ? `(args inválidos: ${error})`
    : JSON.stringify(args);
  return `[iter ${iteracao}] → ${tool} ${argsStr}`;
}

/**
 * Formata o resultado de uma tool.
 * @param {{iteracao: number, tool: string, resultado: string, duration_ms: number, error?: boolean}} data
 * @returns {string}
 */
export function formatToolResult({ iteracao, tool, resultado, duration_ms }) {
  return `[iter ${iteracao}] ← ${tool} (${duration_ms}ms): ${preview(resultado)}`;
}

/**
 * Formata a confirmação pedida (ou respondida).
 * @param {{iteracao: number, tool: string, args: object, decisao?: boolean}} data
 * @returns {string}
 */
export function formatConfirmation({ iteracao, tool, args }) {
  return `[iter ${iteracao}] ? confirmar ${tool} ${JSON.stringify(args)} (y/n):`;
}

/**
 * Formata o conteúdo final do agente.
 * @param {string} content
 * @returns {string}
 */
export function formatFinal(content) {
  return `\n─── resposta final ───\n${content}\n─────────────────────`;
}

/**
 * Formata o encerramento do loop.
 * @param {{motivo: string, iteracoes: number}} data
 * @returns {string}
 */
export function formatLoopEnd({ motivo, iteracoes }) {
  if (motivo === "concluido") return `\n[loop encerrado: concluído em ${iteracoes} iteração(ões)]`;
  if (motivo === "limite_atingido") return `\n[AVISO: loop encerrado por limite de iterações (${iteracoes})]`;
  return `\n[loop encerrado: ${motivo}]`;
}

/**
 * Cria um handler `onEvent` que imprime no console.
 * @param {{log?: function}} [deps]
 * @returns {(event: string, data: object) => void}
 */
export function createConsoleEventHandler({ log = console.log } = {}) {
  return (event, data) => {
    switch (event) {
      case "tool_decision":
        log(formatDecision(data));
        break;
      case "tool_execution":
        log(formatToolResult(data));
        break;
      case "tool_confirmation":
        log(formatConfirmation(data));
        break;
      case "final_content":
        log(formatFinal(data.content));
        break;
      case "loop_end":
        log(formatLoopEnd(data));
        break;
      // request, response, etc. não vão pro console (vão pro logger em M5)
    }
  };
}
```

## Testes unitários — `test/format.test.js`

```js
import { describe, it, expect } from "vitest";
import {
  formatDecision,
  formatToolResult,
  formatConfirmation,
  formatFinal,
  formatLoopEnd,
  createConsoleEventHandler,
} from "../src/format.js";

describe("formatDecision", () => {
  it("formata tool com args válidos", () => {
    const out = formatDecision({ iteracao: 1, tool: "read_file", args: { path: "a.txt" }, error: null });
    expect(out).toBe('[iter 1] → read_file {"path":"a.txt"}');
  });

  it("mostra erro de args inválidos", () => {
    const out = formatDecision({ iteracao: 2, tool: "read_file", args: {}, error: "json quebrado" });
    expect(out).toMatch(/args inválidos/);
    expect(out).toMatch(/json quebrado/);
  });

  it("inclui número da iteração", () => {
    const out = formatDecision({ iteracao: 42, tool: "x", args: {}, error: null });
    expect(out).toMatch(/\[iter 42\]/);
  });
});

describe("formatToolResult", () => {
  it("formata resultado curto", () => {
    const out = formatToolResult({ iteracao: 1, tool: "read_file", resultado: "oi", duration_ms: 5 });
    expect(out).toMatch(/← read_file/);
    expect(out).toMatch(/\(5ms\)/);
    expect(out).toMatch(/oi$/);
  });

  it("trunca resultado longo", () => {
    const longo = "x".repeat(1000);
    const out = formatToolResult({ iteracao: 1, tool: "x", resultado: longo, duration_ms: 1 });
    expect(out).toMatch(/\+/);
    expect(out).toMatch(/chars\]/);
    expect(out.length).toBeLessThan(longo.length);
  });
});

describe("formatConfirmation", () => {
  it("inclui tool e args", () => {
    const out = formatConfirmation({ iteracao: 1, tool: "write_file", args: { path: "a" } });
    expect(out).toMatch(/confirmar write_file/);
    expect(out).toMatch(/y\/n/);
    expect(out).toMatch(/"path":"a"/);
  });
});

describe("formatFinal", () => {
  it("envolve conteúdo com separadores", () => {
    const out = formatFinal("pronto");
    expect(out).toMatch(/resposta final/);
    expect(out).toMatch(/pronto/);
  });
});

describe("formatLoopEnd", () => {
  it("motivo concluido", () => {
    expect(formatLoopEnd({ motivo: "concluido", iteracoes: 3 })).toMatch(/concluído em 3/);
  });
  it("motivo limite_atingido tem AVISO", () => {
    expect(formatLoopEnd({ motivo: "limite_atingido", iteracoes: 20 })).toMatch(/AVISO/);
  });
  it("outro motivo é exibido literalmente", () => {
    expect(formatLoopEnd({ motivo: "resposta_invalida", iteracoes: 1 })).toMatch(/resposta_invalida/);
  });
});

describe("createConsoleEventHandler", () => {
  it("chama log com a string formatada para cada evento", () => {
    const calls = [];
    const handler = createConsoleEventHandler({ log: (s) => calls.push(s) });
    handler("tool_decision", { iteracao: 1, tool: "x", args: {}, error: null });
    handler("final_content", { content: "fim" });
    handler("loop_end", { motivo: "concluido", iteracoes: 1 });
    expect(calls).toHaveLength(3);
    expect(calls[0]).toMatch(/→ x/);
    expect(calls[1]).toMatch(/fim/);
    expect(calls[2]).toMatch(/concluído/);
  });

  it("ignora eventos request/response (vão pro logger, não pro console)", () => {
    const calls = [];
    const handler = createConsoleEventHandler({ log: (s) => calls.push(s) });
    handler("request", { iteracao: 1 });
    handler("response", {});
    expect(calls).toHaveLength(0);
  });
});
```

## Como integrar com o `runAgent`

No `cli.js` (em M7) será algo como:

```js
import { runAgent } from "./agent.js";
import { createConsoleEventHandler } from "./format.js";

const consoleHandler = createConsoleEventHandler();

const result = await runAgent({
  task,
  tools: getToolSchema(),
  callApi: realCallApi,
  executeTool,
  onEvent: (event, data) => {
    consoleHandler(event, data);
    // M5 também plugará logger.logEvent(event, data) aqui
  },
});
```

## Comandos de validação da fase

```bash
npm test src/format.test.js
npm test                    # tudo passa
```

> Ainda não há demo executável real (precisa de `cli.js` integrado — vem em M7).

## Critérios de aceite da fase

- [ ] 5 funções puras de formatação exportadas e testadas
- [ ] `createConsoleEventHandler` retorna handler compatível com `onEvent` do `runAgent`
- [ ] Resultados longos são truncados (~500 chars)
- [ ] Eventos `request` e `response` não vão pro console (serão tratados pelo logger em M5)
- [ ] Erros e avisos têm destaque visual
- [ ] Funções são puras (sem I/O, sem estado)

## Riscos e armadilhas

- **Prefixos com caracteres unicode** (`→`, `←`): funcionam na maioria dos terminais modernos, mas se houver problema, fallback para `->` `<=`.
- **`console.log` em testes**: nunca chamar `console.log` real nos testes — sempre injetar um mock (`log: (s) => calls.push(s)`).
- **Strings multilinha em resultados de tool**: `read_file` pode retornar conteúdo com `\n`. O `preview` não quebra a linha, só trunca. Aceitável para v1.

## Dependências para a próxima fase

- `createConsoleEventHandler` pronto para ser plugado no `onEvent` do `runAgent`
- Funções de formatação reutilizáveis em outros contextos (ex: debug, web UI futura)
