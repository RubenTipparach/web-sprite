import { useEffect, useRef } from 'preact/hooks';
import { MenuBar } from './ui/MenuBar';
import { TabBar } from './ui/TabBar';
import { StatusBar } from './ui/StatusBar';
import { Canvas } from './canvas/Canvas';
import { ToolPanel } from './tools/ToolPanel';
import { SymmetryPanel } from './tools/SymmetryPanel';
import { LayerPanel } from './layers/LayerPanel';
import { PalettePanel } from './palette/PalettePanel';
import { useEditorStore } from './state/editor-store';
import { usePaletteStore } from './state/palette-store';
import { useLayoutStore } from './state/layout-store';
import { ResizeHandle } from './ui/ResizeHandle';
import { MobilePanel } from './ui/MobilePanel';
import { ColorPreview } from './ui/ColorPreview';
import { useThemeStore, THEMES } from './state/theme-store';
import { loadAutoSave, startAutoSave } from './storage/local-storage';
import './styles/global.css';
import './styles/win95.css';
import './styles/winxp.css';
import './styles/aseprite.css';

export function App() {
  const newCanvas = useEditorStore(s => s.newCanvas);
  const isMobile = useLayoutStore(s => s.isMobile);
  const leftWidth = useLayoutStore(s => s.leftPanelWidth);
  const rightWidth = useLayoutStore(s => s.rightPanelWidth);
  const mobilePanel = useLayoutStore(s => s.mobileActivePanel);
  const setMobilePanel = useLayoutStore(s => s.setMobileActivePanel);
  const theme = useThemeStore(s => s.theme);

  // Apply theme CSS variables to root
  useEffect(() => {
    const vars = THEMES[theme];
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    for (const [key, value] of Object.entries(vars)) {
      root.style.setProperty(key, value);
    }
  }, [theme]);

  useEffect(() => {
    const loaded = loadAutoSave();
    if (!loaded) {
      newCanvas(32, 32);
    }
    // Load palettes on startup (not lazily from PalettePanel)
    usePaletteStore.getState().loadPalettes();
    const cleanup = startAutoSave();
    return cleanup;
  }, []);

  useEffect(() => {
    const update = () => useLayoutStore.getState().updateMobile();
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  if (isMobile) {
    return (
      <div class="app-layout-mobile">
        <MenuBar />
        <TabBar />
        <div class="mobile-canvas-area">
          <Canvas />
        </div>
        <ColorPreview />
        <MobileHotbar />
        <div class="mobile-toolbar">
          <MobileTabBar activePanel={mobilePanel} setPanel={setMobilePanel} />
        </div>
        <MobilePanel panel={mobilePanel} onClose={() => setMobilePanel(null)} />
        <StatusBar />
      </div>
    );
  }

  return (
    <div
      class="app-layout"
      style={{
        gridTemplateColumns: `${leftWidth}px 4px 1fr 4px ${rightWidth}px`,
      }}
    >
      <MenuBar />
      <TabBar />
      <div class="panel-left">
        <ToolPanel />
        <SymmetryPanel />
      </div>
      <ResizeHandle side="left" />
      <div class="canvas-area">
        <Canvas />
        <ColorPreview />
      </div>
      <ResizeHandle side="right" />
      <div class="panel-right">
        <LayerPanel />
        <PalettePanel />
      </div>
      <StatusBar />
    </div>
  );
}

const DRAW_TOOLS = ['pen', 'line', 'rect', 'circle', 'ellipse', 'fill', 'colorReplace'] as const;

/** Context-sensitive hotbar: shows sub-tools for the active tool group. */
function MobileHotbar() {
  const activeTool = useEditorStore(s => s.activeTool);
  const setTool = useEditorStore(s => s.setTool);
  const brushSize = useEditorStore(s => s.brushSize);
  const setBrushSize = useEditorStore(s => s.setBrushSize);
  const clearActiveLayer = useEditorStore(s => s.clearActiveLayer);
  const selection = useEditorStore(s => s.selection);
  const floating = useEditorStore(s => s.floating);
  const clipboard = useEditorStore(s => s.clipboard);

  const storeRef = useRef(useEditorStore.getState());
  useEffect(() => useEditorStore.subscribe(s => { storeRef.current = s; }), []);

  const isDraw = (DRAW_TOOLS as readonly string[]).includes(activeTool);
  const isEraser = activeTool === 'eraser';
  const isSelect = activeTool === 'selection';

  if (isDraw) {
    return (
      <div class="mobile-hotbar">
        {[
          { type: 'pen', icon: '\u270F\uFE0F', label: 'Pen' },
          { type: 'line', icon: '\u2571', label: 'Line' },
          { type: 'rect', icon: '\u25AD', label: 'Rect' },
          { type: 'circle', icon: '\u25CB', label: 'Circle' },
          { type: 'ellipse', icon: '\u2B2D', label: 'Ellipse' },
          { type: 'fill', icon: '\u{1F4A7}', label: 'Fill' },
          { type: 'colorReplace', icon: '\u{1F504}', label: 'Repl' },
        ].map(t => (
          <button
            key={t.type}
            class={`hotbar-btn ${activeTool === t.type ? 'active' : ''}`}
            onClick={() => setTool(t.type as any)}
          >
            <span class="hotbar-icon">{t.icon}</span>
            <span class="hotbar-label">{t.label}</span>
          </button>
        ))}
        <span class="hotbar-sep" />
        <div class="hotbar-size">
          <button class="hotbar-size-btn" onClick={() => setBrushSize(Math.max(1, brushSize - 1))}>-</button>
          <span class="hotbar-size-val">{brushSize}</span>
          <button class="hotbar-size-btn" onClick={() => setBrushSize(brushSize + 1)}>+</button>
        </div>
      </div>
    );
  }

  if (isEraser) {
    return (
      <div class="mobile-hotbar">
        <div class="hotbar-size">
          <button class="hotbar-size-btn" onClick={() => setBrushSize(Math.max(1, brushSize - 1))}>-</button>
          <span class="hotbar-size-val">{brushSize}px</span>
          <button class="hotbar-size-btn" onClick={() => setBrushSize(brushSize + 1)}>+</button>
        </div>
        <span class="hotbar-sep" />
        <button class="hotbar-btn danger" onClick={clearActiveLayer}>
          {'\u{1F5D1}\uFE0F'} Clear
        </button>
      </div>
    );
  }

  if (isSelect) {
    const s = storeRef.current;
    const hasSel = !!selection;
    return (
      <div class="mobile-hotbar">
        <button class="hotbar-btn" onClick={() => s.selectAll()}>All</button>
        <button class="hotbar-btn" onClick={() => s.deselectAll()} disabled={!hasSel}>Desel</button>
        <button class="hotbar-btn" onClick={() => s.copySelection()} disabled={!hasSel}>
          {'\u{1F4CB}'}
        </button>
        <button class="hotbar-btn" onClick={() => s.cutSelection()} disabled={!hasSel}>
          {'\u2702\uFE0F'}
        </button>
        <button class="hotbar-btn" onClick={() => s.pasteClipboard()} disabled={!clipboard}>
          {'\u{1F4E5}'}
        </button>
        <button class="hotbar-btn danger" onClick={() => s.deleteSelection()} disabled={!hasSel}>
          {'\u{1F5D1}\uFE0F'}
        </button>
        {floating && (
          <button class="hotbar-btn" onClick={() => s.dropFloating()}>Drop</button>
        )}
      </div>
    );
  }

  return null;
}

/** Main bottom tab bar: switches between tool groups and panels. */
function MobileTabBar({
  activePanel,
  setPanel,
}: {
  activePanel: string | null;
  setPanel: (p: string | null) => void;
}) {
  const activeTool = useEditorStore(s => s.activeTool);
  const setTool = useEditorStore(s => s.setTool);
  const fgColor = useEditorStore(s => s.foregroundColor);

  const isDraw = (DRAW_TOOLS as readonly string[]).includes(activeTool);

  return (
    <div class="mobile-tab-bar">
      <button
        class={`mobile-tab ${isDraw ? 'active' : ''}`}
        onClick={() => { if (!isDraw) setTool('pen'); setPanel(null); }}
      >
        {'\u{1F3A8}'} Draw
      </button>
      <button
        class={`mobile-tab ${activeTool === 'eraser' ? 'active' : ''}`}
        onClick={() => { setTool('eraser'); setPanel(null); }}
      >
        {'\u{1F9F9}'} Erase
      </button>
      <button
        class={`mobile-tab ${activeTool === 'selection' ? 'active' : ''}`}
        onClick={() => { setTool('selection'); setPanel(null); }}
      >
        {'\u2B1C'} Select
      </button>
      <button
        class={`mobile-tab ${activePanel === 'layers' ? 'active' : ''}`}
        onClick={() => setPanel(activePanel === 'layers' ? null : 'layers')}
      >
        Layers
      </button>
      <button
        class={`mobile-tab ${activePanel === 'palette' ? 'active' : ''}`}
        onClick={() => setPanel(activePanel === 'palette' ? null : 'palette')}
      >
        <span
          class="mobile-color-dot"
          style={{ backgroundColor: `rgb(${fgColor.r},${fgColor.g},${fgColor.b})` }}
        />
        Color
      </button>
      <button
        class={`mobile-tab ${activePanel === 'settings' ? 'active' : ''}`}
        onClick={() => setPanel(activePanel === 'settings' ? null : 'settings')}
      >
        {'\u2699\uFE0F'}
      </button>
    </div>
  );
}
