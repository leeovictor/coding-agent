# Fase M6 — Confirmação Manual para Ações Sensíveis

## Objetivo

Antes de executar `write_file` ou `run_bash`, perguntar ao usuário no terminal `y/n` e só executar se confirmado. `read_file` executa direto (sem confirmação).

A confirmação é uma função `confirm(toolName, args)` que o `runAgent` (M3) já aceita injetável.

## Princípios

- A função `confirm` é **injetável** no `runAgent` — facilita testes sem I/O real.
- A implementação real usa `readline` do Node, mas encapsulada para ser testável.
- A confirmação é **assíncrona** (retorna `Promise<boolean>`).
- Respostas aceitas como "sim": `y`, `Y`, `yes`, `s`, `S`, `sim` (case-insensitive, trim).
- Qualquer outra coisa (incluindo vazio) = "não".
- O `cli.js` mostra visualmente o que será executado antes de perguntar (reaproveita `formatConfirmation` de M4).

## Arquivos a criar nesta fase

### `src/confirm.js`

```js
import { createInterface } from "node:readline";

const YES_INPUTS = new Set(["y", "Y", "yes", "YES", "s", "S", "sim", "SIM", "Sim"]);

/**
 * Decide se a resposta do usuário é "sim".
 * @param {string} input
 * @returns {boolean}
 */
export function isYes(input) {
  if (typeof input !== "string") return false;
  return YES_INPUTS.has(input.trim());
}

/**
 * Cria uma função `confirm(toolName, args)` baseada em readline.
 * Retorna Promise<boolean>.
 *
 * @param {object} [deps]
 * @param {function} [deps.input] - async () => string, injetável para testes
 * @param {function} [deps.output] - (s: string) => void, default console.log
 * @param {function} [deps.formatConfirmation] - (data) => string, default import de format.js
 * @returns {function} confirm(toolName, args, iteracao?) => Promise<boolean>
 */
export function createConfirm(deps = {}) {
  const input = deps.input ?? null;
  const output = deps.output ?? console.log;
  const formatConfirmation = deps.formatConfirmation ?? null;

  let rl = null;
  function getReadline() {
    if (!rl) {
      rl = createInterface({ input: process.stdin, output: process.stderr });
    }
    return rl;
  }

  function ask(question) {
    if (input) {
      // modo teste
      return Promise.resolve(input());
    }
    return new Promise((resolve) => {
      const r = getReadline();
      r.question(question, (answer) => resolve(answer));
    });
  }

  return async function confirm(toolName, args, iteracao) {
    if (formatConfirmation) {
      output(formatConfirmation({ iteracao, tool: toolName, args }));
    }
    const answer = await ask("> ");
    return isYes(answer);
  };
}
```

## Decisões de design

1. **`input` injetável**: em testes, passa-se uma função que retorna a próxima resposta da fila. Em produção, usa `readline` real.
2. **`formatConfirmation` injetável**: evita import direto de `format.js` dentro de `confirm.js` — mantém módulos desacoplados e testáveis. O `cli.js` passa a referência.
3. **`readline` lazy**: só é criado quando a primeira confirmação é pedida. Assim, execuções sem tools sensíveis não penduram o processo esperando stdin.
4. **Português aceito**: `s`/`sim` além de `y`/`yes` — conveniência para o usuário brasileiro.
5. **`stderr` para o prompt**: o `readline.question` escreve no output passado; usar `stderr` mantém `stdout` limpo para saída parseable.
6. **Qualquer resposta não-sim = não**: mais seguro que o inverso.

## Testes unitários — `test/confirm.test.js`

```js
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
```

## Como integrar com o `runAgent`

No `cli.js` (M7):

```js
import { createConfirm } from "./confirm.js";
import { formatConfirmation } from "./format.js";

const confirm = createConfirm({ formatConfirmation });

await runAgent({
  ...
  confirm,
});
```

O `runAgent` (M3) já está preparado: chama `confirm(toolName, args)` só para tools sensíveis (via `isSensitive`), e usa o resultado para decidir executar ou enviar mensagem de recusa.

## Fluxo de confirmação no terminal (exemplo)

```
[iter 2] → write_file {"path":"notas.txt","content":"oi"}
[iter 2] ? confirmar write_file {"path":"notas.txt","content":"oi"} (y/n):
> y
[iter 2] ← write_file (3ms): OK: arquivo 'notas.txt' escrito (2 bytes).
```

Se recusado:

```
[iter 2] → run_bash {"command":"rm -rf /"}
[iter 2] ? confirmar run_bash {"command":"rm -rf /"} (y/n):
> n
[iter 2] ← run_bash (0ms): Usuário recusou a execução desta ferramenta.
```

## Comandos de validação da fase

```bash
npm test src/confirm.test.js
npm test                    # tudo passa
```

> Demo executável real só em M7 (precisa do `cli.js` integrado).

## Critérios de aceite da fase

- [ ] `isYes` aceita `y`/`yes`/`s`/`sim` (case e trim insensitive)
- [ ] `isYes` rejeita qualquer outra coisa (incluindo vazio e não-string)
- [ ] `createConfirm` retorna função `confirm(toolName, args, iteracao?) => Promise<boolean>`
- [ ] `input` injetável permite testes sem `readline` real
- [ ] `formatConfirmation` é opcional e injetável
- [ ] `readline` só é instanciado quando a primeira confirmação é pedida
- [ ] Resposta não-confirmada resulta em `"Usuário recusou a execução..."` como conteúdo da tool (já tratado em M3)
- [ ] Evento `tool_confirmation` com `decisao: true/false` é emitido (já em M3)

## Riscos e armadilhas

- **`readline` pendura o processo**: se criado mas nunca fechado, o Node não termina. No `cli.js`, chamar `rl.close()` ao final — ou usar `process.exit(0)` explícito. Anotar em M7.
- **EOF no stdin** (pipe, não-TTY): `readline.question` resolve com string vazia → tratado como "não". Aceitável.
- **Confirmação em loop infinito**: se o modelo continuar tentando a mesma tool sensível após recusa, o usuário pode ter que responder `n` várias vezes. O limite de iterações (M3) protege contra loop infinito real.
- **Não perguntar para `read_file`**: o `runAgent` usa `isSensitive(name)` para decidir. Garantir que essa checagem acontece antes de chamar `confirm`.

## Dependências para a próxima fase

- `createConfirm` pronto para injetar no `runAgent`
- `isYes` puro e testável
- Comportamento consistente com o que `runAgent` espera (assíncrono, retorna boolean)
