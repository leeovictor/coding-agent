# Plano de Implementação — Node Tree para a TUI

## Objetivo

Adicionar um mecanismo de **árvore de widgets** (`node tree`) à TUI do dux, onde widgets são estruturados hierarquicamente com um widget base abstrato e um `Root` que contém toda a interface a ser renderizada.

## Abordagem

**TDD (Test-Driven Development)** para cada task: primeiro escrever os testes, depois a implementação, e verificar com `npm test` antes de passar para a próxima task.

## Convenções

- **Testes**: Vitest, arquivos em `test/tui/` com padrão `*.test.js`
- **Factory functions**: usar `createWidget()` (não `new Widget()`) — seguir o padrão do código existente
- **Implementação**: TypeScript em `src/tui/`
- **Verificação**: `npm test` ou `npx vitest run test/tui/<arquivo>`

---

## Task 1 — Screen: suporte a clip region

**Arquivos**: `src/tui/screen.ts` (modificar) + `test/tui/screen.test.js` (adicionar testes)

### Descrição

Adicionar `pushClip(x, y, w, h)` e `popClip()` à classe `Screen`. `setCell()` e `fill()` devem ignorar escritas fora da clip region ativa. Clips são aninháveis via pilha.

### API

```typescript
class Screen {
  pushClip(x: number, y: number, w: number, h: number): void;
  popClip(): void;
}
```

### Comportamento

| Método | Descrição |
|--------|-----------|
| `pushClip(x, y, w, h)` | Empilha uma região de corte. `setCell`/`fill` ignoram células fora desta região. |
| `popClip()` | Restaura a clip anterior. |
| `setCell(x, y, partial)` | Com clip ativo, células fora da clip são ignoradas (além do bounds check existente). |
| `fill(x, y, w, h, partial)` | Com clip ativo, o preenchimento é limitado à região da clip. |

### Casos de Teste

1. `setCell` respeita clip — célula dentro da clip é escrita, fora é ignorada
2. `fill` respeita clip — preenchimento limitado à região da clip
3. Múltiplos clips aninhados — o mais interno tem precedência
4. `popClip` restaura clip anterior
5. Sem clip ativo, comportamento não muda (draw em qualquer lugar permitido)
6. Clip com width/height zero não permite nenhuma escrita

### Critério de conclusão

`npx vitest run test/tui/screen.test.js` passa (testes novos + existentes).

---

## Task 2 — Base Widget class (árvore + renderFrame + absoluteBounds + hit test)

**Arquivos**: `src/tui/widget.ts` (criar) + `test/tui/widget.test.js` (criar)

### Descrição

Classe abstrata `Widget` que serve como base para todos os widgets. Implementa a árvore de widgets (parent/children), bounds relativos ao parent, cálculo de bounds absolutos, renderização com clip aninhada, e hit testing.

### API

```typescript
abstract class Widget {
  // Árvore
  parent: Widget | null;
  children: Widget[];
  addChild(child: Widget): void;
  removeChild(child: Widget): void;
  get root(): Widget;
  get isRoot(): boolean;

  // Bounds (relativos ao parent)
  bounds: { x: number; y: number; width: number; height: number };
  get absoluteBounds(): { x: number; y: number; width: number; height: number };

  // Ciclo de vida
  mounted: boolean;
  mount(): void;      // chamado ao ser adicionado à árvore
  unmount(): void;    // chamado ao ser removido da árvore

  // Render
  abstract render(screen: Screen): void;
  renderFrame(screen: Screen): void;  // pushClip → render() → renderChildren → popClip

  // Hit test
  findWidgetAt(x: number, y: number): Widget | null;

  // Foco
  focusable: boolean;
  focused: boolean;
  focus(): void;
  blur(): void;
}
```

### Casos de Teste

1. **Tree operations**: addChild define parent, removeChild limpa parent, children array mantido
2. **isRoot / root**: widget sem parent é root; widget em árvore retorna root correto
3. **absoluteBounds**: bounds absolutos refletem posição relativa + posição do parent na cadeia
4. **renderFrame**: chama render() no widget, depois renderFrame() nos children
5. **renderFrame aplica clip**: clip é push antes de render e pop depois
6. **mount/unmount**: chamados ao addChild/removeChild
7. **mount propaga para children**: ao adicionar widget com children, todos recebem mount
8. **findWidgetAt**: retorna o widget mais profundo nas coordenadas dadas
9. **findWidgetAt**: retorna null se fora dos bounds de todos os widgets
10. **findWidgetAt widgets sobrepostos**: retorna o último adicionado (topo)

### Critério de conclusão

`npx vitest run test/tui/widget.test.js` passa.

---

## Task 3 — Event system (eventos com capture + bubble)

**Arquivos**: `src/tui/events.ts` (criar) + `test/tui/events.test.js` (criar) + `src/tui/widget.ts` (adicionar dispatchEvent)

### Descrição

Sistema de eventos que propaga pela árvore em 3 fases: **capture** (root → target), **target** (no widget alvo), e **bubble** (target → root). Qualquer widget pode parar a propagação com `stopPropagation()`.

### API

```typescript
class UIEvent {
  readonly type: string;
  target: Widget | null;
  currentTarget: Widget | null;
  phase: 'capture' | 'target' | 'bubble';
  propagationStopped: boolean;
  defaultPrevented: boolean;

  stopPropagation(): void;
  preventDefault(): void;
}

class KeyUIEvent extends UIEvent {
  readonly keyEvent: import('./types.js').KeyEvent;
}

// Em Widget:
abstract class Widget {
  dispatchEvent(event: UIEvent): void;  // inicia propagação na subárvore
  // hooks que subclasses sobrescrevem:
  onEvent(event: UIEvent): void;
  onKeyEvent(event: KeyUIEvent): void;
}
```

Fluxo do `dispatchEvent`:
1. Percorre da **root** até o **target** (capture phase), chamando `onEvent` em cada widget
2. Chama `onEvent` no **target** (target phase)
3. Percorre do **target** de volta até a **root** (bubble phase), chamando `onEvent`

### Casos de Teste

1. Event passa por capture phase (root → ... → target)
2. Event passa por target phase
3. Event passa por bubble phase (target → ... → root)
4. `stopPropagation()` no capture phase: não chega ao target nem bubble
5. `stopPropagation()` no target phase: não bubble
6. `stopPropagation()` no bubble phase: não continua subindo
7. Event.type é preservado
8. `target` e `currentTarget` são corretos em cada fase

### Critério de conclusão

`npx vitest run test/tui/events.test.js` + `npx vitest run test/tui/widget.test.js` passam.

---

## Task 4 — Root widget (render loop + foco + eventos de teclado)

**Arquivos**: `src/tui/root.ts` (criar) + `test/tui/root.test.js` (criar)

### Descrição

Widget `Root` que gerencia o ciclo de renderização, redimensionamento, foco e roteamento de eventos de teclado pela árvore.

### API

```typescript
class Root extends Widget {
  constructor(options: {
    tty?: TTY;              // opcional — para testes sem TTY real
    screen: Screen;
    renderer?: Renderer;    // opcional — para testes sem output real
  });

  // Render loop
  renderFrame(): void;      // clear → fill background → super.renderFrame() → renderer.render()

  // Foco
  focusedWidget: Widget | null;
  focusNext(): void;        // Tab: avança para próximo focusable
  focusPrev(): void;        // Shift+Tab: volta para focusable anterior

  // Eventos (chamado externamente)
  handleKeyEvent(keyEvent: KeyEvent): void;  // dispatch via árvore com capture+bubble

  // Resize
  handleResize(width: number, height: number): void;  // redimensiona screen
}
```

### Comportamento

- `renderFrame()`: limpa o Screen, pinta fundo, chama `super.renderFrame(screen)` para renderizar toda a árvore, depois chama `renderer.render(screen)` para output ANSI
- `handleKeyEvent(keyEvent)`: cria um `KeyUIEvent`, define o `target` como `focusedWidget`, e chama `dispatchEvent(event)` na root
- `focusNext()` / `focusPrev()`: percorre a árvore (depth-first) coletando widgets `focusable`, e alterna o foco
- `handleResize(width, height)`: chama `screen.resize(width, height)`

### Casos de Teste

1. **renderFrame**: chama render em toda a árvore (verificar que children são chamados)
2. **renderFrame**: clear + fill background + renderer.render são chamados (com mock)
3. **handleKeyEvent**: cria KeyUIEvent e dispatch pela árvore
4. **handleKeyEvent**: dispara capture → target(focused) → bubble
5. **handleKeyEvent**: focusedWidget recebe o evento
6. **focusNext**: avança para próximo widget focusable na ordem depth-first
7. **focusNext**: wrap-around (volta ao primeiro após o último)
8. **focusPrev**: retrocede no ciclo
9. **focusNext com apenas 1 focusable**: mantém nele
10. **handleResize**: screen.resize é chamado com novas dimensões
11. **handleResize**: dimensões são obtidas do tty (se tty presente)

### Critério de conclusão

`npx vitest run test/tui/root.test.js` passa.

---

## Task 5 — Layout containers (VBox, HBox, Stack)

**Arquivos**: `src/tui/containers.ts` (criar) + `test/tui/containers.test.js` (criar)

### Descrição

Widgets container que posicionam children automaticamente.

### API

```typescript
class VBox extends Widget {
  // Distribui children verticalmente, cada child com altura igual a
  // Math.floor(containerHeight / numChildren), e largura = containerWidth
  // position: (0, 0), (0, childHeight), (0, 2*childHeight), ...
}

class HBox extends Widget {
  // Distribui children horizontalmente, cada child com largura igual a
  // Math.floor(containerWidth / numChildren), e altura = containerHeight
  // position: (0, 0), (childWidth, 0), (2*childWidth, 0), ...
}

class Stack extends Widget {
  // Todos os children em (0, 0) com largura = containerWidth, altura = containerHeight
  // Útil para sobreposição de camadas
}
```

### Comportamento

- Containers recalcularam bounds dos children a cada `renderFrame()` (ou via método `layout()`)
- Children que não cabem (sum das larguras/alturas excede container) são truncados
- Container sem children: render normal, sem erro

### Casos de Teste

1. **VBox**: distribui 3 children com alturas iguais
2. **VBox**: child ocupa largura total do container
3. **VBox**: 1 child ocupa altura total do container
4. **VBox**: children posicionados em y: 0, childH, 2*childH, ...
5. **HBox**: distribui 3 children com larguras iguais
6. **HBox**: children posicionados em x: 0, childW, 2*childW, ...
7. **Stack**: todos children em (0,0) com bounds iguais ao container
8. **Container vazio**: render não quebra
9. **Container com muitos children**: trunca (floor) alturas/larguras
10. **Containers aninhados**: VBox dentro de HBox funciona

### Critério de conclusão

`npx vitest run test/tui/containers.test.js` passa.

---

## Task 6 — Migrar Text widget para a árvore

**Arquivos**: `src/tui/widgets/text.ts` (modificar) + `test/tui/widgets/text.test.js` (atualizar)

### Descrição

`Text` passa a estender `Widget` em vez de ser uma classe standalone. O posicionamento passa a ser via `bounds` (relativo ao parent) em vez de `_x`/`_y` separados.

### Mudanças

- `Text extends Widget`
- `bounds` (relativo ao parent) substitui `_x`/`_y`
- `move(x, y)` atualiza `bounds.x`/`bounds.y`
- `render()` usa coordenadas absolutas obtidas via `this.absoluteBounds`
- Construtor recebe `x`, `y`, `width`, `height` (bounds)
- Demais métodos (`setContent`, `get content`, `get style`) mantidos

### Casos de Teste (atualizar existentes + novos)

1. Testes existentes de `createText` continuam passando (compatibilidade)
2. `render` em árvore com clip respeita bounds do parent
3. `absoluteBounds` reflete posição correta na árvore
4. `move` atualiza bounds corretamente

### Critério de conclusão

`npx vitest run test/tui/widgets/text.test.js` passa com todos os testes (novos + existentes).

---

## Task 7 — Migrar TextInput widget para a árvore

**Arquivos**: `src/tui/widgets/text-input.ts` (modificar) + `test/tui/widgets/text-input.test.js` (criar)

### Descrição

`TextInput` passa a estender `Widget`. Usa o sistema de foco do `Widget` (em vez de `_focused` próprio) e processa eventos de teclado via `onKeyEvent()` do sistema de eventos (em vez de `handleKey()` direto).

### Mudanças

- `TextInput extends Widget`
- `bounds` substitui `_x`/`_y`/`_width`
- `focusable = true`
- `focus()`/`blur()` usam o sistema do Widget (que informa a Root)
- `onKeyEvent(event: KeyUIEvent)` substitui `handleKey(key: KeyEvent)`
- Construtor recebe `x`, `y`, `width` via bounds

### Casos de Teste

1. Renderiza corretamente em árvore com clip
2. `onKeyEvent` processa teclas (backspace, delete, setas, chars, etc.)
3. `onKeyEvent` com evento não consumido retorna (não crasha)
4. Foco: `focus()`/`blur()` funcionam via sistema do Widget
5. `absoluteBounds` correto

### Critério de conclusão

`npx vitest run test/tui/widgets/text-input.test.js` passa.

---

## Task 8 — Atualizar demo + teste de integração

**Arquivos**: `src/tui/tui-demo/demo.ts` (modificar) + `test/tui/integration.test.js` (criar)

### Descrição

Atualizar a demo para usar `Root` + widget tree com containers. Criar um teste de integração que verifica o funcionamento completo da árvore.

### Demo

```typescript
// Estrutura da demo:
// Root
//   VBox
//     Text (título)
//     Text (info de tamanho)
//     TextInput
//     Text (valor digitado)
//     Text (help)
```

### Teste de integração

1. Criar Root com Screen (sem TTY/Renderer real — mocks ou Screen apenas)
2. Adicionar árvore de widgets (Text, TextInput)
3. Chamar `renderFrame()`
4. Verificar que todos os widgets renderizaram no Screen
5. Simular resize e verificar relayout
6. Simular key events e verificar propagação

### Critério de conclusão

`npx vitest run test/tui/integration.test.js` passa + demo roda sem erros com `npm run dev:tui`.

---

## Resumo das Tasks

| # | Task | Arquivos Novo/Modificado | Testes |
|---|------|--------------------------|--------|
| 1 | Screen clip | `src/tui/screen.ts` | `test/tui/screen.test.js` (+ existentes) |
| 2 | Base Widget | `src/tui/widget.ts` | `test/tui/widget.test.js` |
| 3 | Event system | `src/tui/events.ts`, `src/tui/widget.ts` | `test/tui/events.test.js`, `test/tui/widget.test.js` |
| 4 | Root widget | `src/tui/root.ts` | `test/tui/root.test.js` |
| 5 | Containers | `src/tui/containers.ts` | `test/tui/containers.test.js` |
| 6 | Migrate Text | `src/tui/widgets/text.ts` | `test/tui/widgets/text.test.js` (+ existentes) |
| 7 | Migrate TextInput | `src/tui/widgets/text-input.ts` | `test/tui/widgets/text-input.test.js` |
| 8 | Demo + integração | `src/tui/tui-demo/demo.ts` | `test/tui/integration.test.js` |

## Como verificar cada task

```bash
# Executar testes de uma task específica
npx vitest run test/tui/<arquivo>.test.js

# Executar todos os testes TUI
npx vitest run test/tui/

# Rodar demo
npm run dev:tui
```
