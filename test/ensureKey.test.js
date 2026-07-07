import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockGetApiKey = vi.hoisted(() => vi.fn());
const mockSetApiKey = vi.hoisted(() => vi.fn());

const mockPromptApiKey = vi.hoisted(() => vi.fn());

vi.mock("../src/openrouter.js", () => ({
  getApiKey: mockGetApiKey,
  setApiKey: mockSetApiKey,
}));

vi.mock("../src/commands/apikey.js", () => ({
  promptApiKey: mockPromptApiKey,
}));

describe("ensureApiKey", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.stdin.isTTY;
  });

  it("não faz nada se chave já existe", async () => {
    mockGetApiKey.mockReturnValue("sk-or-v1-existing");
    const { ensureApiKey } = await import("../src/ensureKey.js");
    await ensureApiKey();
    expect(mockPromptApiKey).not.toHaveBeenCalled();
    expect(mockSetApiKey).not.toHaveBeenCalled();
  });

  it("solicita chave e chama setApiKey se nenhuma chave", async () => {
    process.stdin.isTTY = true;
    mockGetApiKey.mockReturnValue(null);
    mockPromptApiKey.mockResolvedValue("sk-or-v1-new-key");
    const { ensureApiKey } = await import("../src/ensureKey.js");
    await ensureApiKey();
    expect(mockSetApiKey).toHaveBeenCalledWith("sk-or-v1-new-key");
  });

  it("lança erro se usuário não fornecer chave", async () => {
    process.stdin.isTTY = true;
    mockGetApiKey.mockReturnValue(null);
    mockPromptApiKey.mockResolvedValue(null);
    const { ensureApiKey } = await import("../src/ensureKey.js");
    await expect(ensureApiKey()).rejects.toThrow(/API Key/);
  });
});
