import { usePaletteStore } from '../state/palette-store';
import { useEditorStore } from '../state/editor-store';
import { hexToRgba, rgbaToCss, rgbaToHex } from '../utils/color';

/**
 * Compact always-visible strip: shows current FG/BG colors and the active
 * palette as a single row of swatches. Clicking a swatch sets FG color.
 */
export function ColorPreview() {
  const fgColor = useEditorStore(s => s.foregroundColor);
  const bgColor = useEditorStore(s => s.backgroundColor);
  const setFgColor = useEditorStore(s => s.setForegroundColor);
  const setBgColor = useEditorStore(s => s.setBackgroundColor);
  const swapColors = useEditorStore(s => s.swapColors);

  const palettes = usePaletteStore(s => s.palettes);
  const activePaletteSlug = usePaletteStore(s => s.activePaletteSlug);
  const activePalette = palettes.find(p => p.slug === activePaletteSlug);

  return (
    <div class="color-preview-strip">
      {/* FG/BG compact */}
      <div class="cp-colors">
        <div
          class="cp-swatch cp-fg"
          style={{ backgroundColor: rgbaToCss(fgColor) }}
          title={`FG: #${rgbaToHex(fgColor)}`}
        />
        <div
          class="cp-swatch cp-bg"
          style={{ backgroundColor: rgbaToCss(bgColor) }}
          title={`BG: #${rgbaToHex(bgColor)}`}
        />
        <button class="cp-swap" onClick={swapColors} title="Swap (X)">X</button>
      </div>

      {/* Palette mini-strip */}
      <div class="cp-palette">
        {activePalette?.colors.map((hex, i) => {
          const color = hexToRgba(hex);
          const isActive = fgColor.r === color.r && fgColor.g === color.g && fgColor.b === color.b;
          return (
            <button
              key={i}
              class={`cp-color ${isActive ? 'active' : ''}`}
              style={{ backgroundColor: `#${hex}` }}
              onClick={() => setFgColor(color)}
              onContextMenu={(e: Event) => { e.preventDefault(); setBgColor(color); }}
            />
          );
        })}
      </div>
    </div>
  );
}
