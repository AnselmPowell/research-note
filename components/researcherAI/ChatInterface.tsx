import React, { useRef, useEffect, useState } from 'react';
import { 
  Send, User, Bot, Loader2, Sparkles, Copy, RotateCw, 
  Plus, SlidersHorizontal, Clock, ChevronDown, ArrowUp, 
  PenTool, GraduationCap, Code, Coffee, Lightbulb, PanelRightClose, 
  X, Trash2, MessageSquarePlus, Check, Lock, Unlock, FileText
} from 'lucide-react';
import { useUI } from '../../contexts/UIContext';
import { AgentCitation } from '../../services/agentService';
import { ChatMessage } from './AgentResearcher';

interface ChatInterfaceProps {
  messages: ChatMessage[];
  isProcessing: boolean;
  onSendMessage: (text: string) => void;
  onClearChat: () => void;
  syncStatus: 'idle' | 'syncing' | 'uptodate';
  onClose: () => void;
  pdfCount: number;
  isLocked: boolean;
  onToggleLock: () => void;
  onViewCitation: (citation: AgentCitation) => void;
}

const CopyButton: React.FC<{ text: string }> = ({ text }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={handleCopy} className="flex items-center gap-1 hover:text-scholar-600 dark:hover:text-gray-200 transition-colors text-xs" title="Copy response">
      {copied ? <><Check size={12} className="text-green-500" /><span className="text-green-500">Copied</span></> : <><Copy size={12} /> Copy</>}
    </button>
  );
};

// --- CITATION POPUP CARD ---
const CitationPopup: React.FC<{ citation: AgentCitation, onView: () => void, onClose: () => void }> = ({ citation, onView, onClose }) => {
    return (
        <div className="absolute bottom-full mb-2 left-0 w-64 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 p-3 z-50 animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-scholar-700 dark:text-scholar-400">
                    <FileText size={12} />
                    <span className="truncate max-w-[150px]">{citation.title}</span>
                </div>
                <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={12} /></button>
            </div>
            <div className="bg-gray-50 dark:bg-gray-900/50 rounded p-2 mb-2 text-xs italic text-gray-600 dark:text-gray-300 border-l-2 border-scholar-300">
                "{citation.quote.slice(0, 100)}{citation.quote.length > 100 ? '...' : ''}"
            </div>
            <div className="flex justify-between items-center">
                <span className="text-[10px] font-medium text-gray-500">Page {citation.page}</span>
                <button 
                    onClick={onView}
                    className="text-xs bg-scholar-600 hover:bg-scholar-700 text-white px-2 py-1 rounded shadow-sm transition-colors"
                >
                    View PDF
                </button>
            </div>
            {/* Arrow */}
            <div className="absolute -bottom-1 left-4 w-2 h-2 bg-white dark:bg-gray-800 border-b border-r border-gray-200 dark:border-gray-700 transform rotate-45"></div>
        </div>
    );
};

const FormattedMessage: React.FC<{ 
    text: string, 
    citations?: AgentCitation[], 
    onViewCitation: (c: AgentCitation) => void 
}> = ({ text, citations, onViewCitation }) => {
    
    if (!citations || citations.length === 0) return <div className="text-[15px] text-[#333] dark:text-gray-100 leading-7 font-normal whitespace-pre-wrap px-1">{text}</div>;

    // Split text by citations markers like [1], [2]
    const parts = text.split(/(\[\d+\])/g);
    
    // State for which popup is open
    const [activePopupId, setActivePopupId] = useState<number | null>(null);

    return (
        <div className="text-[15px] text-[#333] dark:text-gray-100 leading-7 font-normal whitespace-pre-wrap px-1 relative">
            {parts.map((part, index) => {
                const match = part.match(/^\[(\d+)\]$/);
                if (match) {
                    const id = parseInt(match[1]);
                    const citation = citations.find(c => c.id === id);
                    
                    if (citation) {
                        return (
                            <span key={index} className="relative inline-block ml-0.5 align-baseline">
                                <button
                                    onClick={() => setActivePopupId(activePopupId === id ? null : id)}
                                    className="text-[10px] font-bold text-scholar-600 dark:text-scholar-400 bg-scholar-50 dark:bg-scholar-900/40 border border-scholar-200 dark:border-scholar-700 px-1 rounded-sm hover:bg-scholar-100 dark:hover:bg-scholar-800 transition-colors -translate-y-0.5"
                                >
                                    {id}
                                </button>
                                {activePopupId === id && (
                                    <CitationPopup 
                                        citation={citation} 
                                        onView={() => { onViewCitation(citation); setActivePopupId(null); }} 
                                        onClose={() => setActivePopupId(null)} 
                                    />
                                )}
                            </span>
                        );
                    }
                }
                return <span key={index}>{part}</span>;
            })}
        </div>
    );
};


export const ChatInterface: React.FC<ChatInterfaceProps> = ({ 
  messages, 
  isProcessing, 
  onSendMessage,
  onClearChat,
  syncStatus,
  onClose,
  pdfCount,
  isLocked,
  onToggleLock,
  onViewCitation
}) => {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { darkMode } = useUI();

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [messages, isProcessing]);

  const handleSubmit = () => {
    if (input.trim() && !isProcessing) {
      onSendMessage(input.trim());
      setInput('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Greeting Logic
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-cream dark:bg-dark-card border rounded-xl dark:border-gray-700 overflow-hidden min-w-[320px] shadow-sm font-sans">
      
      {/* Header */}
      <div className="flex justify-between items-center p-4 bg-[#fbf9f6] dark:bg-dark-card shrink-0 z-10 border-b border-gray-100 dark:border-gray-700">
        <div className="flex items-center gap-2">
            <button 
              onClick={onClose}
              className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md transition-colors text-gray-500 dark:text-gray-400"
              title="Close Sidebar"
            >
              <PanelRightClose size={20} />
            </button>
            <div className="flex flex-col">
                <span className="text-sm font-bold text-gray-800 dark:text-gray-100">Research Assistant</span>
                <div className="flex items-center gap-1.5">
                    {syncStatus === 'syncing' ? (
                        <Loader2 size={10} className="animate-spin text-scholar-600" />
                    ) : (
                        <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
                    )}
                    <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400">
                        {syncStatus === 'syncing' ? 'Syncing Library...' : 'Online'}
                    </span>
                </div>
            </div>
        </div>

        <div className="flex items-center gap-1">
          <button 
            onClick={onToggleLock}
            className={`p-2 rounded-md transition-all ${isLocked ? 'bg-scholar-50 text-scholar-600 dark:bg-scholar-900/30' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
            title={isLocked ? "Keep chat open (Locked)" : "Auto-close on click away (Unlocked)"}
          >
            {isLocked ? <Lock size={16} /> : <Unlock size={16} />}
          </button>
          
          <button 
            onClick={onClearChat}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 hover:text-scholar-600 dark:hover:text-scholar-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-all"
            title="Start a new chat session"
          >
            <MessageSquarePlus size={14} />
            New Chat
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 md:px-6 pb-4 custom-scrollbar flex flex-col"
      >
        {messages.length === 0 ? (
          // Empty State / Welcome Screen
          <div className="flex-1 flex flex-col items-center justify-center -mt-10 select-none animate-in fade-in zoom-in duration-500">
            <div className="mb-6 p-4 bg-white dark:bg-gray-800 rounded-full shadow-sm border border-gray-100 dark:border-gray-700">
              <GraduationCap className="w-8 h-8 text-scholar-500" />
            </div>
            <h1 className="text-3xl md:text-4xl font-serif text-[#333] dark:text-white mb-2 font-normal tracking-tight text-center">
              It's {getGreeting()}, <br /> Student
            </h1>
            
            {/* Context-Aware Mentor Text */}
            <div className="text-gray-500 dark:text-gray-400 text-sm mt-2 text-center max-w-xs space-y-2">
              <p>I'm your research mentor.</p>
              
              {pdfCount > 0 ? (
                <div className="bg-scholar-50 dark:bg-scholar-900/30 border border-scholar-100 dark:border-scholar-800 rounded-lg p-3 mt-4 text-scholar-800 dark:text-scholar-200">
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <FileText size={14} />
                    <span className="font-semibold">{pdfCount} Document{pdfCount !== 1 ? 's' : ''} Loaded</span>
                  </div>
                  <p className="text-xs opacity-90">
                    I've read your documents. Would you like me to review them or explain a specific concept?
                  </p>
                </div>
              ) : (
                <p>
                  To get started, please <span className="font-semibold text-scholar-600 dark:text-scholar-400">upload a paper</span> or perform a search. I can then help you analyze the text.
                </p>
              )}
            </div>
          </div>
        ) : (
          // Messages List
          <div className="flex flex-col gap-6 py-6">
            {messages.map((msg, index) => (
              <div key={msg.id} className="w-full animate-in fade-in slide-in-from-bottom-2 duration-300">
                {msg.role === 'user' ? (
                  // User Message
                  <div className="flex flex-col items-end gap-1">
                     <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mr-1">You</span>
                     <div className="p-4 bg-scholar-600 text-white rounded-2xl rounded-tr-sm text-[15px] leading-relaxed max-w-[90%] shadow-sm">
                        {msg.text}
                     </div>
                  </div>
                ) : (
                  // Model Message
                  <div className="flex flex-col items-start gap-1 max-w-full">
                     <div className="flex items-center gap-2 ml-1 mb-1">
                        <Sparkles size={12} className="text-scholar-600" />
                        <span className="text-[10px] font-bold text-scholar-600 dark:text-scholar-400 uppercase tracking-wide">Research Mentor</span>
                     </div>
                     
                     <FormattedMessage 
                        text={msg.text} 
                        citations={msg.citations} 
                        onViewCitation={onViewCitation} 
                     />
                     
                     {/* Action Bar for AI Message */}
                     {!isProcessing && index === messages.length - 1 && (
                       <div className="flex gap-4 mt-2 text-gray-400 pl-1">
                          <CopyButton text={msg.text} />
                       </div>
                     )}
                  </div>
                )}
              </div>
            ))}

            {/* Loading Indicator Bubble */}
            {isProcessing && (
                 <div className="w-full animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="flex flex-col items-start gap-1 max-w-full">
                         <div className="flex items-center gap-2 ml-1 mb-1">
                            <Sparkles size={12} className="text-scholar-600" />
                            <span className="text-[10px] font-bold text-scholar-600 dark:text-scholar-400 uppercase tracking-wide">Research Mentor</span>
                         </div>
                         <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-2xl rounded-tl-sm text-gray-500 text-sm shadow-sm inline-flex items-center gap-2">
                             <Loader2 size={14} className="animate-spin text-scholar-600" />
                             <span>Thinking...</span>
                         </div>
                    </div>
                 </div>
            )}
          </div>
        )}
      </div>

      {/* Input Area (Sticky Bottom) */}
      <div className="p-4 md:p-6 bg-[#fbf9f6] dark:bg-dark-card shrink-0 z-20 border-t border-gray-100 dark:border-gray-700">
        <div className="bg-white dark:bg-gray-800 border border-[#e5e5e5] dark:border-gray-700 rounded-2xl shadow-sm p-3 transition-all focus-within:shadow-md focus-within:border-scholar-200 dark:focus-within:border-scholar-800 flex flex-col gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={pdfCount > 0 ? "Ask about the documents..." : "Ask a general question..."}
            className="w-full max-h-[200px] min-h-[44px] bg-transparent resize-none outline-none text-[#333] dark:text-gray-100 placeholder-gray-400 text-[15px] leading-relaxed p-1 custom-scrollbar"
            rows={1}
            disabled={isProcessing}
          />
          
          <div className="flex justify-between items-center pt-1 border-t border-transparent">
            <div className="flex items-center gap-1">
              <button className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors" title="Add File">
                <Plus size={18} />
              </button>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-1 text-gray-400 text-xs font-medium cursor-pointer hover:text-gray-600 dark:hover:text-gray-300 select-none">
                <span>Gemini 2.5 Flash</span>
                <ChevronDown size={12} />
              </div>
              <button
                onClick={handleSubmit}
                disabled={!input.trim() || isProcessing}
                className={`p-2 rounded-lg transition-all duration-200 ${
                  !input.trim() || isProcessing 
                    ? 'bg-[#f0eee6] dark:bg-gray-700 text-gray-400 dark:text-gray-500' 
                    : 'bg-scholar-600 hover:bg-scholar-700 text-white shadow-md transform hover:-translate-y-0.5'
                }`}
              >
                {isProcessing ? <Loader2 size={18} className="animate-spin" /> : <ArrowUp size={18} />}
              </button>
            </div>
          </div>
        </div>
        
        {/* Assignment Helper Suggestions - Context Aware */}
        {messages.length === 0 && (
          <div className="flex flex-wrap gap-2 mt-4 justify-center md:justify-start">
             {pdfCount > 0 ? (
               <>
                 <SuggestionChip icon={<PenTool size={14} />} label="Summarize These" onClick={() => onSendMessage("Can you summarize the main points of the loaded documents?")} />
                 <SuggestionChip icon={<Code size={14} />} label="Extract Methodology" onClick={() => onSendMessage("What research methodologies are used in these papers?")} />
                 <SuggestionChip icon={<Lightbulb size={14} />} label="Find Key Findings" onClick={() => onSendMessage("List the key findings from these documents.")} />
               </>
             ) : (
               <>
                 <SuggestionChip icon={<PenTool size={14} />} label="Structure Essay" onClick={() => onSendMessage("Can you help me outline an essay?")} />
                 <SuggestionChip icon={<Lightbulb size={14} />} label="Brainstorm Topics" onClick={() => onSendMessage("Help me brainstorm research topics.")} />
               </>
             )}
          </div>
        )}
        
        <p className="text-[10px] text-gray-400 text-center mt-4">
            AI can make mistakes. Verify important information.
        </p>
      </div>
    </div>
  );
};

const SuggestionChip: React.FC<{ icon: React.ReactNode; label: string; onClick: () => void }> = ({ icon, label, onClick }) => (
  <button 
    onClick={onClick}
    className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-gray-800 border border-[#e5e5e5] dark:border-gray-700 rounded-full text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-all shadow-sm"
  >
    <span className="text-gray-400 dark:text-gray-500">{icon}</span>
    {label}
  </button>
);