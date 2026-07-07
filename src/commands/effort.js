import { select } from "@inquirer/prompts";
import { setReasoningEffort, currentReasoningEffort } from "../openrouter.js";

const EFFORT_LEVELS = [
  { name: "none", description: "Desativa reasoning" },
  { name: "minimal", description: "Esforço mínimo de reasoning" },
  { name: "low", description: "Esforço baixo" },
  { name: "medium", description: "Esforço médio (padrão da maioria dos modelos)" },
  { name: "high", description: "Esforço alto" },
  { name: "xhigh", description: "Esforço extra alto" },
];

export async function selectEffort({ prompter = select } = {}) {
  const choices = EFFORT_LEVELS.map((e) => ({
    name: e.name === currentReasoningEffort ? `${e.name} (atual)` : e.name,
    value: e.name,
    description: e.description,
  }));

  choices.unshift({ name: "nenhum (não enviar)", value: "", description: "Remove o parâmetro reasoning da requisição" });

  const answer = await prompter({
    message: "Selecione o nível de reasoning effort",
    choices,
    pageSize: 10,
  });

  setReasoningEffort(answer);
  return answer;
}
