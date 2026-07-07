import { getApiKey, setApiKey } from "./openrouter.js";
import { promptApiKey } from "./commands/apikey.js";

export async function ensureApiKey() {
  if (getApiKey()) return;

  if (!process.stdin.isTTY) {
    console.error("Nenhuma API Key configurada.");
    console.error("Execute sem argumentos para o modo interativo e configure via /api-key.");
    console.error("Ou defina OPENROUTER_API_KEY como variável de ambiente.");
    process.exit(1);
  }

  console.log("Bem-vindo ao dux!");
  console.log("Para começar, é necessário configurar sua API Key do OpenRouter.");
  console.log("Obtenha uma em: https://openrouter.ai/keys\n");

  const key = await promptApiKey();
  if (!key) {
    console.log("Você pode configurar a chave depois usando o comando /api-key.");
    process.exit(1);
  }

  setApiKey(key);
  console.log("Configuração concluída!");
  console.log("Modelo padrão: deepseek/deepseek-v4-flash");
  console.log("Reasoning effort: medium");
}
