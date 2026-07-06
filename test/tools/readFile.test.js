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
