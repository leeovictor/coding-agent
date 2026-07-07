import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetApiKey = vi.hoisted(() => vi.fn());
const mockSetApiKey = vi.hoisted(() => vi.fn());

vi.mock("../../src/openrouter.js", () => ({
  getApiKey: mockGetApiKey,
  setApiKey: mockSetApiKey,
}));

describe("promptApiKey", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna null se usuário digitar vazio e não houver chave atual", async () => {
    mockGetApiKey.mockReturnValue(null);
    const { promptApiKey } = await import("../../src/commands/apikey.js");
    const mockPrompter = vi.fn().mockResolvedValue("");
    const result = await promptApiKey({ prompter: mockPrompter });
    expect(result).toBeNull();
    expect(mockSetApiKey).not.toHaveBeenCalled();
  });

  it("retorna chave atual se usuário digitar vazio e houver chave", async () => {
    mockGetApiKey.mockReturnValue("sk-or-v1-existing-key");
    const { promptApiKey } = await import("../../src/commands/apikey.js");
    const mockPrompter = vi.fn().mockResolvedValue("");
    const result = await promptApiKey({ prompter: mockPrompter });
    expect(result).toBe("sk-or-v1-existing-key");
  });

  it("chama setApiKey com valor trimado", async () => {
    mockGetApiKey.mockReturnValue(null);
    const { promptApiKey } = await import("../../src/commands/apikey.js");
    const mockPrompter = vi.fn().mockResolvedValue("  sk-or-v1-new-key  ");
    const result = await promptApiKey({ prompter: mockPrompter });
    expect(result).toBe("sk-or-v1-new-key");
    expect(mockSetApiKey).toHaveBeenCalledWith("sk-or-v1-new-key");
  });

  it("não chama setApiKey se prompter rejeitar (cancel)", async () => {
    mockGetApiKey.mockReturnValue(null);
    const { promptApiKey } = await import("../../src/commands/apikey.js");
    const mockPrompter = vi.fn().mockRejectedValue(new Error("canceled"));
    await expect(promptApiKey({ prompter: mockPrompter })).rejects.toThrow("canceled");
    expect(mockSetApiKey).not.toHaveBeenCalled();
  });
});
