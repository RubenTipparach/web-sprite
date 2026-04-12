import { useEditorStore } from '../state/editor-store';

export function StatusBar() {
  const zoom = useEditorStore(s => s.viewport.zoom);
  const w = useEditorStore(s => s.canvasWidth);
  const h = useEditorStore(s => s.canvasHeight);
  const activeLayerId = useEditorStore(s => s.activeLayerId);
  const layers = useEditorStore(s => s.layers);
  const tool = useEditorStore(s => s.activeTool);
  const brushSize = useEditorStore(s => s.brushSize);

  const activeLayer = layers.find(l => l.id === activeLayerId);

  return (
    <div class="status-bar">
      <span>
        <span id="status-cursor">0, 0</span>
      </span>
      <span>Zoom: {Math.round(zoom * 100)}%</span>
      <span>{w} x {h}</span>
      <span>Layer: {activeLayer?.name ?? '—'}</span>
      <span style={{ textTransform: 'capitalize' }}>{tool} ({brushSize}px)</span>
    </div>
  );
}
