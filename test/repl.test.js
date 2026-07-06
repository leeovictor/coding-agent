import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createInterface } from "node:readline";

vi.mock("node:readline");

let mockRunAgent;
vi.mock("../src/agent.js", async () => {
  const actual = await vi.importActual("../src/agent.js");
  mockRunAgent = vi.fn();
  return { ...actual, runAgent: mockRunAgent };
});

const { mockSelectModel } = vi.hoisted(() => ({
  mockSelectModel: vi.fn(),
}));
vi.mock("../src/commands/models.js", () => ({
  selectModel: mockSelectModel,
}));

function makeMockRl(answers) {
  let idx = 0;
  const rl = {
    question: vi.fn((prompt, cb) => {
      const ans = answers[idx++];
      if (ans !== undefined) {
        setTimeout(() => cb(ans), 0);
      }
    }),
    close: vi.fn(),
    on: vi.fn(),
  };
  return rl;
}

describe("runRepl", () => {
  let mockRl;

  beforeEach(() => {
    vi.stubGlobal("console", { clear: vi.fn(), log: vi.fn(), error: vi.fn() });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("/exit encerra o loop e fecha readline", async () => {
    mockRl = makeMockRl(["/exit"]);
    createInterface.mockReturnValue(mockRl);
    const { runRepl } = await import("../src/repl.js");
    await runRepl();
    expect(mockRl.close).toHaveBeenCalled();
  });

  it("/clear limpa console e reinicia mensagens", async () => {
    mockRl = makeMockRl(["/clear", "/exit"]);
    createInterface.mockReturnValue(mockRl);
    const { runRepl } = await import("../src/repl.js");
    await runRepl();
    expect(console.clear).toHaveBeenCalled();
  });

  it("/help imprime ajuda", async () => {
    mockRl = makeMockRl(["/help", "/exit"]);
    createInterface.mockReturnValue(mockRl);
    const { runRepl } = await import("../src/repl.js");
    await runRepl();
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("/exit"));
  });

  it("/models chama selectModel", async () => {
    mockSelectModel.mockResolvedValue("anthropic/claude-sonnet-4.5");
    mockRl = makeMockRl(["/models", "/exit"]);
    createInterface.mockReturnValue(mockRl);
    const { runRepl } = await import("../src/repl.js");
    await runRepl();
    expect(mockSelectModel).toHaveBeenCalledTimes(1);
    expect(mockRl.close).toHaveBeenCalled();
  });

  it("input normal chama runAgent", async () => {
    mockRunAgent.mockResolvedValue({
      messages: [{ role: "system", content: "prompt" }],
      finalContent: "ok",
    });
    mockRl = makeMockRl(["hello", "/exit"]);
    createInterface.mockReturnValue(mockRl);
    const { runRepl } = await import("../src/repl.js");
    await runRepl();
    expect(mockRunAgent).toHaveBeenCalledTimes(1);
    const opts = mockRunAgent.mock.calls[0][0];
    expect(opts.messages).toHaveLength(2);
    expect(opts.messages[1]).toEqual({ role: "user", content: "hello" });
    expect(opts.stream).toBe(true);
  });

  it("acumula mensagens entre turnos", async () => {
    let callIdx = 0;
    mockRunAgent.mockImplementation(async (opts) => {
      callIdx++;
      if (callIdx === 1) {
        return {
          messages: [
            ...opts.messages,
            { role: "assistant", content: "resposta1" },
            { role: "user", content: "segundo turno" },
          ],
          finalContent: "resposta1",
        };
      }
      return {
        messages: [...opts.messages, { role: "assistant", content: "resposta2" }],
        finalContent: "resposta2",
      };
    });
    mockRl = makeMockRl(["primeira msg", "segunda msg", "/exit"]);
    createInterface.mockReturnValue(mockRl);
    const { runRepl } = await import("../src/repl.js");
    await runRepl();
    expect(mockRunAgent).toHaveBeenCalledTimes(2);
    const firstCall = mockRunAgent.mock.calls[0][0];
    const secondCall = mockRunAgent.mock.calls[1][0];
    expect(firstCall.messages).toHaveLength(2);
    expect(secondCall.messages).toHaveLength(5);
  });

  it("linha vazia não chama runAgent", async () => {
    mockRl = makeMockRl(["", "/exit"]);
    createInterface.mockReturnValue(mockRl);
    const { runRepl } = await import("../src/repl.js");
    await runRepl();
    expect(mockRunAgent).not.toHaveBeenCalled();
  });
});
