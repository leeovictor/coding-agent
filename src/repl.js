import { createInterface } from "node:readline";
import { runAgent, SYSTEM_PROMPT } from "./agent.js";
import { createLogger } from "./logger.js";
import { createConsoleEventHandler, formatConfirmation } from "./format.js";
import { createConfirm } from "./confirm.js";
import { getToolSchema, executeTool } from "./tools/index.js";
import { callApi, currentModel, currentReasoningEffort } from "./openrouter.js";
import { selectModel } from "./commands/models.js";
import { selectEffort } from "./commands/effort.js";
import { promptApiKey } from "./commands/apikey.js";
import { selectAgent, listAndShowAgents } from "./commands/agent.js";
import { ensureApiKey } from "./ensureKey.js";
import { getCurrentAgent, getCurrentAgentName, switchAgent, listAgents, agentColor, buildHelpText } from "./agents.js";

const CLOSED = Symbol("closed");

function makeQuestion(rl) {
  return (query) => Promise.race([
    new Promise((resolve) => rl.question(query, resolve)),
    new Promise((resolve) => rl.once("close", () => resolve(CLOSED))),
  ]);
}

const COMMANDS = ["/exit", "/new", "/help", "/models", "/effort", "/api-key", "/agent", "/agents"];

function completer(line) {
  if (line.startsWith("/agent ")) {
    const partial = line.slice(7);
    const agentNames = listAgents().map((a) => a.name);
    const hits = agentNames.filter((n) => n.startsWith(partial));
    return [hits.length ? hits.map((n) => `/agent ${n}`) : [], line];
  }
  if (!line.startsWith("/")) {
    const hits = COMMANDS.filter((c) => c.startsWith(line));
    return [hits.length ? hits : COMMANDS, line];
  }
  const hits = COMMANDS.filter((c) => c.startsWith(line));
  return [hits.length ? hits : COMMANDS, line];
}

function createRl() {
  return createInterface({ input: process.stdin, output: process.stdout, completer });
}

function closeRl(rl) {
  rl?.close();
}

function agentPrompt() {
  const name = getCurrentAgentName();
  return `${agentColor(name)}${name}>\x1b[0m `;
}

export async function runRepl() {
  try {
    await ensureApiKey();
  } catch (e) {
    console.error(e.message);
    return;
  }

  const logger = createLogger("logs");
  let messages = [{ role: "system", content: SYSTEM_PROMPT }];
  let rl = createRl();
  let question = makeQuestion(rl);

  const confirm = createConfirm({
    formatConfirmation,
    input: () => makeQuestion(rl)("> "),
  });

  console.log(`Modelo: ${currentModel}`);
  if (currentReasoningEffort) console.log(`Reasoning effort: ${currentReasoningEffort}`);
  console.log(`Logs: ${logger.filePath}\n`);
  console.log(`Modo REPL. Digite /help para comandos.\n`);

  while (true) {
    const line = await question(agentPrompt());
    if (line === CLOSED) break;
    const trimmed = line.trim();

    if (trimmed === "/exit") break;

    if (trimmed === "/new") {
      console.clear();
      messages = [{ role: "system", content: SYSTEM_PROMPT }];
      continue;
    }

    if (trimmed === "/help") {
      console.log("Comandos: /exit, /new, /help, /models, /effort, /api-key, /agent <nome>, /agents");
      console.log(buildHelpText());
      continue;
    }

    if (trimmed.startsWith("/agent ")) {
      const name = trimmed.slice(7).trim();
      const agent = switchAgent(name);
      if (agent.name === name) {
        console.log(`Agente alterado para: ${agent.name}`);
      } else {
        console.log(`Agente '${name}' n\u00e3o encontrado. Mantendo ${getCurrentAgentName()}.`);
      }
      continue;
    }

    if (trimmed === "/agent") {
      closeRl(rl);
      try {
        const selected = await selectAgent();
        switchAgent(selected);
        console.log(`\nAgente alterado para: ${selected}\n`);
      } catch (e) {
        if (e.message !== "User force closed the prompt" && !e.message?.includes("canceled")) {
          console.error(`\nErro ao selecionar agente: ${e.message}\n`);
        }
      }
      rl = createRl();
      question = makeQuestion(rl);
      continue;
    }

    if (trimmed === "/agents") {
      listAndShowAgents();
      continue;
    }

    if (trimmed === "/effort") {
      closeRl(rl);
      try {
        const selected = await selectEffort();
        console.log(`\nReasoning effort alterado para: ${selected || "nenhum"}\n`);
      } catch (e) {
        if (e.message !== "User force closed the prompt" && !e.message?.includes("canceled")) {
          console.error(`\nErro ao alterar effort: ${e.message}\n`);
        }
      }
      rl = createRl();
      question = makeQuestion(rl);
      continue;
    }

    if (trimmed === "/models") {
      closeRl(rl);
      try {
        const selected = await selectModel();
        console.log(`\nModelo alterado para: ${selected}\n`);
      } catch (e) {
        if (e.message !== "User force closed the prompt" && !e.message?.includes("canceled")) {
          console.error(`\nErro ao listar modelos: ${e.message}\n`);
        }
      }
      rl = createRl();
      question = makeQuestion(rl);
      continue;
    }

    if (trimmed === "/api-key") {
      closeRl(rl);
      try {
        const key = await promptApiKey();
        if (key) {
          console.log(`\nAPI Key configurada: ${key.slice(0, 12)}...${key.slice(-4)}\n`);
        }
      } catch (e) {
        if (e.message !== "User force closed the prompt" && !e.message?.includes("canceled")) {
          console.error(`\nErro ao configurar API Key: ${e.message}\n`);
        }
      }
      rl = createRl();
      question = makeQuestion(rl);
      continue;
    }

    if (!trimmed) continue;

    messages.push({ role: "user", content: trimmed });
    const consoleHandler = createConsoleEventHandler({ stdin: process.stdin });

    try {
      const result = await runAgent({
        messages,
        tools: getToolSchema(getCurrentAgentName()),
        callApi,
        executeTool,
        confirm,
        stream: true,
        agent: getCurrentAgent(),
        onEvent: (event, data) => {
          consoleHandler(event, data);
          if (event !== "token") logger.logEvent(event, data);
        },
      });
      messages = result.messages;
    } catch (e) {
      console.error(`\nErro: ${e.message}`);
    } finally {
      consoleHandler.dispose?.();
    }
  }

  console.log("\nAté mais!");
  closeRl(rl);
}
