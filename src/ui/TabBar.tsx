import { useEditorStore } from '../state/editor-store';

export function TabBar() {
  const documents = useEditorStore(s => s.documents);
  const activeDocId = useEditorStore(s => s.activeDocId);
  const switchTab = useEditorStore(s => s.switchTab);
  const closeTab = useEditorStore(s => s.closeTab);
  const addTab = useEditorStore(s => s.addTab);

  return (
    <div class="tab-bar">
      {documents.map(doc => (
        <div
          key={doc.id}
          class={`tab ${doc.id === activeDocId ? 'active' : ''}`}
          onClick={() => switchTab(doc.id)}
        >
          <span class="tab-name">
            {doc.fileName.replace('.wsprite', '')}
            {doc.dirty ? ' *' : ''}
          </span>
          {documents.length > 1 && (
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
