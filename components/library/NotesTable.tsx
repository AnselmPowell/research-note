
import React, { useState } from 'react';
import {
    Square,
    Check,
    ChevronDown,
    ChevronUp,
    Star,
    Flag,
    Edit3,
    Trash2,
    ArrowUpDown,
    MessageSquareQuote,
    BookOpen,
    Copy,
    FileText,
    FileJson,
    MoreHorizontal
} from 'lucide-react';
import { DeepResearchNote, DeepResearchResult } from '../../types';

interface NotesTableProps {
    notes: DeepResearchNote[];
    papers: DeepResearchResult[];
    selectedIds: number[];
    expandedId: number | null; 
    expandedIds: Set<number>;
    sortColumn: string;
    sortDirection: 'asc' | 'desc';
    onSort: (column: string) => void;
    onSelect: (id: number) => void;
    onExpand: (id: number) => void;
    onDelete: (id: number) => void;
    onToggleStar: (id: number, status: boolean) => void;
    onToggleFlag: (id: number, status: boolean) => void;
    onEdit: (id: number) => void;
    onSaveEdit: (id: number, content: string) => Promise<void>;
    onCancelEdit: () => void;
    editingId: number | null;
    onViewPdf: (note: DeepResearchNote) => void;
}

const formatFullNote = (note: DeepResearchNote, paper: DeepResearchResult | undefined) => {
    const authors = paper?.authors ? (Array.isArray(paper.authors) ? paper.authors.join(', ') : paper.authors) : '';
    const citationLines = note.citations?.map((c: any) => `${c.inline} ${c.full}`).join('\n') || '';
  
    return `
  Title: ${paper?.title || 'Untitled Paper'}
  ${authors ? `Authors: ${authors}` : ''}
  Details: Page ${note.page_number}
  ---
  ${note.content}
  ---
  ${citationLines ? `Citations:\n${citationLines}\n` : ''}
  Source: ${note.paper_uri}
  `.trim();
};

export const NotesTable: React.FC<NotesTableProps> = ({
    notes,
    papers,
    selectedIds,
    expandedIds,
    sortColumn,
    sortDirection,
    onSort,
    onSelect,
    onExpand,
    onDelete,
    onToggleStar,
    onToggleFlag,
    onEdit,
    onSaveEdit,
    onCancelEdit,
    editingId,
    onViewPdf
}) => {
    
    // Local state for editing content
    const [editContent, setEditContent] = useState('');
    const [actionMenuOpen, setActionMenuOpen] = useState<number | null>(null);

    // Update edit content when editingId changes
    React.useEffect(() => {
        if (editingId) {
            const note = notes.find(n => n.id === editingId);
            if (note) setEditContent(note.content);
        }
    }, [editingId, notes]);

    // Close menu when clicking outside
    React.useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
             if (actionMenuOpen !== null && !(event.target as Element).closest('.action-menu-trigger')) {
                 setActionMenuOpen(null);
             }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [actionMenuOpen]);

    const handleSave = async (id: number) => {
        if (editContent.trim()) {
            await onSaveEdit(id, editContent);
        }
    };

    const handleCopy = (e: React.MouseEvent, note: DeepResearchNote, full: boolean) => {
        e.stopPropagation();
        const paper = papers.find(p => p.uri === note.paper_uri);
        const text = full ? formatFullNote(note, paper) : note.content;
        navigator.clipboard.writeText(text);
        setActionMenuOpen(null);
    };


    const SortIcon = ({ column }: { column: string }) => {
        if (sortColumn !== column) return <ArrowUpDown size={12} className="opacity-20 ml-1" />;
        return <ArrowUpDown size={12} className={`ml-1 ${sortDirection === 'asc' ? 'rotate-180' : ''} text-scholar-600`} />;
    };

    return (
        <div className="bg-white dark:bg-dark-card rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden animate-fade-in">
            <table className="w-full text-left border-collapse">
                <thead className="bg-gray-50 dark:bg-gray-900/50 text-xs font-bold uppercase tracking-wider text-gray-400">
                    <tr>
                        <th className="py-3 pl-4 w-10">
                            <span className="sr-only">Select</span>
                        </th>
                        <th
                            className="py-3 px-4 cursor-pointer hover:text-scholar-600 transition-colors group select-none w-1/2"
                            onClick={() => onSort('content')}
                        >
                            <div className="flex items-center">
                                Notes
                                <SortIcon column="content" />
                            </div>
                        </th>
                        <th className="hidden lg:table-cell py-3 px-4 w-32 text-left font-semibold text-gray-500 text-xs uppercase tracking-wider">Author</th>
                        <th className="hidden lg:table-cell py-3 px-4 w-20 text-left font-semibold text-gray-500 text-xs uppercase tracking-wider">Year</th>
                        <th
                            className="hidden md:table-cell py-3 px-4 w-1/6 cursor-pointer hover:text-scholar-600 transition-colors group select-none"
                            onClick={() => onSort('paper')}
                        >
                            <div className="flex items-center">
                                Source
                                <SortIcon column="paper" />
                            </div>
                        </th>
                        <th
                            className="hidden lg:table-cell py-3 px-4 w-20 cursor-pointer hover:text-scholar-600 transition-colors group select-none"
                            onClick={() => onSort('page')}
                        >
                            <div className="flex items-center">
                                Page
                                <SortIcon column="page" />
                            </div>
                        </th>
                        <th className="hidden sm:table-cell py-3 px-4 w-24 text-center">Tags</th>
                        <th className="hidden xl:table-cell py-3 px-4 w-48 text-left font-semibold text-gray-500 text-xs uppercase tracking-wider">Query</th>
                        <th className="py-3 px-4 w-24 text-right">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {notes.length > 0 ? notes.map((note) => {
                        const isSelected = selectedIds.includes(note.id!);
                        const isExpanded = expandedIds.has(note.id!);
                        const paper = papers.find(p => p.uri === note.paper_uri);
                        const paperTitle = paper?.title || 'Unknown Source';

                        return (
                            <React.Fragment key={note.id}>
                                <tr
                                    className={`group transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer ${isExpanded ? 'bg-gray-50 dark:bg-gray-800/30' : ''}`}
                                    onClick={() => onExpand(note.id!)}
                                >
                                    <td className="py-5 pl-4 vertical-top" onClick={(e) => e.stopPropagation()}>
                                        <button
                                            onClick={() => onSelect(note.id!)}
                                            className={`p-1 rounded-md transition-colors ${isSelected ? 'text-scholar-600 bg-scholar-50 dark:bg-scholar-900/20' : 'text-gray-300 hover:text-gray-500'}`}
                                        >
                                            {isSelected ? <Check size={18} /> : <Square size={18} />}
                                        </button>
                                    </td>

                                    <td className="py-5 px-4">
                                        <div className="flex flex-col gap-1">
                                            {editingId === note.id ? (
                                                <div className="space-y-2">
                                                   <textarea
                                                     className="w-full p-3 bg-scholar-50 dark:bg-gray-900 border border-scholar-200 dark:border-gray-700 rounded-lg outline-none text-sm font-sans italic text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-scholar-500/20 transition-all resize-y"
                                                     value={editContent}
                                                     onChange={(e) => setEditContent(e.target.value)}
                                                     rows={3}
                                                     autoFocus
                                                     onClick={(e) => e.stopPropagation()}
                                                   />
                                                   <div className="flex items-center gap-2">
                                                     <button
                                                       onClick={(e) => { e.stopPropagation(); handleSave(note.id!); }}
                                                       className="px-3 py-1 bg-scholar-600 hover:bg-scholar-700 text-white text-xs font-bold rounded-md transition-colors shadow-sm"
                                                     >
                                                       Save
                                                     </button>
                                                     <button
                                                       onClick={(e) => { e.stopPropagation(); onCancelEdit(); }}
                                                       className="px-3 py-1 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 text-xs font-bold rounded-md transition-colors"
                                                     >
                                                       Cancel
                                                     </button>
                                                   </div>
                                                </div>
                                            ) : (
                                                <>
                                                    <p className="text-sm text-gray-800 dark:text-gray-200 line-clamp-2 font-medium">
                                                        "{note.content}"
                                                    </p>
                                                    {/* Mobile-only metadata */}
                                                    <div className="md:hidden flex items-center gap-2 text-xs text-gray-500 mt-1">
                                                        <span className="truncate max-w-[150px] font-bold text-scholar-600">{paperTitle}</span>
                                                        <span>•</span>
                                                        <span>p.{note.page_number}</span>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </td>

                                    <td className="hidden lg:table-cell py-5 px-4 vertical-top">
                                         <span className="text-xs text-gray-600 dark:text-gray-400 font-medium line-clamp-1" title={Array.isArray(paper?.authors) ? paper?.authors.join(', ') : paper?.authors}>
                                            {Array.isArray(paper?.authors) ? (paper?.authors[0] + (paper!.authors.length > 1 ? ' et al.' : '')) : (paper?.authors || 'Unknown')}
                                        </span>
                                    </td>
                                    
                                    <td className="hidden lg:table-cell py-5 px-4 vertical-top">
                                        <span className="text-xs text-gray-500 font-mono">
                                            {paper?.year || (paper?.published ? new Date(paper.published).getFullYear() : '-')}
                                        </span>
                                    </td>

                                    <td className="hidden md:table-cell py-5 px-4 vertical-top">
                                        <span
                                            className="text-xs font-bold text-scholar-600 hover:underline cursor-pointer truncate block max-w-[200px]"
                                            onClick={(e) => { e.stopPropagation(); onViewPdf(note); }}
                                        >
                                            {paperTitle}
                                        </span>
                                    </td>

                                    <td className="hidden lg:table-cell py-3 px-4">
                                        <span className="text-xs text-gray-500 font-mono">
                                            p.{note.page_number}
                                        </span>
                                    </td>

                                    <td className="hidden sm:table-cell py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                                        <div className="flex items-center justify-center gap-1">
                                            <button
                                                onClick={() => onToggleStar(note.id!, !note.is_starred)}
                                                className={`p-1.5 rounded-full transition-colors ${note.is_starred ? 'text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20' : 'text-gray-300 hover:text-yellow-400'}`}
                                            >
                                                <Star size={14} fill={note.is_starred ? "currentColor" : "none"} />
                                            </button>
                                            <button
                                                onClick={() => onToggleFlag(note.id!, !note.is_flagged)}
                                                className={`p-1.5 rounded-full transition-colors ${note.is_flagged ? 'text-red-500 bg-red-50 dark:bg-red-900/20' : 'text-gray-300 hover:text-red-500'}`}
                                            >
                                                <Flag size={14} fill={note.is_flagged ? "currentColor" : "none"} />
                                            </button>
                                        </div>
                                    </td>

                                    <td className="hidden xl:table-cell py-5 px-4 vertical-top">
                                        <span className="text-xs text-gray-500 italic line-clamp-2" title={note.related_question}>
                                            {note.related_question || '-'}
                                        </span>
                                    </td>

                                    <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                                        <div className="flex items-center justify-end gap-1 relative">
                                            <button
                                                onClick={() => onViewPdf(note)}
                                                className="p-1.5 text-gray-400 hover:text-scholar-600 hover:bg-scholar-50 dark:hover:bg-scholar-900/20 rounded-lg transition-all"
                                                title="View in PDF"
                                            >
                                                <BookOpen size={16} />
                                            </button>
                                            <button
                                                onClick={() => onEdit(note.id!)}
                                                className="p-1.5 text-gray-400 hover:text-scholar-600 hover:bg-scholar-50 dark:hover:bg-scholar-900/20 rounded-lg transition-all"
                                                title="Edit Note"
                                            >
                                                <Edit3 size={16} />
                                            </button>
                                            
                                            <div className="relative">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setActionMenuOpen(actionMenuOpen === note.id ? null : note.id!); }}
                                                    className="p-1.5 text-gray-400 hover:text-scholar-600 hover:bg-scholar-50 dark:hover:bg-scholar-900/20 rounded-lg transition-all action-menu-trigger"
                                                    title="Copy options"
                                                >
                                                    <Copy size={16} />
                                                </button>
                                                
                                                {actionMenuOpen === note.id && (
                                                    <div className="absolute right-0 top-full mt-1 w-40 bg-white dark:bg-dark-card rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 py-1 z-50 animate-fade-in overflow-hidden">
                                                        <button
                                                            onClick={(e) => handleCopy(e, note, false)}
                                                            className="w-full text-left px-4 py-2 text-xs font-bold text-gray-600 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2"
                                                        >
                                                            <FileText size={14} /> Copy Text
                                                        </button>
                                                        <button
                                                            onClick={(e) => handleCopy(e, note, true)}
                                                            className="w-full text-left px-4 py-2 text-xs font-bold text-scholar-600 dark:text-scholar-400 hover:bg-scholar-50 dark:hover:bg-scholar-900/20 flex items-center gap-2"
                                                        >
                                                            <FileJson size={14} /> Copy Full
                                                        </button>
                                                    </div>
                                                )}
                                            </div>

                                            <button
                                                onClick={() => onDelete(note.id!)}
                                                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
                                                title="Delete"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                            <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-1" />
                                            <button
                                                onClick={() => onExpand(note.id!)}
                                                className={`p-1 text-gray-400 hover:text-gray-600 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                                            >
                                                <ChevronDown size={16} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>

                                {/* Expanded Details Row */}
                                {isExpanded && (
                                    <tr className="bg-gray-50/50 dark:bg-gray-800/20 animate-slide-down">
                                        <td colSpan={9} className="p-0">
                                            <div className="px-4 py-4 sm:px-14 pb-6 space-y-4">
                                                <div className="flex flex-wrap gap-2 mb-2 sm:hidden">
                                                    {/* Mobile star/flag controls */}
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); onToggleStar(note.id!, !note.is_starred); }}
                                                        className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-bold border ${note.is_starred ? 'bg-yellow-50 text-yellow-600 border-yellow-200' : 'bg-white text-gray-500 border-gray-200'}`}
                                                    >
                                                        <Star size={12} fill={note.is_starred ? "currentColor" : "none"} /> {note.is_starred ? 'Starred' : 'Star'}
                                                    </button>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); onToggleFlag(note.id!, !note.is_flagged); }}
                                                        className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-bold border ${note.is_flagged ? 'bg-red-50 text-red-600 border-red-200' : 'bg-white text-gray-500 border-gray-200'}`}
                                                    >
                                                        <Flag size={12} fill={note.is_flagged ? "currentColor" : "none"} /> {note.is_flagged ? 'Flagged' : 'Flag'}
                                                    </button>
                                                </div>

                                                <div className="mb-4">
                                                    <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed font-serif italic bg-white dark:bg-gray-900/50 p-4 rounded-lg border border-gray-100 dark:border-gray-800">
                                                        "{note.content}"
                                                    </p>
                                                </div>

                                                {note.justification && (
                                                    <div>
                                                        <h4 className="text-[10px] font-black uppercase tracking-widest text-scholar-600 mb-1">Justification/Context</h4>
                                                        <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed bg-scholar-50/50 dark:bg-scholar-900/10 p-3 rounded-lg border border-scholar-50 dark:border-scholar-900">
                                                            {note.justification}
                                                        </p>
                                                    </div>
                                                )}

                                                {note.citations && note.citations.length > 0 && (
                                                    <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
                                                        <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Citations</h4>
                                                        <div className="space-y-1">
                                                            {note.citations.map((cit, idx) => (
                                                                <div key={idx} className="text-xs text-gray-600 bg-gray-50 dark:bg-gray-800/50 block p-2 rounded mb-1">
                                                                    <span className="font-bold text-scholar-600 mr-2">{cit.inline}</span>
                                                                    <span className="text-gray-500">{cit.full}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </React.Fragment>
                        );
                    }) : (
                        <tr>
                            <td colSpan={9} className="py-24 text-center">
                                <div className="flex flex-col items-center justify-center opacity-40">
                                    <MessageSquareQuote size={48} className="mb-4 text-gray-300 dark:text-gray-600" />
                                    <p className="text-gray-900 dark:text-white font-bold">No notes found</p>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">Capture insights to fill your ledger</p>
                                </div>
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
};
