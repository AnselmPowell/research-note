
import { ArxivPaper, ArxivSearchStructured } from "../types";

// Results per query
const MAX_RESULTS_PER_QUERY = 50;
// Concurrency Limit for ArXiv API calls - keeps us under the radar
const CONCURRENCY_LIMIT = 4;

// Helper to delay execution (Rate Limits)
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Searching arXiv: 
 * Builds specific arXiv API query strings from the structured object.
 */
export const buildArxivQueries = (
  structured: ArxivSearchStructured,
  originalTopics: string[],
  originalQuestions: string[]
): string[] => {
  const queries: string[] = [];

  const clean = (s: string) => s.replace(/[\\]/g, '').trim();

  // 1. Exact Phrases - Wrap in quotes to ensure ArXiv treats as a single phrase
  structured.exact_phrases.forEach(phrase => {
    const cleaned = clean(phrase);
    if (cleaned) {
      const quoted = (cleaned.startsWith('"') && cleaned.endsWith('"')) ? cleaned : `"${cleaned}"`;
      queries.push(`all:${quoted}`);
    }
  });

  // 2. Title Terms - "ti"
  structured.title_terms.forEach(term => {
    const cleaned = clean(term);
    if (cleaned) queries.push(`ti:${cleaned}`);
  });

  // 3. Abstract Terms - "abs"
  const absTerms = structured.abstract_terms.filter(t => clean(t)).map(t => clean(t));
  if (absTerms.length > 0) {
    const combined = absTerms.map(t => `abs:${t}`).join(' AND ');
    queries.push(combined);
  }

  // 4. General Terms - "all"
  structured.general_terms.forEach(term => {
    const cleaned = clean(term);
    if (cleaned) queries.push(`all:${cleaned}`);
  });

  // 5. Original User Topics (Fallback)
  originalTopics.forEach(topic => {
    if (clean(topic)) queries.push(`all:${clean(topic)}`);
  });

  // 6. Original Questions
  originalQuestions.forEach(q => {
    const cleaned = clean(q);
    if (cleaned.length < 50 && cleaned.length > 3) {
      queries.push(`all:${cleaned}`);
    }
  });

  const finalQueries = Array.from(new Set(queries));
  console.log(`[ArXiv Debug] Built ${finalQueries.length} distinct queries.`);
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
  console.log(`[ArXiv Debug] Starting fetch for: ${apiUrl}`);

  // Strategy 1: Backend Proxy (PRODUCTION & DEV)
  try {
    const s1Start = performance.now();
    const API_BASE = import.meta.env.DEV
      ? 'http://localhost:3001/api/v1'
      : '/api/v1';
    const proxyUrl = `${API_BASE}/arxiv/proxy?url=${encodeURIComponent(apiUrl)}`;
    console.log(`[ArXiv Debug] Strategy 1: Attempting Backend Proxy...`);

    const response = await fetch(proxyUrl, { signal: AbortSignal.timeout(8000) });
    if (response.ok) {
      const result = await response.json();
      if (result.success && result.data) {
        console.log(`[ArXiv Debug] ✅ Strategy 1 (Backend) SUCCEEDED in ${Math.round(performance.now() - s1Start)}ms`);
        return result.data;
      }
    }
    console.warn(`[ArXiv Debug] ❌ Strategy 1 (Backend) returned status: ${response.status}`);
  } catch (e: any) {
    console.warn(`[ArXiv Debug] ❌ Strategy 1 (Backend) FAILED: ${e.message}`);
  }

  // Strategy 2: CorsProxy.io (Fallback for localhost only)
  try {
    const s2Start = performance.now();
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(apiUrl)}`;
    console.log(`[ArXiv Debug] Strategy 2: Attempting CorsProxy.io...`);

    const response = await fetch(proxyUrl, { signal: AbortSignal.timeout(6000) });
    if (response.ok) {
      console.log(`[ArXiv Debug] ✅ Strategy 2 (CorsProxy) SUCCEEDED in ${Math.round(performance.now() - s2Start)}ms`);
      return await response.text();
    }
    console.warn(`[ArXiv Debug] ❌ Strategy 2 (CorsProxy) returned status: ${response.status}`);
  } catch (e: any) {
    console.warn(`[ArXiv Debug] ❌ Strategy 2 (CorsProxy) FAILED: ${e.message}`);
  }

  // Strategy 3: AllOrigins (Last resort)
  const s3Start = performance.now();
  try {
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(apiUrl)}`;
    console.log(`[ArXiv Debug] Strategy 3: Attempting AllOrigins Proxy...`);

    const response = await fetch(proxyUrl, { signal: AbortSignal.timeout(10000) });
    if (response.ok) {
      console.log(`[ArXiv Debug] ✅ Strategy 3 (AllOrigins) SUCCEEDED in ${Math.round(performance.now() - s3Start)}ms`);
      return await response.text();
    }
    console.error(`[ArXiv Debug] ❌ Strategy 3 (AllOrigins) FAILED with status: ${response.status}`);
  } catch (e: any) {
    console.error(`[ArXiv Debug] ❌ Strategy 3 (AllOrigins) ERROR: ${e.message}`);
  }

  console.error(`[ArXiv Debug] 🚨 ALL STRATEGIES EXHAUSTED for URL: ${apiUrl}`);
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

  console.log(`[ArXiv Debug] 🚀 Starting Global Search with ${queries.length} queries.`);

  const worker = async (query: string): Promise<ArxivPaper[]> => {
    if (onStatusUpdate) onStatusUpdate(`Searching for papers related to "${query}"...`);
    // Reduced jitter range slightly since proxies add natural variance
    const jitter = Math.round(Math.random() * 500);
    await delay(jitter);
    return await fetchArxivQuery(query);
  };

  if (queries.length > 0) {
    const results = await processConcurrent(queries, CONCURRENCY_LIMIT, worker);

    results.flat().forEach(paper => {
      if (!seenIds.has(paper.id)) {
        seenIds.add(paper.id);
        allPapers.push(paper);
      }
    });
  }

  // Emergency Fallback logic preserved
  if (allPapers.length < 3 && fallbackTopics.length > 0) {
    console.log(`[ArXiv Debug] ⚠️ Only ${allPapers.length} papers found. Triggering fallback.`);
    const fallbackQueries = fallbackTopics
      .map(t => `all:${t.replace(/["\\]/g, '').trim()}`)
      .filter(q => !queries.includes(q));

    if (fallbackQueries.length > 0) {
      const results = await processConcurrent(fallbackQueries, CONCURRENCY_LIMIT, worker);
      results.flat().forEach(paper => {
        if (!seenIds.has(paper.id)) {
          seenIds.add(paper.id);
          allPapers.push(paper);
        }
      });
    }
  }

  console.log(`[ArXiv Debug] 🏁 TOTAL SEARCH FINISHED in ${Math.round(performance.now() - totalSearchStart)}ms. Total Unique Papers: ${allPapers.length}`);
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
            console.error(`[ArXiv Debug] Pool Task failure:`, err);
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
