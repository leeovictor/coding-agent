import { describe, it, expect } from "vitest";
import {
  extractToolCalls,
  extractContent,
  parseToolArgs,
  buildToolResultMessage,
} from "../src/parseResponse.js";

describe("extractToolCalls", () => {
  it("retorna array vazio quando message n\u00e3o tem tool_calls", () => {
    expect(extractToolCalls({ content: "oi" })).toEqual([]);
  });

  it("retorna array vazio quando tool_calls \u00e9 null", () => {
    expect(extractToolCalls({ content: "oi", tool_calls: null })).toEqual([]);
  });

  it("retorna array vazio quando tool_calls \u00e9 array vazio", () => {
    expect(extractToolCalls({ tool_calls: [] })).toEqual([]);
  });

  it("extrai 1 tool_call normalizando formato", () => {
    const msg = {
      tool_calls: [
        { id: "call_1", function: { name: "read_file", arguments: '{"path":"a.txt"}' } },
      ],
    };
    expect(extractToolCalls(msg)).toEqual([
      { id: "call_1", name: "read_file", arguments: '{"path":"a.txt"}' },
    ]);
  });

  it("extrai m\u00faltiplos tool_calls na ordem", () => {
    const msg = {
      tool_calls: [
        { id: "a", function: { name: "read_file", arguments: "{}" } },
        { id: "b", function: { name: "write_file", arguments: "{}" } },
        { id: "c", function: { name: "run_bash", arguments: "{}" } },
      ],
    };
    const out = extractToolCalls(msg);
    expect(out).toHaveLength(3);
    expect(out.map((t) => t.id)).toEqual(["a", "b", "c"]);
  });

  it("lida com function ausente", () => {
    const msg = { tool_calls: [{ id: "x" }] };
    expect(extractToolCalls(msg)).toEqual([{ id: "x", name: "", arguments: "" }]);
  });

  it("lida com message null/undefined", () => {
    expect(extractToolCalls(null)).toEqual([]);
    expect(extractToolCalls(undefined)).toEqual([]);
  });
});

describe("extractContent", () => {
  it("retorna string quando content \u00e9 string", () => {
    expect(extractContent({ content: "ol\u00e1" })).toBe("ol\u00e1");
  });

  it("retorna null quando content \u00e9 null", () => {
    expect(extractContent({ content: null })).toBeNull();
  });

  it("retorna null quando content \u00e9 undefined", () => {
    expect(extractContent({})).toBeNull();
  });

  it("retorna null quando content \u00e9 string vazia", () => {
    expect(extractContent({ content: "" })).toBeNull();
  });

  it("retorna null quando message \u00e9 null", () => {
    expect(extractContent(null)).toBeNull();
  });
});

describe("parseToolArgs", () => {
  it("faz parse de JSON v\u00e1lido", () => {
    expect(parseToolArgs('{"path":"a.txt"}')).toEqual({
      args: { path: "a.txt" },
      error: null,
    });
  });

  it("retorna args vazio e error null para string vazia", () => {
    expect(parseToolArgs("")).toEqual({ args: {}, error: null });
  });

  it("n\u00e3o lan\u00e7a para JSON inv\u00e1lido", () => {
    const { args, error } = parseToolArgs("{invalid json");
    expect(args).toEqual({});
    expect(error).toMatch(/argumentos inv\u00e1lidos/);
  });

  it("rejeita array JSON", () => {
    const { args, error } = parseToolArgs("[1,2,3]");
    expect(args).toEqual({});
    expect(error).toMatch(/n\u00e3o s\u00e3o um objeto/);
  });

  it("rejeita string JSON pura", () => {
    const { args, error } = parseToolArgs('"hello"');
    expect(args).toEqual({});
    expect(error).toMatch(/n\u00e3o s\u00e3o um objeto/);
  });

  it("rejeita null JSON", () => {
    const { args, error } = parseToolArgs("null");
    expect(args).toEqual({});
    expect(error).toMatch(/n\u00e3o s\u00e3o um objeto/);
  });
});

describe("buildToolResultMessage", () => {
  it("monta mensagem no formato esperado", () => {
    expect(buildToolResultMessage("call_1", "resultado")).toEqual({
      role: "tool",
      tool_call_id: "call_1",
      content: "resultado",
    });
  });

  it("converte content n\u00e3o-string para string", () => {
    const out = buildToolResultMessage("c", { x: 1 });
    expect(out.content).toBe("[object Object]");
  });

  it("aceita content num\u00e9rico", () => {
    const out = buildToolResultMessage("c", 42);
    expect(out.content).toBe("42");
  });
});
