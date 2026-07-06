import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export const schema = {
  type: "function",
  function: {
    name: "write_file",
    description: "Cria ou sobrescreve um arquivo com o conteúdo fornecido.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Caminho do arquivo." },
        content: { type: "string", description: "Conteúdo a ser escrito." },
      },
      required: ["path", "content"],
    },
  },
};

export const sensitive = true;

export function execute({ path, content }) {
  if (!path) return "ERRO: parâmetro 'path' é obrigatório.";
  if (content === undefined || content === null) return "ERRO: parâmetro 'content' é obrigatório.";
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, String(content), "utf8");
    const bytes = Buffer.byteLength(String(content), "utf8");
    return `OK: arquivo '${path}' escrito (${bytes} bytes).`;
  } catch (e) {
    return `ERRO ao escrever '${path}': ${e.message}`;
  }
}
