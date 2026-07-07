import { getApiKey, setApiKey } from "./openrouter.js";
import { promptApiKey } from "./commands/apikey.js";

export async function ensureApiKey() {
  if (getApiKey()) return;

  if (!process.stdin.isTTY) {
    throw new Error(
      "Nenhuma API Key configurada.\n" +
      "Execute sem argumentos para o modo interativo e configure via /api-key.\n" +
      "Ou defina OPENROUTER_API_KEY como variável de ambiente."
    );
  }

  console.log("Bem-vindo ao dux!");
  console.log("Para começar, é necessário configurar sua API Key do OpenRouter.");
  console.log("Obtenha uma em: https://openrouter.ai/keys\n");

  const key = await promptApiKey();
  if (!key) {
    throw new Error("Nenhuma API Key fornecida. Use /api-key no REPL para configurar.");
  }

  setApiKey(key);
  console.log("Configuração concluída!");
  console.log("Modelo padrão: deepseek/deepseek-v4-flash");
  console.log("Reasoning effort: medium");
}
