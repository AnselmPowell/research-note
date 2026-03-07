
import React, { useRef, useEffect, useState } from 'react';
import { X, Check, AlertCircle, Loader2, File, Edit2, CornerDownLeft } from 'lucide-react';
import { TagData } from '../../types';

interface EditableTagProps {
  type: 'topic' | 'url' | 'query';
  index: number;
  tag: string | TagData;
  isEditing: boolean;
  editingValue: string;
  onRemove: (index: number) => void;
  onEditChange: (value: string) => void;
  onEditFinish: () => void;
  onStartEdit: (type: 'topic' | 'url' | 'query', index: number, value: string) => void;
}

export const EditableTag: React.FC<EditableTagProps> = ({
  type,
  index,
  tag,
  isEditing,
  editingValue,
  onRemove,
  onEditChange,
  onEditFinish,
  onStartEdit
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [showEditHint, setShowEditHint] = useState(false);

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // Click-outside detection to save edits
  useEffect(() => {
    if (!isEditing) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      // If click is outside the tag container, save the edit
      if (containerRef.current && !containerRef.current.contains(target)) {
        onEditFinish();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isEditing, onEditFinish]);

  const getValue = () => typeof tag === 'string' ? tag : tag.value;
  const getStatus = () => typeof tag === 'object' ? tag.status : undefined;

  const content = getValue();
  const status = getStatus();

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onEditFinish();
    } else if (e.key === 'Escape') {
      // Logic to cancel edit could be handled by parent if needed, 
      // but strictly onEditFinish usually commits. 
      // For now, we just finish (which effectively cancels if value didn't change, 
      // or commits current text. To fully cancel, parent needs 'onCancel' prop).
      onEditFinish(); 
    }
  };

  // Determine styles based on type and status to preserve app theme
  let tagColorClass = "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700"; // Default neutral
  
  if (type === 'url') {
      if (status === 'loading') {
          // Loading: Scholar Red Light
          tagColorClass = "bg-scholar-500 text-white border-transparent";
      } else if (status === 'invalid') {
          // Invalid: Darker with Error Border
          tagColorClass = "bg-gray-700 text-white border-error-500 ring-1 ring-error-500";
      } else if (status === 'valid') {
          // Valid: Primary Scholar Brand
          tagColorClass = "bg-scholar-600 text-white border-transparent";
      } else {
          // Default URL
          tagColorClass = "bg-scholar-700 text-white border-transparent";
      }
  } else {
      // Topics/Queries: Light Scholar Theme
      tagColorClass = "bg-scholar-600/10 text-scholar-700 border-scholar-200 dark:text-scholar-300 dark:border-scholar-800";
  }

  const hoverColorClass = type === 'url' ? 'hover:opacity-90' : 'hover:bg-scholar-600/20';

  if (isEditing) {
    return (
      <div 
        ref={containerRef}
        className={`relative flex items-center gap-1 font-medium rounded-full px-3 py-1.5 text-sm ring-2 ring-scholar-600 border-scholar-500 transition-all duration-200 transform bg-white dark:bg-gray-900 border border-scholar-500`}
      >
        <input
          ref={inputRef}
          type="text"
          value={editingValue}
          onChange={(e) => onEditChange(e.target.value)}
          onKeyDown={handleKeyDown}
          style={{ width: `${Math.max(editingValue.length, 1) + 2}ch` }}
          className="bg-transparent border-none focus:outline-none text-sm min-w-[60px] max-w-[300px] text-gray-900 dark:text-white"
        />
        
        {/* Colored Enter Icon - indicates to press Enter to save */}
        <button
          onClick={() => onEditFinish()}
          className="p-0.5 text-scholar-600 dark:text-scholar-400 hover:text-scholar-700 dark:hover:text-scholar-300 hover:bg-scholar-50 dark:hover:bg-scholar-900/30 rounded transition-colors flex-shrink-0"
          title="Save changes (press Enter)"
        >
          <CornerDownLeft size={14} />
        </button>
      </div>
    );
  }

  return (
    <div 
      className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition-all duration-200 ease-in-out group ${tagColorClass} ${showEditHint ? hoverColorClass : ''}`}
      onMouseEnter={() => setShowEditHint(true)}
      onMouseLeave={() => setShowEditHint(false)}
    >
      <span 
        onClick={() => {
            // Prevent editing valid URLs if desired (matching snippet logic), 
            // or allow if user really wants to fix a typo. 
            // Here we allow editing only for non-valid URLs or any Topic/Query.
            if (!(type === 'url' && status === 'valid')) {
                onStartEdit(type, index, content);
            }
        }}
        className={`flex items-center gap-1.5 select-none max-w-[300px] truncate ${(type === 'url' && status === 'valid') ? 'cursor-default' : 'cursor-text group-hover:cursor-pointer'}`}
        title={content}
      >
        {status === 'loading' && <Loader2 size={12} className="animate-spin" />}
        {status === 'invalid' && <AlertCircle size={12} />}
        {status === 'valid' && type === 'url' && <Check size={12} />}
        
        <span className="truncate">{content}</span>

        {/* Edit Hint Icon - Only show for editable tags */}
        {!(type === 'url' && status === 'valid') && (
             <Edit2 size={10} className="opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
        )}
      </span>
      
      <button
        onClick={() => onRemove(index)}
        className={`p-0.5 rounded-full opacity-60 hover:opacity-100 transition-opacity focus:outline-none ${type === 'url' ? 'hover:bg-white/20' : 'hover:bg-black/5 dark:hover:bg-white/10'}`}
        aria-label="Remove tag"
      >
        <X size={14} />
      </button>
    </div>
  );
};
