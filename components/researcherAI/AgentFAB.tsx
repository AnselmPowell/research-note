import React from 'react';
import { GraduationCap, BookOpenText, MessageSquareText, X } from 'lucide-react';
import { useLibrary } from '../../contexts/LibraryContext';
import { useResearch } from '../../contexts/ResearchContext';

interface AgentFABProps {
    isMenuOpen: boolean;
    setIsMenuOpen: (open: boolean) => void;
    activeTool: 'chat' | 'deep' | null;
    onSelectDeep: () => void;
    onSelectChat: () => void;
}

export const AgentFAB: React.FC<AgentFABProps> = ({
    isMenuOpen,
    setIsMenuOpen,
    activeTool,
    onSelectDeep,
    onSelectChat,
}) => {
    const { contextUris } = useLibrary();
    const { selectedArxivIds } = useResearch();

    // Badge count: sum of checked PDFs + selected ArXiv papers
    const contextCount = contextUris.size + selectedArxivIds.size;

    return (
        <div className="fixed bottom-6 right-6 z-[999] flex flex-col items-end gap-3">
            {/* Menu item: Deep Research */}
            {isMenuOpen && (
                <div className="flex items-center gap-3 animate-slide-up origin-bottom">
                    <span className="bg-white dark:bg-gray-800 px-3 py-1.5 rounded-lg text-xs font-semibold shadow-md border border-gray-100 dark:border-gray-700 text-gray-600 dark:text-gray-300">
                        Deep Research
                    </span>
                    <button
                        onClick={onSelectDeep}
                        className={`w-12 h-12 rounded-full shadow-lg border border-gray-200 dark:border-gray-700 flex items-center justify-center transition-transform hover:scale-105 ${activeTool === 'deep'
                            ? 'bg-scholar-600 text-white'
                            : 'bg-white dark:bg-gray-800 text-scholar-600 dark:text-scholar-400'
                            }`}
                    >
                        <BookOpenText size={20} />
                    </button>
                </div>
            )}

            {/* Menu item: AI Assistant */}
            {isMenuOpen && (
                <div className="flex items-center gap-3 animate-slide-up origin-bottom" style={{ animationDelay: '0.05s' }}>
                    <span className="bg-white dark:bg-gray-800 px-3 py-1.5 rounded-lg text-xs font-semibold shadow-md border border-gray-100 dark:border-gray-700 text-gray-600 dark:text-gray-300">
                        AI Assistant
                    </span>
                    <button
                        onClick={onSelectChat}
                        className={`w-12 h-12 rounded-full shadow-lg border border-gray-200 dark:border-gray-700 flex items-center justify-center transition-transform hover:scale-105 ${activeTool === 'chat'
                            ? 'bg-scholar-600 text-white'
                            : 'bg-white dark:bg-gray-800 text-scholar-600 dark:text-scholar-400'
                            }`}
                    >
                        <MessageSquareText size={20} />
                    </button>
                </div>
            )}

            {/* Primary FAB Button */}
            <button
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className={`relative flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-full shadow-xl transition-all duration-300 ${isMenuOpen || activeTool
                    ? 'bg-gray-800 hover:bg-gray-900'
                    : 'bg-scholar-600 hover:bg-scholar-700'
                    } text-white hover:scale-105`}
            >
                {isMenuOpen ? (
                    <X size={28} />
                ) : (
                    <>
                        <GraduationCap size={28} className="transition-transform duration-300" />
                        {contextCount > 0 && (
                            <span className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-scholar-600 text-[12px] font-black border-2 border-white dark:border-gray-800 shadow-sm">
                                {contextCount}
                            </span>
                        )}
                    </>
                )}
            </button>
        </div>
    );
};
