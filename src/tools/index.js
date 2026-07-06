import * as readFile from "./readFile.js";
import * as writeFile from "./writeFile.js";
import * as runBash from "./runBash.js";

export const toolRegistry = {
  read_file: { schema: readFile.schema, execute: readFile.execute, sensitive: readFile.sensitive, summarize: readFile.summarize },
  write_file: { schema: writeFile.schema, execute: writeFile.execute, sensitive: writeFile.sensitive, summarize: writeFile.summarize },
  run_bash: { schema: runBash.schema, execute: runBash.execute, sensitive: runBash.sensitive, summarize: runBash.summarize, shouldConfirm: runBash.shouldConfirm },
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

/**
 * Decide se uma tool exige confirmação do usuário para esta invocação específica.
 * Tools não-sensíveis nunca exigem. Tools sensíveis podem ter lógica por-argumento.
 * @param {string} name
 * @param {object} args
 * @returns {boolean}
 */
export function shouldConfirm(name, args) {
  const tool = toolRegistry[name];
  if (!tool?.sensitive) return false;
  if (tool.shouldConfirm) return tool.shouldConfirm(args);
  return true;
}

/**
 * Retorna um sumário compacto dos argumentos de uma tool.
 * @param {string} name
 * @param {object} args
 * @returns {string}
 */
export function summarizeTool(name, args) {
  const tool = toolRegistry[name];
  if (tool?.summarize) {
    const s = tool.summarize(args);
    if (s) return s;
  }
  const firstStr = Object.values(args ?? {}).find(v => typeof v === "string" && v.length <= 60);
  return firstStr ?? JSON.stringify(args);
}
