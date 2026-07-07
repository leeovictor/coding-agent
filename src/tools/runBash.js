import { spawnSync } from "node:child_process";
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
  
  try {
    const result = spawnSync(command, {
      shell: true,
      encoding: "utf8",
      cwd: process.cwd(),
      maxBuffer: 1_000_000,
      timeout: 30_000,
    });

    if (result.error) {
      return `ERRO: ${result.error.message}`;
    }

    const stdout = (result.stdout || "").trimEnd();
    const stderr = (result.stderr || "").trimEnd();

    if (result.status !== 0) {
      return `ERRO (exit ${result.status}):\n--- stdout ---\n${stdout}\n--- stderr ---\n${stderr}`;
    }

    let output = stderr;
    if (stdout) {
      output = output ? `${output}\n${stdout}` : stdout;
    }

    const trimmed = output.length > 50_000
      ? output.slice(0, 50_000) + "\n...[saída truncada]"
      : output;
    return trimmed || "(sem saída)";
  } catch (e) {
    return `ERRO (exceção): ${e.message}`;
  }
}
