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
  const abortCtrl = new AbortController();
  const consoleHandler = createConsoleEventHandler({
    stdin: process.stdin,
    onCancel: () => abortCtrl.abort(),
  });
  const confirm = createConfirm({ formatConfirmation, consoleHandler });

  const cleanup = () => {
    consoleHandler.dispose?.();
  };

  process.on("SIGINT", () => {
    abortCtrl.abort();
  });

  console.log(`Modelo: ${currentModel}`);
  if (currentReasoningEffort) console.log(`Reasoning effort: ${currentReasoningEffort}`);
  console.log(`Logs: ${logger.filePath}\n`);

  try {
    const result = await runAgent({
      task,
      tools: getToolSchema(),
      callApi,
        executeTool: (name, args) => executeTool(name, args, undefined, { consoleHandler }),
      confirm,
      stream: true,
      signal: abortCtrl.signal,
      onEvent: (event, data) => {
        consoleHandler(event, data);
        if (event !== "token") logger.logEvent(event, data);
      },
    });

    if (result.reason === "cancelado") {
      console.log("\nInterrompido.");
    } else {
      console.log(`\nConclu\u00eddo em ${result.iterations} itera\u00e7\u00e3o(\u00f5es). Motivo: ${result.reason}`);
    }
    console.log(`Logs completos em: ${logger.filePath}`);
  } catch (e) {
    if (e.name === "AbortError" && abortCtrl.signal.aborted) {
      console.log("\nInterrompido.");
    } else {
      console.error("\nErro fatal:", e.message);
      logger.logEvent("fatal_error", { message: e.message, stack: e.stack });
      process.exit(1);
    }
  } finally {
    cleanup();
  }

  process.exit(0);
} else {
  (async () => {
    try {
      const { runRepl } = await import("./repl.js");
      await runRepl();
      process.exit(0);
    } catch (e) {
      console.error(e.message);
      process.exit(1);
    }
  })();
}
