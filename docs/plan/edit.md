# Ferramenta `edit` — Substituição exata de strings em arquivos

## Objetivo

Implementar a ferramenta `edit_file` que modifica arquivos existentes via substituição exata de strings. Diferente de `write_file` (que sobrescreve o arquivo inteiro), `edit` altera apenas trechos específicos, preservando o resto do conteúdo.

## Motivação

- `write_file` exige que o modelo **regurgite o arquivo inteiro**, o que é ineficiente para mudanças pequenas e custa muitos tokens.
- `edit` permite que o modelo passe apenas a string a ser substituída e a nova string, reduzindo drasticamente o uso de tokens.
- A API do modelo usa `edit` como um "find and replace" preciso, análogo ao que o Anthropic e outras APIs oferecem.

## Princípios

- **Busca exata**: `oldString` deve ser encontrado **literalmente** no arquivo (incluindo espaços, tabs, quebras de linha).
- **Primeira ocorrência (default)**: se `replaceAll` não for informado ou for `false`, substitui apenas a primeira ocorrência.
- **Todas as ocorrências**: se `replaceAll: true`, substitui todas.
- **Erro se não encontrado**: se `oldString` não existir no arquivo, retorna erro descritivo (não altera nada).
- **Erro se múltiplas ocorrências sem `replaceAll`**: se `oldString` aparecer 2+ vezes e `replaceAll` não for `true`, retorna erro pedindo para usar `replaceAll` ou ser mais específico.
- **Executores nunca lançam** — sempre retornam string (sucesso ou erro).
- **Diretórios pais não são criados**: diferente de `write_file`, `edit` espera que o arquivo já exista.

## Schema OpenAI

```js
export const schema = {
  type: "function",
  function: {
    name: "edit_file",
    description:
      "Substitui um trecho exato de texto em um arquivo existente. " +
      "Se o texto aparecer mais de uma vez e replaceAll não for true, retorna erro. " +
      "Use esta ferramenta para edições pontuais em vez de reescrever o arquivo inteiro com write_file.",
    parameters: {
      type: "object",
      properties: {
        filePath: {
          type: "string",
          description: "Caminho absoluto do arquivo a ser modificado.",
        },
        oldString: {
          type: "string",
          description: "Trecho exato a ser substituído (deve bater literalmente, incluindo indentação).",
        },
        newString: {
          type: "string",
          description: "Novo texto que substituirá oldString.",
        },
        replaceAll: {
          type: "boolean",
          description: "Se true, substitui TODAS as ocorrências de oldString. Default: false (apenas a primeira).",
        },
      },
      required: ["filePath", "oldString", "newString"],
    },
  },
};
```

## Comportamento detalhado

### Fluxo principal

```
1. Valida parâmetros obrigatórios (filePath, oldString, newString).
2. Lê o arquivo em string UTF-8.
3. Conta ocorrências de oldString no conteúdo.
4. Se 0 ocorrências → ERRO: "texto não encontrado no arquivo".
5. Se > 1 ocorrências e replaceAll !== true → ERRO: "texto encontrado X vezes; use replaceAll:true ou refine oldString".
6. Aplica substituição(ões).
7. Escreve o arquivo com o novo conteúdo.
8. Retorna OK com número de substituições e bytes alterados.
```

### Casos de borda

| Situação | Resultado |
|---|---|
| `oldString` vazio | ERRO: "oldString não pode ser vazio" |
| Arquivo não existe | ERRO: "arquivo '...' não encontrado" |
| `oldString` aparece 0 vezes | ERRO: "texto não encontrado em '...'. Verifique o conteúdo exato (indentação, espaços, quebras de linha)." |
| `oldString` aparece 3x, `replaceAll: false` (default) | ERRO: "texto encontrado 3 vezes. Use replaceAll:true para substituir todas ou refine oldString com mais contexto para torná-lo único." |
| `oldString` aparece 3x, `replaceAll: true` | OK com 3 substituições |
| `oldString` aparece 1x | OK com 1 substituição (replaceAll irrelevante) |
| Erro de I/O (permissão, disco cheio, etc.) | ERRO com mensagem do sistema |

### Exemplo de execução

**Arquivo original (`src/config.js`):**
```js
const port = 3000;
const host = "localhost";
// port aparece de novo aqui: port
```

**Chamada:**
```json
{
  "filePath": "/home/user/project/src/config.js",
  "oldString": "const port = 3000;",
  "newString": "const port = 8080;"
}
```

**Resultado:**
```
OK: arquivo 'src/config.js' editado (1 substituição, 3 bytes alterados).
```

**Chamada com conflito:**
```json
{
  "filePath": "/home/user/project/src/config.js",
  "oldString": "port",
  "newString": "serverPort"
}
```

**Resultado (erro):**
```
ERRO: 'port' encontrado 3 vezes em 'src/config.js'. Use replaceAll:true para substituir todas ou refine oldString com mais contexto.
```

**Chamada com replaceAll:**
```json
{
  "filePath": "/home/user/project/src/config.js",
  "oldString": "port",
  "newString": "serverPort",
  "replaceAll": true
}
```

**Resultado:**
```
OK: arquivo 'src/config.js' editado (3 substituições, 9 bytes alterados).
```

## Segurança

- `sensitive: true` — modifica arquivos em disco.
- `shouldConfirm: (args) => !isPathWithinCwd(args?.filePath)` — confirma apenas se o caminho sai do diretório de trabalho.
- `summarize(args)`: retorna `args.filePath`.

## Registro no `toolRegistry`

```js
edit_file: {
  schema: edit.schema,
  execute: edit.execute,
  sensitive: edit.sensitive,
  summarize: edit.summarize,
  shouldConfirm: edit.shouldConfirm,
}
```

## Atualizações no agente

### `src/agent.js` — SYSTEM_PROMPT

Adicionar `edit_file` à lista de ferramentas:

```
Você tem acesso às ferramentas: read_file, write_file, edit_file, run_bash.
- Use edit_file para modificar trechos específicos de arquivos existentes sem reescrevê-los inteiros.
- Se o texto a substituir aparecer várias vezes, use replaceAll:true ou refine oldString com mais contexto.
```

### `src/format.js` — Visual

No evento `tool_decision`:
```js
if (data.tool === "edit_file") {
  const path = data.args?.filePath ?? data.error ?? "?";
  stdout.write(`${GRAY}-> Edit file ${path}${RESET}\n`);
}
```

No evento `tool_execution`:
- Não mostrar output completo (como `read_file` e `write_file`).
- Apenas o resultado resumido (OK/ERRO) que já vem do executor.

## Testes

### `test/tools/edit.test.js`

```js
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execute, shouldConfirm } from "../../src/tools/edit.js";

let tmpDir;
beforeEach(() => { tmpDir = mkdtempSync(join(tmpdir(), "agent-")); });
afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

function write(p, content) {
  writeFileSync(p, content, "utf8");
}

describe("edit.execute", () => {
  it("substitui primeira ocorrência", () => {
    const p = join(tmpDir, "f.txt");
    write(p, "abc def abc");
    const res = execute({ filePath: p, oldString: "abc", newString: "xyz" });
    expect(res).toMatch(/OK/);
    expect(res).toMatch(/1 substituição/);
    expect(readFileSync(p, "utf8")).toBe("xyz def abc");
  });

  it("replaceAll substitui todas as ocorrências", () => {
    const p = join(tmpDir, "f.txt");
    write(p, "abc abc abc");
    execute({ filePath: p, oldString: "abc", newString: "x", replaceAll: true });
    expect(readFileSync(p, "utf8")).toBe("x x x");
  });

  it("erro se oldString não encontrado", () => {
    const p = join(tmpDir, "f.txt");
    write(p, "hello world");
    const res = execute({ filePath: p, oldString: "naoexiste", newString: "x" });
    expect(res).toMatch(/não encontrado/);
  });

  it("erro se múltiplas ocorrências sem replaceAll", () => {
    const p = join(tmpDir, "f.txt");
    write(p, "dup dup dup");
    const res = execute({ filePath: p, oldString: "dup", newString: "x" });
    expect(res).toMatch(/encontrado 3 vezes/);
    expect(res).toMatch(/replaceAll/);
  });

  it("arquivo permanece inalterado se oldString não encontrado", () => {
    const p = join(tmpDir, "f.txt");
    write(p, "original");
    execute({ filePath: p, oldString: "naoexiste", newString: "x" });
    expect(readFileSync(p, "utf8")).toBe("original");
  });

  it("erro se arquivo não existe", () => {
    const p = join(tmpDir, "inexistente.txt");
    const res = execute({ filePath: p, oldString: "a", newString: "b" });
    expect(res).toMatch(/não encontrado|ERRO/);
  });

  it("erro se oldString vazio", () => {
    const p = join(tmpDir, "f.txt");
    write(p, "conteudo");
    const res = execute({ filePath: p, oldString: "", newString: "x" });
    expect(res).toMatch(/vazio/);
  });

  it("erro se filePath não fornecido", () => {
    expect(execute({ oldString: "a", newString: "b" })).toMatch(/'filePath'/);
  });

  it("erro se oldString não fornecido", () => {
    expect(execute({ filePath: "f.txt", newString: "b" })).toMatch(/'oldString'/);
  });

  it("erro se newString não fornecido", () => {
    expect(execute({ filePath: "f.txt", oldString: "a" })).toMatch(/'newString'/);
  });

  it("lida com quebras de linha no oldString", () => {
    const p = join(tmpDir, "f.txt");
    write(p, "linha1\nlinha2\nlinha3\n");
    execute({ filePath: p, oldString: "linha2\n", newString: "novalinha\n" });
    expect(readFileSync(p, "utf8")).toBe("linha1\nnovalinha\nlinha3\n");
  });

  it("lida com caracteres especiais e indentação", () => {
    const p = join(tmpDir, "f.txt");
    write(p, "  const x = `template ${var}`;\n");
    execute({ filePath: p, oldString: "  const x = `template ${var}`;", newString: "  const y = 42;" });
    expect(readFileSync(p, "utf8")).toBe("  const y = 42;\n");
  });
});

describe("edit.shouldConfirm", () => {
  it("path dentro do cwd nao requer confirmacao", () => {
    expect(shouldConfirm({ filePath: "package.json" })).toBe(false);
  });

  it("path com .. fora do cwd requer confirmacao", () => {
    expect(shouldConfirm({ filePath: "../etc/passwd" })).toBe(true);
  });

  it("path absoluto fora do cwd requer confirmacao", () => {
    expect(shouldConfirm({ filePath: "/tmp/foo.txt" })).toBe(true);
  });

  it("path ausente requer confirmacao (fallback seguro)", () => {
    expect(shouldConfirm({})).toBe(true);
    expect(shouldConfirm({ filePath: null })).toBe(true);
    expect(shouldConfirm({ filePath: "" })).toBe(true);
  });
});
```

## Implementação (`src/tools/edit.js`)

```js
import { readFileSync, writeFileSync } from "node:fs";
import { isPathWithinCwd } from "../permissions.js";

export const schema = {
  type: "function",
  function: {
    name: "edit_file",
    description:
      "Substitui um trecho exato de texto em um arquivo existente. " +
      "Se o texto aparecer mais de uma vez e replaceAll não for true, retorna erro. " +
      "Use esta ferramenta para edições pontuais em vez de reescrever o arquivo inteiro.",
    parameters: {
      type: "object",
      properties: {
        filePath: { type: "string", description: "Caminho absoluto do arquivo a ser modificado." },
        oldString: { type: "string", description: "Trecho exato a ser substituído (deve bater literalmente, incluindo indentação e espaços)." },
        newString: { type: "string", description: "Novo texto que substituirá oldString." },
        replaceAll: { type: "boolean", description: "Se true, substitui TODAS as ocorrências de oldString. Default: false (apenas a primeira)." },
      },
      required: ["filePath", "oldString", "newString"],
    },
  },
};

export const sensitive = true;

export const shouldConfirm = (args) => !isPathWithinCwd(args?.filePath);

export function summarize(args) {
  return args.filePath;
}

export function execute({ filePath, oldString, newString, replaceAll }) {
  if (!filePath) return "ERRO: parâmetro 'filePath' é obrigatório.";
  if (oldString === undefined || oldString === null) return "ERRO: parâmetro 'oldString' é obrigatório.";
  if (newString === undefined || newString === null) return "ERRO: parâmetro 'newString' é obrigatório.";

  if (oldString === "") return "ERRO: 'oldString' não pode ser vazio.";

  try {
    const original = readFileSync(filePath, "utf8");

    const count = (original.match(new RegExp(oldString.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;

    if (count === 0) {
      return `ERRO: texto não encontrado em '${filePath}'. Verifique o conteúdo exato (indentação, espaços, quebras de linha).`;
    }

    if (count > 1 && !replaceAll) {
      return `ERRO: '${oldString}' encontrado ${count} vezes em '${filePath}'. Use replaceAll:true para substituir todas ou refine oldString com mais contexto para torná-lo único.`;
    }

    const escaped = oldString.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(escaped, replaceAll ? "g" : "");
    const modified = original.replace(pattern, newString);

    const oldBytes = Buffer.byteLength(original, "utf8");
    const newBytes = Buffer.byteLength(modified, "utf8");
    const diff = newBytes - oldBytes;

    writeFileSync(filePath, modified, "utf8");
    const plural = count === 1 ? "substituição" : "substituições";
    return `OK: arquivo '${filePath}' editado (${count} ${plural}, ${diff >= 0 ? "+" : ""}${diff} bytes).`;
  } catch (e) {
    if (e.code === "ENOENT") {
      return `ERRO: arquivo '${filePath}' não encontrado.`;
    }
    return `ERRO ao editar '${filePath}': ${e.message}`;
  }
}
```

## Critérios de aceite

- [ ] `execute` retorna OK com contagem de substituições e delta de bytes.
- [ ] Substitui apenas a primeira ocorrência quando `replaceAll` é false/ausente.
- [ ] Substitui todas as ocorrências quando `replaceAll: true`.
- [ ] Retorna erro se `oldString` não for encontrado (e não modifica o arquivo).
- [ ] Retorna erro se múltiplas ocorrências sem `replaceAll`.
- [ ] Retorna erro se `oldString` for vazio.
- [ ] Retorna erro se arquivo não existir.
- [ ] Lida com caracteres especiais de regex (escaping correto).
- [ ] Lida com quebras de linha no `oldString`.
- [ ] `shouldConfirm` segue a mesma política de `write_file`.
- [ ] Nenhum executor lança exceção — erros viram strings.
- [ ] Testes cobrem todos os casos acima.
- [ ] Testes usam diretórios temporários (`mkdtempSync`).
