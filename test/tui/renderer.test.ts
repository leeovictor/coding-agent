import { describe, it, expect, vi, beforeEach } from "vitest";
import { Screen } from "../../src/tui/screen.js";
import { Renderer } from "../../src/tui/renderer.js";

describe("Renderer", () => {
  let stdout: { write: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    stdout = { write: vi.fn() };
  });

  function output() {
    return stdout.write.mock.calls.map(c => c[0]).join("");
  }

  function writes() {
    return stdout.write.mock.calls.map(c => c[0]);
  }

  it("first render moves cursor and writes chars for each row", () => {
    const r = new Renderer({ stdout });
    const s = new Screen({ width: 3, height: 2 });
    s.setCell(0, 0, { char: "A" });
    s.setCell(1, 0, { char: "B" });
    r.render(s);
    expect(output()).toContain("\x1b[1;1H");
    expect(output()).toContain("AB ");
    expect(output()).toContain("\x1b[2;1H");
    expect(output()).toContain("   ");
  });

  it("second render only outputs changed cells", () => {
    const r = new Renderer({ stdout });
    const s = new Screen({ width: 3, height: 2 });
    r.render(s);
    stdout.write.mockClear();
    s.setCell(0, 0, { char: "X" });
    r.render(s);
    expect(output()).toContain("\x1b[1;1H");
    expect(output()).toContain("X");
    expect(output()).not.toContain("\x1b[2;1H");
  });

  it("render with no changes produces no output", () => {
    const r = new Renderer({ stdout });
    const s = new Screen({ width: 3, height: 2 });
    r.render(s);
    stdout.write.mockClear();
    r.render(s);
    expect(stdout.write).not.toHaveBeenCalled();
  });

  it("render outputs bold ANSI code", () => {
    const r = new Renderer({ stdout });
    const s = new Screen({ width: 3, height: 1 });
    s.setCell(1, 0, { char: "B", bold: true });
    r.render(s);
    expect(output()).toContain("\x1b[1m");
  });

  it("render outputs dim ANSI code", () => {
    const r = new Renderer({ stdout });
    const s = new Screen({ width: 3, height: 1 });
    s.setCell(1, 0, { char: "D", dim: true });
    r.render(s);
    expect(output()).toContain("\x1b[2m");
  });

  it("render outputs underline ANSI code", () => {
    const r = new Renderer({ stdout });
    const s = new Screen({ width: 3, height: 1 });
    s.setCell(1, 0, { char: "U", underline: true });
    r.render(s);
    expect(output()).toContain("\x1b[4m");
  });

  it("render converts named fg color to ANSI code", () => {
    const r = new Renderer({ stdout });
    const s = new Screen({ width: 1, height: 1 });
    s.setCell(0, 0, { char: "X", fg: "red" });
    r.render(s);
    expect(output()).toContain("\x1b[31m");
  });

  it("render converts hex fg color to ANSI true color", () => {
    const r = new Renderer({ stdout });
    const s = new Screen({ width: 1, height: 1 });
    s.setCell(0, 0, { char: "X", fg: "#ff0000" });
    r.render(s);
    expect(output()).toContain("\x1b[38;2;255;0;0m");
  });

  it("render converts rgb() fg color to ANSI true color", () => {
    const r = new Renderer({ stdout });
    const s = new Screen({ width: 1, height: 1 });
    s.setCell(0, 0, { char: "X", fg: "rgb(0,255,0)" });
    r.render(s);
    expect(output()).toContain("\x1b[38;2;0;255;0m");
  });

  it("render converts named bg color to ANSI background code", () => {
    const r = new Renderer({ stdout });
    const s = new Screen({ width: 1, height: 1 });
    s.setCell(0, 0, { char: " ", bg: "blue" });
    r.render(s);
    expect(output()).toContain("\x1b[44m");
  });

  it("render converts hex bg color to ANSI true color", () => {
    const r = new Renderer({ stdout });
    const s = new Screen({ width: 1, height: 1 });
    s.setCell(0, 0, { char: " ", bg: "#0000ff" });
    r.render(s);
    expect(output()).toContain("\x1b[48;2;0;0;255m");
  });

  it("groups consecutive same-style cells into single write", () => {
    const r = new Renderer({ stdout });
    const s = new Screen({ width: 5, height: 1 });
    s.setCell(0, 0, { char: "A" });
    s.setCell(1, 0, { char: "B" });
    s.setCell(2, 0, { char: "C" });
    r.render(s);
    const hasGroup = writes().some(w => w.includes("ABC"));
    expect(hasGroup).toBe(true);
  });

  it("resets style between cells with different styles", () => {
    const r = new Renderer({ stdout });
    const s = new Screen({ width: 4, height: 1 });
    s.setCell(0, 0, { char: "A", bold: true });
    s.setCell(1, 0, { char: "B", bold: false });
    r.render(s);
    expect(output()).toContain("\x1b[0m");
  });

  it("destroy resets SGR", () => {
    const r = new Renderer({ stdout });
    r.destroy();
    expect(stdout.write).toHaveBeenCalledWith("\x1b[0m");
  });
});
