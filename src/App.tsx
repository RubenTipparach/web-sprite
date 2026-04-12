import { useEffect } from 'preact/hooks';
import { MenuBar } from './ui/MenuBar';
import { StatusBar } from './ui/StatusBar';
import { Canvas } from './canvas/Canvas';
import { ToolPanel } from './tools/ToolPanel';
import { LayerPanel } from './layers/LayerPanel';
import { PalettePanel } from './palette/PalettePanel';
import { useEditorStore } from './state/editor-store';
import './styles/global.css';

export function App() {
  const newCanvas = useEditorStore(s => s.newCanvas);

  useEffect(() => {
    // Initialize with a default 32x32 canvas
    newCanvas(32, 32);
  }, []);

  return (
    <div class="app-layout">
      <MenuBar />
      <ToolPanel />
      <Canvas />
      <div class="sidebar">
        <LayerPanel />
        <PalettePanel />
      </div>
      <StatusBar />
    </div>
  );
}
