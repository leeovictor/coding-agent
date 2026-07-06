import { describe, it, expect } from "vitest";
import { parseEnvFile } from "../src/env.js";

describe("parseEnvFile", () => {
  it("faz parse de chave simples", () => {
    expect(parseEnvFile("KEY=value")).toEqual({ KEY: "value" });
  });

  it("faz parse de múltiplas chaves", () => {
    expect(parseEnvFile("A=1\nB=2")).toEqual({ A: "1", B: "2" });
  });

  it("ignora linhas em branco", () => {
    expect(parseEnvFile("A=1\n\nB=2")).toEqual({ A: "1", B: "2" });
  });

  it("ignora comentários com #", () => {
    expect(parseEnvFile("# comment\nA=1")).toEqual({ A: "1" });
  });

  it("suporta valor com aspas duplas contendo =", () => {
    expect(parseEnvFile('KEY="a=b"')).toEqual({ KEY: "a=b" });
  });

  it("suporta valor com aspas simples", () => {
    expect(parseEnvFile("KEY='hello world'")).toEqual({ KEY: "hello world" });
  });

  it("valor sem aspas é tudo após o primeiro =", () => {
    expect(parseEnvFile("URL=https://example.com?a=b")).toEqual({
      URL: "https://example.com?a=b",
    });
  });

  it("ignora linhas com chave inválida", () => {
    expect(parseEnvFile("123KEY=val\nVALID=ok")).toEqual({ VALID: "ok" });
  });

  it("string vazia retorna objeto vazio", () => {
    expect(parseEnvFile("")).toEqual({});
  });

  it("preserva espaços internos em valores aspeados", () => {
    expect(parseEnvFile('KEY="some value here"')).toEqual({
      KEY: "some value here",
    });
  });
});
