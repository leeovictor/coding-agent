import { search } from "@inquirer/prompts";
import { listModels, setModel, currentModel } from "../openrouter.js";

export async function selectModel({ prompter = search } = {}) {
  const models = await listModels();

  const choices = models.map((m) => ({
    name: m.id,
    value: m.id,
    description: m.context ? `${m.context} ctx` : "",
  }));

  const answer = await prompter({
    message: "Selecione um modelo OpenRouter",
    source: (term) => {
      const lower = (term || "").toLowerCase();
      return choices.filter(
        (c) =>
          !lower ||
          c.name.toLowerCase().includes(lower) ||
          c.value.toLowerCase().includes(lower),
      );
    },
    pageSize: 10,
  });

  setModel(answer);
  return answer;
}
