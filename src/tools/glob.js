import { readdirSync, statSync } from "node:fs";
import { resolve, relative, join, sep } from "node:path";

const DEFAULT_MAX_RESULTS = 200;

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

function collectMatches(dir, baseDir, regex) {
  const results = [];
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      const relPath = relative(baseDir, fullPath);

      if (entry.isDirectory()) {
        if (!shouldSkipDir(entry.name)) {
          results.push(...collectMatches(fullPath, baseDir, regex));
        }
      } else if (entry.isFile()) {
        if (regex.test(relPath)) {
          try {
            const stat = statSync(fullPath);
            results.push({ path: relPath, mtime: stat.mtimeMs });
          } catch {}
        }
      }
    }
  } catch {}
  return results;
}

export const schema = {
  type: "function",
  function: {
    name: "glob",
    description:
      "Encontra arquivos por correspondência de padrões glob. Suporta padrões como **/*.js ou src/**/*.ts. Retorna caminhos ordenados por data de modificação (mais recentes primeiro).",
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Padrão glob para buscar arquivos (ex: '**/*.js', 'src/**/*.ts')." },
        path: { type: "string", description: "Diretório base para a busca. Padrão: diretório de trabalho atual." },
        maxResults: { type: "number", description: "Número máximo de resultados (padrão: 200)." },
      },
      required: ["pattern"],
    },
  },
};

export const sensitive = false;

export function summarize(args) {
  return args.pattern;
}

export function execute({ pattern, path: targetPath, maxResults = DEFAULT_MAX_RESULTS }) {
  if (!pattern) return "ERRO: parâmetro 'pattern' é obrigatório.";

  const cwd = process.cwd();
  const searchDir = targetPath ? resolve(cwd, targetPath) : cwd;
  const resolvedDir = resolve(searchDir);

  if (resolvedDir !== cwd && !resolvedDir.startsWith(cwd + sep)) {
    return `ERRO: caminho '${targetPath}' está fora do diretório de trabalho.`;
  }

  const regex = new RegExp(globToRegex(pattern));
  const matches = collectMatches(searchDir, searchDir, regex);

  if (matches.length === 0) {
    return "Nenhum arquivo encontrado.";
  }

  matches.sort((a, b) => b.mtime - a.mtime);

  let truncated = false;
  if (matches.length > maxResults) {
    matches.length = maxResults;
    truncated = true;
  }

  let out = matches.map((m) => m.path).join("\n");
  if (truncated) {
    out += `\n\n... [truncado: limite de ${maxResults} arquivos atingido]`;
  }
  return out;
}
