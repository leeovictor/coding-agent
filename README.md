# cli-agent

Agente CLI mínimo em Node.js que chama a API OpenRouter e executa ferramentas
(read_file, write_file, run_bash) num loop agent.

## Setup

1. `npm install`
2. Copiar `.env.example` para `.env` e preencher `OPENROUTER_API_KEY`

## Uso

```
node src/cli.js "tarefa aqui"
```

## Testes

```
npm test                         # testes unitários
npm run test:integration         # testes de integração (exige chave)
```
