import { search } from "@inquirer/prompts";
import { listAgents, getCurrentAgentName } from "../agents.js";

export async function selectAgent({ prompter = search } = {}) {
  const agents = listAgents();
  const current = getCurrentAgentName();

  const choices = agents.map((a) => ({
    name: a.description ? `${a.name} — ${a.description}` : a.name,
    value: a.name,
    description: a.name === current ? "(ativo)" : "",
  }));

  const answer = await prompter({
    message: "Selecione um agente",
    source: (term) => {
      const lower = (term || "").toLowerCase();
      return choices.filter(
        (c) =>
          !lower ||
          c.value.toLowerCase().includes(lower) ||
          c.name.toLowerCase().includes(lower),
      );
    },
    pageSize: 10,
  });

  return answer;
}

export async function listAndShowAgents() {
  const agents = listAgents();
  const current = getCurrentAgentName();

  console.log("Agentes dispon\u00edveis:");
  for (const a of agents) {
    const marker = a.name === current ? " (ativo)" : "";
    console.log(`  ${a.name}${marker} - ${a.description}`);
  }
}
