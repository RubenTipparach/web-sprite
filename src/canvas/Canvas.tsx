import { useRef, useEffect, useCallback } from 'preact/hooks';
import { useEditorStore } from '../state/editor-store';
import { compositeLayers } from '../layers/LayerCompositor';
import { bresenhamLine, circlePixels, ellipsePixels, rectPixels, floodFill, floodFillWrapped } from '../utils/geometry';
import type { RGBA } from '../utils/color';

const ZOOM_STEPS = [1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 32, 48, 64];

function nearestZoomStep(current: number, direction: number): number {
  if (direction > 0) {
    return ZOOM_STEPS.find(z => z > current) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1];
  }
  return [...ZOOM_STEPS].reverse().find(z => z < current) ?? ZOOM_STEPS[0];
}

export function Canvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number>(0);
  const isPanningRef = useRef(false);
  const isDrawingRef = useRef(false);
  const isSelectingRef = useRef(false);
  const isDraggingSelRef = useRef(false);
  const selStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);
  const lastPanRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const spaceDownRef = useRef(false);
  const marchOffsetRef = useRef(0);
  const cursorCanvasRef = useRef<{ x: number; y: number }>({ x: -100, y: -100 });

  // Multi-touch tracking for pinch-zoom + two-finger pan
  const activeTouchesRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStartDistRef = useRef(0);
  const pinchStartZoomRef = useRef(1);
  const pinchCenterRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Undo tracking: capture "before" snapshot of full layer at stroke start
  const strokeLayerIdRef = useRef<string | null>(null);
  const strokeBeforeRef = useRef<Uint8ClampedArray | null>(null);

  // Shape tools (line, rect, circle): track start point and preview state
  const shapeStartRef = useRef<{ x: number; y: number } | null>(null);
  const isShapingRef = useRef(false);

  // Pixel-perfect: independent rolling buffers for primary + each mirror axis
  // Each buffer tracks its own prev/last/saved for L-shape detection
  const ppBuffersRef = useRef<{
    prev: { x: number; y: number } | null;
    last: { x: number; y: number } | null;
    saved: Uint8ClampedArray | null;
  }[]>([]);

  const storeRef = useRef(useEditorStore.getState());
  useEffect(() => {
    return useEditorStore.subscribe(s => { storeRef.current = s; });
  }, []);

  const screenToCanvas = useCallback((sx: number, sy: number): { x: number; y: number } => {
    const { viewport, canvasWidth, canvasHeight, tileX, tileY } = storeRef.current;
    let cx = Math.floor((sx - viewport.offsetX) / viewport.zoom);
    let cy = Math.floor((sy - viewport.offsetY) / viewport.zoom);
    // Wrap coordinates when tiling — clicking on a tile copy maps to the original
    if (tileX && canvasWidth > 0) cx = ((cx % canvasWidth) + canvasWidth) % canvasWidth;
    if (tileY && canvasHeight > 0) cy = ((cy % canvasHeight) + canvasHeight) % canvasHeight;
    return { x: cx, y: cy };
  }, []);

  /** Wrap a pixel coordinate into canvas bounds when tiling is enabled. */
  const wrapPixel = useCallback((px: number, py: number, w: number, h: number): [number, number] | null => {
    const { tileX, tileY } = storeRef.current;
    let wx = px, wy = py;
    if (tileX) wx = ((px % w) + w) % w;
    else if (px < 0 || px >= w) return null;
    if (tileY) wy = ((py % h) + h) % h;
    else if (py < 0 || py >= h) return null;
    return [wx, wy];
  }, []);

  /** Brush masks matching Aseprite's circle brush at each size.
   * Small sizes are hardcoded for pixel-accuracy. Larger sizes
   * generated with filled midpoint circle scanline fill.
   */
  const brushMaskCache = useRef<Map<number, boolean[]>>(new Map());

  const getBrushMask = useCallback((size: number): boolean[] => {
    if (brushMaskCache.current.has(size)) return brushMaskCache.current.get(size)!;

    // Hardcoded masks for small sizes (match Aseprite exactly)
    const MASKS: Record<number, string[]> = {
      1: ['X'],
      2: ['XX',
          'XX'],
      3: ['.X.',
          'XXX',
          '.X.'],
      4: ['.XX.',
          'XXXX',
          'XXXX',
          '.XX.'],
      5: ['.XXX.',
          'XXXXX',
          'XXXXX',
          'XXXXX',
          '.XXX.'],
      6: ['.XXXX.',
          'XXXXXX',
          'XXXXXX',
          'XXXXXX',
          'XXXXXX',
          '.XXXX.'],
      7: ['..XXX..',
          '.XXXXX.',
          'XXXXXXX',
          'XXXXXXX',
          'XXXXXXX',
          '.XXXXX.',
          '..XXX..'],
      8: ['..XXXX..',
          '.XXXXXX.',
          'XXXXXXXX',
          'XXXXXXXX',
          'XXXXXXXX',
          'XXXXXXXX',
          '.XXXXXX.',
          '..XXXX..'],
      9: ['...XXX...',
          '.XXXXXXX.',
          '.XXXXXXX.',
          'XXXXXXXXX',
          'XXXXXXXXX',
          'XXXXXXXXX',
          '.XXXXXXX.',
          '.XXXXXXX.',
          '...XXX...'],
      10: ['...XXXX...',
           '.XXXXXXXX.',
           '.XXXXXXXX.',
           'XXXXXXXXXX',
           'XXXXXXXXXX',
           'XXXXXXXXXX',
           'XXXXXXXXXX',
           '.XXXXXXXX.',
           '.XXXXXXXX.',
           '...XXXX...'],
    };

    if (MASKS[size]) {
      const rows = MASKS[size];
      const mask = new Array(size * size).fill(false);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          mask[y * size + x] = rows[y][x] === 'X';
        }
      }
      brushMaskCache.current.set(size, mask);
      return mask;
    }

    // For sizes > 10, generate using filled circle scanlines
    const mask = new Array(size * size).fill(false);
    const r = (size - 1) / 2;
    const cx = r, cy = r;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= r * r + r * 0.5) {
          mask[y * size + x] = true;
        }
      }
    }
    brushMaskCache.current.set(size, mask);
    return mask;
  }, []);

  const inBrush = useCallback((dx: number, dy: number, brushSize: number): boolean => {
    if (brushSize <= 2) return true;
    const half = Math.floor(brushSize / 2);
    const mx = dx + half;
    const my = dy + half;
    if (mx < 0 || mx >= brushSize || my < 0 || my >= brushSize) return false;
    return getBrushMask(brushSize)[my * brushSize + mx];
  }, [getBrushMask]);

  const stampPixel = useCallback((data: ImageData, x: number, y: number, color: RGBA, brushSize: number) => {
    const half = Math.floor(brushSize / 2);
    for (let dy = -half; dy < brushSize - half; dy++) {
      for (let dx = -half; dx < brushSize - half; dx++) {
        if (!inBrush(dx, dy, brushSize)) continue;
        const wrapped = wrapPixel(x + dx, y + dy, data.width, data.height);
        if (!wrapped) continue;
        const off = (wrapped[1] * data.width + wrapped[0]) * 4;
        data.data[off] = color.r;
        data.data[off + 1] = color.g;
        data.data[off + 2] = color.b;
        data.data[off + 3] = color.a;
      }
    }
  }, [wrapPixel, inBrush]);

  /** Save the pixels under a brush stamp so we can restore them later. */
  const saveUnderStamp = useCallback((data: ImageData, x: number, y: number, brushSize: number): Uint8ClampedArray => {
    const half = Math.floor(brushSize / 2);
    const saved = new Uint8ClampedArray(brushSize * brushSize * 4);
    let i = 0;
    for (let dy = -half; dy < brushSize - half; dy++) {
      for (let dx = -half; dx < brushSize - half; dx++) {
        if (inBrush(dx, dy, brushSize)) {
          const wrapped = wrapPixel(x + dx, y + dy, data.width, data.height);
          if (wrapped) {
            const off = (wrapped[1] * data.width + wrapped[0]) * 4;
            saved[i] = data.data[off];
            saved[i + 1] = data.data[off + 1];
            saved[i + 2] = data.data[off + 2];
            saved[i + 3] = data.data[off + 3];
          }
        }
        i += 4;
      }
    }
    return saved;
  }, [wrapPixel, inBrush]);

  /** Restore pixels under a brush stamp from a saved buffer. */
  const restoreUnderStamp = useCallback((data: ImageData, x: number, y: number, brushSize: number, saved: Uint8ClampedArray) => {
    const half = Math.floor(brushSize / 2);
    let i = 0;
    for (let dy = -half; dy < brushSize - half; dy++) {
      for (let dx = -half; dx < brushSize - half; dx++) {
        if (inBrush(dx, dy, brushSize)) {
          const wrapped = wrapPixel(x + dx, y + dy, data.width, data.height);
          if (wrapped) {
            const off = (wrapped[1] * data.width + wrapped[0]) * 4;
            data.data[off] = saved[i];
            data.data[off + 1] = saved[i + 1];
            data.data[off + 2] = saved[i + 2];
            data.data[off + 3] = saved[i + 3];
          }
        }
        i += 4;
      }
    }
  }, [wrapPixel, inBrush]);

  /** Check if three points form an L-shape (the middle one is the corner). */
  const isLShape = useCallback((
    prev: { x: number; y: number },
    curr: { x: number; y: number },
    next: { x: number; y: number },
  ): boolean => {
    // curr shares an axis with prev AND shares an axis with next
    // BUT prev and next share neither axis (they're diagonal to each other)
    const sharesWithPrev = prev.x === curr.x || prev.y === curr.y;
    const sharesWithNext = next.x === curr.x || next.y === curr.y;
    const prevNextDiagonal = prev.x !== next.x && prev.y !== next.y;
    return sharesWithPrev && sharesWithNext && prevNextDiagonal;
  }, []);

  /** Get mirrored positions based on symmetry settings. Always includes the original. */
  const getMirroredPositions = useCallback((x: number, y: number): [number, number][] => {
    const { symmetry } = storeRef.current;
    const positions: [number, number][] = [[x, y]];
    if (symmetry.xEnabled) {
      const mx = Math.round(2 * symmetry.xAxis - x - 1);
      positions.push([mx, y]);
    }
    if (symmetry.yEnabled) {
      const my = Math.round(2 * symmetry.yAxis - y - 1);
      positions.push([x, my]);
    }
    if (symmetry.xEnabled && symmetry.yEnabled) {
      const mx = Math.round(2 * symmetry.xAxis - x - 1);
      const my = Math.round(2 * symmetry.yAxis - y - 1);
      positions.push([mx, my]);
    }
    return positions;
  }, []);


  const drawStroke = useCallback((x0: number, y0: number, x1: number, y1: number) => {
    const store = storeRef.current;
    const layer = store.layers.find(l => l.id === store.activeLayerId);
    if (!layer || layer.locked || !layer.visible) return;

    const color = store.activeTool === 'eraser'
      ? { r: 0, g: 0, b: 0, a: 0 }
      : store.foregroundColor;

    // Get mirrored start/end pairs
    const starts = getMirroredPositions(x0, y0);
    const ends = getMirroredPositions(x1, y1);

    for (let i = 0; i < starts.length; i++) {
      const points = bresenhamLine(starts[i][0], starts[i][1], ends[i][0], ends[i][1]);
      for (const [px, py] of points) {
        stampPixel(layer.data, px, py, color, store.brushSize);
      }
    }
    store.markDirty();
  }, [stampPixel, getMirroredPositions]);

  /**
   * Pixel-perfect draw: uses a rolling buffer of the previous point.
   * When a new point arrives, check if the previous point forms an L-shape
   * between ppPrev and the new point. If so, erase it.
   * Note: pixel-perfect only applies to the primary stroke; mirrors use normal stamps.
   */
  /**
   * Pixel-perfect draw with independent L-detection for each mirror axis.
   * Each mirrored position maintains its own prev/last rolling buffer.
   */
  const drawPixelPerfect = useCallback((newPos: { x: number; y: number }) => {
    const store = storeRef.current;
    const layer = store.layers.find(l => l.id === store.activeLayerId);
    if (!layer || layer.locked || !layer.visible) return;

    const color = store.activeTool === 'eraser'
      ? { r: 0, g: 0, b: 0, a: 0 }
      : store.foregroundColor;
    const bs = store.brushSize;

    // Get all positions (primary + mirrors)
    const allPositions = getMirroredPositions(newPos.x, newPos.y);

    // Ensure we have a buffer for each position
    while (ppBuffersRef.current.length < allPositions.length) {
      ppBuffersRef.current.push({ prev: null, last: null, saved: null });
    }

    // Run pixel-perfect L-detection independently for each position
    for (let i = 0; i < allPositions.length; i++) {
      const [px, py] = allPositions[i];
      const buf = ppBuffersRef.current[i];

      if (buf.prev && buf.last && !(buf.last.x === px && buf.last.y === py)) {
        if (isLShape(buf.prev, buf.last, { x: px, y: py })) {
          // Remove L-corner at buf.last
          if (buf.saved) {
            restoreUnderStamp(layer.data, buf.last.x, buf.last.y, bs, buf.saved);
          }
          // ppPrev stays, stamp new position
          buf.saved = saveUnderStamp(layer.data, px, py, bs);
          stampPixel(layer.data, px, py, color, bs);
          buf.last = { x: px, y: py };
          continue;
        }
      }

      // No L-shape: advance the buffer
      buf.prev = buf.last;
      buf.saved = saveUnderStamp(layer.data, px, py, bs);
      stampPixel(layer.data, px, py, color, bs);
      buf.last = { x: px, y: py };
    }

    lastPosRef.current = newPos;
    store.markDirty();
  }, [stampPixel, saveUnderStamp, restoreUnderStamp, isLShape, getMirroredPositions]);

  /** Check if screen coordinates are within the sprite canvas area. */
  const isOnSprite = useCallback((sx: number, sy: number): boolean => {
    const { viewport, canvasWidth, canvasHeight } = storeRef.current;
    return (
      sx >= viewport.offsetX &&
      sx < viewport.offsetX + canvasWidth * viewport.zoom &&
      sy >= viewport.offsetY &&
      sy < viewport.offsetY + canvasHeight * viewport.zoom
    );
  }, []);

  const handlePointerDown = useCallback((e: PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    // Track touches for multi-touch gestures
    if (e.pointerType === 'touch') {
      activeTouchesRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      // Two or more fingers → pinch/pan mode, cancel any drawing
      if (activeTouchesRef.current.size >= 2) {
        isDrawingRef.current = false;
        isSelectingRef.current = false;
        lastPosRef.current = null;

        const touches = Array.from(activeTouchesRef.current.values());
        const dx = touches[1].x - touches[0].x;
        const dy = touches[1].y - touches[0].y;
        pinchStartDistRef.current = Math.sqrt(dx * dx + dy * dy);
        pinchStartZoomRef.current = storeRef.current.viewport.zoom;
        pinchCenterRef.current = {
          x: (touches[0].x + touches[1].x) / 2 - rect.left,
          y: (touches[0].y + touches[1].y) / 2 - rect.top,
        };
        lastPanRef.current = {
          x: (touches[0].x + touches[1].x) / 2,
          y: (touches[0].y + touches[1].y) / 2,
        };
        isPanningRef.current = true;
        canvas.setPointerCapture(e.pointerId);
        e.preventDefault();
        return;
      }

      // Single touch on empty space around sprite → pan
      if (!isOnSprite(sx, sy)) {
        isPanningRef.current = true;
        lastPanRef.current = { x: e.clientX, y: e.clientY };
        canvas.setPointerCapture(e.pointerId);
        e.preventDefault();
        return;
      }
    }

    if (e.button === 1 || (e.button === 0 && spaceDownRef.current)) {
      isPanningRef.current = true;
      lastPanRef.current = { x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }

    if (e.button !== 0) return;

    const store = storeRef.current;
    const pos = screenToCanvas(sx, sy);

    if (store.activeTool === 'selection') {
      canvas.setPointerCapture(e.pointerId);
      // Check if clicking inside existing selection to drag it
      const sel = store.selection;
      if (sel && store.floating &&
          pos.x >= sel.x && pos.x < sel.x + sel.w &&
          pos.y >= sel.y && pos.y < sel.y + sel.h) {
        isDraggingSelRef.current = true;
        lastPosRef.current = pos;
      } else {
        // Drop any floating selection first
        if (store.floating) store.dropFloating();
        // Start new rectangle selection
        isSelectingRef.current = true;
        selStartRef.current = pos;
        store.setSelection(null);
      }
      return;
    }

    // Fill tool — instant action on click
    if (store.activeTool === 'fill') {
      const layer = store.layers.find(l => l.id === store.activeLayerId);
      if (layer && !layer.locked && layer.visible) {
        strokeLayerIdRef.current = layer.id;
        strokeBeforeRef.current = new Uint8ClampedArray(layer.data.data);

        const color = store.foregroundColor;
        // Fill at all mirrored positions
        const positions = getMirroredPositions(pos.x, pos.y);
        for (const [mx, my] of positions) {
          const fillFn = (store.tileX || store.tileY) ? floodFillWrapped : floodFill;
          const pixels = (store.tileX || store.tileY)
            ? floodFillWrapped(
                layer.data.data, store.canvasWidth, store.canvasHeight,
                mx, my, color.r, color.g, color.b, color.a,
                store.tileX, store.tileY,
              )
            : floodFill(
                layer.data.data, store.canvasWidth, store.canvasHeight,
                mx, my, color.r, color.g, color.b, color.a,
              );
          for (const [fx, fy] of pixels) {
            const off = (fy * store.canvasWidth + fx) * 4;
            layer.data.data[off] = color.r;
            layer.data.data[off + 1] = color.g;
            layer.data.data[off + 2] = color.b;
            layer.data.data[off + 3] = color.a;
          }
        }
        store.markDirty();
        store.pushUndo({
          layerId: layer.id, x: 0, y: 0,
          w: store.canvasWidth, h: store.canvasHeight,
          before: strokeBeforeRef.current,
          after: new Uint8ClampedArray(layer.data.data),
        });
        strokeLayerIdRef.current = null;
        strokeBeforeRef.current = null;
      }
      return;
    }

    // Color replace tool — replace all pixels of clicked color with foreground color
    if (store.activeTool === 'colorReplace') {
      const layer = store.layers.find(l => l.id === store.activeLayerId);
      if (layer && !layer.locked && layer.visible) {
        strokeLayerIdRef.current = layer.id;
        strokeBeforeRef.current = new Uint8ClampedArray(layer.data.data);

        const d = layer.data.data;
        const w = store.canvasWidth;
        const h = store.canvasHeight;
        // Get the color at the clicked pixel
        const clickOff = (pos.y * w + pos.x) * 4;
        const tr = d[clickOff], tg = d[clickOff + 1], tb = d[clickOff + 2], ta = d[clickOff + 3];
        const fg = store.foregroundColor;
        // Don't replace if same color
        if (tr !== fg.r || tg !== fg.g || tb !== fg.b || ta !== fg.a) {
          // If a selection exists, limit replacement to that region
          const sel = store.selection;
          const x0 = sel ? sel.x : 0;
          const y0 = sel ? sel.y : 0;
          const x1 = sel ? sel.x + sel.w : w;
          const y1 = sel ? sel.y + sel.h : h;
          for (let py = y0; py < y1; py++) {
            for (let px = x0; px < x1; px++) {
              if (px < 0 || px >= w || py < 0 || py >= h) continue;
              const i = (py * w + px) * 4;
              if (d[i] === tr && d[i + 1] === tg && d[i + 2] === tb && d[i + 3] === ta) {
                d[i] = fg.r; d[i + 1] = fg.g; d[i + 2] = fg.b; d[i + 3] = fg.a;
              }
            }
          }
        }
        store.markDirty();
        store.pushUndo({
          layerId: layer.id, x: 0, y: 0, w, h,
          before: strokeBeforeRef.current,
          after: new Uint8ClampedArray(layer.data.data),
        });
        strokeLayerIdRef.current = null;
        strokeBeforeRef.current = null;
      }
      return;
    }

    // Shape tools (line, rect, circle) — start drag
    if (store.activeTool === 'line' || store.activeTool === 'rect' || store.activeTool === 'circle' || store.activeTool === 'ellipse') {
      canvas.setPointerCapture(e.pointerId);
      isShapingRef.current = true;
      shapeStartRef.current = pos;
      lastPosRef.current = pos;

      const layer = store.layers.find(l => l.id === store.activeLayerId);
      if (layer && !layer.locked && layer.visible) {
        strokeLayerIdRef.current = layer.id;
        strokeBeforeRef.current = new Uint8ClampedArray(layer.data.data);
      }
      return;
    }

    // Freehand tools (pen, eraser)
    if (store.activeTool === 'pen' || store.activeTool === 'eraser') {
      isDrawingRef.current = true;
      canvas.setPointerCapture(e.pointerId);

      // Reset all pixel-perfect buffers for new stroke
      ppBuffersRef.current = [];
      lastPosRef.current = pos;

      const layer = store.layers.find(l => l.id === store.activeLayerId);
      if (layer && !layer.locked && layer.visible) {
        strokeLayerIdRef.current = layer.id;
        strokeBeforeRef.current = new Uint8ClampedArray(layer.data.data);

        const color = store.activeTool === 'eraser'
          ? { r: 0, g: 0, b: 0, a: 0 }
          : store.foregroundColor;

        // Stamp at all mirrored positions and init pixel-perfect buffers
        const mirrored = getMirroredPositions(pos.x, pos.y);
        for (let i = 0; i < mirrored.length; i++) {
          const [mx, my] = mirrored[i];
          const saved = (store.pixelPerfect && store.brushSize === 1)
            ? saveUnderStamp(layer.data, mx, my, store.brushSize)
            : null;
          stampPixel(layer.data, mx, my, color, store.brushSize);
          ppBuffersRef.current.push({
            prev: null,
            last: { x: mx, y: my },
            saved,
          });
        }
        store.markDirty();
      }
    }
  }, [screenToCanvas, stampPixel, saveUnderStamp]);

  const handlePointerMove = useCallback((e: PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const pos = screenToCanvas(sx, sy);

    const store = storeRef.current;
    cursorCanvasRef.current = pos;
    if (pos.x >= 0 && pos.x < store.canvasWidth && pos.y >= 0 && pos.y < store.canvasHeight) {
      const statusEl = document.getElementById('status-cursor');
      if (statusEl) statusEl.textContent = `${pos.x}, ${pos.y}`;
    }

    // Update touch tracking
    if (e.pointerType === 'touch') {
      activeTouchesRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    // Two-finger pinch-zoom + pan
    if (e.pointerType === 'touch' && activeTouchesRef.current.size >= 2 && isPanningRef.current) {
      const touches = Array.from(activeTouchesRef.current.values());
      const dx = touches[1].x - touches[0].x;
      const dy = touches[1].y - touches[0].y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const center = {
        x: (touches[0].x + touches[1].x) / 2,
        y: (touches[0].y + touches[1].y) / 2,
      };

      // Pan
      const panDx = center.x - lastPanRef.current.x;
      const panDy = center.y - lastPanRef.current.y;
      lastPanRef.current = { x: center.x, y: center.y };

      // Zoom
      if (pinchStartDistRef.current > 0) {
        const scale = dist / pinchStartDistRef.current;
        const newZoom = Math.max(1, Math.min(64, Math.round(pinchStartZoomRef.current * scale)));
        const cx = center.x - rect.left;
        const cy = center.y - rect.top;

        if (newZoom !== store.viewport.zoom) {
          store.zoomTo(newZoom, cx, cy);
        }
      }

      // Apply pan offset
      const vp = store.viewport;
      store.setViewport({ offsetX: vp.offsetX + panDx, offsetY: vp.offsetY + panDy });
      return;
    }

    if (isPanningRef.current) {
      const pdx = e.clientX - lastPanRef.current.x;
      const pdy = e.clientY - lastPanRef.current.y;
      lastPanRef.current = { x: e.clientX, y: e.clientY };
      const vp = store.viewport;
      store.setViewport({ offsetX: vp.offsetX + pdx, offsetY: vp.offsetY + pdy });
      return;
    }

    // Shape tool preview: restore before, draw preview shape
    if (isShapingRef.current && shapeStartRef.current && strokeBeforeRef.current) {
      const layer = store.layers.find(l => l.id === strokeLayerIdRef.current);
      if (layer) {
        // Restore original pixels
        layer.data.data.set(strokeBeforeRef.current);
        // Draw preview shape at all mirrored positions
        const color = store.foregroundColor;
        const s = shapeStartRef.current;

        const mirroredStarts = getMirroredPositions(s.x, s.y);
        const mirroredEnds = getMirroredPositions(pos.x, pos.y);

        for (let mi = 0; mi < mirroredStarts.length; mi++) {
          const [sx, sy] = mirroredStarts[mi];
          const [ex, ey] = mirroredEnds[mi];
          let pts: [number, number][] = [];
          if (store.activeTool === 'line') {
            pts = bresenhamLine(sx, sy, ex, ey);
          } else if (store.activeTool === 'rect') {
            pts = rectPixels(sx, sy, ex, ey);
          } else if (store.activeTool === 'circle') {
            const drx = Math.abs(ex - sx);
            const dry = Math.abs(ey - sy);
            const r = Math.round(Math.sqrt(drx * drx + dry * dry));
            pts = circlePixels(sx, sy, r);
          } else if (store.activeTool === 'ellipse') {
            const drx = Math.abs(ex - sx);
            const dry = Math.abs(ey - sy);
            pts = ellipsePixels(sx, sy, drx, dry);
          }
          for (const [px, py] of pts) {
            stampPixel(layer.data, px, py, color, store.brushSize);
          }
        }
        store.markDirty();
      }
      lastPosRef.current = pos;
      return;
    }

    if (isSelectingRef.current) {
      const x0 = Math.min(selStartRef.current.x, pos.x);
      const y0 = Math.min(selStartRef.current.y, pos.y);
      const x1 = Math.max(selStartRef.current.x, pos.x);
      const y1 = Math.max(selStartRef.current.y, pos.y);
      store.setSelection({ x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 });
      return;
    }

    if (isDraggingSelRef.current && lastPosRef.current) {
      const dx = pos.x - lastPosRef.current.x;
      const dy = pos.y - lastPosRef.current.y;
      if (dx !== 0 || dy !== 0) {
        store.moveFloating(dx, dy);
        lastPosRef.current = pos;
      }
      return;
    }

    if (isDrawingRef.current && lastPosRef.current) {
      const store2 = storeRef.current;
      if (store2.pixelPerfect && store2.brushSize === 1) {
        // Pixel-perfect: process each pixel via rolling buffer
        // If touch/mouse skipped pixels, interpolate with Bresenham
        // and feed each point through L-detection one at a time
        if (pos.x !== lastPosRef.current.x || pos.y !== lastPosRef.current.y) {
          const dx = Math.abs(pos.x - lastPosRef.current.x);
          const dy = Math.abs(pos.y - lastPosRef.current.y);
          if (dx <= 1 && dy <= 1) {
            // Adjacent pixel — process directly
            drawPixelPerfect(pos);
          } else {
            // Multi-pixel jump — interpolate and process each point
            const intermediates = bresenhamLine(
              lastPosRef.current.x, lastPosRef.current.y,
              pos.x, pos.y,
            );
            // Skip first point (it's the current lastPos, already drawn)
            for (let i = 1; i < intermediates.length; i++) {
              drawPixelPerfect({ x: intermediates[i][0], y: intermediates[i][1] });
            }
          }
        }
      } else {
        // Normal: Bresenham line between last and current
        drawStroke(lastPosRef.current.x, lastPosRef.current.y, pos.x, pos.y);
        lastPosRef.current = pos;
      }
    }
  }, [screenToCanvas, drawStroke, drawPixelPerfect]);

  const handlePointerUp = useCallback((e: PointerEvent) => {
    // Remove from touch tracking
    if (e.pointerType === 'touch') {
      activeTouchesRef.current.delete(e.pointerId);
    }

    // Push undo snapshot when freehand stroke or shape tool ends
    if ((isDrawingRef.current || isShapingRef.current) && strokeLayerIdRef.current && strokeBeforeRef.current) {
      const store = storeRef.current;
      const layer = store.layers.find(l => l.id === strokeLayerIdRef.current);
      if (layer) {
        const w = store.canvasWidth;
        const h = store.canvasHeight;
        store.pushUndo({
          layerId: strokeLayerIdRef.current,
          x: 0, y: 0, w, h,
          before: strokeBeforeRef.current,
          after: new Uint8ClampedArray(layer.data.data),
        });
      }
      strokeLayerIdRef.current = null;
      strokeBeforeRef.current = null;
    }

    isShapingRef.current = false;
    shapeStartRef.current = null;

    if (isSelectingRef.current) {
      isSelectingRef.current = false;
      const store = storeRef.current;
      if (store.selection && store.selection.w > 0 && store.selection.h > 0) {
        store.liftSelection();
      }
    }
    isPanningRef.current = false;
    isDrawingRef.current = false;
    isDraggingSelRef.current = false;
    lastPosRef.current = null;
  }, []);

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const store = storeRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    const direction = e.deltaY < 0 ? 1 : -1;
    const newZoom = nearestZoomStep(store.viewport.zoom, direction);
    store.zoomTo(newZoom, sx, sy);
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.code === 'Space') {
      spaceDownRef.current = true;
      e.preventDefault();
    }
  }, []);

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    if (e.code === 'Space') {
      spaceDownRef.current = false;
    }
  }, []);

  // Render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d')!;
    let offscreen = offscreenRef.current;

    // Ensure canvas always matches container size
    const syncSize = () => {
      const w = Math.max(1, container.clientWidth);
      const h = Math.max(1, container.clientHeight);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    };

    const resizeObserver = new ResizeObserver(syncSize);
    resizeObserver.observe(container);
    syncSize();

    let lastRenderVersion = -1;
    let lastViewport = { offsetX: NaN, offsetY: NaN, zoom: NaN };
    let lastCanvasW = 0;
    let lastCanvasH = 0;
    let lastSymmetry = { xEnabled: false, yEnabled: false, xAxis: NaN, yAxis: NaN };

    const render = () => {
      rafRef.current = requestAnimationFrame(render);

      // Always re-sync size in RAF to catch edge cases
      syncSize();

      const store = storeRef.current;
      const vp = store.viewport;
      const sym = store.symmetry;

      if (
        lastRenderVersion === store.renderVersion &&
        lastViewport.offsetX === vp.offsetX &&
        lastViewport.offsetY === vp.offsetY &&
        lastViewport.zoom === vp.zoom &&
        lastCanvasW === canvas.width &&
        lastCanvasH === canvas.height &&
        lastSymmetry.xEnabled === sym.xEnabled &&
        lastSymmetry.yEnabled === sym.yEnabled &&
        lastSymmetry.xAxis === sym.xAxis &&
        lastSymmetry.yAxis === sym.yAxis &&
        !store.selection && // always re-render during selection (marching ants)
        !store.tileX && !store.tileY && // re-render when tiling
        !(store.activeTool === 'pen' || store.activeTool === 'eraser' ||
          store.activeTool === 'line' || store.activeTool === 'rect' ||
          store.activeTool === 'circle' || store.activeTool === 'ellipse') // brush outline
      ) return;

      lastSymmetry = { ...sym };

      lastRenderVersion = store.renderVersion;
      lastViewport = { ...vp };
      lastCanvasW = canvas.width;
      lastCanvasH = canvas.height;

      const w = store.canvasWidth;
      const h = store.canvasHeight;

      if (!offscreen || offscreen.width !== w || offscreen.height !== h) {
        offscreen = document.createElement('canvas');
        offscreen.width = w;
        offscreen.height = h;
        offscreenRef.current = offscreen;
      }

      const composite = compositeLayers(store.layers, w, h);
      const offCtx = offscreen.getContext('2d')!;
      offCtx.putImageData(composite, 0, 0);

      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(
        offscreen,
        vp.offsetX, vp.offsetY,
        w * vp.zoom, h * vp.zoom,
      );

      // Tiling preview — draw repeated copies around the main sprite
      const tileX = store.tileX;
      const tileY = store.tileY;
      if (tileX || tileY) {
        ctx.globalAlpha = store.tileSolid ? 1.0 : 0.4;
        const tw = w * vp.zoom;
        const th = h * vp.zoom;
        const rangeX = tileX ? Math.ceil(canvas.width / tw) + 1 : 0;
        const rangeY = tileY ? Math.ceil(canvas.height / th) + 1 : 0;
        for (let dy = -rangeY; dy <= rangeY; dy++) {
          for (let dx = -rangeX; dx <= rangeX; dx++) {
            if (dx === 0 && dy === 0) continue; // skip the main one
            if (!tileX && dx !== 0) continue;
            if (!tileY && dy !== 0) continue;
            ctx.drawImage(
              offscreen,
              vp.offsetX + dx * tw,
              vp.offsetY + dy * th,
              tw, th,
            );
          }
        }
        ctx.globalAlpha = 1.0;
      }

      if (vp.zoom >= 6) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        const minX = Math.max(0, Math.floor(-vp.offsetX / vp.zoom));
        const maxX = Math.min(w, Math.ceil((canvas.width - vp.offsetX) / vp.zoom));
        const minY = Math.max(0, Math.floor(-vp.offsetY / vp.zoom));
        const maxY = Math.min(h, Math.ceil((canvas.height - vp.offsetY) / vp.zoom));

        for (let x = minX; x <= maxX; x++) {
          const sx = Math.round(vp.offsetX + x * vp.zoom) + 0.5;
          ctx.moveTo(sx, Math.max(0, vp.offsetY));
          ctx.lineTo(sx, Math.min(canvas.height, vp.offsetY + h * vp.zoom));
        }
        for (let y = minY; y <= maxY; y++) {
          const sy = Math.round(vp.offsetY + y * vp.zoom) + 0.5;
          ctx.moveTo(Math.max(0, vp.offsetX), sy);
          ctx.lineTo(Math.min(canvas.width, vp.offsetX + w * vp.zoom), sy);
        }
        ctx.stroke();
      }

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 1;
      ctx.strokeRect(
        vp.offsetX - 0.5, vp.offsetY - 0.5,
        w * vp.zoom + 1, h * vp.zoom + 1,
      );

      // Draw symmetry guide lines — bright and visible
      if (sym.xEnabled) {
        const sx = Math.round(vp.offsetX + sym.xAxis * vp.zoom) + 0.5;
        // Draw shadow for contrast
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.lineWidth = 3;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx, canvas.height);
        ctx.stroke();
        // Draw bright blue line
        ctx.strokeStyle = '#4ac3ff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx, canvas.height);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (sym.yEnabled) {
        const sy = Math.round(vp.offsetY + sym.yAxis * vp.zoom) + 0.5;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.lineWidth = 3;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.moveTo(0, sy);
        ctx.lineTo(canvas.width, sy);
        ctx.stroke();
        ctx.strokeStyle = '#4ac3ff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, sy);
        ctx.lineTo(canvas.width, sy);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Draw floating selection on canvas
      const floating = store.floating;
      if (floating) {
        const fx = vp.offsetX + floating.x * vp.zoom;
        const fy = vp.offsetY + floating.y * vp.zoom;
        const fw = floating.data.width * vp.zoom;
        const fh = floating.data.height * vp.zoom;
        // Create temp canvas for floating pixels
        const fCanvas = document.createElement('canvas');
        fCanvas.width = floating.data.width;
        fCanvas.height = floating.data.height;
        const fCtx = fCanvas.getContext('2d')!;
        fCtx.putImageData(floating.data, 0, 0);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(fCanvas, fx, fy, fw, fh);
      }

      // Draw selection rectangle (marching ants)
      const sel = store.selection;
      if (sel && sel.w > 0 && sel.h > 0) {
        const sx0 = vp.offsetX + sel.x * vp.zoom;
        const sy0 = vp.offsetY + sel.y * vp.zoom;
        const sw = sel.w * vp.zoom;
        const sh = sel.h * vp.zoom;

        marchOffsetRef.current = (marchOffsetRef.current + 0.2) % 12;

        // Black background stroke
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.lineDashOffset = 0;
        ctx.strokeRect(sx0 + 0.5, sy0 + 0.5, sw - 1, sh - 1);
        // White foreground stroke (offset for marching effect)
        ctx.strokeStyle = '#fff';
        ctx.lineDashOffset = -marchOffsetRef.current;
        ctx.strokeRect(sx0 + 0.5, sy0 + 0.5, sw - 1, sh - 1);
        ctx.setLineDash([]);
        ctx.lineDashOffset = 0;
      }

      // Draw brush cursor outline
      const cursorPos = cursorCanvasRef.current;
      const tool = store.activeTool;
      if ((tool === 'pen' || tool === 'eraser' || tool === 'line' ||
           tool === 'rect' || tool === 'circle' || tool === 'ellipse') &&
          cursorPos.x >= 0 && cursorPos.x < w && cursorPos.y >= 0 && cursorPos.y < h) {
        const bs = store.brushSize;
        const half = Math.floor(bs / 2);

        if (bs <= 2) {
          // Small brushes: square outline
          const bx = cursorPos.x - half;
          const by = cursorPos.y - half;
          const screenX = vp.offsetX + bx * vp.zoom;
          const screenY = vp.offsetY + by * vp.zoom;
          const screenW = bs * vp.zoom;
          const screenH = bs * vp.zoom;
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
          ctx.lineWidth = 1;
          ctx.strokeRect(Math.round(screenX) - 0.5, Math.round(screenY) - 0.5, Math.round(screenW) + 1, Math.round(screenH) + 1);
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
          ctx.strokeRect(Math.round(screenX) + 0.5, Math.round(screenY) + 0.5, Math.round(screenW) - 1, Math.round(screenH) - 1);
        } else {
          // Larger brushes: draw outline around each pixel in the circular brush
          const r = bs / 2;
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          for (let dy = -half; dy < bs - half; dy++) {
            for (let dx = -half; dx < bs - half; dx++) {
              if ((dx + 0.5) * (dx + 0.5) + (dy + 0.5) * (dy + 0.5) > r * r) continue;
              const px = cursorPos.x + dx;
              const py = cursorPos.y + dy;
              const sx = vp.offsetX + px * vp.zoom;
              const sy2 = vp.offsetY + py * vp.zoom;
              // Only draw edge pixels (where at least one neighbor is outside the brush)
              const isEdge =
                !((dx-1+0.5)*(dx-1+0.5)+(dy+0.5)*(dy+0.5) <= r*r) ||
                !((dx+1+0.5)*(dx+1+0.5)+(dy+0.5)*(dy+0.5) <= r*r) ||
                !((dx+0.5)*(dx+0.5)+(dy-1+0.5)*(dy-1+0.5) <= r*r) ||
                !((dx+0.5)*(dx+0.5)+(dy+1+0.5)*(dy+1+0.5) <= r*r);
              if (isEdge) {
                ctx.rect(Math.round(sx) + 0.5, Math.round(sy2) + 0.5, Math.round(vp.zoom) - 1, Math.round(vp.zoom) - 1);
              }
            }
          }
          ctx.stroke();
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
          ctx.stroke();
        }
      }
    };

    rafRef.current = requestAnimationFrame(render);

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      cancelAnimationFrame(rafRef.current);
      resizeObserver.disconnect();
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [handleKeyDown, handleKeyUp]);

  return (
    <div
      ref={containerRef}
      class="canvas-container"
      style={{ touchAction: 'none' }}
    >
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onWheel={handleWheel}
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
    </div>
  );
}
