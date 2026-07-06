# `src/agent.js` — Documentação

## Visão Geral

O arquivo `src/agent.js` implementa o **loop principal do agente** de IA. O agente recebe uma tarefa, interage com um modelo de linguagem (via API), executa ferramentas com base nas chamadas de função que o modelo decide fazer, e repete esse ciclo até que o modelo produza uma resposta final (texto) ou um limite de iterações seja atingido.

---

## Estrutura do Arquivo

### 1. `SYSTEM_PROMPT` (constante)

```js
export const SYSTEM_PROMPT = `...`;
```

Prompt de sistema padrão que define o comportamento do agente. Ele instrui o modelo a:

- Operar como um agente de código em um terminal.
- Usar as ferramentas: `read_file`, `write_file`, `run_bash`.
- Inspecionar arquivos com `read_file` antes de decidir o que fazer.
- Trabalhar em passos pequenos e verificáveis.
- Responder com um resumo em texto natural ao finalizar a tarefa.

---

### 2. `runAgent(opts)` (função assíncrona exportada)

Função principal que orquestra a execução do agente. Ela implementa um loop que:

1. Envia uma lista de mensagens (`messages`) para a API.
2. Processa a resposta.
3. Se a resposta contiver chamadas de ferramenta (`tool_calls`), executa cada uma delas e adiciona os resultados ao histórico de mensagens.
4. Se a resposta contiver apenas texto (conteúdo final), encerra o loop e retorna o resultado.

#### Parâmetros (`opts`)

| Propriedade       | Tipo       | Padrão        | Descrição |
|-------------------|------------|---------------|-----------|
| `task`            | `string`   | —             | Descrição da tarefa a ser executada pelo agente. |
| `tools`           | `array`    | —             | Lista de ferramentas disponíveis (definições no formato da API do modelo). |
| `callApi`         | `function` | —             | Função que faz a chamada à API do modelo. Recebe `(messages, tools, stream)`. |
| `executeTool`     | `function` | —             | Função que executa uma ferramenta. Recebe `(nome, args)`. |
| `maxIterations`   | `number`   | `Infinity`    | Número máximo de iterações do loop. |
| `onEvent`         | `function` | `() => {}`    | Callback para eventos de depuração/monitoramento. |
| `confirm`         | `function` | `async () => true` | Função de confirmação para ferramentas sensíveis. |
| `stream`          | `boolean`  | `false`       | Se `true`, usa streaming para receber a resposta do modelo. |
| `messages`        | `array`    | `undefined`   | Mensagens iniciais. Se não fornecida, monta `[{role: "system", content: SYSTEM_PROMPT}, {role: "user", content: task}]`. |

#### Fluxo do Loop (passo a passo)

1. **Incrementa iteração** e verifica se excedeu `maxIterations`. Se sim, retorna com motivo `"limite_atingido"`.

2. **Dispara evento `"request"`** com as mensagens atuais.

3. **Chama a API** (`callApi(messages, tools, stream)`).

4. **Dispara evento `"response"`** com a resposta bruta.

5. **Processa a resposta**:
   - Se `stream === true`: usa `createStreamReducer()` para consumir chunks do stream e montar a mensagem final. Durante o consumo, dispara eventos `"token"` para conteúdo e reasoning.
   - Se `stream === false`: extrai `message` de `response.choices[0].message`.

6. **Se mensagem vazia/inválida**: retorna com motivo `"resposta_invalida"`.

7. **Extrai chamadas de ferramenta** com `extractToolCalls(message)`.

8. **Se existem chamadas de ferramenta**:
   - Adiciona a mensagem do modelo ao histórico (`messages.push(message)`).
   - Para cada `toolCall`:
     - Faz o parsing dos argumentos com `parseToolArgs`.
     - Dispara evento `"tool_decision"`.
     - Se houver erro de parsing, usa o erro como resultado.
     - Se a ferramenta for **sensível** (`isSensitive(nome)`), solicita confirmação via `confirm(nome, args)`.
     - Se o usuário recusar, resultado é `"Usuário recusou a execução desta ferramenta."` e dispara `"tool_confirmation"` com `decisao: false`.
     - Se aprovada (ou não sensível), executa a ferramenta com `executeTool(nome, args)`, mede a duração e dispara `"tool_execution"`.
     - Adiciona o resultado ao histórico com `buildToolResultMessage`.
   - Volta ao início do loop (`continue`).

9. **Se não há chamadas de ferramenta** (resposta final):
   - Extrai o conteúdo textual com `extractContent(message)`.
   - Dispara evento `"final_content"`.
   - Dispara evento `"loop_end"` com motivo `"concluido"`.
   - Retorna o objeto final.

#### Valor de Retorno

```js
{
  iterations: number,      // Número de iterações executadas
  reason: string,          // Motivo do término: "concluido" | "limite_atingido" | "resposta_invalida"
  messages: array,         // Histórico completo de mensagens
  finalContent: string | undefined  // Conteúdo final (apenas quando reason === "concluido")
}
```

---

## Eventos (`onEvent`)

O callback `onEvent` permite monitorar o progresso do agente. Os eventos disparados são:

| Evento               | Payload | Descrição |
|----------------------|---------|-----------|
| `"loop_end"`         | `{ motivo, iteracoes }` | Final do loop. |
| `"request"`          | `{ iteracao, modelo, mensagens }` | Envio de requisição à API. |
| `"response"`         | `{ iteracao, response }` | Resposta recebida da API. |
| `"token"`            | `{ type, text }` | Token individual (streaming). `type` pode ser `"content"` ou `"reasoning"`. |
| `"tool_decision"`    | `{ iteracao, tool, args, error }` | Decisão de chamar uma ferramenta. |
| `"tool_confirmation"`| `{ iteracao, tool, args, decisao }` | Resultado da confirmação de ferramenta sensível. |
| `"tool_execution"`   | `{ iteracao, tool, args, resultado, duration_ms }` | Execução de uma ferramenta. |
| `"final_content"`    | `{ content }` | Conteúdo final do agente. |

---

## Dependências (imports)

| Importação | Origem |
|------------|--------|
| `extractToolCalls`, `extractContent`, `parseToolArgs`, `buildToolResultMessage` | `./parseResponse.js` |
| `isSensitive` | `./tools/index.js` |
| `createStreamReducer` | `./streamReduce.js` |

---

## Exemplo de Uso

```js
import { runAgent } from "./src/agent.js";

const resultado = await runAgent({
  task: "Leia o arquivo README.md e resuma seu conteúdo.",
  tools: ferramentas,
  callApi: minhaFuncaoDeAPI,
  executeTool: minhaFuncaoDeExecucao,
  maxIterations: 10,
  onEvent: (evento, dados) => console.log(`[${evento}]`, dados),
  stream: false,
});

console.log(resultado.finalContent);
```