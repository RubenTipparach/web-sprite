import { useEditorStore } from '../state/editor-store';
import { getFrameData } from './Layer';

function FrameThumb({ layerId, frameIndex, size }: { layerId: string; frameIndex: number; size: number }) {
  const layer = useEditorStore(s => s.layers.find(l => l.id === layerId));
  const renderVersion = useEditorStore(s => s.renderVersion);
  if (!layer) return null;

  const data = getFrameData(layer, frameIndex);
  const w = data.width;
  const h = data.height;

  // Check if frame has any content
  let hasContent = false;
  const px = data.data;
  for (let i = 3; i < px.length; i += 4) {
    if (px[i] > 0) { hasContent = true; break; }
  }

  if (!hasContent) {
    return <div class="tl-thumb tl-thumb-empty" style={{ width: size, height: size }} />;
  }

  // Render tiny thumbnail via canvas
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(data, 0, 0);
  const url = canvas.toDataURL();

  return (
    <img
      class="tl-thumb"
      src={url}
      width={size}
      height={size}
      style={{ imageRendering: 'pixelated' }}
    />
  );
}

export function Timeline() {
  const layers = useEditorStore(s => s.layers);
  const activeLayerId = useEditorStore(s => s.activeLayerId);
  const currentFrame = useEditorStore(s => s.currentFrame);
  const frameCount = useEditorStore(s => s.frameCount);
  const fps = useEditorStore(s => s.fps);
  const playing = useEditorStore(s => s.playing);
  const onionSkin = useEditorStore(s => s.onionSkin);

  const setActiveLayer = useEditorStore(s => s.setActiveLayer);
  const goToFrame = useEditorStore(s => s.goToFrame);
  const addFrame = useEditorStore(s => s.addFrame);
  const deleteFrame = useEditorStore(s => s.deleteFrame);
  const duplicateFrame = useEditorStore(s => s.duplicateFrame);
  const nextFrame = useEditorStore(s => s.nextFrame);
  const prevFrame = useEditorStore(s => s.prevFrame);
  const setFps = useEditorStore(s => s.setFps);
  const togglePlayback = useEditorStore(s => s.togglePlayback);
  const toggleOnionSkin = useEditorStore(s => s.toggleOnionSkin);

  const displayLayers = [...layers].reverse();

  const frames = Array.from({ length: frameCount }, (_, i) => i);

  return (
    <div class="timeline">
      {/* Toolbar row */}
      <div class="tl-toolbar">
        <div class="tl-transport">
          <button class="btn-tiny" onClick={prevFrame} title="Previous Frame (,)">{'\u25C0'}</button>
          <button class="btn-tiny tl-play-btn" onClick={togglePlayback} title="Play/Pause (Enter)">
            {playing ? '\u23F8' : '\u25B6'}
          </button>
          <button class="btn-tiny" onClick={nextFrame} title="Next Frame (.)">{'\u25B6'}</button>
        </div>
        <span class="tl-frame-label">
          {currentFrame + 1} / {frameCount}
        </span>
        <div class="tl-fps">
          <label>FPS</label>
          <input
            type="number"
            min={1}
            max={60}
            value={fps}
            onInput={(e) => setFps(parseInt((e.target as HTMLInputElement).value) || 8)}
            class="tl-fps-input"
          />
        </div>
        <button
          class={`btn-tiny ${onionSkin.enabled ? 'tl-onion-active' : ''}`}
          onClick={toggleOnionSkin}
          title="Toggle Onion Skin"
        >
          {'\u{1F9C5}'}
        </button>
        <div class="tl-frame-actions">
          <button class="btn-tiny" onClick={addFrame} title="Add Frame">+ Frame</button>
          <button class="btn-tiny" onClick={duplicateFrame} title="Duplicate Frame">Dup</button>
          <button class="btn-tiny" onClick={deleteFrame} disabled={frameCount <= 1} title="Delete Frame">Del</button>
        </div>
      </div>

      {/* Grid: layer names column + frame cells */}
      <div class="tl-grid" style={{ gridTemplateColumns: `80px repeat(${frameCount}, 32px)` }}>
        {/* Header row: frame numbers */}
        <div class="tl-corner" />
        {frames.map(f => (
          <div
            key={f}
            class={`tl-frame-header ${f === currentFrame ? 'active' : ''}`}
            onClick={() => goToFrame(f)}
          >
            {f + 1}
          </div>
        ))}

        {/* Layer rows */}
        {displayLayers.map(layer => (
          <>
            <div
              key={`name-${layer.id}`}
              class={`tl-layer-name ${layer.id === activeLayerId ? 'active' : ''}`}
              onClick={() => setActiveLayer(layer.id)}
              title={layer.name}
            >
              {!layer.visible && <span class="tl-hidden-icon">{'\u25CB'}</span>}
              {layer.name}
            </div>
            {frames.map(f => (
              <div
                key={`${layer.id}-${f}`}
                class={`tl-cell ${f === currentFrame ? 'col-active' : ''} ${layer.id === activeLayerId && f === currentFrame ? 'active' : ''} ${layer.id === activeLayerId ? 'row-active' : ''}`}
                onClick={() => { setActiveLayer(layer.id); goToFrame(f); }}
              >
                <FrameThumb layerId={layer.id} frameIndex={f} size={24} />
              </div>
            ))}
          </>
        ))}
      </div>
    </div>
  );
}
