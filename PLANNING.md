# Web Sprite Editor — Planning Document

A browser-based sprite editor built in TypeScript, inspired by Aseprite. Features layer-based editing, essential drawing tools, a custom binary file format, and palette management powered by Lospec.

---

## 1. Tech Stack

| Concern | Choice | Rationale |
|---|---|---|
| Language | TypeScript (strict) | Type safety for binary format work and complex canvas state |
| Build tool | Vite | Fast HMR, native TS support, easy plugin authoring for build-time scripts |
| Rendering | HTML5 Canvas (2D context) | Direct pixel manipulation; no WebGL overhead for 2D sprite work |
| UI framework | Preact | Lightweight (~3 KB), JSX ergonomics, fast enough for tool panels |
| State management | Zustand | Minimal boilerplate, works well with Preact, supports middleware (undo/redo) |
| Testing | Vitest | Native Vite integration, fast, TypeScript-first |
| Styling | CSS Modules | Scoped styles, no runtime cost |
| Binary I/O | Custom `DataView` helpers | Required for .wsprite and .aseprite read/write |

---

## 2. Project Structure

```
web-sprite/
├── public/
│   └── palettes/                  # Build-time generated palette JSON files
├── src/
│   ├── main.ts                    # Entry point, mount app
│   ├── App.tsx                    # Root component, layout shell
│   ├── state/
│   │   ├── editor-store.ts        # Zustand store — canvas, layers, tools, history
│   │   └── palette-store.ts       # Active palette, palette list
│   ├── canvas/
│   │   ├── Canvas.tsx             # Main canvas component (Preact)
│   │   ├── CanvasRenderer.ts      # Composites layers → visible canvas
│   │   ├── PixelGrid.ts           # Grid overlay rendering
│   │   └── ViewportManager.ts     # Pan, zoom, coordinate transforms
│   ├── layers/
│   │   ├── Layer.ts               # Layer data model
│   │   ├── LayerCompositor.ts     # Blend modes, opacity, flatten
│   │   ├── LayerPanel.tsx         # Layer list UI (visibility, reorder, rename)
│   │   └── blend-modes.ts         # Blend mode implementations
│   ├── tools/
│   │   ├── Tool.ts                # Abstract tool interface
│   │   ├── PenTool.ts             # Freehand pixel drawing (Bresenham)
│   │   ├── EraserTool.ts          # Erase to transparent
│   │   ├── SelectionTool.ts       # Rectangular / freeform selection
│   │   ├── SelectionMask.ts       # Selection mask data structure
│   │   ├── ToolPanel.tsx          # Tool switcher UI
│   │   └── ToolOptions.tsx        # Per-tool options (size, shape, etc.)
│   ├── palette/
│   │   ├── PalettePanel.tsx       # Palette grid UI, swatch picker
│   │   ├── PaletteLoader.ts       # Load built-in + user palettes
│   │   └── hex-format.ts          # Import/export .hex files
│   ├── formats/
│   │   ├── wsprite/
│   │   │   ├── wsprite-format.ts  # .wsprite spec constants & types
│   │   │   ├── wsprite-read.ts    # Deserialize .wsprite
│   │   │   └── wsprite-write.ts   # Serialize .wsprite
│   │   ├── aseprite/
│   │   │   ├── aseprite-read.ts   # Import .aseprite/.ase files
│   │   │   └── aseprite-write.ts  # Export .aseprite/.ase files
│   │   └── png-export.ts          # Flatten & export as PNG
│   ├── history/
│   │   ├── UndoManager.ts         # Undo/redo stack with action coalescing
│   │   └── actions.ts             # Atomic undoable action types
│   ├── ui/
│   │   ├── MenuBar.tsx            # File / Edit / View menus
│   │   ├── StatusBar.tsx          # Cursor coords, zoom %, canvas size
│   │   ├── ColorPicker.tsx        # HSV/RGB color picker
│   │   └── Dialog.tsx             # Modal dialog base (new file, resize, etc.)
│   └── utils/
│       ├── binary.ts              # DataView read/write helpers
│       ├── color.ts               # RGBA conversion utilities
│       ├── geometry.ts            # Bresenham line, flood fill, rect ops
│       └── compression.ts         # ZLIB deflate/inflate wrappers (pako)
├── scripts/
│   └── fetch-lospec-palettes.ts   # Build-time script: fetch palettes → JSON
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── PLANNING.md
```

---

## 3. Core Architecture

### 3.1 Layer System (Primary Feature)

Layers are the most important architectural element. Every pixel operation targets the **active layer**, and the compositor flattens all visible layers for display.

#### Layer Data Model

```typescript
interface Layer {
  id: string;                    // UUID
  name: string;                  // User-visible name
  visible: boolean;
  locked: boolean;
  opacity: number;               // 0–255
  blendMode: BlendMode;          // Normal, Multiply, Screen, Overlay, etc.
  data: ImageData;               // Raw RGBA pixel buffer (same size as canvas)
  parent: string | null;         // Group layer ID, or null for root
}

type BlendMode =
  | 'normal' | 'multiply' | 'screen' | 'overlay'
  | 'darken' | 'lighten' | 'color-dodge' | 'color-burn'
  | 'hard-light' | 'soft-light' | 'difference' | 'exclusion';
```

#### Layer Operations

| Operation | Description |
|---|---|
| Add layer | Insert new transparent layer above active |
| Delete layer | Remove layer (with undo support) |
| Duplicate layer | Deep copy pixel data + properties |
| Reorder | Drag to reposition in stack |
| Merge down | Composite active into layer below |
| Flatten visible | Merge all visible → single layer |
| Group / ungroup | Nest layers in folder groups |
| Toggle visibility | Eye icon per layer |
| Lock | Prevent edits to layer |
| Rename | Double-click to rename |
| Opacity slider | Per-layer opacity control |
| Blend mode | Dropdown per layer |

#### Compositor Pipeline

```
For each pixel (x, y):
  result = transparent
  for layer in layers (bottom → top):
    if !layer.visible: skip
    pixel = layer.data[x, y]
    pixel.a *= layer.opacity / 255
    result = blend(result, pixel, layer.blendMode)
  output[x, y] = result
```

The compositor runs on every visual update. For performance:
- Only re-composite dirty rectangular regions
- Cache per-group composite results
- Use `requestAnimationFrame` to batch compositing

### 3.2 Tool System

Tools follow a common interface and are state-machine driven:

```typescript
interface Tool {
  name: string;
  icon: string;
  cursor: string;

  onPointerDown(ctx: ToolContext, e: PointerEvent): void;
  onPointerMove(ctx: ToolContext, e: PointerEvent): void;
  onPointerUp(ctx: ToolContext, e: PointerEvent): void;
  onKeyDown?(ctx: ToolContext, e: KeyboardEvent): void;

  getOptions(): ToolOption[];
}

interface ToolContext {
  activeLayer: Layer;
  canvas: HTMLCanvasElement;
  viewport: ViewportManager;
  color: RGBA;
  selection: SelectionMask | null;
  commit(action: UndoAction): void;
}
```

#### Pen Tool
- Bresenham line interpolation between pointer events (no gaps at high speed)
- Configurable brush size (1px, 3px, 5px, etc. — square or circle)
- Pixel-perfect mode: avoid L-shaped corners on diagonal strokes
- Respects active selection mask (only draws within selection)
- Draws on the active layer's `ImageData` directly

#### Eraser Tool
- Same interpolation as pen
- Sets pixels to `rgba(0, 0, 0, 0)` (transparent)
- Configurable size
- Respects selection mask

#### Selection Tool
- **Rectangular marquee**: click-drag to define rect
- **Add/subtract modes**: Shift to add, Alt to subtract from selection
- **Move selection**: drag inside selected region to move pixels
- **Selection operations**: Select All, Deselect, Invert (via menu/shortcuts)
- Marching ants animation on selection boundary
- Selection stored as a 1-bit mask (`Uint8Array`, same dimensions as canvas)

### 3.3 Viewport & Input

```typescript
interface ViewportState {
  offsetX: number;        // Pan offset in screen pixels
  offsetY: number;
  zoom: number;           // 1 = 100%, 2 = 200%, 0.5 = 50%
}
```

- **Zoom**: Mouse wheel / pinch, centered on cursor position. Snap to powers of 2 at high zoom.
- **Pan**: Middle-click drag or Space + left-click drag
- **Coordinates**: All tool inputs are transformed from screen → canvas pixel coordinates via the viewport
- **Pixel grid**: Rendered when zoom >= 4x (configurable)

---

## 4. File Formats

### 4.1 `.wsprite` — Custom Native Format

A binary format inspired by Aseprite's chunk-based design, but simplified for our scope. Little-endian byte order throughout.

#### File Header (64 bytes)

| Offset | Type | Field |
|---|---|---|
| 0 | `u32` | File size (bytes) |
| 4 | `u16` | Magic: `0x5753` ("WS") |
| 6 | `u16` | Format version (1) |
| 8 | `u16` | Canvas width (px) |
| 10 | `u16` | Canvas height (px) |
| 12 | `u16` | Layer count |
| 14 | `u16` | Color depth (32 = RGBA) |
| 16 | `u32` | Chunk count (total chunks in file) |
| 20 | `u8[44]` | Reserved (zero-filled) |

#### Chunks

Each chunk follows: `[u32 size] [u16 type] [u8[] data]`

| Chunk Type | ID | Contents |
|---|---|---|
| **Palette** | `0x0001` | `u16 colorCount`, then `colorCount × [u8 r, u8 g, u8 b, u8 a]` |
| **Layer** | `0x0002` | `u16 id`, `u16 parentId`, `u8 flags` (visible, locked), `u8 opacity`, `u8 blendMode`, `string name` |
| **Pixel Data** | `0x0003` | `u16 layerId`, `u16 x`, `u16 y`, `u16 w`, `u16 h`, `u8[] zlibData` (RGBA pixels, zlib-compressed) |
| **Selection** | `0x0004` | `u16 x`, `u16 y`, `u16 w`, `u16 h`, `u8[] maskData` (1-bit, zlib-compressed) |
| **Metadata** | `0x0005` | `string json` (arbitrary key-value metadata) |

Strings are encoded as: `u16 length`, then `length` UTF-8 bytes.

#### Design Decisions
- No animation/frame support in v1 (keeps it simple; can add frame chunks later)
- ZLIB compression for pixel data (same as Aseprite — use `pako` library)
- Chunk-based design allows forward compatibility (unknown chunks are skipped)

### 4.2 `.aseprite` / `.ase` — Import/Export

Based on the [official Aseprite file spec](https://github.com/aseprite/aseprite/blob/main/docs/ase-file-specs.md):

#### Import (Read)
1. Parse 128-byte header: magic `0xA5E0`, dimensions, color depth, frame count
2. Iterate frames → iterate chunks
3. Handle chunk types:
   - `0x2004` Layer: extract name, flags, blend mode, opacity, child level (for hierarchy)
   - `0x2005` Cel: layer index, position, compressed/raw pixel data
   - `0x2019` Palette: color entries with RGBA
4. Reconstruct layer stack from child-level nesting
5. For multi-frame files: import first frame only (v1), or all frames as separate layers

#### Export (Write)
1. Write 128-byte header with our canvas dimensions, RGBA color depth
2. Write single frame header
3. Write layer chunks (one per layer, ordered bottom→top, child level for groups)
4. Write cel chunks (compressed pixel data per layer)
5. Write palette chunk with active palette colors

#### Scope Limitations (v1)
- Animation frames: import first frame, export single frame
- Tilemaps: not supported
- Linked cels: treated as regular cels
- Color modes: only RGBA 32bpp (indexed/grayscale converted on import)

### 4.3 PNG Export

- Flatten all visible layers via the compositor
- Use `HTMLCanvasElement.toBlob('image/png')` for export
- Options: export active layer only, export with selection crop, scale multiplier (1x, 2x, 4x)

### 4.4 `.hex` Palette Import/Export

Format: plain text, one 6-character hex color per line (no `#` prefix, lowercase).

```
1a1c2c
5d275d
b13e53
ef7d57
```

- **Import**: Read text file, split by newline, parse each line as RGB, add alpha 255
- **Export**: Write each palette color as 6-char lowercase hex, one per line

---

## 5. Palette System — Lospec Integration

### 5.1 Build-Time Palette Fetching

A Vite build script (`scripts/fetch-lospec-palettes.ts`) runs at build time to fetch popular palettes from Lospec's API:

```
GET https://lospec.com/palette-list/load?page={n}&sortingType=downloads
```

**Strategy:**
1. Fetch top ~100 palettes by download count (10 pages × 10 per page)
2. For each palette, extract: `slug`, `title`, `numberOfColors`, `colors` array
3. Write to `public/palettes/lospec-palettes.json` as a static asset
4. Also generate individual `.hex` files in `public/palettes/hex/` for direct download

**Build-time JSON schema:**
```typescript
interface LospecPalette {
  slug: string;           // e.g. "sweetie-16"
  title: string;          // e.g. "Sweetie 16"
  author: string;         // e.g. "GrafxKid"
  colorCount: number;
  colors: string[];       // ["1a1c2c", "5d275d", ...]
}
```

### 5.2 Runtime Palette Management

- **Built-in palettes**: Loaded from the static JSON at startup
- **User palettes**: Created manually or imported from `.hex` files
- **Active palette**: Selected palette drives the color swatch grid
- **Palette panel UI**: Searchable grid, filter by color count, click swatch to set foreground color

---

## 6. Undo/Redo System

### Action-Based History

Each undoable operation records a snapshot of the affected region:

```typescript
interface UndoAction {
  type: string;                          // e.g. "draw", "erase", "layer-add"
  layerId: string;
  before: { x: number; y: number; w: number; h: number; data: Uint8ClampedArray };
  after:  { x: number; y: number; w: number; h: number; data: Uint8ClampedArray };
}
```

- **Region-based snapshots**: Only store the bounding rect of changed pixels (not full layer)
- **Stroke coalescing**: All pointer events within a single stroke → one undo action
- **Stack depth**: Configurable, default 50 steps
- **Layer operations**: Add/delete/reorder store full layer data as undo snapshots

---

## 7. Keyboard Shortcuts

| Action | Shortcut |
|---|---|
| Pen tool | `B` |
| Eraser | `E` |
| Selection | `M` |
| Undo | `Ctrl+Z` |
| Redo | `Ctrl+Shift+Z` |
| New layer | `Ctrl+Shift+N` |
| Delete layer | `Delete` (with confirm) |
| Select all | `Ctrl+A` |
| Deselect | `Ctrl+D` |
| Invert selection | `Ctrl+Shift+I` |
| Zoom in | `Ctrl+=` / scroll up |
| Zoom out | `Ctrl+-` / scroll down |
| Fit to window | `Ctrl+0` |
| Toggle grid | `Ctrl+'` |
| Save | `Ctrl+S` |
| Export PNG | `Ctrl+Shift+E` |

---

## 8. UI Layout

```
┌─────────────────────────────────────────────────────────┐
│  Menu Bar  [File] [Edit] [View] [Layer] [Help]          │
├───────┬─────────────────────────────────┬───────────────┤
│       │                                 │               │
│ Tool  │                                 │  Layers       │
│ Panel │        Canvas Viewport          │  Panel        │
│       │                                 │               │
│  [B]  │     (zoomable, pannable)        │  [eye] Lyr 3  │
│  [E]  │                                 │  [eye] Lyr 2  │
│  [M]  │                                 │  [eye] Lyr 1  │
│       │                                 │               │
│───────│                                 ├───────────────┤
│ Tool  │                                 │  Palette      │
│ Opts  │                                 │  Panel        │
│       │                                 │  [swatches]   │
├───────┴─────────────────────────────────┴───────────────┤
│  Status Bar: (32, 16) | Zoom: 800% | 64×64 | Layer: 1  │
└─────────────────────────────────────────────────────────┘
```

---

## 9. Implementation Phases

### Phase 1 — Foundation (MVP)
1. Project scaffolding: Vite + Preact + TypeScript + Zustand
2. Canvas rendering: viewport (pan/zoom), pixel grid overlay
3. Layer system: data model, compositor, add/delete/reorder/toggle visibility
4. Pen tool: Bresenham drawing on active layer
5. Eraser tool: transparent pixel painting
6. Layer panel UI: list, visibility toggles, active layer selection
7. Basic color picker (foreground/background color)

### Phase 2 — Selection & Palettes
1. Selection tool: rectangular marquee, marching ants
2. Selection operations: move, select all, deselect, invert
3. Lospec build script: fetch and bundle top palettes
4. Palette panel UI: swatch grid, palette switching
5. `.hex` import/export
6. Undo/redo system

### Phase 3 — File Formats
1. `.wsprite` format: write (save) and read (open)
2. PNG export (flatten visible layers)
3. `.aseprite` import (read layers, cels, palette)
4. `.aseprite` export (write single-frame with layers)

### Phase 4 — Polish
1. Blend modes (multiply, screen, overlay, etc.)
2. Layer groups (folders)
3. Layer opacity slider
4. Tool options panel (brush size, shape)
5. Menu bar with full keyboard shortcuts
6. Status bar (coordinates, zoom, canvas size)
7. New file / resize canvas dialogs
8. Pixel-perfect pen mode

---

## 10. Key Technical Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Canvas performance with many layers | Dirty-rect compositor, cache group composites, debounce re-renders |
| Large file sizes from uncompressed pixel data | ZLIB compression for all pixel data in file formats |
| Aseprite format complexity | Only support RGBA 32bpp, single frame in v1; skip tilemap/indexed chunks |
| Lospec API changes or rate limits | Fetch at build time only, cache results, ship fallback palette set |
| Undo/redo memory usage | Region-based snapshots (not full layer copies), configurable stack depth |
| Browser memory limits for large canvases | Cap max canvas size (e.g. 1024×1024 in v1), warn user |

---

## 11. Dependencies

```json
{
  "dependencies": {
    "preact": "^10.x",
    "zustand": "^4.x",
    "pako": "^2.x"
  },
  "devDependencies": {
    "typescript": "^5.x",
    "vite": "^5.x",
    "@preact/preset-vite": "^2.x",
    "vitest": "^1.x"
  }
}
```

- **pako**: ZLIB deflate/inflate for pixel data compression (`.wsprite`, `.aseprite`)
- No other runtime dependencies — keep the bundle lean

---

## 12. CI/CD — GitHub Actions & Pages Deployment

Every branch gets its own live preview deployment via GitHub Pages.

### Workflow: `.github/workflows/deploy.yml`

**Trigger**: Push to any branch.

**Steps**:
1. Checkout code
2. Install Node.js + dependencies (`npm ci`)
3. Run the Lospec palette fetch script (build-time)
4. Build with Vite (`vite build --base /<repo-name>/`)
5. Deploy `dist/` to GitHub Pages

**Branch strategy**: Each branch deploys to a sub-path so multiple branches can coexist:
- `main` → `https://<user>.github.io/web-sprite/`
- `feature/foo` → `https://<user>.github.io/web-sprite/branches/feature-foo/`

This uses the `actions/deploy-pages` action with a custom artifact per branch, or alternatively a single `gh-pages` branch with sub-directories per source branch.

### Vite Base Path

The `vite.config.ts` must set `base` dynamically based on the deployment target:

```typescript
export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  // ...
})
```

The CI workflow sets `VITE_BASE_PATH` based on the branch name.
