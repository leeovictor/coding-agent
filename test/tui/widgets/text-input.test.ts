import { describe, it, expect } from "vitest";
import { Screen } from "../../../src/tui/screen.js";
import { TextInput } from "../../../src/tui/widgets/text-input.js";
import { VBox } from "../../../src/tui/containers.js";
import { KeyUIEvent } from "../../../src/tui/events.js";
import type { KeyEvent } from "../../../src/tui/types.js";

function keyEvent(overrides: Partial<KeyEvent>): KeyUIEvent {
  const defaults: KeyEvent = {
    key: undefined,
    ctrl: false,
    shift: false,
    meta: false,
    sequence: undefined,
  };
  return new KeyUIEvent("keydown", { ...defaults, ...overrides });
}

describe("TextInput", () => {
  it("renders correctly in tree with clip", () => {
    const s = new Screen({ width: 20, height: 5 });
    const vbox = new VBox({ x: 0, y: 0, width: 8, height: 3 });
    const ti = new TextInput({ x: 0, y: 0, width: 12, value: "hello" });
    ti.onKeyEvent(keyEvent({ key: "home" }));
    vbox.addChild(ti);
    vbox.renderFrame(s);
    const out = s.toString();
    expect(out).toContain("hel");
    expect(out).not.toContain("hello");
  });

  it("onKeyEvent processes backspace", () => {
    const ti = new TextInput({ x: 0, y: 0, width: 20, value: "hello" });
    ti.onKeyEvent(keyEvent({ key: "backspace" }));
    expect(ti.value).toBe("hell");
  });

  it("onKeyEvent processes delete", () => {
    const ti = new TextInput({ x: 0, y: 0, width: 20, value: "hello" });
    ti.onKeyEvent(keyEvent({ key: "home" }));
    ti.onKeyEvent(keyEvent({ key: "delete" }));
    expect(ti.value).toBe("ello");
  });

  it("onKeyEvent processes left/right arrows", () => {
    const ti = new TextInput({ x: 0, y: 0, width: 20, value: "hello" });
    ti.onKeyEvent(keyEvent({ key: "home" }));
    ti.onKeyEvent(keyEvent({ key: "right" }));
    ti.onKeyEvent(keyEvent({ key: "right" }));
    ti.onKeyEvent(keyEvent({ key: "backspace" }));
    expect(ti.value).toBe("hllo");
  });

  it("onKeyEvent processes home/end", () => {
    const ti = new TextInput({ x: 0, y: 0, width: 20, value: "hello" });
    ti.onKeyEvent(keyEvent({ key: "home" }));
    ti.onKeyEvent(keyEvent({ key: "delete" }));
    expect(ti.value).toBe("ello");
    ti.onKeyEvent(keyEvent({ key: "end" }));
    ti.onKeyEvent(keyEvent({ key: "backspace" }));
    expect(ti.value).toBe("ell");
  });

  it("onKeyEvent processes char input", () => {
    const ti = new TextInput({ x: 0, y: 0, width: 20, value: "hel" });
    ti.onKeyEvent(keyEvent({ sequence: "l" }));
    expect(ti.value).toBe("hell");
    ti.onKeyEvent(keyEvent({ sequence: "o" }));
    expect(ti.value).toBe("hello");
  });

  it("onKeyEvent inserts at cursor position", () => {
    const ti = new TextInput({ x: 0, y: 0, width: 20, value: "hllo" });
    ti.onKeyEvent(keyEvent({ key: "left" }));
    ti.onKeyEvent(keyEvent({ key: "left" }));
    ti.onKeyEvent(keyEvent({ key: "left" }));
    ti.onKeyEvent(keyEvent({ sequence: "e" }));
    expect(ti.value).toBe("hello");
  });

  it("onKeyEvent with unconsumed event does not crash", () => {
    const ti = new TextInput({ x: 0, y: 0, width: 20 });
    expect(() => ti.onKeyEvent(keyEvent({ key: "c", ctrl: true, sequence: "\x03" }))).not.toThrow();
    expect(ti.value).toBe("");
  });

  it("onKeyEvent is ignored when not focused", () => {
    const ti = new TextInput({ x: 0, y: 0, width: 20, value: "hello" });
    ti.blur();
    ti.onKeyEvent(keyEvent({ key: "backspace" }));
    expect(ti.value).toBe("hello");
  });

  it("focus and blur work via Widget system", () => {
    const ti = new TextInput({ x: 0, y: 0, width: 10 });
    expect(ti.focused).toBe(true);
    expect(ti.focusable).toBe(true);
    ti.blur();
    expect(ti.focused).toBe(false);
    ti.focus();
    expect(ti.focused).toBe(true);
  });

  it("absoluteBounds reflects correct tree position", () => {
    const vbox = new VBox({ x: 5, y: 10, width: 100, height: 60 });
    const ti = new TextInput({ x: 2, y: 3, width: 50 });
    vbox.addChild(ti);
    expect(ti.absoluteBounds).toEqual({ x: 7, y: 13, width: 50, height: 3 });
  });

  it("move updates bounds correctly", () => {
    const ti = new TextInput({ x: 0, y: 0, width: 50 });
    ti.move(10, 20);
    expect(ti.bounds.x).toBe(10);
    expect(ti.bounds.y).toBe(20);
  });

  it("setWidth updates bounds width", () => {
    const ti = new TextInput({ x: 0, y: 0, width: 20 });
    ti.setWidth(40);
    expect(ti.bounds.width).toBe(40);
    expect(ti.totalWidth).toBe(40);
  });

  it("totalHeight returns 3", () => {
    const ti = new TextInput({ x: 0, y: 0, width: 20 });
    expect(ti.totalHeight).toBe(3);
  });
});
