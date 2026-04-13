# Web Sprite — Development Guidelines

## Drawing Tool Rules

All drawing tools MUST respect these systems:

### Symmetry / Mirroring
- When symmetry is enabled (X and/or Y axis), every pixel drawn must be mirrored.
- Use `mirrorPixelAt(layer.data, x, y)` after setting a pixel to copy its FINAL state to all mirrored positions.
- When removing a pixel (e.g. pixel-perfect L-corner removal, eraser), also call `mirrorPixelAt` so the removal is mirrored.
- For shape tools using `getMirroredPositions()`, compute mirrored start/end points and draw the full shape at each position.
- For flood fill, fill at each mirrored click position separately.
- Mirror formula: `mx = Math.round(2 * axis - x - 1)` for X axis, same pattern for Y.

### Tiling / Wrapping
- When Tile X or Tile Y is enabled, drawing wraps around canvas edges.
- Use `wrapPixel(px, py, width, height)` to wrap coordinates. Returns null if the pixel is out of bounds on a non-tiled axis.
- `screenToCanvas()` wraps coordinates so clicking on any tiled copy maps to the correct pixel.
- `stampPixel`, `saveUnderStamp`, `restoreUnderStamp` all use `wrapPixel` internally.
- Flood fill uses `floodFillWrapped()` when tiling is active — neighbors wrap across edges.

### Pixel-Perfect Mode
- Only applies to freehand pen/eraser at brush size 1.
- Uses a rolling buffer of prev/current/next points.
- When current point forms an L-shape with neighbors (shares axis with both but they're diagonal), restore the saved pixels underneath it.
- After stamping or restoring, call `mirrorPixelAt` for symmetry.
- L-shape detection: `isLShape(prev, curr, next)` — curr shares an axis with prev AND next, but prev and next are diagonal to each other.

### Undo
- Every drawing operation must save a full layer snapshot (`strokeBeforeRef`) before the first pixel change.
- On pointer up, push an undo snapshot with the before/after data.
- Every state change that affects the canvas visually must increment `renderVersion` via `markDirty()` or including `renderVersion: s.renderVersion + 1` in `updateDoc()`.

### Adding New Tools
1. Add the tool type to `ToolType` union in `editor-store.ts`.
2. Add it to `DRAW_TOOLS` in `ToolPanel.tsx` and `App.tsx` (mobile hotbar).
3. Handle it in `Canvas.tsx` pointer handlers — follow the pattern of existing tools.
4. Ensure it respects symmetry (mirror), tiling (wrap), and undo (snapshots).
5. Add keyboard shortcut in `MenuBar.tsx`.

## State Management
- The canvas render loop only redraws when `renderVersion` changes.
- Layer operations (add, delete, reorder, visibility, opacity, blend mode) must bump `renderVersion`.
- Zustand subscriptions: never subscribe to the full store from UI components — use selectors to avoid re-render storms.
- `storeRef.current` pattern for Canvas/MenuBar to access latest state without re-renders.

## File Formats
- `.wsprite`: custom binary format with ZLIB-compressed pixel data per layer.
- `.wsprite.png`: upscaled PNG with steganographic `.wsprite` data hidden in LSBs.
- `.hex`: plain text palette format, one hex color per line.
