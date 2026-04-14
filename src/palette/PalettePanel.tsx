import { useEffect, useState, useRef } from 'preact/hooks';
import { usePaletteStore } from '../state/palette-store';
import { useEditorStore } from '../state/editor-store';
import { hexToRgba, rgbaToHex, rgbaToCss } from '../utils/color';
import { parseHex, exportHex } from './hex-format';

function PaletteDropdown({
  palettes,
  activePaletteSlug,
  onSelect,
  search,
  onSearchChange,
}: {
  palettes: { slug: string; title: string; colorCount: number; colors: string[] }[];
  activePaletteSlug: string;
  onSelect: (slug: string) => void;
  search: string;
  onSearchChange: (s: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const activePalette = palettes.find(p => p.slug === activePaletteSlug);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: Event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    // Delay to avoid the click that opened it
    const raf = requestAnimationFrame(() => {
      document.addEventListener('pointerdown', handleClick);
    });
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('pointerdown', handleClick);
    };
  }, [open]);

  const filtered = search
    ? palettes.filter(p => p.title.toLowerCase().includes(search.toLowerCase()))
    : palettes;

  return (
    <div class="palette-dropdown-wrapper" ref={dropdownRef}>
      <button
        class="palette-dropdown-trigger"
        onClick={() => setOpen(!open)}
      >
        <span class="pdt-name">{activePalette?.title ?? 'Select palette'}</span>
        <span class="pdt-count">({activePalette?.colorCount ?? 0})</span>
        <span class="pdt-preview">
          {activePalette?.colors.slice(0, 8).map((hex, i) => (
            <span key={i} class="pdt-dot" style={{ backgroundColor: `#${hex}` }} />
          ))}
          {(activePalette?.colors.length ?? 0) > 8 && <span class="pdt-more">+</span>}
        </span>
        <span class="pdt-arrow">{open ? '\u25B2' : '\u25BC'}</span>
      </button>

      {open && (
        <div class="palette-dropdown-list">
          <input
            class="palette-dropdown-search"
            type="text"
            placeholder="Search palettes..."
            value={search}
            onInput={(e) => onSearchChange((e.target as HTMLInputElement).value)}
            autoFocus
          />
          <div class="palette-dropdown-items">
            {filtered.map(p => (
              <button
                key={p.slug}
                class={`palette-dropdown-item ${p.slug === activePaletteSlug ? 'active' : ''}`}
                onClick={() => { onSelect(p.slug); setOpen(false); }}
              >
                <div class="pdi-header">
                  <span class="pdi-name">{p.title}</span>
                  <span class="pdi-count">{p.colorCount}</span>
                </div>
                <div class="pdi-colors">
                  {p.colors.slice(0, 16).map((hex, i) => (
                    <span key={i} class="pdi-dot" style={{ backgroundColor: `#${hex}` }} />
                  ))}
                  {p.colors.length > 16 && <span class="pdi-more">+{p.colors.length - 16}</span>}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

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

  useEffect(() => {
    if (!loaded) loadPalettes();
  }, [loaded, loadPalettes]);

  const activePalette = palettes.find(p => p.slug === activePaletteSlug);

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

      {/* Palette selector with color previews */}
      <PaletteDropdown
        palettes={palettes}
        activePaletteSlug={activePaletteSlug}
        onSelect={setActivePalette}
        search={search}
        onSearchChange={setSearch}
      />

      {/* Color swatches grid */}
      <div class="palette-grid">
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
