
import { buildArxivQueries, searchArxiv } from './arxivService';
import { ArxivSearchStructured, ArxivPaper } from '../types';

/**
 * Unified search aggregator that orchestrates ArXiv and potentially other sources.
 * Re-implemented to resolve build error after Feb 19 search overhaul.
 */
export const searchAllSources = async (
    structured: ArxivSearchStructured,
    topics: string[],
    questions: string[],
    onStatusUpdate?: (msg: string) => void
): Promise<ArxivPaper[]> => {
    console.log('[SearchAggregator] 🚀 Starting multi-source search aggregation');

    try {
        // Stage 1: Convert structured academic intent into ArXiv queries
        const queries = buildArxivQueries(structured, topics, questions);

        // Stage 2: Perform the search
        // Note: Future expansions can add OpenAlex or Google CSE here using Promise.allSettled
        const results = await searchArxiv(queries, onStatusUpdate, topics);

        console.log(`[SearchAggregator] ✅ Aggregation complete. Found ${results.length} papers.`);
        return results;
    } catch (error) {
        console.error('[SearchAggregator] ❌ Search failed:', error);
        throw error;
    }
};
