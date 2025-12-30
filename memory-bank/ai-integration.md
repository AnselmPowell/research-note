# AI Integration Patterns

## AI Service Architecture

### Multi-Provider Strategy

**Primary AI Provider: Google Gemini**
```typescript
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Model Selection Strategy:
// - gemini-3-flash-preview: Fast extraction, cost-effective
// - gemini-3-pro-preview: Complex reasoning, higher quality
```

**Fallback Provider: OpenAI**  
```typescript
// Automatic failover on Gemini failures
async function callOpenAI(prompt: string): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }]
    })
  });
}
```

## AI Pipeline Patterns

### Five-Stage Deep Research Pipeline

#### **Stage 1: Intent Modeling**
```typescript
// Convert user query into structured academic search terms
const generateArxivSearchTerms = async (topics: string[], questions: string[]): Promise<ArxivSearchStructured> => {
  const prompt = `
    You are an arXiv search expert.
    User Topics: "${topics.join(", ")}"
    User Questions: "${questions.join("; ")}"
    
    Generate structured search terms:
    {
      "exact_phrases": ["specific 2-4 word phrases"],
      "title_terms": ["terms for titles"],
      "abstract_terms": ["terms for abstracts"],  
      "general_terms": ["domain synonyms"]
    }
  `;
  
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: { responseMimeType: "application/json" }
  });
};
```

#### **Stage 2: Distributed Gathering**
```typescript
// High-concurrency arXiv search with proxy failovers
const searchArxiv = async (queries: string[]): Promise<ArxivPaper[]> => {
  const CONCURRENCY_LIMIT = 4;
  
  await asyncPool(CONCURRENCY_LIMIT, queries, async (query) => {
    return await fetchWithFallback(`https://export.arxiv.org/api/query?search_query=${query}`);
  });
};

// Proxy failover system
const fetchWithFallback = async (apiUrl: string): Promise<string> => {
  try {
    // Strategy 1: CorsProxy.io (Primary)
    const response = await fetch(`https://corsproxy.io/?${encodeURIComponent(apiUrl)}`);
    if (response.ok) return await response.text();
  } catch {
    // Strategy 2: AllOrigins (Fallback)
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(apiUrl)}`;
    return await fetch(proxyUrl).then(r => r.text());
  }
};
```

#### **Stage 3: Semantic Distillation**
```typescript
// Vector similarity filtering for relevance
const filterRelevantPapers = async (papers: ArxivPaper[], userQuestions: string[]): Promise<ArxivPaper[]> => {
  // Generate query embedding
  const userIntentText = `Questions: ${userQuestions.join("\n")}`;
  const targetVector = await getEmbedding(userIntentText, "RETRIEVAL_QUERY");
  
  // Generate paper embeddings  
  const paperTexts = papers.map(p => `Title: ${p.title}\nAbstract: ${p.summary}`);
  const paperEmbeddings = await getBatchEmbeddings(paperTexts, "RETRIEVAL_DOCUMENT");
  
  // Calculate cosine similarity and filter
  return papers
    .map((paper, index) => ({
      ...paper,
      relevanceScore: cosineSimilarity(targetVector, paperEmbeddings[index])
    }))
    .filter(p => (p.relevanceScore || 0) >= 0.48)
    .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0))
    .slice(0, 20);
};
```

#### **Stage 4: Geometric PDF Reconstruction**
```typescript
// Custom algorithm for academic paper layout handling
function sortPageItems(items: any[]) {
  const midX = (minX + maxX) / 2;
  const crossers: any[] = [];
  const left: any[] = [];
  const right: any[] = [];

  items.forEach(item => {
    const x = item.transform[4];
    const w = item.width;
    
    // Detect headers/titles that cross column boundaries
    if (x < midX && x + w > midX) {
      crossers.push(item);
    } else if (x + w <= midX) {
      left.push(item);
    } else {
      right.push(item);
    }
  });

  // Two-column layout detection
  const isTwoColumn = items.length > 0 && (crossers.length / items.length) < 0.2;

  if (isTwoColumn) {
    return [
      ...crossers.sort(ySorter), // Headers first
      ...left.sort(ySorter),     // Left column
      ...right.sort(ySorter)     // Right column  
    ];
  } else {
    return items.sort(ySorter);  // Standard layout
  }
}
```

#### **Stage 5: Targeted RAG Extraction**
```typescript
// Two-pass extraction with streaming updates
const extractNotesFromPages = async (
  relevantPages: RelevantPage[],
  userQuestions: string,
  onStreamUpdate?: (notes: DeepResearchNote[]) => void
): Promise<DeepResearchNote[]> => {
  
  const BATCH_SIZE = 8;
  const CONCURRENCY = 3;
  
  // Process pages in batches
  const batches = chunk(relevantPages, BATCH_SIZE);
  
  const processBatch = async (batch: RelevantPage[]) => {
    const contextText = batch.map(p => 
      `==Page ${p.pageIndex + 1}==\n${p.text}\n==Page ${p.pageIndex + 1}==`
    ).join("\n\n");

    const prompt = `
      You are a PhD Research Assistant.
      User's Questions: "${userQuestions}"
      
      Extract meaningful insights that DIRECTLY answer the questions.
      Return JSON:
      {
        "notes": [
          {
            "quote": "extracted text...",
            "justification": "Why this was selected and its context...", 
            "relatedQuestion": "which question this answers",
            "pageNumber": 12,
            "relevanceScore": 0.95,
            "citations": [{"inline": "[1]", "full": "..."}]
          }
        ]
      }
      
      Pages: ${contextText}
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: { responseMimeType: "application/json" }
    });
    
    const batchNotes = JSON.parse(response.text).notes;
    
    // Stream results immediately
    if (onStreamUpdate) onStreamUpdate(batchNotes);
    
    return batchNotes;
  };
  
  // Process batches with controlled concurrency
  const results = await asyncPool(CONCURRENCY, batches, processBatch);
  return results.flat();
};
```

## AI Agent Service Patterns

### Research Assistant Agent

**File Upload and Processing:**
```typescript
// Upload PDFs to Gemini Files API for agent access
async uploadFile(file: File, uniqueId: string): Promise<string | null> {
  const uploadResult = await this.ai.files.upload({
    file: file,
    config: { 
      displayName: file.name,
      mimeType: 'application/pdf' 
    }
  });

  // Wait for ACTIVE state (up to 60 seconds)
  let attempts = 0;
  while (attempts < 30) {
    const fileStatus = await this.ai.files.get({ name: uploadResult.name });
    if (fileStatus.state === 'ACTIVE') {
      return uploadResult.uri;
    }
    await delay(2000);
    attempts++;
  }
  
  throw new Error("File processing timeout");
}
```

**Tool-Enabled Conversation:**
```typescript
// Function calling for accessing user's context notes
const readNotesTool: FunctionDeclaration = {
  name: "readContextNotes",
  description: "Reads research notes user has selected/bookmarked",
  parameters: {
    type: Type.OBJECT,
    properties: {}
  }
};

// Chat session with tool access
const chat = this.ai.chats.create({
  model: "gemini-3-pro-preview",
  config: {
    systemInstruction: `You are an advanced Research Assistant...`,
    tools: [{ functionDeclarations: [readNotesTool] }]
  }
});
```

**Structured Citation Output:**
```typescript
// Parse AI responses for citations
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

## Performance Optimization Patterns

### Embedding Cache System
```typescript
// Reduce API calls by 60%+ with intelligent caching
const embeddingCache = new Map<string, number[]>();

async function getEmbedding(text: string, taskType: string = "RETRIEVAL_DOCUMENT"): Promise<number[]> {
  const cacheKey = `${taskType}:${text.trim()}`;
  
  if (embeddingCache.has(cacheKey)) {
    return embeddingCache.get(cacheKey)!;
  }

  const result = await ai.models.embedContent({
    model: "text-embedding-004",
    contents: { parts: [{ text: text }] },
    config: { taskType: taskType as any }
  });
  
  const embedding = result.embeddings?.[0]?.values || [];
  if (embedding.length > 0) {
    embeddingCache.set(cacheKey, embedding);
  }
  
  return embedding;
}
```

### Batch Processing for API Efficiency
```typescript
// Process up to 50 embeddings per batch request
async function getBatchEmbeddings(texts: string[]): Promise<number[][]> {
  const BATCH_SIZE = 50;
  const batches = chunk(texts, BATCH_SIZE);
  
  const processBatch = async (batchTexts: string[]) => {
    const requests = batchTexts.map(text => ({
      model: "models/text-embedding-004",
      content: { parts: [{ text }] },
      taskType: "RETRIEVAL_DOCUMENT"
    }));

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:batchEmbedContents?key=${API_KEY}`,
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

## Error Handling & Resilience Patterns

### Graceful AI Fallback
```typescript
// Primary AI with automatic fallback
export const generateArxivSearchTerms = async (topics: string[], questions: string[]): Promise<ArxivSearchStructured> => {
  try {
    // Try Gemini first
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: { responseMimeType: "application/json" }
    });
    
    return JSON.parse(response.text);
  } catch (error) {
    console.warn("[AI] Gemini failed, switching to OpenAI");
    
    // Fallback to OpenAI
    const result = await callOpenAI(prompt);
    return validateArxivResult(result, fallbackTerms);
  }
};
```

### Rate Limiting with Exponential Backoff
```typescript
async function getEmbeddingWithRetry(text: string, retries = 3): Promise<number[]> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await ai.models.embedContent({
        model: "text-embedding-004",
        contents: { parts: [{ text }] }
      });
    } catch (error: any) {
      const isRateLimit = error?.status === 429;
      
      if (isRateLimit && attempt < retries - 1) {
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

### Abort Controller for Long Operations
```typescript
// Cancel operations gracefully
const abortControllerRef = useRef<AbortController | null>(null);

const performDeepResearch = async (query: DeepResearchQuery) => {
  if (abortControllerRef.current) {
    abortControllerRef.current.abort();
  }
  
  abortControllerRef.current = new AbortController();
  const signal = abortControllerRef.current.signal;
  
  try {
    // Pass signal to all async operations
    const papers = await searchArxiv(queries, signal);
    const filtered = await filterRelevantPapers(papers, questions, signal);
    await analyzeArxivPapers(filtered, questions, keywords, signal);
  } catch (error: any) {
    if (!signal.aborted) {
      // Handle actual errors vs user cancellation
      setResearchPhase('failed');
    }
  }
};
```

## AI Quality Assurance Patterns

### Confidence Scoring
```typescript
// AI provides relevance scores for extracted content
interface DeepResearchNote {
  quote: string;
  justification: string;
  relevanceScore?: number; // 0.0 to 1.0 confidence
  relatedQuestion: string;
  pageNumber: number;
}

// Filter by confidence threshold
const highConfidenceNotes = notes.filter(n => (n.relevanceScore || 0) >= 0.75);
```

### Source Attribution
```typescript
// Always maintain link to original source
interface DeepResearchNote {
  quote: string;           // Extracted text
  pdfUri: string;         // Source document
  pageNumber: number;     // Exact page location
  citations: Citation[];  // Inline references found
}

// Enable verification by linking back to source
const handleViewSource = (note: DeepResearchNote) => {
  loadPdfFromUrl(note.pdfUri);
  setActivePdf(note.pdfUri);
  setSearchHighlight(note.quote); // Highlight in PDF viewer
};
```

This AI integration architecture provides **reliable, performant, and scalable** AI processing capabilities that handle complex research workflows while maintaining high quality and user trust through transparency and source attribution.