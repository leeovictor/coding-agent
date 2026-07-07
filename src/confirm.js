import { confirm as inquirerConfirm } from "@inquirer/prompts";
import { Writable } from "node:stream";

const YES_INPUTS = new Set(["y", "Y", "yes", "YES", "s", "S", "sim", "SIM", "Sim"]);

export function isYes(input) {
  if (typeof input !== "string") return false;
  return YES_INPUTS.has(input.trim());
}

function safeInquirerOutput() {
  return new Writable({
    write(chunk, encoding, callback) {
      process.stdout.write(chunk, encoding, callback);
    },
    final(callback) {
      callback();
    },
  });
}

export function createConfirm(deps = {}) {
  const input = deps.input ?? null;
  const output = deps.output ?? console.log;
  const formatConfirmation = deps.formatConfirmation ?? null;
  const rl = deps.rl ?? null;

  function getMessage(toolName, args, iteracao) {
    if (formatConfirmation) {
      return formatConfirmation({ iteracao, tool: toolName, args });
    }
    return `${toolName}: ${JSON.stringify(args)}`;
  }

  return async function confirm(toolName, args, iteracao) {
    const message = getMessage(toolName, args, iteracao);

    if (rl) {
      return new Promise((resolve) => {
        rl.question(`${message} [y/N] `, (answer) => {
          resolve(isYes(answer));
        });
      });
    }

    if (input) {
      if (formatConfirmation) {
        output(message);
      }
      const answer = await input();
      return isYes(answer);
    }

    return inquirerConfirm({ message }, { output: safeInquirerOutput() });
  };
}
