import { emitKeypressEvents } from "node:readline";
import { summarizeTool } from "./tools/index.js";
import { createMarkdownWriter } from "./markdownWriter.js";

const PREVIEW_LEN = 500;

function preview(s, len = PREVIEW_LEN) {
  const str = String(s ?? "");
  if (str.length <= len) return str;
  return str.slice(0, len) + `\u2026 [+${str.length - len} chars]`;
}

function countMatches(result) {
  const str = String(result ?? "");
  if (!str || str.startsWith("ERRO") || str.startsWith("Nenhum")) return 0;
  const lines = str.split("\n").filter(l => l && !l.startsWith("..."));
  return lines.length;
}

export function formatDecision({ iteracao, tool, args, error }) {
  const argsStr = error
    ? `(args inv\u00e1lidos: ${error})`
    : summarizeTool(tool, args);
  return `[iter ${iteracao}] \u2192 ${tool} ${argsStr}`;
}

export function formatToolResult({ iteracao, tool, resultado, duration_ms }) {
  if (tool === "read_file") {
    return `[iter ${iteracao}] \u2190 ${tool} (${duration_ms}ms): [${String(resultado ?? "").length} chars]`;
  }
  return `[iter ${iteracao}] \u2190 ${tool} (${duration_ms}ms): ${preview(resultado)}`;
}

export function formatConfirmation({ iteracao, tool, args }) {
  if (tool === "write_file") {
    return `${RED}? Write file ${args.path} (y/n):${RESET}`;
  }
  if (tool === "edit_file") {
    return `${RED}? Edit file ${args.filePath} (y/n):${RESET}`;
  }
  if (tool === "patch_file") {
    return `${RED}? Patch file ${args.filePath} (y/n):${RESET}`;
  }
  if (tool === "run_bash") {
    return `${RED}? Run bash ${args.command} (y/n):${RESET}`;
  }
  return `${RED}[iter ${iteracao}] ? confirmar ${tool} ${JSON.stringify(args)} (y/n):${RESET}`;
}

export function formatFinal(content) {
  return `\n\u2014\u2014\u2014 resposta final \u2014\u2014\u2014\n${content}\n\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014`;
}

export function formatLoopEnd({ motivo, iteracoes }) {
  if (motivo === "concluido") return "";
  if (motivo === "limite_atingido") return `[AVISO: loop encerrado por limite de itera\u00e7\u00f5es (${iteracoes})]`;
  return `[loop encerrado: ${motivo}]`;
}

const GRAY = "\x1b[90m";
const ORANGE = "\x1b[38;5;208m";
const RED = "\x1b[31m";
const WHITE = "\x1b[97m";
const RESET = "\x1b[0m";
const SPINNER_FRAMES = ["⠋","⠙","⠹","⠸","⠼","⠴","⠦","⠧","⠇","⠏"];
const BASH_PREVIEW_LEN = 2000;

export function formatBashOutput({ resultado, duration_ms }) {
  const text = String(resultado ?? "");
  const isError = text.startsWith("ERRO");
  const borderColor = isError ? RED : GRAY;
  const contentColor = isError ? RED : "";
  const label = isError ? "output (error)" : "output";
  const headerText = `${label} (${duration_ms ?? "?"}ms)`;
  const WIDTH = 60;
  const previewed = preview(text, BASH_PREVIEW_LEN);
  const lines = previewed.split("\n");
  const header = `${borderColor}┌─ ${headerText} ${"─".repeat(Math.max(2, WIDTH - headerText.length - 4))}${RESET}`;
  const body = lines.map((l) => `${borderColor}│${RESET} ${contentColor}${l}${RESET}`).join("\n");
  const footer = `${borderColor}└${"─".repeat(WIDTH)}${RESET}`;
  return `${header}\n${body}\n${footer}`;
}

export function createConsoleEventHandler({ log = console.log, stdout = process.stdout, stdin } = {}) {
  let reasoningActive = false;
  let contentStreamed = false;
  let thinkingActive = false;
  let thinkingTimer = null;
  let frameIdx = 0;
  let prevGroup = "none";
  let reasoningBuffer = "";
  let showReasoning = false;
  let reasoningHintShown = false;
  let thinkingLabel = "Pensando...";
  let inputAttached = false;
  let reasoningStart = null;
  let spinnerLineBlank = false;

  const markdownWriter = createMarkdownWriter({ stdout });

  function beginGroup(name) {
    if (prevGroup !== "none" && prevGroup !== name) {
      if (!spinnerLineBlank) {
        stdout.write("\n");
      }
    }
    spinnerLineBlank = false;
    prevGroup = name;
  }

  function startThinking(label) {
    if (thinkingActive) return;
    thinkingLabel = label ?? "";
    reasoningHintShown = false;
    stdout.write(`${ORANGE}\u280b${thinkingLabel ? " " + thinkingLabel : ""}${RESET}`);
    thinkingActive = true;
    prevGroup = "thinking";
    if (stdout.isTTY !== false) {
      thinkingTimer = setInterval(() => {
        frameIdx = (frameIdx + 1) % SPINNER_FRAMES.length;
        stdout.write(`\r\x1b[2K${ORANGE}${SPINNER_FRAMES[frameIdx]}${thinkingLabel ? " " + thinkingLabel : ""}${RESET}`);
      }, 80);
    }
  }

  function clearThinking() {
    if (thinkingTimer) {
      clearInterval(thinkingTimer);
      thinkingTimer = null;
    }
    if (thinkingActive) {
      stdout.write(`\r\x1b[2K\r${RESET}`);
      thinkingActive = false;
      spinnerLineBlank = true;
    }
  }

  function revealReasoning() {
    if (showReasoning) return;
    showReasoning = true;
    clearThinking();
    if (reasoningBuffer) {
      beginGroup("reasoning");
      stdout.write(`${ORANGE}\u203a `);
      const parts = reasoningBuffer.split("\n");
      for (let i = 0; i < parts.length; i++) {
        if (i > 0) {
          stdout.write(`${RESET}\n${ORANGE}\u203a `);
        }
        if (parts[i]) {
          stdout.write(parts[i]);
        }
      }
      reasoningActive = true;
    }
  }

  function onKeypress(str, key) {
    if (key.name === "r") {
      revealReasoning();
    } else if (key.ctrl && key.name === "c") {
      markdownWriter.flush();
      detachInput();
      clearThinking();
      stdout.write("\n");
      process.exit(0);
    }
  }

  function attachInput() {
    if (!stdin || !stdin.isTTY || inputAttached) return;
    inputAttached = true;
    emitKeypressEvents(stdin);
    stdin.setRawMode(true);
    stdin.on("keypress", onKeypress);
  }

  function detachInput() {
    if (!inputAttached) return;
    inputAttached = false;
    stdin.removeListener("keypress", onKeypress);
  }

  function flushReasoning() {
    if (reasoningActive) {
      stdout.write(`${RESET}\n`);
      reasoningActive = false;
    }
  }

  function showReasoningDuration() {
    if (reasoningStart === null) return false;
    beginGroup("reasoning");
    const elapsed = Date.now() - reasoningStart;
    const secs = (elapsed / 1000).toFixed(1);
    stdout.write(`${ORANGE}+ Pensou: ${secs}s${RESET}\n`);
    spinnerLineBlank = false;
    reasoningStart = null;
    return true;
  }

  function handler(event, data) {
    switch (event) {
      case "request":
        reasoningBuffer = "";
        showReasoning = false;
        reasoningStart = null;
        markdownWriter.reset();
        attachInput();
        stdout.write("\n");
        spinnerLineBlank = false;
        prevGroup = "reasoning";
        startThinking();
        break;
      case "token":
        if (data.type === "reasoning") {
          reasoningBuffer += data.text;
          if (reasoningStart === null) reasoningStart = Date.now();
          if (!showReasoning) {
            if (thinkingActive) {
              thinkingLabel = "Pensando...";
              reasoningHintShown = true;
            }
          } else {
            clearThinking();
            if (!reasoningActive) {
              beginGroup("reasoning");
              stdout.write(`${ORANGE}\u203a `);
              reasoningActive = true;
            }
            const parts = data.text.split("\n");
            for (let i = 0; i < parts.length; i++) {
              if (i > 0) {
                stdout.write(`${RESET}\n${ORANGE}\u203a `);
              }
              if (parts[i]) {
                stdout.write(parts[i]);
              }
            }
          }
        } else {
          clearThinking();
          flushReasoning();
          showReasoningDuration();
          beginGroup("content");
          contentStreamed = true;
          markdownWriter.push(data.text);
        }
        break;
      case "tool_preparing":
        if (data.tool === "write_file") {
          markdownWriter.flush();
          clearThinking();
          flushReasoning();
          showReasoningDuration();
          beginGroup("preparing");
          stdout.write(`${WHITE}~ Preparando escrita...${RESET}\n`);
        } else if (data.tool === "edit_file") {
          markdownWriter.flush();
          clearThinking();
          flushReasoning();
          showReasoningDuration();
          beginGroup("preparing");
          stdout.write(`${WHITE}~ Preparando edição...${RESET}\n`);
        } else if (data.tool === "patch_file") {
          markdownWriter.flush();
          clearThinking();
          flushReasoning();
          showReasoningDuration();
          beginGroup("preparing");
          stdout.write(`${WHITE}~ Preparando patch...${RESET}\n`);
        }
        break;
      case "tool_decision":
        markdownWriter.flush();
        clearThinking();
        flushReasoning();
        showReasoningDuration();
        beginGroup("tool");
        if (data.tool === "write_file") {
          const path = data.args?.path ?? data.error ?? "?";
          stdout.write(`${GRAY}-> Write file ${path}${RESET}\n`);
        } else if (data.tool === "edit_file") {
          const path = data.args?.filePath ?? data.error ?? "?";
          stdout.write(`${GRAY}-> Edit file ${path}${RESET}\n`);
        } else if (data.tool === "patch_file") {
          const path = data.args?.filePath ?? data.error ?? "?";
          stdout.write(`${GRAY}-> Patch file ${path}${RESET}\n`);
        } else if (data.tool === "run_bash") {
          const cmd = data.args?.command ?? data.error ?? "?";
          stdout.write(`${GRAY}-> Run bash ${cmd}${RESET}\n`);
        } else if (data.tool === "question") {
          const qty = data.args?.questions?.length ?? "?";
          stdout.write(`${GRAY}-> Question (${qty} pergunta(s))${RESET}\n`);
        } else if (data.tool === "read_file" || data.tool === "grep" || data.tool === "glob" || data.tool === "todos") {
          // exibido apenas no tool_execution
        } else {
          log(formatDecision(data));
        }
        break;
      case "tool_execution":
        markdownWriter.flush();
        clearThinking();
        flushReasoning();
        showReasoningDuration();
        beginGroup("tool");
        if (data.tool === "run_bash") {
          stdout.write(formatBashOutput(data) + "\n");
        } else if (data.tool === "read_file") {
          const args = data.args ?? {};
          const parts = [];
          if (args.offset != null) parts.push(`offset=${args.offset}`);
          if (args.limit != null) parts.push(`limit=${args.limit}`);
          const extra = parts.length > 0 ? ` [${parts.join(" ")}]` : "";
          stdout.write(`${GRAY}=> Read ${args.path ?? "?"}${extra}${RESET}\n`);
        } else if (data.tool === "grep") {
          const count = countMatches(data.resultado);
          stdout.write(`${GRAY}* Grep "${data.args?.pattern ?? "?"}" in ${data.args?.path ?? "."} (${count} matches)${RESET}\n`);
        } else if (data.tool === "glob") {
          const count = countMatches(data.resultado);
          stdout.write(`${GRAY}* Glob "${data.args?.pattern ?? "?"}" in ${data.args?.path ?? "."} (${count} matches)${RESET}\n`);
        } else if (data.tool === "todos") {
          stdout.write(`${GRAY}* Todos atualizados${RESET}\n`);
          const lines = String(data.resultado ?? "").split("\n");
          for (const line of lines) {
            stdout.write(`  ${line}\n`);
          }
        } else if (data.tool === "question") {
          stdout.write(`${GRAY}* Respostas recebidas${RESET}\n`);
          try {
            const parsed = JSON.parse(data.resultado);
            for (const item of parsed) {
              const answer = Array.isArray(item.answer) ? item.answer.join(", ") : item.answer;
              stdout.write(`  ${item.header}: ${answer}\n`);
            }
          } catch {
            // fallback: mostra o raw
            stdout.write(`  ${String(data.resultado).slice(0, 200)}\n`);
          }
        } else if (data.tool !== "write_file" && data.tool !== "edit_file" && data.tool !== "patch_file") {
          log(formatToolResult(data));
        }
        break;
      case "tool_confirmation":
        markdownWriter.flush();
        clearThinking();
        flushReasoning();
        showReasoningDuration();
        beginGroup("tool");
        log(formatConfirmation(data));
        break;
      case "final_content":
        markdownWriter.flush();
        clearThinking();
        flushReasoning();
        showReasoningDuration();
        beginGroup("content");
        if (!contentStreamed) {
          log(formatFinal(data.content));
        }
        break;
      case "loop_end":
        markdownWriter.flush();
        clearThinking();
        flushReasoning();
        showReasoningDuration();
        if (data.motivo !== "concluido") {
          beginGroup("end");
          log(formatLoopEnd(data));
        }
        stdout.write("\n");
        break;
    }
  }

  handler.dispose = function dispose() {
    markdownWriter.flush();
    detachInput();
    clearThinking();
    showReasoningDuration();
  };

  return handler;
}
