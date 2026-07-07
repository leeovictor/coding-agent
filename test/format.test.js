import { EventEmitter } from "node:events";
import { describe, it, expect, vi } from "vitest";
import {
  formatDecision,
  formatToolResult,
  formatConfirmation,
  formatFinal,
  formatLoopEnd,
  formatBashOutput,
  createConsoleEventHandler,
} from "../src/format.js";

describe("formatDecision", () => {
  it("usa summarizeTool para tool conhecida", () => {
    const out = formatDecision({ iteracao: 1, tool: "read_file", args: { path: "a.txt" }, error: null });
    expect(out).toMatch(/a\.txt/);
    expect(out).not.toMatch(/\{"path"/);
  });

  it("mostra erro de args inv\u00e1lidos", () => {
    const out = formatDecision({ iteracao: 2, tool: "read_file", args: {}, error: "json quebrado" });
    expect(out).toMatch(/args inv\u00e1lidos/);
    expect(out).toMatch(/json quebrado/);
  });

  it("inclui n\u00famero da itera\u00e7\u00e3o", () => {
    const out = formatDecision({ iteracao: 42, tool: "x", args: {}, error: null });
    expect(out).toMatch(/\[iter 42\]/);
  });

  it("tool desconhecida usa fallback", () => {
    const out = formatDecision({ iteracao: 1, tool: "unknown_tool", args: { foo: "bar" }, error: null });
    expect(out).toMatch(/bar/);
  });
});

describe("formatToolResult", () => {
  it("formata resultado curto", () => {
    const out = formatToolResult({ iteracao: 1, tool: "run_bash", resultado: "oi", duration_ms: 5 });
    expect(out).toMatch(/\u2190 run_bash/);
    expect(out).toMatch(/\(5ms\)/);
    expect(out).toMatch(/oi$/);
  });

  it("read_file mostra apenas contagem de chars", () => {
    const out = formatToolResult({ iteracao: 1, tool: "read_file", resultado: "conteudo do arquivo", duration_ms: 3 });
    expect(out).toMatch(/\u2190 read_file/);
    expect(out).toMatch(/\(3ms\)/);
    expect(out).toMatch(/\[19 chars\]/);
    expect(out).not.toMatch(/conteudo do arquivo/);
  });

  it("trunca resultado longo", () => {
    const longo = "x".repeat(1000);
    const out = formatToolResult({ iteracao: 1, tool: "x", resultado: longo, duration_ms: 1 });
    expect(out).toMatch(/\+/);
    expect(out).toMatch(/chars\]/);
    expect(out.length).toBeLessThan(longo.length);
  });
});

describe("formatConfirmation", () => {
  it("write_file mostra caminho de forma leg\u00edvel", () => {
    const out = formatConfirmation({ iteracao: 1, tool: "write_file", args: { path: "a" } });
    expect(out).toMatch(/Write file a/);
    expect(out).toMatch(/y\/n/);
    expect(out).not.toMatch(/confirmar/);
  });

  it("run_bash mostra comando de forma leg\u00edvel", () => {
    const out = formatConfirmation({ iteracao: 1, tool: "run_bash", args: { command: "ls -la" } });
    expect(out).toMatch(/Run bash ls -la/);
    expect(out).toMatch(/y\/n/);
    expect(out).not.toMatch(/confirmar/);
  });
});

describe("formatFinal", () => {
  it("envolve conte\u00fado com separadores", () => {
    const out = formatFinal("pronto");
    expect(out).toMatch(/resposta final/);
    expect(out).toMatch(/pronto/);
  });
});

describe("formatLoopEnd", () => {
  it("motivo concluido retorna vazio (blank tratado pelo handler)", () => {
    expect(formatLoopEnd({ motivo: "concluido", iteracoes: 3 })).toBe("");
  });
  it("motivo limite_atingido tem AVISO", () => {
    expect(formatLoopEnd({ motivo: "limite_atingido", iteracoes: 20 })).toMatch(/AVISO/);
  });
  it("outro motivo \u00e9 exibido literalmente", () => {
    expect(formatLoopEnd({ motivo: "resposta_invalida", iteracoes: 1 })).toMatch(/resposta_invalida/);
  });
});

describe("formatBashOutput", () => {
  it("produz caixa com header e footer", () => {
    const out = formatBashOutput({ resultado: "hello world", duration_ms: 5 });
    expect(out).toContain("┌─ output (5ms)");
    expect(out).toContain("hello world");
    expect(out).toContain("└");
  });

  it("usa cor default (gray) para saída normal", () => {
    const out = formatBashOutput({ resultado: "ok", duration_ms: 5 });
    expect(out).toContain("\x1b[90m");
    expect(out).not.toContain("\x1b[31m");
  });

  it("usa vermelho para erro", () => {
    const out = formatBashOutput({ resultado: "ERRO (exit 1):\n--- stderr ---\nbad", duration_ms: 5 });
    expect(out).toContain("\x1b[31m");
    expect(out).toContain("output (error)");
  });

  it("preview trunca saída longa", () => {
    const long = "x".repeat(5000);
    const out = formatBashOutput({ resultado: long, duration_ms: 1 });
    expect(out).toContain("… [+");
    expect(out).toContain("chars]");
    // Still within bounds
    expect(out.length).toBeLessThan(long.length + 200);
  });

  it("cada linha do output recebe prefixo │", () => {
    const out = formatBashOutput({ resultado: "a\nb\nc", duration_ms: 3 });
    const lines = out.split("\n");
    expect(lines[1]).toContain("│");
    expect(lines[1]).toContain("a");
    expect(lines[2]).toContain("b");
    expect(lines[3]).toContain("c");
  });

  it("lida com missing duration_ms", () => {
    const out = formatBashOutput({ resultado: "ok" });
    expect(out).toMatch(/\(\?ms\)/);
  });
});

describe("createConsoleEventHandler", () => {
  it("chama log com a string formatada para cada evento", () => {
    const calls = [];
    const writes = [];
    const handler = createConsoleEventHandler({
      log: (s) => calls.push(s),
      stdout: { write: (s) => writes.push(s) },
    });
    handler("tool_decision", { iteracao: 1, tool: "x", args: {}, error: null });
    handler("final_content", { content: "fim" });
    handler("loop_end", { motivo: "concluido", iteracoes: 1 });
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatch(/\u2192 x/);
    expect(calls[1]).toMatch(/fim/);
    expect(writes.join("")).toContain("\n");
  });

  it("request mostra indicador Aguardando resposta... (response silencioso)", () => {
    const calls = [];
    const writes = [];
    const handler = createConsoleEventHandler({
      log: (s) => calls.push(s),
      stdout: { write: (s) => writes.push(s) },
    });
    handler("request", { iteracao: 1 });
    handler("response", {});
    expect(calls).toHaveLength(0);
    expect(writes).toHaveLength(2);
    expect(writes[1]).toContain("Aguardando resposta...");
    expect(writes[1]).toContain("\x1b[38;5;208m");
  });

  it("request seguido de token content limpa o indicador", () => {
    const writes = [];
    const handler = createConsoleEventHandler({ stdout: { write: (s) => writes.push(s) } });
    handler("request", { iteracao: 1 });
    handler("token", { type: "content", text: "ok\n" });
    const output = writes.join("");
    expect(output).toContain("Aguardando resposta...");
    expect(output).toContain("ok");
    expect(output).toContain("\r");
    expect(output.indexOf("ok")).toBeGreaterThan(output.lastIndexOf("Aguardando resposta..."));
  });

  it("request em TTY rotaciona frames do spinner", () => {
    vi.useFakeTimers();
    const writes = [];
    const handler = createConsoleEventHandler({
      stdout: { write: (s) => writes.push(s), isTTY: true },
    });
    handler("request", { iteracao: 1 });
    expect(writes.join("")).toContain("\u280b Aguardando resposta...");
    vi.advanceTimersByTime(80);
    expect(writes.join("")).toContain("\u2819");
    vi.advanceTimersByTime(80);
    expect(writes.join("")).toContain("\u2839");
    vi.useRealTimers();
  });

  it("token reasoning fica oculto por padr\u00e3o (nada no stdout)", () => {
    const writes = [];
    const handler = createConsoleEventHandler({ stdout: { write: (s) => writes.push(s) } });
    handler("token", { type: "reasoning", text: "pensando" });
    expect(writes).toHaveLength(0);
  });

  it("token reasoning com \n bufferiza multilinha sem escrever", () => {
    const writes = [];
    const handler = createConsoleEventHandler({ stdout: { write: (s) => writes.push(s) } });
    handler("token", { type: "reasoning", text: "linha1\nlinha2" });
    expect(writes).toHaveLength(0);
  });

  it("token content escreve no stdout quando termina em \\n", () => {
    const writes = [];
    const handler = createConsoleEventHandler({ stdout: { write: (s) => writes.push(s) } });
    handler("token", { type: "content", text: "Hello\n" });
    const output = writes.join("");
    expect(output).toContain("Hello");
  });

  it("token content sem \\n emite raw imediatamente e formata no flush", () => {
    const writes = [];
    const handler = createConsoleEventHandler({ stdout: { write: (s) => writes.push(s) } });
    handler("token", { type: "content", text: "buffered" });
    expect(writes.join("")).toContain("buffered");
    handler("final_content", { content: "buffered" });
    const out = writes.join("");
    expect(out).toContain("buffered");
    expect(out).toContain("\r\x1b[2K");
  });

  it("reasoning oculto + content escreve apenas content", () => {
    const writes = [];
    const handler = createConsoleEventHandler({ stdout: { write: (s) => writes.push(s) } });
    handler("token", { type: "reasoning", text: "pensando" });
    handler("token", { type: "content", text: "resposta\n" });
    const output = writes.join("");
    expect(output).not.toContain("pensando");
    expect(output).toContain("resposta");
  });

  it("tool_decision funciona sem reasoning vis\u00edvel", () => {
    const calls = [];
    const handler = createConsoleEventHandler({
      log: (s) => calls.push(s),
      stdout: { write: vi.fn() },
    });
    handler("token", { type: "reasoning", text: "pensando" });
    handler("tool_decision", { iteracao: 1, tool: "x", args: {}, error: null });
    expect(calls[0]).toMatch(/\u2192 x/);
  });

  it("tool_execution run_bash usa formatBashOutput (stdout.write)", () => {
    const calls = [];
    const writes = [];
    const handler = createConsoleEventHandler({
      log: (s) => calls.push(s),
      stdout: { write: (s) => writes.push(s) },
    });
    handler("tool_execution", {
      tool: "run_bash",
      resultado: "hello",
      duration_ms: 5,
    });
    expect(writes.join("")).toContain("┌─ output (5ms)");
    expect(writes.join("")).toContain("hello");
    expect(calls).toHaveLength(0);
  });

  it("tool_decision read_file suprimido (exibido só no tool_execution)", () => {
    const calls = [];
    const writes = [];
    const handler = createConsoleEventHandler({
      log: (s) => calls.push(s),
      stdout: { write: (s) => writes.push(s) },
    });
    handler("tool_decision", { tool: "read_file", args: { path: "a.txt" } });
    expect(calls).toHaveLength(0);
    expect(writes.join("")).not.toContain("Read file");
  });

  it("tool_decision grep suprimido (exibido só no tool_execution)", () => {
    const calls = [];
    const writes = [];
    const handler = createConsoleEventHandler({
      log: (s) => calls.push(s),
      stdout: { write: (s) => writes.push(s) },
    });
    handler("tool_decision", { tool: "grep", args: { pattern: "foo" } });
    expect(calls).toHaveLength(0);
    expect(writes.join("")).not.toContain("foo");
  });

  it("tool_decision glob suprimido (exibido só no tool_execution)", () => {
    const calls = [];
    const writes = [];
    const handler = createConsoleEventHandler({
      log: (s) => calls.push(s),
      stdout: { write: (s) => writes.push(s) },
    });
    handler("tool_decision", { tool: "glob", args: { pattern: "*.js" } });
    expect(calls).toHaveLength(0);
    expect(writes.join("")).not.toContain("*.js");
  });

  it("tool_execution write_file permanece silencioso", () => {
    const calls = [];
    const writes = [];
    const handler = createConsoleEventHandler({
      log: (s) => calls.push(s),
      stdout: { write: (s) => writes.push(s) },
    });
    handler("tool_execution", { tool: "write_file", resultado: "ok", args: { path: "a.txt" } });
    expect(calls).toHaveLength(0);
    expect(writes).toHaveLength(0);
  });

  it("tool_execution edit_file permanece silencioso", () => {
    const calls = [];
    const writes = [];
    const handler = createConsoleEventHandler({
      log: (s) => calls.push(s),
      stdout: { write: (s) => writes.push(s) },
    });
    handler("tool_execution", { tool: "edit_file", resultado: "ok", args: { filePath: "a.txt" } });
    expect(calls).toHaveLength(0);
    expect(writes).toHaveLength(0);
  });

  it("tool_execution read_file mostra => Read", () => {
    const calls = [];
    const writes = [];
    const handler = createConsoleEventHandler({
      log: (s) => calls.push(s),
      stdout: { write: (s) => writes.push(s) },
    });
    handler("tool_execution", { tool: "read_file", resultado: "conteudo", args: { path: "a.txt" } });
    expect(calls).toHaveLength(0);
    expect(writes.join("")).toContain("=> Read a.txt");
  });

  it("tool_execution read_file sem args mostra ?", () => {
    const calls = [];
    const writes = [];
    const handler = createConsoleEventHandler({
      log: (s) => calls.push(s),
      stdout: { write: (s) => writes.push(s) },
    });
    handler("tool_execution", { tool: "read_file", resultado: "conteudo" });
    expect(calls).toHaveLength(0);
    expect(writes.join("")).toContain("=> Read ?");
  });

  it("tool_execution grep mostra * Grep com count", () => {
    const calls = [];
    const writes = [];
    const handler = createConsoleEventHandler({
      log: (s) => calls.push(s),
      stdout: { write: (s) => writes.push(s) },
    });
    handler("tool_execution", {
      tool: "grep",
      args: { pattern: "foo", path: "src" },
      resultado: "a.js:1: foo\nb.js:2: foo",
    });
    expect(calls).toHaveLength(0);
    const out = writes.join("");
    expect(out).toContain('* Grep "foo" in src (2 matches)');
  });

  it("tool_execution grep 0 matches mostra 0 count", () => {
    const calls = [];
    const writes = [];
    const handler = createConsoleEventHandler({
      log: (s) => calls.push(s),
      stdout: { write: (s) => writes.push(s) },
    });
    handler("tool_execution", {
      tool: "grep",
      args: { pattern: "foo", path: "src" },
      resultado: "Nenhuma correspondência encontrada.",
    });
    expect(calls).toHaveLength(0);
    const out = writes.join("");
    expect(out).toContain('* Grep "foo" in src (0 matches)');
  });

  it("tool_execution grep com erro mostra 0 count", () => {
    const calls = [];
    const writes = [];
    const handler = createConsoleEventHandler({
      log: (s) => calls.push(s),
      stdout: { write: (s) => writes.push(s) },
    });
    handler("tool_execution", {
      tool: "grep",
      args: { pattern: "foo", path: "src" },
      resultado: "ERRO: expressão regular inválida 'foo'",
    });
    expect(calls).toHaveLength(0);
    const out = writes.join("");
    expect(out).toContain('* Grep "foo" in src (0 matches)');
  });

  it("tool_execution grep truncado ignora linha do truncamento no count", () => {
    const calls = [];
    const writes = [];
    const handler = createConsoleEventHandler({
      log: (s) => calls.push(s),
      stdout: { write: (s) => writes.push(s) },
    });
    handler("tool_execution", {
      tool: "grep",
      args: { pattern: "foo", path: "src" },
      resultado: "a.js:1: foo\nb.js:2: foo\n\n... [truncado: limite de 200 correspondências atingido]",
    });
    expect(calls).toHaveLength(0);
    const out = writes.join("");
    expect(out).toContain('* Grep "foo" in src (2 matches)');
  });

  it("tool_execution glob mostra * Glob com count", () => {
    const calls = [];
    const writes = [];
    const handler = createConsoleEventHandler({
      log: (s) => calls.push(s),
      stdout: { write: (s) => writes.push(s) },
    });
    handler("tool_execution", {
      tool: "glob",
      args: { pattern: "*.js", path: "lib" },
      resultado: "a.js\nb.js",
    });
    expect(calls).toHaveLength(0);
    const out = writes.join("");
    expect(out).toContain('* Glob "*.js" in lib (2 matches)');
  });

  it("tool_execution glob sem path usa '.'", () => {
    const calls = [];
    const writes = [];
    const handler = createConsoleEventHandler({
      log: (s) => calls.push(s),
      stdout: { write: (s) => writes.push(s) },
    });
    handler("tool_execution", {
      tool: "glob",
      args: { pattern: "*.js" },
      resultado: "a.js",
    });
    expect(calls).toHaveLength(0);
    const out = writes.join("");
    expect(out).toContain('* Glob "*.js" in . (1 matches)');
  });

  it("tool_execution glob com erro mostra 0 count", () => {
    const calls = [];
    const writes = [];
    const handler = createConsoleEventHandler({
      log: (s) => calls.push(s),
      stdout: { write: (s) => writes.push(s) },
    });
    handler("tool_execution", {
      tool: "glob",
      args: { pattern: "*.js" },
      resultado: "ERRO: pattern inválido",
    });
    expect(calls).toHaveLength(0);
    const out = writes.join("");
    expect(out).toContain('* Glob "*.js" in . (0 matches)');
  });

  it("tool_execution glob 0 matches mostra 0 count", () => {
    const calls = [];
    const writes = [];
    const handler = createConsoleEventHandler({
      log: (s) => calls.push(s),
      stdout: { write: (s) => writes.push(s) },
    });
    handler("tool_execution", {
      tool: "glob",
      args: { pattern: "*.xyz" },
      resultado: "Nenhum arquivo encontrado.",
    });
    expect(calls).toHaveLength(0);
    const out = writes.join("");
    expect(out).toContain('* Glob "*.xyz" in . (0 matches)');
  });

  it("tool_execution generic tool usa formatToolResult (log)", () => {
    const calls = [];
    const writes = [];
    const handler = createConsoleEventHandler({
      log: (s) => calls.push(s),
      stdout: { write: (s) => writes.push(s) },
    });
    handler("tool_execution", {
      tool: "some_tool",
      resultado: "result",
      duration_ms: 10,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatch(/some_tool/);
  });

  it("reasoning oculto nao aparece mas ainda pode ser revelado com tecla r", () => {
    const writes = [];
    const handler = createConsoleEventHandler({ stdout: { write: (s) => writes.push(s) } });
    handler("request", { iteracao: 1 });
    handler("token", { type: "reasoning", text: "raciocinando" });
    const output = writes.join("");
    expect(output).not.toContain("raciocinando");
    expect(output).not.toContain("ver racioc\u00ednio");
  });

  it("tecla 'r' revela reasoning acumulado com prefixo \u203a", () => {
    const stdin = new EventEmitter();
    stdin.isTTY = true;
    stdin.setRawMode = vi.fn();
    const writes = [];
    const handler = createConsoleEventHandler({
      stdin,
      stdout: { write: (s) => writes.push(s) },
    });
    handler("request", { iteracao: 1 });
    handler("token", { type: "reasoning", text: "linha1\nlinha2" });
    expect(writes.join("")).not.toContain("\u203a");
    stdin.emit("keypress", null, { name: "r" });
    const output = writes.join("");
    expect(output).toContain("\u203a");
    expect(output).toContain("linha1");
    expect(output).toContain("linha2");
  });

  it("ap\u00f3s reveal, novos tokens reasoning s\u00e3o streamados ao vivo", () => {
    const stdin = new EventEmitter();
    stdin.isTTY = true;
    stdin.setRawMode = vi.fn();
    const writes = [];
    const handler = createConsoleEventHandler({
      stdin,
      stdout: { write: (s) => writes.push(s) },
    });
    handler("request", { iteracao: 1 });
    handler("token", { type: "reasoning", text: "acumulado" });
    stdin.emit("keypress", null, { name: "r" });
    handler("token", { type: "reasoning", text: "ao vivo" });
    const output = writes.join("");
    expect(output).toContain("acumulado");
    expect(output).toContain("ao vivo");
  });

  it("reveal com buffer vazio n\u00e3o escreve; pr\u00f3ximo reasoning abre bloco", () => {
    const stdin = new EventEmitter();
    stdin.isTTY = true;
    stdin.setRawMode = vi.fn();
    const writes = [];
    const handler = createConsoleEventHandler({
      stdin,
      stdout: { write: (s) => writes.push(s) },
    });
    handler("request", { iteracao: 1 });
    stdin.emit("keypress", null, { name: "r" });
    const antes = writes.length;
    handler("token", { type: "reasoning", text: "agora vis\u00edvel" });
    expect(writes.length).toBeGreaterThan(antes);
    expect(writes.join("")).toContain("agora vis\u00edvel");
  });

  it("reveal \u00e9 idempotente (2\u00aa chamada n\u00e3o duplica)", () => {
    const stdin = new EventEmitter();
    stdin.isTTY = true;
    stdin.setRawMode = vi.fn();
    const writes = [];
    const handler = createConsoleEventHandler({
      stdin,
      stdout: { write: (s) => writes.push(s) },
    });
    handler("request", { iteracao: 1 });
    handler("token", { type: "reasoning", text: "texto" });
    stdin.emit("keypress", null, { name: "r" });
    const depoisPrimeiro = writes.length;
    stdin.emit("keypress", null, { name: "r" });
    expect(writes.length).toBe(depoisPrimeiro);
  });

  it("dispose desanexa input (nao restaura setRawMode - readline precisa de raw)", () => {
    const stdin = new EventEmitter();
    stdin.isTTY = true;
    stdin.setRawMode = vi.fn();
    const handler = createConsoleEventHandler({
      stdin,
      stdout: { write: vi.fn() },
    });
    handler("request", { iteracao: 1 });
    expect(stdin.setRawMode).toHaveBeenCalledWith(true);
    handler.dispose();
    expect(stdin.setRawMode).toHaveBeenCalledTimes(1);
    expect(stdin.setRawMode).not.toHaveBeenCalledWith(false);
    expect(stdin.listenerCount("keypress")).toBe(0);
  });

  it("Ctrl+C no keypress encerra processo", () => {
    const stdin = new EventEmitter();
    stdin.isTTY = true;
    stdin.setRawMode = vi.fn();
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {});
    const handler = createConsoleEventHandler({
      stdin,
      stdout: { write: vi.fn() },
    });
    handler("request", { iteracao: 1 });
    stdin.emit("keypress", null, { ctrl: true, name: "c" });
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });
});
