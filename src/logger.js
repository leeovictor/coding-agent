import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const MAX_FIELD_LEN = 10_000;
const PREVIEW_LEN = 2_000;

function preview(value, len = PREVIEW_LEN) {
  const str = typeof value === "string" ? value : JSON.stringify(value);
  if (!str) return str;
  if (str.length <= len) return value;
  return str.slice(0, len) + `\u2026 [+${str.length - len} chars]`;
}

function sanitize(data) {
  const out = {};
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) { out[k] = null; continue; }
    if (typeof v === "string" && v.length > MAX_FIELD_LEN) {
      out[k] = preview(v);
    } else if (v && typeof v === "object" && !Array.isArray(v)) {
      out[k] = {};
      for (const [k2, v2] of Object.entries(v)) {
        out[k][k2] = (typeof v2 === "string" && v2.length > MAX_FIELD_LEN) ? preview(v2) : (v2 === undefined ? null : v2);
      }
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function createLogger(logDir, deps = {}) {
  const disabled = deps.disabled ?? process.env.DUX_LOG_DISABLED === "1";
  if (disabled) {
    return { logEvent: () => {}, filePath: null };
  }

  const now = deps.now ?? (() => new Date());
  const errorHandler = deps.errorHandler ?? ((e) => console.error("logger error:", e.message));

  mkdirSync(logDir, { recursive: true });
  const stamp = now().toISOString().replace(/[:.]/g, "-");
  const filePath = join(logDir, `agent-${stamp}.jsonl`);
  writeFileSync(filePath, "", "utf8");

  function logEvent(event, data) {
    try {
      const line = JSON.stringify({
        event,
        timestamp: now().toISOString(),
        ...sanitize(data ?? {}),
      });
      appendFileSync(filePath, line + "\n", "utf8");
    } catch (e) {
      errorHandler(e);
    }
  }

  return { logEvent, filePath };
}
