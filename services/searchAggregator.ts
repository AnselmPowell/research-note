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
// LOGGING HELPERS
// ─────────────────────────────────────────────────────────────────────────────

interface ApiTiming {
    api: string;
    startTime: number;
    endTime?: number;
    duration?: number;
    success: boolean;
    resultCount: number;
    query: string;
    error?: string;
    errorCategory?: 'timeout' | 'network' | 'auth' | 'rate_limit' | 'server' | 'parse' | 'unknown';
}

const apiTimings: ApiTiming[] = [];

function logApiStart(api: string, query: string): number {
    const startTime = performance.now();
    console.log(`[${api}] 🚀 Starting search`);
    console.log(`[${api}] 📝 Query: ${query.substring(0, 100)}${query.length > 100 ? '...' : ''}`);
    return startTime;
}

function logApiSuccess(api: string, startTime: number, resultCount: number, query: string) {
    const endTime = performance.now();
    const duration = endTime - startTime;
    console.log(`[${api}] ✅ Success in ${duration.toFixed(0)}ms - Found ${resultCount} papers`);
    
    apiTimings.push({
        api,
        startTime,
        endTime,
        duration,
        success: true,
        resultCount,
        query
    });
}

function logApiFailure(api: string, startTime: number, error: any, query: string) {
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    // Categorize error for better user feedback
    let errorCategory: ApiTiming['errorCategory'] = 'unknown';
    let simpleReason = 'Unknown error';
    
    if (error.name === 'AbortError' || error.message?.includes('timeout')) {
        errorCategory = 'timeout';
        simpleReason = 'Request timed out';
    } else if (error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')) {
        errorCategory = 'network';
        simpleReason = 'Network connection failed';
    } else if (error.message?.includes('401') || error.message?.includes('403')) {
        errorCategory = 'auth';
        simpleReason = 'Authentication failed (check API keys)';
    } else if (error.message?.includes('429')) {
        errorCategory = 'rate_limit';
        simpleReason = 'Rate limit exceeded (too many requests)';
    } else if (error.message?.includes('500') || error.message?.includes('502') || error.message?.includes('503') || error.message?.includes('504')) {
        errorCategory = 'server';
        simpleReason = 'Server error (API provider issue)';
    } else if (error.message?.includes('JSON') || error.message?.includes('parse')) {
        errorCategory = 'parse';
        simpleReason = 'Invalid response format';
    }
    
    console.log(`[${api}] ❌ Failed in ${duration.toFixed(0)}ms - ${simpleReason}`);
    console.log(`[${api}] 🔍 Error details: ${error.message}`);
    
    apiTimings.push({
        api,
        startTime,
        endTime,
        duration,
        success: false,
        resultCount: 0,
        query,
        error: simpleReason,
        errorCategory
    });
}

function logSearchSummary(totalDuration: number, mergedCount: number) {
    console.log('\n' + '═'.repeat(80));
    console.log('  🏁 SEARCH COMPLETED - FINAL REPORT');
    console.log('═'.repeat(80));
    
    // Show each API's result
    apiTimings.forEach(timing => {
        const status = timing.success 
            ? `✅ SUCCESS` 
            : `❌ FAILED`;
        const duration = timing.duration?.toFixed(0).padStart(6) || '?';
        const resultInfo = timing.success 
            ? `${timing.resultCount} papers found` 
            : `Error: ${timing.error}`;
        
        console.log(`  ${timing.api.padEnd(15)} ${duration}ms  ${status}  ${resultInfo}`);
    });
    
    console.log('─'.repeat(80));
    console.log(`  ⏱️  Total Search Time: ${totalDuration.toFixed(0)}ms`);
    console.log(`  📚 Total Papers (before dedup): ${apiTimings.reduce((sum, t) => sum + t.resultCount, 0)}`);
    console.log(`  🎯 Unique Papers (after dedup): ${mergedCount}`);
    console.log('═'.repeat(80) + '\n');
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
    const mapped = results.map((pub) => {
        const pdfUri = pub.pdfURL || pub.url || null;
        
        if (!pdfUri) return null;

        const score = scoreRelevance(pub.title || '', pub.abstract || '', allKeywords, pub.year);

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
            relevanceScore: score
        };
    });

    return mapped.filter(Boolean) as ArxivPaper[];
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
    const startTime = logApiStart('OpenAlex', booleanQuery);
    
    try {
        const r = await fetch(`${API_BASE}/search/openalex`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: { query: booleanQuery } }),
            signal: AbortSignal.timeout(18000)
        });
        
        if (!r.ok) {
            throw new Error(`HTTP ${r.status}: ${r.statusText}`);
        }
        
        const result = await r.json();
        const papers = normaliseOpenAlex(result.data || []);
        
        logApiSuccess('OpenAlex', startTime, papers.length, booleanQuery);
        return papers;
    } catch (e: any) {
        logApiFailure('OpenAlex', startTime, e, booleanQuery);
        return [];
    }
}

async function fetchGoogleCSE(booleanQuery: string): Promise<ArxivPaper[]> {
    const startTime = logApiStart('GoogleCSE', booleanQuery);
    
    try {
        const r = await fetch(`${API_BASE}/search/google-cse`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: { query: booleanQuery } }),
            signal: AbortSignal.timeout(25000)
        });
        
        if (!r.ok) {
            throw new Error(`HTTP ${r.status}: ${r.statusText}`);
        }
        
        const result = await r.json();
        const papers = normaliseGoogleCSE(result.data || []);
        
        logApiSuccess('GoogleCSE', startTime, papers.length, booleanQuery);
        return papers;
    } catch (e: any) {
        logApiFailure('GoogleCSE', startTime, e, booleanQuery);
        return [];
    }
}

async function fetchPDFVector(booleanQuery: string, allKeywords: string[]): Promise<ArxivPaper[]> {
    const startTime = logApiStart('PDFVector', booleanQuery);
    
    try {
        const r = await fetch(`${API_BASE}/search/pdfvector`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: { query: booleanQuery } }),
            signal: AbortSignal.timeout(38000)
        });
        
        if (!r.ok) {
            throw new Error(`HTTP ${r.status}: ${r.statusText}`);
        }
        
        const result = await r.json();
        const normalised = normalisePDFVector(result.data || [], allKeywords);
        
        // Apply ScholarAI re-ranking: sort by relevance score, cap at 50
        const ranked = normalised
            .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0))
            .slice(0, 50);
        
        logApiSuccess('PDFVector', startTime, ranked.length, booleanQuery);
        return ranked;
    } catch (e: any) {
        logApiFailure('PDFVector', startTime, e, booleanQuery);
        return [];
    }
}

async function fetchGoogleGrounding(groundingQuery: string): Promise<ArxivPaper[]> {
    const startTime = logApiStart('GoogleGrounding', groundingQuery);
    
    try {
        const r = await fetch(`${API_BASE}/gemini/grounding-search`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: { query: groundingQuery } }),
            signal: AbortSignal.timeout(35000)
        });
        
        if (!r.ok) {
            throw new Error(`HTTP ${r.status}: ${r.statusText}`);
        }
        
        const result = await r.json();
        const papers = normaliseGrounding(result.data || []);
        
        logApiSuccess('GoogleGrounding', startTime, papers.length, groundingQuery);
        return papers;
    } catch (e: any) {
        logApiFailure('GoogleGrounding', startTime, e, groundingQuery);
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
    
    // Clear previous timings
    apiTimings.length = 0;

    // Build each API's specific query format
    const arxivQueries = buildArxivQueries(structured, originalTopics, originalQuestions);
    const booleanQuery = buildBooleanQuery(structured);
    const groundingQ = buildGroundingQuery(structured);
    const allKeywords = [structured.primary_keyword, ...structured.secondary_keywords].filter(Boolean);

    console.log('\n' + '═'.repeat(80));
    console.log('  STARTING MULTI-API SEARCH');
    console.log('═'.repeat(80));
    console.log(`  Query Keywords: ${allKeywords.join(', ')}`);
    console.log(`  Boolean Query: ${booleanQuery}`);
    console.log(`  ArXiv Queries: ${arxivQueries.length} variations`);
    console.log('═'.repeat(80) + '\n');

    if (onStatusUpdate) onStatusUpdate('Searching academic sources...');

    // Incremental tracking
    let completedCount = 0;
    const totalAis = 5;
    const updateProgress = (apiName: string, count: number) => {
        completedCount++;
        if (onStatusUpdate) {
            onStatusUpdate(`Searching... ${completedCount}/${totalAis} sources checked (${apiName} found ${count})`);
        }
    };

    // Track ArXiv timing separately since it has its own logging
    const arxivStartTime = performance.now();
    const arxivQueryString = `${arxivQueries.length} queries: ${arxivQueries.slice(0, 2).join('; ')}${arxivQueries.length > 2 ? '...' : ''}`;
    
    console.log(`[ArXiv] 🚀 Starting search`);
    console.log(`[ArXiv] 📝 Query: ${arxivQueryString}`);
    
    // Promise.allSettled with incremental reporting
    const [arxivResult, openAlexResult, cseResult, pdfVectorResult, groundingResult] =
        await Promise.allSettled([
            searchArxiv(arxivQueries, undefined, originalTopics).then(res => { 
                // Log ArXiv success in apiTimings
                const arxivDuration = performance.now() - arxivStartTime;
                console.log(`[ArXiv] ✅ Success in ${arxivDuration.toFixed(0)}ms - Found ${res.length} papers`);
                apiTimings.push({
                    api: 'ArXiv',
                    startTime: arxivStartTime,
                    endTime: performance.now(),
                    duration: arxivDuration,
                    success: true,
                    resultCount: res.length,
                    query: arxivQueryString
                });
                updateProgress('ArXiv', res.length); 
                return res; 
            }).catch(err => {
                const arxivDuration = performance.now() - arxivStartTime;
                console.log(`[ArXiv] ❌ Failed in ${arxivDuration.toFixed(0)}ms - ${err.message}`);
                apiTimings.push({
                    api: 'ArXiv',
                    startTime: arxivStartTime,
                    endTime: performance.now(),
                    duration: arxivDuration,
                    success: false,
                    resultCount: 0,
                    query: arxivQueryString,
                    error: err.message
                });
                throw err; // Re-throw to maintain Promise.allSettled behavior
            }),
            fetchOpenAlex(booleanQuery).then(res => { updateProgress('OpenAlex', res.length); return res; }),
            fetchGoogleCSE(booleanQuery).then(res => { updateProgress('Google', res.length); return res; }),
            fetchPDFVector(booleanQuery, allKeywords).then(res => { updateProgress('PDFs', res.length); return res; }),
            fetchGoogleGrounding(groundingQ).then(res => { updateProgress('Grounding', res.length); return res; })
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

    // Update metrics with final count
    searchMetrics.totalPapers = merged.length;
    
    // Log comprehensive summary
    const totalDuration = performance.now() - startTime;
    logSearchSummary(totalDuration, merged.length);

    return {
        papers: merged,
        metrics: searchMetrics
    };
};
