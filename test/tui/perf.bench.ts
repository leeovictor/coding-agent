import { bench, describe } from "vitest";
import { Screen } from "../../src/tui/screen.js";
import { Root } from "../../src/tui/root.js";
import { Widget } from "../../src/tui/widget.js";
import { VBox } from "../../src/tui/containers.js";
import { Renderer } from "../../src/tui/renderer.js";
import { UIEvent } from "../../src/tui/events.js";
import type { Screen as ScreenType } from "../../src/tui/screen.js";

class BenchWidget extends Widget {
  override render(_s: ScreenType): void {
  }
}

class RenderBenchWidget extends Widget {
  override render(s: ScreenType): void {
    for (let i = 0; i < this.bounds.width && i < 5; i++) {
      s.setCell(this.bounds.x + i, this.bounds.y, { char: "." });
    }
  }
}

class FocusableBenchWidget extends BenchWidget {
  focusable = true;
}

// ─────────────────────────────────────────────
// Screen operations
// ─────────────────────────────────────────────
describe("Screen", () => {
  bench("setCell single write", () => {
    const s = new Screen({ width: 80, height: 24 });
    s.setCell(40, 12, { char: "X" });
  });

  bench("fill 80×24 full", () => {
    const s = new Screen({ width: 80, height: 24 });
    s.fill(0, 0, 80, 24, { char: "#" });
  });

  bench("fill 10×10 region", () => {
    const s = new Screen({ width: 80, height: 24 });
    s.fill(10, 10, 20, 10, { char: "#" });
  });

  bench("diff — no changes", () => {
    const s = new Screen({ width: 80, height: 24 });
    const snap = s.snapshot();
    s.diff(snap);
  });

  bench("diff — full grid changed", () => {
    const s = new Screen({ width: 80, height: 24 });
    const snap = s.snapshot();
    s.fill(0, 0, 80, 24, { char: "X" });
    s.diff(snap);
  });

  bench("diff — single cell changed", () => {
    const s = new Screen({ width: 80, height: 24 });
    const snap = s.snapshot();
    s.setCell(0, 0, { char: "X" });
    s.diff(snap);
  });

  bench("pushClip/popClip (one pair)", () => {
    const s = new Screen({ width: 80, height: 24 });
    s.pushClip(10, 10, 30, 10);
    s.popClip();
  });

  bench("pushClip/popClip (10 nested)", () => {
    const s = new Screen({ width: 80, height: 24 });
    for (let i = 0; i < 10; i++) {
      s.pushClip(i * 2, i * 2, 60 - i * 2, 20 - i);
    }
    for (let i = 0; i < 10; i++) {
      s.popClip();
    }
  });

  bench("setCell inside clip region", () => {
    const s = new Screen({ width: 80, height: 24 });
    s.pushClip(10, 10, 20, 10);
    s.setCell(15, 15, { char: "X" });
    s.popClip();
  });

  bench("setCell outside clip region (rejected)", () => {
    const s = new Screen({ width: 80, height: 24 });
    s.pushClip(10, 10, 5, 5);
    s.setCell(50, 12, { char: "X" });
    s.popClip();
  });

  bench("clear 80×24", () => {
    const s = new Screen({ width: 80, height: 24 });
    s.clear();
  });

  bench("snapshot 80×24", () => {
    const s = new Screen({ width: 80, height: 24 });
    s.snapshot();
  });
});

// ─────────────────────────────────────────────
// Widget tree — renderFrame
// ─────────────────────────────────────────────
describe("Widget tree — renderFrame", () => {
  bench("shallow (Root + 10 children)", () => {
    const s = new Screen({ width: 200, height: 200 });
    const root = new Root({ screen: s });
    for (let i = 0; i < 10; i++) {
      root.addChild(new BenchWidget());
    }
    root.renderFrame();
  });

  bench("deep (100 levels, linear chain)", () => {
    const s = new Screen({ width: 200, height: 200 });
    const root = new Root({ screen: s });
    let current: Widget = root;
    for (let i = 0; i < 100; i++) {
      const child = new BenchWidget();
      current.addChild(child);
      current = child;
    }
    root.renderFrame();
  });

  bench("deep (500 levels, linear chain)", () => {
    const s = new Screen({ width: 200, height: 200 });
    const root = new Root({ screen: s });
    let current: Widget = root;
    for (let i = 0; i < 500; i++) {
      const child = new BenchWidget();
      current.addChild(child);
      current = child;
    }
    root.renderFrame();
  });

  bench("wide (Root + 1000 children)", () => {
    const s = new Screen({ width: 200, height: 200 });
    const root = new Root({ screen: s });
    for (let i = 0; i < 1000; i++) {
      root.addChild(new BenchWidget());
    }
    root.renderFrame();
  });

  bench("wide (Root + 5000 children)", () => {
    const s = new Screen({ width: 200, height: 200 });
    const root = new Root({ screen: s });
    for (let i = 0; i < 5000; i++) {
      root.addChild(new BenchWidget());
    }
    root.renderFrame();
  });

  bench("VBox with 10 children (each renders)", () => {
    const s = new Screen({ width: 100, height: 50 });
    const root = new Root({ screen: s });
    const vbox = new VBox({ x: 0, y: 0, width: 100, height: 50 });
    for (let i = 0; i < 10; i++) {
      vbox.addChild(new RenderBenchWidget());
    }
    root.addChild(vbox);
    root.renderFrame();
  });

  bench("VBox with 100 children (each renders)", () => {
    const s = new Screen({ width: 100, height: 50 });
    const root = new Root({ screen: s });
    const vbox = new VBox({ x: 0, y: 0, width: 100, height: 50 });
    for (let i = 0; i < 100; i++) {
      vbox.addChild(new RenderBenchWidget());
    }
    root.addChild(vbox);
    root.renderFrame();
  });

  bench("Root with no children", () => {
    const s = new Screen({ width: 80, height: 24 });
    const root = new Root({ screen: s });
    root.renderFrame();
  });
});

// ─────────────────────────────────────────────
// Event dispatch
// ─────────────────────────────────────────────
describe("dispatchEvent", () => {
  bench("shallow (Root + 1 child, target = child)", () => {
    const root = new Root({ screen: new Screen({ width: 80, height: 24 }) });
    const child = new BenchWidget();
    root.addChild(child);
    const event = new UIEvent("test");
    event.target = child;
    root.dispatchEvent(event);
  });

  bench("deep (100 levels, target = deepest leaf)", () => {
    const root = new Root({ screen: new Screen({ width: 80, height: 24 }) });
    let current: Widget = root;
    for (let i = 0; i < 100; i++) {
      const child = new BenchWidget();
      current.addChild(child);
      current = child;
    }
    const event = new UIEvent("test");
    event.target = current;
    root.dispatchEvent(event);
  });

  bench("wide (1000 siblings, target = first child)", () => {
    const root = new Root({ screen: new Screen({ width: 80, height: 24 }) });
    let first: Widget | null = null;
    for (let i = 0; i < 1000; i++) {
      const child = new BenchWidget();
      root.addChild(child);
      if (i === 0) first = child;
    }
    const event = new UIEvent("test");
    event.target = first;
    root.dispatchEvent(event);
  });
});

// ─────────────────────────────────────────────
// Focus
// ─────────────────────────────────────────────
describe("Focus", () => {
  bench("focusNext — 10 focusable widgets", () => {
    const root = new Root({ screen: new Screen({ width: 80, height: 24 }) });
    for (let i = 0; i < 10; i++) {
      root.addChild(new FocusableBenchWidget());
    }
    root.focusNext();
  });

  bench("focusNext — 500 focusable widgets", () => {
    const root = new Root({ screen: new Screen({ width: 80, height: 24 }) });
    for (let i = 0; i < 500; i++) {
      root.addChild(new FocusableBenchWidget());
    }
    root.focusNext();
  });

  bench("focusNext wrap-around (500, cycle once)", () => {
    const root = new Root({ screen: new Screen({ width: 80, height: 24 }) });
    for (let i = 0; i < 500; i++) {
      root.addChild(new FocusableBenchWidget());
    }
    root.focusNext();
    root.focusNext(); // second call forces index-of + wrap
  });

  bench("focusPrev — 500 focusable, wrap to last", () => {
    const root = new Root({ screen: new Screen({ width: 80, height: 24 }) });
    for (let i = 0; i < 500; i++) {
      root.addChild(new FocusableBenchWidget());
    }
    root.focusPrev();
  });
});

// ─────────────────────────────────────────────
// Hit testing
// ─────────────────────────────────────────────
describe("findWidgetAt", () => {
  bench("wide (1000 widgets, hit middle)", () => {
    const root = new Root({ screen: new Screen({ width: 80, height: 24 }) });
    for (let i = 0; i < 1000; i++) {
      const w = new BenchWidget();
      w.bounds = { x: i, y: 0, width: 1, height: 1 };
      root.addChild(w);
    }
    root.findWidgetAt(500, 0);
  });

  bench("deep (500 levels, hit deepest)", () => {
    const root = new Root({ screen: new Screen({ width: 80, height: 24 }) });
    let current: Widget = root;
    for (let i = 0; i < 500; i++) {
      const child = new BenchWidget();
      child.bounds = { x: i, y: 0, width: 100, height: 100 };
      current.addChild(child);
      current = child;
    }
    root.findWidgetAt(250, 0);
  });

  bench("miss (outside all bounds)", () => {
    const root = new Root({ screen: new Screen({ width: 80, height: 24 }) });
    let current: Widget = root;
    for (let i = 0; i < 100; i++) {
      const child = new BenchWidget();
      child.bounds = { x: i, y: i, width: 10, height: 10 };
      current.addChild(child);
      current = child;
    }
    root.findWidgetAt(9999, 9999); // definitely outside
  });
});

// ─────────────────────────────────────────────
// Layout containers
// ─────────────────────────────────────────────
describe("Layout containers", () => {
  bench("VBox layout (10 children, bounds only)", () => {
    const vbox = new VBox({ x: 0, y: 0, width: 100, height: 50 });
    for (let i = 0; i < 10; i++) {
      vbox.addChild(new BenchWidget());
    }
    const s = new Screen({ width: 100, height: 50 });
    vbox.renderFrame(s);
  });

  bench("VBox layout (500 children, bounds only)", () => {
    const vbox = new VBox({ x: 0, y: 0, width: 100, height: 1000 });
    for (let i = 0; i < 500; i++) {
      vbox.addChild(new BenchWidget());
    }
    const s = new Screen({ width: 100, height: 1000 });
    vbox.renderFrame(s);
  });
});

// ─────────────────────────────────────────────
// Screen — resize
// ─────────────────────────────────────────────
describe("Screen — resize", () => {
  bench("resize 80×24 → 120×40", () => {
    const s = new Screen({ width: 80, height: 24 });
    s.resize(120, 40);
  });

  bench("resize 80×24 → 40×12 (shrink)", () => {
    const s = new Screen({ width: 80, height: 24 });
    s.resize(40, 12);
  });

  bench("resize 80×24 → 80×24 (same)", () => {
    const s = new Screen({ width: 80, height: 24 });
    s.resize(80, 24);
  });
});

// ─────────────────────────────────────────────
// Full pipeline (Root + Renderer)
// ─────────────────────────────────────────────
describe("Full pipeline (Root + Renderer)", () => {
  bench("Root.renderFrame + Renderer.render (empty tree)", () => {
    const s = new Screen({ width: 80, height: 24 });
    const stdout = { write: () => {} };
    const renderer = new Renderer({ stdout: stdout as unknown as NodeJS.WriteStream });
    const root = new Root({ screen: s, renderer });
    root.renderFrame();
  });

  bench("Root.renderFrame + Renderer.render (VBox + 10 Text widgets)", () => {
    const s = new Screen({ width: 80, height: 24 });
    const stdout = { write: () => {} };
    const renderer = new Renderer({ stdout: stdout as unknown as NodeJS.WriteStream });
    const root = new Root({ screen: s, renderer });
    const vbox = new VBox({ x: 0, y: 0, width: 80, height: 24 });
    for (let i = 0; i < 10; i++) {
      const text = new (class extends Widget {
        override render(s: ScreenType): void {
          s.setCell(this.bounds.x, this.bounds.y, { char: "H" });
        }
      })();
      vbox.addChild(text);
    }
    root.addChild(vbox);
    root.renderFrame();
  });
});
