export interface CellProps {
  char?: string;
  fg?: string | null;
  bg?: string | null;
  bold?: boolean;
  dim?: boolean;
  underline?: boolean;
}

export interface Cell extends Required<CellProps> {
  char: string;
  fg: string | null;
  bg: string | null;
  bold: boolean;
  dim: boolean;
  underline: boolean;
}

export interface KeyEvent {
  key: string | undefined;
  ctrl: boolean;
  shift: boolean;
  meta: boolean;
  sequence: string | undefined;
}

export interface ResizeEvent {
  width: number;
  height: number;
}

export interface PositionedCell extends Cell {
  x: number;
  y: number;
}

export interface Snapshot extends Array<Cell> {
  _w: number;
  _h: number;
}

export interface Widget {
  render(screen: import("./screen.js").Screen): void;
}
