import { TTY } from "../tty.js";
import { Screen } from "../screen.js";
import { Renderer } from "../renderer.js";
import { Root } from "../root.js";
import { VBox, HBox } from "../containers.js";
import { Text } from "../widgets/text.js";
import { TextInput } from "../widgets/text-input.js";

function quit(tty: TTY): void {
  tty.destroy();
  process.exit(0);
}

function main(): void {
  const tty = new TTY({ stdin: process.stdin, stdout: process.stdout });
  const screen = new Screen({ width: tty.width, height: tty.height });
  const renderer = new Renderer({ stdout: process.stdout });
  const root = new Root({ tty, screen, renderer });

  tty.enterAltScreen();
  tty.cursorHide();

  const w = screen.width;
  const h = screen.height;

  const titleText = new Text({ content: "DUX TUI Demo", x: 0, y: 0, style: { bold: true } });
  const sizeText = new Text({ content: `Terminal: ${w}x${h}`, x: 0, y: 0, style: { dim: true } });
  const topBar = new HBox({ x: 0, y: 0, width: 0, height: 0 });
  topBar.addChild(titleText);
  topBar.addChild(sizeText);

  const inputLeft = new TextInput({ x: 0, y: 0, width: 0 });
  const echoLeft = new Text({ content: "", x: 0, y: 0, style: { dim: true } });
  const leftLabel = new Text({ content: "Left Input", x: 0, y: 0, style: { fg: "cyan" } });
  const leftPanel = new VBox({ x: 0, y: 0, width: 0, height: 0, layout: "stacked" });
  leftPanel.addChild(leftLabel);
  leftPanel.addChild(inputLeft);
  leftPanel.addChild(echoLeft);

  const inputRight = new TextInput({ x: 0, y: 0, width: 0 });
  const echoRight = new Text({ content: "", x: 0, y: 0, style: { dim: true } });
  const rightLabel = new Text({ content: "Right Input", x: 0, y: 0, style: { fg: "cyan" } });
  const rightPanel = new VBox({ x: 0, y: 0, width: 0, height: 0, layout: "stacked" });
  rightPanel.addChild(rightLabel);
  rightPanel.addChild(inputRight);
  rightPanel.addChild(echoRight);

  const content = new HBox({ x: 0, y: 0, width: 0, height: 0 });
  content.addChild(leftPanel);
  content.addChild(rightPanel);

  const footer = new Text({
    content: "Tab: cycle focus | Esc: blur | q: quit | Ctrl+C: quit",
    x: 0, y: 0,
    style: { dim: true },
  });

  topBar.bounds.height = 1;
  const vbox = new VBox({ x: 0, y: 0, width: w, height: h, layout: "stacked" });
  vbox.addChild(topBar);
  vbox.addChild(content);
  vbox.addChild(footer);
  root.addChild(vbox);

  inputRight.blur();
  root.focusNext();
  root.renderFrame();

  tty.onKeypress((key) => {
    if (key.ctrl && key.key === "c") { quit(tty); }

    if (key.key === "escape") {
      if (root.focusedWidget) {
        root.focusedWidget.blur();
        root.focusedWidget = null;
        root.renderFrame();
      }
      return;
    }

    if (!root.focusedWidget && key.key === "q") { quit(tty); }

    if (key.key === "tab") {
      root.focusNext();
      root.renderFrame();
      return;
    }

    root.handleKeyEvent(key);
    if (root.focusedWidget === inputLeft) {
      echoLeft.setContent(inputLeft.value);
    } else if (root.focusedWidget === inputRight) {
      echoRight.setContent(inputRight.value);
    }
    root.renderFrame();
  });

  tty.onResize(({ width, height }) => {
    root.handleResize(width, height);
    vbox.bounds = { x: 0, y: 0, width, height };
    const newW = screen.width;
    const newH = screen.height;
    sizeText.setContent(`Terminal: ${newW}x${newH}`);
    root.renderFrame();
  });
}

main();
