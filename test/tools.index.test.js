import { describe, it, expect } from "vitest";
import { toolRegistry, getToolSchema, executeTool, isSensitive, shouldConfirm, summarizeTool } from "../src/tools/index.js";

describe("tools registry", () => {
  it("tem exatamente 8 tools", () => {
    expect(Object.keys(toolRegistry).sort()).toEqual(["edit_file", "glob", "grep", "patch_file", "read_file", "run_bash", "todos", "write_file"]);
  });

  it("getToolSchema retorna array no formato OpenAI", () => {
    const schemas = getToolSchema();
    expect(schemas).toHaveLength(8);
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

  it("edit_file tem required: ['filePath','oldString','newString']", () => {
    const s = getToolSchema().find((s) => s.function.name === "edit_file");
    expect(s.function.parameters.required).toEqual(["filePath", "oldString", "newString"]);
  });

  it("patch_file tem required: ['filePath','hunks']", () => {
    const s = getToolSchema().find((s) => s.function.name === "patch_file");
    expect(s.function.parameters.required).toEqual(["filePath", "hunks"]);
  });

  it("grep tem required: ['pattern']", () => {
    const s = getToolSchema().find((s) => s.function.name === "grep");
    expect(s.function.parameters.required).toEqual(["pattern"]);
  });

  it("glob tem required: ['pattern']", () => {
    const s = getToolSchema().find((s) => s.function.name === "glob");
    expect(s.function.parameters.required).toEqual(["pattern"]);
  });

  it("todos tem required: ['todos']", () => {
    const s = getToolSchema().find((s) => s.function.name === "todos");
    expect(s.function.parameters.required).toEqual(["todos"]);
  });

  it("isSensitive: read_file=false, grep=false, glob=false, todos=false, write_file=true, edit_file=true, patch_file=true, run_bash=true", () => {
    expect(isSensitive("read_file")).toBe(false);
    expect(isSensitive("grep")).toBe(false);
    expect(isSensitive("glob")).toBe(false);
    expect(isSensitive("todos")).toBe(false);
    expect(isSensitive("write_file")).toBe(true);
    expect(isSensitive("edit_file")).toBe(true);
    expect(isSensitive("patch_file")).toBe(true);
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

  it("grep nunca exige confirmação", () => {
    expect(shouldConfirm("grep", { pattern: "x", path: "/tmp" })).toBe(false);
  });

  it("glob nunca exige confirmação", () => {
    expect(shouldConfirm("glob", { pattern: "*", path: "/tmp" })).toBe(false);
  });

  it("todos nunca exige confirmação", () => {
    expect(shouldConfirm("todos", { todos: [{ content: "a", status: "pending", priority: "high" }] })).toBe(false);
  });

  it("write_file exige confirmação para path fora do cwd", () => {
    expect(shouldConfirm("write_file", { path: "/tmp/foo", content: "x" })).toBe(true);
  });

  it("write_file nao exige confirmacao para path dentro do cwd", () => {
    expect(shouldConfirm("write_file", { path: "package.json", content: "x" })).toBe(false);
  });

  it("edit_file exige confirmação para path fora do cwd", () => {
    expect(shouldConfirm("edit_file", { filePath: "/tmp/foo", oldString: "a", newString: "b" })).toBe(true);
  });

  it("edit_file nao exige confirmacao para path dentro do cwd", () => {
    expect(shouldConfirm("edit_file", { filePath: "package.json", oldString: "a", newString: "b" })).toBe(false);
  });

  it("patch_file exige confirmação para path fora do cwd", () => {
    expect(shouldConfirm("patch_file", { filePath: "/tmp/foo", hunks: "@@ -1,1 +1,1 @@" })).toBe(true);
  });

  it("patch_file nao exige confirmacao para path dentro do cwd", () => {
    expect(shouldConfirm("patch_file", { filePath: "package.json", hunks: "@@ -1,1 +1,1 @@" })).toBe(false);
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

  it("edit_file retorna filePath", () => {
    expect(summarizeTool("edit_file", { filePath: "c.txt", oldString: "a", newString: "b" })).toBe("c.txt");
  });

  it("patch_file retorna filePath", () => {
    expect(summarizeTool("patch_file", { filePath: "d.js", hunks: "@@ -1,1 +1,1 @@" })).toBe("d.js");
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

  it("grep retorna pattern", () => {
    expect(summarizeTool("grep", { pattern: "foo" })).toBe("foo");
  });

  it("glob retorna pattern", () => {
    expect(summarizeTool("glob", { pattern: "**/*.js" })).toBe("**/*.js");
  });

  it("todos retorna contagem de itens", () => {
    const items = [
      { content: "a", status: "pending", priority: "high" },
      { content: "b", status: "completed", priority: "low" },
    ];
    const out = summarizeTool("todos", { todos: items });
    expect(out).toMatch(/2 itens/);
  });

  it("todos vazio retorna 0 itens", () => {
    expect(summarizeTool("todos", { todos: [] })).toBe("0 itens");
  });

  it("tool desconhecida usa fallback JSON.stringify", () => {
    expect(summarizeTool("unknown", { a: 1 })).toBe('{"a":1}');
  });

  it("tool desconhecida com string curta usa fallback string", () => {
    expect(summarizeTool("unknown", { path: "foo.txt", content: "bar" })).toBe("foo.txt");
  });
});
