import type { Cell, CellProps, PositionedCell, Snapshot } from "./types.js";

const CELL: Cell = { char: " ", fg: null, bg: null, bold: false, dim: false, underline: false };

interface ScreenOptions {
  width: number;
  height: number;
}

export class Screen {
  private _width: number;
  private _height: number;
  private grid: Cell[];
  private clipStack: { x: number; y: number; w: number; h: number }[] = [];

  constructor({ width, height }: ScreenOptions) {
    this._width = width;
    this._height = height;
    this.grid = new Array(this._width * this._height).fill(null).map(() => ({ ...CELL }));
  }

  get width(): number {
    return this._width;
  }

  get height(): number {
    return this._height;
  }

  private idx(x: number, y: number): number {
    return y * this._width + x;
  }

  private inBounds(x: number, y: number): boolean {
    return x >= 0 && x < this._width && y >= 0 && y < this._height;
  }

  private inClip(x: number, y: number): boolean {
    if (this.clipStack.length === 0) return true;
    const clip = this.clipStack[this.clipStack.length - 1];
    return x >= clip.x && x < clip.x + clip.w && y >= clip.y && y < clip.y + clip.h;
  }

  pushClip(x: number, y: number, w: number, h: number): void {
    this.clipStack.push({ x, y, w, h });
  }

  popClip(): void {
    this.clipStack.pop();
  }

  setCell(x: number, y: number, partial: CellProps): void {
    if (!this.inBounds(x, y)) return;
    if (!this.inClip(x, y)) return;
    Object.assign(this.grid[this.idx(x, y)], partial);
  }

  fill(x: number, y: number, fw: number, fh: number, partial: CellProps): void {
    if (fw <= 0 || fh <= 0) return;
    const startX = Math.max(0, x);
    const startY = Math.max(0, y);
    const endX = Math.min(this._width, x + fw);
    const endY = Math.min(this._height, y + fh);
    for (let cy = startY; cy < endY; cy++) {
      for (let cx = startX; cx < endX; cx++) {
        if (!this.inClip(cx, cy)) continue;
        Object.assign(this.grid[this.idx(cx, cy)], partial);
      }
    }
  }

  snapshot(): Snapshot {
    const snap = this.grid.map(cell => ({ ...cell })) as unknown as Snapshot;
    snap._w = this._width;
    snap._h = this._height;
    return snap;
  }

  diff(prev: Snapshot): PositionedCell[] {
    const changes: PositionedCell[] = [];
    const len = this.grid.length;
    const fullDiff = prev._w !== this._width || prev._h !== this._height;
    for (let i = 0; i < len; i++) {
      if (fullDiff || i >= prev.length || cellChanged(this.grid[i], prev[i])) {
        const x = i % this._width;
        const y = Math.floor(i / this._width);
        const cell: PositionedCell = { x, y, ...this.grid[i] };
        changes.push(cell);
      }
    }
    return changes;
  }

  clear(): void {
    this.grid = new Array(this._width * this._height).fill(null).map(() => ({ ...CELL }));
  }

  resize(newW: number, newH: number): void {
    const newGrid = new Array(newW * newH).fill(null).map(() => ({ ...CELL }));
    const copyW = Math.min(this._width, newW);
    const copyH = Math.min(this._height, newH);
    for (let cy = 0; cy < copyH; cy++) {
      for (let cx = 0; cx < copyW; cx++) {
        newGrid[cy * newW + cx] = { ...this.grid[this.idx(cx, cy)] };
      }
    }
    this._width = newW;
    this._height = newH;
    this.grid = newGrid;
  }

  toString(): string {
    const lines: string[] = [];
    for (let y = 0; y < this._height; y++) {
      let line = "";
      for (let x = 0; x < this._width; x++) {
        line += this.grid[this.idx(x, y)].char;
      }
      lines.push(line);
    }
    return lines.join("\n");
  }
}

function cellChanged(a: Cell, b: Cell): boolean {
  return a.char !== b.char
    || a.fg !== b.fg
    || a.bg !== b.bg
    || a.bold !== b.bold
    || a.dim !== b.dim
    || a.underline !== b.underline;
}
