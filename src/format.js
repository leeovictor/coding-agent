const PREVIEW_LEN = 500;

function preview(s, len = PREVIEW_LEN) {
  const str = String(s ?? "");
  if (str.length <= len) return str;
  return str.slice(0, len) + `\u2026 [+${str.length - len} chars]`;
}

export function formatDecision({ iteracao, tool, args, error }) {
  const argsStr = error
    ? `(args inv\u00e1lidos: ${error})`
    : JSON.stringify(args);
  return `[iter ${iteracao}] \u2192 ${tool} ${argsStr}`;
}

export function formatToolResult({ iteracao, tool, resultado, duration_ms }) {
  return `[iter ${iteracao}] \u2190 ${tool} (${duration_ms}ms): ${preview(resultado)}`;
}

export function formatConfirmation({ iteracao, tool, args }) {
  return `[iter ${iteracao}] ? confirmar ${tool} ${JSON.stringify(args)} (y/n):`;
}

export function formatFinal(content) {
  return `\n\u2014\u2014\u2014 resposta final \u2014\u2014\u2014\n${content}\n\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014`;
}

export function formatLoopEnd({ motivo, iteracoes }) {
  if (motivo === "concluido") return `\n[loop encerrado: conclu\u00eddo em ${iteracoes} itera\u00e7\u00e3o(\u00f5es)]`;
  if (motivo === "limite_atingido") return `\n[AVISO: loop encerrado por limite de itera\u00e7\u00f5es (${iteracoes})]`;
  return `\n[loop encerrado: ${motivo}]`;
}

export function createConsoleEventHandler({ log = console.log } = {}) {
  return (event, data) => {
    switch (event) {
      case "tool_decision":
        log(formatDecision(data));
        break;
      case "tool_execution":
        log(formatToolResult(data));
        break;
      case "tool_confirmation":
        log(formatConfirmation(data));
        break;
      case "final_content":
        log(formatFinal(data.content));
        break;
      case "loop_end":
        log(formatLoopEnd(data));
        break;
    }
  };
}
