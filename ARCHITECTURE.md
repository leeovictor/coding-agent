# 🏗️ Arquitetura do Projeto — cli-agent

## Visão Geral

**cli-agent** é um agente de código CLI mínimo em Node.js que implementa o ciclo:

```
prompt → decisão do modelo LLM → execução de ferramenta → retorno → repetição
```

Ele **chama a API OpenRouter** de verdade e executa ferramentas de verdade no sistema de arquivos e shell. É uma versão educacional, mas funcional, do padrão usado por ferramentas como Claude Code, Cursor e Aider.

---

## Stack Técnica

| Componente | Tecnologia |
|---|---|
| **Runtime** | Node.js 18+ (usa `fetch` nativo) |
| **Testes** | Vitest (única devDependency) |
| **API LLM** | OpenRouter — endpoint compatível com OpenAI: `https://openrouter.ai/api/v1/chat/completions` |
| **Dependências de runtime** | `@inquirer/prompts` (para busca/seleção interativa de modelos) |
| **Zero dependências pesadas** | Sem SDK, sem dotenv — chamadas HTTP e parser `.env` feitos à mão |

---

## Estrutura de Diretórios

```
cli-agent/
├── package.json              # type: module, scripts: test, dev, test:integration
├── vitest.config.js          # Configuração do Vitest
├── .env                      # OPENROUTER_API_KEY, OPENROUTER_MODEL, etc.
├── .env.example              # Template do .env
├── .gitignore
├── README.md                 # Documentação de uso
├── ARCHITECTURE.md           # ← Este arquivo
├── list-files.js             # Script auxiliar para listar arquivos .js do src/
├── logs/                     # Arquivos .jsonl gerados por execução (gitignored)
├── docs/
│   ├── agent.md              # Documentação detalhada do src/agent.js
│   └── plan/                 # Documentos de planejamento por milestone (M1–M7)
├── src/
│   ├── agent.js              # → Loop principal do agente
│   ├── cli.js                # → Ponto de entrada (modo single-shot e REPL)
│   ├── repl.js               # → Modo interativo REPL
│   ├── env.js                # → Parser de arquivo .env (feito à mão)
│   ├── openrouter.js         # → Adapter para API OpenRouter
│   ├── parseResponse.js      # → Parser de respostas da API (tool_calls, content)
│   ├── streamReduce.js       # → Redutor de chunks de streaming SSE
│   ├── logger.js             # → Logger de eventos em arquivo JSONL
│   ├── format.js             # → Formatação de saída no console (colorida, markdown)
│   ├── markdownWriter.js     # → Renderizador de markdown inline com cores no terminal
│   ├── confirm.js            # → Mecanismo de confirmação (y/n) para ações sensíveis
│   ├── permissions.js        # → Verificações de permissão (bash allowlist, path safety)
│   ├── commands/
│   │   ├── models.js         # → Comando /models — seleção interativa de modelo
│   │   └── effort.js         # → Comando /effort — seleção de reasoning effort
│   └── tools/
│       ├── index.js          # → Registro central de ferramentas
│       ├── readFile.js       # → Ferramenta: ler arquivo
│       ├── writeFile.js      # → Ferramenta: escrever arquivo
│       ├── runBash.js        # → Ferramenta: executar comando bash
│       ├── edit.js           # → Ferramenta: editar arquivo (substituir trecho)
│       ├── patch.js          # → Ferramenta: aplicar unified diff
│       ├── grep.js           # → Ferramenta: buscar em arquivos com regex
│       └── glob.js           # → Ferramenta: encontrar arquivos por padrão glob
└── test/
    ├── agent.test.js
    ├── env.test.js
    ├── parseResponse.test.js
    ├── logger.test.js
    ├── format.test.js
    ├── streamReduce.test.js
    ├── repl.test.js
    ├── confirm.test.js
    ├── permissions.test.js
    ├── openrouter.test.js
    ├── tools.index.test.js
    ├── integration.test.js
    ├── commands/
    │   └── models.test.js
    └── tools/
        ├── readFile.test.js
        ├── writeFile.test.js
        ├── runBash.test.js
        ├── edit.test.js
        ├── grep.test.js
        ├── glob.test.js
        └── patch.test.js
```

---

## Fluxo Arquitetural (Visão Geral)

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CLI (cli.js / repl.js)                       │
│  Ponto de entrada: argumento único = modo single-shot              │
│  Sem argumento = modo REPL interativo                              │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ task / mensagem do usuário
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      runAgent (agent.js)                           │
│  Loop principal: prompt → API → tool_calls? → executar → repetir   │
│                                                                     │
│  Eventos emitidos via onEvent():                                    │
│    request → response → tool_decision → tool_confirmation           │
│    → tool_execution → final_content → loop_end                     │
└───────────────────────┬─────────────────────────────────────────────┘
                        │ callApi(messages, tools)
                        ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    openrouter.js (Adapter API)                      │
│  - Conecta ao endpoint /chat/completions do OpenRouter             │
│  - Suporta streaming (SSE) e non-streaming                         │
│  - Gerencia API Key, modelo ativo, reasoning effort                │
│  - listModels() para buscar modelos disponíveis                    │
└───────────────────────┬─────────────────────────────────────────────┘
                        │ resposta com tool_calls ou texto
                        ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    parseResponse.js (Parser)                        │
│  - extractToolCalls(): extrai chamadas de ferramenta da resposta   │
│  - extractContent(): extrai conteúdo textual                        │
│  - parseToolArgs(): faz parse seguro de argumentos JSON            │
│  - buildToolResultMessage(): monta mensagem de retorno role:tool   │
└───────────────────────┬─────────────────────────────────────────────┘
                        │ tool_calls a executar
                        ▼
┌─────────────────────────────────────────────────────────────────────┐
│                tools/index.js (Registro + Executor)                 │
│  Roteia para a ferramenta correta baseada no nome                  │
│  Nunca lança exceção → sempre retorna string                       │
└───┬──────────┬──────────┬──────────┬──────────┬─────────┬──────────┘
    │          │          │          │          │         │
    ▼          ▼          ▼          ▼          ▼         ▼
┌──────┐ ┌───────┐ ┌────────┐ ┌────────┐ ┌──────┐ ┌──────┐
│read  │ │write  │ │runBash │ │ edit   │ │patch │ │grep  │
│File  │ │File   │ │        │ │ File   │ │File  │ │      │
└──────┘ └───────┘ └────────┘ └────────┘ └──────┘ └──────┘
                                       ┌──────┐
                                       │glob  │
                                       └──────┘
                        │ resultados (sempre string)
                        ▼
                    ┌─────────────────────────────────────────────────┐
                    │        Eventos são roteados para:               │
                    │  1. format.js (console colorido/legível)        │
                    │  2. logger.js (arquivo JSONL para auditoria)    │
                    └─────────────────────────────────────────────────┘
```

---

## Componentes Detalhados

### 1. `src/agent.js` — Loop Principal do Agente

**Responsabilidade**: Orquestrar o ciclo `prompt → API → ferramentas → repetir`.

**Conceitos-chave**:
- **Injeção de dependências**: `callApi`, `executeTool`, `confirm`, `onEvent` são injetados — o loop não sabe sobre `fetch`, `console.log` ou arquivos.
- **`SYSTEM_PROMPT`**: constante que define o comportamento do modelo (quais ferramentas usar, como trabalhar).
- **Loop**: envia mensagens → recebe resposta → se houver `tool_calls`, executa cada uma → empilha resultados → repete.
- **Condições de parada**: modelo responde apenas texto (concluído) ou limite de iterações é atingido.

**Eventos emitidos** (via `onEvent`):

| Evento | Payload | Quando ocorre |
|---|---|---|
| `request` | `{ iteracao, modelo, mensagens }` | Antes de chamar a API |
| `response` | `{ iteracao, response }` | Resposta recebida da API |
| `token` | `{ type: "reasoning"|"content", text }` | Durante streaming (token a token) |
| `tool_preparing` | `{ tool }` | Quando detecta preparação de escrita/edição/patch |
| `tool_decision` | `{ iteracao, tool, args, error }` | Modelo decidiu chamar uma ferramenta |
| `tool_confirmation` | `{ iteracao, tool, args, decisao }` | Resultado da confirmação do usuário |
| `tool_execution` | `{ iteracao, tool, args, resultado, duration_ms }` | Após executar a ferramenta |
| `final_content` | `{ content }` | Resposta textual final do modelo |
| `loop_end` | `{ motivo, iteracoes }` | Fim do loop (qualquer motivo) |

**Retorno**:
```js
{
  iterations: number,      // Número de iterações executadas
  reason: string,          // "concluido" | "limite_atingido" | "resposta_invalida"
  messages: array,         // Histórico completo de mensagens
  finalContent: string     // Conteúdo final (se concluído)
}
```

---

### 2. `src/cli.js` — Ponto de Entrada (Single-shot)

**Responsabilidade**: Parsear argumentos da linha de comando e orquestrar a execução.

**Fluxo**:
1. Lê `process.argv[2]` — se existir, entra em **modo single-shot**.
2. Carrega variáveis de ambiente (`.env`).
3. Cria **logger** (arquivo JSONL), **console handler** (saída formatada), **confirm** (readline).
4. Chama `runAgent` com todos os componentes injetados.
5. Exibe resumo final (iterações, motivo, caminho do log).
6. Se **não** houver argumento, delega para `repl.js` (modo interativo).

---

### 3. `src/repl.js` — Modo REPL Interativo

**Responsabilidade**: Prover um loop de conversação contínua com o agente.

**Fluxo**:
1. Usa `readline.createInterface` para ler comandos do usuário.
2. Mantém histórico de mensagens entre turnos (conversa contextual).
3. Comandos especiais:
   - `/exit` — encerra o REPL
   - `/clear` — limpa histórico e terminal
   - `/help` — mostra comandos disponíveis
   - `/models` — seleção interativa de modelo OpenRouter
   - `/effort` — seleção de reasoning effort
4. A cada input, chama `runAgent` passando o histórico acumulado.

---

### 4. `src/openrouter.js` — Adapter da API OpenRouter

**Responsabilidade**: Encapsular toda a comunicação HTTP com a API OpenRouter.

**Funções exportadas**:
- **`callApi(messages, tools, stream)`**: função principal injetada no `runAgent`. Retorna JSON ou um iterável assíncrono (streaming).
- **`callApiStream(messages, tools)`**: gerador assíncrono que consome SSE (Server-Sent Events) do streaming.
- **`listModels()`**: busca modelos disponíveis no OpenRouter.
- **`setModel(model)`**: altera o modelo ativo em runtime.
- **`setReasoningEffort(effort)`**: altera o nível de reasoning effort.
- **`getApiKey()`**: retorna a chave da API.
- **Variáveis de estado**: `currentModel`, `currentReasoningEffort`.

**Detalhes de implementação**:
- Usa `fetch` nativo do Node.js (18+).
- Constrói headers com `Authorization`, `Content-Type`, `HTTP-Referer` e `X-Title`.
- Suporta parâmetro `reasoning` com níveis de esforço (none, minimal, low, medium, high, xhigh).
- No modo streaming, faz parse manual das linhas SSE (`data: ...`) e acumula chunks.

---

### 5. `src/parseResponse.js` — Parser de Respostas da API

**Responsabilidade**: Extrair e normalizar informações das respostas no formato OpenAI.

**Funções**:
- **`extractToolCalls(message)`**: extrai array de `{id, name, arguments}` da mensagem. Lida com `null`, array vazio, `function` ausente.
- **`extractContent(message)`**: extrai conteúdo textual. Retorna `null` se vazio/ausente.
- **`parseToolArgs(rawArgs)`**: faz `JSON.parse` defensivo dos argumentos. **Nunca lança** — sempre retorna `{args, error}`.
- **`buildToolResultMessage(toolCallId, content)`**: monta mensagem `role: "tool"` no formato esperado pela API.

---

### 6. `src/streamReduce.js` — Redutor de Streaming

**Responsabilidade**: Acumular chunks de streaming SSE em uma mensagem final completa.

**Funcionamento**:
- Mantém um acumulador interno com `content`, `reasoning`, `tool_calls[]`.
- `next(delta)`: processa cada delta incremental, concatenando strings e agrupando `tool_calls` por índice.
- `getFinalMessage()`: monta a mensagem final no formato esperado pelo loop do agente.

---

### 7. `src/logger.js` — Logger de Eventos

**Responsabilidade**: Persistir todos os eventos do agente em arquivo JSONL.

**Funcionamento**:
- Cria arquivo `logs/agent-<timestamp>.jsonl` por execução.
- `logEvent(event, data)`: serializa evento + timestamp + dados em uma linha JSON.
- Sanitiza campos muito longos (trunca para `PREVIEW_LEN` = 2000 chars).
- Campos aninhados também são sanitizados.
- Tolerante a erros (nunca quebra o agente por falha de escrita).

---

### 8. `src/format.js` — Formatação de Console

**Responsabilidade**: Exibir a execução do agente de forma legível e colorida no terminal.

**Componentes**:
- **`formatDecision()`**: mostra decisão de tool, ex: `[iter 1] → read_file src/agent.js`
- **`formatToolResult()`**: mostra resultado da tool, ex: `[iter 1] ← read_file (42ms): [230 chars]`
- **`formatConfirmation()`**: prompt de confirmação, ex: `? Write file path (y/n):`
- **`formatBashOutput()`**: exibe saída de bash em caixa colorida com bordas.
- **`formatFinal()`**: exibe resposta final do modelo.
- **`formatLoopEnd()`**: aviso de limite de iterações.

**Console Event Handler** (`createConsoleEventHandler`):
- Gerencia exibição de **spinner** durante reasoning.
- Suporta **tecla 'r'** para revelar reasoning oculto.
- Faz **streaming de conteúdo** com renderização markdown inline.
- Detecta preparação de `write_file`/`edit_file`/`patch_file` e mostra "Preparando escrita/edição/patch...".
- Exibe tempo de reasoning: `+ Pensou: 2.3s`.
- Usa cores: cinza (reasoning/detalhes), laranja (spinner/thinking), vermelho (confirmações/erros).

---

### 9. `src/markdownWriter.js` — Renderizador Markdown

**Responsabilidade**: Renderizar markdown streaming com cores no terminal.

**Funcionamento**:
- Processa linha por linha, aplicando cores:
  - **Headers** (`#`): ciano (negrito para nível 1-2)
  - **Code fences** (```): cinza com borda `│`
  - **Links** `[texto](url)`: texto verde + url em cinza
  - **Inline code** (`` `code` ``): verde
  - **Negrito/Itálico**: verde
  - **Blockquotes** (`>`): cinza com borda `│`
  - **Listas** (`-`, `*`, `1.`): amarelo para bullet/número
  - **Horizontal rules** (`---`): cinza
- Suporta streaming parcial: acumula buffer, quando encontra `\n` renderiza a linha completa, mantém o resto.
- Detecta automaticamente se o terminal suporta cores (`isTTY`, `NO_COLOR`).

---

### 10. `src/confirm.js` — Mecanismo de Confirmação

**Responsabilidade**: Solicitar confirmação do usuário para ações sensíveis.

**Funcionamento**:
- Usa `readline.createInterface` para fazer perguntas.
- `isYes(input)`: normaliza resposta (y/Y/yes/sim → true).
- `createConfirm({formatConfirmation, input})`: retorna função `confirm(toolName, args)`.
- A função `input` é injetável — no REPL, usa o próprio readline do REPL para evitar conflito.

---

### 11. `src/permissions.js` — Verificações de Segurança

**Responsabilidade**: Restringir operações potencialmente perigosas.

**Componentes**:
- **`BASH_ALLOWLIST`**: lista de comandos bash permitidos automaticamente (ex: `ls`, `cat`, `git status`, `node --version`). Comandos fora da lista exigem confirmação.
- **`isBashAllowed(command)`**: verifica se o comando está na allowlist. Bloqueia padrões perigosos (`<`, `>`, `` ` ``, `$()`, `-exec`, `-execdir`).
- **`isPathWithinCwd(target)`**: verifica se o caminho resolve para dentro do `cwd` (diretório de trabalho atual). Se for fora, a ferramenta exige confirmação mesmo que seja `write_file`/`edit_file`/`patch_file`.

---

### 12. `src/env.js` — Parser de Arquivo .env

**Responsabilidade**: Ler e fazer parse do arquivo `.env` sem dependências externas.

**Funções**:
- **`parseEnvFile(content)`**: função pura que parseia conteúdo `.env` string → objeto. Suporta aspas simples, duplas, comentários `#`, linhas em branco.
- **`loadEnv(filePath)`**: lê arquivo do disco e delega para `parseEnvFile`. Retorna `{}` se arquivo não existir.

---

## Sistema de Ferramentas

### Registro Central (`src/tools/index.js`)

Todas as ferramentas são registradas num objeto `toolRegistry` com a estrutura:

```js
{
  schema: { type: "function", function: { name, description, parameters } },
  execute: (args) => string,       // nunca lança
  sensitive: boolean,               // se precisa de confirmação
  shouldConfirm: (args) => boolean, // lógica condicional (opcional)
  summarize: (args) => string,      // resumo compacto dos args
}
```

**Funções exportadas**:
- `getToolSchema()` → array de schemas no formato OpenAI para enviar na requisição.
- `executeTool(name, args)` → executa a ferramenta pelo nome. **Nunca lança exceção**.
- `isSensitive(name)` → verifica se a tool é sensível.
- `shouldConfirm(name, args)` → lógica condicional por-argumento.
- `summarizeTool(name, args)` → sumário compacto para exibição.

### Ferramentas Disponíveis

| Ferramenta | Descrição | Parâmetros | Sensível | Confirmação condicional |
|---|---|---|---|---|
| `read_file` | Lê conteúdo de arquivo texto | `path` (obrigatório) | ❌ | — |
| `write_file` | Cria/sobrescreve arquivo | `path`, `content` (obrigatórios) | ✅ | Apenas se path **fora** do cwd |
| `edit_file` | Substitui trecho exato de texto | `filePath`, `oldString`, `newString`, `replaceAll` | ✅ | Apenas se path **fora** do cwd |
| `patch_file` | Aplica unified diff em arquivo | `filePath`, `hunks` (obrigatórios) | ✅ | Apenas se path **fora** do cwd |
| `run_bash` | Executa comando no shell | `command` (obrigatório) | ✅ | Apenas se comando **não** estiver na allowlist |
| `grep` | Busca regex em arquivos | `pattern`, `path?`, `include?`, `maxResults?` | ❌ | — |
| `glob` | Encontra arquivos por padrão glob | `pattern`, `path?`, `maxResults?` | ❌ | — |

#### `read_file` (`src/tools/readFile.js`)
- Lê arquivo com `readFileSync`.
- **Limite de 50KB**: arquivos maiores são truncados com aviso.
- Retorna erro (não lança) se arquivo não existir.

#### `write_file` (`src/tools/writeFile.js`)
- Escreve com `writeFileSync`.
- **Cria diretórios pais** automaticamente (`mkdirSync` recursivo).
- Retorna quantidade de bytes escritos.

#### `edit_file` (`src/tools/edit.js`)
- Lê arquivo, substitui `oldString` por `newString`, escreve de volta.
- **Validações**: `oldString` não pode ser vazio; se encontrado múltiplas vezes e `replaceAll` não for `true`, retorna erro.
- **Escapa regex** para evitar problemas com caracteres especiais.
- Retorna número de substituições e diferença de bytes.

#### `patch_file` (`src/tools/patch.js`)
- Aplica **unified diff** (formato de patch) em arquivo existente.
- **Parser de hunks**: converte string diff em array de hunks estruturados.
- **Fuzzy matching**: se a linha esperada não for encontrada exatamente na posição, busca num raio de 10 linhas (tolerância a pequenas variações).
- Aplica múltiplos hunks sequencialmente, ajustando offset.

#### `run_bash` (`src/tools/runBash.js`)
- Executa comando com `execSync`.
- **Timeout**: 30 segundos.
- **MaxBuffer**: 1MB.
- Saída truncada em 50KB.
- Erros retornam stdout + stderr + exit code.

#### `grep` (`src/tools/grep.js`)
- Busca conteúdo em arquivos com regex.
- **Filtro por tipo de arquivo**: suporta padrão glob (ex: `*.js`, `src/**/*.ts`).
- **Limite de resultados**: padrão 200, configurável.
- **Pula diretórios**: `node_modules`, `.git`, pastas ocultas.
- **Pula arquivos grandes**: > 500KB.
- Implementação própria de `globToRegex` para converter padrão glob em regex.

#### `glob` (`src/tools/glob.js`)
- Encontra arquivos por padrão glob.
- **Ordenação**: por data de modificação (mais recentes primeiro).
- **Limite**: padrão 200, configurável.
- Mesmas regras de diretórios ignorados que o `grep`.

---

## Modos de Execução

### Modo Single-shot
```bash
node src/cli.js "leia src/agent.js e resuma"
```
Executa a tarefa e encerra. Ideal para automação e scripts.

### Modo REPL
```bash
node src/cli.js
```
Entra em modo interativo com prompt `agent>`. O histórico é mantido entre turnos.

**Comandos do REPL**:
| Comando | Descrição |
|---|---|
| `/exit` | Encerra o REPL |
| `/clear` | Limpa o histórico e o terminal |
| `/help` | Mostra comandos disponíveis |
| `/models` | Abre busca interativa para selecionar modelo OpenRouter |
| `/effort` | Abre menu para selecionar nível de reasoning effort |

---

## Sistema de Eventos e Pipeline de Saída

Cada evento do `runAgent` é roteado para **dois destinos simultaneamente**:

```
                    ┌──────────────────┐
                    │   runAgent       │
                    │   (onEvent)      │
                    └────────┬─────────┘
                             │
                    ┌────────┴────────┐
                    ▼                  ▼
          ┌─────────────────┐  ┌─────────────────┐
          │  format.js      │  │  logger.js       │
          │  (console)      │  │  (arquivo JSONL) │
          │  - cores        │  │  - timestamp     │
          │  - spinner      │  │  - sanitização   │
          │  - markdown     │  │  - persistência  │
          │  - streaming    │  │  - auditoria     │
          └─────────────────┘  └─────────────────┘
```

---

## Fluxo Detalhado de uma Execução Típica

```
1. Usuário: node src/cli.js "crie um arquivo hello.txt com 'Olá Mundo'"
2. cli.js carrega .env, cria logger, console handler, confirm
3. cli.js chama runAgent({ task, tools, callApi, executeTool, confirm, onEvent })
4. agent.js monta mensagens: [system, user]
5. LOOP - iteração 1:
   a. Emite 'request'
   b. callApi() → OpenRouter responde com tool_calls: [write_file(path, content)]
   c. Emite 'response'
   d. extractToolCalls() → 1 tool_call
   e. Emite 'tool_decision'
   f. shouldConfirm("write_file", args) → true (path dentro do cwd? depende)
   g. Emite 'tool_confirmation' e aguarda input do usuário
   h. Usuário digita 'y'
   i. executeTool("write_file", args) → escreve arquivo
   j. Emite 'tool_execution' com resultado + duração
   k. messages.push(tool_result)
   l. Continua loop
6. LOOP - iteração 2:
   a. callApi() → OpenRouter responde com texto final
   b. Emite 'final_content'
   c. Emite 'loop_end' com motivo "concluido"
   d. Retorna { iterations: 2, reason: "concluido", ... }
7. cli.js exibe resumo e caminho do log
8. process.exit(0)
```

---

## Variáveis de Ambiente (`.env`)

| Variável | Padrão | Descrição |
|---|---|---|
| `OPENROUTER_API_KEY` | — | Chave de API do OpenRouter (obrigatória) |
| `OPENROUTER_MODEL` | `anthropic/claude-sonnet-4.5` | Modelo padrão (alterável em runtime via `/models`) |
| `OPENROUTER_MAX_ITERATIONS` | `20` | Limite máximo de iterações do loop |
| `OPENROUTER_REASONING_EFFORT` | (vazio) | Nível de esforço de reasoning: `none`, `minimal`, `low`, `medium`, `high`, `xhigh` |

---

## Princípios Arquiteturais

1. **Zero dependências de runtime pesadas** — apenas `@inquirer/prompts` para seleção interativa.
2. **Funções puras em módulos próprios** — lógica extraída para módulos testáveis isoladamente, sem acoplamento a rede/fs/terminal.
3. **Injeção de dependências** — o loop do agente recebe `callApi`, `executeTool`, `confirm`, `onEvent` injetáveis, permitindo testes sem rede, sem fs, sem terminal.
4. **Nunca lançar exceções nas ferramentas** — toda execução retorna string (sucesso ou erro) para que o modelo possa reagir.
5. **Separação de responsabilidades** — `agent.js` (lógica do loop), `openrouter.js` (comunicação HTTP), `format.js` (apresentação), `logger.js` (persistência).
6. **Testabilidade** — cada módulo tem testes unitários; `callApi` mockada testa o loop sem chamar API real.
7. **Segurança por camadas** — allowlist de bash, verificação de path dentro do cwd, confirmação para ações sensíveis.

---

## Milestones de Desenvolvimento

| Fase | Documento | Foco |
|---|---|---|
| M1 | `01-m1-setup-and-api.md` | Setup do projeto, env parser, chamada API simples |
| M1.5 | `02-m1.5-parse-response.md` | Parser de resposta (content + tool_calls) |
| M2 | `03-m2-tools.md` | Schema + executores das 3 tools originais |
| M3 | `04-m3-agent-loop.md` | Loop com tool_calls, callApi injetável |
| M4 | `05-m4-console-logs.md` | Formatação legível no console |
| M5 | `06-m5-logger.md` | Logger JSONL |
| M6 | `07-m6-confirmation.md` | Confirmação manual para ações sensíveis |
| M7 | `08-m7-integration.md` | Testes de integração com API real |

Extensões posteriores (fora do escopo v1):
- Streaming de tokens
- REPL interativo
- Ferramentas adicionais (edit, patch, grep, glob)
- Comandos `/models` e `/effort`
- Renderização markdown

---

## Testes

```bash
npm test                         # Testes unitários (exclui integração)
npm run test:watch               # Modo watch
npm run test:integration         # Testes de integração (exige chave OpenRouter)
npm run dev                      # Executa o CLI em modo dev
```

Os testes de integração são executados apenas se:
- `OPENROUTER_API_KEY` está definida no ambiente
- `OPENROUTER_RUN_INTEGRATION=1` está definido