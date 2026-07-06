import { describe, it, expect } from "vitest";
import { reduceDelta, createStreamReducer } from "../src/streamReduce.js";

function freshAcc() {
  return { role: "assistant", content: "", reasoning: "", tool_calls: [], finish_reason: null };
}

describe("reduceDelta", () => {
  it("acumula content", () => {
    const acc = freshAcc();
    reduceDelta(acc, { content: "Hello" });
    reduceDelta(acc, { content: " world" });
    expect(acc.content).toBe("Hello world");
  });

  it("acumula reasoning", () => {
    const acc = freshAcc();
    reduceDelta(acc, { reasoning: "Let me think" });
    reduceDelta(acc, { reasoning: " about this" });
    expect(acc.reasoning).toBe("Let me think about this");
  });

  it("monta tool_call completa com deltas parciais", () => {
    const acc = freshAcc();
    reduceDelta(acc, { tool_calls: [{ index: 0, id: "call_1", function: { name: "read", arguments: "" } }] });
    reduceDelta(acc, { tool_calls: [{ index: 0, function: { arguments: '{"path":"' } }] });
    reduceDelta(acc, { tool_calls: [{ index: 0, function: { arguments: 'a.txt"}' } }] });
    expect(acc.tool_calls[0].id).toBe("call_1");
    expect(acc.tool_calls[0].function.name).toBe("read");
    expect(acc.tool_calls[0].function.arguments).toBe('{"path":"a.txt"}');
  });

  it("acumula content, reasoning e tool_calls simultaneamente", () => {
    const acc = freshAcc();
    reduceDelta(acc, { content: "Thinking", reasoning: "hmm" });
    reduceDelta(acc, { tool_calls: [{ index: 0, id: "c1", function: { name: "read_file", arguments: "{}" } }] });
    expect(acc.content).toBe("Thinking");
    expect(acc.reasoning).toBe("hmm");
    expect(acc.tool_calls[0].function.name).toBe("read_file");
  });


});

describe("createStreamReducer", () => {
  it("getFinalMessage retorna mensagem completa", () => {
    const r = createStreamReducer();
    r.next({ content: "Hello" });
    r.next({ reasoning: "think" });
    const msg = r.getFinalMessage();
    expect(msg.role).toBe("assistant");
    expect(msg.content).toBe("Hello");
    expect(msg.tool_calls).toBeUndefined();
  });

  it("getFinalMessage retorna tool_calls quando presentes", () => {
    const r = createStreamReducer();
    r.next({ tool_calls: [{ index: 0, id: "tc1", function: { name: "read_file", arguments: '{"p":"a"}' } }] });
    const msg = r.getFinalMessage();
    expect(msg.tool_calls).toHaveLength(1);
    expect(msg.tool_calls[0].function.name).toBe("read_file");
    expect(msg.content).toBeNull();
  });
});
