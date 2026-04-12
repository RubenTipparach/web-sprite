import { useState, useRef } from 'preact/hooks';
import { useEditorStore } from '../state/editor-store';

export function LayerPanel() {
  const layers = useEditorStore(s => s.layers);
  const activeLayerId = useEditorStore(s => s.activeLayerId);
  const setActiveLayer = useEditorStore(s => s.setActiveLayer);
  const toggleVisibility = useEditorStore(s => s.toggleLayerVisibility);
  const toggleLock = useEditorStore(s => s.toggleLayerLock);
  const renameLayer = useEditorStore(s => s.renameLayer);
  const addLayer = useEditorStore(s => s.addLayer);
  const deleteLayer = useEditorStore(s => s.deleteLayer);
  const duplicateLayer = useEditorStore(s => s.duplicateLayer);
  const reorderLayer = useEditorStore(s => s.reorderLayer);
  const setLayerOpacity = useEditorStore(s => s.setLayerOpacity);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const dragIdxRef = useRef<number | null>(null);

  const displayLayers = [...layers].reverse(); // top layer first in UI

  const startRename = (id: string, name: string) => {
    setEditingId(id);
    setEditName(name);
  };

  const commitRename = () => {
    if (editingId && editName.trim()) {
      renameLayer(editingId, editName.trim());
    }
    setEditingId(null);
  };

  const handleDragStart = (displayIdx: number) => {
    dragIdxRef.current = displayIdx;
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (displayIdx: number) => {
    if (dragIdxRef.current === null) return;
    // Convert display indices to array indices (reversed)
    const fromArray = layers.length - 1 - dragIdxRef.current;
    const toArray = layers.length - 1 - displayIdx;
    reorderLayer(fromArray, toArray);
    dragIdxRef.current = null;
  };

  const activeLayer = layers.find(l => l.id === activeLayerId);

  return (
    <div class="layer-panel">
      <div class="panel-header">Layers</div>

      <div class="layer-list">
        {displayLayers.map((layer, displayIdx) => (
          <div
            key={layer.id}
            class={`layer-item ${layer.id === activeLayerId ? 'active' : ''}`}
            onClick={() => setActiveLayer(layer.id)}
            draggable
            onDragStart={() => handleDragStart(displayIdx)}
            onDragOver={handleDragOver}
            onDrop={() => handleDrop(displayIdx)}
          >
            <button
              class={`layer-vis ${layer.visible ? 'on' : 'off'}`}
              onClick={(e: Event) => { e.stopPropagation(); toggleVisibility(layer.id); }}
              title={layer.visible ? 'Hide layer' : 'Show layer'}
            >
              {layer.visible ? '\u{1F441}' : '\u25CB'}
            </button>

            <button
              class={`layer-lock ${layer.locked ? 'on' : ''}`}
              onClick={(e: Event) => { e.stopPropagation(); toggleLock(layer.id); }}
              title={layer.locked ? 'Unlock' : 'Lock'}
            >
              {layer.locked ? '\u{1F512}' : ''}
            </button>

            {editingId === layer.id ? (
              <input
                class="layer-name-input"
                value={editName}
                onInput={(e) => setEditName((e.target as HTMLInputElement).value)}
                onBlur={commitRename}
                onKeyDown={(e: KeyboardEvent) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setEditingId(null); }}
                autoFocus
                onClick={(e: Event) => e.stopPropagation()}
              />
            ) : (
              <span
                class="layer-name"
                onDblClick={(e: Event) => { e.stopPropagation(); startRename(layer.id, layer.name); }}
              >
                {layer.name}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Opacity slider for active layer */}
      {activeLayer && (
        <div class="layer-opacity">
          <label>Opacity</label>
          <input
            type="range"
            min={0}
            max={255}
            value={activeLayer.opacity}
            onInput={(e) => setLayerOpacity(activeLayerId, parseInt((e.target as HTMLInputElement).value))}
          />
          <span>{Math.round(activeLayer.opacity / 255 * 100)}%</span>
        </div>
      )}

      <div class="layer-actions">
        <button class="btn-small" onClick={addLayer} title="New Layer">+</button>
        <button
          class="btn-small"
          onClick={() => duplicateLayer(activeLayerId)}
          title="Duplicate Layer"
        >
          Dup
        </button>
        <button
          class="btn-small"
          onClick={() => deleteLayer(activeLayerId)}
          title="Delete Layer"
          disabled={layers.length <= 1}
        >
          Del
        </button>
      </div>
    </div>
  );
}
