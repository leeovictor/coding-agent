import { describe, it, expect, vi } from "vitest";
import { isYes, createConfirm } from "../src/confirm.js";

describe("isYes", () => {
  it.each(["y", "Y", "yes", "YES", "s", "S", "sim", "SIM", "Sim"])("aceita '%s'", (v) => {
    expect(isYes(v)).toBe(true);
  });

  it.each(["n", "N", "no", "nao", "não", "x", "", "  ", "maybe"])("rejeita '%s'", (v) => {
    expect(isYes(v)).toBe(false);
  });

  it("faz trim nos valores", () => {
    expect(isYes("  y  ")).toBe(true);
    expect(isYes("  n  ")).toBe(false);
  });

  it("rejeita não-string", () => {
    expect(isYes(null)).toBe(false);
    expect(isYes(undefined)).toBe(false);
    expect(isYes(123)).toBe(false);
  });
});

describe("createConfirm", () => {
  it("retorna true quando input é 'y'", async () => {
    const confirm = createConfirm({ input: async () => "y" });
    expect(await confirm("write_file", { path: "a" }, 1)).toBe(true);
  });

  it("retorna false quando input é 'n'", async () => {
    const confirm = createConfirm({ input: async () => "n" });
    expect(await confirm("run_bash", { command: "rm -rf x" }, 1)).toBe(false);
  });

  it("usa fila de respostas em sequência", async () => {
    const queue = ["y", "n", "sim"];
    let i = 0;
    const confirm = createConfirm({ input: async () => queue[i++] });
    expect(await confirm("x", {})).toBe(true);
    expect(await confirm("x", {})).toBe(false);
    expect(await confirm("x", {})).toBe(true);
  });

  it("chama formatConfirmation com os dados recebidos", async () => {
    const calls = [];
    const confirm = createConfirm({
      input: async () => "y",
      output: (s) => calls.push(s),
      formatConfirmation: (data) => `CONFIRM:${JSON.stringify(data)}`,
    });
    await confirm("write_file", { path: "a" }, 3);
    expect(calls[0]).toBe('CONFIRM:{"iteracao":3,"tool":"write_file","args":{"path":"a"}}');
  });

  it("não chama formatConfirmation se não fornecida", async () => {
    const outputs = [];
    const confirm = createConfirm({
      input: async () => "y",
      output: (s) => outputs.push(s),
    });
    await confirm("x", {}, 1);
    expect(outputs).toHaveLength(0);
  });

  it("trata input vazio como 'não'", async () => {
    const confirm = createConfirm({ input: async () => "" });
    expect(await confirm("x", {})).toBe(false);
  });

  it("trata input null como 'não'", async () => {
    const confirm = createConfirm({ input: async () => null });
    expect(await confirm("x", {})).toBe(false);
  });
});
