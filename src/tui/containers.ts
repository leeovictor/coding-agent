import { Widget } from "./widget.js";
import type { Screen } from "./screen.js";

type LayoutMode = "uniform" | "stacked";

interface BoxOptions {
  x: number;
  y: number;
  width: number;
  height: number;
  layout?: LayoutMode;
}

export class VBox extends Widget {
  layout: LayoutMode;

  constructor(opts: BoxOptions) {
    super();
    this.bounds = { x: opts.x, y: opts.y, width: opts.width, height: opts.height };
    this.layout = opts.layout ?? "uniform";
  }

  render(_screen: Screen): void {
  }

  renderFrame(screen: Screen): void {
    const n = this.children.length;
    if (n > 0) {
      if (this.layout === "stacked") {
        let yOff = 0;
        let flexCount = 0;
        let totalFixed = 0;
        for (const child of this.children) {
          if (child.bounds.height > 0) {
            totalFixed += child.bounds.height;
          } else {
            flexCount++;
          }
        }
        const remaining = this.bounds.height - totalFixed;
        const flexSize = flexCount > 0 ? Math.max(0, Math.floor(remaining / flexCount)) : 0;
        for (const child of this.children) {
          const h = child.bounds.height > 0 ? child.bounds.height : flexSize;
          child.bounds = {
            x: 0,
            y: yOff,
            width: this.bounds.width,
            height: h,
          };
          yOff += h;
        }
      } else {
        const childH = Math.floor(this.bounds.height / n);
        for (let i = 0; i < n; i++) {
          this.children[i].bounds = {
            x: 0,
            y: i * childH,
            width: this.bounds.width,
            height: childH,
          };
        }
      }
    }
    super.renderFrame(screen);
  }
}

export class HBox extends Widget {
  layout: LayoutMode;

  constructor(opts: BoxOptions) {
    super();
    this.bounds = { x: opts.x, y: opts.y, width: opts.width, height: opts.height };
    this.layout = opts.layout ?? "uniform";
  }

  render(_screen: Screen): void {
  }

  renderFrame(screen: Screen): void {
    const n = this.children.length;
    if (n > 0) {
      if (this.layout === "stacked") {
        let xOff = 0;
        let flexCount = 0;
        let totalFixed = 0;
        for (const child of this.children) {
          if (child.bounds.width > 0) {
            totalFixed += child.bounds.width;
          } else {
            flexCount++;
          }
        }
        const remaining = this.bounds.width - totalFixed;
        const flexSize = flexCount > 0 ? Math.max(0, Math.floor(remaining / flexCount)) : 0;
        for (const child of this.children) {
          const w = child.bounds.width > 0 ? child.bounds.width : flexSize;
          child.bounds = {
            x: xOff,
            y: 0,
            width: w,
            height: this.bounds.height,
          };
          xOff += w;
        }
      } else {
        const childW = Math.floor(this.bounds.width / n);
        for (let i = 0; i < n; i++) {
          this.children[i].bounds = {
            x: i * childW,
            y: 0,
            width: childW,
            height: this.bounds.height,
          };
        }
      }
    }
    super.renderFrame(screen);
  }
}

export class Stack extends Widget {
  constructor(bounds: { x: number; y: number; width: number; height: number }) {
    super();
    this.bounds = { ...bounds };
  }

  render(_screen: Screen): void {
  }

  renderFrame(screen: Screen): void {
    const n = this.children.length;
    if (n > 0) {
      for (let i = 0; i < n; i++) {
        this.children[i].bounds = {
          x: 0,
          y: 0,
          width: this.bounds.width,
          height: this.bounds.height,
        };
      }
    }
    super.renderFrame(screen);
  }
}
