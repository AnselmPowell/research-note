
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
    FileText,
    StickyNote,
    Sparkles,
    PlusCircle,
    RotateCcw
} from 'lucide-react';
import { DeepResearchResult, DeepResearchNote } from '../../types';
import { useState } from 'react';
import { AgentResponseFormatter } from './PaperDetails';

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
    onTitleClick: (paper: DeepResearchResult) => void; // Added onTitleClick
    getNotesCount: (uri: string) => number;
    isDownloading: (uri: string) => boolean;
    isFailed: (uri: string) => boolean;
    onRunAgentWorkflow: (paper: any, workflowId: string) => void;
    agentRunningTasks: Record<string, string>;
    onExtractMetadata: (paper: any) => void;
    extractingUris: Set<string>;
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
    onTitleClick, // Added onTitleClick
    getNotesCount,
    isDownloading,
    onRunAgentWorkflow,
    agentRunningTasks,
    onExtractMetadata,
    extractingUris
}) => {

    const SortIcon = ({ column }: { column: string }) => {
        if (sortColumn !== column) return <ArrowUpDown size={12} className="opacity-20 ml-1" />;
        return <ArrowUpDown size={12} className={`ml-1 ${sortDirection === 'asc' ? 'rotate-180' : ''} text-scholar-600`} />;
    };

    // Tooltip component for instant hover display
    const Tooltip = ({ text, children }: { text: string; children: React.ReactNode }) => {
        const [isVisible, setIsVisible] = useState(false);
        return (
            <div className="relative inline-block w-full" onMouseEnter={() => setIsVisible(true)} onMouseLeave={() => setIsVisible(false)}>
                {children}
                {isVisible && text && (
                    <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 z-50 bg-gray-900 dark:bg-gray-700 text-white text-xs px-2 py-1 rounded whitespace-normal max-w-xs break-words pointer-events-none">
                        {text}
                        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900 dark:border-t-gray-700"></div>
                    </div>
                )}
            </div>
        );
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
                        <th className="hidden sm:table-cell py-3 px-4 w-24 text-center">Notes</th>
                        <th className="py-3 px-4 w-24 text-center">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {papers.length > 0 ? papers.map((paper) => {
                        const isSelected = selectedUris.includes(paper.uri);
                        const isExpanded = expandedUris.has(paper.uri);
                        const notesCount = getNotesCount(paper.uri);
                        const year = paper.year ? paper.year :
                            (paper.publishedDate ? new Date(paper.publishedDate).getFullYear() :
                                (paper.created_at ? new Date(paper.created_at).getFullYear() : '—'));
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
                                            <span
                                                onClick={(e) => { e.stopPropagation(); onTitleClick(paper); }}
                                                className="font-semibold text-gray-900 dark:text-gray-100 text-sm leading-snug hover:text-scholar-600 transition-colors cursor-pointer"
                                            >
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
                                        <Tooltip text={authors}>
                                            <span className="text-sm text-gray-600 dark:text-gray-400 line-clamp-1 italic cursor-help">
                                                {authors}
                                            </span>
                                        </Tooltip>
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
                                                onClick={() => onTitleClick(paper)}
                                                className="p-1.5 text-gray-400 hover:text-scholar-600 hover:bg-scholar-50 dark:hover:bg-scholar-900/20 rounded-lg transition-all"
                                                title="View Paper Details"
                                            >
                                                <FileText size={16} />
                                            </button>
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
                                            <ExpandedRowContent
                                                paper={paper}
                                                notesCount={notesCount}
                                                onRunAgentWorkflow={onRunAgentWorkflow}
                                                agentRunningTasks={agentRunningTasks}
                                                onExtractMetadata={onExtractMetadata}
                                                extractingUris={extractingUris}
                                                onTitleClick={onTitleClick}
                                            />
                                        </td>
                                    </tr>
                                )}
                            </React.Fragment>
                        );
                    }) : (
                        <tr>
                            <td colSpan={6} className="py-24 text-center">
                                <div className="flex flex-col items-center justify-center opacity-40">
                                    <FileText size={48} className="mb-4 text-gray-300 dark:text-gray-600" />
                                    <p className="text-gray-900 dark:text-white font-bold">No papers found</p>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">Try adjusting your filters</p>
                                </div>
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
};

const getSourceString = (uri: string) => {
    if (!uri) return 'Unknown Source';
    try {
        return new URL(uri).hostname;
    } catch (e) {
        return uri.startsWith('local://') ? 'Local File' : 'Unknown Source';
    }
};

const ExpandedRowContent = ({
    paper,
    notesCount,
    onRunAgentWorkflow,
    agentRunningTasks,
    onTitleClick
}: any) => {
    const [activeTab, setActiveTab] = useState<'abstract' | 'breakdown' | 'findings'>('abstract');

    return (
        <div className="px-4 py-4 sm:px-14 pb-6 space-y-4">
            {/* Mobile badges shown in expanded view */}
            <div className="sm:hidden flex items-center gap-2 mb-2">
                {notesCount > 0 && (
                    <span className="bg-white border border-gray-200 text-gray-600 text-[10px] font-bold uppercase px-2 py-1 rounded-md flex items-center gap-1">
                        <FileText size={10} /> {notesCount} Notes
                    </span>
                )}
            </div>

            {/* Tab Navigation Menu */}
            <div className="flex border-b border-gray-100 dark:border-gray-800 mb-4 items-center">
                <div className="flex space-x-6 items-center">
                    <button
                        onClick={() => setActiveTab('abstract')}
                        className={`pb-2 text-xs font-bold uppercase tracking-widest transition-all ${activeTab === 'abstract' ? 'border-b-2 border-scholar-600 text-scholar-600' : 'text-gray-400 hover:text-gray-600'}`}>
                        Abstract
                    </button>
                    <button
                        onClick={() => setActiveTab('breakdown')}
                        className={`pb-2 text-xs font-bold uppercase tracking-widest transition-all ${activeTab === 'breakdown' ? 'border-b-2 border-scholar-600 text-scholar-600' : 'text-gray-400 hover:text-gray-600'}`}>
                        Paper Breakdown
                    </button>
                    <button
                        onClick={() => setActiveTab('findings')}
                        className={`pb-2 text-xs font-bold uppercase tracking-widest transition-all ${activeTab === 'findings' ? 'border-b-2 border-scholar-600 text-scholar-600' : 'text-gray-400 hover:text-gray-600'}`}>
                        Key Findings
                    </button>

                    {/* The Plus Button to open PaperDetails */}
                    <button
                        onClick={() => onTitleClick(paper)}
                        className="p-1 mb-2 text-gray-400 hover:text-scholar-600 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors ml-4"
                        title="Open Paper Details">
                        <PlusCircle size={18} />
                    </button>
                </div>
            </div>

            {/* TAB PANELS */}
            {activeTab === 'abstract' && (
                <div className="animate-fade-in relative">

                    <div className="absolute top-0 right-0">
                        <button
                            onClick={() => onRunAgentWorkflow(paper, 'summarise_paper')}
                            disabled={!!agentRunningTasks[paper.uri]}
                            className="p-1.5 text-gray-400 hover:text-scholar-600 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-all"
                            title="Regenerate Abstract"
                        >
                            <RotateCcw size={18} className={agentRunningTasks[paper.uri] === 'summarise_paper' ? "animate-spin text-scholar-500" : ""} />
                        </button>
                    </div>

                    <div className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed font-serif pr-10">
                        <AgentResponseFormatter content={paper.abstract || "No abstract available for this document."} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                        <div>
                            <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Full Authors</h4>
                            <p className="text-xs text-gray-600 dark:text-gray-400 font-medium">
                                {Array.isArray(paper.authors) ? paper.authors.join(', ') : (paper.authors || 'Unknown')}
                            </p>
                        </div>
                        <div>
                            <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Details</h4>
                            <p className="text-xs text-gray-500">
                                Source: {getSourceString(paper.uri)}
                                {paper.published ? ` • Published: ${new Date(paper.published).toLocaleDateString()}` : ''}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Paper Breakdown Panel */}
            {activeTab === 'breakdown' && (
                <div className="animate-fade-in flex flex-col items-center relative">
                    {paper.paper_breakdown ? (
                        <div className="text-sm max-w-4xl w-full py-2 pr-10">
                            <div className="absolute top-0 right-0">
                                <button
                                    onClick={() => onRunAgentWorkflow(paper, 'paper_breakdown')}
                                    disabled={!!agentRunningTasks[paper.uri]}
                                    className="p-1.5 text-gray-400 hover:text-scholar-600 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-all"
                                    title="Regenerate Paper Breakdown"
                                >
                                    <RotateCcw size={18} className={agentRunningTasks[paper.uri] === 'paper_breakdown' ? "animate-spin text-scholar-500" : ""} />
                                </button>
                            </div>
                            <AgentResponseFormatter content={paper.paper_breakdown} />
                        </div>
                    ) : (
                        <div className="flex justify-center w-full my-10">
                            <button
                                onClick={() => onRunAgentWorkflow(paper, 'paper_breakdown')}
                                disabled={agentRunningTasks[paper.uri] === 'paper_breakdown'}
                                className="px-10 py-3 bg-scholar-600 text-white rounded-lg hover:bg-scholar-700 transition-all font-bold text-sm shadow-sm flex items-center gap-2">
                                {agentRunningTasks[paper.uri] === 'paper_breakdown' ? (
                                    <><Loader2 size={16} className="animate-spin" /> Generating Breakdown...</>
                                ) : (
                                    'Generate Paper Breakdown'
                                )}
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Unified Findings Panel */}
            {activeTab === 'findings' && (
                <div className="animate-fade-in flex flex-col items-center relative">
                    {paper.findings ? (
                        <div className="text-sm max-w-4xl w-full py-2 pr-10">
                            <div className="absolute top-0 right-0">
                                <button
                                    onClick={() => onRunAgentWorkflow(paper, 'get_findings')}
                                    disabled={!!agentRunningTasks[paper.uri]}
                                    className="p-1.5 text-gray-400 hover:text-scholar-600 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-all"
                                    title="Regenerate Key Findings"
                                >
                                    <RotateCcw size={18} className={agentRunningTasks[paper.uri] === 'get_findings' ? "animate-spin text-scholar-500" : ""} />
                                </button>
                            </div>
                            <AgentResponseFormatter content={paper.findings} />
                        </div>
                    ) : (
                        <div className="flex justify-center w-full my-10">
                            <button
                                onClick={() => onRunAgentWorkflow(paper, 'get_findings')}
                                disabled={agentRunningTasks[paper.uri] === 'get_findings'}
                                className="px-10 py-3 bg-scholar-600 text-white rounded-lg hover:bg-scholar-700 transition-all font-bold text-sm shadow-sm flex items-center gap-2">
                                {agentRunningTasks[paper.uri] === 'get_findings' ? (
                                    <><Loader2 size={16} className="animate-spin" /> Generating Findings...</>
                                ) : (
                                    'Generate Findings'
                                )}
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
