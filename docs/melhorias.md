# Melhorias de Performance — TUI

## Implementadas

### #1 — Remover `screen.fill` redundante em `Root.renderFrame`

**Arquivo:** `src/tui/root.ts:31-36`

**Problema:** `Root.renderFrame()` chamava `screen.clear()` (reseta toda a grade para o estado default) e imediatamente `screen.fill(0, 0, W, H, {})` (aplica `Object.assign` com objeto vazio em cada célula). Como `clear()` já setou cada célula para o default, o `fill` com `{}` era um **no-op O(W×H)**.

**Código antes:**

```typescript
renderFrame(): void {
  this._screen.clear();
  this._screen.fill(0, 0, this._screen.width, this._screen.height, {});
  super.renderFrame(this._screen);
  this._renderer?.render(this._screen);
}
```

**Código depois:**

```typescript
renderFrame(): void {
  this._screen.clear();
  super.renderFrame(this._screen);
  this._renderer?.render(this._screen);
}
```

**Impacto medido (vitest bench):**

| Cenário | Antes | Depois | Ganho |
|---------|------:|-------:|:------|
| Root vazio | 0.105ms (9,557 ops/s) | **0.088ms** (11,431 ops/s) | **1.20×** |
| VBox + 10 children | 0.288ms (3,467 ops/s) | **0.233ms** (4,285 ops/s) | **1.24×** |
| VBox + 100 children | 0.248ms (4,026 ops/s) | **0.200ms** (5,001 ops/s) | **1.24×** |

---

## Melhorias 2 e 3 — Análise e Projeto

### #2 — Cache da lista de widgets focusable em `Root`

**Arquivo:** `src/tui/root.ts:77-89`

**Problema:** `focusNext()` e `focusPrev()` chamam `collectFocusable()`, que percorre a **árvore inteira** depth-first toda vez que o usuário pressiona Tab. Para a maioria dos casos (10-100 widgets), o custo é desprezível (~0.05ms). Porém, para árvores com **milhares de nós**, a varredura começa a ficar perceptível.

**Cenários de medição:**

| Cenário | Tempo (mean) |
|---------|:------------:|
| focusNext — 10 focusable | 0.036ms |
| focusNext — 500 focusable | 0.108ms |
| focusNext wrap-around (500) | 0.112ms |

**Projeto da melhoria:**

Manter um array `_focusableCache: Widget[]` em `Root`, atualizado incrementalmente:

```typescript
class Root extends Widget {
  private _focusableCache: Widget[] | null = null;

  // Invalida o cache sempre que a árvore muda
  addChild(child: Widget): void {
    super.addChild(child);
    this._focusableCache = null;        // invalida
  }

  removeChild(child: Widget): void {
    super.removeChild(child);
    this._focusableCache = null;        // invalida
  }

  private collectFocusable(): Widget[] {
    if (this._focusableCache) return this._focusableCache;
    const result: Widget[] = [];
    this.walk(this, result);
    this._focusableCache = result;
    return result;
  }

  // ... focusNext, focusPrev usam collectFocusable normalmente
}
```

**Riscos:**
- Widgets podem ter `focusable` alterado em tempo de execução sem notificar Root — cache ficaria stale. Solução: expor método público `invalidateFocusCache()` para subclasses chamarem.
- `addChild` em `Widget` adiciona filho sem notificar Root. Seria necessário sobrescrever `addChild` em Root, ou fazer Widget notificar o root via `this.root`. Isso adiciona complexidade.

**Veredito:** Implementar apenas se houver necessidade real (árvores com 5k+ nós e foco frequentemente alternado). Para o uso atual, o custo de 0.1ms é aceitável.

---

### #3 — Caching de `absoluteBounds`

**Arquivo:** `src/tui/widget.ts:21-28`

**Problema:** `absoluteBounds` é calculado recursivamente **toda vez que é acessado**, percorrendo a cadeia de `parent` até a root e criando um novo objeto `Rect` a cada chamada. Durante `renderFrame`, cada widget na árvore chama `this.absoluteBounds` para obter sua posição absoluta e aplicar o clip. Para uma árvore de 500 níveis de profundidade, o custo total de renderização é:

| Profundidade | Tempo (mean) | Observação |
|:------------:|:------------:|:-----------|
| 0 (Root vazio) | 0.088ms | Sem recursão |
| 100 níveis | 2.729ms | 100 chamadas a absoluteBounds + 100 pushClip/popClip |
| 500 níveis | 4.289ms | 500 chamadas a absoluteBounds + 500 pushClip/popClip |

Note que esses valores incluem a construção da árvore, não apenas o renderFrame. O custo incremental de absoluteBounds por nível adicional é pequeno.

**Código atual:**

```typescript
get absoluteBounds(): Rect {
  if (!this.parent) {
    return { ...this.bounds };
  }
  const parentAbs = this.parent.absoluteBounds;
  return {
    x: parentAbs.x + this.bounds.x,
    y: parentAbs.y + this.bounds.y,
    width: this.bounds.width,
    height: this.bounds.height,
  };
}
```

**Projeto da melhoria:**

Adicionar cache sujo (dirty flag) ao Widget. Recalcular absoluteBounds apenas quando necessário:

```typescript
class Widget {
  private _absBoundsCache: Rect | null = null;
  private _boundsChanged = true;

  get absoluteBounds(): Rect {
    if (!this._boundsChanged && this._absBoundsCache) {
      return { ...this._absBoundsCache };
    }
    const result = this.calcAbsoluteBounds();
    this._absBoundsCache = result;
    this._boundsChanged = false;
    return { ...result };
  }

  private calcAbsoluteBounds(): Rect {
    if (!this.parent) return { ...this.bounds };
    const parentAbs = this.parent.absoluteBounds;
    return {
      x: parentAbs.x + this.bounds.x,
      y: parentAbs.y + this.bounds.y,
      width: this.bounds.width,
      height: this.bounds.height,
    };
  }

  // Chamado sempre que bounds muda
  set bounds(value: Rect) {
    this._bounds = value;
    this._boundsChanged = true;
  }

  // Ao adicionar filho, marca bounds de toda a subárvore como suja
  addChild(child): void {
    // ... lógica existente
    this.invalidateBounds();      // propaga para filhos
  }
}
```

**Desafios:**
1. **Propagação de invalidação:** Quando um widget pai muda de posição, todos os descendentes precisam ter seu cache invalidado. Isso requer propagar um sinal pela subárvore, que TEM CUSTO similar a recalcular absoluteBounds.
2. **Copiar vs. Referência:** O getter retorna `{ ...result }` (cópia) para evitar mutação externa — se cachear sem copiar, a mutação externa corrompe o cache.
3. **Complexidade adicional:** O código fica mais complexo com dirty flags, propagação, e casos de borda (ex: bounds mudam, mas ninguém leu absoluteBounds ainda).

**Veredito:** Para árvores típicas (< 1000 nós), o custo da recursão de absoluteBounds é irrelevante comparado ao `screen.clear()` (que varre 1920 células para 80×24). Implementar cache pode até piorar a performance devido ao overhead de invalidação. **Recomenda-se implementar apenas se houver profiling que mostre absoluteBounds como gargalo.**

---

## Resumo Priorizado

| # | Descrição | Impacto | Complexidade | Recomendação |
|:-:|-----------|:-------:|:------------:|:-------------|
| 1 | Remover fill redundante | **1.2×** no renderFrame | Mínima | **Implementado** |
| 2 | Cache de focusable list | ~0.05-0.1ms economizado (500 nós) | Média | Fazer quando houver árvores 5k+ |
| 3 | Cache de absoluteBounds | Marginal (profundidade 500: ~0.02ms/nível) | Alta | Fazer apenas se profiling indicar gargalo |

