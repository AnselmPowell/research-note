# Research Note: Intelligent Academic Operating System

Research Note is a high-performance "Academic Operating System" designed to solve the "Information Overload" problem in academic research. Instead of manually searching, downloading, and skimming dozens of PDFs to find one specific answer, this application uses Google Gemini AI to act as a PhD-level research assistant that automates the entire discovery and extraction pipeline.

## 🎯 Purpose

The application serves as a PhD-level research assistant that moves the researcher from **Search** (finding files) to **Synthesis** (finding insights). It automates the discovery, extraction, and citation of academic evidence, allowing researchers to focus on high-level reasoning rather than manual data gathering.

---

## 🚀 Quick Start

### Prerequisites
- **Node.js 16+** installed
- **Google Gemini API key** (required)
- Optional: Google Search API, OpenAI API key, Neon Database

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/AnselmPowell/research-note.git
   cd research-note
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   # Copy the example environment file
   cp .env.example .env.local
   
   # Edit .env.local with your API keys
   # At minimum, you need GEMINI_API_KEY
   ```

4. **Verify your setup**
   ```bash
   npm run verify-setup
   ```

5. **Start the development server**
   ```bash
   npm run dev
   ```

6. **Open your browser**
   Navigate to [http://localhost:3000](http://localhost:3000)

---

## 🔑 API Keys Required

### Required
- **Google Gemini API Key**: Get from [Google AI Studio](https://aistudio.google.com/apikey)

### Optional (for full functionality)
- **Google Search API**: For web PDF discovery - [Google Custom Search](https://developers.google.com/custom-search/v1/introduction)
- **OpenAI API Key**: Fallback when Gemini is unavailable - [OpenAI Platform](https://platform.openai.com/api-keys)
- **Neon Database**: For persistent storage - [Neon.tech](https://neon.tech/)

---

## ✨ Key Features

### 1. Unified Research Entry
A tri-modal search interface tailored for different levels of discovery:
- **Web Search:** Broad discovery using Google Search API to find publicly hosted PDFs
- **Deep Research:** Specialized "Deep-Dive" mode targeting **arXiv** with autonomous gathering and semantic extraction
- **Upload PDF:** Direct ingestion for local documents into the AI's reasoning context

### 2. The Deep Research Pipeline
The core of the application is a multi-stage asynchronous engine:
1. **Intent Modeling:** Uses `gemini-3-flash-preview` to perform query expansion, breaking simple topics into structured academic search strings
2. **Distributed Gathering:** High-concurrency worker pool queries arXiv via optimized proxy failovers
3. **Semantic Distillation:** Uses `text-embedding-004` to calculate cosine similarity between user intent and paper abstracts
4. **Geometric PDF Reconstruction:** Custom coordinate-geometry sorter that detects 2-column layouts and reorders text items
5. **Targeted RAG:** Two-pass Retrieval-Augmented Generation process that identifies relevant pages and extracts cited quotes

### 3. AI Research Mentor
A persistent side-agent (`gemini-3-pro-preview`) that maintains long-term conversation history:
- **File API Integration:** Directly "reads" the full text of user-selected PDFs
- **Tool Calling:** Programmatically accesses the user's saved notes database
- **Academic Citations:** Automatically generates structured JSON citations linked to source documents

### 4. Intelligent Workspace
Custom PDF viewer integrated with the AI backend:
- **Visual Mapping:** Paragraph-level text selection that preserves reading order
- **Bi-directional Linking:** Clicking an AI-extracted note automatically scrolls the PDF to the correct page and highlights the source text

---

## 🛠 Tech Stack

| Layer | Technology |
| :--- | :--- |
| **LLM Reasoning** | Gemini 3 Pro (Agent) & Gemini 3 Flash (Extraction) |
| **Vector Engine** | Google `text-embedding-004` |
| **Database** | Neon Serverless Postgres |
| **PDF Engine** | PDF.js + Custom Geometric Sorter |
| **Search Gateway** | Google Programmable Search + ArXiv API |
| **Frontend** | React 19 + Tailwind CSS + Lucide Icons |
| **Build Tool** | Vite + TypeScript |

---

## 📂 Project Structure

```
research-note/
├── components/          # React components
│   ├── layout/         # Layout components
│   ├── research/       # Deep research interface
│   ├── pdf/            # PDF viewer and workspace
│   └── search/         # Search interfaces
├── contexts/           # React contexts for state management
├── services/           # API services and integrations
│   ├── geminiService.ts    # Gemini AI integration
│   ├── agentService.ts     # AI research assistant
│   ├── pdfService.ts       # PDF processing
│   └── arxivService.ts     # ArXiv API integration
├── database/           # Database configuration and schemas
├── config/             # Environment configuration
└── scripts/            # Setup and utility scripts
```

---

## 🔧 Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run verify-setup` - Verify environment configuration

---

## 📖 Environment Configuration

The application requires several environment variables. Copy `.env.example` to `.env.local` and configure:

```bash
# Required
GEMINI_API_KEY=your_gemini_api_key_here

# Optional
GOOGLE_SEARCH_KEY=your_google_search_key
GOOGLE_SEARCH_CX=your_custom_search_engine_id
OPENAI_API_KEY=your_openai_api_key
DATABASE_URL=your_neon_database_url
```

---

## 🚀 Architecture

The app uses a **Domain-Driven Context Architecture** to ensure performance and separation of concerns:

- **UIContext:** Manages layout, column visibility, and theme state
- **ResearchContext:** Orchestrates the Deep Research pipeline and API communications
- **LibraryContext:** Handles PDF memory management, downloading, and workspace active states
- **DatabaseContext:** Manages the interface between the application and Neon Postgres

---

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- Built with Google Gemini AI
- PDF processing powered by PDF.js
- Academic paper discovery via arXiv API
- UI components from Lucide React

---

**Research Note** - Moving from Search to Synthesis in Academic Research
