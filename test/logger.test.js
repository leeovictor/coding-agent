import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLogger } from "../src/logger.js";

let tmpDir;
beforeEach(() => { tmpDir = mkdtempSync(join(tmpdir(), "log-")); });
afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

function readLines(filePath) {
  return readFileSync(filePath, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse);
}

describe("createLogger", () => {
  it("cria arquivo .jsonl no diret\u00f3rio informado", () => {
    const { filePath } = createLogger(tmpDir, { disabled: false });
    expect(existsSync(filePath)).toBe(true);
    expect(filePath).toMatch(/\.jsonl$/);
  });

  it("nome do arquivo cont\u00e9m timestamp ISO", () => {
    const fixed = new Date("2026-07-06T14:32:01.000Z");
    const { filePath } = createLogger(tmpDir, { now: () => fixed, disabled: false });
    expect(filePath).toMatch(/agent-2026-07-06T14-32-01-000Z/);
  });

  it("logEvent escreve uma linha JSON v\u00e1lida com event e timestamp", () => {
    const fixed = new Date("2026-07-06T14:32:01.000Z");
    const { logEvent, filePath } = createLogger(tmpDir, { now: () => fixed, disabled: false });
    logEvent("request", { modelo: "x", iteracao: 1 });
    const lines = readLines(filePath);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toEqual({
      event: "request",
      timestamp: "2026-07-06T14:32:01.000Z",
      modelo: "x",
      iteracao: 1,
    });
  });

  it("m\u00faltiplos logEvent produzem m\u00faltiplas linhas (append)", () => {
    const { logEvent, filePath } = createLogger(tmpDir, { disabled: false });
    logEvent("request", { i: 1 });
    logEvent("response", { i: 1 });
    logEvent("tool_execution", { tool: "x" });
    const lines = readLines(filePath);
    expect(lines).toHaveLength(3);
    expect(lines.map((l) => l.event)).toEqual(["request", "response", "tool_execution"]);
  });

  it("substitui undefined por null", () => {
    const { logEvent, filePath } = createLogger(tmpDir, { disabled: false });
    logEvent("x", { a: undefined, b: 1 });
    const [line] = readLines(filePath);
    expect(line.a).toBeNull();
    expect(line.b).toBe(1);
  });

  it("trunca strings muito longas com indicador", () => {
    const { logEvent, filePath } = createLogger(tmpDir, { disabled: false });
    const longo = "x".repeat(15000);
    logEvent("tool_execution", { resultado: longo });
    const [line] = readLines(filePath);
    expect(line.resultado.length).toBeLessThan(5000);
    expect(line.resultado).toMatch(/\+\d+ chars\]/);
  });

  it("n\u00e3o lan\u00e7a mesmo com objeto com refer\u00eancia circular", () => {
    const errors = [];
    const logger2 = createLogger(tmpDir, { errorHandler: (e) => errors.push(e), disabled: false });
    const obj = { normal: 1 };
    obj.self = obj;
    expect(() => logger2.logEvent("x", obj)).not.toThrow();
    expect(errors.length).toBeGreaterThan(0);
  });

  it("cria diret\u00f3rio se n\u00e3o existir", () => {
    const nested = join(tmpDir, "nested", "deep");
    const { filePath } = createLogger(nested, { disabled: false });
    expect(existsSync(filePath)).toBe(true);
  });

  it("logEvent com data null/undefined n\u00e3o quebra", () => {
    const { logEvent, filePath } = createLogger(tmpDir, { disabled: false });
    expect(() => logEvent("x", null)).not.toThrow();
    expect(() => logEvent("x", undefined)).not.toThrow();
    const lines = readLines(filePath);
    expect(lines).toHaveLength(2);
  });
});
