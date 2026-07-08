import { Widget } from "./widget.js";
import { Screen } from "./screen.js";
import { Renderer } from "./renderer.js";
import { TTY } from "./tty.js";
import { KeyUIEvent } from "./events.js";
import type { KeyEvent } from "./types.js";

interface RootOptions {
  tty?: TTY;
  screen: Screen;
  renderer?: Renderer;
}

export class Root extends Widget {
  private _screen: Screen;
  private _renderer?: Renderer;
  private _tty?: TTY;
  focusedWidget: Widget | null = null;

  constructor({ tty, screen, renderer }: RootOptions) {
    super();
    this._tty = tty;
    this._screen = screen;
    this._renderer = renderer;
    this.bounds = { x: 0, y: 0, width: screen.width, height: screen.height };
  }

  render(_screen: Screen): void {
  }

  renderFrame(): void {
    this._screen.clear();
    super.renderFrame(this._screen);
    this._renderer?.render(this._screen);
  }

  handleKeyEvent(keyEvent: KeyEvent): void {
    const event = new KeyUIEvent("keydown", keyEvent);
    event.target = this.focusedWidget;
    this.dispatchEvent(event);
  }

  focusNext(): void {
    const list = this.collectFocusable();
    if (list.length === 0) return;

    if (!this.focusedWidget) {
      this.setFocus(list[0]);
      return;
    }

    const idx = list.indexOf(this.focusedWidget);
    const next = list[(idx + 1) % list.length];
    this.setFocus(next);
  }

  focusPrev(): void {
    const list = this.collectFocusable();
    if (list.length === 0) return;

    if (!this.focusedWidget) {
      this.setFocus(list[list.length - 1]);
      return;
    }

    const idx = list.indexOf(this.focusedWidget);
    const prev = list[(idx - 1 + list.length) % list.length];
    this.setFocus(prev);
  }

  handleResize(width: number, height: number): void {
    this._screen.resize(width, height);
    this.bounds = { x: 0, y: 0, width, height };
  }

  private collectFocusable(): Widget[] {
    const result: Widget[] = [];
    this.walk(this, result);
    return result;
  }

  private walk(widget: Widget, result: Widget[]): void {
    if (widget.focusable && widget !== this) {
      result.push(widget);
    }
    for (const child of widget.children) {
      this.walk(child, result);
    }
  }

  private setFocus(widget: Widget): void {
    if (this.focusedWidget && this.focusedWidget !== widget) {
      this.focusedWidget.blur();
    }
    this.focusedWidget = widget;
    widget.focus();
  }
}
