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
  it("formata tool com args v\u00e1lidos", () => {
    const out = formatDecision({ iteracao: 1, tool: "read_file", args: { path: "a.txt" }, error: null });
    expect(out).toBe('[iter 1] \u2192 read_file {"path":"a.txt"}');
  });

  it("mostra erro de args inv\u00e1lidos", () => {
    const out = formatDecision({ iteracao: 2, tool: "read_file", args: {}, error: "json quebrado" });
    expect(out).toMatch(/args inv\u00e1lidos/);
    expect(out).toMatch(/json quebrado/);
  });

  it("inclui n\u00famero da itera\u00e7\u00e3o", () => {
    const out = formatDecision({ iteracao: 42, tool: "x", args: {}, error: null });
    expect(out).toMatch(/\[iter 42\]/);
  });
});

describe("formatToolResult", () => {
  it("formata resultado curto", () => {
    const out = formatToolResult({ iteracao: 1, tool: "read_file", resultado: "oi", duration_ms: 5 });
    expect(out).toMatch(/\u2190 read_file/);
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
  it("envolve conte\u00fado com separadores", () => {
    const out = formatFinal("pronto");
    expect(out).toMatch(/resposta final/);
    expect(out).toMatch(/pronto/);
  });
});

describe("formatLoopEnd", () => {
  it("motivo concluido", () => {
    expect(formatLoopEnd({ motivo: "concluido", iteracoes: 3 })).toMatch(/conclu\u00eddo em 3/);
  });
  it("motivo limite_atingido tem AVISO", () => {
    expect(formatLoopEnd({ motivo: "limite_atingido", iteracoes: 20 })).toMatch(/AVISO/);
  });
  it("outro motivo \u00e9 exibido literalmente", () => {
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
    expect(calls[0]).toMatch(/\u2192 x/);
    expect(calls[1]).toMatch(/fim/);
    expect(calls[2]).toMatch(/conclu\u00eddo/);
  });

  it("ignora eventos request/response (v\u00e3o pro logger, n\u00e3o pro console)", () => {
    const calls = [];
    const handler = createConsoleEventHandler({ log: (s) => calls.push(s) });
    handler("request", { iteracao: 1 });
    handler("response", {});
    expect(calls).toHaveLength(0);
  });
});
