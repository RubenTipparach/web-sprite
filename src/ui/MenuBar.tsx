import { useState, useRef, useEffect, useCallback } from 'preact/hooks';
import { createPortal } from 'preact/compat';
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

/** Dropdown rendered via portal to document.body — escapes all grid clipping. */
function MenuDropdown({
  items,
  triggerRef,
  onClose,
}: {
  items: MenuItem[];
  triggerRef: HTMLButtonElement;
  onClose: () => void;
}) {
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    const rect = triggerRef.getBoundingClientRect();
    setPos({ top: rect.bottom, left: rect.left });
  }, [triggerRef]);

  return createPortal(
    <div
      class="menu-dropdown"
      style={{ top: `${pos.top}px`, left: `${pos.left}px` }}
    >
      {items.map((item, i) =>
        item.separator ? (
          <div key={i} class="menu-separator" />
        ) : (
          <button
            key={item.label}
            class="menu-item"
            onClick={() => { item.action?.(); onClose(); }}
            disabled={item.disabled}
          >
            <span>{item.label}</span>
            {item.shortcut && <span class="menu-shortcut">{item.shortcut}</span>}
          </button>
        )
      )}
    </div>,
    document.body,
  );
}

export function MenuBar() {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [newFileOpen, setNewFileOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const menuBarRef = useRef<HTMLDivElement>(null);
  const triggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const fileName = useEditorStore(s => s.fileName);
  const dirty = useEditorStore(s => s.dirty);
  const undoCount = useEditorStore(s => s.undoStack.length);
  const redoCount = useEditorStore(s => s.redoStack.length);

  const storeActions = useRef(useEditorStore.getState());
  useEffect(() => {
    return useEditorStore.subscribe(s => { storeActions.current = s; });
  }, []);

  // Close menu when clicking outside — delayed to avoid same-tick race
  useEffect(() => {
    if (!openMenu) return;
    let armed = false;
    // Don't arm until next frame to avoid closing from the same click that opened
    const rafId = requestAnimationFrame(() => { armed = true; });
    const handleOutsideClick = (e: Event) => {
      if (!armed) return;
      const target = e.target as Node;
      // Don't close if clicking inside the menu bar
      if (menuBarRef.current?.contains(target)) return;
      // Don't close if clicking inside the dropdown portal
      const dropdown = document.querySelector('.menu-dropdown');
      if (dropdown?.contains(target)) return;
      setOpenMenu(null);
    };
    document.addEventListener('pointerdown', handleOutsideClick);
    return () => {
      cancelAnimationFrame(rafId);
      document.removeEventListener('pointerdown', handleOutsideClick);
    };
  }, [openMenu]);

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
      } else if (e.key === 'l' && !ctrl) {
        storeActions.current.setTool('line');
      } else if (e.key === 'r' && !ctrl) {
        storeActions.current.setTool('rect');
      } else if (e.key === 'c' && !ctrl) {
        storeActions.current.setTool('circle');
      } else if (e.key === 'g' && !ctrl) {
        storeActions.current.setTool('fill');
      } else if (e.key === 'h' && !ctrl) {
        storeActions.current.setTool('colorReplace');
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
        { label: 'New...', shortcut: 'Ctrl+N', action: () => setNewFileOpen(true) },
        { label: 'Open...', shortcut: 'Ctrl+O', action: () => openWsprite() },
        { label: 'Open Image...', action: () => openImageWithHiddenData() },
        { label: 'Save', shortcut: 'Ctrl+S', action: () => saveWsprite() },
        { separator: true, label: '' },
        { label: 'Export PNG', shortcut: 'Ctrl+Shift+E', action: () => exportPng() },
        { label: 'Share...', action: () => setShareOpen(true) },
      ],
    },
    {
      label: 'Edit',
      items: [
        { label: 'Undo', shortcut: 'Ctrl+Z', action: () => storeActions.current.undo(), disabled: undoCount === 0 },
        { label: 'Redo', shortcut: 'Ctrl+Shift+Z', action: () => storeActions.current.redo(), disabled: redoCount === 0 },
        { separator: true, label: '' },
        { label: 'Cut', shortcut: 'Ctrl+X', action: () => storeActions.current.cutSelection() },
        { label: 'Copy', shortcut: 'Ctrl+C', action: () => storeActions.current.copySelection() },
        { label: 'Paste', shortcut: 'Ctrl+V', action: () => storeActions.current.pasteClipboard() },
        { label: 'Delete', shortcut: 'Del', action: () => storeActions.current.deleteSelection() },
        { separator: true, label: '' },
        { label: 'Select All', shortcut: 'Ctrl+A', action: () => storeActions.current.selectAll() },
        { label: 'Deselect', shortcut: 'Ctrl+D', action: () => storeActions.current.deselectAll() },
        { separator: true, label: '' },
        { label: 'Clear Layer', action: () => storeActions.current.clearActiveLayer() },
        { label: 'Swap Colors', shortcut: 'X', action: () => storeActions.current.swapColors() },
      ],
    },
    {
      label: 'Layer',
      items: [
        { label: 'New Layer', shortcut: 'Ctrl+Shift+N', action: () => storeActions.current.addLayer() },
        { label: 'Delete Layer', action: () => storeActions.current.deleteLayer(storeActions.current.activeLayerId) },
        { label: 'Duplicate Layer', action: () => storeActions.current.duplicateLayer(storeActions.current.activeLayerId) },
        { separator: true, label: '' },
        { label: 'Merge Down', action: () => storeActions.current.mergeDown(storeActions.current.activeLayerId) },
      ],
    },
  ];

  return (
    <>
      <div ref={menuBarRef} class="menu-bar">
        {menus.map(menu => (
          <div key={menu.label} class="menu-trigger-wrapper">
            <button
              ref={(el) => { triggerRefs.current[menu.label] = el; }}
              class={`menu-trigger ${openMenu === menu.label ? 'active' : ''}`}
              onClick={() => setOpenMenu(openMenu === menu.label ? null : menu.label)}
              onMouseEnter={() => openMenu && setOpenMenu(menu.label)}
            >
              {menu.label}
            </button>
          </div>
        ))}

        {/* Undo/Redo buttons */}
        <button
          class={`menu-action-btn ${undoCount > 0 ? 'has-action' : ''}`}
          onClick={() => storeActions.current.undo()}
          disabled={undoCount === 0}
          title={`Undo (Ctrl+Z)${undoCount > 0 ? ` \u00B7 ${undoCount}` : ''}`}
        >
          {'\u21A9\uFE0F'}
        </button>
        <button
          class={`menu-action-btn ${redoCount > 0 ? 'has-action' : ''}`}
          onClick={() => storeActions.current.redo()}
          disabled={redoCount === 0}
          title={`Redo (Ctrl+Shift+Z)${redoCount > 0 ? ` \u00B7 ${redoCount}` : ''}`}
        >
          {'\u21AA\uFE0F'}
        </button>

        <div style={{ flex: 1 }} />

        <button
          class="menu-action-btn share"
          onClick={() => setShareOpen(true)}
          title="Share sprite"
        >
          {'\u{1F4E4}'} Share
        </button>

        <span class="menu-title">{fileName}{dirty ? ' *' : ''}</span>
      </div>

      {/* Render dropdown via portal — completely outside the grid */}
      {openMenu && triggerRefs.current[openMenu] && (
        <MenuDropdown
          items={menus.find(m => m.label === openMenu)!.items}
          triggerRef={triggerRefs.current[openMenu]!}
          onClose={() => setOpenMenu(null)}
        />
      )}

      <NewFileDialog open={newFileOpen} onClose={() => setNewFileOpen(false)} />
      <ShareDialog open={shareOpen} onClose={() => setShareOpen(false)} />
    </>
  );
}
