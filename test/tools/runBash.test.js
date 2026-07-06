import { describe, it, expect } from "vitest";
import { execute } from "../../src/tools/runBash.js";

describe("runBash.execute", () => {
  it("executa echo e captura stdout", () => {
    const out = execute({ command: "echo hello" });
    expect(out).toMatch(/hello/);
  });

  it("retorna erro em string para comando inexistente", () => {
    const out = execute({ command: "comando_que_nao_existe_xyz" });
    expect(out).toMatch(/ERRO/);
    expect(out).toMatch(/exit/);
  });

  it("retorna erro para exit code não-zero", () => {
    const out = execute({ command: "exit 1" });
    expect(out).toMatch(/ERRO/);
  });

  it("retorna mensagem para comando sem saída", () => {
    const out = execute({ command: "true" });
    expect(out).toMatch(/sem saída/);
  });

  it("retorna erro se command não fornecido", () => {
    expect(execute({})).toMatch(/'command'/);
  });
});
