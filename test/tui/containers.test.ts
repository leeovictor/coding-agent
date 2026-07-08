import { describe, it, expect, vi } from "vitest";
import { Widget } from "../../src/tui/widget.js";
import { VBox, HBox, Stack } from "../../src/tui/containers.js";
import { Screen } from "../../src/tui/screen.js";

class TestWidget extends Widget {
  render(_s: Screen): void {
  }
}

function createWidget(): TestWidget {
  return new TestWidget();
}

describe("VBox", () => {
  it("distributes 3 children with equal heights", () => {
    const vbox = new VBox({ x: 0, y: 0, width: 100, height: 60 });
    const c1 = createWidget();
    const c2 = createWidget();
    const c3 = createWidget();
    vbox.addChild(c1);
    vbox.addChild(c2);
    vbox.addChild(c3);

    const screen = new Screen({ width: 100, height: 60 });
    vbox.renderFrame(screen);

    expect(c1.bounds).toEqual({ x: 0, y: 0, width: 100, height: 20 });
    expect(c2.bounds).toEqual({ x: 0, y: 20, width: 100, height: 20 });
    expect(c3.bounds).toEqual({ x: 0, y: 40, width: 100, height: 20 });
  });

  it("child occupies full container width", () => {
    const vbox = new VBox({ x: 0, y: 0, width: 80, height: 40 });
    const child = createWidget();
    vbox.addChild(child);

    const screen = new Screen({ width: 80, height: 40 });
    vbox.renderFrame(screen);

    expect(child.bounds.width).toBe(80);
  });

  it("single child occupies full container height", () => {
    const vbox = new VBox({ x: 0, y: 0, width: 100, height: 50 });
    const child = createWidget();
    vbox.addChild(child);

    const screen = new Screen({ width: 100, height: 50 });
    vbox.renderFrame(screen);

    expect(child.bounds.height).toBe(50);
  });

  it("children are positioned at y: 0, childH, 2*childH, ...", () => {
    const vbox = new VBox({ x: 0, y: 0, width: 100, height: 45 });
    const c1 = createWidget();
    const c2 = createWidget();
    const c3 = createWidget();
    vbox.addChild(c1);
    vbox.addChild(c2);
    vbox.addChild(c3);

    const screen = new Screen({ width: 100, height: 45 });
    vbox.renderFrame(screen);

    expect(c1.bounds.y).toBe(0);
    expect(c2.bounds.y).toBe(15);
    expect(c3.bounds.y).toBe(30);
  });

  it("renderFrame re-layouts after bounds change", () => {
    const vbox = new VBox({ x: 0, y: 0, width: 100, height: 60 });
    const child = createWidget();
    vbox.addChild(child);

    const screen = new Screen({ width: 100, height: 60 });
    vbox.renderFrame(screen);
    expect(child.bounds.height).toBe(60);

    vbox.bounds = { x: 0, y: 0, width: 100, height: 30 };
    vbox.renderFrame(screen);
    expect(child.bounds.height).toBe(30);
  });
});

describe("HBox", () => {
  it("distributes 3 children with equal widths", () => {
    const hbox = new HBox({ x: 0, y: 0, width: 90, height: 40 });
    const c1 = createWidget();
    const c2 = createWidget();
    const c3 = createWidget();
    hbox.addChild(c1);
    hbox.addChild(c2);
    hbox.addChild(c3);

    const screen = new Screen({ width: 90, height: 40 });
    hbox.renderFrame(screen);

    expect(c1.bounds).toEqual({ x: 0, y: 0, width: 30, height: 40 });
    expect(c2.bounds).toEqual({ x: 30, y: 0, width: 30, height: 40 });
    expect(c3.bounds).toEqual({ x: 60, y: 0, width: 30, height: 40 });
  });

  it("children are positioned at x: 0, childW, 2*childW, ...", () => {
    const hbox = new HBox({ x: 0, y: 0, width: 60, height: 50 });
    const c1 = createWidget();
    const c2 = createWidget();
    const c3 = createWidget();
    hbox.addChild(c1);
    hbox.addChild(c2);
    hbox.addChild(c3);

    const screen = new Screen({ width: 60, height: 50 });
    hbox.renderFrame(screen);

    expect(c1.bounds.x).toBe(0);
    expect(c2.bounds.x).toBe(20);
    expect(c3.bounds.x).toBe(40);
  });

  it("single child occupies full width", () => {
    const hbox = new HBox({ x: 0, y: 0, width: 100, height: 30 });
    const child = createWidget();
    hbox.addChild(child);

    const screen = new Screen({ width: 100, height: 30 });
    hbox.renderFrame(screen);

    expect(child.bounds.width).toBe(100);
  });
});

describe("Stack", () => {
  it("all children at (0,0) with container bounds", () => {
    const stack = new Stack({ x: 0, y: 0, width: 100, height: 60 });
    const c1 = createWidget();
    const c2 = createWidget();
    stack.addChild(c1);
    stack.addChild(c2);

    const screen = new Screen({ width: 100, height: 60 });
    stack.renderFrame(screen);

    expect(c1.bounds).toEqual({ x: 0, y: 0, width: 100, height: 60 });
    expect(c2.bounds).toEqual({ x: 0, y: 0, width: 100, height: 60 });
  });

  it("children bounds match container after resize", () => {
    const stack = new Stack({ x: 0, y: 0, width: 50, height: 30 });
    const child = createWidget();
    stack.addChild(child);
    stack.bounds = { x: 0, y: 0, width: 80, height: 50 };

    const screen = new Screen({ width: 80, height: 50 });
    stack.renderFrame(screen);

    expect(child.bounds).toEqual({ x: 0, y: 0, width: 80, height: 50 });
  });
});

describe("VBox stacked layout", () => {
  it("fixed-height children keep their size, flex children share remaining space", () => {
    const vbox = new VBox({ x: 0, y: 0, width: 100, height: 60, layout: "stacked" });
    const fixed = createWidget();
    fixed.bounds.height = 10;
    const flex = createWidget();
    vbox.addChild(fixed);
    vbox.addChild(flex);

    const screen = new Screen({ width: 100, height: 60 });
    vbox.renderFrame(screen);

    expect(fixed.bounds).toEqual({ x: 0, y: 0, width: 100, height: 10 });
    expect(flex.bounds).toEqual({ x: 0, y: 10, width: 100, height: 50 });
  });

  it("multiple fixed children: all keep their size, remaining space unused", () => {
    const vbox = new VBox({ x: 0, y: 0, width: 100, height: 60, layout: "stacked" });
    const c1 = createWidget();
    c1.bounds.height = 10;
    const c2 = createWidget();
    c2.bounds.height = 20;
    vbox.addChild(c1);
    vbox.addChild(c2);

    const screen = new Screen({ width: 100, height: 60 });
    vbox.renderFrame(screen);

    expect(c1.bounds).toEqual({ x: 0, y: 0, width: 100, height: 10 });
    expect(c2.bounds).toEqual({ x: 0, y: 10, width: 100, height: 20 });
  });

  it("all children flexible: behave like uniform layout", () => {
    const vbox = new VBox({ x: 0, y: 0, width: 100, height: 60, layout: "stacked" });
    const c1 = createWidget();
    const c2 = createWidget();
    const c3 = createWidget();
    vbox.addChild(c1);
    vbox.addChild(c2);
    vbox.addChild(c3);

    const screen = new Screen({ width: 100, height: 60 });
    vbox.renderFrame(screen);

    expect(c1.bounds).toEqual({ x: 0, y: 0, width: 100, height: 20 });
    expect(c2.bounds).toEqual({ x: 0, y: 20, width: 100, height: 20 });
    expect(c3.bounds).toEqual({ x: 0, y: 40, width: 100, height: 20 });
  });

  it("not enough space for fixed children: flex children get 0", () => {
    const vbox = new VBox({ x: 0, y: 0, width: 100, height: 5, layout: "stacked" });
    const fixed = createWidget();
    fixed.bounds.height = 10;
    const flex = createWidget();
    vbox.addChild(fixed);
    vbox.addChild(flex);

    const screen = new Screen({ width: 100, height: 5 });
    vbox.renderFrame(screen);

    expect(fixed.bounds).toEqual({ x: 0, y: 0, width: 100, height: 10 });
    expect(flex.bounds).toEqual({ x: 0, y: 10, width: 100, height: 0 });
  });

  it("mixed fixed and multiple flex children", () => {
    const vbox = new VBox({ x: 0, y: 0, width: 100, height: 100, layout: "stacked" });
    const fixed = createWidget();
    fixed.bounds.height = 20;
    const flex1 = createWidget();
    const flex2 = createWidget();
    vbox.addChild(fixed);
    vbox.addChild(flex1);
    vbox.addChild(flex2);

    const screen = new Screen({ width: 100, height: 100 });
    vbox.renderFrame(screen);

    expect(fixed.bounds).toEqual({ x: 0, y: 0, width: 100, height: 20 });
    expect(flex1.bounds).toEqual({ x: 0, y: 20, width: 100, height: 40 });
    expect(flex2.bounds).toEqual({ x: 0, y: 60, width: 100, height: 40 });
  });

  it("children are positioned sequentially at increasing y", () => {
    const vbox = new VBox({ x: 0, y: 0, width: 100, height: 100, layout: "stacked" });
    const c1 = createWidget();
    c1.bounds.height = 15;
    const c2 = createWidget();
    c2.bounds.height = 25;
    const c3 = createWidget();
    vbox.addChild(c1);
    vbox.addChild(c2);
    vbox.addChild(c3);

    const screen = new Screen({ width: 100, height: 100 });
    vbox.renderFrame(screen);

    expect(c1.bounds.y).toBe(0);
    expect(c2.bounds.y).toBe(15);
    expect(c3.bounds.y).toBe(40);
  });

  it("default layout is uniform when not specified", () => {
    const vbox = new VBox({ x: 0, y: 0, width: 100, height: 60 });
    expect(vbox.layout).toBe("uniform");
  });
});

describe("HBox stacked layout", () => {
  it("fixed-width children keep their size, flex children share remaining space", () => {
    const hbox = new HBox({ x: 0, y: 0, width: 100, height: 40, layout: "stacked" });
    const fixed = createWidget();
    fixed.bounds.width = 20;
    const flex = createWidget();
    hbox.addChild(fixed);
    hbox.addChild(flex);

    const screen = new Screen({ width: 100, height: 40 });
    hbox.renderFrame(screen);

    expect(fixed.bounds).toEqual({ x: 0, y: 0, width: 20, height: 40 });
    expect(flex.bounds).toEqual({ x: 20, y: 0, width: 80, height: 40 });
  });

  it("all children flexible: behave like uniform", () => {
    const hbox = new HBox({ x: 0, y: 0, width: 90, height: 40, layout: "stacked" });
    const c1 = createWidget();
    const c2 = createWidget();
    const c3 = createWidget();
    hbox.addChild(c1);
    hbox.addChild(c2);
    hbox.addChild(c3);

    const screen = new Screen({ width: 90, height: 40 });
    hbox.renderFrame(screen);

    expect(c1.bounds).toEqual({ x: 0, y: 0, width: 30, height: 40 });
    expect(c2.bounds).toEqual({ x: 30, y: 0, width: 30, height: 40 });
    expect(c3.bounds).toEqual({ x: 60, y: 0, width: 30, height: 40 });
  });

  it("default layout is uniform when not specified", () => {
    const hbox = new HBox({ x: 0, y: 0, width: 100, height: 60 });
    expect(hbox.layout).toBe("uniform");
  });
});

describe("Common container behavior", () => {
  it("empty container does not throw", () => {
    const vbox = new VBox({ x: 0, y: 0, width: 100, height: 60 });
    const hbox = new HBox({ x: 0, y: 0, width: 100, height: 60 });
    const stack = new Stack({ x: 0, y: 0, width: 100, height: 60 });

    const screen = new Screen({ width: 100, height: 60 });
    expect(() => vbox.renderFrame(screen)).not.toThrow();
    expect(() => hbox.renderFrame(screen)).not.toThrow();
    expect(() => stack.renderFrame(screen)).not.toThrow();
  });

  it("many children are truncated (floor)", () => {
    const vbox = new VBox({ x: 0, y: 0, width: 100, height: 10 });
    for (let i = 0; i < 6; i++) {
      vbox.addChild(createWidget());
    }

    const screen = new Screen({ width: 100, height: 10 });
    vbox.renderFrame(screen);

    for (const child of vbox.children) {
      expect(child.bounds.height).toBe(1);
    }
  });

  it("nested containers work (VBox inside HBox)", () => {
    const hbox = new HBox({ x: 0, y: 0, width: 100, height: 50 });
    const vbox = new VBox({ x: 0, y: 0, width: 0, height: 0 });
    const inner = createWidget();
    vbox.addChild(inner);
    hbox.addChild(vbox);

    const screen = new Screen({ width: 100, height: 50 });
    hbox.renderFrame(screen);

    expect(vbox.bounds.width).toBe(100);
    expect(vbox.bounds.height).toBe(50);
    expect(inner.bounds.width).toBe(100);
    expect(inner.bounds.height).toBe(50);
  });

  it("renderFrame calls render on each child", () => {
    const vbox = new VBox({ x: 0, y: 0, width: 100, height: 50 });
    const child = createWidget();
    vbox.addChild(child);

    const spy = vi.spyOn(child, "render");
    const screen = new Screen({ width: 100, height: 50 });
    vbox.renderFrame(screen);

    expect(spy).toHaveBeenCalled();
  });
});
