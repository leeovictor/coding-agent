import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const MAX_BYTES = 50_000;

export const schema = {
  type: "function",
  function: {
    name: "read_file",
    description: "Lê o conteúdo de um arquivo de texto. Use offset e limit para ler intervalos específicos de linhas.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Caminho do arquivo (relativo ou absoluto)." },
        offset: { type: "integer", description: "Número da linha inicial (1-indexed). Se omitido, começa da linha 1." },
        limit: { type: "integer", description: "Número máximo de linhas a retornar. Se omitido, retorna todas as linhas a partir do offset." },
      },
      required: ["path"],
    },
  },
};

export const sensitive = false;

export function summarize(args) {
  let s = args.path;
  if (args.offset != null || args.limit != null) {
    const start = args.offset ?? 1;
    const end = args.limit != null ? start + args.limit - 1 : "\u2026";
    s += ` [L${start}-L${end}]`;
  }
  return s;
}

/**
 * @param {{path: string, offset?: number, limit?: number}} args
 * @returns {string} conteúdo formatado com tags ou mensagem de erro
 */
export function execute({ path, offset, limit }) {
  if (!path) return "ERRO: parâmetro 'path' é obrigatório.";
  try {
    const absPath = resolve(path);
    const buf = readFileSync(absPath);
    let text;
    let truncated = false;

    if (buf.length > MAX_BYTES && offset == null && limit == null) {
      text = buf.subarray(0, MAX_BYTES).toString("utf8");
      truncated = true;
    } else {
      text = buf.toString("utf8");
    }

    if (text.length === 0) {
      return `<path>${absPath}</path>\n<type>file</type>\n<content>\n(File is empty)\n</content>`;
    }

    const allLines = text.split("\n");
    const totalLines = allLines.length;
    let startLine = 1;
    let lines = allLines;

    if (offset != null) {
      const fromLine = Math.max(1, offset);
      startLine = fromLine;
      lines = allLines.slice(fromLine - 1);
    }

    if (limit != null) {
      lines = lines.slice(0, limit);
    }

    const endLine = startLine + lines.length - 1;

    if (lines.length === 0) {
      return `<path>${absPath}</path>\n<type>file</type>\n<content>\n(Lines ${startLine}-${endLine} of ${totalLines} total)\n</content>`;
    }

    const numbered = lines.map((l, i) => `${startLine + i}: ${l}`).join("\n");

    let footer;
    if (truncated) {
      footer = `\n\n... [truncado: arquivo tem ${buf.length} bytes, mostrando os primeiros ${MAX_BYTES}]`;
    } else if (startLine > 1 || limit != null) {
      footer = `\n\n(Lines ${startLine}-${endLine} of ${totalLines} total)`;
    } else {
      footer = `\n(End of file - total ${totalLines} lines)`;
    }

    return `<path>${absPath}</path>\n<type>file</type>\n<content>\n${numbered}${footer}\n</content>`;
  } catch (e) {
    return `ERRO ao ler '${path}': ${e.message}`;
  }
}
