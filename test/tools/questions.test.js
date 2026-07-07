import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@inquirer/prompts", () => ({
  select: vi.fn(),
  checkbox: vi.fn(),
  input: vi.fn(),
}));

import { select, checkbox, input } from "@inquirer/prompts";
import { schema, sensitive, summarize, execute } from "../../src/tools/questions.js";

describe("question", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("schema", () => {
    it("tem nome, descrição e parâmetros corretos", () => {
      expect(schema.type).toBe("function");
      expect(schema.function.name).toBe("question");
      expect(schema.function.description).toBeTruthy();
      expect(schema.function.parameters.type).toBe("object");
      expect(schema.function.parameters.properties.questions).toBeDefined();
    });

    it("required contém 'questions'", () => {
      expect(schema.function.parameters.required).toEqual(["questions"]);
    });

    it("cada pergunta requer header, question, options", () => {
      const item = schema.function.parameters.properties.questions.items;
      expect(item.required).toEqual(["question", "header", "options"]);
    });

    it("cada option requer label e description", () => {
      const opt = schema.function.parameters.properties.questions.items.properties.options.items;
      expect(opt.required).toEqual(["label", "description"]);
    });

    it("multiple é booleano opcional", () => {
      const multiple = schema.function.parameters.properties.questions.items.properties.multiple;
      expect(multiple.type).toBe("boolean");
    });
  });

  describe("sensitive", () => {
    it("não é sensível", () => {
      expect(sensitive).toBe(false);
    });
  });

  describe("summarize", () => {
    it("retorna '0 perguntas' para array vazio", () => {
      expect(summarize({ questions: [] })).toBe("0 perguntas");
    });

    it("retorna '0 perguntas' para args vazio", () => {
      expect(summarize({})).toBe("0 perguntas");
    });

    it("retorna contagem para perguntas", () => {
      expect(summarize({
        questions: [
          { header: "a", question: "b", options: [{ label: "c", description: "d" }] },
        ],
      })).toBe("1 pergunta(s)");
    });
  });

  describe("execute", () => {
    it("retorna erro se questions não é array", async () => {
      const result = await execute({ questions: "invalido" });
      expect(result).toMatch(/ERRO/);
    });

    it("pausa e retoma consoleHandler durante prompts do inquirer", async () => {
      const pauseInput = vi.fn();
      const resumeInput = vi.fn();
      const consoleHandler = { pauseInput, resumeInput };

      select.mockResolvedValue("React");

      await execute({
        questions: [{
          header: "Framework",
          question: "Qual framework?",
          options: [{ label: "React", description: "UI" }],
        }],
      }, { consoleHandler });

      expect(pauseInput).toHaveBeenCalledOnce();
      expect(resumeInput).toHaveBeenCalledOnce();
      const pauseOrder = pauseInput.mock.invocationCallOrder[0];
      const resumeOrder = resumeInput.mock.invocationCallOrder[0];
      expect(pauseOrder).toBeLessThan(resumeOrder);
    });

    it("pausa e retoma para cada pergunta individualmente", async () => {
      const pauseInput = vi.fn();
      const resumeInput = vi.fn();
      const consoleHandler = { pauseInput, resumeInput };

      select.mockResolvedValueOnce("A").mockResolvedValueOnce("B");

      await execute({
        questions: [
          { header: "Q1", question: "?", options: [{ label: "A", description: "a" }] },
          { header: "Q2", question: "?", options: [{ label: "B", description: "b" }] },
        ],
      }, { consoleHandler });

      expect(pauseInput).toHaveBeenCalledTimes(2);
      expect(resumeInput).toHaveBeenCalledTimes(2);
    });

    it("retoma mesmo quando prompt do inquirer lança exceção", async () => {
      const pauseInput = vi.fn();
      const resumeInput = vi.fn();
      const consoleHandler = { pauseInput, resumeInput };

      select.mockRejectedValue(new Error("User force closed the prompt"));

      await expect(execute({
        questions: [{
          header: "Q",
          question: "?",
          options: [{ label: "A", description: "a" }],
        }],
      }, { consoleHandler })).rejects.toThrow("User force closed the prompt");

      expect(pauseInput).toHaveBeenCalledOnce();
      expect(resumeInput).toHaveBeenCalledOnce();
    });

    it("resumeInput é chamado após cada prompt (despausa stdin)", async () => {
      const pauseInput = vi.fn();
      const resumeInput = vi.fn();
      const consoleHandler = { pauseInput, resumeInput };

      select.mockResolvedValue("React");

      await execute({
        questions: [{
          header: "Framework",
          question: "Qual framework?",
          options: [{ label: "React", description: "UI" }],
        }],
      }, { consoleHandler });

      expect(resumeInput).toHaveBeenCalled();
      const pauseOrder = pauseInput.mock.invocationCallOrder[0];
      const resumeOrder = resumeInput.mock.invocationCallOrder[0];
      expect(pauseOrder).toBeLessThan(resumeOrder);
    });

    it("funciona normalmente sem consoleHandler (backward compat)", async () => {
      select.mockResolvedValue("React");
      const result = await execute({
        questions: [{
          header: "Framework",
          question: "Qual framework usar?",
          options: [{ label: "React", description: "UI" }],
        }],
      });
      const parsed = JSON.parse(result);
      expect(parsed[0].answer).toBe("React");
    });

    it("retorna erro se questions é vazio", async () => {
      const result = await execute({ questions: [] });
      expect(result).toMatch(/ERRO/);
    });

    it("retorna erro sem argumentos", async () => {
      const result = await execute();
      expect(result).toMatch(/ERRO/);
    });

    it("retorna erro se pergunta não tem options", async () => {
      const result = await execute({
        questions: [
          { header: "h", question: "q", options: [] },
        ],
      });
      const parsed = JSON.parse(result);
      expect(parsed[0].answer).toMatch(/ERRO/);
    });

    it("usa select para single-select e retorna escolha", async () => {
      select.mockResolvedValue("React");
      const result = await execute({
        questions: [{
          header: "Framework",
          question: "Qual framework usar?",
          options: [
            { label: "React", description: "Biblioteca UI" },
            { label: "Vue", description: "Framework progressivo" },
          ],
        }],
      });
      expect(select).toHaveBeenCalledOnce();
      const parsed = JSON.parse(result);
      expect(parsed[0].answer).toBe("React");
    });

    it("adiciona opção custom no single-select", async () => {
      select.mockResolvedValue("__custom__");
      input.mockResolvedValue("Minha resposta customizada");
      const result = await execute({
        questions: [{
          header: "Teste",
          question: "Sua escolha?",
          options: [{ label: "A", description: "Opção A" }],
        }],
      });
      expect(input).toHaveBeenCalledOnce();
      const parsed = JSON.parse(result);
      expect(parsed[0].answer).toBe("Minha resposta customizada");
    });

    it("usa checkbox para multiple e retorna array", async () => {
      checkbox.mockResolvedValue(["React", "Vue"]);
      const result = await execute({
        questions: [{
          header: "Frameworks",
          question: "Quais você gosta?",
          options: [
            { label: "React", description: "Biblioteca UI" },
            { label: "Vue", description: "Framework progressivo" },
            { label: "Svelte", description: "Compilador" },
          ],
          multiple: true,
        }],
      });
      expect(checkbox).toHaveBeenCalledOnce();
      expect(select).not.toHaveBeenCalled();
      const parsed = JSON.parse(result);
      expect(parsed[0].answer).toEqual(["React", "Vue"]);
    });

    it("processa múltiplas perguntas em sequência", async () => {
      select.mockResolvedValueOnce("TypeScript").mockResolvedValueOnce("React");
      const result = await execute({
        questions: [
          {
            header: "Linguagem",
            question: "Qual linguagem?",
            options: [{ label: "TypeScript", description: "JS com tipos" }],
          },
          {
            header: "Framework",
            question: "Qual framework?",
            options: [{ label: "React", description: "UI" }],
          },
        ],
      });
      expect(select).toHaveBeenCalledTimes(2);
      const parsed = JSON.parse(result);
      expect(parsed[0].answer).toBe("TypeScript");
      expect(parsed[1].answer).toBe("React");
    });

    it("usa header como message do prompt, fallback para question", async () => {
      select.mockResolvedValue("A");
      const result = await execute({
        questions: [{
          question: "Pergunta sem header",
          options: [{ label: "A", description: "Opção A" }],
        }],
      });
      expect(select).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Pergunta sem header" }),
      );
    });
  });
});
