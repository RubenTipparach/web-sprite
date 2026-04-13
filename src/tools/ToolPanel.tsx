import { useEditorStore, type ToolType } from '../state/editor-store';
import { rgbaToCss } from '../utils/color';

type ToolGroup = 'draw' | 'eraser' | 'selection';

const DRAW_TOOLS: { type: ToolType; icon: string; label: string; shortcut?: string }[] = [
  { type: 'pen', icon: '\u270F\uFE0F', label: 'Pen', shortcut: 'B' },
  { type: 'line', icon: '\u2571', label: 'Line', shortcut: 'L' },
  { type: 'rect', icon: '\u25AD', label: 'Rect', shortcut: 'R' },
  { type: 'circle', icon: '\u25CB', label: 'Circle', shortcut: 'C' },
  { type: 'ellipse', icon: '\u2B2D', label: 'Ellipse', shortcut: 'O' },
  { type: 'fill', icon: '\u{1F4A7}', label: 'Fill', shortcut: 'G' },
  { type: 'colorReplace', icon: '\u{1F504}', label: 'Replace', shortcut: 'H' },
];

const TOOL_GROUPS: { group: ToolGroup; icon: string; label: string; tools: ToolType[] }[] = [
  { group: 'draw', icon: '\u{1F3A8}', label: 'Draw', tools: ['pen', 'line', 'rect', 'circle', 'ellipse', 'fill', 'colorReplace'] },
  { group: 'eraser', icon: '\u{1F9F9}', label: 'Eraser', tools: ['eraser'] },
  { group: 'selection', icon: '\u2B1C', label: 'Select', tools: ['selection'] },
];

function getToolGroup(tool: ToolType): ToolGroup {
  for (const g of TOOL_GROUPS) {
    if (g.tools.includes(tool)) return g.group;
  }
  return 'draw';
}

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

  const isPen = activeTool === 'pen';

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
      {isPen && (
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
      )}
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
      <button class="sel-action-btn" onClick={selectAll} title="Ctrl+A">
        {'\u2B1C'} Select All
      </button>
      <button class="sel-action-btn" onClick={deselectAll} disabled={!hasSel} title="Ctrl+D">
        {'\u274C'} Deselect
      </button>
      <button class="sel-action-btn" onClick={copySelection} disabled={!hasSel} title="Ctrl+C">
        {'\u{1F4CB}'} Copy
      </button>
      <button class="sel-action-btn" onClick={cutSelection} disabled={!hasSel} title="Ctrl+X">
        {'\u2702\uFE0F'} Cut
      </button>
      <button class="sel-action-btn" onClick={pasteClipboard} disabled={!clipboard} title="Ctrl+V">
        {'\u{1F4E5}'} Paste
      </button>
      <button class="sel-action-btn danger" onClick={deleteSelection} disabled={!hasSel} title="Delete">
        {'\u{1F5D1}\uFE0F'} Delete
      </button>
      {hasFloat && (
        <button class="sel-action-btn" onClick={dropFloating}>
          {'\u2B07\uFE0F'} Drop Here
        </button>
      )}
      {hasSel && !hasFloat && (
        <div class="sel-hint">Drag selection to move</div>
      )}
      {hasFloat && (
        <div class="sel-hint">Dragging — tap Drop to place</div>
      )}
    </div>
  );
}

function TilingPreview() {
  const tileX = useEditorStore(s => s.tileX);
  const tileY = useEditorStore(s => s.tileY);
  const setTileX = useEditorStore(s => s.setTileX);
  const setTileY = useEditorStore(s => s.setTileY);

  return (
    <div class="tiling-panel">
      <div class="panel-header">Tiling Preview</div>
      <div class="tiling-toggles">
        <label class="tool-option-checkbox">
          <input
            type="checkbox"
            checked={tileX}
            onChange={(e) => setTileX((e.target as HTMLInputElement).checked)}
          />
          <span>Tile X</span>
        </label>
        <label class="tool-option-checkbox">
          <input
            type="checkbox"
            checked={tileY}
            onChange={(e) => setTileY((e.target as HTMLInputElement).checked)}
          />
          <span>Tile Y</span>
        </label>
      </div>
    </div>
  );
}

export function ToolPanel() {
  const activeTool = useEditorStore(s => s.activeTool);
  const setTool = useEditorStore(s => s.setTool);

  const activeGroup = getToolGroup(activeTool);
  const showDrawSubs = activeGroup === 'draw';
  const showBrushOpts = activeTool === 'pen' || activeTool === 'eraser' ||
    activeTool === 'line' || activeTool === 'rect' || activeTool === 'circle' || activeTool === 'ellipse';

  return (
    <div class="tool-panel">
      <div class="panel-header">Tools</div>

      {/* Main tool group buttons */}
      <div class="tool-buttons">
        {TOOL_GROUPS.map(g => (
          <button
            key={g.group}
            class={`tool-btn ${activeGroup === g.group ? 'active' : ''}`}
            onClick={() => setTool(g.tools[0])}
            title={g.label}
          >
            <span class="tool-btn-icon">{g.icon}</span>
            <span class="tool-btn-label">{g.label}</span>
          </button>
        ))}
      </div>

      {/* Draw sub-tools */}
      {showDrawSubs && (
        <div class="sub-tools">
          {DRAW_TOOLS.map(t => (
            <button
              key={t.type}
              class={`sub-tool-btn ${activeTool === t.type ? 'active' : ''}`}
              onClick={() => setTool(t.type)}
              title={`${t.label}${t.shortcut ? ` (${t.shortcut})` : ''}`}
            >
              <span class="sub-tool-icon">{t.icon}</span>
              <span class="sub-tool-label">{t.label}</span>
            </button>
          ))}
        </div>
      )}

      {showBrushOpts && <BrushOptions />}
      {activeTool === 'eraser' && <EraserOptions />}
      {activeTool === 'selection' && <SelectionOptions />}

      <TilingPreview />
    </div>
  );
}
