import { useRef, useEffect, useCallback } from 'preact/hooks';
import { useEditorStore } from '../state/editor-store';
import { compositeLayers } from '../layers/LayerCompositor';
import { bresenhamLine } from '../utils/geometry';
import { clamp } from '../utils/geometry';
import type { RGBA } from '../utils/color';

// Zoom steps for scroll zooming
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
  const cursorPosRef = useRef<{ x: number; y: number }>({ x: -1, y: -1 });

  // Store snapshot to access state without triggering re-renders
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

  const setPixel = useCallback((data: ImageData, x: number, y: number, color: RGBA, brushSize: number) => {
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

  const drawStroke = useCallback((x0: number, y0: number, x1: number, y1: number) => {
    const store = storeRef.current;
    const layer = store.layers.find(l => l.id === store.activeLayerId);
    if (!layer || layer.locked || !layer.visible) return;

    const color = store.activeTool === 'eraser'
      ? { r: 0, g: 0, b: 0, a: 0 }
      : store.foregroundColor;

    const points = bresenhamLine(x0, y0, x1, y1);
    for (const [px, py] of points) {
      setPixel(layer.data, px, py, color, store.brushSize);
    }
    store.markDirty();
  }, [setPixel]);

  const handlePointerDown = useCallback((e: PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    // Middle mouse or space+left = pan
    if (e.button === 1 || (e.button === 0 && spaceDownRef.current)) {
      isPanningRef.current = true;
      lastPanRef.current = { x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }

    if (e.button !== 0) return;

    const store = storeRef.current;
    if (store.activeTool === 'pen' || store.activeTool === 'eraser') {
      isDrawingRef.current = true;
      canvas.setPointerCapture(e.pointerId);
      const pos = screenToCanvas(sx, sy);
      lastPosRef.current = pos;

      // Save undo snapshot region (will be expanded in handlePointerUp)
      const layer = store.layers.find(l => l.id === store.activeLayerId);
      if (layer && !layer.locked && layer.visible) {
        const color = store.activeTool === 'eraser'
          ? { r: 0, g: 0, b: 0, a: 0 }
          : store.foregroundColor;
        setPixel(layer.data, pos.x, pos.y, color, store.brushSize);
        store.markDirty();
      }
    }
  }, [screenToCanvas, setPixel]);

  const handlePointerMove = useCallback((e: PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const pos = screenToCanvas(sx, sy);
    cursorPosRef.current = pos;

    // Update status bar cursor position
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
      drawStroke(lastPosRef.current.x, lastPosRef.current.y, pos.x, pos.y);
      lastPosRef.current = pos;
    }
  }, [screenToCanvas, drawStroke]);

  const handlePointerUp = useCallback((_e: PointerEvent) => {
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

  // Render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d')!;
    let offscreen = offscreenRef.current;

    const resizeObserver = new ResizeObserver(() => {
      const dpr = 1; // Keep 1:1 for pixel art
      canvas.width = container.clientWidth * dpr;
      canvas.height = container.clientHeight * dpr;
    });
    resizeObserver.observe(container);

    // Ensure initial size
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;

    let lastRenderVersion = -1;
    let lastViewport = { offsetX: -1, offsetY: -1, zoom: -1 };

    const render = () => {
      rafRef.current = requestAnimationFrame(render);
      const store = storeRef.current;
      const vp = store.viewport;

      // Only re-render if something changed
      if (
        lastRenderVersion === store.renderVersion &&
        lastViewport.offsetX === vp.offsetX &&
        lastViewport.offsetY === vp.offsetY &&
        lastViewport.zoom === vp.zoom
      ) return;

      lastRenderVersion = store.renderVersion;
      lastViewport = { ...vp };

      const w = store.canvasWidth;
      const h = store.canvasHeight;

      // Ensure offscreen canvas exists at the right size
      if (!offscreen || offscreen.width !== w || offscreen.height !== h) {
        offscreen = document.createElement('canvas');
        offscreen.width = w;
        offscreen.height = h;
        offscreenRef.current = offscreen;
      }

      // Composite layers → offscreen
      const composite = compositeLayers(store.layers, w, h);
      const offCtx = offscreen.getContext('2d')!;
      offCtx.putImageData(composite, 0, 0);

      // Clear visible canvas
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw sprite scaled
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(
        offscreen,
        vp.offsetX, vp.offsetY,
        w * vp.zoom, h * vp.zoom,
      );

      // Draw pixel grid when zoomed in enough
      if (vp.zoom >= 6) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 0; x <= w; x++) {
          const sx = Math.round(vp.offsetX + x * vp.zoom) + 0.5;
          if (sx >= 0 && sx <= canvas.width) {
            ctx.moveTo(sx, Math.max(0, vp.offsetY));
            ctx.lineTo(sx, Math.min(canvas.height, vp.offsetY + h * vp.zoom));
          }
        }
        for (let y = 0; y <= h; y++) {
          const sy = Math.round(vp.offsetY + y * vp.zoom) + 0.5;
          if (sy >= 0 && sy <= canvas.height) {
            ctx.moveTo(Math.max(0, vp.offsetX), sy);
            ctx.lineTo(Math.min(canvas.width, vp.offsetX + w * vp.zoom), sy);
          }
        }
        ctx.stroke();
      }

      // Draw canvas border
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 1;
      ctx.strokeRect(
        vp.offsetX - 0.5, vp.offsetY - 0.5,
        w * vp.zoom + 1, h * vp.zoom + 1,
      );
    };

    rafRef.current = requestAnimationFrame(render);

    // Key listeners
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
      style={{
        gridArea: 'canvas',
        overflow: 'hidden',
        cursor: spaceDownRef.current ? 'grab' : 'crosshair',
        touchAction: 'none',
      }}
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
