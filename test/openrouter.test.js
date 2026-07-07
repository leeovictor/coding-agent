import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockSaveConfig = vi.hoisted(() => vi.fn());

vi.mock("../src/config.js", () => ({
  loadConfig: () => ({}),
  saveConfig: mockSaveConfig,
}));

import { callApi, callApiStream, setModel, listModels, currentModel, currentReasoningEffort, setApiKey, getApiKey } from "../src/openrouter.js";

const FAKE_KEY = "sk-or-v1-test123";

function mockStreamResponse(chunks) {
  const encoder = new TextEncoder();
  let i = 0;
  return {
    ok: true,
    body: {
      getReader() {
        return {
          async read() {
            if (i >= chunks.length) return { done: true, value: undefined };
            return { done: false, value: encoder.encode(chunks[i++]) };
          },
        };
      },
    },
  };
}

function mockJsonResponse(data) {
  return {
    ok: true,
    json: async () => data,
    text: async () => JSON.stringify(data),
  };
}

function mockErrorResponse(status, text) {
  return {
    ok: false,
    status,
    text: async () => text,
  };
}

describe("callApi (non-stream)", () => {
  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = FAKE_KEY;
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    delete process.env.OPENROUTER_API_KEY;
    vi.unstubAllGlobals();
  });

  it("retorna JSON quando stream=false", async () => {
    const fakeResponse = { choices: [{ message: { content: "hi" } }] };
    fetch.mockResolvedValue(mockJsonResponse(fakeResponse));
    const result = await callApi([{ role: "user", content: "x" }], [], false);
    expect(result).toEqual(fakeResponse);
  });

  it("lança erro sem API key", async () => {
    delete process.env.OPENROUTER_API_KEY;
    await expect(callApi([], [])).rejects.toThrow(/OPENROUTER_API_KEY/);
  });

  it("lança erro quando resposta não é ok", async () => {
    fetch.mockResolvedValue(mockErrorResponse(401, "Unauthorized"));
    await expect(callApi([], [])).rejects.toThrow(/OpenRouter 401/);
  });
});

describe("callApi stream mode", () => {
  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = FAKE_KEY;
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    delete process.env.OPENROUTER_API_KEY;
    vi.unstubAllGlobals();
  });

  it("retorna objeto async iterable quando stream=true", async () => {
    fetch.mockResolvedValue(mockStreamResponse([]));
    const result = await callApi([], [], true);
    expect(result[Symbol.asyncIterator]).toBeDefined();
  });

  it("faz fetch com stream:true no body", async () => {
    fetch.mockResolvedValue(mockStreamResponse(['data: {"a":1}\n\n']));
    const iter = await callApi([], [], true);
    for await (const _ of iter) { /* consume to trigger fetch */ } // eslint-disable-line
    const callBody = JSON.parse(fetch.mock.calls[0][1].body);
    expect(callBody.stream).toBe(true);
  });

  it("faz fetch sem stream no body quando stream=false", async () => {
    fetch.mockResolvedValue(mockJsonResponse({ choices: [] }));
    await callApi([], [], false);
    const callBody = JSON.parse(fetch.mock.calls[0][1].body);
    expect(callBody.stream).toBe(false);
  });
});

describe("callApiStream SSE parser", () => {
  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = FAKE_KEY;
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("parseia linhas SSE e yield objetos", async () => {
    const sse = 'data: {"foo":"bar"}\n\ndata: {"baz":42}\n\n';
    fetch.mockResolvedValue(mockStreamResponse([sse]));
    const chunks = [];
    for await (const chunk of callApiStream([], [])) {
      chunks.push(chunk);
    }
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toEqual({ foo: "bar" });
    expect(chunks[1]).toEqual({ baz: 42 });
  });

  it("ignora linhas vazias e não-data", async () => {
    const sse = 'data: {"a":1}\n\n\nevent: ping\ndata: {"b":2}\n\n';
    fetch.mockResolvedValue(mockStreamResponse([sse]));
    const chunks = [];
    for await (const chunk of callApiStream([], [])) {
      chunks.push(chunk);
    }
    expect(chunks).toHaveLength(2);
  });

  it("encerra iterador ao receber [DONE]", async () => {
    const sse = 'data: {"a":1}\n\ndata: [DONE]\n\ndata: {"b":2}\n\n';
    fetch.mockResolvedValue(mockStreamResponse([sse]));
    const chunks = [];
    for await (const chunk of callApiStream([], [])) {
      chunks.push(chunk);
    }
    expect(chunks).toHaveLength(1);
  });

  it("lida com chunks SSE fragmentados", async () => {
    fetch.mockResolvedValue(mockStreamResponse(['data: {"fo', 'o":"bar"}\n\n']));
    const chunks = [];
    for await (const chunk of callApiStream([], [])) {
      chunks.push(chunk);
    }
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toEqual({ foo: "bar" });
  });

  it("lança erro de rede", async () => {
    fetch.mockRejectedValue(new Error("network failure"));
    const iterator = callApiStream([], []);
    await expect(iterator.next()).rejects.toThrow("network failure");
  });

  it("lança erro quando resposta não é ok", async () => {
    fetch.mockResolvedValue(mockErrorResponse(500, "Internal Error"));
    const iterator = callApiStream([], []);
    await expect(iterator.next()).rejects.toThrow(/OpenRouter 500/);
  });
});

describe("setModel / currentModel", () => {
  let initialModel;

  beforeEach(() => {
    initialModel = currentModel;
    mockSaveConfig.mockClear();
  });

  afterEach(() => {
    setModel(initialModel);
  });

  it("currentModel tem valor default", () => {
    expect(currentModel).toBe("deepseek/deepseek-v4-flash");
  });

  it("setModel altera currentModel e persiste", () => {
    setModel("novo/modelo");
    expect(currentModel).toBe("novo/modelo");
    expect(mockSaveConfig).toHaveBeenCalledWith({ model: "novo/modelo" });
  });

  it("setModel é redefinido via afterEach", () => {
    expect(currentModel).toBe(initialModel);
  });
});

describe("listModels", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("retorna array de modelos normalizados", async () => {
    const fakeData = {
      data: [
        { id: "openai/gpt-4", name: "GPT-4", context_length: 8192 },
        { id: "anthropic/claude-3", name: "Claude 3", context_length: null },
      ],
    };
    fetch.mockResolvedValue(mockJsonResponse(fakeData));
    const models = await listModels();
    expect(models).toEqual([
      { id: "openai/gpt-4", name: "GPT-4", context: 8192 },
      { id: "anthropic/claude-3", name: "Claude 3", context: null },
    ]);
  });

  it("usa name fallback para id quando name ausente", async () => {
    const fakeData = {
      data: [
        { id: "some/model", context_length: 4096 },
      ],
    };
    fetch.mockResolvedValue(mockJsonResponse(fakeData));
    const models = await listModels();
    expect(models[0]).toEqual({ id: "some/model", name: "some/model", context: 4096 });
  });

  it("lança erro em resposta não-ok", async () => {
    fetch.mockResolvedValue(mockErrorResponse(403, "Forbidden"));
    await expect(listModels()).rejects.toThrow(/OpenRouter 403/);
  });

  it("lança erro de rede", async () => {
    fetch.mockRejectedValue(new Error("network failure"));
    await expect(listModels()).rejects.toThrow("network failure");
  });

  it("faz GET para /api/v1/models", async () => {
    fetch.mockResolvedValue(mockJsonResponse({ data: [] }));
    await listModels();
    expect(fetch).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/models",
      expect.objectContaining({}),
    );
  });
});

describe("setApiKey / getApiKey", () => {
  beforeEach(() => {
    delete process.env.OPENROUTER_API_KEY;
    mockSaveConfig.mockClear();
  });

  afterEach(() => {
    delete process.env.OPENROUTER_API_KEY;
  });

  it("getApiKey retorna undefined se nenhuma chave configurada", () => {
    expect(getApiKey()).toBeUndefined();
  });

  it("setApiKey persiste chave e define defaults", () => {
    setApiKey("sk-or-v1-test-key");
    expect(currentModel).toBe("deepseek/deepseek-v4-flash");
    expect(currentReasoningEffort).toBe("medium");
    expect(mockSaveConfig).toHaveBeenCalledWith({
      apiKey: "sk-or-v1-test-key",
      model: "deepseek/deepseek-v4-flash",
      reasoningEffort: "medium",
    });
    expect(getApiKey()).toBe("sk-or-v1-test-key");
  });

  it("getApiKey prioriza process.env sobre config", () => {
    setApiKey("sk-or-v1-config-key");
    process.env.OPENROUTER_API_KEY = "sk-or-v1-env-key";
    expect(getApiKey()).toBe("sk-or-v1-env-key");
  });
});
