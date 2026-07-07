import { password } from "@inquirer/prompts";
import { getApiKey, setApiKey } from "../openrouter.js";

export async function promptApiKey({ prompter = password } = {}) {
  const current = getApiKey();
  if (current) {
    const masked = `${current.slice(0, 12)}...${current.slice(-4)}`;
    console.log(`Chave atual: ${masked}`);
  }

  const key = await prompter({
    message: current
      ? "Nova API Key do OpenRouter (deixe vazio para manter)"
      : "Digite sua API Key do OpenRouter",
    mask: true,
  });

  if (!key || !key.trim()) {
    if (current) {
      console.log("Chave mantida.");
      return current;
    }
    console.log("Nenhuma chave fornecida.");
    return null;
  }

  const trimmed = key.trim();
  setApiKey(trimmed);
  console.log("API Key salva com sucesso.");
  return trimmed;
}
