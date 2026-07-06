import { loadEnv } from "./env.js";

const env = loadEnv();

export const OPENROUTER_MODEL =
  env.OPENROUTER_MODEL || process.env.OPENROUTER_MODEL || "anthropic/claude-sonnet-4.5";

function getApiKey() {
  return env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY;
}

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

export async function callApi(messages, tools) {
  const API_KEY = getApiKey();
  if (!API_KEY) throw new Error("OPENROUTER_API_KEY não configurada.");

  const body = {
    model: OPENROUTER_MODEL,
    messages,
  };
  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = "auto";
  }

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://localhost",
      "X-Title": "cli-agent-study",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenRouter ${res.status}: ${text}`);
  }

  return res.json();
}
