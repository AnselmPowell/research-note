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
  return await api.gemini.extractNotes({
    relevantPages, userQuestions, paperTitle, paperAbstract, referenceList
  });
};

export const performSearch = async (query: string): Promise<SearchResultData> => {
  return await api.gemini.search(query);
};

export const generateInsightQueries = async (userQuestions: string, contextQuery: string): Promise<string[]> => {
  return await api.gemini.insightQueries(userQuestions, contextQuery);
};
