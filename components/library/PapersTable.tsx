
import React from 'react';
import {
    Square,
    Check,
    ChevronDown,
    ChevronUp,
    Loader2,
    BookText,
    Bookmark,
    Trash2,
    ArrowUpDown,
    FileText
} from 'lucide-react';
import { DeepResearchResult, DeepResearchNote } from '../../types';

interface PapersTableProps {
    papers: DeepResearchResult[];
    selectedUris: string[];
    expandedUris: Set<string>;
    sortColumn: string;
    sortDirection: 'asc' | 'desc';
    onSort: (column: string) => void;
    onSelect: (paper: DeepResearchResult) => void;
    onExpand: (uri: string) => void;
    onDelete: (paper: DeepResearchResult) => void;
    onView: (paper: DeepResearchResult) => void;
    getNotesCount: (uri: string) => number;
    isDownloading: (uri: string) => boolean;
    isFailed: (uri: string) => boolean;
}

export const PapersTable: React.FC<PapersTableProps> = ({
    papers,
    selectedUris,
    expandedUris,
    sortColumn,
    sortDirection,
    onSort,
    onSelect,
    onExpand,
    onDelete,
    onView,
    getNotesCount,
    isDownloading
}) => {

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
                            className="py-3 px-4 cursor-pointer hover:text-scholar-600 transition-colors group select-none"
                            onClick={() => onSort('title')}
                        >
                            <div className="flex items-center">
                                Title
                                <SortIcon column="title" />
                            </div>
                        </th>
                        <th
                            className="hidden md:table-cell py-3 px-4 w-1/4 cursor-pointer hover:text-scholar-600 transition-colors group select-none"
                            onClick={() => onSort('authors')}
                        >
                            <div className="flex items-center">
                                Authors
                                <SortIcon column="authors" />
                            </div>
                        </th>
                        <th
                            className="hidden lg:table-cell py-3 px-4 w-24 cursor-pointer hover:text-scholar-600 transition-colors group select-none"
                            onClick={() => onSort('year')}
                        >
                            <div className="flex items-center">
                                Year
                                <SortIcon column="year" />
                            </div>
                        </th>
                        <th className="hidden sm:table-cell py-3 px-4 w-24 text-center">Status</th>
                        <th className="py-3 px-4 w-24 text-right">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {papers.length > 0 ? papers.map((paper) => {
                        const isSelected = selectedUris.includes(paper.uri);
                        const isExpanded = expandedUris.has(paper.uri);
                        const notesCount = getNotesCount(paper.uri);
                        const year = paper.created_at || paper.published || paper.publishedDate ? new Date(paper.created_at || paper.published || paper.publishedDate).getFullYear() : '—';
                        const authors = Array.isArray(paper.authors) ? paper.authors.join(', ') : (paper.authors || 'Unknown');

                        return (
                            <React.Fragment key={paper.uri}>
                                <tr
                                    className={`group transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer ${isExpanded ? 'bg-gray-50 dark:bg-gray-800/30' : ''}`}
                                    onClick={() => onExpand(paper.uri)}
                                >
                                    <td className="py-5 pl-4 vertical-top" onClick={(e) => e.stopPropagation()}>
                                        <button
                                            onClick={() => onSelect(paper)}
                                            className={`p-1 rounded-md transition-colors ${isSelected ? 'text-scholar-600 bg-scholar-50 dark:bg-scholar-900/20' : 'text-gray-300 hover:text-gray-500'}`}
                                        >
                                            {isSelected ? <Check size={18} /> : <Square size={18} />}
                                        </button>
                                    </td>

                                    <td className="py-5 px-4">
                                        <div className="flex flex-col gap-1">
                                            <span className="font-semibold text-gray-900 dark:text-gray-100 text-sm leading-snug group-hover:text-scholar-600 transition-colors">
                                                {paper.title}
                                            </span>
                                            {/* Mobile-only metadata */}
                                            <div className="md:hidden flex items-center gap-2 text-xs text-gray-500">
                                                <span>{year}</span>
                                                <span>•</span>
                                                <span className="truncate max-w-[150px]">{authors}</span>
                                            </div>
                                        </div>
                                    </td>

                                    <td className="hidden md:table-cell py-5 px-4">
                                        <span className="text-sm text-gray-600 dark:text-gray-400 line-clamp-1 italic">
                                            {authors}
                                        </span>
                                    </td>

                                    <td className="hidden lg:table-cell py-5 px-4">
                                        <span className="text-sm text-gray-500 font-medium">
                                            {year}
                                        </span>
                                    </td>

                                    <td className="hidden sm:table-cell py-5 px-4 text-center">
                                        <div className="flex items-center justify-center gap-2">
                                            {notesCount > 0 && (
                                                <div className="flex items-center gap-1 text-xs font-bold text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-full">
                                                    <FileText size={10} /> {notesCount}
                                                </div>
                                            )}
                                        </div>
                                    </td>

                                    <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                                        <div className="flex items-center justify-end gap-1">
                                            <button
                                                onClick={() => onView(paper)}
                                                className="p-1.5 text-gray-400 hover:text-scholar-600 hover:bg-scholar-50 dark:hover:bg-scholar-900/20 rounded-lg transition-all"
                                                title="View PDF"
                                            >
                                                {isDownloading(paper.uri) ? <Loader2 size={16} className="animate-spin" /> : <BookText size={16} />}
                                            </button>
                                            <button
                                                onClick={() => onDelete(paper)}
                                                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
                                                title="Delete"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                            <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-1" />
                                            <button
                                                onClick={() => onExpand(paper.uri)}
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
                                        <td colSpan={6} className="p-0">
                                            <div className="px-4 py-4 sm:px-14 pb-6 space-y-4">
                                                <div className="flex flex-wrap gap-2 mb-2">
                                                    {/* Mobile badges shown in expanded view */}
                                                    <div className="sm:hidden flex items-center gap-2">
                                                        {notesCount > 0 && (
                                                            <span className="bg-white border border-gray-200 text-gray-600 text-[10px] font-bold uppercase px-2 py-1 rounded-md flex items-center gap-1">
                                                                <FileText size={10} /> {notesCount} Notes
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>

                                                <div>
                                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Abstract</h4>
                                                    <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed font-serif">
                                                        {paper.abstract || "No abstract available for this document."}
                                                    </p>
                                                </div>

                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-gray-100 dark:border-gray-800">
                                                    <div>
                                                        <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Full Authors</h4>
                                                        <p className="text-xs text-gray-600 dark:text-gray-400 font-medium">
                                                            {Array.isArray(paper.authors) ? paper.authors.join(', ') : (paper.authors || 'Unknown')}
                                                        </p>
                                                    </div>
                                                    <div>
                                                        <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Details</h4>
                                                        <p className="text-xs text-gray-500">
                                                            Source: {new URL(paper.uri).hostname}
                                                            {paper.published ? ` • Published: ${new Date(paper.published).toLocaleDateString()}` : ''}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </React.Fragment>
                        );
                    }) : (
                        <tr>
                            <td colSpan={6} className="py-24 text-center">
                                <div className="flex flex-col items-center justify-center opacity-40">
                                    <FileText size={48} className="mb-4 text-gray-300" />
                                    <p className="text-gray-900 font-bold">No papers found</p>
                                    <p className="text-sm text-gray-500">Try adjusting your filters</p>
                                </div>
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
};
