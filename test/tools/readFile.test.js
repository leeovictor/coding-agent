import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execute } from "../../src/tools/readFile.js";

let tmpDir;
beforeEach(() => { tmpDir = mkdtempSync(join(tmpdir(), "agent-")); });
afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

describe("readFile.execute", () => {
  it("lê conteúdo corretamente com tags", () => {
    const p = join(tmpDir, "a.txt");
    writeFileSync(p, "hello world");
    const out = execute({ path: p });
    expect(out).toContain("<path>");
    expect(out).toContain("<type>file</type>");
    expect(out).toContain("<content>");
    expect(out).toContain("1: hello world");
    expect(out).toMatch(/End of file - total 1 lines/);
  });

  it("lê conteúdo com múltiplas linhas", () => {
    const p = join(tmpDir, "multi.txt");
    writeFileSync(p, "linha um\nlinha dois\nlinha tres");
    const out = execute({ path: p });
    expect(out).toContain("1: linha um");
    expect(out).toContain("2: linha dois");
    expect(out).toContain("3: linha tres");
    expect(out).toMatch(/End of file - total 3 lines/);
  });

  it("retorna erro (não lança) para arquivo inexistente", () => {
    const out = execute({ path: join(tmpDir, "nope.txt") });
    expect(out).toMatch(/ERRO/);
  });

  it("retorna erro se path não fornecido", () => {
    expect(execute({})).toMatch(/'path' é obrigatório/);
  });

  it("trunca arquivos grandes quando offset/limit não são usados", () => {
    const p = join(tmpDir, "big.txt");
    const big = "x".repeat(60_000);
    writeFileSync(p, big);
    const out = execute({ path: p });
    expect(out).toMatch(/truncado/);
    expect(out.length).toBeLessThan(60_000 + 500);
  });

  it("não trunca quando offset/limit são usados", () => {
    const p = join(tmpDir, "big2.txt");
    const big = "x".repeat(100).split("").join("\n");
    writeFileSync(p, big);
    const out = execute({ path: p, offset: 1, limit: 5 });
    expect(out).not.toMatch(/truncado/);
    expect(out).toMatch(/Lines 1-5 of 100 total/);
  });

  it("aplica offset corretamente", () => {
    const p = join(tmpDir, "offset.txt");
    writeFileSync(p, "um\ndois\ntres\nquatro\ncinco");
    const out = execute({ path: p, offset: 3 });
    expect(out).toContain("3: tres");
    expect(out).toContain("4: quatro");
    expect(out).toContain("5: cinco");
    expect(out).not.toContain("1: ");
    expect(out).not.toContain("2: ");
    expect(out).toMatch(/Lines 3-5 of 5 total/);
  });

  it("aplica limit corretamente", () => {
    const p = join(tmpDir, "limit.txt");
    writeFileSync(p, "um\ndois\ntres\nquatro\ncinco");
    const out = execute({ path: p, limit: 3 });
    expect(out).toContain("1: um");
    expect(out).toContain("2: dois");
    expect(out).toContain("3: tres");
    expect(out).not.toContain("4: ");
    expect(out).not.toContain("5: ");
    expect(out).toMatch(/Lines 1-3 of 5 total/);
  });

  it("aplica offset + limit juntos", () => {
    const p = join(tmpDir, "both.txt");
    writeFileSync(p, "um\ndois\ntres\nquatro\ncinco");
    const out = execute({ path: p, offset: 2, limit: 2 });
    expect(out).toContain("2: dois");
    expect(out).toContain("3: tres");
    expect(out).not.toContain("1: ");
    expect(out).not.toContain("4: ");
    expect(out).not.toContain("5: ");
    expect(out).toMatch(/Lines 2-3 of 5 total/);
  });

  it("offset além do fim retorna conteúdo vazio", () => {
    const p = join(tmpDir, "short.txt");
    writeFileSync(p, "um\ndois\ntres");
    const out = execute({ path: p, offset: 10 });
    expect(out).toContain("<content>");
    expect(out).toContain("Lines 10-9 of 3 total");
  });

  it("arquivo vazio mostra mensagem apropriada", () => {
    const p = join(tmpDir, "empty.txt");
    writeFileSync(p, "");
    const out = execute({ path: p });
    expect(out).toContain("(File is empty)");
  });

  it("offset 1 é equivalente a não passar offset", () => {
    const p = join(tmpDir, "offset1.txt");
    writeFileSync(p, "um\ndois\ntres");
    const full = execute({ path: p });
    const offset1 = execute({ path: p, offset: 1 });
    expect(offset1).toBe(full);
  });
});
