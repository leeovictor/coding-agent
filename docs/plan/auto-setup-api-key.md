# Auto-configuração da API Key na primeira execução

## Problema resolvido

Hoje, sem `.env`, o CLI lança `"OPENROUTER_API_KEY não configurada."` e aborta.
O usuário precisa manualmente criar o `.env` — descoberta frustrante.

## Nova proposta

Na primeira execução (em qualquer diretório), se nenhuma chave for encontrada:

1. Mostra mensagem amigável: `"Nenhuma chave de API configurada."`
2. Fornece instrução de onde obter a chave (https://openrouter.ai/keys)
3. Solicita a chave OpenRouter via prompt (readline puro ou @inquirer)
4. Salva no `.env` do projeto (persistente, relativo ao script)
5. Segue execução normal

## Comportamento por cenário

| Cenário | Resultado |
|---|---|
| `OPENROUTER_API_KEY` já está em `process.env` | Usa direto, sem prompt |
| `.env` existe com a chave (CWD ou diretório do script) | Usa direto, sem prompt |
| Nenhuma chave encontrada | Mensagem → prompt → salva `.env` → segue |
| Usuário quer trocar a chave | `/connect` (reusa mesma lógica) |

## Arquivos

| Arquivo | Ação |
|---|---|
| `src/env.js` | Adicionar `saveEnvVar(key, value)` |
| `src/openrouter.js` | Adicionar `setApiKey(key)` e `clearApiKey()` |
| `src/ensureKey.js` | **Novo** — `ensureApiKey()`: detecta ausência → avisa → prompt → persiste |
| `src/cli.js` | Chamar `ensureApiKey()` antes de executar tarefa |
| `src/repl.js` | Chamar `ensureApiKey()` ao entrar no REPL; adicionar `/connect` e `/disconnect` |

## Fluxo `ensureApiKey()`

```
ensureApiKey()
  ├─ getApiKey() retorna algo? → SIM → retorna (segue normal)
  │
  └─ NÃO → print("Nenhuma chave de API configurada.")
           print("Obtenha uma em: https://openrouter.ai/keys")
           prompt("Digite sua chave OpenRouter: ")
           saveEnvVar("OPENROUTER_API_KEY", key)  → .env persistente
           setApiKey(key)                          → memória
           print("Chave salva em .env ✓")
```

## Detalhamento

### `src/env.js` — saveEnvVar

```js
export function saveEnvVar(key, value, filePath) {
  // Se filePath não fornecido, resolve .env relativo ao script (import.meta.url)
  // Lê conteúdo existente
  // Se key já existe, substitui valor (apenas a linha da key)
  // Se não existe, adiciona ao final
  // Escreve de volta
  // Silencia erros de escrita (permissão, etc)
}
```

### `src/openrouter.js` — setApiKey / clearApiKey

```js
export function setApiKey(key) {
  process.env.OPENROUTER_API_KEY = key;
  env.OPENROUTER_API_KEY = key;
}

export function clearApiKey() {
  delete process.env.OPENROUTER_API_KEY;
  delete env.OPENROUTER_API_KEY;
}
```

### `src/ensureKey.js` — novo módulo

```js
import { createInterface } from "node:readline";
import { getApiKey, setApiKey } from "./openrouter.js";
import { saveEnvVar } from "./env.js";

export async function ensureApiKey() {
  if (getApiKey()) return;
  // Cria readline, pergunta, salva, atualiza memória
}
```

### REPL — comandos

Além do `ensureApiKey()` na inicialização:

- **`/connect [chave]`** — reusa `saveEnvVar` + `setApiKey` para trocar chave
- **`/disconnect`** — remove do `.env` e limpa memória
- **`/help`** atualizado com os novos comandos

## Considerações

- **TTY**: se `stdin` não for TTY (pipe), o prompt do `readline` falha. Usar `process.stdin.isTTY` para detectar e dar erro claro: *"Nenhuma chave configurada. Defina OPENROUTER_API_KEY no ambiente ou use --connect KEY."*
- **`.gitignore`**: `.env` já está no `.gitignore`
- **Prompt library**: `@inquirer/prompts` já é dependência do projeto, mas para o bootstrap inicial podemos usar `readline` puro (zero setup adicional, mais previsível)

## Perguntas abertas

1. Prompt: `readline` puro ou `@inquirer/prompts` com input mascarado?
2. Modo direto (`cli-agent "faça X"`): aceitar `--connect KEY` como argumento de linha de comando?
3. Validar chave com chamada `GET /v1/models` antes de salvar?
