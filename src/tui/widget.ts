import type { Screen } from "./screen.js";
import { UIEvent, KeyUIEvent } from "./events.js";

export abstract class Widget {
  parent: Widget | null = null;
  children: Widget[] = [];
  bounds = { x: 0, y: 0, width: 0, height: 0 };
  mounted = false;
  focusable = false;
  focused = false;

  get isRoot(): boolean {
    return this.parent === null;
  }

  get root(): Widget {
    let current: Widget = this;
    while (current.parent) {
      current = current.parent;
    }
    return current;
  }

  get absoluteBounds(): { x: number; y: number; width: number; height: number } {
    if (!this.parent) {
      return { ...this.bounds };
    }
    const parentAbs = this.parent.absoluteBounds;
    return {
      x: parentAbs.x + this.bounds.x,
      y: parentAbs.y + this.bounds.y,
      width: this.bounds.width,
      height: this.bounds.height,
    };
  }

  addChild(child: Widget): void {
    if (child === this) return;
    if (this.children.includes(child)) return;
    if (child.parent) {
      child.parent.removeChild(child);
    }
    child.parent = this;
    this.children.push(child);
    if (this.mounted) {
      child.mount();
    }
  }

  removeChild(child: Widget): void {
    const idx = this.children.indexOf(child);
    if (idx === -1) return;
    this.children.splice(idx, 1);
    child.parent = null;
    if (child.mounted) {
      child.unmount();
    }
  }

  mount(): void {
    this.mounted = true;
    for (const child of this.children) {
      child.mount();
    }
  }

  unmount(): void {
    this.mounted = false;
    for (const child of this.children) {
      child.unmount();
    }
  }

  abstract render(screen: Screen): void;

  renderFrame(screen: Screen): void {
    const abs = this.absoluteBounds;
    screen.pushClip(abs.x, abs.y, abs.width, abs.height);
    this.render(screen);
    for (const child of this.children) {
      child.renderFrame(screen);
    }
    screen.popClip();
  }

  findWidgetAt(x: number, y: number): Widget | null {
    for (let i = this.children.length - 1; i >= 0; i--) {
      const child = this.children[i];
      const abs = child.absoluteBounds;
      if (x >= abs.x && x < abs.x + abs.width && y >= abs.y && y < abs.y + abs.height) {
        const deeper = child.findWidgetAt(x, y);
        if (deeper) return deeper;
      }
    }
    const abs = this.absoluteBounds;
    if (x >= abs.x && x < abs.x + abs.width && y >= abs.y && y < abs.y + abs.height) {
      return this;
    }
    return null;
  }

  dispatchEvent(event: UIEvent): void {
    if (event.target === null) {
      event.target = this;
    }
    const path: Widget[] = [];
    let current: Widget | null = event.target;
    while (current) {
      path.unshift(current);
      current = current.parent;
    }

    for (let i = 0; i < path.length - 1; i++) {
      event.currentTarget = path[i];
      event.phase = "capture";
      path[i].onEvent(event);
      if (event instanceof KeyUIEvent) {
        path[i].onKeyEvent(event);
      }
      if (event.propagationStopped) return;
    }

    const target = path[path.length - 1];
    event.currentTarget = target;
    event.phase = "target";
    target.onEvent(event);
    if (event instanceof KeyUIEvent) {
      target.onKeyEvent(event);
    }
    if (event.propagationStopped) return;

    for (let i = path.length - 2; i >= 0; i--) {
      event.currentTarget = path[i];
      event.phase = "bubble";
      path[i].onEvent(event);
      if (event instanceof KeyUIEvent) {
        path[i].onKeyEvent(event);
      }
      if (event.propagationStopped) return;
    }
  }

  onEvent(_event: UIEvent): void {
  }

  onKeyEvent(_event: KeyUIEvent): void {
  }

  focus(): void {
    this.focused = true;
  }

  blur(): void {
    this.focused = false;
  }
}
