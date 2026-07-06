import { readFileSync } from "node:fs";

const MAX_BYTES = 50_000;

export const schema = {
  type: "function",
  function: {
    name: "read_file",
    description: "Lê o conteúdo de um arquivo de texto.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Caminho do arquivo (relativo ou absoluto)." },
      },
      required: ["path"],
    },
  },
};

export const sensitive = false;

export function summarize(args) {
  return args.path;
}

/**
 * @param {{path: string}} args
 * @returns {string} conteúdo ou mensagem de erro
 */
export function execute({ path }) {
  if (!path) return "ERRO: parâmetro 'path' é obrigatório.";
  try {
    const buf = readFileSync(path);
    if (buf.length > MAX_BYTES) {
      const truncated = buf.subarray(0, MAX_BYTES).toString("utf8");
      return truncated + `\n\n... [truncado: arquivo tem ${buf.length} bytes, mostrando os primeiros ${MAX_BYTES}]`;
    }
    return buf.toString("utf8");
  } catch (e) {
    return `ERRO ao ler '${path}': ${e.message}`;
  }
}
