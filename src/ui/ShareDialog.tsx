import { useState } from 'preact/hooks';
import { useEditorStore } from '../state/editor-store';
import { shareToSocial, exportForSharing } from '../formats/share-export';
import { steganographyCapacity } from '../utils/steganography';

export function ShareDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [size, setSize] = useState(512);
  const [sharing, setSharing] = useState(false);
  const canvasW = useEditorStore(s => s.canvasWidth);
  const canvasH = useEditorStore(s => s.canvasHeight);

  if (!open) return null;

  const maxDim = Math.max(canvasW, canvasH);
  const scale = Math.max(1, Math.floor(size / maxDim));
  const outW = canvasW * scale;
  const outH = canvasH * scale;
  const capacity = steganographyCapacity(outW, outH);
  const capacityKB = Math.floor(capacity / 1024);

  const handleShare = async (platform: 'x' | 'bluesky' | 'instagram') => {
    setSharing(true);
    try {
      await shareToSocial(platform, size);
    } catch (err) {
      console.error('Share failed:', err);
    }
    setSharing(false);
  };

  const handleDownload = async () => {
    setSharing(true);
    try {
      const blob = await exportForSharing(size);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const state = useEditorStore.getState();
      a.download = state.fileName.replace('.wsprite', '_share.png');
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
    }
    setSharing(false);
  };

  return (
    <div class="dialog-backdrop" onClick={onClose}>
      <div class="dialog" onClick={(e: Event) => e.stopPropagation()}>
        <div class="dialog-title">Share Sprite</div>
        <div class="dialog-body">
          <p class="share-desc">
            Export an upscaled PNG with WebSprite watermark.
            Your full project (layers, palette) is hidden inside the image
            and can be re-opened in WebSprite!
          </p>

          <div class="share-size-row">
            <label>Target size</label>
            <div class="share-size-btns">
              {[256, 512, 1024, 2048].map(s => (
                <button
                  key={s}
                  class={`btn-small ${size === s ? 'active' : ''}`}
                  onClick={() => setSize(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div class="share-info">
            Output: {outW}x{outH}px ({scale}x scale)
            {' \u00B7 '}
            Hidden data capacity: ~{capacityKB} KB
          </div>

          <div class="share-platforms">
            <button
              class="btn share-btn"
              onClick={() => handleShare('x')}
              disabled={sharing}
            >
              {'\u{1D54F}'} Share on X
            </button>
            <button
              class="btn share-btn"
              onClick={() => handleShare('bluesky')}
              disabled={sharing}
            >
              {'\u{1F98B}'} Bluesky
            </button>
            <button
              class="btn share-btn"
              onClick={() => handleShare('instagram')}
              disabled={sharing}
            >
              {'\u{1F4F7}'} Instagram
            </button>
          </div>

          <button
            class="btn share-download-btn"
            onClick={handleDownload}
            disabled={sharing}
          >
            {'\u{1F4BE}'} Download Share Image
          </button>
        </div>
        <div class="dialog-footer">
          <button class="btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
