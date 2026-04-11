
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Edit2, FileText, File, BookText, Loader2, X, Sparkles, Check, Copy, RotateCcw, AlertCircle } from 'lucide-react';
import { fetchPdfBuffer, extractPdfData } from '../../services/pdfService';
import { useDatabase } from '../../database/DatabaseContext';
import { useLibrary } from '../../contexts/LibraryContext';

/**
 * Lightweight markdown-style formatter for Agent responses
 * Renders headers, lists, and bold text with Scholar-themed styling
 */
export const AgentResponseFormatter: React.FC<{ content: string }> = ({ content }) => {
    if (!content || typeof content !== 'string') return null;

    // Helper to render bold text within any block
    const renderContent = (text: string) => {
        const parts = text.split(/(\*\*.*?\*\*)/g);
        return parts.map((part, i) => {
            if (part.startsWith('**') && part.endsWith('**')) {
                return (
                    <strong key={i} className="font-bold text-scholar-800 dark:text-scholar-200">
                        {part.slice(2, -2)}
                    </strong>
                );
            }
            return part;
        });
    };

    return (
        <div className="space-y-1.5 py-4 animate-fade-in font-quicksand">
            {content.split('\n').map((line, idx) => {
                const trimmedLine = line.trim();

                // Empty line
                if (!trimmedLine) return <div key={idx} className="h-1" />;

                // Separator (e.g., ####### or ##################)
                if (trimmedLine.startsWith('###') && trimmedLine.length > 10) {
                    return <div key={idx} className="h-px w-full bg-gradient-to-r from-transparent via-gray-200 dark:via-gray-800 to-transparent my-6" />;
                }

                // Level 2 Header (## Section)
                if (line.startsWith('## ')) {
                    return (
                        <h2 key={idx} className="text-sm font-black uppercase tracking-[0.25em] text-scholar-600 dark:text-white mt-6 mb-2 pb-1 border-b-2 border-scholar-100 dark:border-scholar-900/50">
                            {renderContent(line.replace('## ', ''))}
                        </h2>
                    );
                }

                // Main Header (### Section)
                if (line.startsWith('### ')) {
                    return (
                        <h3 key={idx} className="text-xs font-black uppercase tracking-[0.15em] text-gray-800 dark:text-scholar-400 mt-4 mb-2 border-b pb-1 border-gray-100 dark:border-gray-800">
                            {renderContent(line.replace('### ', ''))}
                        </h3>
                    );
                }

                // Sub Header (#### Subsection)
                if (line.startsWith('#### ')) {
                    return (
                        <h4 key={idx} className="text-[11px] font-bold text-scholar-600 dark:text-scholar-300 uppercase tracking-widest mt-3 mb-1 italic">
                            {renderContent(line.replace('#### ', ''))}
                        </h4>
                    );
                }

                // Bullet List Items (Processes bold text internally)
                if (trimmedLine.startsWith('* ') || trimmedLine.startsWith('- ')) {
                    const textContent = trimmedLine.substring(2);
                    return (
                        <div key={idx} className="flex gap-3 text-sm text-gray-700 dark:text-gray-300 pl-4 py-0.5 leading-relaxed">
                            <span className="text-scholar-600 dark:text-scholar-500 font-bold select-none">•</span>
                            <span className="flex-1">{renderContent(textContent)}</span>
                        </div>
                    );
                }

                // Regular Paragraph
                return (
                    <p key={idx} className="text-sm leading-relaxed text-gray-700 dark:text-gray-300 mb-0.5 font-medium">
                        {renderContent(line)}
                    </p>
                );
            })}
        </div>
    );
};

interface PaperDetailsProps {
    paper: any; // Using any for now to avoid type issues, will refine if possible
    onClose: () => void;
    onView: (paper: any) => void;
    onGenerateLiteratureReview: (paper: any) => void;
    onGenerateMethodology: (paper: any) => void;
    onGenerateFindings: (paper: any) => void;
    onGenerateHarvardReference: (paper: any) => void;
    onGenerateAbstract: (paper: any) => void;
    isDownloading?: boolean;
    isAgentRunning?: boolean;
    runningWorkflowId?: string | null;
    agentError?: string | null;
    onDismissAgentError?: () => void;
}

export const PaperDetails: React.FC<PaperDetailsProps> = ({
    paper,
    onClose,
    onView,
    onGenerateLiteratureReview,
    onGenerateMethodology,
    onGenerateFindings,
    onGenerateHarvardReference,
    onGenerateAbstract,
    isDownloading,
    isAgentRunning,
    runningWorkflowId,
    agentError,
    onDismissAgentError
}) => {
    const [isExtracting, setIsExtracting] = useState(false);
    const [activeTab, setActiveTab] = useState('abstract');
    const [copiedContent, setCopiedContent] = useState(false);
    const [copiedMeta, setCopiedMeta] = useState(false);
    const { savePaper } = useDatabase();
    const { loadedPdfs } = useLibrary();

    const detailsRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (detailsRef.current && !detailsRef.current.contains(event.target as Node)) {
                onClose();
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [onClose]);

    if (!paper) return null;

    const handleGetMetadata = async () => {
        if (!paper?.uri || isExtracting) return null;

        setIsExtracting(true);
        try {
            console.log('[PaperDetails] Starting metadata extraction for:', paper.uri);
            const buffer = await fetchPdfBuffer(paper.uri);
            const extracted = await extractPdfData(buffer);

            // Map extracted data to the database schema
            const authorString = extracted.metadata.author || '';
            const authorList = authorString.split(/[,;]|\s+and\s+/).map((a: string) => a.trim()).filter(Boolean);

            const updatedPaper = {
                ...paper,
                title: extracted.metadata.title || paper.title,
                authors: authorList.length > 0 ? authorList : paper.authors,
                abstract: extracted.text || paper.abstract || paper.summary,
                num_pages: extracted.numPages || paper.num_pages,
                year: extracted.metadata.year || paper.year,
                harvardReference: extracted.metadata.harvardReference || paper.harvardReference,
                publisher: extracted.metadata.publisher || paper.publisher,
                categories: extracted.metadata.categories || paper.categories,
                pages: extracted.pages,
                paper_references: extracted.references || paper.paper_references || []
            };

            await savePaper(updatedPaper);
            console.log('[PaperDetails] Metadata updated successfully');
            return updatedPaper;
        } catch (error) {
            console.error("[PaperDetails] Failed to extract metadata:", error);
            return null;
        } finally {
            setIsExtracting(false);
        }
    };

    const handleActionWithPrecheck = async (action: (p: any) => void) => {
        let activePaper = paper;
        // If content is missing, we MUST extract it first
        if (!paper.pages || paper.pages.length === 0) {
            console.log('[PaperDetails] Missing page data, triggering automatic extraction before agent run...');

            // QUICK CHECK: IF it's a local file we already have in memory, grab its pages DIRECTLY
            const memoryPdf = loadedPdfs.find((lp: any) => lp.uri === paper.uri);
            if (memoryPdf && memoryPdf.pages) {
                activePaper = { ...paper, pages: memoryPdf.pages };
            }
            // OTHERWISE, try fetching it if it's a standard web URL
            else if (!paper.uri.startsWith('local://')) {
                const result = await handleGetMetadata();
                if (result) {
                    activePaper = result;
                } else {
                    console.error('[PaperDetails] Extraction failed, cannot proceed with agent workflow');
                    return;
                }
            } else {
                console.error("[PaperDetails] Local file no longer in memory and cannot be re-fetched.");
                return;
            }
        }
        action(activePaper);
    };

    const authors = Array.isArray(paper.authors)
        ? paper.authors.join(', ')
        : (paper.authors || 'Unknown Authors');

    const isLocal = paper.uri?.startsWith('local://') || paper.uri?.startsWith('blob:');

    const isMetadataComplete = useMemo(() => {
        const hasAbstract = !!(paper.abstract || paper.summary);
        const hasRef = !!paper.harvardReference;
        const hasYear = !!(paper.year || paper.published_date || paper.publishedDate);
        const hasPages = !!(paper.num_pages || paper.numPages || (paper.pages && paper.pages !== 'Available in PDF'));
        const hasRealAuthors = authors !== 'Unknown Authors' && authors !== 'Unknown Author';

        return hasAbstract && hasRef && hasYear && hasPages && hasRealAuthors;
    }, [paper, authors]);

    const handleCopyContent = () => {
        const fieldMap: Record<string, string> = {
            'abstract': 'abstract',
            'lit review': 'literature_review',
            'method': 'methodology',
            'findings': 'findings'
        };
        const content = paper[fieldMap[activeTab]] || (activeTab === 'abstract' ? paper.summary : null);
        if (content) {
            navigator.clipboard.writeText(typeof content === 'string' ? content : JSON.stringify(content, null, 2));
            setCopiedContent(true);
            setTimeout(() => setCopiedContent(false), 2000);
        }
    };

    const handleCopyMetadata = () => {
        const authorDisplay = Array.isArray(paper.authors) ? paper.authors.join(', ') : (paper.authors || 'Unknown');
        const metaText = `
Title: ${paper.title || 'Unknown'}
Authors: ${authorDisplay}
Harvard Reference: ${paper.harvardReference || 'N/A'}
Year: ${paper.year || 'N/A'}
Publisher: ${paper.publisher || 'N/A'}
Pages: ${paper.num_pages || paper.numPages || (Array.isArray(paper.pages) ? paper.pages.length : paper.pages) || 'Available in PDF'}
---
Abstract:
${paper.abstract || paper.summary || 'No abstract available'}
`.trim();

        navigator.clipboard.writeText(metaText);
        setCopiedMeta(true);
        setTimeout(() => setCopiedMeta(false), 2000);
    };

    const handleRegenerateContent = () => {
        if (activeTab === 'abstract') handleActionWithPrecheck(onGenerateAbstract);
        else if (activeTab === 'lit review') handleActionWithPrecheck(onGenerateLiteratureReview);
        else if (activeTab === 'method') handleActionWithPrecheck(onGenerateMethodology);
        else if (activeTab === 'findings') handleActionWithPrecheck(onGenerateFindings);
    };

    const hasAnyContent = useMemo(() => {
        const fieldMap: Record<string, string> = {
            'abstract': 'abstract',
            'lit review': 'literature_review',
            'method': 'methodology',
            'findings': 'findings'
        };
        return !!(paper[fieldMap[activeTab]] || (activeTab === 'abstract' && paper.summary));
    }, [paper, activeTab]);

    const TAB_WORKFLOW_MAP: Record<string, string> = {
        'abstract': 'summarise_paper',
        'lit review': 'literature_review',
        'method': 'get_methodology',
        'findings': 'get_findings'
    };

    return (
        <div ref={detailsRef} className="flex flex-col h-full bg-white dark:bg-dark-card border-l border-gray-200 dark:border-gray-800 shadow-xl z-30 animate-slide-in-right font-quicksand">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/40">
                <div className="flex items-center gap-2">
                    <button
                        onClick={onClose}
                        className="p-1.5 text-gray-500 hover:text-red-500 hover:bg-red-50 dark:text-gray-400 dark:hover:text-red-400 dark:hover:bg-red-900/20 rounded-lg transition-all"
                        title="Close details"
                    >
                        <X size={24} />
                    </button>
                    <h4 className="text-sm font-black text-gray-400 dark:text-scholar-400 uppercase tracking-[0.2em] ml-2">Paper Details</h4>
                </div>

                <button
                    onClick={handleCopyMetadata}
                    className={`flex items-center gap-2 px-3 py-1.5 text-[12px] font-black uppercase tracking-widest transition-all rounded-xl  ${copiedMeta
                        ? 'bg-scholar-50 border dark:bg-scholar-900/30 border-scholar-200 dark:border-scholar-800 text-scholar-600 dark:text-scholar-400'
                        : '   text-gray-500 dark:text-gray-400  dark:hover:text-scholar-400'
                        }`}
                    title="Copy all metadata"
                >
                    {copiedMeta ? <Check size={24} className="text-scholar-600 dark:text-scholar-400" /> : <Copy size={24} />}
                    <span>{copiedMeta ? 'Copied' : 'Copy'}</span>
                </button>
            </div>

            {/* Content Container */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 sm:p-8 pt-2 sm:pt-2">
                <div className="space-y-4 max-w-2xl mx-auto">
                    {/* Title, Authors & Get Meta */}
                    <div >
                        <h1 className="text-xl sm:text-2xl font-bold  text-gray-900 dark:text-white leading-tight">
                            {paper.title}
                        </h1>

                        <div className="flex flex-wrap items-start justify-between gap-4">
                            <p className="text-sm sm:text-base text-scholar-600 dark:text-scholar-400 font-semibold leading-relaxed flex-1 min-w-[200px]">
                                {authors}
                            </p>

                        </div>

                    </div>

                    {/* Simple Metadata Section */}
                    <div className=" text-sm">
                        {/* Harvard Reference */}
                        {paper.harvardReference && (
                            <div className="text-gray-700 dark:text-gray-300 italic text-xs  ">
                                {paper.harvardReference}
                            </div>
                        )}

                        {/* Additional Info Grid */}
                        <div className="grid grid-cols-1 gap-4 pt-2">

                            <div className="flex justify-between pt-1">
                                {/* Source URI */}
                                {!isLocal && paper.uri && (
                                    <div>
                                        <span className="text-[9px] font-semibold  text-gray-700 dark:text-gray-400 uppercase tracking-wider ">Source</span>
                                        <a
                                            href={paper.uri}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-xs text-scholar-600 dark:text-scholar-400 hover:underline truncate-2-lines block transition-all"
                                        >
                                            {paper.uri}
                                        </a>
                                    </div>
                                )}
                                {isMetadataComplete ? '' : (
                                    <button
                                        onClick={handleGetMetadata}
                                        disabled={isExtracting}
                                        className={`flex-shrink-0 text-[10px] inline-flex items-center gap-1.5 font-bold transition-all uppercase tracking-widest px-2.5 py-1 border rounded-md disabled:cursor-not-allowed text-scholar-600 dark:text-scholar-400 border-scholar-200 dark:border-scholar-800 hover:bg-scholar-50 dark:hover:bg-scholar-900/30 disabled:opacity-50`}
                                    >
                                        {isExtracting ? (
                                            <Loader2 size={10} className="animate-spin" />
                                        ) : (
                                            isMetadataComplete ? <Check size={10} /> : <Sparkles size={10} />
                                        )}
                                        {isExtracting
                                            ? 'Extracting...'
                                            : 'Get metadata'
                                        }
                                    </button>
                                )}
                            </div>



                            {/* Year & Publisher */}
                            {(paper.year || paper.publisher) && (
                                <div className="grid grid-cols-2">
                                    {paper.year && (
                                        <div>
                                            <span className="text-[9px]  font-semibold dark:text-gray-400  text-gray-700 uppercase tracking-wider block"> Year</span>
                                            <div className="text-gray-600 dark:text-gray-400 font-medium">{paper.year}</div>
                                        </div>
                                    )}
                                    {paper.publisher && (
                                        <div>
                                            <span className="text-[9px]  font-semibold text-gray-700 dark:text-gray-400 uppercase tracking-wider block">Publisher</span>
                                            <div className="text-gray-600 dark:text-gray-400 font-medium truncate">{paper.publisher}</div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Categories */}
                            {paper.categories && paper.categories.length > 0 && (
                                <div>
                                    <span className="text-[9px]  font-semibold text-gray-700 dark:text-gray-400 uppercase tracking-wider block">Categories</span>
                                    <div className="flex flex-wrap gap-1.5 mt-1">
                                        {(Array.isArray(paper.categories) ? paper.categories : [paper.categories]).map((cat: string, i: number) => (
                                            <span key={i} className="text-[10px] px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-full">
                                                {cat}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                            <div>
                                <span className="text-[9px] font-semibold text-gray-700 dark:text-gray-400 uppercase tracking-wider block">Pages</span>
                                <div className="text-gray-600 dark:text-gray-400 font-medium">
                                    {paper.num_pages || paper.numPages || (Array.isArray(paper.pages) ? paper.pages.length : paper.pages) || 'Available in PDF'}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Action Buttons - Brand Consistent */}
                    <div className="grid grid-cols-2 gap-3 py-4 ">
                        <button
                            onClick={() => handleActionWithPrecheck(onGenerateLiteratureReview)}
                            disabled={!!runningWorkflowId}
                            className={`flex items-center justify-center px-3 py-4 bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 text-[12px] font-black uppercase tracking-widest text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all rounded-xl ${runningWorkflowId === 'literature_review' ? 'opacity-90' : ''}`}
                        >
                            <div className="flex items-center gap-2">
                                {runningWorkflowId === 'literature_review' && <Loader2 size={16} className="animate-spin text-scholar-600 dark:text-scholar-400" />}
                                <span className="text-center">{runningWorkflowId === 'literature_review' ? 'Generating Review...' : 'GENERATE LITERATURE REVIEW'}</span>
                            </div>
                        </button>
                        <button
                            onClick={() => onView(paper)}
                            className="flex items-center justify-center px-3 py-4 bg-scholar-600 hover:bg-scholar-500 text-white text-[12px] font-black uppercase tracking-widest rounded-xl transition-all gap-2 shadow-scholar-sm"
                        >
                            {isDownloading ? <Loader2 size={16} className="animate-spin" /> : 'VIEW PDF'}
                        </button>
                    </div>

                    {/* Tabs Section - Replacing Abstract Section */}
                    <div className="space-y-4 border-t pt-4 border-gray-400 dark:border-gray-500">
                        <div className="flex items-center justify-between gap-x-6 gap-y-2">
                            <div className="flex flex-wrap gap-x-6 gap-y-2">
                                {['abstract', 'lit review', 'method', 'findings'].map((tab) => {
                                    const isThisTabRunning = runningWorkflowId === TAB_WORKFLOW_MAP[tab];
                                    return (
                                        <button
                                            key={tab}
                                            onClick={() => setActiveTab(tab)}
                                            className={`uppercase tracking-[0.2em] font-black transition-all ${activeTab === tab
                                                ? 'text-md font-black uppercase tracking-[0.25em] text-gray-600 dark:text-gray-300 underline underline-offset-4'
                                                : 'text-[10px] text-gray-500 dark:text-gray-600 hover:text-gray-700 dark:hover:text-gray-600'
                                                }`}
                                        >
                                            <div className="flex items-center gap-1.5">
                                                {tab}
                                                {isThisTabRunning && <Loader2 size={10} className="animate-spin text-scholar-600 dark:text-scholar-400" />}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Content Controls: Copy & Regenerate */}
                            {hasAnyContent && !isAgentRunning && (
                                <div className="flex items-center gap-1">
                                    {/* Copy Button */}
                                    <button
                                        onClick={handleCopyContent}
                                        className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-scholar-600 dark:text-gray-500 dark:hover:text-scholar-400 transition-all rounded-md hover:bg-gray-50 dark:hover:bg-gray-800"
                                        title="Copy content to clipboard"
                                    >
                                        {copiedContent ? <Check size={20} className="text-scholar-600 dark:text-scholar-400" /> : <Copy size={20} />}
                                    </button>

                                    <button
                                        onClick={handleRegenerateContent}
                                        className="p-1 px-2 text-gray-400 hover:text-scholar-600 dark:text-gray-500 dark:hover:text-scholar-400 transition-all rounded-md hover:bg-gray-50 dark:hover:bg-gray-800"
                                        title="Regenerate this section"
                                    >
                                        <RotateCcw size={20} />
                                    </button>
                                </div>
                            )}
                        </div>

                        <div className="min-h-[200px]">
                            <div className="animate-fade-in">
                                {isAgentRunning && runningWorkflowId === TAB_WORKFLOW_MAP[activeTab] ? (
                                    <div className="flex flex-col items-center justify-center min-h-[200px] py-8 text-center  rounded-2xl">
                                        <Loader2 size={24} className="animate-spin text-scholar-600 dark:text-scholar-400 mb-3" />
                                        <p className="text-[16px] font-black uppercase tracking-[0.2em] text-scholar-600 dark:text-scholar-400">Researching Document...</p>
                                        <p className="text-[12px] text-gray-600 dark:text-gray-100 mt-1">Analysing paper and synthesising findings</p>
                                    </div>
                                ) : (
                                    (() => {
                                        const fieldMap: Record<string, string> = {
                                            'abstract': 'abstract',
                                            'lit review': 'literature_review',
                                            'method': 'methodology',
                                            'findings': 'findings'
                                        };
                                        const content = paper[fieldMap[activeTab]] || (activeTab === 'abstract' ? paper.summary : null);

                                        if (content) {
                                            return (
                                                <AgentResponseFormatter content={typeof content === 'string' ? content : JSON.stringify(content, null, 2)} />
                                            );
                                        }

                                        return (
                                            <div className="flex flex-col gap-3 min-h-[200px] border-gray-100 dark:border-gray-800 rounded-2xl py-8 px-4">
                                                {agentError && (
                                                    <div className="flex items-center gap-2 px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-xl text-sm text-red-600 dark:text-red-400">
                                                        <AlertCircle size={15} className="shrink-0" />
                                                        <span className="text-[11px] font-semibold flex-1">{agentError}</span>
                                                        <button onClick={onDismissAgentError} className="ml-auto p-0.5 hover:text-red-700 dark:hover:text-red-300 transition-colors">
                                                            <X size={13} />
                                                        </button>
                                                    </div>
                                                )}
                                                <div className="flex items-center justify-center flex-1">
                                                    <button
                                                        onClick={() => {
                                                            if (activeTab === 'abstract') handleActionWithPrecheck(onGenerateAbstract);
                                                            else if (activeTab === 'lit review') handleActionWithPrecheck(onGenerateLiteratureReview);
                                                            else if (activeTab === 'method') handleActionWithPrecheck(onGenerateMethodology);
                                                            else if (activeTab === 'findings') handleActionWithPrecheck(onGenerateFindings);
                                                        }}
                                                        disabled={!!runningWorkflowId}
                                                        className="inline-flex items-center gap-2.5 px-6 py-5 bg-scholar-50/50 dark:bg-scholar-900/20 text-scholar-600 dark:text-scholar-400 text-[10px] font-black uppercase tracking-[0.2em] rounded-xl border border-scholar-300 dark:border-scholar-800/50 hover:bg-scholar-50 dark:hover:bg-scholar-900/40 transition-all group disabled:opacity-50"
                                                    >
                                                        <Sparkles size={14} className="group-hover:animate-pulse" />
                                                        {activeTab === 'abstract' ? 'GENERATE ABSTRACT' :
                                                            activeTab === 'lit review' ? 'GENERATE LITERATURE REVIEW' :
                                                                activeTab === 'method' ? 'GENERATE METHODOLOGY' :
                                                                    activeTab === 'findings' ? 'GENERATE FINDINGS/RESULTS' :
                                                                        `GENERATE ${activeTab.toUpperCase()}`}
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })()
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
