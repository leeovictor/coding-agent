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

const mockPromptApiKey = vi.hoisted(() => vi.fn());
vi.mock("../src/commands/apikey.js", () => ({
  promptApiKey: mockPromptApiKey,
}));

const mockEnsureApiKey = vi.hoisted(() => vi.fn());
vi.mock("../src/ensureKey.js", () => ({
  ensureApiKey: mockEnsureApiKey,
}));

const { mockSwitchAgent, mockListAgents, mockAgentColor, mockBuildHelpText, mockGetCurrentAgent, mockGetCurrentAgentName, resetAgentMock } = vi.hoisted(() => {
  let current = "build";
  return {
    resetAgentMock: () => { current = "build"; },
    mockGetCurrentAgent: vi.fn(() => ({ name: current, systemReminder: "test" })),
    mockGetCurrentAgentName: vi.fn(() => current),
    mockSwitchAgent: vi.fn((name) => {
      if (["build", "plan"].includes(name)) current = name;
      return { name: current, systemReminder: "test" };
    }),
    mockListAgents: vi.fn(() => [
      { name: "build", description: "Build", color: "blue", allowedTools: "all" },
      { name: "plan", description: "Plan", color: "orange", allowedTools: ["read_file"] },
    ]),
    mockAgentColor: vi.fn((name) => (name === "plan" ? "\x1b[38;5;208m" : "\x1b[34m")),
    mockBuildHelpText: vi.fn(() => "agent help text"),
  };
});
vi.mock("../src/agents.js", () => ({
  getCurrentAgent: mockGetCurrentAgent,
  getCurrentAgentName: mockGetCurrentAgentName,
  switchAgent: mockSwitchAgent,
  cycleAgent: vi.fn(),
  listAgents: mockListAgents,
  agentColor: mockAgentColor,
  buildHelpText: mockBuildHelpText,
}));

const mockGetToolSchema = vi.hoisted(() => vi.fn(() => []));
vi.mock("../src/tools/index.js", async () => {
  const actual = await vi.importActual("../src/tools/index.js");
  return { ...actual, getToolSchema: mockGetToolSchema };
});

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
    once: vi.fn((event, cb) => {
      rl.on(event, cb);
    }),
    removeAllListeners: vi.fn(),
    removeListener: vi.fn(),
  };
  return rl;
}

describe("runRepl", () => {
  let mockRl;

  beforeEach(() => {
    vi.stubGlobal("console", { clear: vi.fn(), log: vi.fn(), error: vi.fn() });
    mockEnsureApiKey.mockResolvedValue();
    mockPromptApiKey.mockResolvedValue("sk-or-v1-new-key");
    resetAgentMock();
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

  it("/api-key chama promptApiKey", async () => {
    mockRl = makeMockRl(["/api-key", "/exit"]);
    createInterface.mockReturnValue(mockRl);
    const { runRepl } = await import("../src/repl.js");
    await runRepl();
    expect(mockPromptApiKey).toHaveBeenCalledTimes(1);
  });

  it("chama ensureApiKey na inicialização", async () => {
    mockRl = makeMockRl(["/exit"]);
    createInterface.mockReturnValue(mockRl);
    const { runRepl } = await import("../src/repl.js");
    await runRepl();
    expect(mockEnsureApiKey).toHaveBeenCalledTimes(1);
  });

  it("/agent plan troca o agente ativo", async () => {
    mockRl = makeMockRl(["/agent plan", "/exit"]);
    createInterface.mockReturnValue(mockRl);
    const { runRepl } = await import("../src/repl.js");
    await runRepl();
    expect(mockSwitchAgent).toHaveBeenCalledWith("plan");
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("plan"));
  });

  it("/agent build volta para build", async () => {
    mockRl = makeMockRl(["/agent plan", "/agent build", "/exit"]);
    createInterface.mockReturnValue(mockRl);
    const { runRepl } = await import("../src/repl.js");
    await runRepl();
    expect(mockSwitchAgent).toHaveBeenCalledWith("build");
  });

  it("/agent inexistente mantém agente atual", async () => {
    mockRl = makeMockRl(["/agent invalid", "/exit"]);
    createInterface.mockReturnValue(mockRl);
    const { runRepl } = await import("../src/repl.js");
    await runRepl();
    expect(mockSwitchAgent).toHaveBeenCalledWith("invalid");
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("n\u00e3o encontrado"));
  });

  it("/agents lista agentes disponíveis", async () => {
    mockRl = makeMockRl(["/agents", "/exit"]);
    createInterface.mockReturnValue(mockRl);
    const { runRepl } = await import("../src/repl.js");
    await runRepl();
    expect(mockListAgents).toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("Agentes"));
  });

  it("/help inclui agentes na saída", async () => {
    mockRl = makeMockRl(["/help", "/exit"]);
    createInterface.mockReturnValue(mockRl);
    const { runRepl } = await import("../src/repl.js");
    await runRepl();
    expect(mockBuildHelpText).toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("/agent"));
  });

  it("prompt usa cor do agente", async () => {
    mockRl = makeMockRl(["/exit"]);
    createInterface.mockReturnValue(mockRl);
    const { runRepl } = await import("../src/repl.js");
    await runRepl();
    const questionCall = mockRl.question.mock.calls[0][0];
    expect(questionCall).toContain("\x1b[34m");
    expect(questionCall).toContain("build>");
  });

  it("getToolSchema é chamado com o nome do agente", async () => {
    mockRunAgent.mockResolvedValue({
      messages: [{ role: "system", content: "prompt" }],
      finalContent: "ok",
    });
    mockRl = makeMockRl(["hello", "/exit"]);
    createInterface.mockReturnValue(mockRl);
    const { runRepl } = await import("../src/repl.js");
    await runRepl();
    expect(mockGetToolSchema).toHaveBeenCalledWith("build");
  });
});
