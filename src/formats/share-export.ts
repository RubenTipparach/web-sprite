import { flattenForExport } from '../layers/LayerCompositor';
import { useEditorStore } from '../state/editor-store';
import { serializeWsprite } from './wsprite/wsprite-write';
import { steganographyEncode, steganographyDecode, steganographyCapacity } from '../utils/steganography';
import { compress, decompress } from '../utils/compression';
import { deserializeWsprite } from './wsprite/wsprite-read';

const WATERMARK_TEXT = 'WebSprite';
const WATERMARK_FONT = '10px monospace';
const WATERMARK_COLOR = 'rgba(255,255,255,0.35)';
const WATERMARK_SHADOW = 'rgba(0,0,0,0.5)';

/** Export an upscaled PNG for social sharing, with watermark + embedded .wsprite data. */
export async function exportForSharing(targetSize: number = 512): Promise<Blob> {
  const state = useEditorStore.getState();
  const w = state.canvasWidth;
  const h = state.canvasHeight;

  // Calculate scale to fit in targetSize while maintaining pixel-perfect scaling
  const maxDim = Math.max(w, h);
  const scale = Math.max(1, Math.floor(targetSize / maxDim));
  const outW = w * scale;
  const outH = h * scale;

  // Flatten layers
  const composite = flattenForExport(state.layers, w, h);

  // Create upscaled canvas
  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d')!;

  // Fill background with slight padding color
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(0, 0, outW, outH);

  // Draw pixel art scaled up (nearest-neighbor)
  const tmpCanvas = document.createElement('canvas');
  tmpCanvas.width = w;
  tmpCanvas.height = h;
  tmpCanvas.getContext('2d')!.putImageData(composite, 0, 0);

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tmpCanvas, 0, 0, outW, outH);

  // Add watermark
  drawWatermark(ctx, outW, outH);

  // Try to embed .wsprite data via steganography
  const imageData = ctx.getImageData(0, 0, outW, outH);
  try {
    const wspriteBuffer = serializeWsprite();
    const compressed = compress(new Uint8Array(wspriteBuffer));
    const capacity = steganographyCapacity(outW, outH);

    if (compressed.length <= capacity) {
      steganographyEncode(imageData, compressed);
      ctx.putImageData(imageData, 0, 0);
    }
  } catch (err) {
    console.warn('Failed to embed .wsprite data:', err);
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => blob ? resolve(blob) : reject(new Error('Failed to create PNG')),
      'image/png',
    );
  });
}

function drawWatermark(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const padding = Math.max(4, Math.floor(width * 0.015));
  ctx.font = WATERMARK_FONT;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';

  // Shadow
  ctx.fillStyle = WATERMARK_SHADOW;
  ctx.fillText(WATERMARK_TEXT, width - padding + 1, height - padding + 1);

  // Text
  ctx.fillStyle = WATERMARK_COLOR;
  ctx.fillText(WATERMARK_TEXT, width - padding, height - padding);
}

const SHARE_TEXT = 'Made with #websprite #pixelart';

/** Generate a share URL for a platform. */
export function getShareUrl(
  platform: 'x' | 'bluesky' | 'instagram',
): string {
  const encodedText = encodeURIComponent(SHARE_TEXT);

  switch (platform) {
    case 'x':
      return `https://x.com/intent/tweet?text=${encodedText}`;
    case 'bluesky':
      return `https://bsky.app/intent/compose?text=${encodedText}`;
    case 'instagram':
      return '';
    default:
      return '';
  }
}

/** Download a blob as a file. */
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Share to a specific platform. */
export async function shareToSocial(
  platform: 'x' | 'bluesky' | 'instagram' | 'general',
  size: number = 512,
) {
  const blob = await exportForSharing(size);
  const state = useEditorStore.getState();
  const name = state.fileName.replace('.wsprite', '');
  const file = new File([blob], `${name}.wsprite.png`, { type: 'image/png' });

  // For all platforms: try Web Share API first (sends image to the target app)
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({
        text: SHARE_TEXT,
        files: [file],
      });
      return;
    } catch {
      // User cancelled — fall through to desktop flow
    }
  }

  // Desktop fallback: copy image to clipboard + download + open compose URL
  try {
    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': blob }),
    ]);
    alert('Image copied to clipboard! Paste it into your post.');
  } catch {
    // Clipboard API not available — just download
  }

  downloadBlob(blob, `${name}.wsprite.png`);

  if (platform !== 'general') {
    const url = getShareUrl(platform);
    if (url) {
      window.open(url, '_blank', 'noopener');
    }
  }
}

/** Import: check if a PNG contains embedded .wsprite data. */
export async function importFromShareImage(file: File): Promise<boolean> {

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, img.width, img.height);

      const encoded = steganographyDecode(imageData);
      if (!encoded) {
        resolve(false);
        return;
      }

      try {
        const decompressed = decompress(encoded);
        const { layers, width, height } = deserializeWsprite(decompressed.buffer as ArrayBuffer);
        const store = useEditorStore.getState();
        store.loadLayers(layers, width, height);
        store.setFileName(file.name.replace('.png', '.wsprite'));
        resolve(true);
      } catch (err) {
        console.warn('Failed to extract .wsprite from image:', err);
        resolve(false);
      }
    };
    img.onerror = () => resolve(false);
    img.src = URL.createObjectURL(file);
  });
}
