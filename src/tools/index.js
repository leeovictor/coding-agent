import * as readFile from "./readFile.js";
import * as writeFile from "./writeFile.js";
import * as runBash from "./runBash.js";
import * as editFile from "./edit.js";
import * as patchFile from "./patch.js";
import * as grep from "./grep.js";
import * as glob from "./glob.js";
import * as todos from "./todos.js";
import * as question from "./questions.js";
import { getToolNamesForAgent } from "../agents.js";

export const toolRegistry = {
  read_file: { schema: readFile.schema, execute: readFile.execute, sensitive: readFile.sensitive, summarize: readFile.summarize },
  write_file: { schema: writeFile.schema, execute: writeFile.execute, sensitive: writeFile.sensitive, summarize: writeFile.summarize, shouldConfirm: writeFile.shouldConfirm },
  run_bash: { schema: runBash.schema, execute: runBash.execute, sensitive: runBash.sensitive, summarize: runBash.summarize, shouldConfirm: runBash.shouldConfirm },
  edit_file: { schema: editFile.schema, execute: editFile.execute, sensitive: editFile.sensitive, summarize: editFile.summarize, shouldConfirm: editFile.shouldConfirm },
  patch_file: { schema: patchFile.schema, execute: patchFile.execute, sensitive: patchFile.sensitive, summarize: patchFile.summarize, shouldConfirm: patchFile.shouldConfirm },
  grep: { schema: grep.schema, execute: grep.execute, sensitive: grep.sensitive, summarize: grep.summarize },
  glob: { schema: glob.schema, execute: glob.execute, sensitive: glob.sensitive, summarize: glob.summarize },
  todos: { schema: todos.schema, execute: todos.execute, sensitive: todos.sensitive, summarize: todos.summarize },
  question: { schema: question.schema, execute: question.execute, sensitive: question.sensitive, summarize: question.summarize },
};

/**
 * Retorna o array de schemas no formato OpenAI para enviar na requisição.
 * @returns {object[]}
 */
export function getToolSchema(agentName) {
  if (agentName) {
    const allowed = getToolNamesForAgent(agentName);
    if (allowed !== null) {
      return allowed.map((name) => toolRegistry[name]?.schema).filter(Boolean);
    }
  }
  return Object.values(toolRegistry).map((t) => t.schema);
}

/**
 * Executa uma tool pelo nome.
 * @param {string} name
 * @param {object} args
 * @returns {string} resultado (sempre string, nunca lança)
 */
export async function executeTool(name, args) {
  const tool = toolRegistry[name];
  if (!tool) return `ERRO: tool '${name}' não existe.`;
  try {
    return await tool.execute(args ?? {});
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
