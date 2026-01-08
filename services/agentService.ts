
import { GoogleGenAI, Chat, FunctionDeclaration, Type } from "@google/genai";
import { DeepResearchNote } from "../types";
import { config } from "../config/env";

// OpenAI Fallback Configuration
const OPENAI_API_KEY = config.openaiApiKey;

/**
 * Shared OpenAI Call Utility for Chat Fallback
 */
async function callOpenAI(messages: any[]): Promise<string> {
  console.log("[Agent] ⚠️ Switching to OpenAI Fallback...");
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: messages,
      })
    });

    if (!response.ok) {
       const err = await response.text();
       throw new Error(`OpenAI Error: ${response.status} - ${err}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || "I apologize, but I couldn't generate a response at this time.";
  } catch (error) {
    console.error("[Agent] ❌ OpenAI Fallback Failed:", error);
    return "I am currently experiencing high traffic and could not process your request with either the primary or backup AI services. Please try again in a moment.";
  }
}

// Types for internal state
interface UploadedFileRegistry {
    [uniqueId: string]: {
        googleFileUri: string;
        state: 'PROCESSING' | 'ACTIVE' | 'FAILED';
        metadata?: {
            title: string;
            author: string;
        }
    };
}

export interface AgentCitation {
    id: number;
    sourceId: string; // The uniqueId (PDF URI)
    title: string;
    page: number;
    quote: string;
}

export interface AgentResponse {
    text: string;
    citations: AgentCitation[];
}

class AgentService {
    private ai: GoogleGenAI | null = null;
    // Fix: Upgrade to gemini-3-pro-preview for complex research assistant tasks
    private modelName: string = "gemini-3-pro-preview";
    private chat: Chat | null = null;
    private uploadedFiles: UploadedFileRegistry = {};
    private fileUrisInSession: Set<string> = new Set();
    // Keep track of conversation history for fallback manual construction
    private conversationHistory: { role: 'user' | 'system' | 'assistant', content: string }[] = [];

    constructor() {
        // Initialize Gemini using centralized configuration - handle missing API key gracefully
        if (config.geminiApiKey) {
            this.ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
        } else {
            console.warn('[Agent] Gemini API not available (missing API key)');
        }
    }
    
    /**
     * Uploads a file to the Gemini Files API and waits for it to be active.
     * Uses uniqueId (PDF URI) as key to prevent filename collisions.
     */
    async uploadFile(file: File, uniqueId: string, metadata?: { title: string; author: string }): Promise<string | null> {
        // Return null if no AI available
        if (!this.ai) {
            console.warn('[Agent] Cannot upload file - Gemini API not available');
            return null;
        }

        // 1. Check if already uploaded using uniqueId
        if (this.uploadedFiles[uniqueId]?.state === 'ACTIVE') {
            console.log(`[Agent] ⏭️ File already active: ${metadata?.title || file.name}`);
            return this.uploadedFiles[uniqueId].googleFileUri;
        }

        // If processing, just return null (it will be ready soon)
        if (this.uploadedFiles[uniqueId]?.state === 'PROCESSING') {
             console.log(`[Agent] ⏳ File already processing: ${metadata?.title || file.name}`);
            return null;
        }

        try {
            console.log(`[Agent] 📤 Uploading file: ${file.name} (ID: ${uniqueId})`);
            
            // Mark as processing immediately to prevent duplicate uploads during async wait
            this.uploadedFiles[uniqueId] = {
                googleFileUri: '',
                state: 'PROCESSING',
                metadata: metadata
            };

            // 2. Upload to Google Files API
            const uploadResult = await this.ai.files.upload({
                file: file,
                config: { 
                    displayName: file.name,
                    mimeType: 'application/pdf' 
                }
            });

            // The upload result is the File object itself in @google/genai
            const googleFileUri = uploadResult.uri;
            
            // Update registry with the real URI
            this.uploadedFiles[uniqueId] = { 
                googleFileUri: googleFileUri, 
                state: 'PROCESSING',
                metadata: metadata
            };

            // 3. Wait for Active State
            let isActive = false;
            let attempts = 0;
            while (!isActive && attempts < 30) { // Max wait 60s
                await new Promise(resolve => setTimeout(resolve, 2000));
                const fileStatus = await this.ai.files.get({ name: uploadResult.name });
                
                if (fileStatus.state === 'ACTIVE') {
                    isActive = true;
                    this.uploadedFiles[uniqueId].state = 'ACTIVE';
                    console.log(`[Agent] ✅ File Active and Ready: ${file.name}`);
                } else if (fileStatus.state === 'FAILED') {
                    throw new Error("File processing failed on server.");
                }
                attempts++;
            }

            return googleFileUri;

        } catch (error) {
            console.error(`[Agent] ❌ Upload failed for ${file.name}:`, error);
            this.uploadedFiles[uniqueId] = { googleFileUri: '', state: 'FAILED', metadata };
            return null;
        }
    }

    /**
     * Initializes or updates the chat session with the latest files.
     */
    private async getChatSession(): Promise<Chat | null> {
        // Return null if no AI available
        if (!this.ai) {
            return null;
        }

        if (!this.chat) {
            // Define Tool: Read Context Notes
            const readNotesTool: FunctionDeclaration = {
                name: "readContextNotes",
                description: "Reads the specific research notes and quotes the user has selected/bookmarked in the application.",
                parameters: {
                    type: Type.OBJECT,
                    properties: {},
                }
            };

            this.chat = this.ai.chats.create({
                model: this.modelName,
                config: {
                    systemInstruction: `You are an advanced Research Assistant AI / Student Mentor.
                    You have access to PDF documents the user has uploaded.
                    
                    CRITICAL CITATION INSTRUCTION:
                    1. When you answer based on the documents, you MUST cite your sources in the text using bracketed numbers like [1], [2].
                    2. At the VERY END of your response, you MUST append a structured JSON block named "---CITATIONS---".
                    
                    Format of the end block:
                    
                    ---CITATIONS---
                    [
                      { "id": 1, "sourceId": "EXACT_SOURCE_URI_FROM_CONTEXT", "title": "Document Title", "page": 5, "quote": "The exact quote from text..." }
                    ]
                    
                    Goals:
                    1. Answer questions based ONLY on the provided files and notes.
                    2. Be concise, academic, and helpful.
                    3. ALWAYS include the ---CITATIONS--- block if you used a file. If no file used, omit it.
                    `,
                    tools: [{ functionDeclarations: [readNotesTool] }]
                }
            });
            
            // Initialize history for fallback
            this.conversationHistory = [
                { role: 'system', content: "You are a helpful Research Assistant. You can answer questions based on the user's provided notes and general knowledge." }
            ];
        }
        return this.chat;
    }

    private parseResponse(rawText: string): AgentResponse {
        const separator = "---CITATIONS---";
        if (rawText.includes(separator)) {
            const parts = rawText.split(separator);
            const content = parts[0].trim();
            const jsonStr = parts[1].trim().replace(/```json/g, '').replace(/```/g, '');
            
            try {
                const citations = JSON.parse(jsonStr);
                return { text: content, citations: Array.isArray(citations) ? citations : [] };
            } catch (e) {
                console.warn("[Agent] Failed to parse citations JSON", e);
                return { text: content, citations: [] };
            }
        }
        return { text: rawText, citations: [] };
    }

    /**
     * Sends a message to the agent.
     * Handles the "readContextNotes" tool call internally.
     * Includes Fallback to OpenAI if Gemini fails.
     */
    async sendMessage(
        userMessage: string, 
        currentContextNotes: DeepResearchNote[]
    ): Promise<AgentResponse> {
        // Identify active files from registry
        const activeFiles = Object.values(this.uploadedFiles).filter(f => f.state === 'ACTIVE');
        
        console.log(`[Agent] 💬 Sending Message. Active Files in Registry: ${activeFiles.length}`);

        // Generate Manifest of what's currently available
        // CRITICAL: We include the 'uniqueId' (which is the URI) in the manifest so the model can return it in citations
        const documentManifest = activeFiles
            .map((f, i) => `${i+1}. "${f.metadata?.title || 'Untitled'}" (ID: ${Object.keys(this.uploadedFiles).find(key => this.uploadedFiles[key] === f)})`)
            .join('\n');

        try {
            const session = await this.getChatSession();

            // If no Gemini AI available, use OpenAI fallback immediately
            if (!session) {
                console.log('[Agent] No Gemini AI available, using OpenAI fallback');
                
                const notesContext = currentContextNotes.length > 0 
                    ? `\n\n[CONTEXT NOTES FROM USER]\n${JSON.stringify(currentContextNotes.map(n => ({ quote: n.quote, justification: n.justification })), null, 2)}`
                    : "";

                const fallbackMessages = [
                    { 
                        role: 'system', 
                        content: `You are a Research Assistant. The primary AI service is currently unavailable due to configuration issues. 
                        
                        [CURRENT SITUATION]
                        The user has the following documents loaded in their library:
                        ${documentManifest || "No documents loaded."}
                        
                        You CANNOT see the full text of these files right now (configuration limitation).
                        However, you CAN see the "Context Notes" provided below if the user has selected any.
                        
                        [INSTRUCTION]
                        Answer the user's question based on the provided notes or your general knowledge.
                        If asked about a specific paper from the list above, explain that you can see it's loaded but cannot access its full content at the moment due to a configuration issue.

                        ${notesContext}`
                    },
                    { role: 'user', content: userMessage }
                ];

                const fallbackResponse = await callOpenAI(fallbackMessages);
                return { text: fallbackResponse, citations: [] };
            }

            // 1. Prepare Content for Gemini
            
            // NOTE: We inject the manifest explicitly so the model "sees" the titles in text
            const systemManifestInjection = documentManifest 
                ? `\n\n[SYSTEM CONTEXT: ACTIVE DOCUMENTS]\nThe following files are attached to this session. Use their IDs for citations:\n${documentManifest}\n` 
                : "\n\n[SYSTEM CONTEXT]\nNo documents are currently active.\n";

            // Identify NEW files to attach
            const activeFileUris = activeFiles.map(f => f.googleFileUri);
            const newFiles = activeFileUris.filter(uri => !this.fileUrisInSession.has(uri));
            
            console.log(`[Agent] 📎 Attaching ${newFiles.length} new files to this turn.`);

            // Construct parts array
            // CRITICAL ORDER: File parts MUST come BEFORE text parts for many multimodal models to process context correctly.
            const parts: any[] = [];
            
            // 1. Append new file blocks
            newFiles.forEach(uri => {
                parts.push({
                    fileData: { mimeType: 'application/pdf', fileUri: uri }
                });
                this.fileUrisInSession.add(uri);
            });

            // 2. Append the text message (User Query + System Manifest)
            parts.push({ text: userMessage + systemManifestInjection });

            // Update local history for fallback usage
            this.conversationHistory.push({ role: 'user', content: userMessage });

            // 2. Send Request to Gemini
            let result = await session.sendMessage({ message: parts });
            
            // 3. Handle Tool Calls (Loop)
            let functionCalls = result.functionCalls;

            while (functionCalls && functionCalls.length > 0) {
                const call = functionCalls[0];
                
                if (call.name === "readContextNotes") {
                    console.log("[Agent] 🛠️ Tool Call: Reading Context Notes...");
                    
                    // Serialize notes for the model
                    const notesData = currentContextNotes.map(n => ({
                        quote: n.quote,
                        reason: n.justification,
                        source: n.pdfUri,
                        page: n.pageNumber
                    }));

                    // Send result back to model
                    result = await session.sendMessage({
                        message: [{
                            functionResponse: {
                                name: "readContextNotes",
                                response: { notes: notesData }
                            }
                        }]
                    });
                } else {
                    break; 
                }
                functionCalls = result.functionCalls;
            }

            const responseText = result.text || "";
            this.conversationHistory.push({ role: 'assistant', content: responseText });
            
            return this.parseResponse(responseText);

        } catch (error: any) {
            console.error("[Agent] Gemini Chat Error:", error);
            
            // Check for Quota or Server errors
            const isQuotaError = error.status === 429 || error.code === 429 || error.message?.includes('429');
            const isServerError = error.status === 503 || error.status === 500;

            if (isQuotaError || isServerError || error) {
                // FALLBACK STRATEGY
                const notesContext = currentContextNotes.length > 0 
                    ? `\n\n[CONTEXT NOTES FROM USER]\n${JSON.stringify(currentContextNotes.map(n => ({ quote: n.quote, justification: n.justification })), null, 2)}`
                    : "";

                const fallbackMessages = [
                    ...this.conversationHistory.filter(m => m.role !== 'system'), // Basic history
                    { 
                        role: 'system', 
                        content: `You are a Research Assistant. The primary AI service is currently unavailable, so you are running in fallback mode. 
                        
                        [CURRENT SITUATION]
                        The user has the following documents loaded in their library:
                        ${documentManifest || "No documents loaded."}
                        
                        You CANNOT see the full text of these files right now (technical limitation).
                        However, you CAN see the "Context Notes" provided below if the user has selected any.
                        
                        [INSTRUCTION]
                        Answer the user's question based on the provided scale of notes or your general knowledge.
                        If asked about a specific paper from the list above, explain that you can see it's loaded (cite the title) but cannot read its full content at the moment due to high traffic, but you can answer general questions about the topic.

                        ${notesContext}`
                    },
                    { role: 'user', content: userMessage }
                ];

                const fallbackResponse = await callOpenAI(fallbackMessages);
                this.conversationHistory.push({ role: 'assistant', content: fallbackResponse });
                // Fallback likely won't have structured citations
                return { text: fallbackResponse, citations: [] };
            }

            return { text: "I encountered an error while processing your request. Please try again.", citations: [] };
        }
    }

    reset() {
        this.chat = null;
        this.fileUrisInSession.clear();
        this.conversationHistory = [];
        this.uploadedFiles = {};
    }
}

export const agentService = new AgentService();
