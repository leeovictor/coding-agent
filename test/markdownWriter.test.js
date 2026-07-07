import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderInline, createMarkdownWriter } from "../src/markdownWriter.js";

describe("renderInline", () => {
  it("passa texto simples sem alteracao", () => {
    expect(renderInline("hello world")).toBe("hello world");
  });

  it("bold **texto** fica verde", () => {
    const out = renderInline("a **b** c");
    expect(out).toContain("\x1b[32m");
    expect(out).toContain("\x1b[0m");
    expect(out).toContain("b");
    expect(out).toMatch(/^a /);
    expect(out).toMatch(/ c$/);
  });

  it("italic *texto* fica verde", () => {
    const out = renderInline("a *b* c");
    expect(out).toContain("\x1b[32m");
    expect(out).toContain("b");
  });

  it("codigo inline com backtick fica verde", () => {
    const out = renderInline("a `b` c");
    expect(out).toContain("\x1b[32m");
    expect(out).toContain("b");
  });

  it("strikethrough ~~texto~~ fica verde", () => {
    const out = renderInline("a ~~b~~ c");
    expect(out).toContain("\x1b[32m");
    expect(out).toContain("b");
  });

  it("link [texto](url) usa verde no texto e cinza na url", () => {
    const out = renderInline("veja [aqui](http://ex.com)");
    expect(out).toContain("\x1b[32m");
    expect(out).toContain("aqui");
    expect(out).toContain("\x1b[90m");
    expect(out).toContain("http://ex.com");
  });

  it("bold com italic dentro", () => {
    const out = renderInline("**a *b* c**");
    expect(out).toContain("\x1b[32m");
    expect(out).toContain("b");
  });

  it("backtick escapa markup interno", () => {
    const out = renderInline("`**nao negrito**`");
    expect(out).toContain("\x1b[32m");
    expect(out).toContain("**nao negrito**");
    expect(out).not.toContain("\x1b[1m"); // nao tem bold
  });

  it("texto vazio", () => {
    expect(renderInline("")).toBe("");
  });

  it("texto sem markup permanece igual", () => {
    const t = "foo bar 123 @#$";
    expect(renderInline(t)).toBe(t);
  });
});

function mkWriter(stdoutOverrides) {
  const writes = [];
  const stdout = { write: vi.fn((s) => writes.push(s)), isTTY: true, ...stdoutOverrides };
  const writer = createMarkdownWriter({ stdout });
  return { writer, writes, stdout };
}

describe("createMarkdownWriter", () => {
  beforeEach(() => {
    delete process.env.NO_COLOR;
  });

  describe("buffer e flush", () => {
    it("push sem \\n acumula buffer", () => {
      const { writer, writes } = mkWriter();
      writer.push("hello");
      expect(writes).toHaveLength(0);
    });

    it("push com \\n emite linha completa", () => {
      const { writer, writes } = mkWriter();
      writer.push("hello\n");
      expect(writes.length).toBeGreaterThanOrEqual(1);
      const out = writes.join("");
      expect(out).toContain("hello");
      expect(out).toContain("\n");
    });

    it("flush emite buffer pendente", () => {
      const { writer, writes } = mkWriter();
      writer.push("pending");
      expect(writes).toHaveLength(0);
      writer.flush();
      expect(writes.join("")).toContain("pending");
    });

    it("reset limpa buffer pendente", () => {
      const { writer, writes } = mkWriter();
      writer.push("pendente");
      const antes = writes.length;
      writer.reset();
      writer.flush();
      expect(writes).toHaveLength(antes);
    });

    it("reset limpa estado de code fence", () => {
      const { writer, writes } = mkWriter();
      writer.push("```\n");
      writer.reset();
      writer.push("normal\n");
      expect(writes.join("")).not.toContain("\u2502 normal");
    });

    it("push multiplas linhas de uma vez", () => {
      const { writer, writes } = mkWriter();
      writer.push("a\nb\nc\n");
      expect(writes).toHaveLength(3);
      expect(writes.join("")).toContain("a");
      expect(writes.join("")).toContain("b");
      expect(writes.join("")).toContain("c");
    });
  });

  describe("suporte a cor", () => {
    it("sem TTY nao emite codigos ANSI", () => {
      const { writer, writes } = mkWriter({ isTTY: false });
      writer.push("# titulo\n");
      const out = writes.join("");
      expect(out).toContain("# titulo");
      expect(out).not.toContain("\x1b[");
    });

    it("NO_COLOR desativa codigos ANSI", () => {
      process.env.NO_COLOR = "1";
      const { writer, writes } = mkWriter();
      writer.push("# titulo\n");
      const out = writes.join("");
      expect(out).toContain("# titulo");
      expect(out).not.toContain("\x1b[");
    });
  });

  describe("headings", () => {
    it("h1 usa ciano negrito", () => {
      const { writer, writes } = mkWriter();
      writer.push("# Titulo\n");
      const out = writes.join("");
      expect(out).toContain("\x1b[1;36m");
      expect(out).toContain("# Titulo");
    });

    it("h2 usa ciano negrito", () => {
      const { writer, writes } = mkWriter();
      writer.push("## Subtitulo\n");
      const out = writes.join("");
      expect(out).toContain("\x1b[1;36m");
    });

    it("h3 usa ciano sem negrito", () => {
      const { writer, writes } = mkWriter();
      writer.push("### Secao\n");
      const out = writes.join("");
      expect(out).toContain("\x1b[36m");
      expect(out).not.toContain("\x1b[1;");
    });
  });

  describe("listas", () => {
    it("lista nao ordenada com -", () => {
      const { writer, writes } = mkWriter();
      writer.push("- item\n");
      const out = writes.join("");
      expect(out).toContain("\x1b[33m");
      expect(out).toContain("\u2022");
      expect(out).toContain("item");
    });

    it("lista nao ordenada com *", () => {
      const { writer, writes } = mkWriter();
      writer.push("* item\n");
      const out = writes.join("");
      expect(out).toContain("\u2022");
    });

    it("lista ordenada", () => {
      const { writer, writes } = mkWriter();
      writer.push("1. primeiro\n");
      const out = writes.join("");
      expect(out).toContain("\x1b[33m");
      expect(out).toContain("1.");
      expect(out).toContain("primeiro");
    });
  });

  describe("blockquote", () => {
    it("citação com >", () => {
      const { writer, writes } = mkWriter();
      writer.push("> citacao\n");
      const out = writes.join("");
      expect(out).toContain("\x1b[90m");
      expect(out).toContain("\u2502");
      expect(out).toContain("citacao");
    });
  });

  describe("code fence", () => {
    it("abre e fecha bloco de codigo", () => {
      const { writer, writes } = mkWriter();
      writer.push("```js\n");
      const out1 = writes.join("");
      expect(out1).toContain("\x1b[90m");
      expect(out1).toContain("```js");
    });

    it("conteudo dentro de code fence recebe prefixo", () => {
      const { writer, writes } = mkWriter();
      writer.push("```\n");
      writer.push("console.log('oi')\n");
      writer.push("```\n");
      const out = writes.join("");
      expect(out).toContain("\u2502 console.log('oi')");
      expect(out).toContain("\x1b[90m");
    });

    it("inline markup dentro de code fence nao e processado", () => {
      const { writer, writes } = mkWriter();
      writer.push("```\n");
      writer.push("**nao negrito**\n");
      writer.push("```\n");
      const out = writes.join("");
      expect(out).toContain("**nao negrito**");
      expect(out).not.toContain("\x1b[1m");
    });
  });

  describe("linha horizontal", () => {
    it("--- renderiza em cinza", () => {
      const { writer, writes } = mkWriter();
      writer.push("---\n");
      const out = writes.join("");
      expect(out).toContain("\x1b[90m");
      expect(out).toContain("---");
    });
  });

  describe("linha em branco", () => {
    it("linha vazia nao adiciona prefixo", () => {
      const { writer, writes } = mkWriter();
      writer.push("a\n\nb\n");
      const out = writes.join("");
      const parts = out.split("\n");
      expect(parts).toHaveLength(4);
      expect(parts[1]).toBe("");
      expect(parts[0]).toContain("a");
      expect(parts[2]).toContain("b");
    });
  });

  describe("combinacoes", () => {
    it("heading com inline bold", () => {
      const { writer, writes } = mkWriter();
      writer.push("# **Importante**\n");
      const out = writes.join("");
      expect(out).toContain("\x1b[1;36m");
      expect(out).toContain("\x1b[32m");
      expect(out).toContain("Importante");
    });

    it("lista com codigo inline", () => {
      const { writer, writes } = mkWriter();
      writer.push("- Use `code` aqui\n");
      const out = writes.join("");
      expect(out).toContain("\u2022");
      expect(out).toContain("\x1b[32m");
      expect(out).toContain("code");
    });
  });
});
