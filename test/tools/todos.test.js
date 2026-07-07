import { describe, it, expect } from "vitest";
import { schema, sensitive, summarize, execute } from "../../src/tools/todos.js";

describe("todos", () => {
  describe("schema", () => {
    it("tem nome, descrição e parâmetros corretos", () => {
      expect(schema.type).toBe("function");
      expect(schema.function.name).toBe("todos");
      expect(schema.function.description).toBeTruthy();
      expect(schema.function.parameters.type).toBe("object");
      expect(schema.function.parameters.properties.todos).toBeDefined();
    });

    it("required contém 'todos'", () => {
      expect(schema.function.parameters.required).toEqual(["todos"]);
    });

    it("todo item requer content, status, priority", () => {
      const item = schema.function.parameters.properties.todos.items;
      expect(item.required).toEqual(["content", "status", "priority"]);
    });

    it("status enum tem pending, in_progress, completed, cancelled", () => {
      const statusProp = schema.function.parameters.properties.todos.items.properties.status;
      expect(statusProp.enum).toEqual(["pending", "in_progress", "completed", "cancelled"]);
    });

    it("priority enum tem high, medium, low", () => {
      const prioProp = schema.function.parameters.properties.todos.items.properties.priority;
      expect(prioProp.enum).toEqual(["high", "medium", "low"]);
    });
  });

  describe("sensitive", () => {
    it("não é sensível", () => {
      expect(sensitive).toBe(false);
    });
  });

  describe("summarize", () => {
    it("retorna '0 itens' para array vazio", () => {
      expect(summarize({ todos: [] })).toBe("0 itens");
    });

    it("retorna 0 itens para args vazio", () => {
      expect(summarize({})).toBe("0 itens");
    });

    it("retorna contagem para itens com status misto", () => {
      const items = [
        { content: "a", status: "pending", priority: "high" },
        { content: "b", status: "in_progress", priority: "medium" },
        { content: "c", status: "completed", priority: "low" },
        { content: "d", status: "pending", priority: "high" },
      ];
      expect(summarize({ todos: items })).toBe("4 itens (2 pendente, 1 em andamento, 1 concluído)");
    });
  });

  describe("execute", () => {
    it("retorna mensagem vazia para array vazio", () => {
      const result = execute({ todos: [] });
      expect(result).toMatch(/vazia/);
    });

    it("retorna erro se todos não é array", () => {
      const result = execute({ todos: "nao array" });
      expect(result).toMatch(/ERRO/);
    });

    it("retorna display formatado para itens válidos", () => {
      const items = [
        { content: "Fazer café", status: "in_progress", priority: "high" },
        { content: "Estudar", status: "pending", priority: "medium" },
      ];
      const result = execute({ todos: items });
      expect(result).toContain("[~] Fazer café");
      expect(result).toContain("[ ] Estudar");
    });

    it("normaliza status inválido para pending", () => {
      const items = [
        { content: "Teste", status: "invalid", priority: "low" },
      ];
      const result = execute({ todos: items });
      expect(result).toContain("[ ] Teste");
    });

    it("normaliza priority inválida para medium", () => {
      const items = [
        { content: "Teste", status: "pending", priority: "ultra" },
      ];
      const result = execute({ todos: items });
      expect(result).toContain("[ ] Teste");
    });

    it("retorna display sem argumentos", () => {
      const result = execute();
      expect(result).toMatch(/vazia/);
    });

    it("usa [x] para completed", () => {
      const items = [
        { content: "a", status: "completed", priority: "high" },
      ];
      const result = execute({ todos: items });
      expect(result).toContain("[x] a");
    });

    it("usa [-] para cancelled", () => {
      const items = [
        { content: "a", status: "cancelled", priority: "low" },
      ];
      const result = execute({ todos: items });
      expect(result).toContain("[-] a");
    });
  });
});
