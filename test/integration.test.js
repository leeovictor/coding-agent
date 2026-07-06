import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAgent } from "../src/agent.js";
import { callApi, OPENROUTER_MODEL } from "../src/openrouter.js";
import { getToolSchema, executeTool } from "../src/tools/index.js";
import { createLogger } from "../src/logger.js";

process.env.OPENROUTER_API_KEY = "sk-test-mock";

function mockFetchQueue(...responses) {
  const queue = [...responses];
  return vi.spyOn(globalThis, "fetch").mockImplementation(async () => ({
    ok: true,
    json: async () => queue.shift(),
  }));
}

function textResponse(text) {
  return { choices: [{ message: { role: "assistant", content: text }, finish_reason: "stop" }] };
}

function toolCallResponse(id, name, args) {
  return {
    choices: [{
      message: {
        role: "assistant",
        content: null,
        tool_calls: [{ id, type: "function", function: { name, arguments: JSON.stringify(args) } }],
      },
      finish_reason: "tool_calls",
    }],
  };
}

describe("integração — fluxo completo mockado", () => {
  const tools = getToolSchema();
  let tmpDir;

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "agent-int-"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("modelo configurado é uma string não-vazia", () => {
    expect(typeof OPENROUTER_MODEL).toBe("string");
    expect(OPENROUTER_MODEL.length).toBeGreaterThan(0);
  });

  it("tarefa simples sem tools retorna texto e conclui", async () => {
    mockFetchQueue(textResponse("pronto"));
    const result = await runAgent({ task: "teste", tools: [], callApi, executeTool, maxIterations: 3 });
    expect(result.reason).toBe("concluido");
    expect(result.iterations).toBe(1);
    expect(result.finalContent).toBe("pronto");
  });

  it("tarefa que exige read_file funciona", async () => {
    const p = join(tmpDir, "alvo.txt");
    writeFileSync(p, "conteudo-secreto-123");
    mockFetchQueue(
      toolCallResponse("call_1", "read_file", { path: p }),
      textResponse("conteudo-secreto-123"),
    );
    const result = await runAgent({
      task: `Leia o arquivo ${p} e me diga o conteúdo.`,
      tools, callApi, executeTool, maxIterations: 5,
    });
    expect(result.reason).toBe("concluido");
    expect(result.finalContent).toMatch(/conteudo-secreto-123/);
  });

  it("tarefa que exige write_file cria arquivo de verdade", async () => {
    const p = join(tmpDir, "saida.txt");
    mockFetchQueue(
      toolCallResponse("call_1", "write_file", { path: p, content: "hello mundo" }),
      textResponse("arquivo criado"),
    );
    const result = await runAgent({
      task: `Crie o arquivo ${p}.`,
      tools, callApi, executeTool, confirm: async () => true, maxIterations: 5,
    });
    expect(result.reason).toBe("concluido");
    expect(existsSync(p)).toBe(true);
    expect(readFileSync(p, "utf8")).toMatch(/hello mundo/);
  });

  it("logger JSONL é gerado e contém eventos esperados", async () => {
    mockFetchQueue(textResponse("ok"));
    const logger = createLogger(tmpDir);
    await runAgent({
      task: "teste", tools: [], callApi, executeTool, maxIterations: 3,
      onEvent: (event, data) => logger.logEvent(event, data),
    });
    expect(existsSync(logger.filePath)).toBe(true);
    const lines = readFileSync(logger.filePath, "utf8").trim().split("\n").map(JSON.parse);
    const types = lines.map((l) => l.event);
    expect(types).toContain("request");
    expect(types).toContain("response");
    expect(types).toContain("loop_end");
  });
});
