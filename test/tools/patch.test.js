import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execute, shouldConfirm } from "../../src/tools/patch.js";

let tmpDir;
beforeEach(() => { tmpDir = mkdtempSync(join(tmpdir(), "agent-")); });
afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

function write(p, content) {
  writeFileSync(p, content, "utf8");
}

describe("patch.execute", () => {
  it("adiciona linhas", () => {
    const p = join(tmpDir, "f.txt");
    write(p, "linha1\nlinha2\nlinha3\n");
    const hunks = "@@ -1,3 +1,4 @@\n linha1\n+linha extra\n linha2\n linha3\n";
    const res = execute({ filePath: p, hunks });
    expect(res).toMatch(/OK/);
    expect(readFileSync(p, "utf8")).toBe("linha1\nlinha extra\nlinha2\nlinha3\n");
  });

  it("remove linhas", () => {
    const p = join(tmpDir, "f.txt");
    write(p, "a\nb\nc\nd\n");
    const hunks = "@@ -2,2 +2,1 @@\n-b\n c\n";
    const res = execute({ filePath: p, hunks });
    expect(res).toMatch(/OK/);
    expect(readFileSync(p, "utf8")).toBe("a\nc\nd\n");
  });

  it("substitui linha", () => {
    const p = join(tmpDir, "f.txt");
    write(p, "const x = 1;\nconst y = 2;\n");
    const hunks = "@@ -1,2 +1,2 @@\n-const x = 1;\n+const x = 99;\n const y = 2;\n";
    const res = execute({ filePath: p, hunks });
    expect(res).toMatch(/OK/);
    expect(readFileSync(p, "utf8")).toBe("const x = 99;\nconst y = 2;\n");
  });

  it("aplica múltiplos hunks", () => {
    const p = join(tmpDir, "f.txt");
    write(p, "a\nb\nc\nd\ne\nf\n");
    const hunks = [
      "@@ -1,3 +1,2 @@",
      " a",
      "-b",
      " c",
      "@@ -4,3 +4,4 @@",
      " d",
      "+extra",
      " e",
      " f",
    ].join("\n");
    const res = execute({ filePath: p, hunks });
    expect(res).toMatch(/OK/);
    expect(res).toMatch(/2 hunks/);
    expect(readFileSync(p, "utf8")).toBe("a\nc\nd\nextra\ne\nf\n");
  });

  it("retorna erro se contexto não bate", () => {
    const p = join(tmpDir, "f.txt");
    write(p, "a\nb\nc\n");
    const hunks = "@@ -1,3 +1,3 @@\n a\n x\n c\n";
    const res = execute({ filePath: p, hunks });
    expect(res).toMatch(/ERRO/);
    expect(res).toMatch(/hunk/);
  });

  it("retorna erro se arquivo não existe", () => {
    const p = join(tmpDir, "inexistente.txt");
    const hunks = "@@ -1,1 +1,1 @@\n a\n";
    const res = execute({ filePath: p, hunks });
    expect(res).toMatch(/não encontrado|ERRO/);
  });

  it("retorna erro se hunks vazio", () => {
    const p = join(tmpDir, "f.txt");
    write(p, "a\n");
    const res = execute({ filePath: p, hunks: "" });
    expect(res).toMatch(/vazio|hunk válido/);
  });

  it("retorna erro se nenhum hunk válido", () => {
    const p = join(tmpDir, "f.txt");
    write(p, "a\n");
    const res = execute({ filePath: p, hunks: "apenas um comentário" });
    expect(res).toMatch(/nenhum hunk/);
  });

  it("aceita cabeçalhos --- e +++ no diff", () => {
    const p = join(tmpDir, "f.txt");
    write(p, "original\n");
    const hunks = [
      "--- a/f.txt",
      "+++ b/f.txt",
      "@@ -1,1 +1,1 @@",
      "-original",
      "+modificado",
    ].join("\n");
    const res = execute({ filePath: p, hunks });
    expect(res).toMatch(/OK/);
    expect(readFileSync(p, "utf8")).toBe("modificado\n");
  });

  it("erro se filePath não fornecido", () => {
    expect(execute({ hunks: "@@ -1,1 +1,1 @@\n a\n" })).toMatch(/'filePath'/);
  });

  it("erro se hunks não fornecido", () => {
    expect(execute({ filePath: "f.txt" })).toMatch(/'hunks'/);
  });

  it("lida com fuzzy matching (offset de ±2 linhas)", () => {
    const p = join(tmpDir, "f.txt");
    write(p, "a\nb\nc\nd\ne\n");
    const hunks = "@@ -3,2 +3,2 @@\n c\n d\n";
    const res = execute({ filePath: p, hunks });
    expect(res).toMatch(/OK/);
  });
});

describe("patch.shouldConfirm", () => {
  it("path dentro do cwd nao requer confirmacao", () => {
    expect(shouldConfirm({ filePath: "package.json" })).toBe(false);
  });

  it("path fora requer confirmacao", () => {
    expect(shouldConfirm({ filePath: "/etc/hosts" })).toBe(true);
  });

  it("path ausente requer confirmacao", () => {
    expect(shouldConfirm({})).toBe(true);
  });
});
