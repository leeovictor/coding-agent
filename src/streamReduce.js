export function reduceDelta(acc, delta) {
  if (delta.content) acc.content += delta.content;
  const reasoningText = delta.reasoning || delta.reasoning_content;
  if (reasoningText) acc.reasoning += reasoningText;
  if (delta.tool_calls) {
    for (const tc of delta.tool_calls) {
      let entry = acc.tool_calls[tc.index];
      if (!entry) {
        entry = { id: "", type: "function", function: { name: "", arguments: "" } };
        acc.tool_calls[tc.index] = entry;
      }
      if (tc.id) entry.id += tc.id;
      if (tc.function?.name) entry.function.name += tc.function.name;
      if (tc.function?.arguments) entry.function.arguments += tc.function.arguments;
    }
  }
  return acc;
}

export function createStreamReducer() {
  const acc = { role: "assistant", content: "", reasoning: "", tool_calls: [], finish_reason: null };
  return {
    acc,
    next(delta) {
      reduceDelta(acc, delta);
    },
    getFinalMessage() {
      const toolCalls = acc.tool_calls
        .filter(Boolean)
        .map((tc) => ({
          id: tc.id,
          type: tc.type,
          function: { name: tc.function.name, arguments: tc.function.arguments },
        }));
      return {
        role: acc.role,
        content: acc.content || null,
        tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      };
    },
  };
}
