#!/usr/bin/env node
import { runAgent } from "./agent.js";
import { createLogger } from "./logger.js";
import { createConsoleEventHandler, formatConfirmation } from "./format.js";
import { createConfirm } from "./confirm.js";
import { getToolSchema, executeTool } from "./tools/index.js";
import { callApi, currentModel, currentReasoningEffort, getApiKey } from "./openrouter.js";

const task = process.argv[2];

if (task) {
  if (!getApiKey()) {
    console.error("Nenhuma API Key configurada.");
    console.error("Execute sem argumentos para entrar no modo interativo e configurar via /api-key.");
    console.error("Ou defina OPENROUTER_API_KEY como variável de ambiente.");
    process.exit(1);
  }
  const logger = createLogger("logs");
  const consoleHandler = createConsoleEventHandler({ stdin: process.stdin });
  const confirm = createConfirm({ formatConfirmation });

  const cleanup = () => {
    consoleHandler.dispose?.();
  };

  process.on("SIGINT", () => {
    cleanup();
    console.log("\nInterrompido.");
    process.exit(0);
  });

  console.log(`Modelo: ${currentModel}`);
  if (currentReasoningEffort) console.log(`Reasoning effort: ${currentReasoningEffort}`);
  console.log(`Logs: ${logger.filePath}\n`);

  try {
    const result = await runAgent({
      task,
      tools: getToolSchema(),
      callApi,
      executeTool,
      confirm,
      stream: true,
      onEvent: (event, data) => {
        consoleHandler(event, data);
        logger.logEvent(event, data);
      },
    });

    console.log(`\nConclu\u00eddo em ${result.iterations} itera\u00e7\u00e3o(\u00f5es). Motivo: ${result.reason}`);
    console.log(`Logs completos em: ${logger.filePath}`);
  } catch (e) {
    console.error("\nErro fatal:", e.message);
    logger.logEvent("fatal_error", { message: e.message, stack: e.stack });
    process.exit(1);
  } finally {
    cleanup();
  }

  process.exit(0);
} else {
  const { runRepl } = await import("./repl.js");
  await runRepl();
}
