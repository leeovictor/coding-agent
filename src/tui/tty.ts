import { emitKeypressEvents } from "node:readline";
import type { KeyEvent, ResizeEvent } from "./types.js";

interface TTYOptions {
  stdin: NodeJS.ReadStream;
  stdout: NodeJS.WriteStream;
}

type KeypressHandler = (key: KeyEvent) => void;
type ResizeHandler = (event: ResizeEvent) => void;

export class TTY {
  private stdin: NodeJS.ReadStream;
  private stdout: NodeJS.WriteStream;
  private wasRaw: boolean;

  constructor({ stdin, stdout }: TTYOptions) {
    this.stdin = stdin;
    this.stdout = stdout;
    this.wasRaw = stdin.isRaw ?? false;
  }

  get width(): number {
    return this.stdout.isTTY ? (this.stdout.columns ?? 80) : 80;
  }

  get height(): number {
    return this.stdout.isTTY ? (this.stdout.rows ?? 24) : 24;
  }

  onKeypress(fn: KeypressHandler): void {
    emitKeypressEvents(this.stdin);
    this.stdin.setRawMode(true);
    this.stdin.on("keypress", (_str: string | undefined, key: { name?: string; ctrl?: boolean; shift?: boolean; meta?: boolean; sequence?: string }) => {
      fn({
        key: key.name,
        ctrl: key.ctrl ?? false,
        shift: key.shift ?? false,
        meta: key.meta ?? false,
        sequence: key.sequence,
      });
    });
  }

  onResize(fn: ResizeHandler): void {
    this.stdout.on("resize", () => {
      fn({ width: this.width, height: this.height });
    });
  }

  cursorHide(): void {
    this.stdout.write("\x1b[?25l");
  }

  cursorShow(): void {
    this.stdout.write("\x1b[?25h");
  }

  clearScreen(): void {
    this.stdout.write("\x1b[3J\x1b[2J\x1b[H");
  }

  enterAltScreen(): void {
    this.stdout.write("\x1b[?1049h");
  }

  write(str: string): void {
    this.stdout.write(str);
  }

  destroy(): void {
    this.stdin.setRawMode(this.wasRaw);
    this.stdin.removeAllListeners("keypress");
    this.stdout.write("\x1b[?25h");
    this.stdout.write("\x1b[?1049l");
  }
}
