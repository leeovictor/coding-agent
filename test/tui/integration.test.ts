import { describe, it, expect } from "vitest";
import { Screen } from "../../src/tui/screen.js";
import { Root } from "../../src/tui/root.js";
import { VBox } from "../../src/tui/containers.js";
import { Text } from "../../src/tui/widgets/text.js";
import { TextInput } from "../../src/tui/widgets/text-input.js";
import type { KeyEvent } from "../../src/tui/types.js";

function keyEvent(overrides: Partial<KeyEvent>): KeyEvent {
  const defaults: KeyEvent = {
    key: undefined,
    ctrl: false,
    shift: false,
    meta: false,
    sequence: undefined,
  };
  return { ...defaults, ...overrides };
}

describe("Integration", () => {
  it("full render cycle with tree structure", () => {
    const screen = new Screen({ width: 80, height: 24 });
    const root = new Root({ screen });

    const vbox = new VBox({ x: 0, y: 0, width: 80, height: 24 });
    const title = new Text({ content: "Test App", x: 0, y: 0, style: { bold: true } });
    const input = new TextInput({ x: 0, y: 0, width: 40, value: "hello" });
    vbox.addChild(title);
    vbox.addChild(input);
    root.addChild(vbox);

    root.renderFrame();

    const out = screen.toString();
    expect(out).toContain("Test App");
    expect(out).toContain("hel");
  });

  it("key event propagation reaches focused widget", () => {
    const screen = new Screen({ width: 80, height: 24 });
    const root = new Root({ screen });

    const input = new TextInput({ x: 0, y: 0, width: 40, value: "" });
    root.addChild(input);
    root.focusNext();

    root.handleKeyEvent(keyEvent({ sequence: "A" }));
    expect(input.value).toBe("A");

    root.handleKeyEvent(keyEvent({ sequence: "B" }));
    expect(input.value).toBe("AB");
  });

  it("handleResize updates screen and root bounds", () => {
    const screen = new Screen({ width: 80, height: 24 });
    const root = new Root({ screen });

    root.handleResize(120, 40);

    expect(screen.width).toBe(120);
    expect(screen.height).toBe(40);
    expect(root.bounds.width).toBe(120);
    expect(root.bounds.height).toBe(40);
  });

  it("focus cycle works with multiple focusable widgets", () => {
    const screen = new Screen({ width: 80, height: 24 });
    const root = new Root({ screen });

    const input1 = new TextInput({ x: 0, y: 0, width: 20 });
    const input2 = new TextInput({ x: 0, y: 0, width: 20 });
    root.addChild(input1);
    root.addChild(input2);

    root.focusNext();
    expect(root.focusedWidget).toBe(input1);

    root.focusNext();
    expect(root.focusedWidget).toBe(input2);

    root.focusNext();
    expect(root.focusedWidget).toBe(input1);
  });

  it("clip respects container bounds in tree", () => {
    const screen = new Screen({ width: 50, height: 10 });
    const root = new Root({ screen });

    const vbox = new VBox({ x: 0, y: 0, width: 10, height: 4 });
    const text = new Text({ content: "This is a long text that should be clipped", x: 0, y: 0 });
    vbox.addChild(text);
    root.addChild(vbox);

    root.renderFrame();

    const out = screen.toString();
    expect(out).toContain("This is a");
    expect(out).not.toContain("be clipped");
  });

  it("complete tree: render + key events + resize all work together", () => {
    const screen = new Screen({ width: 100, height: 20 });
    const root = new Root({ screen });

    const vbox = new VBox({ x: 0, y: 0, width: 100, height: 20 });
    const t1 = new Text({ content: "Title", x: 0, y: 0 });
    const ti = new TextInput({ x: 0, y: 0, width: 60, value: "" });
    const t2 = new Text({ content: "", x: 0, y: 0 });
    vbox.addChild(t1);
    vbox.addChild(ti);
    vbox.addChild(t2);
    root.addChild(vbox);

    root.renderFrame();
    expect(screen.toString()).toContain("Title");

    root.focusNext();
    root.handleKeyEvent(keyEvent({ sequence: "X" }));
    t2.setContent(ti.value);
    root.renderFrame();
    expect(screen.toString()).toContain("X");

    root.handleResize(80, 16);
    vbox.bounds = { x: 0, y: 0, width: 80, height: 16 };
    root.renderFrame();
    expect(screen.toString()).toContain("Title");
  });
});
