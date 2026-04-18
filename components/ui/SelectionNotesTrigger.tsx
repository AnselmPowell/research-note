import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { useTextSelection } from '../../hooks/useTextSelection';
import { CreateNoteModal } from '../library/CreateNoteModal';
import { useDatabase } from '../../database/DatabaseContext';

export const SelectionNotesTrigger = () => {
  const selection = useTextSelection();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalData, setModalData] = useState({ text: '', uri: '', title: '' });
  const { savedPapers, saveNote } = useDatabase();

  const handleCreateNote = (e: React.MouseEvent) => {
    // Prevent the click from instantly clearing the text selection focus
    e.preventDefault(); 
    e.stopPropagation();

    if (selection) {
      setModalData({ 
        text: selection.text, 
        uri: selection.paperUri,
        title: selection.paperTitle 
      });
      setIsModalOpen(true);
      // Clear native selection so the trigger disappears smoothly
      window.getSelection()?.removeAllRanges();
    }
  };

  return (
    <>
      {selection && !isModalOpen && selection.position && (
        <button
          className="selection-copy-button dark:bg-scholar-400"
          style={{ 
            top: `${selection.position.y}px`, 
            left: `${selection.position.x}px`,
          }}
          onClick={handleCreateNote}
          onMouseDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
          }}
        >
          <Plus size={14} />
          Create Note
        </button>
      )}

      <CreateNoteModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        savedPapers={savedPapers}
        onSave={async (note, paperMetadata) => {
          await saveNote(note, paperMetadata);
          setIsModalOpen(false);
        }}
        initialContent={modalData.text}
        initialPaperUri={modalData.uri}
      />
    </>
  );
};
