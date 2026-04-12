import { useState, useRef, useEffect } from 'preact/hooks';
import { useEditorStore } from '../state/editor-store';
import { saveWsprite, openWsprite, exportPng } from '../formats/file-manager';

interface MenuItem {
  label: string;
  shortcut?: string;
  action?: () => void;
  separator?: boolean;
  disabled?: boolean;
}

interface MenuDef {
  label: string;
  items: MenuItem[];
}

function NewFileDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [width, setWidth] = useState(32);
  const [height, setHeight] = useState(32);
  const newCanvas = useEditorStore(s => s.newCanvas);

  if (!open) return null;

  const create = () => {
    newCanvas(width, height);
    onClose();
  };

  const presets = [
    [8, 8], [16, 16], [32, 32], [64, 64], [128, 128], [256, 256],
  ] as const;

  return (
    <div class="dialog-backdrop" onClick={onClose}>
      <div class="dialog" onClick={(e: Event) => e.stopPropagation()}>
        <div class="dialog-title">New Sprite</div>
        <div class="dialog-body">
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <label style={{ flex: 1 }}>
              Width
              <input
                type="number"
                min={1}
                max={1024}
                value={width}
                onInput={(e) => setWidth(parseInt((e.target as HTMLInputElement).value) || 32)}
                style={{ width: '100%', marginTop: '4px' }}
              />
            </label>
            <label style={{ flex: 1 }}>
              Height
              <input
                type="number"
                min={1}
                max={1024}
                value={height}
                onInput={(e) => setHeight(parseInt((e.target as HTMLInputElement).value) || 32)}
                style={{ width: '100%', marginTop: '4px' }}
              />
            </label>
          </div>
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            {presets.map(([w, h]) => (
              <button
                key={`${w}x${h}`}
                class="btn-small"
                onClick={() => { setWidth(w); setHeight(h); }}
              >
                {w}x{h}
              </button>
            ))}
          </div>
        </div>
        <div class="dialog-footer">
          <button class="btn" onClick={onClose}>Cancel</button>
          <button class="btn btn-primary" onClick={create}>Create</button>
        </div>
      </div>
    </div>
  );
}

export function MenuBar() {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [newFileOpen, setNewFileOpen] = useState(false);
  const menuBarRef = useRef<HTMLDivElement>(null);

  const store = useEditorStore();

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuBarRef.current && !menuBarRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key === 's' && !e.shiftKey) {
        e.preventDefault();
        saveWsprite();
      } else if (ctrl && e.key === 'e' && e.shiftKey) {
        e.preventDefault();
        exportPng();
      } else if (ctrl && e.key === 'o' && !e.shiftKey) {
        e.preventDefault();
        openWsprite();
      } else if (ctrl && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        store.undo();
      } else if (ctrl && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        store.redo();
      } else if (ctrl && e.key === 'N' && e.shiftKey) {
        e.preventDefault();
        store.addLayer();
      } else if (e.key === 'b' && !ctrl) {
        store.setTool('pen');
      } else if (e.key === 'e' && !ctrl) {
        store.setTool('eraser');
      } else if (e.key === 'x' && !ctrl) {
        store.swapColors();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [store]);

  const menus: MenuDef[] = [
    {
      label: 'File',
      items: [
        { label: 'New...', shortcut: 'Ctrl+N', action: () => { setNewFileOpen(true); setOpenMenu(null); } },
        { label: 'Open...', shortcut: 'Ctrl+O', action: () => { openWsprite(); setOpenMenu(null); } },
        { label: 'Save', shortcut: 'Ctrl+S', action: () => { saveWsprite(); setOpenMenu(null); } },
        { separator: true, label: '' },
        { label: 'Export PNG', shortcut: 'Ctrl+Shift+E', action: () => { exportPng(); setOpenMenu(null); } },
      ],
    },
    {
      label: 'Edit',
      items: [
        { label: 'Undo', shortcut: 'Ctrl+Z', action: () => { store.undo(); setOpenMenu(null); } },
        { label: 'Redo', shortcut: 'Ctrl+Shift+Z', action: () => { store.redo(); setOpenMenu(null); } },
      ],
    },
    {
      label: 'Layer',
      items: [
        { label: 'New Layer', shortcut: 'Ctrl+Shift+N', action: () => { store.addLayer(); setOpenMenu(null); } },
        { label: 'Delete Layer', action: () => { store.deleteLayer(store.activeLayerId); setOpenMenu(null); } },
        { label: 'Duplicate Layer', action: () => { store.duplicateLayer(store.activeLayerId); setOpenMenu(null); } },
        { separator: true, label: '' },
        { label: 'Merge Down', action: () => { store.mergeDown(store.activeLayerId); setOpenMenu(null); } },
      ],
    },
  ];

  return (
    <>
      <div ref={menuBarRef} class="menu-bar">
        {menus.map(menu => (
          <div key={menu.label} class="menu-trigger-wrapper">
            <button
              class={`menu-trigger ${openMenu === menu.label ? 'active' : ''}`}
              onClick={() => setOpenMenu(openMenu === menu.label ? null : menu.label)}
              onMouseEnter={() => openMenu && setOpenMenu(menu.label)}
            >
              {menu.label}
            </button>
            {openMenu === menu.label && (
              <div class="menu-dropdown">
                {menu.items.map((item, i) =>
                  item.separator ? (
                    <div key={i} class="menu-separator" />
                  ) : (
                    <button
                      key={item.label}
                      class="menu-item"
                      onClick={item.action}
                      disabled={item.disabled}
                    >
                      <span>{item.label}</span>
                      {item.shortcut && <span class="menu-shortcut">{item.shortcut}</span>}
                    </button>
                  )
                )}
              </div>
            )}
          </div>
        ))}
        <div style={{ flex: 1 }} />
        <span class="menu-title">{store.fileName}{store.dirty ? ' *' : ''}</span>
      </div>
      <NewFileDialog open={newFileOpen} onClose={() => setNewFileOpen(false)} />
    </>
  );
}
