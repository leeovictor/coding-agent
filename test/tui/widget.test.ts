import { describe, it, expect, vi } from "vitest";
import { Widget } from "../../src/tui/widget.js";
import { Screen } from "../../src/tui/screen.js";

class TestWidget extends Widget {
  render(_screen: Screen): void {
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

describe("Widget", () => {
  describe("tree operations", () => {
    it("addChild sets parent on child", () => {
      const parent = createWidget();
      const child = createWidget();
      parent.addChild(child);
      expect(child.parent).toBe(parent);
    });

    it("addChild appends to children array", () => {
      const parent = createWidget();
      const child = createWidget();
      parent.addChild(child);
      expect(parent.children).toHaveLength(1);
      expect(parent.children[0]).toBe(child);
    });

    it("removeChild clears parent", () => {
      const parent = createWidget();
      const child = createWidget();
      parent.addChild(child);
      parent.removeChild(child);
      expect(child.parent).toBeNull();
    });

    it("removeChild removes from children array", () => {
      const parent = createWidget();
      const child = createWidget();
      parent.addChild(child);
      parent.removeChild(child);
      expect(parent.children).toHaveLength(0);
    });

    it("addChild removes from previous parent first", () => {
      const p1 = createWidget();
      const p2 = createWidget();
      const child = createWidget();
      p1.addChild(child);
      p2.addChild(child);
      expect(p1.children).toHaveLength(0);
      expect(child.parent).toBe(p2);
    });

    it("addChild with self is no-op", () => {
      const w = createWidget();
      w.addChild(w);
      expect(w.children).toHaveLength(0);
    });

    it("addChild duplicate is no-op", () => {
      const parent = createWidget();
      const child = createWidget();
      parent.addChild(child);
      parent.addChild(child);
      expect(parent.children).toHaveLength(1);
    });
  });

  describe("isRoot / root", () => {
    it("widget without parent is root", () => {
      const w = createWidget();
      expect(w.isRoot).toBe(true);
      expect(w.root).toBe(w);
    });

    it("widget with parent is not root", () => {
      const parent = createWidget();
      const child = createWidget();
      parent.addChild(child);
      expect(child.isRoot).toBe(false);
    });

    it("root returns the topmost ancestor", () => {
      const root = createWidget();
      const parent = createWidget();
      const child = createWidget();
      root.addChild(parent);
      parent.addChild(child);
      expect(child.root).toBe(root);
      expect(parent.root).toBe(root);
    });
  });

  describe("absoluteBounds", () => {
    it("root widget returns its own bounds", () => {
      const w = createWidget({ x: 5, y: 3, width: 20, height: 10 });
      expect(w.absoluteBounds).toEqual({ x: 5, y: 3, width: 20, height: 10 });
    });

    it("child absoluteBounds includes parent offset", () => {
      const parent = createWidget({ x: 10, y: 5, width: 50, height: 30 });
      const child = createWidget({ x: 3, y: 2, width: 10, height: 5 });
      parent.addChild(child);
      expect(child.absoluteBounds).toEqual({ x: 13, y: 7, width: 10, height: 5 });
    });

    it("absoluteBounds accumulates offsets through chain", () => {
      const g = createWidget({ x: 2, y: 3, width: 100, height: 100 });
      const p = createWidget({ x: 5, y: 10, width: 50, height: 50 });
      const c = createWidget({ x: 1, y: 2, width: 10, height: 10 });
      g.addChild(p);
      p.addChild(c);
      expect(c.absoluteBounds).toEqual({ x: 8, y: 15, width: 10, height: 10 });
    });

    it("absoluteBounds returns a copy, not a reference", () => {
      const w = createWidget({ x: 1, y: 2, width: 10, height: 10 });
      const abs = w.absoluteBounds;
      abs.x = 99;
      expect(w.absoluteBounds.x).toBe(1);
    });
  });

  describe("renderFrame", () => {
    it("calls render on the widget", () => {
      const screen = new Screen({ width: 50, height: 30 });
      const widget = createWidget({ x: 0, y: 0, width: 10, height: 10 });
      const spy = vi.spyOn(widget, "render");
      widget.renderFrame(screen);
      expect(spy).toHaveBeenCalledWith(screen);
    });

    it("calls renderFrame on children", () => {
      const screen = new Screen({ width: 50, height: 30 });
      const parent = createWidget({ x: 0, y: 0, width: 20, height: 20 });
      const child = createWidget({ x: 0, y: 0, width: 10, height: 10 });
      parent.addChild(child);
      const spy = vi.spyOn(child, "renderFrame");
      parent.renderFrame(screen);
      expect(spy).toHaveBeenCalledWith(screen);
    });

    it("applies clip around render", () => {
      const screen = new Screen({ width: 50, height: 30 });
      const pushSpy = vi.spyOn(screen, "pushClip");
      const popSpy = vi.spyOn(screen, "popClip");

      const widget = createWidget({ x: 5, y: 3, width: 20, height: 10 });
      widget.renderFrame(screen);

      expect(pushSpy).toHaveBeenCalledWith(5, 3, 20, 10);
      expect(popSpy).toHaveBeenCalled();
    });

    it("pushClip and popClip are balanced", () => {
      const screen = new Screen({ width: 50, height: 30 });
      const pushSpy = vi.spyOn(screen, "pushClip");
      const popSpy = vi.spyOn(screen, "popClip");

      const parent = createWidget({ x: 0, y: 0, width: 20, height: 20 });
      const child = createWidget({ x: 0, y: 0, width: 10, height: 10 });
      parent.addChild(child);
      parent.renderFrame(screen);

      expect(pushSpy).toHaveBeenCalledTimes(2);
      expect(popSpy).toHaveBeenCalledTimes(2);
    });

    it("render respects clip — cells outside bounds are ignored", () => {
      const screen = new Screen({ width: 5, height: 3 });
      const widget = createWidget({ x: 0, y: 0, width: 3, height: 1 });
      vi.spyOn(widget, "render").mockImplementation((s) => {
        s.setCell(4, 2, { char: "X" });
      });
      widget.renderFrame(screen);
      expect(screen.toString()).toBe(
        "     \n" +
        "     \n" +
        "     ",
      );
    });
  });

  describe("mount / unmount", () => {
    it("mount sets mounted and propagates to children", () => {
      const parent = createWidget();
      const child = createWidget();
      parent.addChild(child);
      parent.mount();
      expect(parent.mounted).toBe(true);
      expect(child.mounted).toBe(true);
    });

    it("unmount clears mounted and propagates to children", () => {
      const parent = createWidget();
      const child = createWidget();
      parent.addChild(child);
      parent.mount();
      parent.unmount();
      expect(parent.mounted).toBe(false);
      expect(child.mounted).toBe(false);
    });

    it("addChild triggers mount when parent is mounted", () => {
      const parent = createWidget();
      parent.mount();
      const child = createWidget();
      parent.addChild(child);
      expect(child.mounted).toBe(true);
    });

    it("removeChild triggers unmount when child was mounted", () => {
      const parent = createWidget();
      const child = createWidget();
      parent.addChild(child);
      parent.mount();
      parent.removeChild(child);
      expect(child.mounted).toBe(false);
      expect(child.parent).toBeNull();
    });

    it("addChild does not trigger mount when parent is not mounted", () => {
      const parent = createWidget();
      const child = createWidget();
      parent.addChild(child);
      expect(child.mounted).toBe(false);
    });

    it("mount is idempotent", () => {
      const w = createWidget();
      w.mount();
      w.mount();
      expect(w.mounted).toBe(true);
    });
  });

  describe("findWidgetAt", () => {
    it("returns deepest widget at given coordinates", () => {
      const parent = createWidget({ x: 0, y: 0, width: 10, height: 10 });
      const child = createWidget({ x: 2, y: 2, width: 3, height: 3 });
      parent.addChild(child);
      expect(parent.findWidgetAt(3, 3)).toBe(child);
    });

    it("returns parent if point is inside parent but not in any child", () => {
      const parent = createWidget({ x: 0, y: 0, width: 10, height: 10 });
      const child = createWidget({ x: 2, y: 2, width: 3, height: 3 });
      parent.addChild(child);
      expect(parent.findWidgetAt(0, 0)).toBe(parent);
    });

    it("returns null if point is outside all widget bounds", () => {
      const w = createWidget({ x: 0, y: 0, width: 5, height: 5 });
      expect(w.findWidgetAt(10, 10)).toBeNull();
    });

    it("with overlapping children returns the last added (topmost)", () => {
      const parent = createWidget({ x: 0, y: 0, width: 10, height: 10 });
      const first = createWidget({ x: 0, y: 0, width: 5, height: 5 });
      const second = createWidget({ x: 0, y: 0, width: 5, height: 5 });
      parent.addChild(first);
      parent.addChild(second);
      expect(parent.findWidgetAt(2, 2)).toBe(second);
    });

    it("returns correct widget in nested tree", () => {
      const root = createWidget({ x: 0, y: 0, width: 100, height: 100 });
      const container = createWidget({ x: 10, y: 10, width: 80, height: 80 });
      const button = createWidget({ x: 20, y: 20, width: 30, height: 15 });
      root.addChild(container);
      container.addChild(button);

      expect(root.findWidgetAt(45, 37)).toBe(button);
      expect(root.findWidgetAt(15, 15)).toBe(container);
      expect(root.findWidgetAt(5, 5)).toBe(root);
      expect(root.findWidgetAt(200, 200)).toBeNull();
    });
  });

  describe("focus", () => {
    it("focus sets focused to true", () => {
      const w = createWidget();
      w.focus();
      expect(w.focused).toBe(true);
    });

    it("blur sets focused to false", () => {
      const w = createWidget();
      w.focus();
      w.blur();
      expect(w.focused).toBe(false);
    });
  });
});
