import { useEffect } from 'preact/hooks';
import { MenuBar } from './ui/MenuBar';
import { TabBar } from './ui/TabBar';
import { StatusBar } from './ui/StatusBar';
import { Canvas } from './canvas/Canvas';
import { ToolPanel } from './tools/ToolPanel';
import { SymmetryPanel } from './tools/SymmetryPanel';
import { LayerPanel } from './layers/LayerPanel';
import { PalettePanel } from './palette/PalettePanel';
import { useEditorStore } from './state/editor-store';
import { useLayoutStore } from './state/layout-store';
import { ResizeHandle } from './ui/ResizeHandle';
import { MobilePanel } from './ui/MobilePanel';
import { ColorPreview } from './ui/ColorPreview';
import { loadAutoSave, startAutoSave } from './storage/local-storage';
import './styles/global.css';

export function App() {
  const newCanvas = useEditorStore(s => s.newCanvas);
  const isMobile = useLayoutStore(s => s.isMobile);
  const leftWidth = useLayoutStore(s => s.leftPanelWidth);
  const rightWidth = useLayoutStore(s => s.rightPanelWidth);
  const mobilePanel = useLayoutStore(s => s.mobileActivePanel);
  const setMobilePanel = useLayoutStore(s => s.setMobileActivePanel);

  useEffect(() => {
    const loaded = loadAutoSave();
    if (!loaded) {
      newCanvas(32, 32);
    }
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
        <div class="mobile-toolbar">
          <MobileToolbar activePanel={mobilePanel} setPanel={setMobilePanel} />
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

function MobileToolbar({
  activePanel,
  setPanel,
}: {
  activePanel: string | null;
  setPanel: (p: string | null) => void;
}) {
  const activeTool = useEditorStore(s => s.activeTool);
  const setTool = useEditorStore(s => s.setTool);
  const fgColor = useEditorStore(s => s.foregroundColor);
  const brushSize = useEditorStore(s => s.brushSize);
  const setBrushSize = useEditorStore(s => s.setBrushSize);
  const clearActiveLayer = useEditorStore(s => s.clearActiveLayer);

  return (
    <div class="mobile-tab-bar">
      <button
        class={`mobile-tab ${['pen','line','rect','circle','fill'].includes(activeTool) ? 'active' : ''}`}
        onClick={() => {
          if (!['pen','line','rect','circle','fill'].includes(activeTool)) {
            setTool('pen');
          }
          setPanel(activePanel === 'tools' ? null : 'tools');
        }}
      >
        {'\u{1F3A8}'} Draw
      </button>
      <button
        class={`mobile-tab ${activeTool === 'eraser' ? 'active' : ''}`}
        onClick={() => {
          setTool('eraser');
          // Open eraser options directly
          setPanel(activePanel === 'tools' ? null : 'tools');
        }}
      >
        {'\u{1F9F9}'} Eraser
      </button>
      <button
        class={`mobile-tab ${activeTool === 'selection' ? 'active' : ''}`}
        onClick={() => {
          setTool('selection');
          setPanel(activePanel === 'tools' ? null : 'tools');
        }}
      >
        {'\u2B1C'} Select
      </button>
      <button
        class={`mobile-tab ${activePanel === 'tools' ? 'active' : ''}`}
        onClick={() => setPanel(activePanel === 'tools' ? null : 'tools')}
      >
        {'\u2699\uFE0F'} Options
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
    </div>
  );
}
