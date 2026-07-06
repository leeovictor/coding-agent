import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, existsSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execute } from "../../src/tools/writeFile.js";

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
