import { useEditorStore, type ToolType } from '../state/editor-store';
import { rgbaToCss } from '../utils/color';

const TOOLS: { type: ToolType; icon: string; label: string; shortcut: string }[] = [
  { type: 'pen', icon: '\u270F\uFE0F', label: 'Pen', shortcut: 'B' },
  { type: 'eraser', icon: '\u{1F9F9}', label: 'Eraser', shortcut: 'E' },
  { type: 'selection', icon: '\u2B1C', label: 'Select', shortcut: 'M' },
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

function BrushOptions() {
  const brushSize = useEditorStore(s => s.brushSize);
  const setBrushSize = useEditorStore(s => s.setBrushSize);
  const pixelPerfect = useEditorStore(s => s.pixelPerfect);
  const setPixelPerfect = useEditorStore(s => s.setPixelPerfect);
  const activeTool = useEditorStore(s => s.activeTool);
  const fgColor = useEditorStore(s => s.foregroundColor);

  return (
    <>
      <BrushPreview
        size={brushSize}
        color={activeTool === 'eraser' ? '#888' : rgbaToCss(fgColor)}
      />
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
  );
}

function EraserOptions() {
  const clearActiveLayer = useEditorStore(s => s.clearActiveLayer);

  return (
    <div class="tool-options">
      <button class="btn-small tool-action-btn danger" onClick={clearActiveLayer}>
        {'\u{1F5D1}\uFE0F'} Clear Layer
      </button>
    </div>
  );
}

function SelectionOptions() {
  const selection = useEditorStore(s => s.selection);
  const floating = useEditorStore(s => s.floating);
  const copySelection = useEditorStore(s => s.copySelection);
  const cutSelection = useEditorStore(s => s.cutSelection);
  const pasteClipboard = useEditorStore(s => s.pasteClipboard);
  const deleteSelection = useEditorStore(s => s.deleteSelection);
  const selectAll = useEditorStore(s => s.selectAll);
  const deselectAll = useEditorStore(s => s.deselectAll);
  const dropFloating = useEditorStore(s => s.dropFloating);
  const clipboard = useEditorStore(s => s.clipboard);

  const hasSel = !!selection;
  const hasFloat = !!floating;

  return (
    <div class="selection-options">
      <div class="tool-option-label">Selection</div>
      <div class="selection-actions">
        <button class="btn-small tool-action-btn" onClick={selectAll} title="Ctrl+A">
          {'\u2B1C'} Select All
        </button>
        <button class="btn-small tool-action-btn" onClick={deselectAll} disabled={!hasSel} title="Ctrl+D">
          {'\u274C'} Deselect
        </button>
      </div>
      <div class="selection-actions">
        <button class="btn-small tool-action-btn" onClick={copySelection} disabled={!hasSel} title="Ctrl+C">
          {'\u{1F4CB}'} Copy
        </button>
        <button class="btn-small tool-action-btn" onClick={cutSelection} disabled={!hasSel} title="Ctrl+X">
          {'\u2702\uFE0F'} Cut
        </button>
        <button class="btn-small tool-action-btn" onClick={pasteClipboard} disabled={!clipboard} title="Ctrl+V">
          {'\u{1F4E5}'} Paste
        </button>
      </div>
      <div class="selection-actions">
        <button class="btn-small tool-action-btn danger" onClick={deleteSelection} disabled={!hasSel} title="Delete">
          {'\u{1F5D1}\uFE0F'} Delete
        </button>
        {hasFloat && (
          <button class="btn-small tool-action-btn" onClick={dropFloating}>
            {'\u2B07\uFE0F'} Drop
          </button>
        )}
      </div>
      {hasSel && !hasFloat && (
        <div class="sel-hint">Drag selection to move</div>
      )}
      {hasFloat && (
        <div class="sel-hint">Dragging floating pixels</div>
      )}
    </div>
  );
}

export function ToolPanel() {
  const activeTool = useEditorStore(s => s.activeTool);
  const setTool = useEditorStore(s => s.setTool);

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

      {(activeTool === 'pen' || activeTool === 'eraser') && <BrushOptions />}
      {activeTool === 'eraser' && <EraserOptions />}
      {activeTool === 'selection' && <SelectionOptions />}
    </div>
  );
}
