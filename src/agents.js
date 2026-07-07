import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const AGENTS_DIR = join(homedir(), ".dux", "agents");

const ANSI_COLORS = {
  blue: "\x1b[34m",
  orange: "\x1b[38;5;208m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  yellow: "\x1b[33m",
  white: "\x1b[37m",
};

const DEFAULT_AGENTS = {
  build: {
    name: "build",
    description: "Build agent (all tools)",
    color: "blue",
    allowedTools: "all",
    systemReminder: "You are a build agent. Execute software engineering tasks.\n\n- Break work into steps, track with todos\n- Read files before editing — never guess\n- Make small, verifiable changes\n- Match existing code patterns and conventions\n- After finishing, stop. Do not explain what you did unless asked.",
  },
  plan: {
    name: "plan",
    description: "Plan agent (read-only tools)",
    color: "orange",
    allowedTools: ["read_file", "grep", "glob", "todos", "question"],
    systemReminder: "You are in PLANNING mode. Your goal is to understand the problem, research the codebase, and produce a clear plan BEFORE any code is written.\n\nWhat you SHOULD do:\n- Think deeply about the user's problem and what they are really asking\n- Explore the codebase thoroughly using read_file, grep, and glob to find relevant files, patterns, and dependencies\n- Trace code paths, understand architecture, and identify root causes\n- Ask clarifying questions via question when you need more context\n- Present your findings and a concrete, step-by-step plan of action\n\nWhat you CANNOT do:\n- edit_file, write_file, patch_file, or run_bash\n- Make ANY changes to files\n- Execute commands\n\nWhen you have a complete understanding and a plan, present it clearly to the user. The user will then decide whether to proceed with implementation using the build agent.",
  },
};

let agents = { ...DEFAULT_AGENTS };
let currentName = "build";

function ensureAgentsDir() {
  if (!existsSync(AGENTS_DIR)) {
    mkdirSync(AGENTS_DIR, { recursive: true, mode: 0o700 });
  }
}

function loadCustomAgents() {
  ensureAgentsDir();
  const newAgents = { ...DEFAULT_AGENTS };
  try {
    const files = readdirSync(AGENTS_DIR).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      try {
        const raw = readFileSync(join(AGENTS_DIR, file), "utf8");
        const def = JSON.parse(raw);
        if (def.name && def.systemReminder) {
          newAgents[def.name] = {
            name: def.name,
            description: def.description || "",
            color: def.color || "white",
            allowedTools: def.allowedTools || "all",
            systemReminder: def.systemReminder,
          };
        }
      } catch {}
    }
  } catch {}
  agents = newAgents;
}

loadCustomAgents();

export function getCurrentAgent() {
  return agents[currentName] || DEFAULT_AGENTS.build;
}

export function getCurrentAgentName() {
  return currentName;
}

export function switchAgent(name) {
  if (agents[name]) {
    currentName = name;
  } else {
    currentName = "build";
  }
  return getCurrentAgent();
}

export function cycleAgent() {
  const names = Object.keys(agents);
  const idx = names.indexOf(currentName);
  const nextIdx = (idx + 1) % names.length;
  currentName = names[nextIdx];
  return getCurrentAgent();
}

export function listAgents() {
  return Object.values(agents).map((a) => ({
    name: a.name,
    description: a.description,
    color: a.color,
    allowedTools: a.allowedTools,
  }));
}

export function getToolNamesForAgent(name) {
  const agent = agents[name];
  if (!agent || agent.allowedTools === "all") return null;
  return [...agent.allowedTools];
}

export function agentColor(name) {
  const agent = agents[name || currentName];
  if (!agent) return "\x1b[0m";
  const color = ANSI_COLORS[agent.color];
  return color || "\x1b[0m";
}

export function buildHelpText() {
  const names = Object.keys(agents);
  let text = "Agentes disponíveis:\n";
  for (const name of names) {
    const a = agents[name];
    const marker = name === currentName ? " (ativo)" : "";
    text += `  ${name}${marker} - ${a.description}\n`;
  }
  text += "\nComandos de agente:\n";
  text += "  /agent <nome>  — trocar para um agente\n";
  text += "  /agents        — listar agentes disponíveis";
  return text;
}
