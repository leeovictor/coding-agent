import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execute, shouldConfirm } from "../../src/tools/edit.js";

let tmpDir;
beforeEach(() => { tmpDir = mkdtempSync(join(tmpdir(), "agent-")); });
afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

function write(p, content) {
  writeFileSync(p, content, "utf8");
}

describe("edit.execute", () => {
  it("substitui primeira ocorrência", () => {
    const p = join(tmpDir, "f.txt");
    write(p, "abc def ghi");
    const res = execute({ filePath: p, oldString: "abc", newString: "xyz" });
    expect(res).toMatch(/OK/);
    expect(res).toMatch(/1 substituição/);
    expect(readFileSync(p, "utf8")).toBe("xyz def ghi");
  });

  it("replaceAll substitui todas as ocorrências", () => {
    const p = join(tmpDir, "f.txt");
    write(p, "abc abc abc");
    execute({ filePath: p, oldString: "abc", newString: "x", replaceAll: true });
    expect(readFileSync(p, "utf8")).toBe("x x x");
  });

  it("erro se oldString não encontrado", () => {
    const p = join(tmpDir, "f.txt");
    write(p, "hello world");
    const res = execute({ filePath: p, oldString: "naoexiste", newString: "x" });
    expect(res).toMatch(/não encontrado/);
  });

  it("erro se múltiplas ocorrências sem replaceAll", () => {
    const p = join(tmpDir, "f.txt");
    write(p, "dup dup dup");
    const res = execute({ filePath: p, oldString: "dup", newString: "x" });
    expect(res).toMatch(/encontrado 3 vezes/);
    expect(res).toMatch(/replaceAll/);
  });

  it("arquivo permanece inalterado se oldString não encontrado", () => {
    const p = join(tmpDir, "f.txt");
    write(p, "original");
    execute({ filePath: p, oldString: "naoexiste", newString: "x" });
    expect(readFileSync(p, "utf8")).toBe("original");
  });

  it("erro se arquivo não existe", () => {
    const p = join(tmpDir, "inexistente.txt");
    const res = execute({ filePath: p, oldString: "a", newString: "b" });
    expect(res).toMatch(/não encontrado|ERRO/);
  });

  it("erro se oldString vazio", () => {
    const p = join(tmpDir, "f.txt");
    write(p, "conteudo");
    const res = execute({ filePath: p, oldString: "", newString: "x" });
    expect(res).toMatch(/vazio/);
  });

  it("erro se filePath não fornecido", () => {
    expect(execute({ oldString: "a", newString: "b" })).toMatch(/'filePath'/);
  });

  it("erro se oldString não fornecido", () => {
    expect(execute({ filePath: "f.txt", newString: "b" })).toMatch(/'oldString'/);
  });

  it("erro se newString não fornecido", () => {
    expect(execute({ filePath: "f.txt", oldString: "a" })).toMatch(/'newString'/);
  });

  it("lida com quebras de linha no oldString", () => {
    const p = join(tmpDir, "f.txt");
    write(p, "linha1\nlinha2\nlinha3\n");
    execute({ filePath: p, oldString: "linha2\n", newString: "novalinha\n" });
    expect(readFileSync(p, "utf8")).toBe("linha1\nnovalinha\nlinha3\n");
  });

  it("lida com caracteres especiais e indentação", () => {
    const p = join(tmpDir, "f.txt");
    write(p, "  const x = `template ${var}`;\n");
    execute({ filePath: p, oldString: "  const x = `template ${var}`;", newString: "  const y = 42;" });
    expect(readFileSync(p, "utf8")).toBe("  const y = 42;\n");
  });
});

describe("edit.shouldConfirm", () => {
  it("path dentro do cwd nao requer confirmacao", () => {
    expect(shouldConfirm({ filePath: "package.json" })).toBe(false);
  });

  it("path com .. fora do cwd requer confirmacao", () => {
    expect(shouldConfirm({ filePath: "../etc/passwd" })).toBe(true);
  });

  it("path absoluto fora do cwd requer confirmacao", () => {
    expect(shouldConfirm({ filePath: "/tmp/foo.txt" })).toBe(true);
  });

  it("path ausente requer confirmacao (fallback seguro)", () => {
    expect(shouldConfirm({})).toBe(true);
    expect(shouldConfirm({ filePath: null })).toBe(true);
    expect(shouldConfirm({ filePath: "" })).toBe(true);
  });
});
