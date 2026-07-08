import { Widget } from "./widget.js";
import type { Screen } from "./screen.js";

export class VBox extends Widget {
  constructor(bounds: { x: number; y: number; width: number; height: number }) {
    super();
    this.bounds = { ...bounds };
  }

  render(_screen: Screen): void {
  }

  renderFrame(screen: Screen): void {
    const n = this.children.length;
    if (n > 0) {
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
    super.renderFrame(screen);
  }
}

export class HBox extends Widget {
  constructor(bounds: { x: number; y: number; width: number; height: number }) {
    super();
    this.bounds = { ...bounds };
  }

  render(_screen: Screen): void {
  }

  renderFrame(screen: Screen): void {
    const n = this.children.length;
    if (n > 0) {
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
