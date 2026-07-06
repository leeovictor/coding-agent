export function extractToolCalls(message) {
  if (!message || !Array.isArray(message.tool_calls) || message.tool_calls.length === 0) {
    return [];
  }
  return message.tool_calls.map((tc) => ({
    id: tc.id,
    name: tc.function?.name ?? "",
    arguments: tc.function?.arguments ?? "",
  }));
}

export function extractContent(message) {
  if (!message) return null;
  const c = message.content;
  if (c === null || c === undefined || c === "") return null;
  return typeof c === "string" ? c : JSON.stringify(c);
}

export function parseToolArgs(rawArgs) {
  if (!rawArgs) return { args: {}, error: null };
  try {
    const parsed = JSON.parse(rawArgs);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return { args: {}, error: `argumentos n\u00e3o s\u00e3o um objeto JSON: ${rawArgs}` };
    }
    return { args: parsed, error: null };
  } catch (e) {
    return { args: {}, error: `argumentos inv\u00e1lidos: ${e.message}` };
  }
}

export function buildToolResultMessage(toolCallId, content) {
  return {
    role: "tool",
    tool_call_id: toolCallId,
    content: String(content),
  };
}
