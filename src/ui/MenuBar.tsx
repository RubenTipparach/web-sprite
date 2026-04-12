import { useState, useRef, useEffect } from 'preact/hooks';
import { useEditorStore } from '../state/editor-store';
import { saveWsprite, openWsprite, exportPng } from '../formats/file-manager';
import { importFromShareImage } from '../formats/share-export';
import { ShareDialog } from './ShareDialog';

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

function openImageWithHiddenData() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.png,.jpg,.jpeg';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    const found = await importFromShareImage(file);
    if (!found) {
      alert('No embedded WebSprite data found in this image.');
    }
  };
  input.click();
}

export function MenuBar() {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [newFileOpen, setNewFileOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const menuBarRef = useRef<HTMLDivElement>(null);

  const fileName = useEditorStore(s => s.fileName);
  const dirty = useEditorStore(s => s.dirty);
  const undoCount = useEditorStore(s => s.undoStack.length);
  const redoCount = useEditorStore(s => s.redoStack.length);
  const activeLayerId = useEditorStore(s => s.activeLayerId);

  // Grab stable action references (these never change)
  const storeActions = useRef(useEditorStore.getState());
  useEffect(() => {
    return useEditorStore.subscribe(s => { storeActions.current = s; });
  }, []);

  useEffect(() => {
    const handleOutsideClick = (e: Event) => {
      if (menuBarRef.current && !menuBarRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    // Listen to both mouse and touch for mobile compatibility
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
    };
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
        storeActions.current.undo();
      } else if (ctrl && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        storeActions.current.redo();
      } else if (ctrl && e.key === 'N' && e.shiftKey) {
        e.preventDefault();
        storeActions.current.addLayer();
      } else if (ctrl && e.key === 'a' && !e.shiftKey) {
        e.preventDefault();
        storeActions.current.selectAll();
      } else if (ctrl && e.key === 'd' && !e.shiftKey) {
        e.preventDefault();
        storeActions.current.deselectAll();
      } else if (ctrl && e.key === 'c' && !e.shiftKey) {
        e.preventDefault();
        storeActions.current.copySelection();
      } else if (ctrl && e.key === 'x' && !e.shiftKey) {
        e.preventDefault();
        storeActions.current.cutSelection();
      } else if (ctrl && e.key === 'v' && !e.shiftKey) {
        e.preventDefault();
        storeActions.current.pasteClipboard();
      } else if (e.key === 'Delete' && !ctrl) {
        storeActions.current.deleteSelection();
      } else if (e.key === 'b' && !ctrl) {
        storeActions.current.setTool('pen');
      } else if (e.key === 'e' && !ctrl) {
        storeActions.current.setTool('eraser');
      } else if (e.key === 'm' && !ctrl) {
        storeActions.current.setTool('selection');
      } else if (e.key === 'x' && !ctrl) {
        storeActions.current.swapColors();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const menus: MenuDef[] = [
    {
      label: 'File',
      items: [
        { label: 'New...', shortcut: 'Ctrl+N', action: () => { setNewFileOpen(true); setOpenMenu(null); } },
        { label: 'Open...', shortcut: 'Ctrl+O', action: () => { openWsprite(); setOpenMenu(null); } },
        { label: 'Open Image...', action: () => { openImageWithHiddenData(); setOpenMenu(null); } },
        { label: 'Save', shortcut: 'Ctrl+S', action: () => { saveWsprite(); setOpenMenu(null); } },
        { separator: true, label: '' },
        { label: 'Export PNG', shortcut: 'Ctrl+Shift+E', action: () => { exportPng(); setOpenMenu(null); } },
        { label: 'Share...', action: () => { setShareOpen(true); setOpenMenu(null); } },
      ],
    },
    {
      label: 'Edit',
      items: [
        { label: 'Undo', shortcut: 'Ctrl+Z', action: () => { storeActions.current.undo(); setOpenMenu(null); } },
        { label: 'Redo', shortcut: 'Ctrl+Shift+Z', action: () => { storeActions.current.redo(); setOpenMenu(null); } },
        { separator: true, label: '' },
        { label: 'Select All', shortcut: 'Ctrl+A', action: () => { storeActions.current.selectAll(); setOpenMenu(null); } },
        { label: 'Deselect', shortcut: 'Ctrl+D', action: () => { storeActions.current.deselectAll(); setOpenMenu(null); } },
        { separator: true, label: '' },
        { label: 'Copy', shortcut: 'Ctrl+C', action: () => { storeActions.current.copySelection(); setOpenMenu(null); } },
        { label: 'Cut', shortcut: 'Ctrl+X', action: () => { storeActions.current.cutSelection(); setOpenMenu(null); } },
        { label: 'Paste', shortcut: 'Ctrl+V', action: () => { storeActions.current.pasteClipboard(); setOpenMenu(null); } },
      ],
    },
    {
      label: 'Layer',
      items: [
        { label: 'New Layer', shortcut: 'Ctrl+Shift+N', action: () => { storeActions.current.addLayer(); setOpenMenu(null); } },
        { label: 'Delete Layer', action: () => { storeActions.current.deleteLayer(storeActions.current.activeLayerId); setOpenMenu(null); } },
        { label: 'Duplicate Layer', action: () => { storeActions.current.duplicateLayer(storeActions.current.activeLayerId); setOpenMenu(null); } },
        { separator: true, label: '' },
        { label: 'Merge Down', action: () => { storeActions.current.mergeDown(storeActions.current.activeLayerId); setOpenMenu(null); } },
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

        {/* Undo/Redo buttons always visible */}
        <button
          class={`menu-action-btn ${undoCount > 0 ? 'has-action' : ''}`}
          onClick={() => storeActions.current.undo()}
          disabled={undoCount === 0}
          title={`Undo (Ctrl+Z)${undoCount > 0 ? ` \u00B7 ${undoCount} step${undoCount > 1 ? 's' : ''}` : ''}`}
        >
          {'\u21A9\uFE0F'}
        </button>
        <button
          class={`menu-action-btn ${redoCount > 0 ? 'has-action' : ''}`}
          onClick={() => storeActions.current.redo()}
          disabled={redoCount === 0}
          title={`Redo (Ctrl+Shift+Z)${redoCount > 0 ? ` \u00B7 ${redoCount} step${redoCount > 1 ? 's' : ''}` : ''}`}
        >
          {'\u21AA\uFE0F'}
        </button>

        <div style={{ flex: 1 }} />

        {/* Share button */}
        <button
          class="menu-action-btn share"
          onClick={() => setShareOpen(true)}
          title="Share sprite"
        >
          {'\u{1F4E4}'} Share
        </button>

        <span class="menu-title">{fileName}{dirty ? ' *' : ''}</span>
      </div>
      <NewFileDialog open={newFileOpen} onClose={() => setNewFileOpen(false)} />
      <ShareDialog open={shareOpen} onClose={() => setShareOpen(false)} />
    </>
  );
}
