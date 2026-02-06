# AI Integration

## AI Provider Stack

**Primary:** Google Gemini (gemini-3-flash-preview, gemini-3-pro-preview)
**Fallback:** OpenAI (gpt-4o-mini)
⚠️ **Embedding Model:** `gemini-embedding-001` (switched from text-embedding-004 - Feb 6 shutdown)

```typescript
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Automatic failover
try {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt
  });
} catch (error) {
  console.warn("[AI] Gemini failed, switching to OpenAI");
  return callOpenAI(prompt);
}
```

## Deep Research Pipeline (5 Phases)

### Phase 1: Intent Modeling
Generate structured ArXiv search terms from user input.

```typescript
const generateArxivSearchTerms = async (topics: string[], questions: string[]) => {
  const prompt = `Generate structured search terms:
    { "exact_phrases": [], "title_terms": [], "abstract_terms": [], "general_terms": [] }`;

  return ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: { responseMimeType: "application/json" }
  });
};
```

### Phase 2: Distributed Gathering
High-concurrency ArXiv search with backend proxy for CORS.

```typescript
// Backend proxy on port 3001 (Node.js/Express)
app.get('/api/arxiv-proxy', async (req, res) => {
  const arxivUrl = `https://export.arxiv.org/api/query?${req.query.params}`;
  const response = await fetch(arxivUrl);
  res.send(await response.text());
});

// Frontend: asyncPool for controlled concurrency
await asyncPool(4, queries, async (query) => {
  return fetch(`http://localhost:3001/api/arxiv-proxy?params=${query}`);
});
```

### Phase 3: Semantic Distillation
Vector similarity filtering with **relevance threshold: 0.30** (lowered from 0.48).

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
    .filter(p => (p.relevanceScore || 0) >= 0.30) // ⚠️ Updated threshold
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
      model: "gemini-3-flash-preview",
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
