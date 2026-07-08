import { describe, it, expect } from "vitest";
import { Screen } from "../../src/tui/screen.js";

describe("Screen", () => {
  it("setCell writes character at position", () => {
    const s = new Screen({ width: 5, height: 3 });
    s.setCell(2, 1, { char: "X" });
    expect(s.toString()).toBe("     \n  X  \n     ");
  });

  it("setCell out of bounds is ignored", () => {
    const s = new Screen({ width: 3, height: 2 });
    s.setCell(-1, 0, { char: "A" });
    s.setCell(0, -1, { char: "B" });
    s.setCell(10, 0, { char: "C" });
    s.setCell(0, 10, { char: "D" });
    expect(s.toString()).toBe("   \n   ");
  });

  it("setCell does partial merge", () => {
    const s = new Screen({ width: 3, height: 1 });
    s.setCell(0, 0, { char: "A", bold: true });
    s.setCell(0, 0, { char: "B" });
    const snap = s.snapshot();
    expect(snap[0].char).toBe("B");
    expect(snap[0].bold).toBe(true);
    expect(snap[0].fg).toBeNull();
  });

  it("fill fills rectangle", () => {
    const s = new Screen({ width: 5, height: 3 });
    s.fill(1, 0, 3, 2, { char: "#" });
    expect(s.toString()).toBe(" ### \n ### \n     ");
  });

  it("fill clamps to screen bounds", () => {
    const s = new Screen({ width: 4, height: 3 });
    s.fill(-1, 0, 6, 3, { char: "*" });
    expect(s.toString()).toBe("****\n****\n****");
  });

  it("fill with zero width or height is no-op", () => {
    const s = new Screen({ width: 3, height: 2 });
    s.fill(0, 0, 0, 2, { char: "A" });
    s.fill(0, 0, 2, 0, { char: "B" });
    expect(s.toString()).toBe("   \n   ");
  });

  it("new cell uses CELL defaults", () => {
    const s = new Screen({ width: 2, height: 1 });
    const snap = s.snapshot();
    expect(snap[0]).toMatchObject({
      char: " ",
      fg: null,
      bg: null,
      bold: false,
      dim: false,
      underline: false,
    });
  });

  it("snapshot is not affected by subsequent setCell", () => {
    const s = new Screen({ width: 3, height: 2 });
    s.setCell(0, 0, { char: "A" });
    const snap = s.snapshot();
    s.setCell(0, 0, { char: "B" });
    expect(snap[0].char).toBe("A");
  });

  it("diff returns only changed cells", () => {
    const s = new Screen({ width: 3, height: 2 });
    const snap = s.snapshot();
    s.setCell(0, 0, { char: "A" });
    s.setCell(2, 1, { char: "B" });
    const changes = s.diff(snap);
    expect(changes).toHaveLength(2);
    expect(changes[0]).toMatchObject({ x: 0, y: 0, char: "A" });
    expect(changes[1]).toMatchObject({ x: 2, y: 1, char: "B" });
  });

  it("diff with no changes returns empty array", () => {
    const s = new Screen({ width: 3, height: 2 });
    const snap = s.snapshot();
    const changes = s.diff(snap);
    expect(changes).toHaveLength(0);
  });

  it("diff after fill returns all filled cells", () => {
    const s = new Screen({ width: 3, height: 2 });
    const snap = s.snapshot();
    s.fill(0, 0, 3, 2, { char: "#" });
    const changes = s.diff(snap);
    expect(changes).toHaveLength(6);
    expect(changes.every(c => c.char === "#")).toBe(true);
  });

  it("diff with empty prev treats all cells as changes", () => {
    const s = new Screen({ width: 2, height: 2 });
    const changes = s.diff([]);
    expect(changes).toHaveLength(4);
  });

  it("diff changes include all cell properties", () => {
    const s = new Screen({ width: 2, height: 1 });
    const snap = s.snapshot();
    s.setCell(0, 0, { char: "X", fg: "red", bg: "blue", bold: true, dim: true, underline: true });
    const changes = s.diff(snap);
    expect(changes[0]).toMatchObject({
      x: 0, y: 0,
      char: "X",
      fg: "red",
      bg: "blue",
      bold: true,
      dim: true,
      underline: true,
    });
  });

  it("diff with prev of different length returns all cells as changes", () => {
    const s = new Screen({ width: 2, height: 2 });
    const biggerPrev = new Array(6).fill(null).map(() => ({ ...s.snapshot()[0] }));
    s.setCell(0, 0, { char: "A" });
    const changes = s.diff(biggerPrev);
    expect(changes).toHaveLength(4);
  });

  it("diff with prev of different length catches every change even at mismatched indices", () => {
    const oldScreen = new Screen({ width: 3, height: 2 });
    oldScreen.setCell(1, 0, { char: "X" });
    const prev = oldScreen.snapshot();

    const newScreen = new Screen({ width: 2, height: 3 });
    newScreen.setCell(0, 2, { char: "Y" });
    const changes = newScreen.diff(prev);

    expect(changes).toHaveLength(6);
    expect(changes.some(c => c.x === 1 && c.y === 0)).toBe(true);
    expect(changes.some(c => c.x === 0 && c.y === 2 && c.char === "Y")).toBe(true);
  });

  it("clear resets all cells to CELL defaults", () => {
    const s = new Screen({ width: 3, height: 2 });
    s.setCell(0, 0, { char: "X", bold: true, fg: "red" });
    s.setCell(2, 1, { char: "Y" });
    s.clear();
    expect(s.toString()).toBe("   \n   ");
    const snap = s.snapshot();
    expect(snap.every(c => c.char === " " && c.fg === null && c.bg === null && c.bold === false)).toBe(true);
  });

  it("clear after resize works correctly", () => {
    const s = new Screen({ width: 2, height: 2 });
    s.setCell(0, 0, { char: "A" });
    s.resize(3, 3);
    s.clear();
    expect(s.width).toBe(3);
    expect(s.height).toBe(3);
    expect(s.toString()).toBe("   \n   \n   ");
  });

  it("resize larger adds empty cells", () => {
    const s = new Screen({ width: 2, height: 2 });
    s.setCell(0, 0, { char: "A" });
    s.resize(3, 3);
    expect(s.width).toBe(3);
    expect(s.height).toBe(3);
    expect(s.toString()).toBe("A  \n   \n   ");
  });

  it("resize smaller truncates data", () => {
    const s = new Screen({ width: 4, height: 3 });
    s.setCell(3, 2, { char: "X" });
    s.resize(2, 2);
    expect(s.width).toBe(2);
    expect(s.height).toBe(2);
    expect(s.toString()).toBe("  \n  ");
  });

  it("toString generates readable output", () => {
    const s = new Screen({ width: 3, height: 2 });
    s.setCell(0, 0, { char: "H" });
    s.setCell(1, 0, { char: "i" });
    expect(s.toString()).toBe("Hi \n   ");
  });

  describe("clip region", () => {
    it("setCell inside clip is written, outside is ignored", () => {
      const s = new Screen({ width: 5, height: 3 });
      s.pushClip(1, 1, 3, 1);
      s.setCell(0, 0, { char: "X" }); // outside clip
      s.setCell(2, 1, { char: "Y" }); // inside clip
      s.setCell(4, 1, { char: "Z" }); // outside clip
      expect(s.toString()).toBe(
        "     \n" +
        "  Y  \n" +
        "     "
      );
    });

    it("fill respects clip region", () => {
      const s = new Screen({ width: 5, height: 3 });
      s.pushClip(1, 0, 3, 2);
      s.fill(0, 0, 5, 3, { char: "#" });
      expect(s.toString()).toBe(
        " ### \n" +
        " ### \n" +
        "     "
      );
    });

    it("multiple nested clips — innermost has precedence", () => {
      const s = new Screen({ width: 5, height: 3 });
      s.pushClip(0, 0, 5, 3);
      s.pushClip(1, 1, 1, 1);
      s.setCell(0, 0, { char: "A" }); // outside inner clip
      s.setCell(1, 1, { char: "B" }); // inside inner clip
      s.setCell(2, 2, { char: "C" }); // outside inner clip
      expect(s.toString()).toBe(
        "     \n" +
        " B   \n" +
        "     "
      );
    });

    it("popClip restores previous clip", () => {
      const s = new Screen({ width: 5, height: 3 });
      s.pushClip(1, 1, 1, 1);
      s.setCell(0, 0, { char: "A" }); // outside clip, ignored
      s.popClip();
      s.setCell(0, 0, { char: "B" }); // now allowed
      expect(s.toString()).toBe(
        "B    \n" +
        "     \n" +
        "     "
      );
    });

    it("without active clip behavior is unchanged", () => {
      const s = new Screen({ width: 3, height: 2 });
      s.setCell(0, 0, { char: "X" });
      s.setCell(2, 1, { char: "Y" });
      expect(s.toString()).toBe("X  \n  Y");
    });

    it("clip with zero width does not allow writes", () => {
      const s = new Screen({ width: 5, height: 3 });
      s.pushClip(0, 0, 0, 3);
      s.setCell(0, 0, { char: "A" });
      expect(s.toString()).toBe(
        "     \n" +
        "     \n" +
        "     "
      );
    });

    it("clip with zero height does not allow writes", () => {
      const s = new Screen({ width: 5, height: 3 });
      s.pushClip(0, 0, 5, 0);
      s.setCell(0, 0, { char: "A" });
      expect(s.toString()).toBe(
        "     \n" +
        "     \n" +
        "     "
      );
    });
  });
});
