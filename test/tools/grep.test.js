import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { execute, summarize } from "../../src/tools/grep.js";

let tmpDir;
let cleanupDirs = [];

beforeEach(() => {
  tmpDir = mkdtempSync(join(process.cwd(), ".test-grep-"));
  cleanupDirs.push(tmpDir);
});
afterEach(() => {
  for (const d of cleanupDirs) {
    try { rmSync(d, { recursive: true, force: true }); } catch {}
  }
  cleanupDirs = [];
});

describe("grep.execute", () => {
  it("encontra correspondencias basicas", () => {
    writeFileSync(join(tmpDir, "a.txt"), "hello world\nfoo bar\nhello again");
    const out = execute({ pattern: "hello", path: tmpDir });
    expect(out).toContain("a.txt:1: hello world");
    expect(out).toContain("a.txt:3: hello again");
  });

  it("retorna erro se pattern nao fornecido", () => {
    expect(execute({})).toMatch(/'pattern' . obrigat.rio/);
  });

  it("retorna erro para regex invalida", () => {
    const bad = "(?<invalid";
    expect(execute({ pattern: bad })).toMatch(/ERRO/);
  });

  it("retorna erro para caminho fora do cwd", () => {
    const out = execute({ pattern: "x", path: "/tmp" });
    expect(out).toMatch(/fora do/);
  });

  it("retorna mensagem quando nao encontra correspondencias", () => {
    writeFileSync(join(tmpDir, "a.txt"), "nada aqui");
    expect(execute({ pattern: "inexistente", path: tmpDir })).toMatch(/Nenhuma/);
  });

  it("filtra por include glob", () => {
    writeFileSync(join(tmpDir, "a.js"), "console.log(1)");
    writeFileSync(join(tmpDir, "b.txt"), "console.log(2)");
    const out = execute({ pattern: "console", path: tmpDir, include: "*.js" });
    expect(out).toContain("a.js");
    expect(out).not.toContain("b.txt");
  });

  it("respeita maxResults", () => {
    writeFileSync(join(tmpDir, "a.txt"), "a\na\na\na\na");
    const out = execute({ pattern: "a", path: tmpDir, maxResults: 2 });
    const lines = out.split("\n").filter(function (l) { return l.match(/:\d+: /); });
    expect(lines.length).toBeLessThanOrEqual(2);
    expect(out).toMatch(/truncado/);
  });

  it("ignora diretorios node_modules", () => {
    mkdirSync(join(tmpDir, "node_modules"), { recursive: true });
    writeFileSync(join(tmpDir, "node_modules/ignored.js"), "console.log(1)");
    writeFileSync(join(tmpDir, "include.js"), "console.log(2)");
    const out = execute({ pattern: "console", path: tmpDir });
    expect(out).toContain("include.js");
    expect(out).not.toContain("node_modules");
  });

  it("busca em subdiretorios", () => {
    mkdirSync(join(tmpDir, "sub"), { recursive: true });
    writeFileSync(join(tmpDir, "sub/a.txt"), "hello");
    const out = execute({ pattern: "hello", path: tmpDir });
    expect(out).toContain("sub/a.txt:1: hello");
  });

  it("funciona com path relativo ao cwd", () => {
    writeFileSync(join(tmpDir, "x.txt"), "teste");
    var relName = tmpDir.split("/").pop();
    const out = execute({ pattern: "teste", path: relName });
    expect(out).toContain("x.txt:1: teste");
  });

  it("sumarize retorna o pattern", () => {
    expect(summarize({ pattern: "foo" })).toBe("foo");
  });
});
