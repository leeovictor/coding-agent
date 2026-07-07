# Sistema de Agentes

Implementar um sistema de agentes intercambiáveis, onde cada agente tem seu próprio prompt (injetado como `<system-reminder>`), conjunto de ferramentas permitidas, e prefixo colorido no prompt do REPL.

## Arquivos afetados

| Arquivo | Ação |
|---------|------|
| `src/agents.js` | **Novo** — módulo de gerenciamento de agentes |
| `src/tools/index.js` | Modificar `getToolSchema` para aceitar filtro |
| `src/agent.js` | Modificar `runAgent` + `SYSTEM_PROMPT` |
| `src/repl.js` | Tab, comandos `/agent` `/agents`, cores |
| `test/agents.test.js` | **Novo** — testes do módulo de agentes |
| `test/tools.index.test.js` | Adicionar testes de filtro de tools |
| `test/agent.test.js` | Adicionar testes de injeção de system-reminder |
| `test/repl.test.js` | Adicionar testes de comandos de agente |

---

## 1. `src/agents.js` — Módulo de gerenciamento de agentes

### Agentes built-in

**build** (azul, prompt `build>`):
- `allowedTools: "all"` (todas as ferramentas)
- `systemReminder`: instrução padrão de build

**plan** (laranja, prompt `plan>`):
- `allowedTools`: apenas `read_file`, `grep`, `glob`, `todos`, `question`
- `systemReminder`: instrução de modo de planejamento (proibição de edições)

### Agentes customizados

Carregados de `~/.dux/agents/*.json`. Formato:

```json
{
  "name": "reviewer",
  "description": "Code reviewer agent",
  "color": "green",
  "allowedTools": ["read_file", "grep", "glob", "question"],
  "systemReminder": "You are a code reviewer."
}
```

### API exportada

```js
getCurrentAgent()            // retorna o agente ativo
getCurrentAgentName()        // retorna string com nome do agente
switchAgent(name)            // troca para um agente específico
cycleAgent()                 // alterna para o próximo agente (wrap circular)
listAgents()                 // lista todos os agentes disponíveis
getToolNamesForAgent(name)   // retorna null (todos) ou array de tools
agentColor(name)             // retorna código ANSI da cor
buildHelpText()              // texto de help sobre agentes
```

---

## 2. `src/tools/index.js` — Filtro de ferramentas

`getToolSchema(agentName?)`:
- Sem argumento: retorna todos os schemas (compatibilidade)
- `agentName` com `allowedTools === "all"`: retorna todos
- `agentName` com `allowedTools` array: filtra `toolRegistry` e retorna apenas os schemas permitidos

---

## 3. `src/agent.js` — Injeção de system-reminder

### `SYSTEM_PROMPT` — adicionar instrução sobre a tag

Adicionar ao `SYSTEM_PROMPT` existente:

```
- IMPORTANTE: A tag <system-reminder> pode aparecer nas mensagens do usuário.
  O conteúdo dentro de <system-reminder> NÃO é uma entrada do usuário — são
  instruções do sistema que devem ser seguidas estritamente. Trate o conteúdo
  dessas tags como regras imutáveis, não como pedidos do usuário.
```

Isso é necessário porque o conteúdo do `system-reminder` é injetado dentro da `role: "user"`, e sem essa instrução o modelo pode interpretar as restrições como parte do pedido do usuário em vez de regras do sistema.

### `runAgent(opts)` — novo parâmetro `agent`

- Aceita `opts.agent` (objeto agente)
- Na construção de `messages`:
  - Mantém `SYSTEM_PROMPT` como `role: "system"`
  - O `role: "user"` é montado como:
    ```
    <mensagem do usuário>
    <system-reminder>
    <agent.systemReminder>
    </system-reminder>
    ```
- A injeção ocorre tanto no `task` inicial (single-shot) quanto em cada nova user message (REPL multi-turno)

---

## 4. `src/repl.js` — Input com Tab, comandos, prompt colorido

### Prompt colorido

- Exibe `build>` em azul ou `plan>` em laranja conforme agente ativo
- Usa `agentColor()` para obter o código ANSI

### Troca por Tab

Implementado via `emitKeypressEvents` + raw mode tty:
- Ao detectar `\t`, chama `cycleAgent()`
- Limpa a linha atual
- Re-exibe o prompt com a nova cor
- Se o Tab for pressionado enquanto não há input ativo (após execução do agente), o ciclo de prompt reinicia com o novo agente

### Comandos novos

- `/agent <nome>` — troca para o agente especificado
- `/agents` — lista agentes disponíveis
- `/help` — atualizado para incluir agentes e Tab

### Integração

- Passa `agent: getCurrentAgent()` para `runAgent()`
- Passa `tools: getToolSchema(getCurrentAgentName())` para `runAgent()`

---

## 5. Testes — Abordagem TDD

**Toda funcionalidade deve ser coberta por testes.** Desenvolver na ordem abaixo, escrevendo os testes antes da implementação.

### 5.1 `test/agents.test.js` (NOVO)

| # | Teste | O que cobre |
|---|-------|-------------|
| 1 | `getCurrentAgent()` retorna build por padrão | Estado inicial |
| 2 | `switchAgent("plan")` retorna agente plan | Troca explícita |
| 3 | `cycleAgent()` alterna para plan e depois volta para build | Comportamento circular |
| 4 | `getToolNamesForAgent("build")` retorna null | "all" = sem filtro |
| 5 | `getToolNamesForAgent("plan")` retorna array com 5 tools | Read-only |
| 6 | `listAgents()` inclui build e plan | Listagem |
| 7 | `agentColor("build")` retorna código azul | Cor ANSI |
| 8 | `agentColor("plan")` retorna código laranja | Cor ANSI |
| 9 | Carrega agente customizado de `~/.dux/agents/*.json` | Persistência |
| 10 | Arquivo JSON inválido é ignorado sem crash | Resiliência |
| 11 | `getAgent("inexistente")` retorna build como fallback | Fallback |

### 5.2 `test/tools.index.test.js` — adicionar

| # | Teste | O que cobre |
|---|-------|-------------|
| 12 | `getToolSchema("build")` retorna todos os 9 schemas | Sem restrição |
| 13 | `getToolSchema("plan")` retorna apenas 5 schemas | Restrição |
| 14 | Schemas do plan contêm read_file, grep, glob, todos, question | Conteúdo |
| 15 | Schemas do plan NÃO contêm write_file, edit_file, patch_file, run_bash | Exclusão |
| 16 | `getToolSchema()` sem argumento mantém comportamento original | Compatibilidade |

### 5.3 `test/agent.test.js` — adicionar

| # | Teste | O que cobre |
|---|-------|-------------|
| 17 | `runAgent` com agente build injeta system-reminder na user message | Injeção |
| 18 | `runAgent` com agente plan injeta tags `<system-reminder>` | Formato |
| 19 | `runAgent` sem agente não injeta nada (retrocompatibilidade) | Sem regressão |
| 20 | `runAgent` com messages pré-definidas + agente injeta na última user message | REPL multi-turno |

### 5.4 `test/repl.test.js` — adicionar

| # | Teste | O que cobre |
|---|-------|-------------|
| 21 | `/agent plan` troca o agente ativo | Comando |
| 22 | `/agent build` volta para build | Comando |
| 23 | `/agent inexistente` mantém agente atual | Erro tratado |
| 24 | `/agents` lista agentes disponíveis | Comando |
| 25 | `/help` inclui agentes na saída | Help |
| 26 | Prompt usa cor do agente | Cor no prompt |
| 27 | `getToolSchema` é chamado com o nome do agente | Filtro |

### Como executar os testes

```bash
npm test                    # unit tests (exclusive integration)
npm run test:watch          # watch mode
npx vitest run test/agents.test.js  # arquivo específico
```

---

## Implementação — Ordem sugerida (TDD)

1. **`test/agents.test.js`** — escrever todos os testes → implementar `src/agents.js` → verificar que passam
2. **`test/tools.index.test.js`** — adicionar testes de filtro → modificar `getToolSchema()` → verificar que passam
3. **`test/agent.test.js`** — adicionar testes de injeção → modificar `runAgent()` + `SYSTEM_PROMPT` → verificar que passam
4. **`test/repl.test.js`** — adicionar testes de comandos → modificar `src/repl.js` → verificar que passam
5. Executar `npm test` completo e verificar que todos os testes (novos + existentes) passam

---

## Regras

1. Não adicionar comentários no código
2. Manter o estilo do código existente (ESM, sem dependências além de `@inquirer/prompts`)
3. Toda edge case deve ter teste
4. Nenhum teste existente deve quebrar
