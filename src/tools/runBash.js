import { execSync } from "node:child_process";
import { isBashAllowed } from "../permissions.js";

export const schema = {
  type: "function",
  function: {
    name: "run_bash",
    description: "Executa um comando no shell do sistema. Use com cuidado.",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "Comando bash a ser executado." },
      },
      required: ["command"],
    },
  },
};

export const sensitive = true;

export const shouldConfirm = (args) => !isBashAllowed(args?.command);

export function summarize(args) {
  if (!args.command) return "";
  return args.command.length > 80 ? args.command.slice(0, 80) + "\u2026" : args.command;
}

export function execute({ command }) {
  if (!command) return "ERRO: parâmetro 'command' é obrigatório.";
  if (!isBashAllowed(command)) {
    return `ERRO: Comando '${command.slice(0, 80)}' não está na lista de comandos permitidos.`;
  }
  try {
    const stdout = execSync(command, {
      encoding: "utf8",
      cwd: process.cwd(),
      maxBuffer: 1_000_000,
      timeout: 30_000,
    });
    const trimmed = stdout.length > 50_000
      ? stdout.slice(0, 50_000) + "\n...[saída truncada]"
      : stdout;
    return trimmed || "(sem saída)";
  } catch (e) {
    const stderr = e.stderr ? e.stderr.toString() : "";
    const stdout = e.stdout ? e.stdout.toString() : "";
    return `ERRO (exit ${e.status ?? "?"}):\n--- stdout ---\n${stdout}\n--- stderr ---\n${stderr}`;
  }
}
