import { EventEmitter } from "node:events";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:readline", () => ({
  emitKeypressEvents: vi.fn(),
}));

import { emitKeypressEvents } from "node:readline";
import { TTY } from "../../src/tui/tty.js";

function mockStdout(options: { columns?: number; rows?: number; isTTY?: boolean } = {}) {
  const s = new EventEmitter() as any;
  s.columns = options.columns ?? 80;
  s.rows = options.rows ?? 24;
  s.isTTY = options.isTTY ?? true;
  s.write = vi.fn();
  return s;
}

function mockStdin(options: { isTTY?: boolean; isRaw?: boolean } = {}) {
  const s = new EventEmitter() as any;
  s.isTTY = options.isTTY ?? true;
  s.isRaw = options.isRaw ?? false;
  s.setRawMode = vi.fn();
  return s;
}

describe("TTY", () => {
  let stdin: ReturnType<typeof mockStdin>;
  let stdout: ReturnType<typeof mockStdout>;

  beforeEach(() => {
    stdin = mockStdin();
    stdout = mockStdout();
  });

  it("returns width and height from stdout", () => {
    stdout.columns = 120;
    stdout.rows = 40;
    const tty = new TTY({ stdin, stdout });
    expect(tty.width).toBe(120);
    expect(tty.height).toBe(40);
  });

  it("defaults to 80x24 when stdout is not a TTY", () => {
    stdout = mockStdout({ isTTY: false });
    const tty = new TTY({ stdin, stdout });
    expect(tty.width).toBe(80);
    expect(tty.height).toBe(24);
  });

  it("defaults to 80x24 when stdout.isTTY is absent", () => {
    delete stdout.isTTY;
    const tty = new TTY({ stdin, stdout });
    expect(tty.width).toBe(80);
    expect(tty.height).toBe(24);
  });

  it("onKeypress enables raw mode and registers listener", () => {
    const tty = new TTY({ stdin, stdout });
    const handler = vi.fn();
    tty.onKeypress(handler);
    expect(stdin.setRawMode).toHaveBeenCalledWith(true);
    stdin.emit("keypress", "q", { name: "q", ctrl: false, shift: false, meta: false, sequence: "q" });
    expect(handler).toHaveBeenCalledWith({
      key: "q",
      ctrl: false,
      shift: false,
      meta: false,
      sequence: "q",
    });
  });

  it("onKeypress maps readline key.name to key.key", () => {
    const tty = new TTY({ stdin, stdout });
    const handler = vi.fn();
    tty.onKeypress(handler);
    stdin.emit("keypress", "\r", { name: "enter", ctrl: false, shift: false, meta: false, sequence: "\r" });
    expect(handler).toHaveBeenCalledWith({
      key: "enter",
      ctrl: false,
      shift: false,
      meta: false,
      sequence: "\r",
    });
  });

  it("onKeypress calls emitKeypressEvents", () => {
    emitKeypressEvents.mockClear();
    const tty = new TTY({ stdin, stdout });
    tty.onKeypress(vi.fn());
    expect(emitKeypressEvents).toHaveBeenCalledWith(stdin);
  });

  it("onResize calls handler with new dimensions", () => {
    const tty = new TTY({ stdin, stdout });
    const handler = vi.fn();
    tty.onResize(handler);
    stdout.columns = 120;
    stdout.rows = 40;
    stdout.emit("resize");
    expect(handler).toHaveBeenCalledWith({ width: 120, height: 40 });
  });

  it("cursorHide writes ANSI hide sequence", () => {
    const tty = new TTY({ stdin, stdout });
    tty.cursorHide();
    expect(stdout.write).toHaveBeenCalledWith("\x1b[?25l");
  });

  it("cursorShow writes ANSI show sequence", () => {
    const tty = new TTY({ stdin, stdout });
    tty.cursorShow();
    expect(stdout.write).toHaveBeenCalledWith("\x1b[?25h");
  });

  it("write delegates to stdout.write", () => {
    const tty = new TTY({ stdin, stdout });
    tty.write("hello");
    expect(stdout.write).toHaveBeenCalledWith("hello");
  });

  it("destroy restores raw mode to previous state", () => {
    stdin.isRaw = false;
    const tty = new TTY({ stdin, stdout });
    tty.onKeypress(vi.fn());
    stdin.setRawMode.mockClear();
    tty.destroy();
    expect(stdin.setRawMode).toHaveBeenCalledWith(false);
  });

  it("destroy removes all keypress listeners", () => {
    const tty = new TTY({ stdin, stdout });
    const handler = vi.fn();
    tty.onKeypress(handler);
    tty.destroy();
    stdin.emit("keypress", "x", { name: "x" });
    expect(handler).not.toHaveBeenCalled();
  });

  it("clearScreen clears scrollback and visible screen", () => {
    const tty = new TTY({ stdin, stdout });
    tty.clearScreen();
    expect(stdout.write).toHaveBeenCalledWith("\x1b[3J\x1b[2J\x1b[H");
  });

  it("enterAltScreen switches to alternate buffer", () => {
    const tty = new TTY({ stdin, stdout });
    tty.enterAltScreen();
    expect(stdout.write).toHaveBeenCalledWith("\x1b[?1049h");
  });

  it("destroy exits alternate screen and shows cursor", () => {
    const tty = new TTY({ stdin, stdout });
    tty.destroy();
    expect(stdout.write).toHaveBeenCalledWith("\x1b[?25h");
    expect(stdout.write).toHaveBeenCalledWith("\x1b[?1049l");
  });

  it("destroy is idempotent", () => {
    const tty = new TTY({ stdin, stdout });
    tty.onKeypress(vi.fn());
    stdin.setRawMode.mockClear();
    tty.destroy();
    tty.destroy();
    expect(stdin.setRawMode).toHaveBeenCalledTimes(2);
  });
});
