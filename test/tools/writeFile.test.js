import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, existsSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execute, shouldConfirm } from "../../src/tools/writeFile.js";

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

describe("writeFile.shouldConfirm", () => {
  it("path dentro do cwd nao requer confirmacao", () => {
    expect(shouldConfirm({ path: "package.json" })).toBe(false);
  });

  it("path com .. fora do cwd requer confirmacao", () => {
    expect(shouldConfirm({ path: "../etc/passwd" })).toBe(true);
  });

  it("path absoluto fora do cwd requer confirmacao", () => {
    expect(shouldConfirm({ path: "/tmp/foo.txt" })).toBe(true);
  });

  it("path ausente requer confirmacao (fallback seguro)", () => {
    expect(shouldConfirm({})).toBe(true);
    expect(shouldConfirm({ path: null })).toBe(true);
    expect(shouldConfirm({ path: "" })).toBe(true);
  });
});
