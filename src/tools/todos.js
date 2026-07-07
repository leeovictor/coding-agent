let _todos = [];

const CHECK = {
  completed: "[x]",
  in_progress: "[~]",
  cancelled: "[-]",
  pending: "[ ]",
};

const STATUS_LABELS = {
  pending: "pendente",
  in_progress: "em andamento",
  completed: "concluído",
  cancelled: "cancelado",
};

function countByStatus(todos) {
  const counts = {};
  for (const t of todos) {
    const s = t.status || "pending";
    counts[s] = (counts[s] || 0) + 1;
  }
  return counts;
}

export const schema = {
  type: "function",
  function: {
    name: "todos",
    description:
      "Cria e mantém uma lista estruturada de tarefas para a sessão atual. " +
      "Use para planejar, monitorar progresso e organizar trabalho em múltiplos passos. " +
      "Sempre passe a lista COMPLETA de todos os itens (adições, remoções e alterações de status incluídas).",
    parameters: {
      type: "object",
      properties: {
        todos: {
          type: "array",
          description: "Lista completa de tarefas. Sempre inclua todos os itens, nunca apenas os modificados.",
          items: {
            type: "object",
            properties: {
              content: { type: "string", description: "Descrição breve da tarefa." },
              status: {
                type: "string",
                enum: ["pending", "in_progress", "completed", "cancelled"],
                description: "Status atual: pending (pendente), in_progress (em andamento), completed (concluído), cancelled (cancelado).",
              },
              priority: {
                type: "string",
                enum: ["high", "medium", "low"],
                description: "Prioridade: high (alta), medium (média), low (baixa).",
              },
            },
            required: ["content", "status", "priority"],
          },
        },
      },
      required: ["todos"],
    },
  },
};

export const sensitive = false;

export function summarize(args) {
  const items = args?.todos ?? [];
  if (items.length === 0) return "0 itens";
  const counts = countByStatus(items);
  const parts = Object.entries(counts)
    .filter(([, c]) => c > 0)
    .map(([s, c]) => `${c} ${STATUS_LABELS[s] ?? s}`);
  return `${items.length} itens (${parts.join(", ")})`;
}

export function execute({ todos = [] } = {}) {
  if (!Array.isArray(todos)) {
    return "ERRO: parâmetro 'todos' deve ser um array.";
  }

  _todos = todos.map((t, i) => ({
    content: String(t.content ?? ""),
    status: ["pending", "in_progress", "completed", "cancelled"].includes(t.status) ? t.status : "pending",
    priority: ["high", "medium", "low"].includes(t.priority) ? t.priority : "medium",
    index: i + 1,
  }));

  if (_todos.length === 0) {
    return "Lista de tarefas vazia.";
  }

  const lines = [];
  for (const t of _todos) {
    const check = CHECK[t.status] ?? CHECK.pending;
    lines.push(`${check} ${t.content}`);
  }

  return lines.join("\n");
}
