# Fase M3 — Loop do Agente com Tool Calls

## Objetivo

Implementar o coração do agente: o loop `prompt → callApi → tool_calls → executar → empilhar resultado → repetir` até o modelo parar de chamar tools ou atingir o limite de iterações.

## Princípio-chave desta fase: injeção de dependência

A função `runAgent` recebe `callApi` como parâmetro. Isso permite testar **toda a lógica do loop sem rede e sem chave de API**, mockando a resposta do modelo.

```js
runAgent({
  task,           // string — tarefa do usuário
  tools,          // array de schemas (saída de getToolSchema())
  callApi,        // async (messages, tools) => responseJson
  executeTool,    // (name, args) => string
  maxIterations,  // número
  onEvent,        // callback opcional para logging/UI (M4 e M5 plugam aqui)
})
```

## Arquivos a criar nesta fase

### `src/agent.js`

```js
import { extractToolCalls, extractContent, parseToolArgs, buildToolResultMessage } from "./parseResponse.js";
import { isSensitive } from "./tools/index.js";

export const SYSTEM_PROMPT = `Você é um agente de código que opera em um terminal.
Você tem acesso às ferramentas: read_file, write_file, run_bash.
- Use read_file para inspecionar arquivos antes de decidir o que fazer.
- Use write_file para criar ou sobrescrever arquivos.
- Use run_bash para executar comandos do sistema.
- Quando a tarefa estiver concluída, responda com um resumo em texto natural, sem chamar mais ferramentas.
- Não tente adivinhar conteúdos de arquivos: leia antes.
- Trabalhe em passos pequenos e verificáveis.`;

/**
 * Loop principal do agente.
 *
 * @param {object} opts
 * @param {string} opts.task
 * @param {object[]} opts.tools - schemas OpenAI
 * @param {function} opts.callApi - async (messages, tools) => responseJson
 * @param {function} opts.executeTool - (name, args) => string
 * @param {number} [opts.maxIterations=20]
 * @param {function} [opts.onEvent] - callback (event, data) => void
 * @param {function} [opts.confirm] - async (toolName, args) => boolean (default: () => true)
 * @returns {Promise<{iterations: number, reason: string, messages: object[]}>}
 */
export async function runAgent(opts) {
  const {
    task,
    tools,
    callApi,
    executeTool,
    maxIterations = 20,
    onEvent = () => {},
    confirm = async () => true,
  } = opts;

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: task },
  ];

  let iter = 0;
  while (true) {
    iter++;
    if (iter > maxIterations) {
      onEvent("loop_end", { motivo: "limite_atingido", iteracoes: iter - 1 });
      return { iterations: iter - 1, reason: "limite_atingido", messages };
    }

    onEvent("request", { iteracao: iter, modelo: null, mensagens: messages });
    const response = await callApi(messages, tools);
    onEvent("response", { iteracao: iter, response });

    const message = response?.choices?.[0]?.message;
    if (!message) {
      onEvent("loop_end", { motivo: "resposta_invalida", iteracoes: iter });
      return { iterations: iter, reason: "resposta_invalida", messages };
    }

    const toolCalls = extractToolCalls(message);

    if (toolCalls.length > 0) {
      // preserva a mensagem assistant original (com tool_calls) na história
      messages.push(message);

      for (const tc of toolCalls) {
        const { args, error } = parseToolArgs(tc.arguments);
        const nome = tc.name;
        onEvent("tool_decision", { iteracao: iter, tool: nome, args, error });

        let resultado;
        if (error) {
          resultado = error;
        } else if (isSensitive(nome) && !(await confirm(nome, args))) {
          resultado = "Usuário recusou a execução desta ferramenta.";
          onEvent("tool_confirmation", { iteracao: iter, tool: nome, args, decisao: false });
        } else {
          if (isSensitive(nome)) {
            onEvent("tool_confirmation", { iteracao: iter, tool: nome, args, decisao: true });
          }
          const inicio = Date.now();
          resultado = executeTool(nome, args);
          onEvent("tool_execution", {
            iteracao: iter,
            tool: nome,
            args,
            resultado,
            duration_ms: Date.now() - inicio,
          });
        }

        messages.push(buildToolResultMessage(tc.id, resultado));
      }
      continue;
    }

    // não há tool_calls — fim
    const content = extractContent(message);
    if (content) onEvent("final_content", { content });
    onEvent("loop_end", { motivo: "concluido", iteracoes: iter });
    return { iterations: iter, reason: "concluido", messages, finalContent: content };
  }
}
```

## Decisões de design importantes

1. **`callApi` injetável**: o loop não sabe sobre `fetch` ou OpenRouter. Em produção (M7) injeta-se uma função real; em testes, um mock.
2. **`onEvent` callback**: desacopla o loop de logging/console. M4 pluga formatadores legíveis, M5 pluga o logger JSONL. O loop não conhece nem `console.log` nem arquivos.
3. **`confirm` injetável**: M6 injeta a função que pergunta ao usuário via `readline`. Em testes, mocka-se para retornar true/false. Default: sempre true.
4. **Mensagem `assistant` com tool_calls é preservada integralmente** (`messages.push(message)`) — não uma versão normalizada. A API espera o formato cru.
5. **Múltiplos tool_calls**: processados sequencialmente, todos os resultados empilhados antes da próxima chamada.
6. **`message` nula/ausente**: encerra com `motivo: "resposta_invalida"` (não crasha).

## Testes unitários — `test/agent.test.js`

Estratégia: mock `callApi` com uma fila de respostas programadas. Mock `executeTool` para retornar strings previsíveis.

```js
import { describe, it, expect, vi } from "vitest";
import { runAgent, SYSTEM_PROMPT } from "../src/agent.js";

function makeToolCall(id, name, args) {
  return {
    id,
    type: "function",
    function: { name, arguments: JSON.stringify(args) },
  };
}

function textResponse(text) {
  return { choices: [{ message: { role: "assistant", content: text }, finish_reason: "stop" }] };
}

function toolResponse(toolCalls) {
  return {
    choices: [
      { message: { role: "assistant", content: null, tool_calls: toolCalls }, finish_reason: "tool_calls" },
    ],
  };
}

function queueResponses(...responses) {
  const queue = [...responses];
  return vi.fn(async () => queue.shift());
}

describe("runAgent", () => {
  it("termina com 'concluido' quando modelo responde só texto", async () => {
    const callApi = queueResponses(textResponse("pronto"));
    const result = await runAgent({
      task: "teste",
      tools: [],
      callApi,
      executeTool: vi.fn(),
    });
    expect(result.reason).toBe("concluido");
    expect(result.finalContent).toBe("pronto");
    expect(callApi).toHaveBeenCalledTimes(1);
  });

  it("executa 1 tool call e depois conclui", async () => {
    const callApi = queueResponses(
      toolResponse([makeToolCall("1", "read_file", { path: "a.txt" })]),
      textResponse("li o arquivo"),
    );
    const executeTool = vi.fn(() => "conteúdo do arquivo");
    const result = await runAgent({
      task: "leia a.txt",
      tools: [],
      callApi,
      executeTool,
    });
    expect(result.reason).toBe("concluido");
    expect(executeTool).toHaveBeenCalledWith("read_file", { path: "a.txt" });
    expect(callApi).toHaveBeenCalledTimes(2);
  });

  it("processa múltiplos tool_calls em um único turno", async () => {
    const callApi = queueResponses(
      toolResponse([
        makeToolCall("1", "read_file", { path: "a.txt" }),
        makeToolCall("2", "read_file", { path: "b.txt" }),
        makeToolCall("3", "run_bash", { command: "ls" }),
      ]),
      textResponse("feito"),
    );
    const executeTool = vi.fn((name) => `result_${name}`);
    const result = await runAgent({
      task: "multi",
      tools: [],
      callApi,
      executeTool,
    });
    expect(executeTool).toHaveBeenCalledTimes(3);
    expect(result.reason).toBe("concluido");
  });

  it("empilha mensagens role:tool para cada tool_call", async () => {
    const callApi = queueResponses(
      toolResponse([
        makeToolCall("1", "read_file", { path: "a" }),
        makeToolCall("2", "read_file", { path: "b" }),
      ]),
      textResponse("ok"),
    );
    const result = await runAgent({
      task: "x",
      tools: [],
      callApi,
      executeTool: () => "r",
    });
    const toolMessages = result.messages.filter((m) => m.role === "tool");
    expect(toolMessages).toHaveLength(2);
    expect(toolMessages[0]).toEqual({ role: "tool", tool_call_id: "1", content: "r" });
    expect(toolMessages[1]).toEqual({ role: "tool", tool_call_id: "2", content: "r" });
  });

  it("atinge limite de iterações quando modelo só chama tools", async () => {
    const callApi = vi.fn(async () =>
      toolResponse([makeToolCall("1", "read_file", { path: "x" })])
    );
    const result = await runAgent({
      task: "loop",
      tools: [],
      callApi,
      executeTool: () => "r",
      maxIterations: 3,
    });
    expect(result.reason).toBe("limite_atingido");
    expect(callApi).toHaveBeenCalledTimes(3);
  });

  it("lida com args inválidos sem lançar — envia erro como conteúdo da tool", async () => {
    const callApi = queueResponses(
      {
        choices: [
          {
            message: {
              role: "assistant",
              content: null,
              tool_calls: [{ id: "1", type: "function", function: { name: "read_file", arguments: "{invalid" } }],
            },
          },
        ],
      },
      textResponse("recuperei"),
    );
    const executeTool = vi.fn();
    const result = await runAgent({
      task: "x",
      tools: [],
      callApi,
      executeTool,
    });
    expect(executeTool).not.toHaveBeenCalled();
    const toolMsg = result.messages.find((m) => m.role === "tool");
    expect(toolMsg.content).toMatch(/inválido|inválidos/);
    expect(result.reason).toBe("concluido");
  });

  it("erro de execução vira conteúdo da tool (não crasha)", async () => {
    const callApi = queueResponses(
      toolResponse([makeToolCall("1", "read_file", { path: "x" })]),
      textResponse("ok"),
    );
    const executeTool = vi.fn(() => { throw new Error("boom"); });
    const result = await runAgent({
      task: "x",
      tools: [],
      callApi,
      executeTool,
    });
    // espera-se que executeTool (em produção via tools/index.js) capture,
    // mas se lançar, o loop deve lidar. Aqui testamos com tools/index.executeTool
    // que tem try/catch interno. Para este teste, simulamos exeções via
    // um wrapper que captura igual ao executeTool real.
    // (ajustar conforme implementação — ver nota abaixo)
  });

  it("chama onEvent com tipos corretos", async () => {
    const callApi = queueResponses(
      toolResponse([makeToolCall("1", "read_file", { path: "a" })]),
      textResponse("feito"),
    );
    const events = [];
    const result = await runAgent({
      task: "x",
      tools: [],
      callApi,
      executeTool: () => "r",
      onEvent: (event, data) => events.push({ event, data }),
    });
    const types = events.map((e) => e.event);
    expect(types).toContain("request");
    expect(types).toContain("response");
    expect(types).toContain("tool_decision");
    expect(types).toContain("tool_execution");
    expect(types).toContain("final_content");
    expect(types).toContain("loop_end");
  });

  it("respeita função confirm para tools sensíveis", async () => {
    const callApi = queueResponses(
      toolResponse([makeToolCall("1", "write_file", { path: "a", content: "x" })]),
      textResponse("feito"),
    );
    const confirm = vi.fn(async () => false);
    const executeTool = vi.fn(() => "escrito");
    const result = await runAgent({
      task: "x",
      tools: [],
      callApi,
      executeTool,
      confirm,
    });
    expect(confirm).toHaveBeenCalledWith("write_file", { path: "a", content: "x" });
    expect(executeTool).not.toHaveBeenCalled();
    const toolMsg = result.messages.find((m) => m.role === "tool");
    expect(toolMsg.content).toMatch(/recusou/);
  });

  it("não chama confirm para tools não-sensíveis", async () => {
    const callApi = queueResponses(
      toolResponse([makeToolCall("1", "read_file", { path: "a" })]),
      textResponse("feito"),
    );
    const confirm = vi.fn(async () => true);
    await runAgent({
      task: "x",
      tools: [],
      callApi,
      executeTool: () => "r",
      confirm,
    });
    expect(confirm).not.toHaveBeenCalled();
  });
});
```

### Nota sobre o teste de erro de execução

O `executeTool` real (de `src/tools/index.js`) tem try/catch interno e nunca lança. No teste acima, o mock lança. Para testar que o **loop** não crasha mesmo se `executeTool` lançar, há duas opções:

**Opção A (recomendada)**: confiar no contrato de `executeTool` (sempre retorna string) e remover esse teste — a robustez fica em `src/tools/index.js`.

**Opção B**: envolver `executeTool(nome, args)` em try/catch dentro do loop. Nesse caso, o teste deve passar e o conteúdo da tool deve conter a mensagem de erro.

Decidir na implementação. Recomenda-se **Opção A** (separação de responsabilidades clara).

## Comandos de validação da fase

```bash
npm test src/agent.test.js
npm test                    # tudo passa
```

> Nesta fase ainda não há demo executável real (precisa do `cli.js` integrado, que vem em M7). A validação é só via testes.

## Critérios de aceite da fase

- [ ] `runAgent` é uma função pura (sem side-effects além de `onEvent` e `confirm`)
- [ ] `callApi`, `executeTool`, `confirm`, `onEvent` são injetáveis
- [ ] Múltiplos tool_calls por turno funcionam
- [ ] Limite de iterações respeitado
- [ ] Args inválidos viram erro enviado como conteúdo da tool
- [ ] Confirmação só é pedida para tools sensíveis
- [ ] `onEvent` emite eventos: `request`, `response`, `tool_decision`, `tool_confirmation`, `tool_execution`, `final_content`, `loop_end`
- [ ] Todos os testes passam sem chamar a API real

## Riscos e armadilhas

- **Preservar a mensagem assistant com tool_calls**: se você normalizar/recriar a mensagem antes de empilhar, a API pode rejeitar. Sempre empilhar o objeto cru retornado.
- **`tool_call_id` deve bater**: cada mensagem `role:"tool"` precisa ter `tool_call_id` igual ao `id` do tool_call correspondente. Não trocar ids.
- **Ordem dos tool results**: a OpenAI é flexível, mas manter a ordem dos tool_calls ajuda modelos mais estritos.
- **Mock de `callApi` consumido**: usar `queueResponses` com `vi.fn` que faz `shift()` na fila — se acabar a fila, retorna `undefined` e quebra o teste. Garantir que a fila tem respostas suficientes.

## Dependências para a próxima fase

- `runAgent` pronta e testada
- Eventos via `onEvent` prontos para serem plugados em M4 (console) e M5 (logger)
- `confirm` pronto para receber a implementação com `readline` em M6
