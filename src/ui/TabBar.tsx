import { useState } from 'preact/hooks';
import { useEditorStore } from '../state/editor-store';

export function TabBar() {
  const documents = useEditorStore(s => s.documents);
  const activeDocId = useEditorStore(s => s.activeDocId);
  const switchTab = useEditorStore(s => s.switchTab);
  const closeTab = useEditorStore(s => s.closeTab);
  const addTab = useEditorStore(s => s.addTab);
  const setFileName = useEditorStore(s => s.setFileName);

  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const startRename = (docId: string, currentName: string) => {
    // Switch to this tab first
    switchTab(docId);
    setEditingDocId(docId);
    setEditName(currentName.replace('.wsprite', ''));
  };

  const commitRename = () => {
    if (editingDocId && editName.trim()) {
      const name = editName.trim();
      // Ensure it ends with .wsprite
      const fileName = name.endsWith('.wsprite') ? name : `${name}.wsprite`;
      setFileName(fileName);
    }
    setEditingDocId(null);
  };

  return (
    <div class="tab-bar">
      {documents.map(doc => (
        <div
          key={doc.id}
          class={`tab ${doc.id === activeDocId ? 'active' : ''}`}
          onClick={() => switchTab(doc.id)}
          onDblClick={(e: Event) => {
            e.stopPropagation();
            startRename(doc.id, doc.fileName);
          }}
        >
          {editingDocId === doc.id ? (
            <input
              class="tab-rename-input"
              value={editName}
              onInput={(e) => setEditName((e.target as HTMLInputElement).value)}
              onBlur={commitRename}
              onKeyDown={(e: KeyboardEvent) => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') setEditingDocId(null);
              }}
              onClick={(e: Event) => e.stopPropagation()}
              autoFocus
            />
          ) : (
            <span class="tab-name" title={doc.fileName}>
              {doc.fileName.replace('.wsprite', '')}
              {doc.dirty ? ' *' : ''}
            </span>
          )}
          {documents.length > 1 && editingDocId !== doc.id && (
            <button
              class="tab-close"
              onClick={(e: Event) => {
                e.stopPropagation();
                closeTab(doc.id);
              }}
              title="Close tab"
            >
              {'\u00D7'}
            </button>
          )}
        </div>
      ))}
      <button
        class="tab-add"
        onClick={() => addTab(32, 32)}
        title="New tab"
      >
        +
      </button>
    </div>
  );
}
