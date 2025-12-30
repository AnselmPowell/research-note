# Technical Context - Research Note

## Technology Stack

### Frontend Architecture
```json
{
  "framework": "React 19",
  "language": "TypeScript 5.8.2", 
  "bundler": "Vite 6.2.0",
  "styling": "Tailwind CSS 3.4.0",
  "icons": "Lucide React 0.468.0",
  "state": "React Context API"
}
```

### AI & Processing
```json
{
  "primary_ai": "Google Gemini 3 (Pro + Flash)",
  "fallback_ai": "OpenAI GPT-4o-mini",
  "embeddings": "Google text-embedding-004",
  "pdf_processing": "PDF.js 4.0.379",
  "search_api": "Google Custom Search API",
  "academic_api": "arXiv API"
}
```

### Database & Infrastructure  
```json
{
  "database": "Neon PostgreSQL (Serverless)",
  "deployment": "Railway (Docker + Nginx)",
  "cdn": "Railway Global Edge",
  "ssl": "Automatic Railway SSL",
  "monitoring": "Built-in health checks"
}
```

## Development Environment

### Local Development Setup

**Prerequisites:**
```bash
Node.js >= 20.0.0
npm >= 10.0.0
Git
```

**Environment Variables (.env.local):**
```bash
# Required
GEMINI_API_KEY=your_gemini_api_key

# Optional (for full functionality)  
GOOGLE_SEARCH_KEY=your_google_search_key
GOOGLE_SEARCH_CX=your_custom_search_engine_id
OPENAI_API_KEY=your_openai_api_key
DATABASE_URL=your_neon_postgres_connection_string

# Development
NODE_ENV=development
```

**Local Development Commands:**
```bash
# Install dependencies
npm ci

# Start development server (localhost:3000)
npm run dev

# Build for production
npm run build

# Preview production build (localhost:8080)
npm run preview

# Verify environment setup
npm run verify-setup
```

### Project Structure
```
research-note/
├── components/              # React components by feature
│   ├── layout/             # Layout and UI structure
│   ├── search/             # Search interface components
│   ├── research/           # Deep research pipeline UI
│   ├── pdf/                # PDF viewer and workspace
│   ├── library/            # Note management components
│   └── researcherAI/       # AI assistant interface
├── contexts/               # React Context providers
│   ├── UIContext.tsx       # Layout and interface state
│   ├── ResearchContext.tsx # AI pipeline and search state
│   ├── LibraryContext.tsx  # PDF management state
│   └── DatabaseContext.tsx # Persistence layer
├── services/               # API and external service layers
│   ├── geminiService.ts    # Google Gemini AI integration
│   ├── agentService.ts     # AI research assistant
│   ├── pdfService.ts       # PDF processing and extraction
│   └── arxivService.ts     # Academic paper search
├── database/               # Database layer
│   ├── db.ts               # Neon PostgreSQL service
│   └── DatabaseContext.tsx # React integration
├── config/                 # Configuration management
│   └── env.ts              # Environment variable handling
└── memory-bank/           # Project documentation (this folder)
```

## Technical Constraints & Decisions

### Performance Requirements

**PDF Processing:**
- Target: < 30 seconds for 50-page academic papers
- Memory limit: 100MB per PDF in browser memory
- Concurrent processing: Max 3 PDFs simultaneously
- Text extraction: Custom geometric sorting for 2-column layouts

**AI Response Times:**
- Search results: < 10 seconds for web searches
- Note extraction: < 5 seconds per page batch
- Real-time streaming: Sub-second UI updates
- Embedding cache: 60%+ cache hit rate for repeated queries

**UI Responsiveness:**
- Column animations: < 300ms transitions
- PDF rendering: Progressive loading with 2-second initial render
- Search highlighting: Instant text highlighting
- Context switching: < 100ms between modes

### Browser Compatibility

**Supported Browsers:**
- Chrome/Edge >= 90 (primary target)
- Firefox >= 88 (secondary support)
- Safari >= 14 (basic support)

**Required Browser Features:**
- ES2022 support (async/await, optional chaining)
- PDF.js compatibility for PDF rendering
- ArrayBuffer for PDF processing
- WebAssembly for PDF.js worker
- localStorage for session persistence

### API Rate Limiting & Quotas

**Google Gemini API:**
- Rate limit: 60 requests per minute
- Concurrent requests: 5 maximum
- Retry logic: Exponential backoff with 3 retries
- Fallback: Automatic OpenAI switching on quota exhaustion

**Google Custom Search API:**
- Quota: 100 searches per day (free tier)
- Rate limit: 10 requests per second
- Caching: No server-side caching (stateless)
- Fallback: Graceful degradation to manual URL entry

**arXiv API:**
- Rate limit: 1 request per 3 seconds
- Concurrent connections: 1 per client
- Proxy rotation: CORS proxy fallback system
- Timeout handling: 30-second request timeout

## Dependencies & Integration Patterns

### Core Dependencies

**React Ecosystem:**
```json
{
  "react": "^19.2.1",           // Latest React with concurrent features
  "react-dom": "^19.2.1",      // DOM renderer
  "@types/react": "^18.2.0",   // TypeScript definitions
  "@vitejs/plugin-react": "^5.0.0" // Vite React plugin
}
```

**AI & External APIs:**
```json
{
  "@google/genai": "^1.31.0",           // Official Google Gemini SDK
  "@neondatabase/serverless": "^1.0.2", // Neon PostgreSQL driver
  "pdfjs-dist": "4.0.379"              // PDF processing library
}
```

**Development Tools:**
```json
{
  "typescript": "~5.8.2",     // Type safety
  "vite": "^6.2.0",          // Build tool and dev server
  "tailwindcss": "^3.4.0",   // Utility-first CSS
  "autoprefixer": "^10.4.23" // CSS vendor prefixing
}
```

### Integration Architecture

**PDF.js Integration:**
```typescript
// Custom worker configuration for optimal performance
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = 
  'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs';

// Process PDFs with memory management
const loadingTask = pdfjsLib.getDocument({ 
  data: arrayBuffer.slice(0) // Prevents buffer detachment
});
```

**Gemini API Integration:**
```typescript
// Multi-model strategy for different use cases
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Flash for extraction (fast, cost-effective)
const flashModel = "gemini-3-flash-preview";

// Pro for complex reasoning (thorough, higher quality) 
const proModel = "gemini-3-pro-preview";
```

**Neon Database Integration:**
```typescript
// Serverless HTTP-based connection
import { neon } from "@neondatabase/serverless";
const sql = neon(DATABASE_URL);

// Direct SQL with tagged template literals
const papers = await sql`SELECT * FROM papers WHERE uri = ${uri}`;
```

## Tool Usage Patterns

### Vite Configuration Strategy

**Environment Variable Handling:**
```typescript
// Build-time environment injection for security
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    define: {
      // Bake API keys into build for frontend access
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY || ''),
      'process.env.DATABASE_URL': JSON.stringify(env.DATABASE_URL || '')
    }
  };
});
```

**Build Optimization:**
```typescript
// Manual chunk splitting for optimal loading
rollupOptions: {
  output: {
    manualChunks: {
      vendor: ['react', 'react-dom'],  // Framework code
      pdf: ['pdfjs-dist'],             // PDF processing
      ai: ['@google/genai']            // AI functionality  
    }
  }
}
```

### TypeScript Configuration

**Strict Type Safety:**
```json
{
  "compilerOptions": {
    "strict": true,                    // Maximum type safety
    "noImplicitReturns": true,        // Catch missing return statements
    "noFallthroughCasesInSwitch": true, // Switch statement safety
    "noUncheckedIndexedAccess": true,  // Array access safety
    "exactOptionalPropertyTypes": true // Precise optional properties
  }
}
```

### Tailwind CSS Configuration

**Custom Design System:**
```javascript
// Scholar brand colors and extended utilities
module.exports = {
  theme: {
    extend: {
      colors: {
        scholar: {
          50: '#fef2f2',
          500: '#A36671', 
          600: '#590016',  // Primary brand color
          900: '#2d0008'
        }
      }
    }
  }
};
```

## Deployment Configuration

### Docker Multi-Stage Build

**Build Process:**
```dockerfile
# Stage 1: Node.js build environment
FROM node:20-alpine AS builder
# Environment variables injected via ARG
ARG GEMINI_API_KEY
ENV GEMINI_API_KEY=$GEMINI_API_KEY

# Stage 2: Nginx production server  
FROM nginx:alpine AS production
COPY --from=builder /app/dist /usr/share/nginx/html
```

**Production Optimizations:**
- Gzip compression for all static assets
- Long-term caching headers for versioned assets
- Security headers (CSP, X-Frame-Options, HSTS)
- Health check endpoint for monitoring
- SPA routing fallback to index.html

### Railway Platform Configuration

**Build Environment:**
```json
{
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "Dockerfile"
  },
  "deploy": {
    "restartPolicyType": "ON_FAILURE",
    "replicas": 1
  }
}
```

**Environment Variable Strategy:**
- Development: `.env.local` file for local development
- Production: Railway dashboard environment variables
- Build time: ARG → ENV → process.env injection chain
- Runtime: Nginx serves pre-built static files with baked-in config

## Development Workflow

### Local Development Process

**Daily Development:**
```bash
# 1. Start development server
npm run dev

# 2. Access application  
open http://localhost:3000

# 3. Environment verification
npm run verify-setup

# 4. Build verification before deployment
npm run build && npm run preview
```

**Testing & Validation:**
```bash
# TypeScript compilation check
npx tsc --noEmit

# Build size analysis
npm run build -- --mode=production

# Environment variable validation
node scripts/verify-setup.mjs
```

### Production Deployment Process

**Railway Deployment:**
1. **Code Commit:** Push changes to connected Git repository
2. **Automatic Build:** Railway detects Dockerfile and builds image
3. **Environment Injection:** Build arguments from Railway environment variables
4. **Health Check:** `/health` endpoint verification
5. **Traffic Routing:** Gradual traffic shift to new deployment

**Deployment Verification:**
- Application loads without blank screen errors
- All environment variables properly injected
- PDF processing functional with test documents
- AI integrations responding correctly
- Database connectivity confirmed

This technical foundation provides a **robust, scalable, and maintainable platform** for the Research Note AI research assistant with production-grade performance and reliability.