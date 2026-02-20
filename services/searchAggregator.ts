import { ArxivPaper, ArxivSearchStructured } from '../types';
import { buildArxivQueries, searchArxiv } from './arxivService';
import { SearchMetrics } from '../types';

const API_BASE = import.meta.env.DEV ? 'http://localhost:3001/api/v1' : '/api/v1';

// ─────────────────────────────────────────────────────────────────────────────
// QUERY TRANSLATORS
// Each search API expects a different query format. We translate once here
// from the shared ArxivSearchStructured keywords so each API gets exactly
// the format that makes it perform best.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * OpenAlex, Google CSE, PDFVector: quoted Boolean AND query
 * e.g. "world war 1" AND "food" AND "global"
 * Proven best-practice from ScholarAI — DO NOT change this format.
 */
function buildBooleanQuery(structured: ArxivSearchStructured): string {
    const terms = [structured.primary_keyword, ...structured.secondary_keywords]
        .filter(Boolean)
        .map(k => `"${k.trim().replace(/"/g, '')}"`);
    return terms.join(' AND ');
}

/**
 * Google Grounding: natural language + academic site operators
 * The LLM performs better with a sentence + search operators than a Boolean string.
 */
function buildGroundingQuery(structured: ArxivSearchStructured): string {
    const base = [structured.primary_keyword, ...structured.secondary_keywords]
        .filter(Boolean)
        .join(' ');
    return `${base} (filetype:pdf OR site:.edu OR site:.org)`;
}

// ─────────────────────────────────────────────────────────────────────────────
// SHARED HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * OpenAlex abstract reconstruction.
 * OpenAlex returns an inverted index {"word": [positions]} instead of plain text.
 * This reconstructs the full abstract string.
 */
function reconstructAbstract(invertedIndex?: Record<string, number[]>): string {
    if (!invertedIndex) return '';
    const wordMap: Record<number, string> = {};
    let maxIndex = 0;
    Object.entries(invertedIndex).forEach(([word, indexes]) => {
        indexes.forEach(i => {
            wordMap[i] = word;
            if (i > maxIndex) maxIndex = i;
        });
    });
    const words: string[] = [];
    for (let i = 0; i <= maxIndex; i++) {
        if (wordMap[i]) words.push(wordMap[i]);
    }
    return words.join(' ');
}

/**
 * PDFVector client-side re-ranking.
 * Directly mirrors original calculateRelevanceScore:
 *   - +100 bonus if ALL distinct keywords found in title OR abstract ("Perfect Match")
 *   - +10 per abstract match, +5 per title match
 *   - Tie-breaker: +0.5 per year after 2000 (slightly favours newer papers)
 */
function scoreRelevance(title: string, abstract: string, allKeywords: string[], year?: number): number {
    let score = 0;
    const t = title.toLowerCase();
    const a = abstract.toLowerCase();

    // Normalize: lowercase, strip quotes, deduplicate (matches original exactly)
    const distinctKeywords = Array.from(new Set(
        allKeywords.map(k => k.toLowerCase().replace(/^"|"$/g, '').trim()).filter(k => k.length > 0)
    ));

    let allKeywordsFound = true;

    distinctKeywords.forEach(term => {
        const inAbstract = a.includes(term);
        const inTitle    = t.includes(term);
        if (inAbstract) score += 10;
        if (inTitle)    score += 5;
        if (!inAbstract && !inTitle) allKeywordsFound = false;
    });

    // CRITICAL: "All Keywords" rule — massive bonus if every keyword is covered
    if (allKeywordsFound && distinctKeywords.length > 0) score += 100;

    // Tie-breaker: slightly favour newer papers (0.5 per year after 2000)
    if (year) score += Math.max(0, year - 2000) * 0.5;

    return score;
}

// ─────────────────────────────────────────────────────────────────────────────
// NORMALISERS: raw API response → unified ArxivPaper[]
// Every normaliser must:
//   - Set pdfUri to a real, downloadable PDF URL (or exclude the paper)
//   - Never throw — return [] on any error
//   - Set sourceApi so Stage 3 logs can identify the origin
// ─────────────────────────────────────────────────────────────────────────────

function normaliseOpenAlex(works: any[]): ArxivPaper[] {
    return works
        .map(work => {
            const abstract = reconstructAbstract(work.abstract_inverted_index);
            const pdfUri =
                work.best_oa_location?.pdf_url ||
                work.primary_location?.pdf_url ||
                null;

            if (!pdfUri) return null; // PDF download requires an actual PDF link

            const landing =
                work.best_oa_location?.landing_page_url ||
                work.primary_location?.landing_page_url ||
                work.doi || '';

            return {
                id: work.id || landing || pdfUri,
                title: work.title || work.display_name || 'Untitled',
                summary: abstract,
                authors: (work.authorships || [])
                    .slice(0, 3)
                    .map((a: any) => a.author?.display_name || ''),
                pdfUri,
                publishedDate: String(work.publication_year || ''),
                sourceApi: 'openalex' as const
            };
        })
        .filter(Boolean) as ArxivPaper[];
}

function normaliseGoogleCSE(items: any[]): ArxivPaper[] {
    return items
        .map(item => {
            const metatags = item.pagemap?.metatags?.[0] || {};
            const abstract =
                metatags['citation_abstract'] ||
                metatags['og:description'] ||
                metatags['description'] ||
                item.snippet || '';

            // Only include if we have a real PDF link
            const citationPdfUrl = metatags['citation_pdf_url'] || null;
            const linkIsPdf = item.link?.toLowerCase().endsWith('.pdf');
            const pdfUri = citationPdfUrl || (linkIsPdf ? item.link : null);

            if (!pdfUri) return null;

            return {
                id: item.link,
                title: item.title || 'Untitled',
                summary: abstract,
                authors: metatags['citation_author'] ? [metatags['citation_author']] : [],
                pdfUri,
                publishedDate: metatags['citation_date'] || '',
                sourceApi: 'google_cse' as const
            };
        })
        .filter(Boolean) as ArxivPaper[];
}

function normalisePDFVector(results: any[], allKeywords: string[]): ArxivPaper[] {
    console.log('[searchAggregator] 🔧 normalisePDFVector - Starting normalisation:', {
        inputCount: results.length,
        keywords: allKeywords,
        firstItem: results[0]
    });
    
    const mapped = results.map((pub, idx) => {
        const pdfUri = pub.pdfURL || pub.url || null;
        
        if (!pdfUri) {
            console.log(`[searchAggregator] 🔧 normalisePDFVector - Item ${idx} filtered out: no pdfUri`, {
                hasPdfURL: !!pub.pdfURL,
                hasUrl: !!pub.url,
                title: pub.title
            });
            return null;
        }

        const score = scoreRelevance(pub.title || '', pub.abstract || '', allKeywords, pub.year);
        
        console.log(`[searchAggregator] 🔧 normalisePDFVector - Item ${idx} mapped:`, {
            title: pub.title?.substring(0, 50),
            pdfUri: pdfUri?.substring(0, 50),
            score,
            year: pub.year,
            abstract: pub.abstract?.substring(0, 50)
        });

        return {
            id: pub.doi || pub.pdfURL || pub.url || pub.title,
            title: pub.title || 'Untitled',
            summary: pub.abstract || '',
            authors: (pub.authors || [])
                .map((a: any) => (typeof a === 'string' ? a : a.name || ''))
                .filter(Boolean),
            pdfUri,
            publishedDate: String(pub.year || ''),
            sourceApi: 'pdfvector' as const,
            // Pre-score for PDFVector; Stage 3 cosine will re-rank across all sources
            // Pass pub.year for tie-breaker (+0.5 per year after 2000, from original)
            relevanceScore: score
        };
    });

    const filtered = mapped.filter(Boolean) as ArxivPaper[];
    
    console.log('[searchAggregator] 🔧 normalisePDFVector - After filtering:', {
        outputCount: filtered.length,
        filtered: mapped.length - filtered.length
    });
    
    return filtered;
}

function normaliseGrounding(results: any[]): ArxivPaper[] {
    return results
        .filter(item => item.isPdf || item.uri?.toLowerCase().endsWith('.pdf'))
        .map(item => {
            const pdfUri = item.uri || null;
            if (!pdfUri || !pdfUri.startsWith('http')) return null;
            return {
                id: item.uri,
                title: item.title || 'Untitled',
                summary: item.summary || '',
                authors: [],
                pdfUri,
                publishedDate: '',
                sourceApi: 'google_grounding' as const
            };
        })
        .filter(Boolean) as ArxivPaper[];
}

// ─────────────────────────────────────────────────────────────────────────────
// INDIVIDUAL API CALLERS
// Each calls our backend proxy (which holds the keys and handles CORS).
// Each returns [] on any failure — never throws.
// ─────────────────────────────────────────────────────────────────────────────

async function fetchOpenAlex(booleanQuery: string): Promise<ArxivPaper[]> {
    try {
        const r = await fetch(`${API_BASE}/search/openalex`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: { query: booleanQuery } }),
            signal: AbortSignal.timeout(18000)
        });
        const result = await r.json();
        return normaliseOpenAlex(result.data || []);
    } catch (e: any) {
        console.warn('[searchAggregator] OpenAlex failed:', e.message);
        return [];
    }
}

async function fetchGoogleCSE(booleanQuery: string): Promise<ArxivPaper[]> {
    try {
        const r = await fetch(`${API_BASE}/search/google-cse`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: { query: booleanQuery } }),
            signal: AbortSignal.timeout(25000)
        });
        const result = await r.json();
        return normaliseGoogleCSE(result.data || []);
    } catch (e: any) {
        console.warn('[searchAggregator] GoogleCSE failed:', e.message);
        return [];
    }
}

async function fetchPDFVector(booleanQuery: string, allKeywords: string[]): Promise<ArxivPaper[]> {
    try {
        console.log('[searchAggregator] 🔍 PDFVector - Starting search');
        console.log('[searchAggregator] 🔍 PDFVector - Query being sent:', booleanQuery);
        console.log('[searchAggregator] 🔍 PDFVector - Keywords:', allKeywords);
        
        const r = await fetch(`${API_BASE}/search/pdfvector`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: { query: booleanQuery } }),
            signal: AbortSignal.timeout(38000)
        });
        
        console.log('[searchAggregator] 🔍 PDFVector - Response status:', r.status);
        
        const result = await r.json();
        console.log('[searchAggregator] 🔍 PDFVector - Raw response data:', {
            hasData: !!result.data,
            dataLength: result.data?.length || 0,
            dataType: typeof result.data,
            firstItem: result.data?.[0],
            fullResponse: result
        });
        
        const normalised = normalisePDFVector(result.data || [], allKeywords);
        
        console.log('[searchAggregator] 🔍 PDFVector - After normalisation:', {
            normalisedCount: normalised.length,
            firstNormalised: normalised[0]
        });
        
        // Apply ScholarAI re-ranking: sort by relevance score, cap at 50
        const ranked = normalised
            .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0))
            .slice(0, 50);
            
        console.log('[searchAggregator] 🔍 PDFVector - After ranking/slicing:', {
            finalCount: ranked.length,
            scores: ranked.slice(0, 3).map(p => ({title: p.title.substring(0, 50), score: p.relevanceScore}))
        });
        
        return ranked;
    } catch (e: any) {
        console.warn('[searchAggregator] ❌ PDFVector failed:', {
            message: e.message,
            stack: e.stack,
            name: e.name
        });
        return [];
    }
}

async function fetchGoogleGrounding(groundingQuery: string): Promise<ArxivPaper[]> {
    try {
        const r = await fetch(`${API_BASE}/gemini/grounding-search`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: { query: groundingQuery } }),
            signal: AbortSignal.timeout(35000)
        });
        const result = await r.json();
        return normaliseGrounding(result.data || []);
    } catch (e: any) {
        console.warn('[searchAggregator] GoogleGrounding failed:', e.message);
        return [];
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN ORCHESTRATOR
// ─────────────────────────────────────────────────────────────────────────────

export const searchAllSources = async (
    structured: ArxivSearchStructured,
    originalTopics: string[],
    originalQuestions: string[],
    onStatusUpdate?: (msg: string) => void
): Promise<{ papers: ArxivPaper[]; metrics: SearchMetrics }> => {
    const startTime = performance.now();

    // Build each API's specific query format
    const arxivQueries = buildArxivQueries(structured, originalTopics, originalQuestions);
    const booleanQuery = buildBooleanQuery(structured);
    const groundingQ = buildGroundingQuery(structured);
    const allKeywords = [structured.primary_keyword, ...structured.secondary_keywords].filter(Boolean);

    console.log('[searchAggregator] 🚀 Launching all 5 search APIs in parallel');
    console.log('[searchAggregator] Boolean query:', booleanQuery);

    if (onStatusUpdate) onStatusUpdate('Searching academic sources...');

    // Promise.allSettled: one API failing never blocks the others
    const [arxivResult, openAlexResult, cseResult, pdfVectorResult, groundingResult] =
        await Promise.allSettled([
            searchArxiv(arxivQueries, undefined, originalTopics),
            fetchOpenAlex(booleanQuery),
            fetchGoogleCSE(booleanQuery),
            fetchPDFVector(booleanQuery, allKeywords),
            fetchGoogleGrounding(groundingQ)
        ]);

    const arxivPapers = arxivResult.status === 'fulfilled' ? arxivResult.value : [];
    const openAlexPapers = openAlexResult.status === 'fulfilled' ? openAlexResult.value : [];
    const csePapers = cseResult.status === 'fulfilled' ? cseResult.value : [];
    const pdfVectorPapers = pdfVectorResult.status === 'fulfilled' ? pdfVectorResult.value : [];
    const groundingPapers = groundingResult.status === 'fulfilled' ? groundingResult.value : [];

    // NEW: Create metrics object with per-API counts
    const searchMetrics: SearchMetrics = {
        arxiv: arxivPapers.length,
        openalex: openAlexPapers.length,
        google_cse: csePapers.length,
        pdfvector: pdfVectorPapers.length,
        google_grounding: groundingPapers.length,
        totalPapers: 0, // Will update after deduplication
        timestamp: Date.now()
    };

    const totalBeforeDedup = arxivPapers.length + openAlexPapers.length + csePapers.length + pdfVectorPapers.length + groundingPapers.length;

    console.log(
        `[searchAggregator] ✅ Search Results — ` +
        `ArXiv:${searchMetrics.arxiv} | ` +
        `OpenAlex:${searchMetrics.openalex} | ` +
        `GoogleCSE:${searchMetrics.google_cse} | ` +
        `PDFVector:${searchMetrics.pdfvector} | ` +
        `Grounding:${searchMetrics.google_grounding} | ` +
        `Total before dedup: ${totalBeforeDedup}`
    );

    // Merge and deduplicate by pdfUri (the pipeline's universal key)
    // Priority order: ArXiv first (most reliable), then structured DBs, then AI
    const seenUris = new Set<string>();
    const merged: ArxivPaper[] = [];

    for (const paper of [
        ...arxivPapers,
        ...openAlexPapers,
        ...pdfVectorPapers,
        ...csePapers,
        ...groundingPapers
    ]) {
        const key = paper.pdfUri.toLowerCase().trim();
        if (key && !seenUris.has(key)) {
            seenUris.add(key);
            merged.push(paper);
        }
    }

    console.log(
        `[searchAggregator] 🏁 Done in ${Math.round(performance.now() - startTime)}ms — ` +
        `${merged.length} unique papers after deduplication`
    );

    // Update metrics with final count
    searchMetrics.totalPapers = merged.length;

    return {
        papers: merged,
        metrics: searchMetrics
    };
};
