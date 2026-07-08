import type { Widget } from "./widget.js";
import type { KeyEvent } from "./types.js";

export class UIEvent {
  readonly type: string;
  target: Widget | null = null;
  currentTarget: Widget | null = null;
  phase: "capture" | "target" | "bubble" = "capture";
  propagationStopped = false;
  defaultPrevented = false;

  constructor(type: string) {
    this.type = type;
  }

  stopPropagation(): void {
    this.propagationStopped = true;
  }

  preventDefault(): void {
    this.defaultPrevented = true;
  }
}

export class KeyUIEvent extends UIEvent {
  readonly keyEvent: KeyEvent;

  constructor(type: string, keyEvent: KeyEvent) {
    super(type);
    this.keyEvent = keyEvent;
  }
}
