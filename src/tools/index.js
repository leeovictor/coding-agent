import * as readFile from "./readFile.js";
import * as writeFile from "./writeFile.js";
import * as runBash from "./runBash.js";

export const toolRegistry = {
  read_file: { schema: readFile.schema, execute: readFile.execute, sensitive: readFile.sensitive },
  write_file: { schema: writeFile.schema, execute: writeFile.execute, sensitive: writeFile.sensitive },
  run_bash: { schema: runBash.schema, execute: runBash.execute, sensitive: runBash.sensitive },
};

/**
 * Retorna o array de schemas no formato OpenAI para enviar na requisição.
 * @returns {object[]}
 */
export function getToolSchema() {
  return Object.values(toolRegistry).map((t) => t.schema);
}

/**
 * Executa uma tool pelo nome.
 * @param {string} name
 * @param {object} args
 * @returns {string} resultado (sempre string, nunca lança)
 */
export function executeTool(name, args) {
  const tool = toolRegistry[name];
  if (!tool) return `ERRO: tool '${name}' não existe.`;
  try {
    return tool.execute(args ?? {});
  } catch (e) {
    return `ERRO inesperado em '${name}': ${e.message}`;
  }
}

/**
 * Verifica se uma tool é sensível (pede confirmação).
 * @param {string} name
 * @returns {boolean}
 */
export function isSensitive(name) {
  return Boolean(toolRegistry[name]?.sensitive);
}
