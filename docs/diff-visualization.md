# Visualização de Diff para write_file, edit_file e patch_file

## Objetivo

Substituir o comportamento atual (silêncio total) das ferramentas `write_file`, `edit_file` e `patch_file` no estágio `tool_execution` por uma visualização side-by-side formatada com prefixos e cores.

## Formato de exibição

Cada ferramenta renderiza um cabeçalho `← Action filepath` seguido de linhas com prefixos indicando o tipo de mudança:

| Prefixo | Significado | Cor |
|---------|------------|-----|
| `-` | Linha removida (antiga) | Vermelho |
| `+` | Linha adicionada (nova) | Verde |
| `*` | Linha inalterada (contexto) | Cinza |

Layout side-by-side: coluna esquerda (antes) e coluna direita (depois), separadas por 2 espaços. Sem truncamento.

### Exemplos

**Edit file:**
```
← Edit file src/test.js
  * const x = 1;                                    * const x = 1;
  - const y = 2;                                    + const y = 3;
  * console.log(x + y);                             * console.log(x + y);
```

**Patch file:**
```
← Patch file src/agent.js
  * import { createStreamReducer } from "./streamReduce.js";  * import { createStreamReducer } from "./streamReduce.js";
  -   }                                             
  +   onEvent("token", { type: "content", text: delta.content });  +   onEvent("token", { type: "content", text: delta.content });
  + }                                               + }
  * message = reducer.getFinalMessage();            * message = reducer.getFinalMessage();
```

**Write file:**
```
← Write file src/novo.js
  + const x = 1;
  + const y = 2;
  + console.log(x + y);
```

---

## Task 1: Exportar `parseHunks` de `src/tools/patch.js`

### Contexto
A função `parseHunks` (linha 42) é local ao módulo. `format.js` precisa importá-la para gerar o diff visual dos hunks do patch.

### Modificação
Arquivo: `src/tools/patch.js`

Linha 42, onde está:
```js
function parseHunks(hunksStr) {
```
Trocar por:
```js
export function parseHunks(hunksStr) {
```

### Verificação
```bash
npm test -- test/tools/patch.test.js
```
Deve passar sem erros.

---

## Task 2: Adicionar funções de renderização de diff em `src/format.js`

### Contexto
Adicionar 4 funções ao `src/format.js`: uma LCS para alinhamento de linhas e 3 funções de renderização (edit, patch, write). As funções devem usar as mesmas constantes de cor já existentes no arquivo (`GRAY`, `RED`, `RESET` — na linha 60-64) mais `GREEN`.

### Passo 1 — Adicionar constante `GREEN`

Arquivo: `src/format.js`, logo após a linha 62 (`const RED = ...`), adicionar:
```js
const GREEN = "\x1b[32m";
```

### Passo 2 — Adicionar import de `parseHunks`

Arquivo: `src/format.js`, no topo (linha 3), após `import { summarizeTool } from "./tools/index.js";`, adicionar:
```js
import { parseHunks } from "./tools/patch.js";
```

### Passo 3 — Adicionar função `lcsAlign`

Arquivo: `src/format.js`, após a função `preview()` (linha 11), antes de `countMatches()`, adicionar:

```js
const MIN_LEFT_WIDTH = 40;

function lcsAlign(oldLines, newLines) {
  const m = oldLines.length;
  const n = newLines.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const result = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.unshift({ type: "same", left: oldLines[i - 1], right: newLines[j - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: "added", left: "", right: newLines[j - 1] });
      j--;
    } else {
      result.unshift({ type: "removed", left: oldLines[i - 1], right: "" });
      i--;
    }
  }

  return result;
}
```

### Passo 4 — Adicionar função `renderSideBySide`

Arquivo: `src/format.js`, após `lcsAlign`, adicionar:

```js
function renderSideBySide(header, chunks) {
  const maxLeft = chunks.reduce((max, c) => {
    if (c.left) return Math.max(max, c.left.length);
    return max;
  }, 0);
  const leftWidth = Math.max(MIN_LEFT_WIDTH, maxLeft);

  const lines = [header];
  for (const chunk of chunks) {
    const prefix = chunk.type === "same" ? "*" : chunk.type === "removed" ? "-" : "+";
    const color = chunk.type === "same" ? GRAY : chunk.type === "removed" ? RED : GREEN;

    if (chunk.type === "same") {
      const leftPad = chunk.left.padEnd(leftWidth);
      lines.push(`  ${color}${prefix} ${chunk.left}${RESET}${" ".repeat(leftWidth - chunk.left.length)}  ${color}${prefix} ${chunk.right}${RESET}`);
    } else if (chunk.type === "removed") {
      const leftPad = chunk.left.padEnd(leftWidth);
      lines.push(`  ${color}${prefix} ${chunk.left}${RESET}`);
    } else {
      lines.push(`${" ".repeat(leftWidth + 2)}  ${color}${prefix} ${chunk.right}${RESET}`);
    }
  }

  return lines.join("\n") + "\n";
}
```

### Passo 5 — Adicionar `renderEditDiff`

Arquivo: `src/format.js`, após `renderSideBySide`, adicionar:

```js
export function renderEditDiff(args) {
  const filePath = args?.filePath ?? "?";
  const header = `${GRAY}← Edit file ${filePath}${RESET}`;
  const oldStr = String(args?.oldString ?? "");
  const newStr = String(args?.newString ?? "");
  const oldLines = oldStr.split("\n");
  const newLines = newStr.split("\n");
  const chunks = lcsAlign(oldLines, newLines);
  return renderSideBySide(header, chunks);
}
```

### Passo 6 — Adicionar `renderPatchDiff`

Arquivo: `src/format.js`, após `renderEditDiff`, adicionar:

```js
export function renderPatchDiff(args) {
  const filePath = args?.filePath ?? "?";
  const header = `${GRAY}← Patch file ${filePath}${RESET}`;
  const hunksStr = String(args?.hunks ?? "");
  const parsedHunks = parseHunks(hunksStr);

  const chunks = [];
  for (const hunk of parsedHunks) {
    for (const { prefix, content } of hunk.lines) {
      if (prefix === " ") {
        chunks.push({ type: "same", left: content, right: content });
      } else if (prefix === "-") {
        chunks.push({ type: "removed", left: content, right: "" });
      } else if (prefix === "+") {
        chunks.push({ type: "added", left: "", right: content });
      }
    }
  }

  return renderSideBySide(header, chunks);
}
```

### Passo 7 — Adicionar `renderWriteContent`

Arquivo: `src/format.js`, após `renderPatchDiff`, adicionar:

```js
export function renderWriteContent(args) {
  const filePath = args?.path ?? "?";
  const header = `${GRAY}← Write file ${filePath}${RESET}`;
  const contentStr = String(args?.content ?? "");
  const lines = contentStr.split("\n");

  const chunks = lines.map((line) => ({ type: "added", left: "", right: line }));
  return renderSideBySide(header, chunks);
}
```

### Verificação
O arquivo `src/format.js` deve continuar sintaticamente correto.
```bash
node --check src/format.js
```

---

## Task 3: Conectar as funções no handler `tool_execution`

### Contexto
Substituir o bloco que suprime write/edit/patch (linhas 340-342) por chamadas às novas funções.

### Modificação
Arquivo: `src/format.js`

Encontrar as linhas 340-342:
```js
        } else if (data.tool !== "write_file" && data.tool !== "edit_file" && data.tool !== "patch_file") {
          log(formatToolResult(data));
        }
```

Substituir por:
```js
        } else if (data.tool === "edit_file") {
          writeToStdout(renderEditDiff(data.args));
        } else if (data.tool === "patch_file") {
          writeToStdout(renderPatchDiff(data.args));
        } else if (data.tool === "write_file") {
          writeToStdout(renderWriteContent(data.args));
        } else {
          log(formatToolResult(data));
        }
```

### Verificação
```bash
node --check src/format.js
```

---

## Task 4: Atualizar `test/format.test.js`

### Contexto
O arquivo de teste importa funções do `format.js`. Precisa:
1. Adicionar `renderEditDiff`, `renderPatchDiff`, `renderWriteContent` nos imports
2. Substituir os testes que verificam silêncio por testes que verificam a saída de diff
3. Adicionar novos testes para patch_file e cenários de edit

### Passo 1 — Atualizar imports

Arquivo: `test/format.test.js`, linha 3-11.

Adicionar `renderEditDiff, renderPatchDiff, renderWriteContent` ao import existente:
```js
import {
  formatDecision,
  formatToolResult,
  formatConfirmation,
  formatFinal,
  formatLoopEnd,
  formatBashOutput,
  renderEditDiff,
  renderPatchDiff,
  renderWriteContent,
  createConsoleEventHandler,
} from "../src/format.js";
```

### Passo 2 — Substituir teste "tool_execution write_file permanece silencioso" (linha ~308)

Arquivo: `test/format.test.js`.

Encontrar o bloco:
```js
  it("tool_execution write_file permanece silencioso", () => {
    const calls = [];
    const writes = [];
    const handler = createConsoleEventHandler({
      log: (s) => calls.push(s),
      stdout: { write: (s) => writes.push(s) },
    });
    handler("tool_execution", { tool: "write_file", resultado: "ok", args: { path: "a.txt" } });
    expect(calls).toHaveLength(0);
    expect(writes).toHaveLength(0);
  });
```

Substituir por:
```js
  it("tool_execution write_file mostra side-by-side com prefixo +", () => {
    const calls = [];
    const writes = [];
    const handler = createConsoleEventHandler({
      log: (s) => calls.push(s),
      stdout: { write: (s) => writes.push(s) },
    });
    handler("tool_execution", {
      tool: "write_file",
      resultado: "ok",
      args: { path: "a.txt", content: "linha1\nlinha2" },
    });
    const out = writes.join("");
    expect(out).toContain("← Write file a.txt");
    expect(out).toContain("+ linha1");
    expect(out).toContain("+ linha2");
    expect(calls).toHaveLength(0);
  });
```

### Passo 3 — Substituir teste "tool_execution edit_file permanece silencioso" (linha ~320)

Encontrar o bloco:
```js
  it("tool_execution edit_file permanece silencioso", () => {
    const calls = [];
    const writes = [];
    const handler = createConsoleEventHandler({
      log: (s) => calls.push(s),
      stdout: { write: (s) => writes.push(s) },
    });
    handler("tool_execution", { tool: "edit_file", resultado: "ok", args: { filePath: "a.txt" } });
    expect(calls).toHaveLength(0);
    expect(writes).toHaveLength(0);
  });
```

Substituir por:
```js
  it("tool_execution edit_file mostra side-by-side diff", () => {
    const calls = [];
    const writes = [];
    const handler = createConsoleEventHandler({
      log: (s) => calls.push(s),
      stdout: { write: (s) => writes.push(s) },
    });
    handler("tool_execution", {
      tool: "edit_file",
      resultado: "ok",
      args: {
        filePath: "a.txt",
        oldString: "const x = 1;\nconst y = 2;",
        newString: "const x = 1;\nconst y = 3;",
      },
    });
    const out = writes.join("");
    expect(out).toContain("← Edit file a.txt");
    expect(out).toContain("* const x = 1;");
    expect(out).toContain("- const y = 2;");
    expect(out).toContain("+ const y = 3;");
    expect(calls).toHaveLength(0);
  });
```

### Passo 4 — Adicionar novos testes ANTES do bloco "tool_execution read_file mostra => Read" (antes da linha ~332)

Inserir os seguintes testes:

```js
  it("tool_execution patch_file mostra side-by-side diff dos hunks", () => {
    const calls = [];
    const writes = [];
    const handler = createConsoleEventHandler({
      log: (s) => calls.push(s),
      stdout: { write: (s) => writes.push(s) },
    });
    handler("tool_execution", {
      tool: "patch_file",
      resultado: "ok",
      args: {
        filePath: "b.txt",
        hunks: "@@ -1,3 +1,3 @@\n context\n-removed\n+added",
      },
    });
    const out = writes.join("");
    expect(out).toContain("← Patch file b.txt");
    expect(out).toContain("* context");
    expect(out).toContain("- removed");
    expect(out).toContain("+ added");
    expect(calls).toHaveLength(0);
  });

  it("tool_execution edit_file com oldString == newString mostra so contexto", () => {
    const calls = [];
    const writes = [];
    const handler = createConsoleEventHandler({
      log: (s) => calls.push(s),
      stdout: { write: (s) => writes.push(s) },
    });
    handler("tool_execution", {
      tool: "edit_file",
      resultado: "ok",
      args: {
        filePath: "c.txt",
        oldString: "const a = 1;\nconst b = 2;",
        newString: "const a = 1;\nconst b = 2;",
      },
    });
    const out = writes.join("");
    expect(out).toContain("← Edit file c.txt");
    expect(out).toContain("* const a = 1;");
    expect(out).toContain("* const b = 2;");
    expect(out).not.toContain("  - ");
    expect(out).not.toContain("  + ");
    expect(calls).toHaveLength(0);
  });

  it("tool_execution edit_file com oldString vazio mostra so adicoes", () => {
    const calls = [];
    const writes = [];
    const handler = createConsoleEventHandler({
      log: (s) => calls.push(s),
      stdout: { write: (s) => writes.push(s) },
    });
    handler("tool_execution", {
      tool: "edit_file",
      resultado: "ok",
      args: {
        filePath: "d.txt",
        oldString: "",
        newString: "const z = 9;",
      },
    });
    const out = writes.join("");
    expect(out).toContain("← Edit file d.txt");
    expect(out).toContain("+ const z = 9;");
    expect(out).not.toContain("  - ");
    expect(calls).toHaveLength(0);
  });

  it("tool_execution edit_file com newString vazio mostra so remocoes", () => {
    const calls = [];
    const writes = [];
    const handler = createConsoleEventHandler({
      log: (s) => calls.push(s),
      stdout: { write: (s) => writes.push(s) },
    });
    handler("tool_execution", {
      tool: "edit_file",
      resultado: "ok",
      args: {
        filePath: "e.txt",
        oldString: "const w = 8;",
        newString: "",
      },
    });
    const out = writes.join("");
    expect(out).toContain("← Edit file e.txt");
    expect(out).toContain("- const w = 8;");
    expect(out).not.toContain("  + ");
    expect(calls).toHaveLength(0);
  });

  it("tool_execution renderiza diff com multiplas mudancas intercaladas", () => {
    const calls = [];
    const writes = [];
    const handler = createConsoleEventHandler({
      log: (s) => calls.push(s),
      stdout: { write: (s) => writes.push(s) },
    });
    handler("tool_execution", {
      tool: "edit_file",
      resultado: "ok",
      args: {
        filePath: "f.txt",
        oldString: "a\nb\nc\nd\ne",
        newString: "a\nx\nc\ny\ne",
      },
    });
    const out = writes.join("");
    expect(out).toContain("← Edit file f.txt");
    // a: same
    expect(out).toContain("* a");
    // b → x: removed + added
    expect(out).toContain("- b");
    expect(out).toContain("+ x");
    // c: same
    expect(out).toContain("* c");
    // d → y: removed + added
    expect(out).toContain("- d");
    expect(out).toContain("+ y");
    // e: same
    expect(out).toContain("* e");
    expect(calls).toHaveLength(0);
  });
```

### Passo 5 — Adicionar testes unitários separados para as funções exportadas

Inserir um novo `describe` block após `describe("createConsoleEventHandler", ...)` mas antes do `describe("markdownWriter", ...)` ou no final do arquivo. O melhor local é após o fechamento do `describe("createConsoleEventHandler", ...)` que termina no final do arquivo.

Após a linha 619 (fim do arquivo), adicionar:

```js
describe("renderEditDiff", () => {
  it("renderiza side-by-side com prefixos e header", () => {
    const out = renderEditDiff({
      filePath: "src/x.js",
      oldString: "foo\nbar",
      newString: "foo\nbaz",
    });
    const stripped = out.replace(/\x1b\[[0-9;]*m/g, "");
    expect(stripped).toContain("← Edit file src/x.js\n");
    expect(stripped).toContain("* foo");
    expect(stripped).toContain("- bar");
    expect(stripped).toContain("+ baz");
  });

  it("lida com args vazios", () => {
    const out = renderEditDiff({});
    const stripped = out.replace(/\x1b\[[0-9;]*m/g, "");
    expect(stripped).toContain("← Edit file ?\n");
  });

  it("oldString == newString mostra tudo com *", () => {
    const out = renderEditDiff({
      filePath: "z.js",
      oldString: "a\nb",
      newString: "a\nb",
    });
    const stripped = out.replace(/\x1b\[[0-9;]*m/g, "");
    expect(stripped).toContain("* a");
    expect(stripped).toContain("* b");
    expect(stripped).not.toContain("  - ");
    expect(stripped).not.toContain("  + ");
  });

  it("oldString vazio mostra tudo com +", () => {
    const out = renderEditDiff({
      filePath: "n.js",
      oldString: "",
      newString: "nova\nlinha",
    });
    const stripped = out.replace(/\x1b\[[0-9;]*m/g, "");
    expect(stripped).toContain("+ nova");
    expect(stripped).toContain("+ linha");
    expect(stripped).not.toContain("  - ");
    expect(stripped).not.toContain("  * ");
  });

  it("newString vazio mostra tudo com -", () => {
    const out = renderEditDiff({
      filePath: "r.js",
      oldString: "velha",
      newString: "",
    });
    const stripped = out.replace(/\x1b\[[0-9;]*m/g, "");
    expect(stripped).toContain("- velha");
    expect(stripped).not.toContain("  + ");
  });
});

describe("renderPatchDiff", () => {
  it("renderiza hunks como side-by-side", () => {
    const out = renderPatchDiff({
      filePath: "src/agent.js",
      hunks: "@@ -1,3 +1,3 @@\n context\n-removed\n+added",
    });
    const stripped = out.replace(/\x1b\[[0-9;]*m/g, "");
    expect(stripped).toContain("← Patch file src/agent.js\n");
    expect(stripped).toContain("* context");
    expect(stripped).toContain("- removed");
    expect(stripped).toContain("+ added");
  });

  it("lida com hunks vazios", () => {
    const out = renderPatchDiff({ filePath: "x.js", hunks: "" });
    const stripped = out.replace(/\x1b\[[0-9;]*m/g, "");
    expect(stripped).toContain("← Patch file x.js\n");
  });

  it("lida com args vazios", () => {
    const out = renderPatchDiff({});
    const stripped = out.replace(/\x1b\[[0-9;]*m/g, "");
    expect(stripped).toContain("← Patch file ?\n");
  });

  it("renderiza hunks com multiplas linhas de cada tipo", () => {
    const out = renderPatchDiff({
      filePath: "m.js",
      hunks: "@@ -1,4 +1,5 @@\n ctx1\n-old1\n-old2\n+new1\n+new2\n ctx2",
    });
    const stripped = out.replace(/\x1b\[[0-9;]*m/g, "");
    expect(stripped).toContain("* ctx1");
    expect(stripped).toContain("- old1");
    expect(stripped).toContain("- old2");
    expect(stripped).toContain("+ new1");
    expect(stripped).toContain("+ new2");
    expect(stripped).toContain("* ctx2");
  });
});

describe("renderWriteContent", () => {
  it("renderiza conteudo com prefixo +", () => {
    const out = renderWriteContent({
      path: "novo.js",
      content: "const a = 1;\nconst b = 2;",
    });
    const stripped = out.replace(/\x1b\[[0-9;]*m/g, "");
    expect(stripped).toContain("← Write file novo.js\n");
    expect(stripped).toContain("+ const a = 1;");
    expect(stripped).toContain("+ const b = 2;");
  });

  it("lida com args vazios", () => {
    const out = renderWriteContent({});
    const stripped = out.replace(/\x1b\[[0-9;]*m/g, "");
    expect(stripped).toContain("← Write file ?\n");
  });

  it("conteudo vazio mostra header mas sem linhas", () => {
    const out = renderWriteContent({ path: "vazio.js", content: "" });
    const stripped = out.replace(/\x1b\[[0-9;]*m/g, "");
    expect(stripped).toContain("← Write file vazio.js\n");
  });
});
```

### Verificação
```bash
npm test -- test/format.test.js
```
Todos os testes devem passar.

---

## Task 5: Verificar que todos os outros testes continuam passando

### Comando
```bash
npm test
```
Deve passar com 0 failures.

---

## Task 6: Verificar sintaxe final

```bash
node --check src/format.js
node --check src/tools/patch.js
```

Ambos devem retornar sem erros.
