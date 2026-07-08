import { describe, it, expect, vi } from "vitest";
import { Root } from "../../src/tui/root.js";
import { Widget } from "../../src/tui/widget.js";
import { Screen } from "../../src/tui/screen.js";
import { Renderer } from "../../src/tui/renderer.js";
import { KeyUIEvent } from "../../src/tui/events.js";
import type { KeyEvent } from "../../src/tui/types.js";

class TestWidget extends Widget {
  render(): void {
  }
}

function createWidget(
  bounds?: { x: number; y: number; width: number; height: number },
): TestWidget {
  const w = new TestWidget();
  if (bounds) {
    w.bounds = { ...bounds };
  }
  return w;
}

class FocusableWidget extends TestWidget {
  focusable = true;
}

describe("Root", () => {
  describe("renderFrame", () => {
    it("calls render on children in the tree", () => {
      const screen = new Screen({ width: 50, height: 30 });
      const root = new Root({ screen });
      const child = createWidget({ x: 0, y: 0, width: 10, height: 10 });
      root.addChild(child);

      const spy = vi.spyOn(child, "render");
      root.renderFrame();

      expect(spy).toHaveBeenCalled();
    });

    it("calls clear and fill on screen", () => {
      const screen = new Screen({ width: 50, height: 30 });
      const root = new Root({ screen });

      const clearSpy = vi.spyOn(screen, "clear");
      const fillSpy = vi.spyOn(screen, "fill");

      root.renderFrame();

      expect(clearSpy).toHaveBeenCalled();
      expect(fillSpy).toHaveBeenCalled();
    });

    it("calls renderer.render if renderer is present", () => {
      const screen = new Screen({ width: 50, height: 30 });
      const stdout = { write: vi.fn() };
      const renderer = new Renderer({ stdout });
      const renderSpy = vi.spyOn(renderer, "render");

      const root = new Root({ screen, renderer });
      root.renderFrame();

      expect(renderSpy).toHaveBeenCalledWith(screen);
    });

    it("does not crash without renderer", () => {
      const screen = new Screen({ width: 50, height: 30 });
      const root = new Root({ screen });

      expect(() => root.renderFrame()).not.toThrow();
    });

    it("does not crash without children", () => {
      const screen = new Screen({ width: 50, height: 30 });
      const root = new Root({ screen });

      expect(() => root.renderFrame()).not.toThrow();
    });
  });

  describe("handleKeyEvent", () => {
    it("dispatches KeyUIEvent through the tree", () => {
      const screen = new Screen({ width: 50, height: 30 });
      const root = new Root({ screen });
      const child = createWidget();
      root.addChild(child);

      const spy = vi.spyOn(root, "dispatchEvent");
      const ke: KeyEvent = { key: "a", ctrl: false, shift: false, meta: false, sequence: "a" };

      root.handleKeyEvent(ke);

      expect(spy).toHaveBeenCalledOnce();
      const event = spy.mock.calls[0][0] as KeyUIEvent;
      expect(event).toBeInstanceOf(KeyUIEvent);
      expect(event.type).toBe("keydown");
      expect(event.keyEvent).toBe(ke);
    });

    it("sets focusedWidget as event target", () => {
      const screen = new Screen({ width: 50, height: 30 });
      const root = new Root({ screen });
      const focusable = new FocusableWidget();
      root.addChild(focusable);
      root.focusNext();

      const spy = vi.spyOn(root, "dispatchEvent");
      const ke: KeyEvent = { key: "a", ctrl: false, shift: false, meta: false, sequence: "a" };

      root.handleKeyEvent(ke);

      const event = spy.mock.calls[0][0] as KeyUIEvent;
      expect(event.target).toBe(focusable);
    });

    it("capture phase reaches root before focusedWidget target", () => {
      const screen = new Screen({ width: 50, height: 30 });
      const root = new Root({ screen });
      const focusable = new FocusableWidget();
      root.addChild(focusable);
      root.focusNext();

      const log: string[] = [];
      vi.spyOn(root, "onEvent").mockImplementation((e) => {
        log.push(`root:${e.phase}`);
      });
      vi.spyOn(focusable, "onEvent").mockImplementation((e) => {
        log.push(`focusable:${e.phase}`);
      });

      const ke: KeyEvent = { key: "a", ctrl: false, shift: false, meta: false, sequence: "a" };
      root.handleKeyEvent(ke);

      expect(log).toEqual([
        "root:capture",
        "focusable:target",
        "root:bubble",
      ]);
    });

    it("does not throw if no widget is focused", () => {
      const screen = new Screen({ width: 50, height: 30 });
      const root = new Root({ screen });

      const ke: KeyEvent = { key: "a", ctrl: false, shift: false, meta: false, sequence: "a" };
      expect(() => root.handleKeyEvent(ke)).not.toThrow();
    });
  });

  describe("focusNext / focusPrev", () => {
    it("focusNext advances to next focusable widget (depth-first)", () => {
      const screen = new Screen({ width: 50, height: 30 });
      const root = new Root({ screen });
      const f1 = new FocusableWidget();
      const f2 = new FocusableWidget();
      const nf = createWidget();
      root.addChild(f1);
      root.addChild(nf);
      root.addChild(f2);

      root.focusNext();
      expect(root.focusedWidget).toBe(f1);
      expect(f1.focused).toBe(true);

      root.focusNext();
      expect(root.focusedWidget).toBe(f2);
      expect(f1.focused).toBe(false);
      expect(f2.focused).toBe(true);
    });

    it("focusNext wraps around to first focusable", () => {
      const screen = new Screen({ width: 50, height: 30 });
      const root = new Root({ screen });
      const f1 = new FocusableWidget();
      const f2 = new FocusableWidget();
      root.addChild(f1);
      root.addChild(f2);

      root.focusNext(); // f1
      root.focusNext(); // f2
      root.focusNext(); // back to f1

      expect(root.focusedWidget).toBe(f1);
    });

    it("focusPrev cycles backwards", () => {
      const screen = new Screen({ width: 50, height: 30 });
      const root = new Root({ screen });
      const f1 = new FocusableWidget();
      const f2 = new FocusableWidget();
      const f3 = new FocusableWidget();
      root.addChild(f1);
      root.addChild(f2);
      root.addChild(f3);

      root.focusNext(); // f1
      root.focusNext(); // f2
      root.focusPrev(); // back to f1

      expect(root.focusedWidget).toBe(f1);
    });

    it("focusPrev wraps around to last", () => {
      const screen = new Screen({ width: 50, height: 30 });
      const root = new Root({ screen });
      const f1 = new FocusableWidget();
      const f2 = new FocusableWidget();
      root.addChild(f1);
      root.addChild(f2);

      root.focusPrev(); // wrap to last

      expect(root.focusedWidget).toBe(f2);
    });

    it("with a single focusable, focusNext stays on it", () => {
      const screen = new Screen({ width: 50, height: 30 });
      const root = new Root({ screen });
      const f1 = new FocusableWidget();
      root.addChild(f1);

      root.focusNext();
      expect(root.focusedWidget).toBe(f1);

      root.focusNext();
      expect(root.focusedWidget).toBe(f1);
    });

    it("with no focusable widgets, focusedWidget remains null", () => {
      const screen = new Screen({ width: 50, height: 30 });
      const root = new Root({ screen });
      const nf1 = createWidget();
      const nf2 = createWidget();
      root.addChild(nf1);
      root.addChild(nf2);

      root.focusNext();
      expect(root.focusedWidget).toBeNull();
    });

    it("focusNext walks depth-first into nested children", () => {
      const screen = new Screen({ width: 50, height: 30 });
      const root = new Root({ screen });
      const parent = new FocusableWidget();
      const child = new FocusableWidget();
      parent.addChild(child);
      root.addChild(parent);

      // Depth-first: parent first, then child
      root.focusNext();
      expect(root.focusedWidget).toBe(parent);

      root.focusNext();
      expect(root.focusedWidget).toBe(child);
    });

    it("blurs previous widget when focusing next", () => {
      const screen = new Screen({ width: 50, height: 30 });
      const root = new Root({ screen });
      const f1 = new FocusableWidget();
      const f2 = new FocusableWidget();
      root.addChild(f1);
      root.addChild(f2);

      root.focusNext();
      expect(f1.focused).toBe(true);

      root.focusNext();
      expect(f1.focused).toBe(false);
      expect(f2.focused).toBe(true);
    });
  });

  describe("handleResize", () => {
    it("calls screen.resize with given dimensions", () => {
      const screen = new Screen({ width: 50, height: 30 });
      const root = new Root({ screen });

      const spy = vi.spyOn(screen, "resize");
      root.handleResize(80, 24);

      expect(spy).toHaveBeenCalledWith(80, 24);
    });
  });
});
