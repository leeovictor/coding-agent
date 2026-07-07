const RESET = "\x1b[0m";
const GRN = "\x1b[32m";
const CYN = "\x1b[36m";
const CYN_B = "\x1b[1;36m";
const YEL = "\x1b[33m";
const GRY = "\x1b[90m";

function colorSupported(stdout) {
  return stdout.isTTY === true && !process.env.NO_COLOR;
}

export function renderInline(text) {
  const out = [];
  let i = 0;
  while (i < text.length) {
    if (text[i] === "[" && text.includes("](", i)) {
      const cb = text.indexOf("](", i);
      const cp = text.indexOf(")", cb + 2);
      if (cp !== -1) {
        out.push(`${GRN}${renderInline(text.slice(i + 1, cb))}${RESET}${GRY}(${text.slice(cb + 2, cp)})${RESET}`);
        i = cp + 1;
        continue;
      }
    }
    if (text[i] === "`") {
      const e = text.indexOf("`", i + 1);
      if (e !== -1) {
        out.push(`${GRN}${text.slice(i + 1, e)}${RESET}`);
        i = e + 1;
        continue;
      }
    }
    if (text[i] === "*" && text[i + 1] === "*") {
      const e = text.indexOf("**", i + 2);
      if (e !== -1) {
        out.push(`${GRN}${renderInline(text.slice(i + 2, e))}${RESET}`);
        i = e + 2;
        continue;
      }
    }
    if (text[i] === "*" && text[i + 1] !== "*") {
      const e = text.indexOf("*", i + 1);
      if (e !== -1 && text[e + 1] !== "*") {
        out.push(`${GRN}${text.slice(i + 1, e)}${RESET}`);
        i = e + 1;
        continue;
      }
    }
    if (text[i] === "~" && text[i + 1] === "~") {
      const e = text.indexOf("~~", i + 2);
      if (e !== -1) {
        out.push(`${GRN}${text.slice(i + 2, e)}${RESET}`);
        i = e + 2;
        continue;
      }
    }
    out.push(text[i]);
    i++;
  }
  return out.join("");
}

export function createMarkdownWriter({ stdout }) {
  const color = colorSupported(stdout);
  let buffer = "";
  let inCodeFence = false;
  let codeFenceMarker = "";
  let codeFenceLen = 0;

  function processLine(line) {
    if (!color) return line;

    if (/^\s*$/.test(line)) return "";

    const fm = line.match(/^ {0,3}(`{3,}|~{3,})(\S*)\s*$/);
    if (fm) {
      const marker = fm[1];
      if (!inCodeFence) {
        inCodeFence = true;
        codeFenceMarker = marker;
        codeFenceLen = marker.length;
        return `${GRY}${line}${RESET}`;
      }
      if (marker[0] === codeFenceMarker[0] && marker.length >= codeFenceLen) {
        inCodeFence = false;
        codeFenceMarker = "";
        codeFenceLen = 0;
        return `${GRY}${line}${RESET}`;
      }
    }

    if (inCodeFence) {
      return `${GRY}\u2502 ${line}${RESET}`;
    }

    const hm = line.match(/^(#{1,6})\s+(.*)$/);
    if (hm) {
      const lvl = hm[1].length;
      const cc = lvl <= 2 ? CYN_B : CYN;
      return `${cc}${"#".repeat(lvl)} ${renderInline(hm[2])}${RESET}`;
    }

    const bm = line.match(/^>\s?(.*)$/);
    if (bm) {
      return `${GRY}\u2502 ${renderInline(bm[1])}${RESET}`;
    }

    if (/^\s*[-*_]\s*[-*_]\s*[-*_]\s*$/.test(line)) {
      return `${GRY}${line}${RESET}`;
    }

    const um = line.match(/^(\s*)([-*+])\s+(.*)$/);
    if (um) {
      const marker = um[2];
      const bullet = marker === "-" || marker === "*" ? "\u2022" : marker;
      return `${um[1]}${YEL}${bullet}${RESET} ${renderInline(um[3])}`;
    }

    const om = line.match(/^(\s*)(\d+)\.\s+(.*)$/);
    if (om) {
      return `${om[1]}${YEL}${om[2]}.${RESET} ${renderInline(om[3])}`;
    }

    return renderInline(line);
  }

  function flushLine(line) {
    stdout.write(processLine(line) + "\n");
  }

  function push(text) {
    buffer += text;
    const idx = buffer.lastIndexOf("\n");
    if (idx === -1) return;
    const complete = buffer.slice(0, idx);
    buffer = buffer.slice(idx + 1);
    const lines = complete.split("\n");
    for (const ln of lines) {
      flushLine(ln);
    }
  }

  function flush() {
    if (buffer) {
      flushLine(buffer);
      buffer = "";
    }
  }

  function reset() {
    buffer = "";
    inCodeFence = false;
    codeFenceMarker = "";
    codeFenceLen = 0;
  }

  return { push, flush, reset };
}
