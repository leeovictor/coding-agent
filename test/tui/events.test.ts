import { describe, it, expect, vi } from "vitest";
import { Widget } from "../../src/tui/widget.js";
import { UIEvent, KeyUIEvent } from "../../src/tui/events.js";
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

describe("UIEvent", () => {
  it("preserves event type", () => {
    const ev = new UIEvent("click");
    expect(ev.type).toBe("click");
  });

  it("stopPropagation sets propagationStopped", () => {
    const ev = new UIEvent("click");
    expect(ev.propagationStopped).toBe(false);
    ev.stopPropagation();
    expect(ev.propagationStopped).toBe(true);
  });

  it("preventDefault sets defaultPrevented", () => {
    const ev = new UIEvent("click");
    expect(ev.defaultPrevented).toBe(false);
    ev.preventDefault();
    expect(ev.defaultPrevented).toBe(true);
  });

  it("stopPropagation is idempotent", () => {
    const ev = new UIEvent("click");
    ev.stopPropagation();
    ev.stopPropagation();
    expect(ev.propagationStopped).toBe(true);
  });
});

describe("KeyUIEvent", () => {
  it("extends UIEvent and carries keyEvent", () => {
    const ke: KeyEvent = { key: "a", ctrl: false, shift: false, meta: false, sequence: "a" };
    const ev = new KeyUIEvent("keydown", ke);
    expect(ev.type).toBe("keydown");
    expect(ev.keyEvent).toBe(ke);
  });
});

describe("dispatchEvent", () => {
  it("calls onEvent in capture phase (root → target)", () => {
    const root = createWidget();
    const parent = createWidget();
    const target = createWidget();
    root.addChild(parent);
    parent.addChild(target);

    const log: string[] = [];
    vi.spyOn(root, "onEvent").mockImplementation((e: UIEvent) => {
      log.push(`root:${e.phase}`);
    });
    vi.spyOn(parent, "onEvent").mockImplementation((e: UIEvent) => {
      log.push(`parent:${e.phase}`);
    });
    vi.spyOn(target, "onEvent").mockImplementation((e: UIEvent) => {
      log.push(`target:${e.phase}`);
    });

    target.dispatchEvent(new UIEvent("test"));

    expect(log).toEqual([
      "root:capture",
      "parent:capture",
      "target:target",
      "parent:bubble",
      "root:bubble",
    ]);
  });

  it("calls onEvent in bubble phase (target → root)", () => {
    const root = createWidget();
    const parent = createWidget();
    const target = createWidget();
    root.addChild(parent);
    parent.addChild(target);

    const log: { widget: string; phase: string }[] = [];
    vi.spyOn(root, "onEvent").mockImplementation((e: UIEvent) => {
      log.push({ widget: "root", phase: e.phase });
    });
    vi.spyOn(parent, "onEvent").mockImplementation((e: UIEvent) => {
      log.push({ widget: "parent", phase: e.phase });
    });
    vi.spyOn(target, "onEvent").mockImplementation((e: UIEvent) => {
      log.push({ widget: "target", phase: e.phase });
    });

    target.dispatchEvent(new UIEvent("test"));

    const bubbleCalls = log.filter((c) => c.phase === "bubble");
    expect(bubbleCalls).toEqual([
      { widget: "parent", phase: "bubble" },
      { widget: "root", phase: "bubble" },
    ]);
  });

  it("stopPropagation in capture phase stops before target", () => {
    const root = createWidget();
    const parent = createWidget();
    const target = createWidget();
    root.addChild(parent);
    parent.addChild(target);

    const parentSpy = vi.spyOn(parent, "onEvent");
    const targetSpy = vi.spyOn(target, "onEvent");
    vi.spyOn(root, "onEvent").mockImplementation((e: UIEvent) => {
      e.stopPropagation();
    });

    target.dispatchEvent(new UIEvent("test"));

    expect(parentSpy).not.toHaveBeenCalled();
    expect(targetSpy).not.toHaveBeenCalled();
  });

  it("stopPropagation in target phase prevents bubble", () => {
    const root = createWidget();
    const parent = createWidget();
    const target = createWidget();
    root.addChild(parent);
    parent.addChild(target);

    const rootCalls: string[] = [];
    const parentCalls: string[] = [];
    vi.spyOn(root, "onEvent").mockImplementation((e: UIEvent) => {
      rootCalls.push(e.phase);
    });
    vi.spyOn(parent, "onEvent").mockImplementation((e: UIEvent) => {
      parentCalls.push(e.phase);
    });
    vi.spyOn(target, "onEvent").mockImplementation((e: UIEvent) => {
      e.stopPropagation();
    });

    target.dispatchEvent(new UIEvent("test"));

    expect(rootCalls).toEqual(["capture"]);
    expect(parentCalls).toEqual(["capture"]);
  });

  it("stopPropagation in bubble phase stops further bubbling", () => {
    const root = createWidget();
    const parent = createWidget();
    const target = createWidget();
    root.addChild(parent);
    parent.addChild(target);

    const rootCalls: string[] = [];
    vi.spyOn(root, "onEvent").mockImplementation((e: UIEvent) => {
      rootCalls.push(e.phase);
    });
    vi.spyOn(parent, "onEvent").mockImplementation((e: UIEvent) => {
      if (e.phase === "bubble") {
        e.stopPropagation();
      }
    });

    target.dispatchEvent(new UIEvent("test"));

    expect(rootCalls).toEqual(["capture"]);
  });

  it("sets target and currentTarget correctly in each phase", () => {
    const root = createWidget();
    const parent = createWidget();
    const target = createWidget();
    root.addChild(parent);
    parent.addChild(target);

    const log: { widget: string; ct: Widget | null; phase: string }[] = [];
    vi.spyOn(root, "onEvent").mockImplementation((e: UIEvent) => {
      log.push({ widget: "root", ct: e.currentTarget, phase: e.phase });
    });
    vi.spyOn(parent, "onEvent").mockImplementation((e: UIEvent) => {
      log.push({ widget: "parent", ct: e.currentTarget, phase: e.phase });
    });
    vi.spyOn(target, "onEvent").mockImplementation((e: UIEvent) => {
      log.push({ widget: "target", ct: e.currentTarget, phase: e.phase });
    });

    target.dispatchEvent(new UIEvent("test"));

    expect(log[0]).toMatchObject({ widget: "root", phase: "capture" });
    expect(log[0].ct).toBe(root);
    expect(log[1]).toMatchObject({ widget: "parent", phase: "capture" });
    expect(log[1].ct).toBe(parent);
    expect(log[2]).toMatchObject({ widget: "target", phase: "target" });
    expect(log[2].ct).toBe(target);
    expect(log[3]).toMatchObject({ widget: "parent", phase: "bubble" });
    expect(log[3].ct).toBe(parent);
    expect(log[4]).toMatchObject({ widget: "root", phase: "bubble" });
    expect(log[4].ct).toBe(root);
  });

  it("event target is consistent throughout dispatch", () => {
    const root = createWidget();
    const parent = createWidget();
    const target = createWidget();
    root.addChild(parent);
    parent.addChild(target);

    const event = new UIEvent("test");
    target.dispatchEvent(event);

    expect(event.target).toBe(target);
  });

  it("call order is capture → target → bubble", () => {
    const root = createWidget();
    const parent = createWidget();
    const target = createWidget();
    root.addChild(parent);
    parent.addChild(target);

    const phases: string[] = [];
    vi.spyOn(root, "onEvent").mockImplementation((e: UIEvent) => {
      phases.push(`root:${e.phase}`);
    });
    vi.spyOn(parent, "onEvent").mockImplementation((e: UIEvent) => {
      phases.push(`parent:${e.phase}`);
    });
    vi.spyOn(target, "onEvent").mockImplementation((e: UIEvent) => {
      phases.push(`target:${e.phase}`);
    });

    target.dispatchEvent(new UIEvent("test"));

    expect(phases).toEqual([
      "root:capture",
      "parent:capture",
      "target:target",
      "parent:bubble",
      "root:bubble",
    ]);
  });

  it("calls onKeyEvent for KeyUIEvent events", () => {
    const root = createWidget();
    const target = createWidget();
    root.addChild(target);

    const ke: KeyEvent = { key: "a", ctrl: false, shift: false, meta: false, sequence: "a" };
    const event = new KeyUIEvent("keydown", ke);

    const rootOnKeyCalls: KeyUIEvent[] = [];
    const targetOnKeyCalls: KeyUIEvent[] = [];
    vi.spyOn(root, "onKeyEvent").mockImplementation((e: KeyUIEvent) => {
      rootOnKeyCalls.push(e);
    });
    vi.spyOn(target, "onKeyEvent").mockImplementation((e: KeyUIEvent) => {
      targetOnKeyCalls.push(e);
    });

    target.dispatchEvent(event);

    expect(rootOnKeyCalls).toHaveLength(2);
    expect(rootOnKeyCalls[0]).toBe(event);
    expect(targetOnKeyCalls).toHaveLength(1);
    expect(targetOnKeyCalls[0]).toBe(event);
  });

  it("does not call onKeyEvent for regular UIEvent", () => {
    const root = createWidget();
    const target = createWidget();
    root.addChild(target);

    const rootSpy = vi.spyOn(root, "onKeyEvent");
    const targetSpy = vi.spyOn(target, "onKeyEvent");

    target.dispatchEvent(new UIEvent("click"));

    expect(rootSpy).not.toHaveBeenCalled();
    expect(targetSpy).not.toHaveBeenCalled();
  });
});
