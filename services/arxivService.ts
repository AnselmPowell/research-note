
import { ArxivPaper, ArxivSearchStructured } from "../types";

// Results per query
const MAX_RESULTS_PER_QUERY = 50;
// Concurrency Limit for ArXiv API calls - keeps us under the radar
const CONCURRENCY_LIMIT = 4;

// Helper to delay execution (Rate Limits)
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Builds arXiv API query strings from the keyword-focused structure.
 * Primary strategy: abs: field AND combinations (most precise)
 * Fallback strategy: ti: + abs: mixed queries (broader coverage)
 * Emergency: all: queries from original topics
 */
export const buildArxivQueries = (
  structured: ArxivSearchStructured,
  originalTopics: string[],
  originalQuestions: string[]
): string[] => {
  const queries: string[] = [];
  const clean = (s: string) => s.replace(/[\\]/g, '').trim();

  // === PRIMARY STRATEGY: Abstract AND combinations (most precise) ===
  // Each query_combination is like "world war 1 AND food AND global"
  // Split on AND, wrap each term for the abs: field
  structured.query_combinations.forEach(combo => {
    const terms = combo.split(/\s+AND\s+/).map(t => clean(t)).filter(t => t.length > 0);
    if (terms.length === 0) return;

    const absQuery = terms.map(t => {
      const words = t.split(/\s+/).filter(w => w.length > 0);
      // Multi-word term: keep words AND'd within the abs field
      return words.length > 1 ? `abs:(${words.join(' AND ')})` : `abs:${t}`;
    }).join(' AND ');

    if (absQuery) queries.push(absQuery);
  });

  // === FALLBACK STRATEGY: Title primary + abstract secondary ===
  const primaryClean = clean(structured.primary_keyword);
  if (primaryClean) {
    const primaryWords = primaryClean.split(/\s+/).filter(w => w.length > 0);
    const tiPrimary = primaryWords.length > 1
      ? `ti:(${primaryWords.join(' AND ')})` : `ti:${primaryClean}`;

    structured.secondary_keywords.forEach(sec => {
      const secClean = clean(sec);
      if (!secClean) return;
      const secWords = secClean.split(/\s+/).filter(w => w.length > 0);
      const absSec = secWords.length > 1
        ? `abs:(${secWords.join(' AND ')})` : `abs:${secClean}`;
      queries.push(`${tiPrimary} AND ${absSec}`);
    });

    // Safety net: just the primary keyword on abs:
    queries.push(primaryWords.length > 1
      ? `abs:(${primaryWords.join(' AND ')})` : `abs:${primaryClean}`);
  }

  // === EMERGENCY FALLBACK: Original topics as all: queries ===
  if (queries.length === 0) {
    originalTopics.forEach(topic => {
      const cleaned = clean(topic);
      if (cleaned) {
        const words = cleaned.split(/\s+/).filter(w => w.length > 0);
        queries.push(words.length > 1 ? `all:(${words.join(' AND ')})` : `all:${cleaned}`);
      }
    });
  }

  const finalQueries = Array.from(new Set(queries));
  console.log(`[ArXiv Debug] Built ${finalQueries.length} distinct queries:`, finalQueries);
  return finalQueries;
};

/**
 * Fetch arXiv data through backend proxy or fallback to CORS proxies
 * Strategy 1: Backend proxy (most reliable, works in both dev and production)
 * Strategy 2: CorsProxy.io (fallback for localhost)
 * Strategy 3: AllOrigins (last resort)
 */
const fetchWithFallback = async (apiUrl: string): Promise<string> => {
  const startTime = performance.now();

  // Strategy 1: Backend Proxy (PRODUCTION & DEV)
  try {
    console.log(`[ArXiv] 🔗 Trying backend proxy...`);
    const API_BASE = import.meta.env.DEV
      ? 'http://localhost:3001/api/v1'
      : '/api/v1';
    const proxyUrl = `${API_BASE}/arxiv/proxy?url=${encodeURIComponent(apiUrl)}`;

    const response = await fetch(proxyUrl, { signal: AbortSignal.timeout(8000) });
    if (response.ok) {
      const result = await response.json();
      if (result.success && result.data) {
        console.log(`[ArXiv] ✅ Backend proxy succeeded (${(performance.now() - startTime).toFixed(0)}ms)`);
        return result.data;
      }
    }
    console.log(`[ArXiv] ⚠️  Backend proxy returned status: ${response.status}`);
  } catch (e: any) {
    console.log(`[ArXiv] ⚠️  Backend proxy failed: ${e.message}`);
  }

  // Strategy 2: CorsProxy.io (Fallback for localhost only)
  try {
    console.log(`[ArXiv] 🔗 Trying CorsProxy.io...`);
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(apiUrl)}`;
    const response = await fetch(proxyUrl, { signal: AbortSignal.timeout(6000) });
    if (response.ok) {
      console.log(`[ArXiv] ✅ CorsProxy.io succeeded (${(performance.now() - startTime).toFixed(0)}ms)`);
      return await response.text();
    }
    console.log(`[ArXiv] ⚠️  CorsProxy.io returned status: ${response.status}`);
  } catch (e: any) {
    console.log(`[ArXiv] ⚠️  CorsProxy.io failed: ${e.message}`);
  }

  // Strategy 3: AllOrigins (Last resort)
  try {
    console.log(`[ArXiv] 🔗 Trying AllOrigins (last resort)...`);
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(apiUrl)}`;
    const response = await fetch(proxyUrl, { signal: AbortSignal.timeout(10000) });
    if (response.ok) {
      console.log(`[ArXiv] ✅ AllOrigins succeeded (${(performance.now() - startTime).toFixed(0)}ms)`);
      return await response.text();
    }
    console.log(`[ArXiv] ❌ AllOrigins failed with status: ${response.status}`);
  } catch (e: any) {
    console.log(`[ArXiv] ❌ AllOrigins error: ${e.message}`);
  }

  console.log(`[ArXiv] 🚨 All 3 proxy strategies exhausted (${(performance.now() - startTime).toFixed(0)}ms)`);
  throw new Error("Could not connect to arXiv API through any proxy.");
};

/**
 * Fetch and parse a single arXiv query
 */
const fetchArxivQuery = async (query: string): Promise<ArxivPaper[]> => {
  const queryStart = performance.now();
  try {
    const encodedQuery = encodeURIComponent(query);
    const apiUrl = `https://export.arxiv.org/api/query?search_query=${encodedQuery}&start=0&max_results=${MAX_RESULTS_PER_QUERY}`;

    const xmlText = await fetchWithFallback(apiUrl);

    const parseStart = performance.now();
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, "text/xml");

    const parseError = xmlDoc.getElementsByTagName("parsererror");
    if (parseError.length > 0) {
      console.error(`[ArXiv Debug] XML Parse Error for query "${query}"`);
      return [];
    }

    const entries = xmlDoc.getElementsByTagName("entry");
    console.log(`[ArXiv Debug] Query "${query}" returned ${entries.length} results. (Parsed in ${Math.round(performance.now() - parseStart)}ms)`);

    const papers: ArxivPaper[] = [];

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];

      const id = entry.getElementsByTagName("id")[0]?.textContent || "";
      const title = entry.getElementsByTagName("title")[0]?.textContent?.replace(/\s+/g, " ").trim() || "Untitled";
      const summary = entry.getElementsByTagName("summary")[0]?.textContent?.replace(/\s+/g, " ").trim() || "";
      const published = entry.getElementsByTagName("published")[0]?.textContent || "";

      const authorTags = entry.getElementsByTagName("author");
      const authors: string[] = [];
      for (let j = 0; j < authorTags.length; j++) {
        const name = authorTags[j].getElementsByTagName("name")[0]?.textContent;
        if (name) authors.push(name);
      }

      let pdfUri = "";
      const links = entry.getElementsByTagName("link");
      for (let j = 0; j < links.length; j++) {
        if (links[j].getAttribute("title") === "pdf") {
          pdfUri = links[j].getAttribute("href") || "";
        }
      }

      if (!pdfUri && id) {
        pdfUri = id.replace("/abs/", "/pdf/") + ".pdf";
      }

      if (pdfUri) {
        papers.push({
          id,
          title,
          summary,
          authors,
          pdfUri,
          publishedDate: published,
          sourceQuery: query
        });
      }
    }

    return papers;
  } catch (error: any) {
    console.error(`[ArXiv Debug] Fatal error in fetchArxivQuery for "${query}":`, error.message);
    return [];
  }
};

/**
 * Step 2: Search Arxiv (Optimized with Concurrency Pool)
 */
export const searchArxiv = async (
  queries: string[],
  onStatusUpdate?: (msg: string) => void,
  fallbackTopics: string[] = []
): Promise<ArxivPaper[]> => {
  const totalSearchStart = performance.now();
  const allPapers: ArxivPaper[] = [];
  const seenIds = new Set<string>();

  console.log(`[ArXiv] 🚀 Starting search with ${queries.length} queries (${CONCURRENCY_LIMIT} concurrent)`);
  console.log(`[ArXiv] 📝 Queries: ${queries.slice(0, 3).join(', ')}${queries.length > 3 ? ` ... +${queries.length - 3} more` : ''}`);

  const worker = async (query: string, index: number): Promise<ArxivPaper[]> => {
    console.log(`[ArXiv] 🔍 Query ${index + 1}/${queries.length}: ${query.substring(0, 60)}...`);
    if (onStatusUpdate) onStatusUpdate(`Searching for papers related to "${query.substring(0, 40)}..."`);
    const jitter = Math.round(Math.random() * 500);
    await delay(jitter);
    return await fetchArxivQuery(query);
  };

  if (queries.length > 0) {
    const results = await processConcurrent(
      queries.map((q, i) => ({ query: q, index: i })),
      CONCURRENCY_LIMIT,
      ({ query, index }) => worker(query, index)
    );

    results.flat().forEach(paper => {
      if (!seenIds.has(paper.id)) {
        seenIds.add(paper.id);
        allPapers.push(paper);
      }
    });
  }

  console.log(`[ArXiv] ✅ Primary search complete: ${allPapers.length} papers found`);

  // Emergency Fallback logic preserved
  if (allPapers.length < 3 && fallbackTopics.length > 0) {
    console.log(`[ArXiv] ⚠️  Low results (${allPapers.length} papers) - activating fallback search`);
    const fallbackQueries = fallbackTopics
      .map(t => `all:${t.replace(/["\\]/g, '').trim()}`)
      .filter(q => !queries.includes(q));

    if (fallbackQueries.length > 0) {
      console.log(`[ArXiv] 🔄 Fallback: ${fallbackQueries.length} additional queries`);
      const results = await processConcurrent(
        fallbackQueries.map((q, i) => ({ query: q, index: i })),
        CONCURRENCY_LIMIT,
        ({ query, index }) => worker(query, index)
      );
      results.flat().forEach(paper => {
        if (!seenIds.has(paper.id)) {
          seenIds.add(paper.id);
          allPapers.push(paper);
        }
      });
      console.log(`[ArXiv] ✅ Fallback complete: ${allPapers.length} total papers`);
    }
  }

  const totalDuration = performance.now() - totalSearchStart;
  console.log(`[ArXiv] 🏁 Search finished in ${totalDuration.toFixed(0)}ms - Total: ${allPapers.length} unique papers`);
  
  return allPapers;
};

/**
 * Worker Pool logic - Preserved as requested.
 */
async function processConcurrent<T, R>(
  items: T[],
  concurrency: number,
  task: (item: T) => Promise<R>
): Promise<R[]> {
  return new Promise<R[]>((resolve) => {
    let index = 0;
    let active = 0;
    const finalResults: R[] = [];
    const total = items.length;

    if (total === 0) {
      resolve([]);
      return;
    }

    const next = () => {
      if (index >= total && active === 0) {
        resolve(finalResults);
        return;
      }

      while (active < concurrency && index < total) {
        const currentIndex = index++;
        const item = items[currentIndex];
        active++;

        task(item)
          .then((res) => {
            finalResults.push(res);
          })
          .catch((err) => {
            console.error(`[ArXiv] ⚠️  Query task failure:`, err.message);
          })
          .finally(() => {
            active--;
            next();
          });
      }
    };
    next();
  });
}
