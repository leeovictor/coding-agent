import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, relative, join, sep } from "node:path";

const DEFAULT_MAX_RESULTS = 200;
const MAX_FILE_BYTES = 500_000;

function globToRegex(pattern) {
  let result = "^";
  let i = 0;
  while (i < pattern.length) {
    if (pattern.slice(i).startsWith("**/")) {
      result += "(?:.*/)?";
      i += 3;
    } else if (pattern[i] === "*" && pattern[i + 1] === "*" && (i + 2 >= pattern.length || pattern[i + 2] !== "/")) {
      result += ".*";
      i += 2;
    } else if (pattern[i] === "*") {
      result += "[^/]*";
      i++;
    } else if (pattern[i] === "?") {
      result += "[^/]";
      i++;
    } else if (".+^${}()|[]\\".includes(pattern[i])) {
      result += "\\" + pattern[i];
      i++;
    } else {
      result += pattern[i];
      i++;
    }
  }
  result += "$";
  return result;
}

function shouldSkipDir(name) {
  return name === "node_modules" || name === ".git" || name.startsWith(".");
}

function collectFiles(dir, baseDir, includeRe) {
  const files = [];
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      const relPath = relative(baseDir, fullPath);

      if (entry.isDirectory()) {
        if (!shouldSkipDir(entry.name)) {
          files.push(...collectFiles(fullPath, baseDir, includeRe));
        }
      } else if (entry.isFile()) {
        if (!includeRe || includeRe.test(relPath)) {
          files.push({ fullPath, relPath });
        }
      }
    }
  } catch {}
  return files;
}

export const schema = {
  type: "function",
  function: {
    name: "grep",
    description:
      "Busca conteúdo em arquivos usando expressões regulares. Suporta sintaxe completa de regex e filtragem de padrões de arquivos.",
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Padrão regex para buscar no conteúdo dos arquivos." },
        path: { type: "string", description: "Diretório base para a busca. Padrão: diretório de trabalho atual." },
        include: { type: "string", description: "Filtro de arquivos no formato glob (ex: '*.js', 'src/**/*.ts')." },
        maxResults: { type: "number", description: "Número máximo de correspondências (padrão: 200)." },
      },
      required: ["pattern"],
    },
  },
};

export const sensitive = false;

export function summarize(args) {
  return args.pattern;
}

export function execute({ pattern, path: targetPath, include, maxResults = DEFAULT_MAX_RESULTS }) {
  if (!pattern) return "ERRO: parâmetro 'pattern' é obrigatório.";

  const cwd = process.cwd();
  const searchDir = targetPath ? resolve(cwd, targetPath) : cwd;
  const resolvedDir = resolve(searchDir);

  if (resolvedDir !== cwd && !resolvedDir.startsWith(cwd + sep)) {
    return `ERRO: caminho '${targetPath}' está fora do diretório de trabalho.`;
  }

  let regex;
  try {
    regex = new RegExp(pattern, "g");
  } catch (e) {
    return `ERRO: expressão regular inválida '${pattern}': ${e.message}`;
  }

  let includeRe = null;
  if (include) {
    includeRe = new RegExp(globToRegex(include));
  }

  const files = collectFiles(searchDir, searchDir, includeRe);
  const results = [];
  let truncated = false;

  for (const { fullPath, relPath } of files) {
    if (results.length >= maxResults) {
      truncated = true;
      break;
    }

    try {
      if (statSync(fullPath).size > MAX_FILE_BYTES) continue;

      const content = readFileSync(fullPath, "utf8");
      const lines = content.split("\n");

      for (let lineNum = 0; lineNum < lines.length && results.length < maxResults; lineNum++) {
        if (lines[lineNum].match(regex)) {
          results.push(`${relPath}:${lineNum + 1}: ${lines[lineNum].trimEnd()}`);
        }
      }
      if (results.length >= maxResults) {
        truncated = true;
        break;
      }
    } catch {}
  }

  if (results.length === 0) {
    return "Nenhuma correspondência encontrada.";
  }

  let out = results.join("\n");
  if (truncated) {
    out += `\n\n... [truncado: limite de ${maxResults} correspondências atingido]`;
  }
  return out;
}
