import { loadEnv } from "./env.js";

const env = loadEnv();

export let currentModel =
  env.OPENROUTER_MODEL || process.env.OPENROUTER_MODEL || "anthropic/claude-sonnet-4.5";

export function setModel(model) {
  currentModel = model;
}

export let currentReasoningEffort =
  env.OPENROUTER_REASONING_EFFORT || null;

export function setReasoningEffort(effort) {
  currentReasoningEffort = effort || null;
}

export function getApiKey() {
  return process.env.OPENROUTER_API_KEY || env.OPENROUTER_API_KEY;
}

const CHAT_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const MODELS_ENDPOINT = "https://openrouter.ai/api/v1/models";

function buildBody(messages, tools, stream) {
  const body = {
    model: currentModel,
    messages,
    stream,
  };
  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = "auto";
  }
  if (currentReasoningEffort) {
    body.reasoning = { effort: currentReasoningEffort };
  }
  return body;
}

function buildHeaders(apiKey) {
  return {
    "Authorization": `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": "https://localhost",
    "X-Title": "cli-agent-study",
  };
}

async function doFetch(body, apiKey) {
  const res = await fetch(CHAT_ENDPOINT, {
    method: "POST",
    headers: buildHeaders(apiKey),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenRouter ${res.status}: ${text}`);
  }
  return res;
}

export async function listModels() {
  const apiKey = getApiKey();
  const headers = { "Content-Type": "application/json" };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }
  const res = await fetch(MODELS_ENDPOINT, { headers });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenRouter ${res.status}: ${text}`);
  }
  const json = await res.json();
  return json.data.map((m) => ({
    id: m.id,
    name: m.name || m.id,
    context: m.context_length || null,
  }));
}

export async function* callApiStream(messages, tools) {
  const API_KEY = getApiKey();
  if (!API_KEY) throw new Error("OPENROUTER_API_KEY não configurada.");

  const body = buildBody(messages, tools, true);
  const res = await doFetch(body, API_KEY);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (!trimmed.startsWith("data: ")) continue;
      const payload = trimmed.slice(6);
      if (payload === "[DONE]") return;
      try {
        yield JSON.parse(payload);
      } catch {
        // skip malformed lines
      }
    }
  }
}

export async function callApi(messages, tools, stream = false) {
  const API_KEY = getApiKey();
  if (!API_KEY) throw new Error("OPENROUTER_API_KEY não configurada.");

  if (stream) {
    return { [Symbol.asyncIterator]() { return callApiStream(messages, tools); } };
  }

  const body = buildBody(messages, tools, false);
  const res = await doFetch(body, API_KEY);
  return res.json();
}
