import { execSync } from "node:child_process";

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

export function execute({ command }) {
  if (!command) return "ERRO: parâmetro 'command' é obrigatório.";
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
