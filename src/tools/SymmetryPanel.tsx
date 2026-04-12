import { useEditorStore } from '../state/editor-store';

export function SymmetryPanel() {
  const symmetry = useEditorStore(s => s.symmetry);
  const canvasWidth = useEditorStore(s => s.canvasWidth);
  const canvasHeight = useEditorStore(s => s.canvasHeight);
  const setSymmetryX = useEditorStore(s => s.setSymmetryX);
  const setSymmetryY = useEditorStore(s => s.setSymmetryY);
  const setSymmetryXAxis = useEditorStore(s => s.setSymmetryXAxis);
  const setSymmetryYAxis = useEditorStore(s => s.setSymmetryYAxis);

  return (
    <div class="symmetry-panel">
      <div class="panel-header">Symmetry</div>

      <div class="sym-row">
        <label class="sym-toggle">
          <input
            type="checkbox"
            checked={symmetry.xEnabled}
            onChange={(e) => setSymmetryX((e.target as HTMLInputElement).checked)}
          />
          <span>Vertical (X)</span>
        </label>
        {symmetry.xEnabled && (
          <div class="sym-axis-control">
            <input
              type="range"
              min={0}
              max={canvasWidth}
              step={0.5}
              value={symmetry.xAxis}
              onInput={(e) => setSymmetryXAxis(parseFloat((e.target as HTMLInputElement).value))}
              class="sym-slider"
            />
            <input
              type="number"
              min={0}
              max={canvasWidth}
              step={0.5}
              value={symmetry.xAxis}
              onInput={(e) => setSymmetryXAxis(parseFloat((e.target as HTMLInputElement).value) || 0)}
              class="sym-input"
            />
          </div>
        )}
      </div>

      <div class="sym-row">
        <label class="sym-toggle">
          <input
            type="checkbox"
            checked={symmetry.yEnabled}
            onChange={(e) => setSymmetryY((e.target as HTMLInputElement).checked)}
          />
          <span>Horizontal (Y)</span>
        </label>
        {symmetry.yEnabled && (
          <div class="sym-axis-control">
            <input
              type="range"
              min={0}
              max={canvasHeight}
              step={0.5}
              value={symmetry.yAxis}
              onInput={(e) => setSymmetryYAxis(parseFloat((e.target as HTMLInputElement).value))}
              class="sym-slider"
            />
            <input
              type="number"
              min={0}
              max={canvasHeight}
              step={0.5}
              value={symmetry.yAxis}
              onInput={(e) => setSymmetryYAxis(parseFloat((e.target as HTMLInputElement).value) || 0)}
              class="sym-input"
            />
          </div>
        )}
      </div>

      {(symmetry.xEnabled || symmetry.yEnabled) && (
        <button
          class="btn-small sym-center-btn"
          onClick={() => {
            if (symmetry.xEnabled) setSymmetryXAxis(canvasWidth / 2);
            if (symmetry.yEnabled) setSymmetryYAxis(canvasHeight / 2);
          }}
        >
          Center
        </button>
      )}
    </div>
  );
}
