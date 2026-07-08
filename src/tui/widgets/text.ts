import type { CellProps } from "../types.js";
import type { Screen } from "../screen.js";
import { Widget } from "../widget.js";

interface TextOptions {
  content: string;
  x: number;
  y: number;
  style?: CellProps;
}

export class Text extends Widget {
  private _content: string;
  private _style: CellProps;

  constructor({ content, x, y, style }: TextOptions) {
    super();
    this.bounds = { x, y, width: 0, height: 0 };
    this._content = content;
    this._style = style ?? {};
  }

  get content(): string {
    return this._content;
  }

  get style(): CellProps {
    return this._style;
  }

  setContent(text: string): void {
    this._content = text;
  }

  move(nx: number, ny: number): void {
    this.bounds.x = nx;
    this.bounds.y = ny;
  }

  render(screen: Screen): void {
    if (!this._content) return;
    const abs = this.absoluteBounds;
    const lines = this._content.split("\n");
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li].replace(/\r/g, "");
      for (let ci = 0; ci < line.length; ci++) {
        screen.setCell(abs.x + ci, abs.y + li, { char: line[ci], ...this._style });
      }
    }
  }
}
