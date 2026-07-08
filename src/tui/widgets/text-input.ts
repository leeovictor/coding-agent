import type { CellProps } from "../types.js";
import type { Screen } from "../screen.js";
import { Widget } from "../widget.js";
import { KeyUIEvent } from "../events.js";

interface TextInputOptions {
  x: number;
  y: number;
  width: number;
  value?: string;
  prompt?: string;
}

export class TextInput extends Widget {
  private _value: string;
  private _cursor: number;
  private leftStyle: CellProps;
  private fieldStyle: CellProps;

  constructor({ x, y, width, value, prompt }: TextInputOptions) {
    super();
    this.focusable = true;
    this.focused = true;
    this.bounds = { x, y, width, height: 3 };
    this._value = value ?? "";
    this._cursor = this._value.length;
    this.leftStyle = { fg: "blue" };
    this.fieldStyle = { fg: "white", bg: "rgb(27, 27, 27)" };
  }

  get value(): string {
    return this._value;
  }

  setWidth(w: number): void {
    this.bounds.width = w;
  }

  move(nx: number, ny: number): void {
    this.bounds.x = nx;
    this.bounds.y = ny;
  }

  get totalWidth(): number {
    return this.bounds.width;
  }

  get totalHeight(): number {
    return 3;
  }

  onKeyEvent(event: KeyUIEvent): void {
    if (!this.focused) return;
    const key = event.keyEvent;

    if (key.key === "backspace") {
      if (this._cursor > 0) {
        this._value = this._value.slice(0, this._cursor - 1) + this._value.slice(this._cursor);
        this._cursor--;
      }
      return;
    }

    if (key.key === "delete") {
      if (this._cursor < this._value.length) {
        this._value = this._value.slice(0, this._cursor) + this._value.slice(this._cursor + 1);
      }
      return;
    }

    if (key.key === "left") {
      this._cursor = Math.max(0, this._cursor - 1);
      return;
    }

    if (key.key === "right") {
      this._cursor = Math.min(this._value.length, this._cursor + 1);
      return;
    }

    if (key.key === "home") {
      this._cursor = 0;
      return;
    }

    if (key.key === "end") {
      this._cursor = this._value.length;
      return;
    }

    const ch = key.sequence || key.key;
    if (ch && ch.length === 1 && !key.ctrl && !key.meta) {
      const code = ch.charCodeAt(0);
      if (code >= 32 && code !== 127) {
        this._value = this._value.slice(0, this._cursor) + ch + this._value.slice(this._cursor);
        this._cursor++;
        return;
      }
    }
  }

  render(screen: Screen): void {
    const abs = this.absoluteBounds;
    const contentY = abs.y + 1;
    const textW = abs.width - 4;
    const textStartX = abs.x + 3;

    for (let row = 0; row < 3; row++) {
      const y = abs.y + row;
      screen.setCell(abs.x, y, { char: "┃", ...this.leftStyle });
      screen.fill(abs.x + 1, y, abs.width - 1, 1, this.fieldStyle);
    }

    const offset = Math.max(0, this._cursor - textW + 1);
    const visible = this._value.slice(offset, offset + textW);

    for (let ci = 0; ci < visible.length; ci++) {
      screen.setCell(textStartX + ci, contentY, { char: visible[ci], ...this.fieldStyle });
    }

    if (this.focused) {
      const cursorX = this._cursor - offset;
      if (cursorX >= 0 && cursorX < textW) {
        const ch = this._value[this._cursor] || " ";
        screen.setCell(textStartX + cursorX, contentY, { char: ch, fg: "blue", bg: "white" });
      }
    }
  }
}
