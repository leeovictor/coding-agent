# Plano de Implementação — TUI para o dux

## Visão Geral

Este documento descreve o plano de implementação da fundação mínima da TUI (Terminal User Interface)
para o projeto **dux**. A primeira iteração foca em estabelecer a base arquitetural e validar com um
único widget e uma demo simples.

**Filosofia**: Zero dependências externas. Tudo construído sobre APIs nativas do Node.js (`readline`,
`process.stdout`, ANSI escapes).

**Objetivo da primeira iteração**: Validar o modelo de buffer de tela, diff rendering, e widgets
posicionáveis com um widget `Text` e uma demo interativa.

---

## Estrutura de Arquivos

```
src/tui/
├── tty.js                # Terminal I/O (raw mode, keypress, resize, cursor)
├── screen.js             # Buffer de células 2D + diff + toString
├── renderer.js           # Converte diff → ANSI escapes → stdout
├── widgets/
│   └── text.js           # Widget de texto posicionável e estilizável
├── screen.test.js        # Testes unitários do buffer
└── tui-demo/
    └── demo.js           # Demo interativa: texto centralizado, tecla 'q' sai, redimensiona
```

---

## Módulo 1: `tty.js` — Terminal I/O

### Responsabilidade

Encapsular toda a comunicação de baixo nível com o terminal:
raw mode, captura de teclas, eventos de resize, controle de cursor.

### API

```js
/**
 * Cria uma instância de terminal para TUI.
 *
 * @param {object} opts
 * @param {NodeJS.ReadStream} opts.stdin  - process.stdin
 * @param {NodeJS.WriteStream} opts.stdout - process.stdout
 * @returns {{
 *   width: number,
 *   height: number,
 *   onKeypress: (fn: (key: KeyEvent) => void) => void,
 *   onResize: (fn: (size: { width: number, height: number }) => void) => void,
 *   cursorHide: () => void,
 *   cursorShow: () => void,
 *   write: (str: string) => void,
 *   destroy: () => void,
 * }}
 */
export function createTTY({ stdin, stdout });
```

### Tipos

```js
/**
 * @typedef {{
 *   key: string,       // "q", "enter", "backspace", "up", etc.
 *   ctrl: boolean,
 *   shift: boolean,
 *   meta: boolean,
 *   sequence: string,  // sequência raw
 * }} KeyEvent
 */
```

### Comportamento

| Método | Implementação |
|---|---|
| `width` / `height` | `process.stdout.columns` / `process.stdout.rows` |
| `onKeypress(fn)` | `emitKeypressEvents(stdin)`, `stdin.on("keypress", fn)`. Raw mode ativado. |
| `onResize(fn)` | `process.stdout.on("resize", () => fn({ width, height }))` |
| `cursorHide()` | Escreve `\x1b[?25l` |
| `cursorShow()` | Escreve `\x1b[?25h` |
| `write(str)` | `stdout.write(str)` |
| `destroy()` | `stdin.setRawMode(false)`, `stdin.removeAllListeners("keypress")`, mostra cursor, limpa tela (`\x1b[2J\x1b[H`) |

### Edge Cases

- Se `stdin` já estiver em raw mode (ex: alguém chamou `format.js` attachInput antes), restaurar ao estado original no `destroy`
- Se `stdout` não for TTY (`process.stdout.isTTY === false`), `width`/`height` default para 80x24
- `resize` pode disparar múltiplas vezes rapidamente — usar debounce? (não na v1, otimização futura)

---

## Módulo 2: `screen.js` — Buffer de Células

### Responsabilidade

Buffer de tela 2D que armazena o estado de cada célula (caractere, cores, atributos).
Suporta escrita, snapshot para diff, e redimensionamento.

### API

```js
/**
 * Célula da tela.
 * @typedef {{
 *   char: string,
 *   fg: string | null,
 *   bg: string | null,
 *   bold: boolean,
 *   dim: boolean,
 *   underline: boolean,
 * }} Cell
 */

/**
 * Célula padrão (espaço vazio, sem estilo).
 */
const CELL = { char: " ", fg: null, bg: null, bold: false, dim: false, underline: false };

/**
 * Cria um buffer de tela 2D.
 *
 * @param {{ width: number, height: number }} opts
 * @returns {{
 *   width: number,
 *   height: number,
 *   setCell: (x: number, y: number, partial: Partial<Cell>) => void,
 *   fill: (x: number, y: number, w: number, h: number, partial: Partial<Cell>) => void,
 *   snapshot: () => Cell[][],
 *   diff: (prev: Cell[][]) => Array<{ x: number, y: number, char: string, fg: string | null, bg: string | null, bold: boolean, dim: boolean, underline: boolean }>,
 *   resize: (w: number, h: number) => void,
 *   toString: () => string,
 * }}
 */
export function createScreen({ width, height });
```

### Estrutura de Dados Interna

```
grid: Cell[][]     // grid[y][x]
```

Cada célula é um objeto mutável compartilhado. `setCell` modifica propriedades in-place.
`fill` itera sobre retângulo chamando `setCell` para cada posição.
`snapshot` faz deep copy (`structuredClone`) do grid inteiro.

### Algoritmo de Diff

```js
diff(prev) {
  const changes = [];
  for (let y = 0; y < this.height; y++) {
    let x = 0;
    while (x < this.width) {
      const cell = this.grid[y][x];
      const prevCell = prev[y]?.[x];
      if (cellChanged(cell, prevCell)) {
        changes.push({ x, y, ...structuredClone(cell) });
      }
      x++;
    }
  }
  return changes;
}
```

### Comportamento

| Método | Descrição |
|---|---|
| `setCell(x, y, partial)` | Merge parcial: atualiza apenas as props fornecidas de `partial`. Se `x` ou `y` fora dos limites, ignora silenciosamente. |
| `fill(x, y, w, h, partial)` | Preenche retângulo. Clamp nos limites. |
| `snapshot()` | Retorna deep copy do grid atual. Usado para comparar frames. |
| `diff(prev)` | Compara grid atual com snapshot anterior. Retorna array de células que mudaram (posição + valor completo). |
| `resize(w, h)` | Cria novo grid com novas dimensões. Células são inicializadas com `{...CELL}`. |
| `toString()` | Concatena todas as linhas com `\n`, apenas os caracteres (ignora estilo). Ideal para snapshot testing. |

### Edge Cases

- Acesso fora dos limites em `setCell`: ignorar, sem erro
- `fill` com w=0 ou h=0: no-op
- `diff` com array de tamanho diferente: tratar como mudança em todas as posições que existem no grid atual mas não no prev
- `resize` para tamanho menor: dados são perdidos (comportamento esperado)
- `resize` para tamanho maior: novas células são `{...CELL}`

---

## Módulo 3: `renderer.js` — Emissor ANSI

### Responsabilidade

Recebe o buffer de tela (`screen`), calcula o diff contra o frame anterior, e emite
sequências de escape ANSI otimizadas para `stdout`.

### API

```js
/**
 * Cria um renderizador que emite ANSI escapes para stdout.
 *
 * @param {{ stdout: NodeJS.WriteStream }} opts
 * @returns {{
 *   render: (screen: import('./screen.js').Screen) => void,
 *   destroy: () => void,
 * }}
 */
export function createRenderer({ stdout });
```

### Algoritmo de Renderização

```js
render(screen) {
  const prev = this._lastSnapshot ?? [];
  const changes = screen.diff(prev);

  // Ordena mudanças: de cima pra baixo, da esquerda pra direita
  changes.sort((a, b) => a.y - b.y || a.x - b.x);

  let lastX = -1, lastY = -1;
  let currentStyle = null;
  let buffer = "";

  for (const cell of changes) {
    const style = styleSig(cell); // string que identifica a combinação de estilo

    // Agrupa células consecutivas na mesma linha com mesmo estilo
    if (cell.y === lastY && cell.x === lastX + 1 && style === currentStyle) {
      buffer += cell.char;
    } else {
      flushBuffer();  // emite o buffer acumulado
      moveCursor(cell.y, cell.x);
      applyStyle(cell);
      buffer = cell.char;
      currentStyle = style;
    }

    lastX = cell.x;
    lastY = cell.y;
  }
  flushBuffer();

  this._lastSnapshot = screen.snapshot();
}
```

### Otimizações

1. **Agrupamento por linha**: células consecutivas na mesma linha com mesmo estilo → escritas como uma string só
2. **Cursor move**: só move o cursor quando a posição não é contígua
3. **SGR caching**: não re-emite SGR se o estilo não mudou
4. **Sem SGR desnecessário**: se `fg` é null, não emite código de cor (usa cor padrão do terminal)

### Sequências ANSI Usadas

| Operação | Sequência |
|---|---|
| Mover cursor | `\x1b[{y};{x}H` |
| Reset estilo | `\x1b[0m` |
| Cor foreground | `\x1b[3{m}m` (16 cores) ou `\x1b[38;5;{n}m` (256) ou `\x1b[38;2;{r};{g};{b}m` (true color) |
| Cor background | `\x1b[4{m}m` / `\x1b[48;5;{n}m` / `\x1b[48;2;{r};{g};{b}m` |
| Bold | `\x1b[1m` |
| Dim | `\x1b[2m` |
| Underline | `\x1b[4m` |
| Esconder cursor | `\x1b[?25l` |
| Mostrar cursor | `\x1b[?25h` |

### Comportamento

| Método | Descrição |
|---|---|
| `render(screen)` | Calcula diff, emite ANSI escapes apenas para células alteradas. Atualiza snapshot interno. |
| `destroy()` | Reseta SGR (`\x1b[0m`), posiciona cursor no fim da tela. |

### Edge Cases

- Primeiro `render()`: snapshot anterior é undefined → todas as células são "mudanças" → full render
- Cores nomeadas (`"red"`, `"green"`, etc.) → converter para ANSI
- Cores hex (`"#ff0000"`) → converter para RGB ANSI
- Cores RGB (`"rgb(255,0,0)"`) → converter para RGB ANSI
- Terminal sem suporte a true color (ex: `screen`, `tmux` sem config) → fallback para cor mais próxima em 256 ou 16

---

## Módulo 4: `widgets/text.js` — Widget de Texto

### Responsabilidade

Widget renderizável que escreve texto posicionado com estilo no buffer de tela.

### API

```js
/**
 * @typedef {{
 *   fg?: string,        // cor do texto
 *   bg?: string,        // cor de fundo
 *   bold?: boolean,
 *   dim?: boolean,
 *   underline?: boolean,
 * }} TextStyle
 */

/**
 * Cria um widget de texto.
 *
 * @param {{
 *   content: string,
 *   x: number,
 *   y: number,
 *   style?: TextStyle,
 * }} opts
 * @returns {{
 *   setContent: (text: string) => void,
 *   move: (x: number, y: number) => void,
 *   render: (screen: import('../screen.js').Screen) => void,
 * }}
 */
export function createText({ content, x, y, style });
```

### Comportamento

| Método | Descrição |
|---|---|
| `constructor(opts)` | Armazena `content`, `x`, `y`, `style`. |
| `setContent(text)` | Atualiza `content` para novo valor. Não renderiza automaticamente. |
| `move(x, y)` | Atualiza `x`, `y`. Não renderiza automaticamente. |
| `render(screen)` | Escreve cada caractere de `content` no screen buffer via `screen.setCell(x + i, y, { char, ...style })`. |

### Suporte a Multilinha

Se `content` contém `\n`:
- Cada linha é escrita em `y + lineIndex`
- `x` é o mesmo para todas as linhas
- Caracteres `\r` são ignorados

### Edge Cases

- `content` vazio: no-op no render
- `content` maior que largura da tela: não trunca (screen.setCell ignora fora dos limites)
- Coordenadas negativas: screen.setCell ignora
- `style` undefined: usa estilo padrão (sem cores, sem atributos)

---

## Módulo 5: `screen.test.js` — Testes Unitários

### Responsabilidade

Validar o comportamento do buffer de células (`screen.js`).

### Casos de Teste

| Teste | Descrição |
|---|---|
| `setCell` | Escreve caractere em posição específica |
| `setCell out of bounds` | Ignora silenciosamente |
| `fill` | Preenche retângulo com caractere e estilo |
| `fill partial bounds` | Clampa nos limites da tela |
| `snapshot immutability` | Mudanças posteriores não afetam snapshot |
| `diff changed cells` | Retorna apenas células que mudaram |
| `diff no changes` | Retorna array vazio quando nada mudou |
| `diff after fill` | Retorna todas as células preenchidas |
| `resize larger` | Novas dimensões, células extras são `CELL` |
| `resize smaller` | Dimensões reduzidas, dados truncados |
| `toString` | Gera string legível com `\n` entre linhas |
| `toString with setCell` | Caractere aparece na posição correta |

### Exemplo de Teste

```js
import { describe, it, expect } from "vitest";
import { createScreen } from "../screen.js";

describe("screen", () => {
  it("setCell writes character at position", () => {
    const s = createScreen({ width: 5, height: 3 });
    s.setCell(2, 1, { char: "X" });
    expect(s.toString()).toBe(
      "     \n" +
      "  X  \n" +
      "     "
    );
  });

  it("fill fills rectangle", () => {
    const s = createScreen({ width: 5, height: 3 });
    s.fill(1, 0, 3, 2, { char: "#" });
    expect(s.toString()).toBe(
      " ### \n" +
      " ### \n" +
      "     "
    );
  });

  it("diff returns only changed cells", () => {
    const s = createScreen({ width: 3, height: 2 });
    const snap = s.snapshot();
    s.setCell(0, 0, { char: "A" });
    s.setCell(2, 1, { char: "B" });
    const changes = s.diff(snap);
    expect(changes).toHaveLength(2);
    expect(changes[0]).toMatchObject({ x: 0, y: 0, char: "A" });
    expect(changes[1]).toMatchObject({ x: 2, y: 1, char: "B" });
  });

  it("diff with no changes returns empty array", () => {
    const s = createScreen({ width: 3, height: 2 });
    const snap = s.snapshot();
    const changes = s.diff(snap);
    expect(changes).toHaveLength(0);
  });

  it("resize preserves what fits", () => {
    const s = createScreen({ width: 5, height: 3 });
    s.setCell(0, 0, { char: "A" });
    s.resize(3, 2);
    expect(s.width).toBe(3);
    expect(s.height).toBe(2);
  });

  it("toString generates readable output", () => {
    const s = createScreen({ width: 3, height: 2 });
    s.setCell(0, 0, { char: "H" });
    s.setCell(1, 0, { char: "i" });
    expect(s.toString()).toBe("Hi \n   ");
  });
});
```

---

## Módulo 6: `tui-demo/demo.js` — Demonstração

### Responsabilidade

Script standalone que demonstra a TUI em ação sem dependência do resto do projeto.

### Comportamento

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│                                                             │
│                    Hello, World!                             │
│               Terminal Size: 120 x 40                        │
│                                                             │
│                                                             │
│                                                             │
│               Press 'q' to quit, 'r' for red                 │
└─────────────────────────────────────────────────────────────┘
```

### Fluxo

1. **Inicialização**: Cria `tty`, `screen`, `renderer`
2. **Cria widgets**:
   - `titleText`: centralizado no topo com "Hello, World!" (bold)
   - `sizeText`: abaixo com dimensões do terminal (dim)
   - `helpText`: rodapé com instruções (dim)
3. **Render inicial**: calcula posições, renderiza todos os widgets, emite ANSI
4. **Loop de eventos**:
   - `keypress`:
     - `q` → sai
     - `r` → alterna cor do titleText entre default e vermelho
     - `c` → troca conteúdo do titleText (ex: "Hello!" ↔ "World!")
     - `Ctrl+C` → sai
   - `resize`:
     - Redimensiona screen para novas dimensões
     - Recalcula posições dos widgets
     - Renderiza frame completo
5. **Limpeza**: `tty.destroy()`, restaura terminal

### Cálculo de Posições

```js
function layout(width, height) {
  const titleLines = titleText.content.split("\n");
  const titleY = Math.floor(height / 2) - titleLines.length;
  const titleX = Math.floor((width - maxLineWidth(titleLines)) / 2);

  const sizeY = titleY + titleLines.length + 1;
  const sizeX = Math.floor((width - sizeText.content.length) / 2);

  const helpY = height - 1;
  const helpX = Math.floor((width - helpText.content.length) / 2);

  titleText.move(titleX, titleY);
  sizeText.move(sizeX, sizeY);
  helpText.move(helpX, helpY);
}
```

### Código de Exemplo

```js
import { createTTY } from "../tty.js";
import { createScreen } from "../screen.js";
import { createRenderer } from "../renderer.js";
import { createText } from "../widgets/text.js";

function main() {
  const tty = createTTY({ stdin: process.stdin, stdout: process.stdout });
  let screen = createScreen({ width: tty.width, height: tty.height });
  const renderer = createRenderer({ stdout: process.stdout });

  tty.cursorHide();

  const titleText = createText({
    content: "Hello, World!",
    x: 0, y: 0,
    style: { bold: true },
  });

  const sizeText = createText({
    content: `Terminal: ${tty.width}x${tty.height}`,
    x: 0, y: 0,
    style: { dim: true },
  });

  const helpText = createText({
    content: "Press 'q' to quit, 'r' for red, 'c' to change text",
    x: 0, y: 0,
    style: { dim: true },
  });

  function repositionAll() {
    const w = screen.width;
    const h = screen.height;

    const titleLines = titleText.content.split("\n");
    const maxW = Math.max(...titleLines.map(l => l.length));
    titleText.move(
      Math.floor((w - maxW) / 2),
      Math.floor(h / 2) - titleLines.length
    );

    sizeText.move(
      Math.floor((w - sizeText.content.length) / 2),
      Math.floor(h / 2) + 2
    );

    helpText.move(
      Math.floor((w - helpText.content.length) / 2),
      h - 1
    );
  }

  function renderAll() {
    screen = createScreen({ width: tty.width, height: tty.height });
    titleText.render(screen);
    sizeText.render(screen);
    helpText.render(screen);
    renderer.render(screen);
  }

  repositionAll();
  renderAll();

  tty.onKeypress((key) => {
    if (key.key === "q" || (key.ctrl && key.key === "c")) {
      tty.destroy();
      process.exit(0);
    }
    if (key.key === "r") {
      const current = titleText.style.fg;
      titleText.style.fg = current === "red" ? null : "red";
      renderAll();
    }
    if (key.key === "c") {
      titleText.setContent(
        titleText.content === "Hello, World!" ? "Hello, dux!" : "Hello, World!"
      );
      repositionAll();
      renderAll();
    }
  });

  tty.onResize(({ width, height }) => {
    sizeText.setContent(`Terminal: ${width}x${height}`);
    repositionAll();
    renderAll();
  });
}

main();
```

---

## Decisões de Design

| Decisão | Escolha | Justificativa |
|---|---|---|
| Célula mutável vs imutável | **Mutável** | `setCell` modifica objeto existente. `snapshot` faz deep copy. Mais simples e eficiente. |
| Grid 2D vs flat array | **Grid 2D** (`grid[y][x]`) | Mais legível para protótipo. Otimização para flat array se necessário depois. |
| Diff por coordenada individual | **Por coordenada** (cada célula alterada é um item) | Simples e correto. Agrupamento de consecutivas fica no renderer. |
| SGR codes por célula vs otimizado | **Otimizado no renderer** | O renderer agrupa células consecutivas com mesmo estilo, reduzindo bytes emitidos. |
| Tratamento de resize | **Recriar screen** | `screen.resize(w, h)` recria grid. Widgets se reposicionam via `repositionAll()`. |
| Event loop da demo | **Callback-driven** | `onKeypress` e `onResize` são callbacks. Sem loop de eventos próprio. |
| Cores: nomeadas vs ANSI codes | **Nomeadas + hex + rgb** | O renderer converte strings para ANSI. Suporte a: nomes comuns, `#hex`, `rgb(r,g,b)`. |

---

## O que Fica de Fora (para próximas iterações)

- **node.js**: Widget base com árvore hierárquica (parent/children)
- **layout.js**: Motor de layout que resolve constraints (fixed/percent/shrink/fill)
- **Bordas**: Suporte a bordas nos widgets (single, double, round)
- **Padding**: Espaçamento interno nos widgets
- **Scroll**: ScrollBox para log permanente
- **Input**: Widget de input de texto
- **Mouse**: Suporte a eventos de mouse
- **Split**: Layout de painéis
- **Integração com agent.js**: Conexão dos eventos `onEvent` com a TUI
- **Streaming incremental**: `streamText.js` para tokens do LLM
- **Progress/Spinner**: Widget de loading

---

## Roteiro de Implementação

| Ordem | Arquivo | Descrição |
|---|---|---|
| 1 | `src/tui/tty.js` | Terminal I/O (raw mode, keypress, resize, cursor) |
| 2 | `src/tui/screen.js` | Buffer de células 2D + diff + toString |
| 3 | `src/tui/screen.test.js` | Testes unitários do buffer |
| 4 | `src/tui/renderer.js` | Conversão diff → ANSI escapes |
| 5 | `src/tui/widgets/text.js` | Widget de texto posicionável e estilizável |
| 6 | `src/tui/tui-demo/demo.js` | Demo interativa standalone |

---

## Como Rodar

```bash
# Rodar a demo
node src/tui/tui-demo/demo.js

# Rodar os testes
npm test -- src/tui/screen.test.js

# Rodar todos os testes (inclui TUI)
npm test
```
