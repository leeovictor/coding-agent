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

    const content = extractContent(message);
    if (content) onEvent("final_content", { content });
    onEvent("loop_end", { motivo: "concluido", iteracoes: iter });
    return { iterations: iter, reason: "concluido", messages, finalContent: content };
  }
}
