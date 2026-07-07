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
      toolResponse([makeToolCall("1", "write_file", { path: "/tmp/foo", content: "x" })]),
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
    expect(confirm).toHaveBeenCalledWith("write_file", { path: "/tmp/foo", content: "x" });
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

  it("não chama confirm para run_bash com comando allow-listed", async () => {
    const callApi = queueResponses(
      toolResponse([makeToolCall("1", "run_bash", { command: "ls -la" })]),
      textResponse("feito"),
    );
    const confirm = vi.fn(async () => true);
    const executeTool = vi.fn(() => "(saída)");
    const result = await runAgent({
      task: "x",
      tools: [],
      callApi,
      executeTool,
      confirm,
    });
    expect(confirm).not.toHaveBeenCalled();
    expect(executeTool).toHaveBeenCalledWith("run_bash", { command: "ls -la" });
    expect(result.reason).toBe("concluido");
  });

  it("chama confirm para run_bash com comando perigoso", async () => {
    const callApi = queueResponses(
      toolResponse([makeToolCall("1", "run_bash", { command: "rm important" })]),
      textResponse("feito"),
    );
    const confirm = vi.fn(async () => false);
    const executeTool = vi.fn(() => "executado");
    await runAgent({
      task: "x",
      tools: [],
      callApi,
      executeTool,
      confirm,
    });
    expect(confirm).toHaveBeenCalledWith("run_bash", { command: "rm important" });
    expect(executeTool).not.toHaveBeenCalled();
  });

  it("não emite tool_confirmation para bash allow-listed", async () => {
    const callApi = queueResponses(
      toolResponse([makeToolCall("1", "run_bash", { command: "pwd" })]),
      textResponse("feito"),
    );
    const events = [];
    await runAgent({
      task: "x",
      tools: [],
      callApi,
      executeTool: () => "r",
      confirm: () => true,
      onEvent: (event, data) => events.push({ event, data }),
    });
    const confirmEvents = events.filter((e) => e.event === "tool_confirmation");
    expect(confirmEvents).toHaveLength(0);
    const execEvents = events.filter((e) => e.event === "tool_execution");
    expect(execEvents).toHaveLength(1);
  });

  it("emite tool_confirmation para write_file (ainda sensível)", async () => {
    const callApi = queueResponses(
      toolResponse([makeToolCall("1", "write_file", { path: "/tmp/foo", content: "x" })]),
      textResponse("feito"),
    );
    const events = [];
    await runAgent({
      task: "x",
      tools: [],
      callApi,
      executeTool: () => "ok",
      confirm: () => true,
      onEvent: (event, data) => events.push({ event, data }),
    });
    const confirmEvents = events.filter((e) => e.event === "tool_confirmation");
    expect(confirmEvents).toHaveLength(1);
    expect(confirmEvents[0].data.decisao).toBe(true);
  });

  it("streaming: emite token events com content", async () => {
    function streamingCallApi() {
      const chunks = [
        { choices: [{ delta: { content: "Hello" } }] },
        { choices: [{ delta: { content: " world" } }] },
        { choices: [{ delta: {} }, { delta: {}, finish_reason: "stop" }] },
      ];
      return {
        [Symbol.asyncIterator]() {
          let i = 0;
          return {
            async next() {
              if (i >= chunks.length) return { done: true, value: undefined };
              return { done: false, value: chunks[i++] };
            },
          };
        },
      };
    }

    const callApi = vi.fn(async () => streamingCallApi());
    const events = [];
    const result = await runAgent({
      task: "test",
      tools: [],
      callApi,
      executeTool: vi.fn(),
      stream: true,
      onEvent: (event, data) => events.push({ event, data }),
    });
    const tokenEvents = events.filter((e) => e.event === "token");
    expect(tokenEvents).toHaveLength(2);
    expect(tokenEvents[0].data).toEqual({ type: "content", text: "Hello" });
    expect(tokenEvents[1].data).toEqual({ type: "content", text: " world" });
    expect(result.finalContent).toBe("Hello world");
  });

  it("streaming: emite token events com reasoning", async () => {
    function streamingCallApi() {
      const chunks = [
        { choices: [{ delta: { reasoning: "Let me think" } }] },
        { choices: [{ delta: { reasoning: " about it" } }] },
        { choices: [{ delta: { content: "Answer" } }] },
        { choices: [{ delta: {} }] },
      ];
      return {
        [Symbol.asyncIterator]() {
          let i = 0;
          return {
            async next() {
              if (i >= chunks.length) return { done: true, value: undefined };
              return { done: false, value: chunks[i++] };
            },
          };
        },
      };
    }

    const callApi = vi.fn(async () => streamingCallApi());
    const events = [];
    await runAgent({
      task: "test",
      tools: [],
      callApi,
      executeTool: vi.fn(),
      stream: true,
      onEvent: (event, data) => events.push({ event, data }),
    });
    const reasoningEvents = events.filter((e) => e.event === "token" && e.data.type === "reasoning");
    expect(reasoningEvents).toHaveLength(2);
    expect(reasoningEvents[0].data.text).toBe("Let me think");
    expect(reasoningEvents[1].data.text).toBe(" about it");
  });

  it("streaming: tool_calls são montados e executados", async () => {
    const toolCallChunks = [
      { choices: [{ delta: { tool_calls: [{ index: 0, id: "call_1", function: { name: "read_file", arguments: "" } }] } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"path":"' } }] } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'a.txt"}' } }] } }] },
      { choices: [{ delta: {} }] },
    ];
    const textChunks = [
      { choices: [{ delta: { content: "done" } }] },
      { choices: [{ delta: {} }] },
    ];

    function makeIter(arr) {
      let i = 0;
      return {
        [Symbol.asyncIterator]() {
          return {
            async next() {
              if (i >= arr.length) return { done: true, value: undefined };
              return { done: false, value: arr[i++] };
            },
          };
        },
      };
    }

    let callCount = 0;
    const callApi = vi.fn(async () => {
      callCount++;
      return callCount === 1 ? makeIter(toolCallChunks) : makeIter(textChunks);
    });

    const executeTool = vi.fn(() => "content");
    const result = await runAgent({
      task: "read file",
      tools: [],
      callApi,
      executeTool,
      stream: true,
      maxIterations: 3,
    });
    expect(executeTool).toHaveBeenCalledWith("read_file", { path: "a.txt" });
    expect(result.reason).toBe("concluido");
  });

  it("usa messages pré-definidas em vez de criar", async () => {
    const callApi = queueResponses(textResponse("ok"));
    const preMessages = [
      { role: "system", content: "custom system" },
      { role: "user", content: "custom user" },
    ];
    const result = await runAgent({
      messages: preMessages,
      tools: [],
      callApi,
      executeTool: vi.fn(),
    });
    expect(result.reason).toBe("concluido");
    expect(result.messages[0]).toEqual({ role: "system", content: "custom system" });
  });

  it("sem messages cria do zero com task", async () => {
    const callApi = queueResponses(textResponse("ok"));
    const result = await runAgent({
      task: "my task",
      tools: [],
      callApi,
      executeTool: vi.fn(),
    });
    expect(result.messages[0].role).toBe("system");
    expect(result.messages[1]).toEqual({ role: "user", content: "my task" });
  });
});
