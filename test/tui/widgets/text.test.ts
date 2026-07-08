import { describe, it, expect } from "vitest";
import { Screen } from "../../../src/tui/screen.js";
import { Text } from "../../../src/tui/widgets/text.js";
import { VBox } from "../../../src/tui/containers.js";

describe("Text", () => {
  it("renders text at given position", () => {
    const s = new Screen({ width: 10, height: 3 });
    const t = new Text({ content: "Hello", x: 2, y: 1 });
    t.render(s);
    expect(s.toString()).toBe(
      "          \n" +
      "  Hello   \n" +
      "          "
    );
  });

  it("renders text with style", () => {
    const s = new Screen({ width: 5, height: 1 });
    const t = new Text({ content: "Hi", x: 0, y: 0, style: { bold: true, fg: "red" } });
    t.render(s);
    const snap = s.snapshot();
    expect(snap[0].char).toBe("H");
    expect(snap[0].bold).toBe(true);
    expect(snap[0].fg).toBe("red");
    expect(snap[1].char).toBe("i");
    expect(snap[1].bold).toBe(true);
    expect(snap[1].fg).toBe("red");
  });

  it("renders without style when style is undefined", () => {
    const s = new Screen({ width: 3, height: 1 });
    const t = new Text({ content: "Hi", x: 0, y: 0 });
    t.render(s);
    const snap = s.snapshot();
    expect(snap[0].fg).toBeNull();
    expect(snap[0].bold).toBe(false);
  });

  it("setContent updates rendered text", () => {
    const s = new Screen({ width: 10, height: 1 });
    const t = new Text({ content: "Hello", x: 0, y: 0 });
    t.setContent("World");
    t.render(s);
    expect(s.toString()).toBe("World     ");
  });

  it("move updates position", () => {
    const s = new Screen({ width: 10, height: 3 });
    const t = new Text({ content: "Hi", x: 0, y: 0 });
    t.move(5, 2);
    t.render(s);
    expect(s.toString()).toBe(
      "          \n" +
      "          \n" +
      "     Hi   "
    );
  });

  it("renders multiline content", () => {
    const s = new Screen({ width: 5, height: 3 });
    const t = new Text({ content: "AB\nCD\nEF", x: 1, y: 0 });
    t.render(s);
    expect(s.toString()).toBe(
      " AB  \n" +
      " CD  \n" +
      " EF  "
    );
  });

  it("empty content is no-op", () => {
    const s = new Screen({ width: 5, height: 1 });
    const t = new Text({ content: "", x: 0, y: 0 });
    t.render(s);
    expect(s.toString()).toBe("     ");
  });

  it("content wider than screen does not crash", () => {
    const s = new Screen({ width: 3, height: 1 });
    const t = new Text({ content: "Hello World", x: 0, y: 0 });
    expect(() => t.render(s)).not.toThrow();
  });

  it("content with negative position does not crash", () => {
    const s = new Screen({ width: 5, height: 1 });
    const t = new Text({ content: "Hi", x: -5, y: 0 });
    expect(() => t.render(s)).not.toThrow();
  });

  it("ignores \\r characters", () => {
    const s = new Screen({ width: 5, height: 1 });
    const t = new Text({ content: "A\rB", x: 0, y: 0 });
    t.render(s);
    expect(s.toString()).toBe("AB   ");
  });

  it("render in tree with clip respects parent bounds", () => {
    const s = new Screen({ width: 10, height: 5 });
    const vbox = new VBox({ x: 0, y: 0, width: 5, height: 3 });
    const t = new Text({ content: "Hello World", x: 0, y: 0 });
    vbox.addChild(t);
    vbox.renderFrame(s);
    const out = s.toString();
    expect(out).toBe(
      "Hello     \n" +
      "          \n" +
      "          \n" +
      "          \n" +
      "          ",
    );
  });

  it("absoluteBounds reflects correct tree position", () => {
    const parent = new Text({ content: "", x: 10, y: 5 });
    const child = new Text({ content: "Hi", x: 3, y: 2 });
    parent.addChild(child);
    const abs = child.absoluteBounds;
    expect(abs.x).toBe(13);
    expect(abs.y).toBe(7);
  });

  it("move updates bounds correctly", () => {
    const t = new Text({ content: "Hi", x: 0, y: 0 });
    t.move(10, 20);
    expect(t.bounds.x).toBe(10);
    expect(t.bounds.y).toBe(20);
  });

  it("Text works inside a VBox (container sets bounds)", () => {
    const s = new Screen({ width: 20, height: 10 });
    const vbox = new VBox({ x: 0, y: 0, width: 20, height: 10 });
    const t = new Text({ content: "Hello", x: 0, y: 0 });
    vbox.addChild(t);
    vbox.renderFrame(s);
    expect(t.bounds.width).toBe(20);
    expect(t.bounds.height).toBe(10);
  });
});
