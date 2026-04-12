import { LayerPanel } from '../layers/LayerPanel';
import { PalettePanel } from '../palette/PalettePanel';

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
            {panel === 'layers' ? 'Layers' : 'Palette'}
          </span>
          <button class="mobile-panel-close" onClick={onClose}>Close</button>
        </div>
        <div class="mobile-panel-content">
          {panel === 'layers' && <LayerPanel />}
          {panel === 'palette' && <PalettePanel />}
        </div>
      </div>
    </div>
  );
}
