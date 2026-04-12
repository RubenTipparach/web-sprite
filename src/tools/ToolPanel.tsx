import { useEditorStore, type ToolType } from '../state/editor-store';
import { rgbaToCss } from '../utils/color';

const TOOLS: { type: ToolType; icon: string; label: string; shortcut: string }[] = [
  { type: 'pen', icon: '\u270F\uFE0F', label: 'Pen', shortcut: 'B' },
  { type: 'eraser', icon: '\u{1F9F9}', label: 'Eraser', shortcut: 'E' },
];

const BRUSH_SIZES = [1, 2, 3, 4, 5, 6, 8, 10, 12, 16];

function BrushPreview({ size, color }: { size: number; color: string }) {
  const displaySize = Math.min(size * 3, 36);
  return (
    <div class="brush-preview" title={`${size}px`}>
      <div
        class="brush-preview-dot"
        style={{
          width: `${displaySize}px`,
          height: `${displaySize}px`,
          backgroundColor: color,
          borderRadius: size <= 2 ? '0' : '50%',
        }}
      />
    </div>
  );
}

export function ToolPanel() {
  const activeTool = useEditorStore(s => s.activeTool);
  const setTool = useEditorStore(s => s.setTool);
  const brushSize = useEditorStore(s => s.brushSize);
  const setBrushSize = useEditorStore(s => s.setBrushSize);
  const pixelPerfect = useEditorStore(s => s.pixelPerfect);
  const setPixelPerfect = useEditorStore(s => s.setPixelPerfect);
  const fgColor = useEditorStore(s => s.foregroundColor);

  const showBrushOptions = activeTool === 'pen' || activeTool === 'eraser';

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
            <span class="tool-btn-icon">{tool.icon}</span>
            <span class="tool-btn-label">{tool.label}</span>
          </button>
        ))}
      </div>

      {showBrushOptions && (
        <>
          {/* Brush preview */}
          <BrushPreview
            size={brushSize}
            color={activeTool === 'eraser' ? '#888' : rgbaToCss(fgColor)}
          />

          {/* Size slider + number */}
          <div class="tool-options">
            <label class="tool-option-label">
              Size: {brushSize}px
            </label>
            <input
              type="range"
              class="brush-slider"
              min={1}
              max={16}
              value={brushSize}
              onInput={(e) => setBrushSize(parseInt((e.target as HTMLInputElement).value))}
            />
            <div class="brush-sizes">
              {BRUSH_SIZES.map(size => (
                <button
                  key={size}
                  class={`brush-size-btn ${brushSize === size ? 'active' : ''}`}
                  onClick={() => setBrushSize(size)}
                  title={`${size}px`}
                >
                  <span
                    class="brush-size-dot"
                    style={{
                      width: `${Math.max(3, Math.min(size * 2, 16))}px`,
                      height: `${Math.max(3, Math.min(size * 2, 16))}px`,
                    }}
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Pixel perfect toggle */}
          <div class="tool-options">
            <label class="tool-option-checkbox">
              <input
                type="checkbox"
                checked={pixelPerfect}
                onChange={(e) => setPixelPerfect((e.target as HTMLInputElement).checked)}
              />
              <span>Pixel Perfect</span>
            </label>
          </div>
        </>
      )}
    </div>
  );
}
