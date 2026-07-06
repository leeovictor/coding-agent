import { createInterface } from "node:readline";

const YES_INPUTS = new Set(["y", "Y", "yes", "YES", "s", "S", "sim", "SIM", "Sim"]);

export function isYes(input) {
  if (typeof input !== "string") return false;
  return YES_INPUTS.has(input.trim());
}

export function createConfirm(deps = {}) {
  const input = deps.input ?? null;
  const output = deps.output ?? console.log;
  const formatConfirmation = deps.formatConfirmation ?? null;

  let rl = null;
  function getReadline() {
    if (!rl) {
      rl = createInterface({ input: process.stdin, output: process.stderr });
    }
    return rl;
  }

  function ask(question) {
    if (input) {
      return Promise.resolve(input());
    }
    return new Promise((resolve) => {
      const r = getReadline();
      r.question(question, (answer) => resolve(answer));
    });
  }

  return async function confirm(toolName, args, iteracao) {
    if (formatConfirmation) {
      output(formatConfirmation({ iteracao, tool: toolName, args }));
    }
    const answer = await ask("> ");
    return isYes(answer);
  };
}
