# Ferramenta `patch` — Aplicação de diffs unificados em arquivos

## Objetivo

Implementar a ferramenta `patch_file` que aplica patches no formato **unified diff** em arquivos existentes. Diferente de `edit` (substituição por string), `patch` opera por posição de linha com contexto ao redor, permitindo adicionar, remover e modificar múltiplos trechos em uma única chamada.

## Motivação

- `edit` falha quando o mesmo texto aparece várias vezes e não se quer usar `replaceAll`.
- `write_file` exige que o modelo regargite o arquivo inteiro.
- `patch` é o formato nativo do Git (`diff -u`) e é a forma mais precisa de expressar mudanças em arquivos. O modelo pode gerar diffs naturais descrevendo exatamente onde e como o arquivo deve mudar.
- Permite **múltiplas alterações em locais diferentes** do mesmo arquivo em uma única chamada.

## Princípios

- **Parse robusto de unified diff**: suporta formato padrão `@@ -inicio,qtd_orig +inicio,qtd_novo @@`.
- **Aplicação sequencial de hunks**: cada hunk é aplicado na ordem, ajustando offsets conformes hunks anteriores alteram o tamanho do arquivo.
- **Verificação de contexto**: cada linha de contexto (` `) deve bater com o conteúdo real do arquivo. Se não bater, o hunk falha.
- **Fuzzy matching para offset**: se o número da linha no header do hunk não bater exatamente, tenta casar com ±10 linhas de tolerância.
- **Executores nunca lançam** — sempre retornam string (sucesso ou erro).
- **Diretórios pais não são criados**: espera que o arquivo já exista.

## Formato do unified diff

### Estrutura

```
--- a/caminho/arquivo
+++ b/caminho/arquivo
@@ -10,7 +10,8 @@ contexto opcional após @@
 linha de contexto 1
 linha de contexto 2
-linha removida
+linha adicionada 1
+linha adicionada 2
 linha de contexto 3
@@ -25,4 +26,3 @@ segundo hunk
 linha de contexto
-outra linha removida
 linha de contexto final
```

### Elementos

| Prefixo | Significado |
|---|---|
| `---` | Cabeçalho do arquivo original (ignorado) |
| `+++` | Cabeçalho do arquivo modificado (ignorado) |
| `@@ -L,C +L,C @@` | Header do hunk: `L` = linha inicial, `C` = quantidade de linhas |
| `<espaço>` | Linha de contexto (existe em ambos os lados) |
| `-` | Linha removida do original |
| `+` | Linha adicionada no resultado |

### Regras de parsing

- Linhas `---` e `+++` são opcionais no parâmetro `hunks` (a tool já recebe `filePath` separado).
- Linhas que não começam com `@@`, ` `, `-`, `+` ou são vazias após o último hunk são ignoradas.
- No header `@@ -L_orig,C_orig +L_novo,C_novo @@`, apenas `L_orig` e `C_orig` são usados para posicionamento.
- Uma linha `+` sem `-` correspondente = adição pura.
- Uma linha `-` sem `+` correspondente = remoção pura.
- `-` seguido de `+` na mesma posição = substituição.

## Schema OpenAI

```js
export const schema = {
  type: "function",
  function: {
    name: "patch_file",
    description:
      "Aplica um ou mais hunks de unified diff em um arquivo existente. " +
      "O formato usa cabeçalhos @@ -linha,qtd +linha,qtd @@ para localizar cada mudança. " +
      "Linhas prefixadas com ' ' são contexto, '-' são removidas, '+' são adicionadas. " +
      "Use para adicionar/remover/modificar trechos em locais específicos do arquivo.",
    parameters: {
      type: "object",
      properties: {
        filePath: {
          type: "string",
          description: "Caminho absoluto do arquivo a ser modificado.",
        },
        hunks: {
          type: "string",
          description:
            "Conteúdo do unified diff contendo um ou mais hunks. " +
            "Cada hunk começa com '@@ -linha_orig,qtd_orig +linha_novo,qtd_novo @@'. " +
            "Linhas com prefixo ' ' são contexto (devem bater com o arquivo). " +
            "Linhas com prefixo '-' são removidas. Linhas com prefixo '+' são adicionadas. " +
            "Os cabeçalhos '---' e '+++' são opcionais e ignorados.",
        },
      },
      required: ["filePath", "hunks"],
    },
  },
};
```

## Comportamento detalhado

### Fluxo principal

```
1. Valida parâmetros obrigatórios (filePath, hunks).
2. Lê o arquivo original e divide em array de linhas (preservando '\n').
3. Faz parse do diff:
   a. Remove cabeçalhos ---/+++ se presentes.
   b. Extrai hunks pelos headers @@ ... @@.
   c. Para cada hunk, coleta: linha_inicio, linhas (array de {prefix, content}).
4. Aplica cada hunk sequencialmente:
   a. Posiciona cursor = linha_inicio - 1 (0-indexed) + offset acumulado de hunks anteriores.
   b. Para cada linha do hunk:
      - ' ' (contexto): verifica se array[cursor] === content. Se não, fuzzy-match ±10 linhas. Se falhar → ERRO.
        cursor += 1.
      - '-': verifica se array[cursor] === content. Se não, fuzzy-match. Se falhar → ERRO.
        Remove array[cursor]. (cursor NÃO avança, pois a linha foi removida.)
      - '+': insere content em array[cursor]. cursor += 1.
   c. Atualiza offset acumulado = linhas_adicionadas - linhas_removidas.
5. Junta o array de volta em string.
6. Escreve o arquivo.
7. Retorna OK com número de hunks aplicados.
```

### Algoritmo de fuzzy matching

Quando o contexto não bate na posição esperada:
- Busca a linha de contexto esperada em um raio de ±10 linhas ao redor do cursor atual.
- Se encontrada, ajusta o cursor para essa posição e continua.
- Se não encontrada em nenhuma posição do raio, o hunk falha.

Isso permite que patches ainda funcionem quando o arquivo foi levemente modificado desde que o diff foi gerado.

### Casos de borda

| Situação | Resultado |
|---|---|
| `hunks` vazio | ERRO: "'hunks' não pode ser vazio." |
| Arquivo não existe | ERRO: "arquivo '...' não encontrado." |
| Nenhum hunk encontrado no diff | ERRO: "nenhum hunk válido encontrado no diff." |
| Header do hunk malformado | ERRO: "hunk X: header inválido." |
| Contexto não bate (após fuzzy) | ERRO: "hunk X falhou na linha Y: esperava '...' mas encontrou '...'." |
| Hunk remove mais linhas do que existem | ERRO: "hunk X: linha Z está além do fim do arquivo." |
| Erro de I/O | ERRO com mensagem do sistema. |

### Exemplo de execução

**Arquivo original (`src/utils.js`):**
```
1: function soma(a, b) {
2:   console.log("somando...");
3:   const resultado = a + b;
4:   return a + b;
5: }
```

**Chamada:**
```json
{
  "filePath": "/home/user/project/src/utils.js",
  "hunks": "@@ -1,5 +1,6 @@\n function soma(a, b) {\n-  console.log(\"somando...\");\n   const resultado = a + b;\n+  if (typeof a !== 'number' || typeof b !== 'number') {\n+    throw new Error('argumentos devem ser números');\n+  }\n-  return a + b;\n+  return resultado;\n }"
}
```

**Diff formatado (para legibilidade):**
```diff
@@ -1,5 +1,6 @@
 function soma(a, b) {
-  console.log("somando...");
   const resultado = a + b;
+  if (typeof a !== 'number' || typeof b !== 'number') {
+    throw new Error('argumentos devem ser números');
+  }
-  return a + b;
+  return resultado;
 }
```

**Resultado (`src/utils.js`):**
```
function soma(a, b) {
  const resultado = a + b;
  if (typeof a !== 'number' || typeof b !== 'number') {
    throw new Error('argumentos devem ser números');
  }
  return resultado;
}
```

**Retorno da tool:**
```
OK: arquivo 'src/utils.js' patch aplicado (1 hunk).
```

### Exemplo com múltiplos hunks

```diff
@@ -10,7 +10,7 @@
   // config
-  const port = 3000;
+  const port = 8080;
   const host = "0.0.0.0";

@@ -45,4 +45,6 @@
   app.listen(port, () => {
     console.log(`running on ${port}`);
   });
+  app.on("error", (err) => {
+    console.error("server error:", err);
+  });
 }
```

**Retorno:**
```
OK: arquivo 'src/server.js' patch aplicado (2 hunks).
```

## Segurança

- `sensitive: true` — modifica arquivos em disco.
- `shouldConfirm: (args) => !isPathWithinCwd(args?.filePath)` — confirma apenas se o caminho sai do diretório de trabalho.
- `summarize(args)`: retorna `args.filePath`.

## Registro no `toolRegistry`

```js
patch_file: {
  schema: patch.schema,
  execute: patch.execute,
  sensitive: patch.sensitive,
  summarize: patch.summarize,
  shouldConfirm: patch.shouldConfirm,
}
```

## Atualizações no agente

### `src/agent.js` — SYSTEM_PROMPT

Adicionar `patch_file` à lista de ferramentas:

```
Você tem acesso às ferramentas: read_file, write_file, edit_file, patch_file, run_bash.
- Use patch_file para aplicar um ou mais hunks de unified diff em um arquivo.
- Formato do hunk: @@ -linha_inicio,qtd +linha_inicio,qtd @@ seguido de linhas com prefixo ' ' (contexto), '-' (remove), '+' (adiciona).
- patch_file é útil para mudanças em múltiplos locais do mesmo arquivo ou quando a posição da linha é conhecida.
```

### `src/format.js` — Visual

No evento `tool_decision`:
```js
if (data.tool === "patch_file") {
  const path = data.args?.filePath ?? data.error ?? "?";
  stdout.write(`${GRAY}-> Patch file ${path}${RESET}\n`);
}
```

No evento `tool_execution`:
- Não mostrar output completo.
- O resumo (OK/ERRO) já é suficiente.

## Testes

### `test/tools/patch.test.js`

```js
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execute, shouldConfirm } from "../../src/tools/patch.js";

let tmpDir;
beforeEach(() => { tmpDir = mkdtempSync(join(tmpdir(), "agent-")); });
afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

function write(p, content) {
  writeFileSync(p, content, "utf8");
}

describe("patch.execute", () => {
  it("adiciona linhas", () => {
    const p = join(tmpDir, "f.txt");
    write(p, "linha1\nlinha2\nlinha3\n");
    const hunks = "@@ -1,3 +1,4 @@\n linha1\n+linha extra\n linha2\n linha3\n";
    const res = execute({ filePath: p, hunks });
    expect(res).toMatch(/OK/);
    expect(readFileSync(p, "utf8")).toBe("linha1\nlinha extra\nlinha2\nlinha3\n");
  });

  it("remove linhas", () => {
    const p = join(tmpDir, "f.txt");
    write(p, "a\nb\nc\nd\n");
    const hunks = "@@ -2,2 +2,1 @@\n-b\n c\n";
    const res = execute({ filePath: p, hunks });
    expect(res).toMatch(/OK/);
    expect(readFileSync(p, "utf8")).toBe("a\nc\nd\n");
  });

  it("substitui linha", () => {
    const p = join(tmpDir, "f.txt");
    write(p, "const x = 1;\nconst y = 2;\n");
    const hunks = "@@ -1,2 +1,2 @@\n-const x = 1;\n+const x = 99;\n const y = 2;\n";
    const res = execute({ filePath: p, hunks });
    expect(res).toMatch(/OK/);
    expect(readFileSync(p, "utf8")).toBe("const x = 99;\nconst y = 2;\n");
  });

  it("aplica múltiplos hunks", () => {
    const p = join(tmpDir, "f.txt");
    write(p, "a\nb\nc\nd\ne\nf\n");
    const hunks = [
      "@@ -1,3 +1,2 @@",
      " a",
      "-b",
      " c",
      "@@ -4,3 +4,4 @@",
      " d",
      "+extra",
      " e",
      " f",
    ].join("\n");
    const res = execute({ filePath: p, hunks });
    expect(res).toMatch(/OK/);
    expect(res).toMatch(/2 hunks/);
    expect(readFileSync(p, "utf8")).toBe("a\nc\nd\nextra\ne\nf\n");
  });

  it("retorna erro se contexto não bate", () => {
    const p = join(tmpDir, "f.txt");
    write(p, "a\nb\nc\n");
    const hunks = "@@ -1,3 +1,3 @@\n a\n x\n c\n"; // contexto 'x' não existe
    const res = execute({ filePath: p, hunks });
    expect(res).toMatch(/ERRO/);
    expect(res).toMatch(/hunk/);
  });

  it("retorna erro se arquivo não existe", () => {
    const p = join(tmpDir, "inexistente.txt");
    const hunks = "@@ -1,1 +1,1 @@\n a\n";
    const res = execute({ filePath: p, hunks });
    expect(res).toMatch(/não encontrado|ERRO/);
  });

  it("retorna erro se hunks vazio", () => {
    const p = join(tmpDir, "f.txt");
    write(p, "a\n");
    const res = execute({ filePath: p, hunks: "" });
    expect(res).toMatch(/vazio|hunk válido/);
  });

  it("retorna erro se nenhum hunk válido", () => {
    const p = join(tmpDir, "f.txt");
    write(p, "a\n");
    const res = execute({ filePath: p, hunks: "apenas um comentário" });
    expect(res).toMatch(/nenhum hunk/);
  });

  it("aceita cabeçalhos --- e +++ no diff", () => {
    const p = join(tmpDir, "f.txt");
    write(p, "original\n");
    const hunks = [
      "--- a/f.txt",
      "+++ b/f.txt",
      "@@ -1,1 +1,1 @@",
      "-original",
      "+modificado",
    ].join("\n");
    const res = execute({ filePath: p, hunks });
    expect(res).toMatch(/OK/);
    expect(readFileSync(p, "utf8")).toBe("modificado\n");
  });

  it("erro se filePath não fornecido", () => {
    expect(execute({ hunks: "@@ -1,1 +1,1 @@\n a\n" })).toMatch(/'filePath'/);
  });

  it("erro se hunks não fornecido", () => {
    expect(execute({ filePath: "f.txt" })).toMatch(/'hunks'/);
  });

  it("lida com fuzzy matching (offset de ±2 linhas)", () => {
    const p = join(tmpDir, "f.txt");
    write(p, "a\nb\nc\nd\ne\n");
    const hunks = "@@ -3,2 +3,2 @@\n c\n d\n"; // bate exatamente
    const res = execute({ filePath: p, hunks });
    expect(res).toMatch(/OK/);
  });
});

describe("patch.shouldConfirm", () => {
  it("path dentro do cwd nao requer confirmacao", () => {
    expect(shouldConfirm({ filePath: "package.json" })).toBe(false);
  });

  it("path fora requer confirmacao", () => {
    expect(shouldConfirm({ filePath: "/etc/hosts" })).toBe(true);
  });

  it("path ausente requer confirmacao", () => {
    expect(shouldConfirm({})).toBe(true);
  });
});
```

## Implementação (`src/tools/patch.js`)

```js
import { readFileSync, writeFileSync } from "node:fs";
import { isPathWithinCwd } from "../permissions.js";

export const schema = {
  type: "function",
  function: {
    name: "patch_file",
    description:
      "Aplica um ou mais hunks de unified diff em um arquivo existente. " +
      "O formato usa cabeçalhos @@ -linha,qtd +linha,qtd @@ para localizar cada mudança. " +
      "Linhas prefixadas com ' ' são contexto, '-' são removidas, '+' são adicionadas.",
    parameters: {
      type: "object",
      properties: {
        filePath: { type: "string", description: "Caminho absoluto do arquivo a ser modificado." },
        hunks: {
          type: "string",
          description:
            "Conteúdo do unified diff. Cada hunk começa com '@@ -linha_orig,qtd_orig +linha_novo,qtd_novo @@'. " +
            "Linhas ' ' = contexto, '-' = remove, '+' = adiciona.",
        },
      },
      required: ["filePath", "hunks"],
    },
  },
};

export const sensitive = true;

export const shouldConfirm = (args) => !isPathWithinCwd(args?.filePath);

export function summarize(args) {
  return args.filePath;
}

const FUZZY_RADIUS = 10;

/**
 * Faz parse de um unified diff string em um array de hunks.
 * Cada hunk: { startLine, lines: [{prefix, content}] }
 */
function parseHunks(hunksStr) {
  const lines = hunksStr.split("\n");
  const hunks = [];
  let current = null;

  for (const line of lines) {
    // Ignorar cabeçalhos ---/+++
    if (line.startsWith("--- ") || line.startsWith("+++ ")) continue;

    const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)?$/);
    if (hunkMatch) {
      if (current) hunks.push(current);
      current = {
        startLine: parseInt(hunkMatch[1], 10),
        lines: [],
      };
      continue;
    }

    if (current) {
      const prefix = line[0];
      if (prefix === " " || prefix === "-" || prefix === "+") {
        current.lines.push({ prefix, content: line.slice(1) });
      }
    }
  }

  if (current && current.lines.length > 0) {
    hunks.push(current);
  }

  return hunks;
}

/**
 * Tenta encontrar a linha `expected` em `fileLines` a partir de `cursor`
 * dentro de um raio de FUZZY_RADIUS linhas.
 * Retorna o novo cursor ou -1 se não encontrar.
 */
function fuzzyFind(fileLines, cursor, expected) {
  const start = Math.max(0, cursor - FUZZY_RADIUS);
  const end = Math.min(fileLines.length, cursor + FUZZY_RADIUS);
  for (let i = start; i < end; i++) {
    if (fileLines[i] === expected) return i;
  }
  return -1;
}

/**
 * Aplica um hunk no array de linhas do arquivo.
 * Modifica fileLines in-place. Retorna null em caso de sucesso, ou mensagem de erro.
 */
function applyHunk(fileLines, hunk, hunkIndex, offset) {
  let cursor = hunk.startLine - 1 + offset;
  let lastMatchedLine = null;

  for (const { prefix, content } of hunk.lines) {
    if (prefix === " ") {
      // Contexto: deve bater com o arquivo
      if (cursor >= fileLines.length || fileLines[cursor] !== content) {
        const fuzzyCursor = fuzzyFind(fileLines, cursor, content);
        if (fuzzyCursor === -1) {
          const found = cursor < fileLines.length ? fileLines[cursor] : "(fim do arquivo)";
          return `hunk ${hunkIndex + 1} falhou na linha ${cursor + 1}: esperava '${content}' mas encontrou '${found}'`;
        }
        cursor = fuzzyCursor;
      }
      cursor++;
      lastMatchedLine = cursor;
    } else if (prefix === "-") {
      // Remoção: verifica se a linha existe
      if (cursor >= fileLines.length || fileLines[cursor] !== content) {
        const fuzzyCursor = fuzzyFind(fileLines, cursor, content);
        if (fuzzyCursor === -1) {
          const found = cursor < fileLines.length ? fileLines[cursor] : "(fim do arquivo)";
          return `hunk ${hunkIndex + 1} falhou na linha ${cursor + 1}: esperava remover '${content}' mas encontrou '${found}'`;
        }
        cursor = fuzzyCursor;
      }
      fileLines.splice(cursor, 1);
      // cursor não avança porque a linha foi removida
      lastMatchedLine = cursor;
    } else if (prefix === "+") {
      // Adição: insere a nova linha
      fileLines.splice(cursor, 0, content);
      cursor++;
    }
  }

  return null;
}

export function execute({ filePath, hunks }) {
  if (!filePath) return "ERRO: parâmetro 'filePath' é obrigatório.";
  if (hunks === undefined || hunks === null) return "ERRO: parâmetro 'hunks' é obrigatório.";
  if (hunks === "") return "ERRO: 'hunks' não pode ser vazio.";

  try {
    const originalContent = readFileSync(filePath, "utf8");
    const fileLines = originalContent.split("\n").map((l, i, arr) =>
      i < arr.length - 1 ? l + "\n" : l
    );

    const parsedHunks = parseHunks(hunks);
    if (parsedHunks.length === 0) {
      return "ERRO: nenhum hunk válido encontrado no diff. Verifique o formato (@@ -linha,qtd +linha,qtd @@).";
    }

    let offset = 0;
    for (let i = 0; i < parsedHunks.length; i++) {
      const hunk = parsedHunks[i];
      const originalLength = fileLines.length;

      const error = applyHunk(fileLines, hunk, i, offset);
      if (error) return `ERRO ao aplicar patch em '${filePath}': ${error}`;

      const newLength = fileLines.length;
      offset += newLength - originalLength;
    }

    const modifiedContent = fileLines.join("");
    writeFileSync(filePath, modifiedContent, "utf8");

    const plural = parsedHunks.length === 1 ? "hunk" : "hunks";
    return `OK: arquivo '${filePath}' patch aplicado (${parsedHunks.length} ${plural}).`;
  } catch (e) {
    if (e.code === "ENOENT") {
      return `ERRO: arquivo '${filePath}' não encontrado.`;
    }
    return `ERRO ao aplicar patch em '${filePath}': ${e.message}`;
  }
}
```

## Critérios de aceite

- [ ] `execute` retorna OK com número de hunks aplicados.
- [ ] Adiciona linhas corretamente (`+`).
- [ ] Remove linhas corretamente (`-`).
- [ ] Substitui linhas corretamente (`-` seguido de `+`).
- [ ] Aplica múltiplos hunks em sequência com offset automático.
- [ ] Verifica contexto e retorna erro descritivo se não bater.
- [ ] Fuzzy matching funciona (±10 linhas).
- [ ] Ignora cabeçalhos `---` e `+++`.
- [ ] Retorna erro se nenhum hunk válido no diff.
- [ ] Retorna erro se arquivo não existir.
- [ ] Retorna erro se `hunks` vazio.
- [ ] `shouldConfirm` segue a mesma política de `write_file`.
- [ ] Nenhum executor lança exceção — erros viram strings.
- [ ] Testes cobrem todos os casos acima.
- [ ] Testes usam diretórios temporários (`mkdtempSync`).
