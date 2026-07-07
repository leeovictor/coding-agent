import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execute, summarize } from "../../src/tools/glob.js";

let tmpDir;
let cleanupDirs = [];

beforeEach(() => {
  tmpDir = mkdtempSync(join(process.cwd(), ".test-glob-"));
  cleanupDirs.push(tmpDir);
});
afterEach(() => {
  for (const d of cleanupDirs) {
    try { rmSync(d, { recursive: true, force: true }); } catch {}
  }
  cleanupDirs = [];
});

describe("glob.execute", () => {
  it("encontra arquivos com **/*.js", () => {
    writeFileSync(join(tmpDir, "a.js"), "");
    mkdirSync(join(tmpDir, "sub"), { recursive: true });
    writeFileSync(join(tmpDir, "sub/b.js"), "");
    const out = execute({ pattern: "**/*.js", path: tmpDir });
    expect(out).toContain("a.js");
    expect(out).toContain("sub/b.js");
  });

  it("filtra por diretório com src/**/*.ts", () => {
    mkdirSync(join(tmpDir, "src", "a"), { recursive: true });
    writeFileSync(join(tmpDir, "src/a.ts"), "");
    writeFileSync(join(tmpDir, "src/a/b.ts"), "");
    writeFileSync(join(tmpDir, "root.ts"), "");
    const out = execute({ pattern: "src/**/*.ts", path: tmpDir });
    expect(out).toContain("src/a.ts");
    expect(out).toContain("src/a/b.ts");
    expect(out).not.toContain("root.ts");
  });

  it("retorna erro se pattern não fornecido", () => {
    expect(execute({})).toMatch(/'pattern' é obrigatório/);
  });

  it("retorna erro para caminho fora do cwd", () => {
    expect(execute({ pattern: "*", path: "/tmp" })).toMatch(/fora do diretório de trabalho/);
  });

  it("retorna mensagem quando não encontra arquivos", () => {
    expect(execute({ pattern: "*.zzz", path: tmpDir })).toMatch(/Nenhum arquivo/);
  });

  it("ordena por data de modificação (mais recente primeiro)", () => {
    const old = join(tmpDir, "old.txt");
    const recent = join(tmpDir, "recent.txt");
    writeFileSync(old, "");
    writeFileSync(recent, "");
    const now = new Date();
    const past = new Date(now.getTime() - 60000);
    utimesSync(recent, now, now);
    utimesSync(old, past, past);
    const out = execute({ pattern: "*.txt", path: tmpDir });
    const lines = out.split("\n").filter((l) => l.endsWith(".txt"));
    expect(lines[0]).toBe("recent.txt");
    expect(lines[1]).toBe("old.txt");
  });

  it("respeita maxResults", () => {
    for (let i = 0; i < 5; i++) writeFileSync(join(tmpDir, `f${i}.js`), "");
    const out = execute({ pattern: "*.js", path: tmpDir, maxResults: 2 });
    const lines = out.split("\n").filter((l) => l.endsWith(".js"));
    expect(lines.length).toBeLessThanOrEqual(2);
    expect(out).toMatch(/truncado/);
  });

  it("ignora diretórios node_modules", () => {
    mkdirSync(join(tmpDir, "node_modules"), { recursive: true });
    writeFileSync(join(tmpDir, "node_modules/lib.js"), "");
    writeFileSync(join(tmpDir, "app.js"), "");
    const out = execute({ pattern: "**/*.js", path: tmpDir });
    expect(out).toContain("app.js");
    expect(out).not.toContain("node_modules");
  });

  it("funciona com path relativo ao cwd", () => {
    writeFileSync(join(tmpDir, "y.js"), "");
    const relName = tmpDir.split("/").pop();
    const out = execute({ pattern: "*.js", path: relName });
    expect(out).toContain("y.js");
  });

  it("sumarize retorna o pattern", () => {
    expect(summarize({ pattern: "**/*.js" })).toBe("**/*.js");
  });
});
