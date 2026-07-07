import { readFileSync, writeFileSync } from "node:fs";
import { isPathWithinCwd } from "../permissions.js";

export const schema = {
  type: "function",
  function: {
    name: "edit_file",
    description:
      "Substitui um trecho exato de texto em um arquivo existente. " +
      "Se o texto aparecer mais de uma vez e replaceAll não for true, retorna erro. " +
      "Use esta ferramenta para edições pontuais em vez de reescrever o arquivo inteiro.",
    parameters: {
      type: "object",
      properties: {
        filePath: { type: "string", description: "Caminho absoluto do arquivo a ser modificado." },
        oldString: { type: "string", description: "Trecho exato a ser substituído (deve bater literalmente, incluindo indentação e espaços)." },
        newString: { type: "string", description: "Novo texto que substituirá oldString." },
        replaceAll: { type: "boolean", description: "Se true, substitui TODAS as ocorrências de oldString. Default: false (apenas a primeira)." },
      },
      required: ["filePath", "oldString", "newString"],
    },
  },
};

export const sensitive = true;

export const shouldConfirm = (args) => !isPathWithinCwd(args?.filePath);

export function summarize(args) {
  return args.filePath;
}

export function execute({ filePath, oldString, newString, replaceAll }) {
  if (!filePath) return "ERRO: parâmetro 'filePath' é obrigatório.";
  if (oldString === undefined || oldString === null) return "ERRO: parâmetro 'oldString' é obrigatório.";
  if (newString === undefined || newString === null) return "ERRO: parâmetro 'newString' é obrigatório.";

  if (oldString === "") return "ERRO: 'oldString' não pode ser vazio.";

  try {
    const original = readFileSync(filePath, "utf8");

    const count = (original.match(new RegExp(oldString.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;

    if (count === 0) {
      return `ERRO: texto não encontrado em '${filePath}'. Verifique o conteúdo exato (indentação, espaços, quebras de linha).`;
    }

    if (count > 1 && !replaceAll) {
      return `ERRO: '${oldString}' encontrado ${count} vezes em '${filePath}'. Use replaceAll:true para substituir todas ou refine oldString com mais contexto para torná-lo único.`;
    }

    const escaped = oldString.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(escaped, replaceAll ? "g" : "");
    const modified = original.replace(pattern, newString);

    const oldBytes = Buffer.byteLength(original, "utf8");
    const newBytes = Buffer.byteLength(modified, "utf8");
    const diff = newBytes - oldBytes;

    writeFileSync(filePath, modified, "utf8");
    const plural = count === 1 ? "substituição" : "substituições";
    return `OK: arquivo '${filePath}' editado (${count} ${plural}, ${diff >= 0 ? "+" : ""}${diff} bytes).`;
  } catch (e) {
    if (e.code === "ENOENT") {
      return `ERRO: arquivo '${filePath}' não encontrado.`;
    }
    return `ERRO ao editar '${filePath}': ${e.message}`;
  }
}
