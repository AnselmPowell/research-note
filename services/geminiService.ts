import { api } from './apiClient';
import { SearchResultData, DeepResearchNote } from "../types";

export const enhanceMetadataWithAI = async (
  firstFourPagesText: string,
  currentMetadata: { title: string; author: string; subject: string },
  signal?: AbortSignal
): Promise<{
  title: string;
  author: string;
  year?: string;
  subject: string;
  harvardReference?: string;
  publisher?: string;
  categories?: string[];
}> => {
  if (signal?.aborted) throw new Error('Aborted');
  return await api.gemini.enhanceMetadata({ firstFourPagesText, currentMetadata });
};

export const generateSearchVariations = async (originalQuery: string): Promise<string[]> => {
  return await api.gemini.searchVariations(originalQuery);
};

export const generateArxivSearchTerms = async (topics: string[], questions: string[]) => {
  return await api.gemini.arxivSearchTerms(topics, questions);
};

export const filterRelevantPapers = async (papers: any[], userQuestions: string[], keywords: string[]) => {
  try {
    const result = await api.gemini.filterPapers(papers, userQuestions, keywords);
    return result;
  } catch (error) {
    console.error('[geminiService] ❌ Filter papers API call failed:', error);
    throw error;
  }
};

export const findRelevantPages = async (pdfs: any[], userGoal: string, generatedQueries: string[]) => {
  const masterQuery = userGoal + '\n' + generatedQueries.join("\n");
  const allPageTexts: string[] = [];
  const pageMetadata: any[] = [];

  for (const pdf of pdfs) {
    for (let i = 0; i < pdf.pages.length; i++) {
      const pageText = pdf.pages[i];
      if (!pageText || pageText.length < 50) continue;
      allPageTexts.push(pageText);
      pageMetadata.push({ pdfUri: pdf.uri, pageIndex: i, text: pageText });
    }
  }

  if (allPageTexts.length === 0) return [];

  const queryVector = await api.gemini.getEmbedding(masterQuery, 'RETRIEVAL_QUERY');
  const pageEmbeddings = await api.gemini.getBatchEmbeddings(allPageTexts, 'RETRIEVAL_DOCUMENT');

  function cosineSimilarity(vecA: number[], vecB: number[]): number {
    const dotProduct = vecA.reduce((acc, val, i) => acc + val * vecB[i], 0);
    const magA = Math.sqrt(vecA.reduce((acc, val) => acc + val * val, 0));
    const magB = Math.sqrt(vecB.reduce((acc, val) => acc + val * val, 0));
    if (magA === 0 || magB === 0) return 0;
    return dotProduct / (magA * magB);
  }

  const initialRelevantPages: any[] = [];
  for (let i = 0; i < pageEmbeddings.length; i++) {
    const pageVector = pageEmbeddings[i];
    if (pageVector && pageVector.length > 0) {
      const score = cosineSimilarity(queryVector, pageVector);
      if (score > 0.20) {
        initialRelevantPages.push({ ...pageMetadata[i], score });
      }
    }
  }

  return initialRelevantPages;
};

export const extractNotesFromPages = async (
  relevantPages: any[],
  userQuestions: string,
  paperTitle?: string,
  paperAbstract?: string,
  referenceList?: string[],
  onStreamUpdate?: (notes: DeepResearchNote[]) => void
): Promise<DeepResearchNote[]> => {
  
  console.log('[🔴 extractNotesFromPages-FRONTEND] 📤 Calling API endpoint:', {
    relevantPagesCount: relevantPages.length,
    userQuestionsLength: userQuestions.length,
    hasPaperTitle: !!paperTitle,
    hasAbstract: !!paperAbstract,
    hasReferences: !!referenceList,
    hasCallback: !!onStreamUpdate,
    paperTitle: paperTitle?.substring(0, 50)
  });

  try {
    const response = await api.gemini.extractNotes({
      relevantPages, userQuestions, paperTitle, paperAbstract, referenceList
    });

    console.log('[🔴 extractNotesFromPages-FRONTEND] 📥 API Response received:', {
      isArray: Array.isArray(response),
      responseLength: response?.length || 0,
      responseType: typeof response,
      firstNoteKeys: response?.[0] ? Object.keys(response[0]) : 'N/A',
      firstThreeNotes: response?.slice(0, 3).map((n: any) => ({
        quote: n.quote?.substring(0, 50),
        pageNumber: n.pageNumber,
        pdfUri: n.pdfUri?.substring(0, 30),
        hasRelatedQuestion: !!n.relatedQuestion
      })) || 'No notes',
      sampleIds: response?.slice(0, 2).map((n: any) => n.pdfUri) || []
    });

    // ✅ CRITICAL FIX: Call the callback to stream notes if provided
    if (onStreamUpdate && response && Array.isArray(response) && response.length > 0) {
      console.log('[🔴 extractNotesFromPages-FRONTEND] 🔄 Calling onStreamUpdate callback with', response.length, 'notes');
      onStreamUpdate(response);
    } else if (onStreamUpdate) {
      console.log('[🔴 extractNotesFromPages-FRONTEND] ⚠️  onStreamUpdate provided but response is:', {
        isArray: Array.isArray(response),
        length: response?.length,
        type: typeof response
      });
    } else {
      console.log('[🔴 extractNotesFromPages-FRONTEND] ⚠️  No onStreamUpdate callback provided');
    }
  
    return response;
  } catch (error) {
    console.error('[🔴 extractNotesFromPages-FRONTEND] ❌ API CALL FAILED:', {
      errorMessage: error instanceof Error ? error.message : String(error),
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      errorStack: error instanceof Error ? error.stack : undefined
    });
    throw error;
  }
};

export const rankTopNotes = async (
  notes: { uniqueId: string; quote: string }[],
  queries: string[],
  purpose: string
): Promise<string[]> => {
  try {
    const noteData = notes.map(n => ({ id: n.uniqueId, content: n.quote }));
    return await api.gemini.rankNotes(noteData, queries, purpose);
  } catch (error) {
    console.error('[geminiService] ❌ Rank notes failed:', error);
    throw error;
  }
};

export const performSearch = async (query: string): Promise<SearchResultData> => {
  return await api.gemini.search(query);
};

export const generateInsightQueries = async (userQuestions: string, contextQuery: string): Promise<string[]> => {
  return await api.gemini.insightQueries(userQuestions, contextQuery);
};
