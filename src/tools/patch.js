import { readFileSync, writeFileSync } from "node:fs";
import { isPathWithinCwd } from "../permissions.js";

export const schema = {
  type: "function",
  function: {
    name: "patch_file",
    description:
      "Aplica um ou mais hunks de unified diff em um arquivo existente. " +
      "O formato usa cabeçalhos @@ -linha,qtd +linha,qtd @@ para localizar cada mudança. " +
      "Linhas prefixadas com ' ' são contexto, '-' são removidas, '+' são adicionadas.",
    parameters: {
      type: "object",
      properties: {
        filePath: { type: "string", description: "Caminho absoluto do arquivo a ser modificado." },
        hunks: {
          type: "string",
          description:
            "Conteúdo do unified diff. Cada hunk começa com '@@ -linha_orig,qtd_orig +linha_novo,qtd_novo @@'. " +
            "Linhas ' ' = contexto, '-' = remove, '+' = adiciona.",
        },
      },
      required: ["filePath", "hunks"],
    },
  },
};

export const sensitive = true;

export const shouldConfirm = (args) => !isPathWithinCwd(args?.filePath);

export function summarize(args) {
  return args.filePath;
}

const FUZZY_RADIUS = 10;

/**
 * Faz parse de um unified diff string em um array de hunks.
 * Cada hunk: { startLine, lines: [{prefix, content}] }
 */
function parseHunks(hunksStr) {
  const lines = hunksStr.split("\n");
  const hunks = [];
  let current = null;

  for (const line of lines) {
    if (line.startsWith("--- ") || line.startsWith("+++ ")) continue;

    const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)?$/);
    if (hunkMatch) {
      if (current) hunks.push(current);
      current = {
        startLine: parseInt(hunkMatch[1], 10),
        lines: [],
      };
      continue;
    }

    if (current) {
      const prefix = line[0];
      if (prefix === " " || prefix === "-" || prefix === "+") {
        current.lines.push({ prefix, content: line.slice(1) });
      }
    }
  }

  if (current && current.lines.length > 0) {
    hunks.push(current);
  }

  return hunks;
}

/**
 * Tenta encontrar a linha `expected` em `fileLines` a partir de `cursor`
 * dentro de um raio de FUZZY_RADIUS linhas.
 * Retorna o novo cursor ou -1 se não encontrar.
 */
function fuzzyFind(fileLines, cursor, expected) {
  const start = Math.max(0, cursor - FUZZY_RADIUS);
  const end = Math.min(fileLines.length, cursor + FUZZY_RADIUS);
  for (let i = start; i < end; i++) {
    if (fileLines[i] === expected) return i;
  }
  return -1;
}

/**
 * Aplica um hunk no array de linhas do arquivo.
 * Modifica fileLines in-place. Retorna null em caso de sucesso, ou mensagem de erro.
 */
function applyHunk(fileLines, hunk, hunkIndex, offset) {
  let cursor = hunk.startLine - 1 + offset;

  for (const { prefix, content } of hunk.lines) {
    if (prefix === " ") {
      if (cursor >= fileLines.length || fileLines[cursor] !== content) {
        const fuzzyCursor = fuzzyFind(fileLines, cursor, content);
        if (fuzzyCursor === -1) {
          const found = cursor < fileLines.length ? fileLines[cursor] : "(fim do arquivo)";
          return `hunk ${hunkIndex + 1} falhou na linha ${cursor + 1}: esperava '${content}' mas encontrou '${found}'`;
        }
        cursor = fuzzyCursor;
      }
      cursor++;
    } else if (prefix === "-") {
      if (cursor >= fileLines.length || fileLines[cursor] !== content) {
        const fuzzyCursor = fuzzyFind(fileLines, cursor, content);
        if (fuzzyCursor === -1) {
          const found = cursor < fileLines.length ? fileLines[cursor] : "(fim do arquivo)";
          return `hunk ${hunkIndex + 1} falhou na linha ${cursor + 1}: esperava remover '${content}' mas encontrou '${found}'`;
        }
        cursor = fuzzyCursor;
      }
      fileLines.splice(cursor, 1);
    } else if (prefix === "+") {
      fileLines.splice(cursor, 0, content);
      cursor++;
    }
  }

  return null;
}

export function execute({ filePath, hunks }) {
  if (!filePath) return "ERRO: parâmetro 'filePath' é obrigatório.";
  if (hunks === undefined || hunks === null) return "ERRO: parâmetro 'hunks' é obrigatório.";
  if (hunks === "") return "ERRO: 'hunks' não pode ser vazio.";

  try {
    const originalContent = readFileSync(filePath, "utf8");
    const fileLines = originalContent.split("\n");

    const parsedHunks = parseHunks(hunks);
    if (parsedHunks.length === 0) {
      return "ERRO: nenhum hunk válido encontrado no diff. Verifique o formato (@@ -linha,qtd +linha,qtd @@).";
    }

    let offset = 0;
    for (let i = 0; i < parsedHunks.length; i++) {
      const hunk = parsedHunks[i];
      const originalLength = fileLines.length;

      const error = applyHunk(fileLines, hunk, i, offset);
      if (error) return `ERRO ao aplicar patch em '${filePath}': ${error}`;

      const newLength = fileLines.length;
      offset += newLength - originalLength;
    }

    const modifiedContent = fileLines.join("\n");
    writeFileSync(filePath, modifiedContent, "utf8");

    const plural = parsedHunks.length === 1 ? "hunk" : "hunks";
    return `OK: arquivo '${filePath}' patch aplicado (${parsedHunks.length} ${plural}).`;
  } catch (e) {
    if (e.code === "ENOENT") {
      return `ERRO: arquivo '${filePath}' não encontrado.`;
    }
    return `ERRO ao aplicar patch em '${filePath}': ${e.message}`;
  }
}
