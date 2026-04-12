import { useEditorStore, type ToolType } from '../state/editor-store';
import { rgbaToCss, rgbaToHex } from '../utils/color';

const TOOLS: { type: ToolType; icon: string; label: string; shortcut: string }[] = [
  { type: 'pen', icon: 'P', label: 'Pen', shortcut: 'B' },
  { type: 'eraser', icon: 'E', label: 'Eraser', shortcut: 'E' },
];

export function ToolPanel() {
  const activeTool = useEditorStore(s => s.activeTool);
  const setTool = useEditorStore(s => s.setTool);
  const brushSize = useEditorStore(s => s.brushSize);
  const setBrushSize = useEditorStore(s => s.setBrushSize);

  return (
    <div class="tool-panel">
      <div class="panel-header">Tools</div>

      <div class="tool-buttons">
        {TOOLS.map(tool => (
          <button
            key={tool.type}
            class={`tool-btn ${activeTool === tool.type ? 'active' : ''}`}
            onClick={() => setTool(tool.type)}
            title={`${tool.label} (${tool.shortcut})`}
          >
            {tool.icon}
          </button>
        ))}
      </div>

      <div class="tool-options">
        <label class="tool-option-label">Size</label>
        <div class="brush-sizes">
          {[1, 2, 3, 5, 8].map(size => (
            <button
              key={size}
              class={`brush-size-btn ${brushSize === size ? 'active' : ''}`}
              onClick={() => setBrushSize(size)}
            >
              {size}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
