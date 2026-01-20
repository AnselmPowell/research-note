# Technical Context - Research Note

## Technology Stack

### Frontend Core
- **Framework**: React 19.2.1
- **Language**: TypeScript 5.8.2
- **Build Tool**: Vite 6.2.0
- **Styling**: Tailwind CSS 3.4.0
- **Icon Library**: Lucide React 0.468.0

### AI & PDF Processing
- **AI Backend**: Google Gemini 1.5 (Pro & Flash)
- **Fallback**: OpenAI GPT-4o-mini
- **Embeddings**: text-embedding-004
- **PDF Engine**: PDF.js 4.0.379
- **Discovery**: Google Custom Search API + arXiv API

### Infrastructure & Persistence
- **Database**: Neon PostgreSQL (Serverless)
- **Deployment**: Railway (Docker + Nginx)
- **Environment**: Multi-tier (Railway Secrets -> Window.ENV -> Build-time fallback)

## Project Structure

```
research-note/
├── components/              # Feature-based components
│   ├── layout/             # ThreeColumnLayout, LayoutControls
│   ├── search/             # Global search bar and suggestions
│   ├── websearch/          # Web search result cards
│   ├── research/           # Deep Research pipeline UI (ArXiv)
│   ├── sources/            # Sources panel (Left Column)
│   ├── pdf/                # PDF viewer and text extraction
│   └── library/            # Global notes manager
├── contexts/               # Domain-driven state management
│   ├── UIContext.tsx       # Layout, locks, and visibility
│   ├── ResearchContext.tsx # AI research pipelines
│   ├── LibraryContext.tsx  # PDFacquisition and tracking
│   └── DatabaseContext.tsx # Persistence and organization
├── services/               # Feature-specific logic
│   ├── pdfService.ts       # Extraction and geometric sorting
│   └── geminiService.ts    # AI model configuration
└── database/               # DB connection and queries
```

## Technical Constraints

### Performance
- **Concurrency**: Parallel acquisition limited to 3-4 simultaneous threads to avoid browser crashes and rate limits.
- **Latency Targets**: Initial search results in < 3s; deep extraction streaming starts in < 15s.
- **Memory**: PDF buffers are cleared on unmount; current research into LRU caching for large libraries.

### Security
- **Auth**: Neon OAuth integration with Microsoft/Google.
- **Data Migration**: Automated migration service for anonymous users on sign-in.
- **Environment Isolation**: Private keys (Gemini, Database) are never exposed to the client bundle at runtime.

### Search Quotas
- **arXiv**: Limited to 1 request per 3 seconds per client.
- **Google Search**: 100 queries/day limit for free tier; results are optimized to maximize information density.

## Development Workflow

### Build & Pipeline
- **Local Dev**: `npm run dev` (Vite)
- **Verification**: `npm run verify-setup` to check API keys.
- **Deployment**: Automatic build on Railway via `Dockerfile` (Multi-stage).
- **Injection**: `inject-env.sh` generates `window.ENV` at runtime in the container.

### Type Safety
- Strict TypeScript configuration.
- Shared `types.ts` for AI responses, Paper metadata, and Note structures.