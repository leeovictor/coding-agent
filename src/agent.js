import { extractToolCalls, extractContent, parseToolArgs, buildToolResultMessage } from "./parseResponse.js";
import { shouldConfirm } from "./tools/index.js";
import { createStreamReducer } from "./streamReduce.js";

export const SYSTEM_PROMPT = `Você é um agente de código que opera em um terminal.
Você tem acesso às ferramentas: read_file, write_file, edit_file, patch_file, run_bash, grep, glob, todos, question.
- Use read_file para inspecionar arquivos. Use offset (linha inicial, 1-indexed) e limit (máx. linhas) para ler intervalos específicos.
- Use write_file para criar ou sobrescrever arquivos.
- Use edit_file para modificar trechos específicos de arquivos existentes sem reescrevê-los inteiros.
- Se o texto a substituir aparecer várias vezes, use replaceAll:true ou refine oldString com mais contexto.
- Use patch_file para aplicar um ou mais hunks de unified diff em um arquivo.
- Formato do hunk: @@ -linha_inicio,qtd +linha_inicio,qtd @@ seguido de linhas com prefixo ' ' (contexto), '-' (remove), '+' (adiciona).
- patch_file é útil para mudanças em múltiplos locais do mesmo arquivo ou quando a posição da linha é conhecida.
- Use run_bash para executar comandos do sistema.
- Use grep para buscar conteúdo em arquivos usando expressões regulares. Suporta filtro de tipo de arquivo (include) e limite de resultados (maxResults).
- Use glob para encontrar arquivos por padrão glob (ex: **/*.js, src/**/*.ts). Retorna caminhos ordenados por data de modificação.
- Use todos para criar e manter uma lista de tarefas para a sessão atual. Planeje o trabalho, divida em passos e atualize o progresso à medida que avança.
  Sempre passe a lista COMPLETA de itens no parâmetro "todos", nunca apenas os modificados. Exemplo: todos com 3 itens → passe todos os 3.
- Use question para fazer perguntas ao usuário quando precisar de preferências, esclarecimentos ou decisões antes de prosseguir.
  Passe um array de perguntas, cada uma com header (rótulo curto), question (pergunta completa), options (array de {label, description}) e multiple opcional.
- Quando a tarefa estiver concluída, responda com um resumo em texto natural, sem chamar mais ferramentas.
- Não tente adivinhar conteúdos de arquivos: leia antes.
- Trabalhe em passos pequenos e verificáveis.`;

export async function runAgent(opts) {
  const {
    task,
    tools,
    callApi,
    executeTool,
    maxIterations = Infinity,
    onEvent = () => {},
    confirm = async () => true,
    stream = false,
    messages: initialMessages,
  } = opts;

  const messages = initialMessages ?? [
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
    const response = await callApi(messages, tools, stream);
    onEvent("response", { iteracao: iter, response });

    let message;
    if (stream) {
      const reducer = createStreamReducer();
      let writeFileDetected = false;
      for await (const chunk of response) {
        const choice = chunk.choices?.[0];
        if (choice?.delta) {
          const delta = choice.delta;
          reducer.next(delta);
          const reasoningText = delta.reasoning || delta.reasoning_content;
          if (reasoningText) {
            onEvent("token", { type: "reasoning", text: reasoningText });
          }
          if (delta.content) {
            onEvent("token", { type: "content", text: delta.content });
          }
          if (!writeFileDetected && delta.tool_calls) {
            const toolCalls = reducer.acc.tool_calls.filter(Boolean);
            if (toolCalls.some(tc => tc.function?.name === "write_file")) {
              onEvent("tool_preparing", { tool: "write_file" });
              writeFileDetected = true;
            }
            if (toolCalls.some(tc => tc.function?.name === "edit_file")) {
              onEvent("tool_preparing", { tool: "edit_file" });
              writeFileDetected = true;
            }
            if (toolCalls.some(tc => tc.function?.name === "patch_file")) {
              onEvent("tool_preparing", { tool: "patch_file" });
              writeFileDetected = true;
            }
          }
        }
      }
      message = reducer.getFinalMessage();
    } else {
      message = response?.choices?.[0]?.message;
    }
    if (!message) {
      onEvent("loop_end", { motivo: "resposta_invalida", iteracoes: iter });
      return { iterations: iter, reason: "resposta_invalida", messages };
    }

    const toolCalls = extractToolCalls(message);

    if (toolCalls.length > 0) {
      messages.push(message);

      for (const tc of toolCalls) {
        const { args, error } = parseToolArgs(tc.arguments);
        const nome = tc.name;
        onEvent("tool_decision", { iteracao: iter, tool: nome, args, error });

        let resultado;
        const needsConfirm = shouldConfirm(nome, args);
        if (error) {
          resultado = error;
        } else if (needsConfirm && !(await confirm(nome, args))) {
          resultado = "Usuário recusou a execução desta ferramenta.";
          onEvent("tool_confirmation", { iteracao: iter, tool: nome, args, decisao: false });
        } else {
          if (needsConfirm) {
            onEvent("tool_confirmation", { iteracao: iter, tool: nome, args, decisao: true });
          }
          const inicio = Date.now();
          resultado = await executeTool(nome, args);
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

    const content = extractContent(message);
    if (content) onEvent("final_content", { content });
    onEvent("loop_end", { motivo: "concluido", iteracoes: iter });
    return { iterations: iter, reason: "concluido", messages, finalContent: content };
  }
}
