import { LayerPanel } from '../layers/LayerPanel';
import { PalettePanel } from '../palette/PalettePanel';
import { ToolPanel } from '../tools/ToolPanel';
import { SymmetryPanel } from '../tools/SymmetryPanel';
import { useEditorStore } from '../state/editor-store';

const PANEL_TITLES: Record<string, string> = {
  layers: 'Layers',
  palette: 'Palette',
  tools: 'Tool Options',
  settings: 'Settings',
};

function MobileSettings() {
  const symmetry = useEditorStore(s => s.symmetry);
  const canvasWidth = useEditorStore(s => s.canvasWidth);
  const canvasHeight = useEditorStore(s => s.canvasHeight);
  const setSymmetryX = useEditorStore(s => s.setSymmetryX);
  const setSymmetryY = useEditorStore(s => s.setSymmetryY);
  const setSymmetryXAxis = useEditorStore(s => s.setSymmetryXAxis);
  const setSymmetryYAxis = useEditorStore(s => s.setSymmetryYAxis);
  const tileX = useEditorStore(s => s.tileX);
  const tileY = useEditorStore(s => s.tileY);
  const tileSolid = useEditorStore(s => s.tileSolid);
  const setTileX = useEditorStore(s => s.setTileX);
  const setTileY = useEditorStore(s => s.setTileY);
  const setTileSolid = useEditorStore(s => s.setTileSolid);

  return (
    <div class="mobile-settings-content">
      <div class="mobile-settings-section">
        <div class="mobile-settings-title">Symmetry</div>
        <label class="mobile-settings-toggle">
          <input type="checkbox" checked={symmetry.xEnabled}
            onChange={(e) => setSymmetryX((e.target as HTMLInputElement).checked)} />
          <span>Vertical (X) Mirror</span>
        </label>
        {symmetry.xEnabled && (
          <div class="mobile-settings-slider-row">
            <input type="range" min={0} max={canvasWidth} step={0.5}
              value={symmetry.xAxis}
              onInput={(e) => setSymmetryXAxis(parseFloat((e.target as HTMLInputElement).value))} />
            <span>{symmetry.xAxis}</span>
          </div>
        )}
        <label class="mobile-settings-toggle">
          <input type="checkbox" checked={symmetry.yEnabled}
            onChange={(e) => setSymmetryY((e.target as HTMLInputElement).checked)} />
          <span>Horizontal (Y) Mirror</span>
        </label>
        {symmetry.yEnabled && (
          <div class="mobile-settings-slider-row">
            <input type="range" min={0} max={canvasHeight} step={0.5}
              value={symmetry.yAxis}
              onInput={(e) => setSymmetryYAxis(parseFloat((e.target as HTMLInputElement).value))} />
            <span>{symmetry.yAxis}</span>
          </div>
        )}
        {(symmetry.xEnabled || symmetry.yEnabled) && (
          <button class="btn-small" style={{ marginTop: '4px' }}
            onClick={() => {
              if (symmetry.xEnabled) setSymmetryXAxis(canvasWidth / 2);
              if (symmetry.yEnabled) setSymmetryYAxis(canvasHeight / 2);
            }}>
            Center Axis
          </button>
        )}
      </div>

      <div class="mobile-settings-section">
        <div class="mobile-settings-title">Tiling Preview</div>
        <label class="mobile-settings-toggle">
          <input type="checkbox" checked={tileX}
            onChange={(e) => setTileX((e.target as HTMLInputElement).checked)} />
          <span>Tile X</span>
        </label>
        <label class="mobile-settings-toggle">
          <input type="checkbox" checked={tileY}
            onChange={(e) => setTileY((e.target as HTMLInputElement).checked)} />
          <span>Tile Y</span>
        </label>
        {(tileX || tileY) && (
          <label class="mobile-settings-toggle">
            <input type="checkbox" checked={tileSolid}
              onChange={(e) => setTileSolid((e.target as HTMLInputElement).checked)} />
            <span>Solid Tiles</span>
          </label>
        )}
      </div>
    </div>
  );
}

export function MobilePanel({
  panel,
  onClose,
}: {
  panel: string | null;
  onClose: () => void;
}) {
  if (!panel) return null;

  return (
    <div class="mobile-panel-overlay" onClick={onClose}>
      <div
        class="mobile-panel-sheet"
        onClick={(e: Event) => e.stopPropagation()}
      >
        <div class="mobile-panel-header">
          <span class="mobile-panel-title">
            {PANEL_TITLES[panel] ?? panel}
          </span>
          <button class="mobile-panel-close" onClick={onClose}>Close</button>
        </div>
        <div class="mobile-panel-content">
          {panel === 'layers' && <LayerPanel />}
          {panel === 'palette' && <PalettePanel />}
          {panel === 'tools' && (
            <div class="mobile-tools-content">
              <ToolPanel />
              <SymmetryPanel />
            </div>
          )}
          {panel === 'settings' && <MobileSettings />}
        </div>
      </div>
    </div>
  );
}
