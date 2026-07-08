# Arquitetura da TUI

## Visão Geral

A TUI (Terminal User Interface) do `dux` é estruturada em uma **árvore de widgets** (`node tree`), similar a frameworks web como React/DOM. Um widget `Root` no topo da árvore gerencia o ciclo de renderização, eventos de teclado e foco. Cada widget possui `bounds` (posição e tamanho relativos ao pai), e a posição absoluta é calculada recursivamente somando os offsets de todos os ancestrais.

```
┌──────────────────────────────────────────────┐
│                   Root                        │
│  ┌─────────────────────────────────────────┐  │
│  │                VBox                      │  │
│  │  ┌──────────────────────────────────┐   │  │
│  │  │          Text (título)           │   │  │
│  │  ├──────────────────────────────────┤   │  │
│  │  │          Text (info)             │   │  │
│  │  ├──────────────────────────────────┤   │  │
│  │  │          TextInput               │   │  │
│  │  ├──────────────────────────────────┤   │  │
│  │  │          Text (valor)            │   │  │
│  │  ├──────────────────────────────────┤   │  │
│  │  │          Text (help)             │   │  │
│  │  └──────────────────────────────────┘   │  │
│  └─────────────────────────────────────────┘  │
└──────────────────────────────────────────────┘
```

---

## Estruturas de Dados

### 1. Screen — Grade de Caracteres

O `Screen` é um array unidimensional de `Cell` que representa o terminal como uma grade `width × height`.

```typescript
// src/tui/screen.ts

interface Cell {
  char: string;         // caractere exibido
  fg: string | null;    // cor do texto (nome, #hex, rgb())
  bg: string | null;    // cor do fundo
  bold: boolean;
  dim: boolean;
  underline: boolean;
}
```

**Representação interna:**

```
grid = new Array(width * height)

Posição (x, y) → índice: idx = y * width + x
```

**Operações principais:**

| Operação | Descrição |
|----------|-----------|
| `setCell(x, y, partial)` | Aplica `partial` (merge parcial) na célula em `(x, y)`. Ignora se fora dos bounds ou do clip ativo. |
| `fill(x, y, w, h, partial)` | Preenche um retângulo com `partial`, limitado por bounds da tela e clip ativo. |
| `snapshot()` | Clona o grid atual para diff posterior. |
| `diff(prev)` | Compara com snapshot anterior e retorna apenas as células alteradas. |
| `clear()` | Redefine todas as células para o estado default. |

---

### 2. Widget — Nó da Árvore

`Widget` é uma classe abstrata que serve como base para todos os elementos da interface.

```typescript
// src/tui/widget.ts

abstract class Widget {
  parent: Widget | null;        // nó pai (null se for root)
  children: Widget[];           // nós filhos
  bounds: Rect;                 // posição/tamanho RELATIVOS ao pai
  mounted: boolean;             // está na árvore montada?
  focusable: boolean;           // pode receber foco?
  focused: boolean;             // está com foco?

  // Navegação na árvore
  get isRoot(): boolean;        // true se parent === null
  get root(): Widget;           // retorna o ancestral mais alto

  // Posicionamento
  get absoluteBounds(): Rect;   // bounds ABSOLUTOS (soma offsets dos pais)

  // Manipulação da árvore
  addChild(child): void;        // adiciona filho, define parent, propaga mount
  removeChild(child): void;     // remove filho, limpa parent, propaga unmount

  // Ciclo de vida
  mount(): void;                // marca como montado, propaga para filhos
  unmount(): void;              // marca como desmontado, propaga para filhos

  // Renderização
  abstract render(screen): void;           // desenha o widget no Screen
  renderFrame(screen): void;               // pushClip → render → renderChildren → popClip

  // Hit testing
  findWidgetAt(x, y): Widget | null;       // retorna o widget mais profundo em (x, y)

  // Eventos
  dispatchEvent(event): void;              // propaga evento (capture → target → bubble)
  onEvent(event): void;                    // hook para subclasses
  onKeyEvent(event): void;                 // hook específico para teclado

  // Foco
  focus(): void;                           // this.focused = true
  blur(): void;                            // this.focused = false
}
```

**`absoluteBounds` — Cálculo recursivo:**

```typescript
get absoluteBounds(): Rect {
  if (!this.parent) {
    return { ...this.bounds };           // cópia para evitar mutação externa
  }
  const parentAbs = this.parent.absoluteBounds;
  return {
    x: parentAbs.x + this.bounds.x,     // soma offset X do pai
    y: parentAbs.y + this.bounds.y,     // soma offset Y do pai
    width: this.bounds.width,           // width/height NÃO acumulam
    height: this.bounds.height,
  };
}
```

**Exemplo:** Widget com `bounds = { x: 3, y: 2 }` dentro de um container com `bounds = { x: 10, y: 5 }` → `absoluteBounds = { x: 13, y: 7 }`.

---

### 3. UIEvent — Propagação com Captura e Bolha

```typescript
// src/tui/events.ts

class UIEvent {
  readonly type: string;                // "keydown", "click", etc.
  target: Widget | null;                // widget alvo do evento
  currentTarget: Widget | null;         // widget atual na propagação
  phase: "capture" | "target" | "bubble";
  propagationStopped: boolean;          // true se stopPropagation() foi chamado
  defaultPrevented: boolean;

  stopPropagation(): void;
  preventDefault(): void;
}

class KeyUIEvent extends UIEvent {
  readonly keyEvent: KeyEvent;          // dados da tecla pressionada
}
```

---

### 4. Root — Gerenciador da Árvore

```typescript
// src/tui/root.ts

class Root extends Widget {
  focusedWidget: Widget | null;         // widget atualmente com foco

  renderFrame(): void;                  // clear → fill → super.renderFrame → renderer.render
  handleKeyEvent(keyEvent): void;       // dispatch KeyUIEvent via árvore
  focusNext(): void;                    // avança foco (depth-first)
  focusPrev(): void;                    // retrocede foco (depth-first)
  handleResize(w, h): void;            // redimensiona Screen
}
```

---

## Interações entre Estruturas

### Fluxo de Renderização

```
Root.renderFrame()
  │
  ├─ screen.clear()                      → redefine grid da tela
  ├─ screen.fill(0, 0, W, H, {})        → preenche fundo
  ├─ Widget.renderFrame(screen)          → herdado de Widget
  │    │
  │    ├─ screen.pushClip(absBounds)     → empilha região de recorte
  │    ├─ this.render(screen)            → desenha o widget atual
  │    ├─ for each child:
  │    │    child.renderFrame(screen)    → recursão para cada filho
  │    └─ screen.popClip()              → restaura clip anterior
  │
  └─ renderer.render(screen)            → envia ANSI para o terminal
```

**Cada nó na árvore empilha seu próprio clip.** O clip mais interno (do widget atual) tem precedência sobre os externos.

---

### Fluxo de Eventos (Capture → Target → Bubble)

```
Root.handleKeyEvent(keyEvent)
  │
  ├─ Cria KeyUIEvent
  ├─ event.target = focusedWidget
  ├─ Root.dispatchEvent(event)
  │    │
  │    ├─ [FASE DE CAPTURA]
  │    │   root.onEvent(event)     ← phase = "capture"
  │    │   parent.onEvent(event)   ← phase = "capture"
  │    │   ...                     ← descendo até o pai do target
  │    │
  │    ├─ [FASE DE ALVO]
  │    │   target.onEvent(event)   ← phase = "target"
  │    │
  │    └─ [FASE DE BOLHA]
  │        parent.onEvent(event)   ← phase = "bubble"
  │        root.onEvent(event)     ← phase = "bubble"
  │
  └─ (se propagationStopped, interrompe imediatamente)
```

**Pseudo-código do `dispatchEvent`:**

```
FUNÇÃO dispatchEvent(event):
  SE event.target === null:
    event.target = this

  // Constrói caminho: [root, ..., target] via parent pointers
  path = []
  atual = event.target
  ENQUANTO atual != null:
    path.unshift(atual)
    atual = atual.parent

  // Capture: root → target (excluindo target)
  PARA i DE 0 ATÉ path.length - 2:
    event.currentTarget = path[i]
    event.phase = "capture"
    path[i].onEvent(event)
    SE event é KeyUIEvent: path[i].onKeyEvent(event)
    SE event.propagationStopped: RETORNA

  // Target:
  alvo = path[path.length - 1]
  event.currentTarget = alvo
  event.phase = "target"
  alvo.onEvent(event)
  SE event é KeyUIEvent: alvo.onKeyEvent(event)
  SE event.propagationStopped: RETORNA

  // Bubble: target → root (excluindo target)
  PARA i DE path.length - 2 ATÉ 0:
    event.currentTarget = path[i]
    event.phase = "bubble"
    path[i].onEvent(event)
    SE event é KeyUIEvent: path[i].onKeyEvent(event)
    SE event.propagationStopped: RETORNA
```

---

### Fluxo de Foco

```
Root.focusNext()
  │
  ├─ Coleta todos os widgets focusable (depth-first)
  │    walk(widget, result):
  │      SE widget.focusable E widget != Root:
  │        result.push(widget)
  │      PARA cada child: walk(child, result)
  │
  ├─ SE lista vazia: RETORNA
  ├─ SE focusedWidget === null:
  │    setFocus(primeiro da lista)
  │
  └─ SENÃO:
       idx = lista.indexOf(focusedWidget)
       próximo = lista[(idx + 1) % lista.length]
       setFocus(próximo)

Root.setFocus(widget):
  SE focusedWidget != null E focusedWidget != widget:
    focusedWidget.blur()       → focusedWidget.focused = false
  focusedWidget = widget
  widget.focus()               → widget.focused = true
```

A navegação depth-first segue a ordem de inserção dos children. Widgets sobrepostos (Stack) têm o último child como topo.

---

## Algoritmos Principais

### 1. Clip Region (Pilha de Recorte)

O `Screen` mantém uma pilha de regiões de recorte. `setCell` e `fill` só escrevem em células que estão dentro do clip **do topo da pilha**.

```typescript
// src/tui/screen.ts

class Screen {
  private clipStack: Rect[] = [];

  pushClip(x, y, w, h): void {
    this.clipStack.push({ x, y, w, h });
  }

  popClip(): void {
    this.clipStack.pop();             // restaura clip anterior
  }

  private inClip(x, y): boolean {
    if (this.clipStack.length === 0) return true;  // sem clip ativo
    const clip = this.clipStack[this.clipStack.length - 1];
    return x >= clip.x
        && x < clip.x + clip.w
        && y >= clip.y
        && y < clip.y + clip.h;
  }

  setCell(x, y, partial): void {
    if (!this.inBounds(x, y)) return;   // fora da tela
    if (!this.inClip(x, y)) return;     // fora do clip ativo
    // ... escreve na célula
  }
}
```

**Comportamento com clips aninhados:**

```
pushClip(0, 0, 10, 10)     → clip ativo: (0, 0, 10, 10)
  pushClip(2, 2, 3, 3)     → clip ativo: (2, 2, 3, 3)
    setCell(5, 5)           → ignorado! (fora do clip interno)
  popClip()                 → clip ativo: (0, 0, 10, 10)
  setCell(5, 5)             → escrito! (dentro do clip externo)
popClip()                   → sem clip ativo
```

---

### 2. Hit Testing (Encontrar Widget por Coordenada)

O `findWidgetAt(x, y)` percorre a árvore em **ordem reversa dos children** (o último adicionado é o topo) e retorna o widget **mais profundo** que contém o ponto.

```typescript
// src/tui/widget.ts

findWidgetAt(x, y): Widget | null {
  // Verifica children em ordem reversa (topo primeiro)
  for (let i = this.children.length - 1; i >= 0; i--) {
    const child = this.children[i];
    const abs = child.absoluteBounds;

    if (x está dentro de abs) {
      const deeper = child.findWidgetAt(x, y);
      if (deeper) return deeper;   // child tem um descendente mais específico
    }
  }

  // Nenhum child cobre o ponto — verifica este widget
  if (x está dentro de this.absoluteBounds) {
    return this;
  }
  return null;
}
```

**Exemplo:** Clique em `(35, 35)` na árvore abaixo:

```
Root (0, 0, 100, 100)
  └── Container (10, 10, 80, 80)
       └── Button (20, 20, 30, 15)
```

1. Root verifica children → Container (abs: 10,10,80,80) contém (35,35)
2. Container verifica children → Button (abs: 30,30,30,15) contém (35,35)
3. Button não tem children → retorna Button

Resultado: `Button` (o widget mais específico na coordenada).

---

### 3. Layout de Containers (VBox, HBox, Stack)

Os containers recalcularam os `bounds` dos children a cada `renderFrame()`.

#### VBox — Distribuição Vertical

```
PARA i DE 0 ATÉ n-1:
  childH = floor(containerHeight / n)
  children[i].bounds = {
    x: 0,
    y: i * childH,
    width: containerWidth,
    height: childH
  }
```

**Exemplo:** VBox 100×60 com 3 children:

```
child 0: (0,  0, 100, 20)
child 1: (0, 20, 100, 20)
child 2: (0, 40, 100, 20)   // last child ends at y=60, fills exactly
```

**Exemplo com floor:** VBox 100×10 com 6 children:

```
child 0 a 5: (0, y, 100, 1)   // floor(10/6) = 1
// Espaço restante: 10 - (6 × 1) = 4px vazio no final
```

#### HBox — Distribuição Horizontal

```
PARA i DE 0 ATÉ n-1:
  childW = floor(containerWidth / n)
  children[i].bounds = {
    x: i * childW,
    y: 0,
    width: childW,
    height: containerHeight
  }
```

#### Stack — Sobreposição

```
PARA i DE 0 ATÉ n-1:
  children[i].bounds = {
    x: 0,
    y: 0,
    width: containerWidth,
    height: containerHeight
  }
```

Todos os children ocupam o mesmo espaço. Útil para camadas (ex: fundo + overlay).

---

### 4. Caminho de Evento (Path Building)

O `dispatchEvent` constrói o caminho do **target até o root** seguindo a cadeia de `parent`:

```typescript
// Constrói o path do target até o root
path = []
atual = event.target
while (atual) {
  path.unshift(atual);     // insere no início
  atual = atual.parent;
}
// path = [root, ..., target]
```

Se `event.target` for nulo, ele é definido como `this` (o widget que chamou `dispatchEvent`). Isso permite dois cenários:

1. **`widget.dispatchEvent(event)`** com target não definido → target = widget, path sobe até root
2. **`root.handleKeyEvent(key)`** define `event.target = focusedWidget` → path de root até focusedWidget

---

### 5. Renderer — Diff Eficiente

O `Renderer` compara o estado atual do `Screen` com um snapshot anterior e só envia as células modificadas para o terminal, usando ANSI escape codes.

```
Renderer.render(screen):
  changes = screen.diff(prevSnapshot)   // apenas células alteradas
  ordenar changes por (y, x)           // top→bottom, left→right

  PARA cada cell em changes:
    SE célula atual é contígua (y=x+1, vertical) E mesmo estilo:
      agrupar → adiciona char ao buffer
    SENÃO:
      flush() → escreve buffer acumulado
      cursor(y, x) → move cursor ANSI
      SE estilo mudou:
        reset() → \x1b[0m
        styleToAnsi(cell) → aplica bold/fg/bg/underline via ANSI
      buffer = cell.char

  flush() → escreve último buffer

  prevSnapshot = screen.snapshot()  // salva para próxima render
```

Isso permite renderização incremental: apenas o que mudou desde o último frame é re-enviado ao terminal.

---

### 6. Gerenciamento de Foco (Focus Cycling)

```
Root.colectaFocusable():
  resultado = []
  walk(root, resultado):
    SE widget.focusable E widget != root:
      anexar widget a resultado
    PARA cada child: walk(child, resultado)
  retornar resultado

Root.focusNext():
  lista = colectaFocusable()
  SE lista vazia: retornar
  SE focusedWidget == null:
    focusedWidget = lista[0]
    focusedWidget.focus()
  SENÃO:
    idx = lista.indexOf(focusedWidget)
    próximo = lista[(idx + 1) % tamanho]
    focusedWidget.blur()
    focusedWidget = próximo
    próximo.focus()

Root.focusPrev() (análogo, mas índice decrementa):
    anterior = lista[(idx - 1 + tamanho) % tamanho]
```

---

## Resumo das Camadas

```
┌──────────────────────────────────────────────┐
│                  Demo / App                   │
│  (cria árvore de widgets, configura Root)     │
├──────────────────────────────────────────────┤
│                  Widget Tree                  │
│  Root → Container → Text / TextInput / ...    │
│  (gerencia hierarquia, renderFrame, eventos)  │
├──────────────────────────────────────────────┤
│               Event System                    │
│  UIEvent / KeyUIEvent (capture → target →    │
│  bubble, stopPropagation)                     │
├──────────────────────────────────────────────┤
│                Screen                         │
│  Grade de células, clip stack, diff/snapshot  │
├──────────────────────────────────────────────┤
│                Renderer                       │
│  ANSI escape codes, diff-based output         │
├──────────────────────────────────────────────┤
│                  TTY                          │
│  Leitura de teclas, resize, cursor, alt scr   │
└──────────────────────────────────────────────┘
```
