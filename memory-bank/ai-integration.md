# AI Integration

## AI Provider Stack

**Primary:** Google Gemini (gemini-2.5-flash, gemini-3-pro-preview)
**Fallback:** OpenAI (gpt-4o-mini)
⚠️ **Embedding Model:** `gemini-embedding-001` (switched from text-embedding-004 - Feb 6 shutdown)

```typescript
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Automatic failover
try {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt
  });
} catch (error) {
  console.warn("[AI] Gemini failed, switching to OpenAI");
  return callOpenAI(prompt);
}
```

## Deep Research Pipeline (5 Phases)

### Phase 1: Academic Keyword Generation (UPDATED Feb 19)
Generate focused primary + secondary keywords with AND combinations.

```javascript
// backend/services/geminiService.js — generateArxivSearchTerms()
// Model: gemini-2.5-flash, temperature: 0.1, responseMimeType: application/json
// Prompt: Academic keyword engine with 7 worked examples

// Input: topics + questions joined as userQuery
// Output:
{
  primary_keyword: "world war 1",          // Core academic subject
  secondary_keywords: ["food", "global"],  // Single-word completions (max 3)
  query_combinations: [                    // AND combos, most specific → broader
    "world war 1 AND food AND global",
    "world war 1 AND food",
    "world war 1 AND global"
  ]
}

// Validation: flatten nested arrays, type-check fields, fallback to raw topics
// LLM may return [["a AND b"]] (nested) — flattened with: combos.map(c => Array.isArray(c) ? c[0] : c)
```

### Phase 2: Multi-Source Distributed Search (OVERHAULED Feb 19)
5 search APIs in parallel via `searchAggregator.ts`, each with optimised query format.

```typescript
// services/searchAggregator.ts — searchAllSources()
// Called from ResearchContext.tsx (replaces old direct searchArxiv call)

// Each API gets its optimal query format from same ArxivSearchStructured:
const arxivQueries = buildArxivQueries(structured, topics, questions);  // abs: AND queries
const booleanQuery = buildBooleanQuery(structured);   // "world war 1" AND "food" AND "global"
const groundingQ = buildGroundingQuery(structured);    // natural language + site:.edu operators

// Promise.allSettled: one API failing never blocks others
const [arxiv, openAlex, cse, pdfVector, grounding] = await Promise.allSettled([
  searchArxiv(arxivQueries, undefined, topics),           // ArXiv abs: AND queries
  fetchOpenAlex(booleanQuery),                             // Free academic DB
  fetchGoogleCSE(booleanQuery),                            // 50 PDF results
  fetchPDFVector(booleanQuery, allKeywords),               // Client-side re-ranking
  fetchGoogleGrounding(groundingQ)                         // Gemini googleSearch tool
]);

// Merge + deduplicate by pdfUri (lowercased)
// Priority: ArXiv → OpenAlex → PDFVector → CSE → Grounding
```

**ArXiv Query Builder** (`arxivService.ts:buildArxivQueries`):
```typescript
// PRIMARY: "world war 1 AND food AND global" → abs:(world AND war AND 1) AND abs:food AND abs:global
// FALLBACK: ti:(world AND war AND 1) AND abs:food  (title primary + abstract secondary)
// SAFETY NET: abs:(world AND war AND 1)  (just primary keyword)
// EMERGENCY: all:(world AND war AND 1)  (original topics)
```

**Normalisers** — each API's response → unified `ArxivPaper[]`:
- `normaliseOpenAlex()` — reconstructs abstract from inverted index, requires PDF URL
- `normaliseGoogleCSE()` — extracts from metatags, requires PDF link
- `normalisePDFVector()` — includes relevance scoring (+100 if ALL keywords found)
- `normaliseGrounding()` — filters for PDF results only, extracts year from summary

**Backend Proxy Routes** (`backend/routes/search.js`):
```javascript
POST /api/v1/search/openalex    // Free, mailto polite pool, has_fulltext:true, 50 results
POST /api/v1/search/google-cse  // 5 pages × 10, fileType:pdf, GOOGLE_SEARCH_KEY+CX
POST /api/v1/search/pdfvector   // 40 over-fetched, full fields for scoring, 65s timeout
// All return { success: true, data: [] } on failure — never throw
```

**Google Grounding** (`backend/services/geminiService.js:searchWithGrounding`):
```javascript
// Uses gemini-2.5-flash with tools: [{ googleSearch: {} }]
// Prompt asks for top 10-15 academic PDFs with summaries
// retryWithBackoff: 3 retries on 503, exponential delay starting 1000ms
// Route: POST /api/v1/gemini/grounding-search
```

### Phase 3: Semantic Distillation
Vector similarity filtering with **relevance threshold: 0.48** (lowered from 0.48).

```typescript
const filterRelevantPapers = async (papers: ArxivPaper[], questions: string[]) => {
  // Generate embeddings
  const targetVector = await getEmbedding(questions.join("\n"), "RETRIEVAL_QUERY");
  const paperEmbeddings = await getBatchEmbeddings(
    papers.map(p => `Title: ${p.title}\nAbstract: ${p.summary}`),
    "RETRIEVAL_DOCUMENT"
  );

  // Filter by cosine similarity
  return papers
    .map((paper, i) => ({
      ...paper,
      relevanceScore: cosineSimilarity(targetVector, paperEmbeddings[i])
    }))
    .filter(p => (p.relevanceScore || 0) >= 0.48) // ⚠️ Updated threshold
    .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0))
    .slice(0, 20);
};
```

⚠️ **Zero Results Bug Fix (commit a90481f):**
```typescript
// Clear cache and retry when filtering returns zero results
if (filteredPapers.length === 0) {
  console.log("⚠️ No papers passed filter. Clearing cache and retrying...");
  embeddingCache.clear();
  filteredPapers = await filterRelevantPapers(papers, questions);
}
```

### Phase 4: Geometric PDF Reconstruction
Custom algorithm for academic 2-column layouts.

```typescript
function sortPageItems(items: any[]) {
  const midX = (minX + maxX) / 2;
  const crossers: any[] = []; // Headers spanning columns
  const left: any[] = [];
  const right: any[] = [];

  items.forEach(item => {
    const x = item.transform[4];
    const w = item.width;

    if (x < midX && x + w > midX) {
      crossers.push(item);
    } else if (x + w <= midX) {
      left.push(item);
    } else {
      right.push(item);
    }
  });

  // Two-column detection
  const isTwoColumn = (crossers.length / items.length) < 0.2;

  if (isTwoColumn) {
    return [...crossers.sort(ySorter), ...left.sort(ySorter), ...right.sort(ySorter)];
  }
  return items.sort(ySorter);
}
```

### Phase 5: Targeted RAG Extraction
Batch processing with streaming updates.

```typescript
const extractNotesFromPages = async (
  pages: RelevantPage[],
  questions: string,
  onStreamUpdate?: (notes: DeepResearchNote[]) => void
) => {
  const BATCH_SIZE = 8;
  const CONCURRENCY = 3;

  const batches = chunk(pages, BATCH_SIZE);

  const processBatch = async (batch: RelevantPage[]) => {
    const prompt = `Extract meaningful insights that answer: "${questions}"
      Return JSON: { "notes": [{ "quote", "justification", "pageNumber", "relevanceScore" }] }`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: { responseMimeType: "application/json" }
    });

    const notes = JSON.parse(response.text).notes;
    if (onStreamUpdate) onStreamUpdate(notes); // Stream immediately
    return notes;
  };

  const results = await asyncPool(CONCURRENCY, batches, processBatch);
  return results.flat();
};
```

## Agent Pipeline

### File Upload
```typescript
async uploadFile(file: File): Promise<string> {
  const uploadResult = await ai.files.upload({
    file: file,
    config: { displayName: file.name, mimeType: 'application/pdf' }
  });

  // Wait for ACTIVE state (up to 60 seconds)
  let attempts = 0;
  while (attempts < 30) {
    const status = await ai.files.get({ name: uploadResult.name });
    if (status.state === 'ACTIVE') return uploadResult.uri;
    await delay(2000);
    attempts++;
  }
  throw new Error("File processing timeout");
}
```

### Message Handling with Tool Calling
```typescript
const readNotesTool: FunctionDeclaration = {
  name: "readContextNotes",
  description: "Reads research notes user has selected/bookmarked",
  parameters: { type: Type.OBJECT, properties: {} }
};

const chat = ai.chats.create({
  model: "gemini-3-pro-preview",
  config: {
    systemInstruction: `You are a Research Assistant...`,
    tools: [{ functionDeclarations: [readNotesTool] }]
  }
});
```

### Citations Parsing
```typescript
private parseResponse(rawText: string): AgentResponse {
  const separator = "---CITATIONS---";
  if (rawText.includes(separator)) {
    const [content, jsonStr] = rawText.split(separator);
    try {
      const citations = JSON.parse(jsonStr.trim());
      return { text: content.trim(), citations };
    } catch (e) {
      return { text: content.trim(), citations: [] };
    }
  }
  return { text: rawText, citations: [] };
}
```

## Performance Patterns

### Embedding Cache
```typescript
const embeddingCache = new Map<string, number[]>();

async function getEmbedding(text: string, taskType = "RETRIEVAL_DOCUMENT") {
  const cacheKey = `${taskType}:${text.trim()}`;
  if (embeddingCache.has(cacheKey)) {
    return embeddingCache.get(cacheKey)!;
  }

  const result = await ai.models.embedContent({
    model: "gemini-embedding-001", // ⚠️ Updated model
    contents: { parts: [{ text }] },
    config: { taskType: taskType as any }
  });

  const embedding = result.embeddings?.[0]?.values || [];
  if (embedding.length > 0) {
    embeddingCache.set(cacheKey, embedding);
  }
  return embedding;
}
```

### Batch Embeddings (50 per request)
```typescript
async function getBatchEmbeddings(texts: string[]): Promise<number[][]> {
  const BATCH_SIZE = 50;
  const batches = chunk(texts, BATCH_SIZE);

  const processBatch = async (batchTexts: string[]) => {
    const requests = batchTexts.map(text => ({
      model: "models/gemini-embedding-001", // ⚠️ Updated model
      content: { parts: [{ text }] },
      taskType: "RETRIEVAL_DOCUMENT"
    }));

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents?key=${API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests })
      }
    );

    const data = await response.json();
    return data.embeddings.map((e: any) => e.values || []);
  };

  const results = await asyncPool(3, batches, processBatch);
  return results.flat();
}
```

## Error Recovery

### Rate Limiting with Exponential Backoff
```typescript
async function getEmbeddingWithRetry(text: string, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await ai.models.embedContent({ model: "gemini-embedding-001", contents: { parts: [{ text }] } });
    } catch (error: any) {
      if (error?.status === 429 && attempt < retries - 1) {
        const backoffTime = Math.pow(2, attempt) * 2000 + Math.random() * 1000;
        await delay(backoffTime);
        continue;
      }
      throw error;
    }
  }
  return [];
}
```

### Abort Controller for Cancellation
```typescript
const abortControllerRef = useRef<AbortController | null>(null);

const performDeepResearch = async (query: DeepResearchQuery) => {
  if (abortControllerRef.current) {
    abortControllerRef.current.abort();
  }

  abortControllerRef.current = new AbortController();
  const signal = abortControllerRef.current.signal;

  try {
    const papers = await searchArxiv(queries, signal);
    const filtered = await filterRelevantPapers(papers, questions, signal);
    await analyzeArxivPapers(filtered, questions, keywords, signal);
  } catch (error: any) {
    if (!signal.aborted) {
      setResearchPhase('failed');
    }
  }
};
```

## Structured Logging System

⚠️ **New logging with emojis and formatted boxes:**

```typescript
console.log("┌─────────────────────────────────────");
console.log("│ 🔍 Deep Research Pipeline Started");
console.log("│ Topics:", topics);
console.log("│ Questions:", questions);
console.log("└─────────────────────────────────────");

console.log("📊 Filter Results:");
console.log(`  ✅ Relevant: ${filteredPapers.length}`);
console.log(`  ❌ Filtered out: ${papers.length - filteredPapers.length}`);

console.log("⚠️ Zero results detected - clearing cache and retrying");
```
