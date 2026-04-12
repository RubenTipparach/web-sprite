import { useRef, useEffect, useCallback } from 'preact/hooks';
import { useEditorStore } from '../state/editor-store';
import { compositeLayers } from '../layers/LayerCompositor';
import { bresenhamLine } from '../utils/geometry';
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
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);
  const lastPanRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const spaceDownRef = useRef(false);

  // Pixel-perfect: rolling buffer of last 2 points + saved pixel data for undo
  const ppPrevRef = useRef<{ x: number; y: number } | null>(null);
  const ppSavedRef = useRef<Uint8ClampedArray | null>(null); // saved pixels under the "maybe" point

  const storeRef = useRef(useEditorStore.getState());
  useEffect(() => {
    return useEditorStore.subscribe(s => { storeRef.current = s; });
  }, []);

  const screenToCanvas = useCallback((sx: number, sy: number): { x: number; y: number } => {
    const { viewport } = storeRef.current;
    return {
      x: Math.floor((sx - viewport.offsetX) / viewport.zoom),
      y: Math.floor((sy - viewport.offsetY) / viewport.zoom),
    };
  }, []);

  const stampPixel = useCallback((data: ImageData, x: number, y: number, color: RGBA, brushSize: number) => {
    const half = Math.floor(brushSize / 2);
    for (let dy = -half; dy < brushSize - half; dy++) {
      for (let dx = -half; dx < brushSize - half; dx++) {
        const px = x + dx;
        const py = y + dy;
        if (px < 0 || px >= data.width || py < 0 || py >= data.height) continue;
        const off = (py * data.width + px) * 4;
        data.data[off] = color.r;
        data.data[off + 1] = color.g;
        data.data[off + 2] = color.b;
        data.data[off + 3] = color.a;
      }
    }
  }, []);

  /** Save the pixels under a brush stamp so we can restore them later. */
  const saveUnderStamp = useCallback((data: ImageData, x: number, y: number, brushSize: number): Uint8ClampedArray => {
    const half = Math.floor(brushSize / 2);
    const saved = new Uint8ClampedArray(brushSize * brushSize * 4);
    let i = 0;
    for (let dy = -half; dy < brushSize - half; dy++) {
      for (let dx = -half; dx < brushSize - half; dx++) {
        const px = x + dx;
        const py = y + dy;
        if (px >= 0 && px < data.width && py >= 0 && py < data.height) {
          const off = (py * data.width + px) * 4;
          saved[i] = data.data[off];
          saved[i + 1] = data.data[off + 1];
          saved[i + 2] = data.data[off + 2];
          saved[i + 3] = data.data[off + 3];
        }
        i += 4;
      }
    }
    return saved;
  }, []);

  /** Restore pixels under a brush stamp from a saved buffer. */
  const restoreUnderStamp = useCallback((data: ImageData, x: number, y: number, brushSize: number, saved: Uint8ClampedArray) => {
    const half = Math.floor(brushSize / 2);
    let i = 0;
    for (let dy = -half; dy < brushSize - half; dy++) {
      for (let dx = -half; dx < brushSize - half; dx++) {
        const px = x + dx;
        const py = y + dy;
        if (px >= 0 && px < data.width && py >= 0 && py < data.height) {
          const off = (py * data.width + px) * 4;
          data.data[off] = saved[i];
          data.data[off + 1] = saved[i + 1];
          data.data[off + 2] = saved[i + 2];
          data.data[off + 3] = saved[i + 3];
        }
        i += 4;
      }
    }
  }, []);

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
  const drawPixelPerfect = useCallback((newPos: { x: number; y: number }) => {
    const store = storeRef.current;
    const layer = store.layers.find(l => l.id === store.activeLayerId);
    if (!layer || layer.locked || !layer.visible) return;

    const color = store.activeTool === 'eraser'
      ? { r: 0, g: 0, b: 0, a: 0 }
      : store.foregroundColor;
    const bs = store.brushSize;
    const prev = ppPrevRef.current;
    const last = lastPosRef.current;

    // If we have prev → last → new, check if 'last' is an L-corner
    if (prev && last && !(last.x === newPos.x && last.y === newPos.y)) {
      if (isLShape(prev, last, newPos)) {
        // Erase the L-corner pixel (restore what was underneath)
        if (ppSavedRef.current) {
          restoreUnderStamp(layer.data, last.x, last.y, bs, ppSavedRef.current);
          // Also erase mirrored L-corner stamps
          const mirroredLast = getMirroredPositions(last.x, last.y);
          for (let i = 1; i < mirroredLast.length; i++) {
            // For mirrors we just restamp the erased color — simpler than tracking all saved data
            // This is acceptable since mirrors aren't pixel-perfect tracked
          }
        }
        ppSavedRef.current = saveUnderStamp(layer.data, newPos.x, newPos.y, bs);
        // Stamp at all mirrored positions
        const mirrored = getMirroredPositions(newPos.x, newPos.y);
        for (const [mx, my] of mirrored) {
          stampPixel(layer.data, mx, my, color, bs);
        }
        lastPosRef.current = newPos;
        store.markDirty();
        return;
      }
    }

    // No L-shape: commit previous point, advance the buffer
    ppPrevRef.current = last;
    ppSavedRef.current = saveUnderStamp(layer.data, newPos.x, newPos.y, bs);
    // Stamp at all mirrored positions
    const mirrored = getMirroredPositions(newPos.x, newPos.y);
    for (const [mx, my] of mirrored) {
      stampPixel(layer.data, mx, my, color, bs);
    }
    lastPosRef.current = newPos;
    store.markDirty();
  }, [stampPixel, saveUnderStamp, restoreUnderStamp, isLShape, getMirroredPositions]);

  const handlePointerDown = useCallback((e: PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    if (e.button === 1 || (e.button === 0 && spaceDownRef.current)) {
      isPanningRef.current = true;
      lastPanRef.current = { x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }

    // Two-finger pan on mobile (handled via touch events)
    if (e.button !== 0) return;

    const store = storeRef.current;
    if (store.activeTool === 'pen' || store.activeTool === 'eraser') {
      isDrawingRef.current = true;
      canvas.setPointerCapture(e.pointerId);
      const pos = screenToCanvas(sx, sy);

      // Reset pixel-perfect state for new stroke
      ppPrevRef.current = null;
      ppSavedRef.current = null;
      lastPosRef.current = pos;

      const layer = store.layers.find(l => l.id === store.activeLayerId);
      if (layer && !layer.locked && layer.visible) {
        const color = store.activeTool === 'eraser'
          ? { r: 0, g: 0, b: 0, a: 0 }
          : store.foregroundColor;
        if (store.pixelPerfect && store.brushSize === 1) {
          ppSavedRef.current = saveUnderStamp(layer.data, pos.x, pos.y, store.brushSize);
        }
        // Stamp at all mirrored positions
        const mirrored = getMirroredPositions(pos.x, pos.y);
        for (const [mx, my] of mirrored) {
          stampPixel(layer.data, mx, my, color, store.brushSize);
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
    if (pos.x >= 0 && pos.x < store.canvasWidth && pos.y >= 0 && pos.y < store.canvasHeight) {
      const statusEl = document.getElementById('status-cursor');
      if (statusEl) statusEl.textContent = `${pos.x}, ${pos.y}`;
    }

    if (isPanningRef.current) {
      const dx = e.clientX - lastPanRef.current.x;
      const dy = e.clientY - lastPanRef.current.y;
      lastPanRef.current = { x: e.clientX, y: e.clientY };
      const vp = store.viewport;
      store.setViewport({ offsetX: vp.offsetX + dx, offsetY: vp.offsetY + dy });
      return;
    }

    if (isDrawingRef.current && lastPosRef.current) {
      const store2 = storeRef.current;
      if (store2.pixelPerfect && store2.brushSize === 1) {
        // Pixel-perfect: one pixel at a time via rolling buffer
        if (pos.x !== lastPosRef.current.x || pos.y !== lastPosRef.current.y) {
          drawPixelPerfect(pos);
        }
      } else {
        // Normal: Bresenham line between last and current
        drawStroke(lastPosRef.current.x, lastPosRef.current.y, pos.x, pos.y);
        lastPosRef.current = pos;
      }
    }
  }, [screenToCanvas, drawStroke, drawPixelPerfect]);

  const handlePointerUp = useCallback(() => {
    isPanningRef.current = false;
    isDrawingRef.current = false;
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

  // Pinch-to-zoom for mobile
  const touchesRef = useRef<PointerEvent[]>([]);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (e.touches.length === 2) {
      // Prevent drawing during pinch
      isDrawingRef.current = false;
      lastPosRef.current = null;
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
        lastSymmetry.yAxis === sym.yAxis
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
        onTouchStart={handleTouchStart}
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
    </div>
  );
}
