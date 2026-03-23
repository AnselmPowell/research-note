
import React, { useState, useMemo } from 'react';
import { Edit2, FileText, File, BookText, Loader2, X, Sparkles, Check } from 'lucide-react';
import { fetchPdfBuffer, extractPdfData } from '../../services/pdfService';
import { useDatabase } from '../../database/DatabaseContext';

interface PaperDetailsProps {
    paper: any; // Using any for now to avoid type issues, will refine if possible
    onClose: () => void;
    onView: (paper: any) => void;
    onGenerateLiteratureReview: (paper: any) => void;
    isDownloading?: boolean;
}

export const PaperDetails: React.FC<PaperDetailsProps> = ({
    paper,
    onClose,
    onView,
    onGenerateLiteratureReview,
    isDownloading
}) => {
    const [isExtracting, setIsExtracting] = useState(false);
    const [activeTab, setActiveTab] = useState('abstract');
    const { savePaper } = useDatabase();

    if (!paper) return null;

    const handleGetMetadata = async () => {
        if (!paper?.uri || isExtracting) return;

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
                categories: extracted.metadata.categories || paper.categories
            };

            await savePaper(updatedPaper);
            console.log('[PaperDetails] Metadata updated successfully');
        } catch (error) {
            console.error("[PaperDetails] Failed to extract metadata:", error);
        } finally {
            setIsExtracting(false);
        }
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

    return (
        <div className="flex flex-col h-full bg-white dark:bg-dark-card border-l border-gray-200 dark:border-gray-800 shadow-xl z-30 animate-slide-in-right font-quicksand">
            {/* Header */}
            <div className="flex items-center px-6 py-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/40">
                <div className="flex items-center gap-2">
                    <button
                        onClick={onClose}
                        className="p-1.5 text-gray-500 hover:text-red-500 hover:bg-red-50 dark:text-gray-400 dark:hover:text-red-400 dark:hover:bg-red-900/20 rounded-lg transition-all"
                        title="Close details"
                    >
                        <X size={18} />
                    </button>
                </div>
                <h4 className="text-xs ml-8 font-black text-gray-500 dark:text-scholar-400 uppercase tracking-[0.2em]">Paper Details</h4>
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
                                        <span className="text-[9px] font-semibold  text-gray-700 uppercase tracking-wider ">Source</span>
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
                                            <span className="text-[9px]  font-semibold  text-gray-700 uppercase tracking-wider block"> Year</span>
                                            <div className="text-gray-600 dark:text-gray-400 font-medium">{paper.year}</div>
                                        </div>
                                    )}
                                    {paper.publisher && (
                                        <div>
                                            <span className="text-[9px]  font-semibold text-gray-700 uppercase tracking-wider block">Publisher</span>
                                            <div className="text-gray-600 dark:text-gray-400 font-medium truncate">{paper.publisher}</div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Categories */}
                            {paper.categories && paper.categories.length > 0 && (
                                <div>
                                    <span className="text-[9px]  font-semibold text-gray-700 uppercase tracking-wider block">Categories</span>
                                    <div className="flex flex-wrap gap-1.5 mt-1">
                                        {(Array.isArray(paper.categories) ? paper.categories : [paper.categories]).map((cat: string, i: number) => (
                                            <span key={i} className="text-[10px] px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-full">
                                                {cat}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Page Count */}
                            <div>
                                <span className="text-[9px] font-semibold text-gray-700 uppercase tracking-wider block">Pages</span>
                                <div className="text-gray-600 dark:text-gray-400 font-medium">
                                    {paper.num_pages || paper.numPages || paper.pages || 'Available in PDF'}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Action Buttons - Brand Consistent */}
                    <div className="grid grid-cols-2 gap-4 py-4 ">
                        <button
                            onClick={() => onGenerateLiteratureReview(paper)}
                            className="flex items-center justify-center px-3 py-2.5 bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 text-[10px] font-black uppercase tracking-widest text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all rounded-xl"
                        >
                            <span className="text-center">GENERATE LITERATURE REVIEW</span>
                        </button>
                        <button
                            onClick={() => onView(paper)}
                            className="flex items-center justify-center px-3 py-2.5 bg-scholar-600 hover:bg-scholar-500 text-white text-[11px] font-black uppercase tracking-widest rounded-xl transition-all gap-2 shadow-scholar-sm"
                        >
                            {isDownloading ? <Loader2 size={16} className="animate-spin" /> : 'VIEW PDF'}
                        </button>
                    </div>

                    {/* Tabs Section - Replacing Abstract Section */}
                    <div className="space-y-4 border-t pt-4 border-gray-400 dark:border-gray-500">
                        <div className="flex flex-wrap gap-x-6 gap-y-2">
                            {['abstract', 'lit review', 'method', 'findings'].map((tab) => (
                                <button
                                    key={tab}
                                    onClick={() => setActiveTab(tab)}
                                    className={`uppercase tracking-[0.2em] font-black transition-all ${activeTab === tab
                                        ? 'text-md font-black uppercase tracking-[0.25em] text-gray-600 dark:text-gray-300 underline underline-offset-4'
                                        : 'text-[10px] text-gray-500 dark:text-gray-600 hover:text-gray-700 dark:hover:text-gray-600'
                                        }`}
                                >
                                    {tab}
                                </button>
                            ))}
                        </div>

                        <div className="min-h-[200px]">
                            {activeTab === 'abstract' ? (
                                <p className="text-sm sm:text-base text-gray-600 dark:text-gray-300 leading-relaxed font-medium animate-fade-in">
                                    {paper.abstract || paper.summary || "No abstract available for this document."}
                                </p>
                            ) : (
                                <div className="flex flex-col items-center justify-center min-h-[200px] border-gray-100 dark:border-gray-800 rounded-2xl animate-fade-in py-8 px-4 text-center">
                                    <button 
                                        onClick={() => onGenerateLiteratureReview(paper)}
                                        className="inline-flex items-center gap-2.5 px-6 py-4 bg-scholar-50/50 dark:bg-scholar-900/20 text-scholar-600 dark:text-scholar-400 text-[10px] font-black uppercase tracking-[0.2em] rounded-xl border border-scholar-300 dark:border-scholar-800/50 hover:bg-scholar-50 dark:hover:bg-scholar-900/40 transition-all group"
                                    >
                                        <Sparkles size={14} className="group-hover:animate-pulse" />
                                        {activeTab === 'lit review' ? 'GENERATE LITERATURE REVIEW' :
                                         activeTab === 'method' ? 'GENERATE METHODOLOGY' :
                                         activeTab === 'findings' ? 'GENERATE FINDINGS/RESULTS' :
                                         `GENERATE ${activeTab.toUpperCase()}`}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
