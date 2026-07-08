import { TTY } from "../tty.js";
import { Screen } from "../screen.js";
import { Renderer } from "../renderer.js";
import { Root } from "../root.js";
import { VBox } from "../containers.js";
import { Text } from "../widgets/text.js";
import { TextInput } from "../widgets/text-input.js";

function main(): void {
  const tty = new TTY({ stdin: process.stdin, stdout: process.stdout });
  const screen = new Screen({ width: tty.width, height: tty.height });
  const renderer = new Renderer({ stdout: process.stdout });
  const root = new Root({ tty, screen, renderer });

  tty.enterAltScreen();
  tty.cursorHide();

  const inputWidth = Math.min(tty.width - 4, 80);

  const titleText = new Text({
    content: "Hello, World!",
    x: 0, y: 0,
    style: { bold: true },
  });

  const sizeText = new Text({
    content: `Terminal: ${tty.width}x${tty.height}`,
    x: 0, y: 0,
    style: { dim: true },
  });

  const input = new TextInput({
    x: 0, y: 0,
    width: inputWidth,
  });

  const valueText = new Text({
    content: "",
    x: 0, y: 0,
    style: { dim: true },
  });

  const helpText = new Text({
    content: "Press 'q' to quit, Tab to focus/blur input",
    x: 0, y: 0,
    style: { dim: true },
  });

  const vbox = new VBox({ x: 0, y: 0, width: screen.width, height: screen.height });
  vbox.addChild(titleText);
  vbox.addChild(sizeText);
  vbox.addChild(input);
  vbox.addChild(valueText);
  vbox.addChild(helpText);
  root.addChild(vbox);

  root.focusNext();
  root.renderFrame();

  tty.onKeypress((key) => {
    if (key.ctrl && key.key === "c") { tty.destroy(); process.exit(0); }
    if (!input.focused && key.key === "q") { tty.destroy(); process.exit(0); }
    if (key.key === "tab") {
      if (input.focused) input.blur(); else input.focus();
      root.renderFrame();
      return;
    }
    root.handleKeyEvent(key);
    valueText.setContent(input.value);
    root.renderFrame();
  });

  tty.onResize(({ width, height }) => {
    root.handleResize(width, height);
    vbox.bounds = { x: 0, y: 0, width, height };
    root.renderFrame();
  });
}

main();
