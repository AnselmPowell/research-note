# Active Context - Research Note

## Current Work Focus (February 19, 2026)

### Primary Active Focus: Multi-Source Search Aggregation & ArXiv Precision

**Recent Major Accomplishments (Feb 19, 2026):**
1. ✅ **ArXiv Search Precision Overhaul** — Replaced scattered keyword generation with focused primary+secondary keyword system using `abs:` AND queries
2. ✅ **Multi-Source Search Aggregator** — NEW `searchAggregator.ts` runs 5 search APIs in parallel (ArXiv, OpenAlex, Google CSE, PDFVector, Google Grounding)
3. ✅ **Academic Keyword Engine** — New LLM prompt generates 1 primary keyword + 3 single-word secondaries + AND combinations
4. ✅ **Backend Search Proxy Routes** — NEW `backend/routes/search.js` with OpenAlex, Google CSE, PDFVector endpoints
5. ✅ **Google Grounding Search** — NEW `searchWithGrounding()` in geminiService uses Gemini's `googleSearch` tool

**Previous Accomplishments (Feb 6, 2026):**
- ✅ Backend API Proxy Architecture
- ✅ Embedding Model Migration (`text-embedding-004` → `gemini-embedding-001`)
- ✅ Zero Results Bug Fix
- ✅ Comprehensive Logging

### Latest Session Changes (Feb 19, 2026)

**Overhaul: ArXiv Search Keyword Generation**
- **Problem**: Old system generated 4 arrays of scattered terms (`exact_phrases`, `title_terms`, `abstract_terms`, `general_terms`), producing 12+ loose queries returning 200+ low-relevance papers
- **Solution**: New academic keyword engine generates focused `primary_keyword` + `secondary_keywords` + `query_combinations` with AND logic on `abs:` field
- **Type Change**: `ArxivSearchStructured` replaced from 4 arrays → 3 fields:
  ```typescript
  // OLD
  { exact_phrases: string[], title_terms: string[], abstract_terms: string[], general_terms: string[] }
  // NEW
  { primary_keyword: string, secondary_keywords: string[], query_combinations: string[] }
  ```
- **Result**: ~6 precise queries instead of 12+ loose ones, dramatically higher relevance

**New: Multi-Source Search Aggregator**
- **File**: `services/searchAggregator.ts`
- **Purpose**: Single `searchAllSources()` function replaces direct `searchArxiv()` call in ResearchContext
- **APIs**: ArXiv + OpenAlex + Google CSE + PDFVector + Google Grounding — all in parallel via `Promise.allSettled`
- **Dedup**: By `pdfUri`, priority: ArXiv → OpenAlex → PDFVector → CSE → Grounding

**New: Backend Search Proxy Routes**
- **File**: `backend/routes/search.js`
- **Endpoints**: `POST /search/openalex`, `POST /search/google-cse`, `POST /search/pdfvector`
- **Contract**: All return `{ success: true, data: [] }` on failure — never block other APIs

## Current Technical State

### Backend Architecture (Node.js + Express)
```javascript
// server.js - Port 3001
app.use('/api/v1/gemini', geminiRoutes);    // AI operations + grounding-search
app.use('/api/v1/database', databaseRoutes); // CRUD operations
app.use('/api/v1/agent', agentRoutes);       // Research assistant
app.use('/api/v1/arxiv', arxivRoutes);       // ArXiv proxy (CORS fix)
app.use('/api/v1/search', searchRoutes);     // NEW: OpenAlex, Google CSE, PDFVector
```

### Critical Services Status
- ✅ **Gemini AI**: `gemini-2.5-flash` for generation, `gemini-embedding-001` for embeddings
- ✅ **Database**: Neon Serverless Postgres with user-scoped queries
- ✅ **ArXiv**: Backend proxy + new `abs:` AND queries for precision
- ✅ **OpenAlex**: Free academic DB, no API key required
- ✅ **Google CSE**: 5 pages × 10 = 50 PDF results
- ✅ **PDFVector**: Academic search with client-side relevance scoring
- ✅ **Google Grounding**: Gemini `googleSearch` tool for PDF discovery
- ⚠️ **OpenAI**: Fallback only (not primary)

## Key Files Modified (Feb 19)
- `types.ts` — `ArxivSearchStructured` interface replaced, `sourceApi` added to `ArxivPaper`
- `services/arxivService.ts` — `buildArxivQueries()` rewritten for `abs:` AND queries
- `services/searchAggregator.ts` — **NEW** multi-source orchestrator
- `services/geminiService.ts` — `year?` added to metadata return type
- `contexts/ResearchContext.tsx` — `searchAllSources()` replaces `searchArxiv()`, `displayKeywords` updated
- `backend/services/geminiService.js` — `generateArxivSearchTerms()` rewritten + `searchWithGrounding()` added
- `backend/routes/search.js` — **NEW** proxy routes for 3 search APIs
- `backend/routes/gemini.js` — `grounding-search` route added
- `backend/routes/index.js` — search routes mounted
