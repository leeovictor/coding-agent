import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, unlinkSync, rmdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadConfig, saveConfig } from "../src/config.js";

function randomDir() {
  return join(tmpdir(), `dux-test-${Math.random().toString(36).slice(2)}`);
}

describe("config", () => {
  let tempDir;

  beforeEach(() => {
    tempDir = randomDir();
  });

  afterEach(() => {
    try {
      const file = join(tempDir, "config.json");
      if (existsSync(file)) unlinkSync(file);
      rmdirSync(tempDir);
    } catch {
      // ignore cleanup issues
    }
  });

  it("loadConfig retorna objeto vazio para arquivo inexistente", () => {
    const result = loadConfig(tempDir);
    expect(result).toEqual({});
  });

  it("saveConfig cria diretório e arquivo", () => {
    saveConfig({ apiKey: "test-key" }, tempDir);
    const filePath = join(tempDir, "config.json");
    expect(existsSync(filePath)).toBe(true);
    const content = JSON.parse(readFileSync(filePath, "utf8"));
    expect(content.apiKey).toBe("test-key");
  });

  it("saveConfig faz merge com valores existentes", () => {
    saveConfig({ apiKey: "key1" }, tempDir);
    saveConfig({ model: "model1" }, tempDir);
    const result = loadConfig(tempDir);
    expect(result).toEqual({ apiKey: "key1", model: "model1" });
  });

  it("saveConfig sobrescreve valores existentes", () => {
    saveConfig({ apiKey: "old" }, tempDir);
    saveConfig({ apiKey: "new" }, tempDir);
    const result = loadConfig(tempDir);
    expect(result.apiKey).toBe("new");
  });

  it("loadConfig retorna dados salvos", () => {
    saveConfig({ apiKey: "sk-123", model: "deepseek/deepseek-v4-flash" }, tempDir);
    const result = loadConfig(tempDir);
    expect(result.apiKey).toBe("sk-123");
    expect(result.model).toBe("deepseek/deepseek-v4-flash");
  });
});
