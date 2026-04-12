import { useEffect, useState, useRef } from 'preact/hooks';
import { usePaletteStore } from '../state/palette-store';
import { useEditorStore } from '../state/editor-store';
import { hexToRgba, rgbaToHex, rgbaToCss } from '../utils/color';
import { parseHex, exportHex } from './hex-format';

export function PalettePanel() {
  const palettes = usePaletteStore(s => s.palettes);
  const activePaletteSlug = usePaletteStore(s => s.activePaletteSlug);
  const setActivePalette = usePaletteStore(s => s.setActivePalette);
  const loadPalettes = usePaletteStore(s => s.loadPalettes);
  const addCustomPalette = usePaletteStore(s => s.addCustomPalette);
  const loaded = usePaletteStore(s => s.loaded);

  const fgColor = useEditorStore(s => s.foregroundColor);
  const bgColor = useEditorStore(s => s.backgroundColor);
  const setFgColor = useEditorStore(s => s.setForegroundColor);
  const setBgColor = useEditorStore(s => s.setBackgroundColor);
  const swapColors = useEditorStore(s => s.swapColors);

  const [search, setSearch] = useState('');
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loaded) loadPalettes();
  }, [loaded, loadPalettes]);

  const activePalette = palettes.find(p => p.slug === activePaletteSlug);
  const filteredPalettes = search
    ? palettes.filter(p => p.title.toLowerCase().includes(search.toLowerCase()))
    : palettes;

  const handleImportHex = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.hex';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const text = await file.text();
      const colors = parseHex(text);
      if (colors.length === 0) return;
      const slug = file.name.replace('.hex', '').toLowerCase().replace(/\s+/g, '-');
      addCustomPalette({
        slug,
        title: file.name.replace('.hex', ''),
        author: 'Imported',
        colorCount: colors.length,
        colors: colors.map(c => rgbaToHex(c)),
      });
      setActivePalette(slug);
    };
    input.click();
  };

  const handleExportHex = () => {
    if (!activePalette) return;
    const colors = activePalette.colors.map(hex => hexToRgba(hex));
    const text = exportHex(colors);
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activePalette.slug}.hex`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div class="palette-panel">
      <div class="panel-header">Palette</div>

      {/* Foreground / Background color */}
      <div class="color-swatches">
        <div
          class="color-swatch fg"
          style={{ backgroundColor: rgbaToCss(fgColor) }}
          title={`FG: #${rgbaToHex(fgColor)}`}
        />
        <div
          class="color-swatch bg"
          style={{ backgroundColor: rgbaToCss(bgColor) }}
          title={`BG: #${rgbaToHex(bgColor)}`}
        />
        <button class="btn-tiny swap-btn" onClick={swapColors} title="Swap (X)">X</button>
      </div>

      {/* Palette selector */}
      <select
        class="palette-select"
        value={activePaletteSlug}
        onChange={(e) => setActivePalette((e.target as HTMLSelectElement).value)}
      >
        {filteredPalettes.map(p => (
          <option key={p.slug} value={p.slug}>
            {p.title} ({p.colorCount})
          </option>
        ))}
      </select>

      {palettes.length > 10 && (
        <input
          class="palette-search"
          type="text"
          placeholder="Search palettes..."
          value={search}
          onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
        />
      )}

      {/* Color swatches grid — fills available space */}
      <div class="palette-grid" ref={gridRef}>
        {activePalette?.colors.map((hex, i) => {
          const color = hexToRgba(hex);
          const isActive = fgColor.r === color.r && fgColor.g === color.g && fgColor.b === color.b;
          return (
            <button
              key={i}
              class={`palette-color ${isActive ? 'selected' : ''}`}
              style={{ backgroundColor: `#${hex}` }}
              title={`#${hex}`}
              onClick={() => setFgColor(color)}
              onContextMenu={(e: Event) => { e.preventDefault(); setBgColor(color); }}
            />
          );
        })}
      </div>

      {/* Hex import/export */}
      <div class="palette-actions">
        <button class="btn-small" onClick={handleImportHex}>Import .hex</button>
        <button class="btn-small" onClick={handleExportHex} disabled={!activePalette}>Export .hex</button>
      </div>
    </div>
  );
}
