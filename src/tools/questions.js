import { select, checkbox, input } from "@inquirer/prompts";

export const schema = {
  type: "function",
  function: {
    name: "question",
    description:
      "Ask the user one or more questions when you need preferences, clarifications, or decisions before proceeding. " +
      "Use this when you need the user's input to continue with a task.",
    parameters: {
      type: "object",
      properties: {
        questions: {
          type: "array",
          description: "List of questions to present to the user.",
          items: {
            type: "object",
            properties: {
              question: { type: "string", description: "The complete question to ask." },
              header: { type: "string", description: "Short label (max 30 chars) shown as the prompt header." },
              options: {
                type: "array",
                description: "Available choices for the user.",
                items: {
                  type: "object",
                  properties: {
                    label: { type: "string", description: "Display text (1-5 words, concise)." },
                    description: { type: "string", description: "Explanation of the choice." },
                  },
                  required: ["label", "description"],
                },
              },
              multiple: { type: "boolean", description: "Allow selecting multiple choices. Default: false." },
            },
            required: ["question", "header", "options"],
          },
        },
      },
      required: ["questions"],
    },
  },
};

export const sensitive = false;

export function summarize(args) {
  const questions = args?.questions ?? [];
  if (questions.length === 0) return "0 perguntas";
  return `${questions.length} pergunta(s)`;
}

export async function execute({ questions = [] } = {}) {
  if (!Array.isArray(questions) || questions.length === 0) {
    return "ERRO: parâmetro 'questions' deve ser um array não vazio.";
  }

  const answers = [];
  for (const q of questions) {
    const header = String(q.header ?? q.question ?? "");
    const question = String(q.question ?? "");
    const options = q.options ?? [];
    const isMultiple = Boolean(q.multiple);

    if (!Array.isArray(options) || options.length === 0) {
      answers.push({ header, question, answer: "ERRO: sem opções fornecidas." });
      continue;
    }

    const choices = options.map((opt) => ({
      name: opt.label ?? "",
      value: opt.label ?? "",
      description: opt.description ?? undefined,
    }));

    if (isMultiple) {
      const selected = await checkbox({
        message: header,
        choices,
      });
      answers.push({ header, question, answer: selected });
    } else {
      choices.push({
        name: "Digitar resposta própria...",
        value: "__custom__",
        description: "Digite sua própria resposta em texto livre",
      });
      const selected = await select({
        message: header,
        choices,
      });
      if (selected === "__custom__") {
        const customAnswer = await input({
          message: question,
        });
        answers.push({ header, question, answer: customAnswer });
      } else {
        answers.push({ header, question, answer: selected });
      }
    }
  }

  return JSON.stringify(answers, null, 2);
}
