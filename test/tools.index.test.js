import { describe, it, expect } from "vitest";
import { toolRegistry, getToolSchema, executeTool, isSensitive, shouldConfirm, summarizeTool } from "../src/tools/index.js";

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

describe("shouldConfirm", () => {
  it("read_file nunca exige confirmação", () => {
    expect(shouldConfirm("read_file", { path: "/etc/shadow" })).toBe(false);
  });

  it("write_file exige confirmação para path fora do cwd", () => {
    expect(shouldConfirm("write_file", { path: "/tmp/foo", content: "x" })).toBe(true);
  });

  it("write_file nao exige confirmacao para path dentro do cwd", () => {
    expect(shouldConfirm("write_file", { path: "package.json", content: "x" })).toBe(false);
  });

  it("run_bash com comando permitido não exige confirmação", () => {
    expect(shouldConfirm("run_bash", { command: "ls -la" })).toBe(false);
    expect(shouldConfirm("run_bash", { command: "git status" })).toBe(false);
    expect(shouldConfirm("run_bash", { command: "echo hello" })).toBe(false);
  });

  it("run_bash com comando perigoso exige confirmação", () => {
    expect(shouldConfirm("run_bash", { command: "rm file" })).toBe(true);
    expect(shouldConfirm("run_bash", { command: "git push" })).toBe(true);
    expect(shouldConfirm("run_bash", { command: "ls; rm file" })).toBe(true);
  });

  it("tool inexistente nunca exige confirmação", () => {
    expect(shouldConfirm("inexistente", {})).toBe(false);
  });
});

describe("summarizeTool", () => {
  it("read_file retorna path", () => {
    expect(summarizeTool("read_file", { path: "a.txt" })).toBe("a.txt");
  });

  it("write_file retorna path", () => {
    expect(summarizeTool("write_file", { path: "b.js", content: "..." })).toBe("b.js");
  });

  it("run_bash retorna command", () => {
    expect(summarizeTool("run_bash", { command: "ls -la" })).toBe("ls -la");
  });

  it("run_bash trunca command longo", () => {
    const long = "x".repeat(100);
    const out = summarizeTool("run_bash", { command: long });
    expect(out).toHaveLength(81);
    expect(out).toMatch(/\u2026$/);
  });

  it("tool desconhecida usa fallback JSON.stringify", () => {
    expect(summarizeTool("unknown", { a: 1 })).toBe('{"a":1}');
  });

  it("tool desconhecida com string curta usa fallback string", () => {
    expect(summarizeTool("unknown", { path: "foo.txt", content: "bar" })).toBe("foo.txt");
  });
});
