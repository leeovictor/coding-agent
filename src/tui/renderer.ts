import type { Cell, PositionedCell, Snapshot } from "./types.js";
import type { Screen } from "./screen.js";

const NAMED_COLORS: Record<string, number> = {
  black: 0, red: 1, green: 2, yellow: 3, blue: 4, magenta: 5, cyan: 6, white: 7,
  gray: 8, grey: 8,
  brightblack: 8, brightred: 9, brightgreen: 10, brightyellow: 11,
  brightblue: 12, brightmagenta: 13, brightcyan: 14, brightwhite: 15,
};

interface RendererOptions {
  stdout: NodeJS.WriteStream;
}

export class Renderer {
  private stdout: NodeJS.WriteStream;
  private lastSnapshot: Snapshot | null = null;
  private lastStyleSig: string | null = null;

  constructor({ stdout }: RendererOptions) {
    this.stdout = stdout;
  }

  private write(str: string): void {
    this.stdout.write(str);
  }

  private cursor(y: number, x: number): string {
    return `\x1b[${y + 1};${x + 1}H`;
  }

  private styleSig(cell: Cell): string {
    return `${cell.fg ?? ""}|${cell.bg ?? ""}|${!!cell.bold}|${!!cell.dim}|${!!cell.underline}`;
  }

  private colorSeq(color: string | null, type: "fg" | "bg"): string {
    if (!color) return "";
    const prefix = type === "fg" ? "38" : "48";
    if (color.startsWith("#")) {
      const r = parseInt(color.slice(1, 3), 16);
      const g = parseInt(color.slice(3, 5), 16);
      const b = parseInt(color.slice(5, 7), 16);
      return `\x1b[${prefix};2;${r};${g};${b}m`;
    }
    if (color.startsWith("rgb(")) {
      const [r, g, b] = color.slice(4, -1).split(",").map(Number);
      return `\x1b[${prefix};2;${r};${g};${b}m`;
    }
    const idx = NAMED_COLORS[color.toLowerCase()];
    if (idx !== undefined) {
      const base = type === "fg" ? 30 : 40;
      const code = idx < 8 ? base + idx : base + 60 + (idx - 8);
      return `\x1b[${code}m`;
    }
    return "";
  }

  private styleToAnsi(cell: Cell): string {
    let s = "";
    if (cell.bold) s += "\x1b[1m";
    if (cell.dim) s += "\x1b[2m";
    if (cell.underline) s += "\x1b[4m";
    if (cell.fg) s += this.colorSeq(cell.fg, "fg");
    if (cell.bg) s += this.colorSeq(cell.bg, "bg");
    return s;
  }

  render(screen: Screen): void {
    const prev = this.lastSnapshot ?? ([] as unknown as Snapshot);
    const changes: PositionedCell[] = screen.diff(prev);
    changes.sort((a, b) => a.y - b.y || a.x - b.x);

    let pending = "";
    let lastX = -1;
    let lastY = -1;

    const flush = () => {
      if (pending) {
        this.write(pending);
        pending = "";
      }
    };

    for (const cell of changes) {
      const sig = this.styleSig(cell);
      const contiguous = cell.y === lastY && cell.x === lastX + 1;
      const sameStyle = sig === this.lastStyleSig;

      if (contiguous && sameStyle) {
        pending += cell.char;
      } else {
        flush();
        this.write(this.cursor(cell.y, cell.x));
        if (!sameStyle) {
          this.write("\x1b[0m");
          this.write(this.styleToAnsi(cell));
          this.lastStyleSig = sig;
        }
        pending = cell.char;
      }

      lastX = cell.x;
      lastY = cell.y;
    }
    flush();

    this.lastSnapshot = screen.snapshot();
  }

  destroy(): void {
    this.write("\x1b[0m");
    this.lastSnapshot = null;
    this.lastStyleSig = null;
  }
}
