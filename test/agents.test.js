import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const AGENTS_DIR = join(homedir(), ".dux", "agents");

describe("agents module", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    try { rmSync(AGENTS_DIR, { recursive: true, force: true }); } catch {}
  });

  it("getCurrentAgent() returns build by default", async () => {
    const { getCurrentAgent, getCurrentAgentName } = await import("../src/agents.js");
    expect(getCurrentAgent().name).toBe("build");
    expect(getCurrentAgentName()).toBe("build");
  });

  it("switchAgent('plan') returns plan agent", async () => {
    const { switchAgent, getCurrentAgentName } = await import("../src/agents.js");
    const agent = switchAgent("plan");
    expect(agent.name).toBe("plan");
    expect(agent.color).toBe("orange");
    expect(agent.allowedTools).toEqual(["read_file", "grep", "glob", "todos", "question"]);
    expect(getCurrentAgentName()).toBe("plan");
  });

  it("cycleAgent() alternates to plan and then back to build", async () => {
    const { cycleAgent, getCurrentAgentName } = await import("../src/agents.js");
    expect(getCurrentAgentName()).toBe("build");
    const plan = cycleAgent();
    expect(plan.name).toBe("plan");
    expect(getCurrentAgentName()).toBe("plan");
    const build = cycleAgent();
    expect(build.name).toBe("build");
    expect(getCurrentAgentName()).toBe("build");
  });

  it("getToolNamesForAgent('build') returns null", async () => {
    const { getToolNamesForAgent } = await import("../src/agents.js");
    expect(getToolNamesForAgent("build")).toBeNull();
  });

  it("getToolNamesForAgent('plan') returns array with 5 read-only tools", async () => {
    const { getToolNamesForAgent } = await import("../src/agents.js");
    const tools = getToolNamesForAgent("plan");
    expect(Array.isArray(tools)).toBe(true);
    expect(tools).toHaveLength(5);
    expect(tools).toContain("read_file");
    expect(tools).toContain("grep");
    expect(tools).toContain("glob");
    expect(tools).toContain("todos");
    expect(tools).toContain("question");
  });

  it("listAgents() includes build and plan", async () => {
    const { listAgents } = await import("../src/agents.js");
    const agents = listAgents();
    expect(agents).toHaveLength(2);
    const names = agents.map((a) => a.name);
    expect(names).toContain("build");
    expect(names).toContain("plan");
  });

  it("agentColor('build') returns blue ANSI code", async () => {
    const { agentColor } = await import("../src/agents.js");
    expect(agentColor("build")).toBe("\x1b[34m");
  });

  it("agentColor('plan') returns orange ANSI code", async () => {
    const { agentColor } = await import("../src/agents.js");
    expect(agentColor("plan")).toBe("\x1b[38;5;208m");
  });

  it("loads custom agent from ~/.dux/agents/*.json", async () => {
    mkdirSync(AGENTS_DIR, { recursive: true });
    writeFileSync(join(AGENTS_DIR, "reviewer.json"), JSON.stringify({
      name: "reviewer",
      description: "Code reviewer",
      color: "green",
      allowedTools: ["read_file", "grep", "glob"],
      systemReminder: "You are a code reviewer.",
    }));
    const { getCurrentAgent, switchAgent, listAgents, getToolNamesForAgent, agentColor } = await import("../src/agents.js");
    const agents = listAgents();
    expect(agents).toHaveLength(3);
    expect(agents.find((a) => a.name === "reviewer")).toBeTruthy();
    const reviewer = switchAgent("reviewer");
    expect(reviewer.name).toBe("reviewer");
    expect(reviewer.systemReminder).toBe("You are a code reviewer.");
    expect(getToolNamesForAgent("reviewer")).toEqual(["read_file", "grep", "glob"]);
    expect(agentColor("reviewer")).toBe("\x1b[32m");
  });

  it("invalid JSON file is ignored without crash", async () => {
    mkdirSync(AGENTS_DIR, { recursive: true });
    writeFileSync(join(AGENTS_DIR, "broken.json"), "{not valid json}");
    const { listAgents } = await import("../src/agents.js");
    const agents = listAgents();
    expect(agents).toHaveLength(2);
    expect(agents.find((a) => a.name === "broken")).toBeFalsy();
  });

  it("switchAgent('nonexistent') returns build as fallback", async () => {
    const { switchAgent, getCurrentAgentName } = await import("../src/agents.js");
    switchAgent("plan");
    expect(getCurrentAgentName()).toBe("plan");
    const agent = switchAgent("nonexistent");
    expect(agent.name).toBe("build");
    expect(getCurrentAgentName()).toBe("build");
  });
});
