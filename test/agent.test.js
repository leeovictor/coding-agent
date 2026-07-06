import { describe, it, expect, vi } from "vitest";
import { runAgent, SYSTEM_PROMPT } from "../src/agent.js";

function makeToolCall(id, name, args) {
  return {
    id,
    type: "function",
    function: { name, arguments: JSON.stringify(args) },
  };
}

function textResponse(text) {
  return { choices: [{ message: { role: "assistant", content: text }, finish_reason: "stop" }] };
}

function toolResponse(toolCalls) {
  return {
    choices: [
      { message: { role: "assistant", content: null, tool_calls: toolCalls }, finish_reason: "tool_calls" },
    ],
  };
}

function queueResponses(...responses) {
  const queue = [...responses];
  return vi.fn(async () => queue.shift());
}

describe("runAgent", () => {
  it("termina com 'concluido' quando modelo responde só texto", async () => {
    const callApi = queueResponses(textResponse("pronto"));
    const result = await runAgent({
      task: "teste",
      tools: [],
      callApi,
      executeTool: vi.fn(),
    });
    expect(result.reason).toBe("concluido");
    expect(result.finalContent).toBe("pronto");
    expect(callApi).toHaveBeenCalledTimes(1);
  });

  it("executa 1 tool call e depois conclui", async () => {
    const callApi = queueResponses(
      toolResponse([makeToolCall("1", "read_file", { path: "a.txt" })]),
      textResponse("li o arquivo"),
    );
    const executeTool = vi.fn(() => "conteúdo do arquivo");
    const result = await runAgent({
      task: "leia a.txt",
      tools: [],
      callApi,
      executeTool,
    });
    expect(result.reason).toBe("concluido");
    expect(executeTool).toHaveBeenCalledWith("read_file", { path: "a.txt" });
    expect(callApi).toHaveBeenCalledTimes(2);
  });

  it("processa múltiplos tool_calls em um único turno", async () => {
    const callApi = queueResponses(
      toolResponse([
        makeToolCall("1", "read_file", { path: "a.txt" }),
        makeToolCall("2", "read_file", { path: "b.txt" }),
        makeToolCall("3", "run_bash", { command: "ls" }),
      ]),
      textResponse("feito"),
    );
    const executeTool = vi.fn((name) => `result_${name}`);
    const result = await runAgent({
      task: "multi",
      tools: [],
      callApi,
      executeTool,
    });
    expect(executeTool).toHaveBeenCalledTimes(3);
    expect(result.reason).toBe("concluido");
  });

  it("empilha mensagens role:tool para cada tool_call", async () => {
    const callApi = queueResponses(
      toolResponse([
        makeToolCall("1", "read_file", { path: "a" }),
        makeToolCall("2", "read_file", { path: "b" }),
      ]),
      textResponse("ok"),
    );
    const result = await runAgent({
      task: "x",
      tools: [],
      callApi,
      executeTool: () => "r",
    });
    const toolMessages = result.messages.filter((m) => m.role === "tool");
    expect(toolMessages).toHaveLength(2);
    expect(toolMessages[0]).toEqual({ role: "tool", tool_call_id: "1", content: "r" });
    expect(toolMessages[1]).toEqual({ role: "tool", tool_call_id: "2", content: "r" });
  });

  it("atinge limite de iterações quando modelo só chama tools", async () => {
    const callApi = vi.fn(async () =>
      toolResponse([makeToolCall("1", "read_file", { path: "x" })])
    );
    const result = await runAgent({
      task: "loop",
      tools: [],
      callApi,
      executeTool: () => "r",
      maxIterations: 3,
    });
    expect(result.reason).toBe("limite_atingido");
    expect(callApi).toHaveBeenCalledTimes(3);
  });

  it("lida com args inválidos sem lançar — envia erro como conteúdo da tool", async () => {
    const callApi = queueResponses(
      {
        choices: [
          {
            message: {
              role: "assistant",
              content: null,
              tool_calls: [{ id: "1", type: "function", function: { name: "read_file", arguments: "{invalid" } }],
            },
          },
        ],
      },
      textResponse("recuperei"),
    );
    const executeTool = vi.fn();
    const result = await runAgent({
      task: "x",
      tools: [],
      callApi,
      executeTool,
    });
    expect(executeTool).not.toHaveBeenCalled();
    const toolMsg = result.messages.find((m) => m.role === "tool");
    expect(toolMsg.content).toMatch(/inválido|inválidos/);
    expect(result.reason).toBe("concluido");
  });

  it("chama onEvent com tipos corretos", async () => {
    const callApi = queueResponses(
      toolResponse([makeToolCall("1", "read_file", { path: "a" })]),
      textResponse("feito"),
    );
    const events = [];
    await runAgent({
      task: "x",
      tools: [],
      callApi,
      executeTool: () => "r",
      onEvent: (event, data) => events.push({ event, data }),
    });
    const types = events.map((e) => e.event);
    expect(types).toContain("request");
    expect(types).toContain("response");
    expect(types).toContain("tool_decision");
    expect(types).toContain("tool_execution");
    expect(types).toContain("final_content");
    expect(types).toContain("loop_end");
  });

  it("respeita função confirm para tools sensíveis", async () => {
    const callApi = queueResponses(
      toolResponse([makeToolCall("1", "write_file", { path: "a", content: "x" })]),
      textResponse("feito"),
    );
    const confirm = vi.fn(async () => false);
    const executeTool = vi.fn(() => "escrito");
    const result = await runAgent({
      task: "x",
      tools: [],
      callApi,
      executeTool,
      confirm,
    });
    expect(confirm).toHaveBeenCalledWith("write_file", { path: "a", content: "x" });
    expect(executeTool).not.toHaveBeenCalled();
    const toolMsg = result.messages.find((m) => m.role === "tool");
    expect(toolMsg.content).toMatch(/recusou/);
  });

  it("não chama confirm para tools não-sensíveis", async () => {
    const callApi = queueResponses(
      toolResponse([makeToolCall("1", "read_file", { path: "a" })]),
      textResponse("feito"),
    );
    const confirm = vi.fn(async () => true);
    await runAgent({
      task: "x",
      tools: [],
      callApi,
      executeTool: () => "r",
      confirm,
    });
    expect(confirm).not.toHaveBeenCalled();
  });
});
