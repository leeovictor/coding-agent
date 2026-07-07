import { describe, it, expect } from "vitest";
import { execute } from "../../src/tools/runBash.js";

describe("runBash.execute", () => {
  it("executa echo e captura stdout", () => {
    const out = execute({ command: "echo hello" });
    expect(out).toMatch(/hello/);
  });

  it("comando inexistente retorna erro com stderr do shell", () => {
    const out = execute({ command: "comando_que_nao_existe_xyz" });
    expect(out).toMatch(/ERRO/);
    expect(out).toMatch(/exit 127/);
    expect(out).toMatch(/not found/);
  });

  it("retorna erro para exit code não-zero com comando permitido", () => {
    const out = execute({ command: "ls /caminho/inexistente/xyz" });
    expect(out).toMatch(/ERRO/);
    expect(out).toMatch(/exit/);
  });

  it("comando permitido sem saída retorna (sem saída)", () => {
    const out = execute({ command: "echo -n" });
    expect(out).toMatch(/sem saída/);
  });

  it("retorna erro se command não fornecido", () => {
    expect(execute({})).toMatch(/'command'/);
  });
});
