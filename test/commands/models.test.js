import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockListModels, mockSetModel } = vi.hoisted(() => ({
  mockListModels: vi.fn(),
  mockSetModel: vi.fn(),
}));

vi.mock("../../src/openrouter.js", () => ({
  listModels: mockListModels,
  setModel: mockSetModel,
  currentModel: "default/model",
}));

import { selectModel } from "../../src/commands/models.js";

describe("selectModel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("seleciona modelo via prompter e chama setModel", async () => {
    mockListModels.mockResolvedValue([
      { id: "openai/gpt-4", name: "GPT-4", context: 8192 },
      { id: "anthropic/claude-3", name: "Claude 3", context: null },
    ]);

    const mockPrompter = vi.fn().mockResolvedValue("anthropic/claude-3");
    const result = await selectModel({ prompter: mockPrompter });

    expect(result).toBe("anthropic/claude-3");
    expect(mockSetModel).toHaveBeenCalledWith("anthropic/claude-3");
    expect(mockPrompter).toHaveBeenCalledTimes(1);

    const prompterArg = mockPrompter.mock.calls[0][0];
    expect(prompterArg.message).toContain("Selecione");
    expect(prompterArg.pageSize).toBe(10);
    expect(typeof prompterArg.source).toBe("function");

    const srcResult = prompterArg.source("gpt");
    expect(srcResult).toHaveLength(1);
    expect(srcResult[0].value).toBe("openai/gpt-4");
  });

  it("source filtra modelos case-insensitive", async () => {
    mockListModels.mockResolvedValue([
      { id: "openai/gpt-4", name: "GPT-4", context: null },
      { id: "anthropic/claude-3", name: "Claude 3", context: null },
    ]);

    const mockPrompter = vi.fn().mockResolvedValue("openai/gpt-4");
    await selectModel({ prompter: mockPrompter });

    const { source } = mockPrompter.mock.calls[0][0];
    const result = source("ANTHROPIC");
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe("anthropic/claude-3");
  });

  it("source retorna todos quando term vazio", async () => {
    mockListModels.mockResolvedValue([
      { id: "a", name: "A", context: null },
      { id: "b", name: "B", context: null },
    ]);

    const mockPrompter = vi.fn().mockResolvedValue("a");
    await selectModel({ prompter: mockPrompter });

    const { source } = mockPrompter.mock.calls[0][0];
    const result = source("");
    expect(result).toHaveLength(2);
  });

  it("source sem match retorna vazio", async () => {
    mockListModels.mockResolvedValue([
      { id: "only/model", name: "Only", context: null },
    ]);

    const mockPrompter = vi.fn().mockResolvedValue("only/model");
    await selectModel({ prompter: mockPrompter });

    const { source } = mockPrompter.mock.calls[0][0];
    const result = source("zzzzz");
    expect(result).toHaveLength(0);
  });

  it("não altera modelo se prompter rejeitar (cancel)", async () => {
    mockListModels.mockResolvedValue([{ id: "m", name: "M", context: null }]);
    const mockPrompter = vi.fn().mockRejectedValue(new Error("canceled"));

    await expect(selectModel({ prompter: mockPrompter })).rejects.toThrow("canceled");
    expect(mockSetModel).not.toHaveBeenCalled();
  });

  it("repassa erro de listModels", async () => {
    mockListModels.mockRejectedValue(new Error("network error"));
    const mockPrompter = vi.fn();

    await expect(selectModel({ prompter: mockPrompter })).rejects.toThrow("network error");
    expect(mockPrompter).not.toHaveBeenCalled();
    expect(mockSetModel).not.toHaveBeenCalled();
  });
});
