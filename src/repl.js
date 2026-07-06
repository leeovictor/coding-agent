import { createInterface } from "node:readline";
import { runAgent, SYSTEM_PROMPT } from "./agent.js";
import { createLogger } from "./logger.js";
import { createConsoleEventHandler, formatConfirmation } from "./format.js";
import { createConfirm } from "./confirm.js";
import { getToolSchema, executeTool } from "./tools/index.js";
import { callApi, currentModel } from "./openrouter.js";
import { selectModel } from "./commands/models.js";

function makeQuestion(rl) {
  return (query) => new Promise((resolve) => rl.question(query, resolve));
}

export async function runRepl() {
  const logger = createLogger("logs");
  let messages = [{ role: "system", content: SYSTEM_PROMPT }];
  let rl = createInterface({ input: process.stdin, output: process.stdout });
  let question = makeQuestion(rl);

  const confirm = createConfirm({
    formatConfirmation,
    input: () => makeQuestion(rl)("> "),
  });

  console.log(`Modelo: ${currentModel}`);
  console.log(`Logs: ${logger.filePath}\n`);
  console.log(`Modo REPL. Digite /help para comandos.\n`);

  while (true) {
    const line = await question("\x1b[34magent>\x1b[0m ");
    const trimmed = line.trim();

    if (trimmed === "/exit") break;

    if (trimmed === "/clear") {
      console.clear();
      messages = [{ role: "system", content: SYSTEM_PROMPT }];
      continue;
    }

    if (trimmed === "/help") {
      console.log("Comandos: /exit, /clear, /help, /models");
      continue;
    }

    if (trimmed === "/models") {
      rl.close();
      try {
        const selected = await selectModel();
        console.log(`\nModelo alterado para: ${selected}\n`);
      } catch (e) {
        if (e.message !== "User force closed the prompt" && !e.message?.includes("canceled")) {
          console.error(`\nErro ao listar modelos: ${e.message}\n`);
        }
      }
      rl = createInterface({ input: process.stdin, output: process.stdout });
      question = makeQuestion(rl);
      continue;
    }

    if (!trimmed) continue;

    messages.push({ role: "user", content: trimmed });
    const consoleHandler = createConsoleEventHandler({ stdin: process.stdin });

    try {
      const result = await runAgent({
        messages,
        tools: getToolSchema(),
        callApi,
        executeTool,
        confirm,
        stream: true,
        onEvent: (event, data) => {
          if (!(event === "loop_end" && data?.motivo === "concluido")) {
            consoleHandler(event, data);
          }
          logger.logEvent(event, data);
        },
      });
      messages = result.messages;
    } catch (e) {
      console.error(`\nErro: ${e.message}`);
    } finally {
      consoleHandler.dispose?.();
    }
  }

  rl.close();
}
