import { LayerPanel } from '../layers/LayerPanel';
import { PalettePanel } from '../palette/PalettePanel';
import { ToolPanel } from '../tools/ToolPanel';
import { SymmetryPanel } from '../tools/SymmetryPanel';

const PANEL_TITLES: Record<string, string> = {
  layers: 'Layers',
  palette: 'Palette',
  tools: 'Tool Options',
};

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
        </div>
      </div>
    </div>
  );
}
