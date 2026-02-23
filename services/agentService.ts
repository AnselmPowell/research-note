import { api } from './apiClient';
import { DeepResearchNote, AgentCitation, AgentResponse } from "../types";

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

class AgentService {
    // SHARED REGISTRY ACROSS ALL CHATS (SINGLETON PATTERN)
    // NOTE: This registry is shared by all AgentResearcher component instances.
    // However, this is SAFE because:
    // 1. Frontend filters selectedFileUris per-chat based on user selection
    // 2. Backend never sees unselected files - only receives filtered URIs
    // 3. Each chat's contextPdfs is isolated, controlling what gets sent
    // 4. No actual data leakage occurs due to frontend filtering protection
    private uploadedFiles: UploadedFileRegistry = {};

    private buildDocumentManifest(selectedFileUris: string[]): Array<{ id: string; title: string; author: string }> {
      const selectedSet = new Set(selectedFileUris);
      return Object.entries(this.uploadedFiles)
        .filter(([uniqueId, f]) => f.state === 'ACTIVE' && selectedSet.has(uniqueId))
        .map(([uniqueId, fileData]) => ({
          id: uniqueId,
          title: fileData.metadata?.title || 'Untitled Document',
          author: fileData.metadata?.author || 'Unknown Author'
        }));
    }

    async uploadPdf(file: File, uniqueId: string, metadata?: { title: string; author: string }): Promise<string> {
        console.log('[uploadPdf] DEBUG: START', { uniqueId, fileName: file.name });
        try {
            const result = await api.agent.uploadFile(file, uniqueId);
            console.log('[uploadPdf] DEBUG: API returned:', { fileUri: result.fileUri, uri: result.uri });
            
            this.uploadedFiles[uniqueId] = {
                googleFileUri: result.fileUri || result.uri,
                state: 'ACTIVE',
                metadata: metadata || {
                    title: file.name,
                    author: 'Unknown'
                }
            };
            console.log('[uploadPdf] DEBUG: File stored in uploadedFiles with key:', uniqueId);
            console.log('[uploadPdf] DEBUG: uploadedFiles now has keys:', Object.keys(this.uploadedFiles));
            
            return result.fileUri || result.uri;
        } catch (error) {
            console.error('[Agent] File upload failed:', error);
            this.uploadedFiles[uniqueId] = {
                googleFileUri: '',
                state: 'FAILED'
            };
            throw error;
        }
    }

    async sendMessage(
        message: string,
        contextNotes: DeepResearchNote[] = [],
        selectedFileUris: string[] = []
    ): Promise<AgentResponse> {
        try {
            console.log('[sendMessage] DEBUG: selectedFileUris:', selectedFileUris);
            console.log('[sendMessage] DEBUG: uploadedFiles keys:', Object.keys(this.uploadedFiles));
            
            const selectedSet = new Set(selectedFileUris);
            const fileUris = Object.entries(this.uploadedFiles)
                .filter(([uniqueId, f]) => {
                    const isSelected = selectedSet.has(uniqueId);
                    console.log(`[sendMessage] DEBUG: Checking uniqueId="${uniqueId}", isSelected=${isSelected}, state=${f.state}`);
                    return f.state === 'ACTIVE' && isSelected;
                })
                .map(([_, f]) => f.googleFileUri);

            console.log('[sendMessage] DEBUG: Final fileUris to send:', fileUris);
            console.log('[sendMessage] DEBUG: documentMetadata:', this.buildDocumentManifest(selectedFileUris));

            const documentMetadata = this.buildDocumentManifest(selectedFileUris);

            const result = await api.agent.sendMessage(
              message,
              fileUris,
              contextNotes,
              documentMetadata
            );

            return {
              text: result.text,
              citations: result.citations || []
            };
        } catch (error) {
            console.error('[Agent] Send message failed:', error);
            throw error;
        }
    }

    getUploadedFiles() {
        return this.uploadedFiles;
    }

    clearUploadedFiles() {
        this.uploadedFiles = {};
    }

    reset() {
      this.clearUploadedFiles();
    }
}

export const agentService = new AgentService();
export type { AgentCitation, AgentResponse };