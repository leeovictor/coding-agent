import { runAgent } from "./agent.js";
import { createLogger } from "./logger.js";
import { createConsoleEventHandler } from "./format.js";
import { createConfirm } from "./confirm.js";
import { formatConfirmation } from "./format.js";
import { getToolSchema, executeTool } from "./tools/index.js";
import { callApi, OPENROUTER_MODEL } from "./openrouter.js";
import { loadEnv } from "./env.js";

const env = loadEnv();
const maxIterations = parseInt(
  env.OPENROUTER_MAX_ITERATIONS || process.env.OPENROUTER_MAX_ITERATIONS || "20",
  10
);

const task = process.argv[2];
if (!task) {
  console.error("Uso: node src/cli.js <tarefa>");
  process.exit(1);
}

const logger = createLogger("logs");
const consoleHandler = createConsoleEventHandler();
const confirm = createConfirm({ formatConfirmation });

console.log(`Modelo: ${OPENROUTER_MODEL}`);
console.log(`Máx. iterações: ${maxIterations}`);
console.log(`Logs: ${logger.filePath}\n`);

try {
  const result = await runAgent({
    task,
    tools: getToolSchema(),
    callApi,
    executeTool,
    confirm,
    maxIterations,
    onEvent: (event, data) => {
      consoleHandler(event, data);
      logger.logEvent(event, data);
    },
  });

  console.log(`\nConcluído em ${result.iterations} iteração(ões). Motivo: ${result.reason}`);
  console.log(`Logs completos em: ${logger.filePath}`);
} catch (e) {
  console.error("\nErro fatal:", e.message);
  logger.logEvent("fatal_error", { message: e.message, stack: e.stack });
  process.exit(1);
}

process.exit(0);
