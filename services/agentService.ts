import { api } from './apiClient';
import { DeepResearchNote } from "../types";

// Agent service now uses backend API instead of direct SDK

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
    private uploadedFiles: UploadedFileRegistry = {};

    async uploadPdf(file: File, uniqueId: string): Promise<string> {
        try {
            const result = await api.agent.uploadFile(file, uniqueId);
            this.uploadedFiles[uniqueId] = {
                googleFileUri: result.fileUri,
                state: 'ACTIVE',
                metadata: {
                    title: file.name,
                    author: 'Unknown'
                }
            };
            return result.fileUri;
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
        contextNotes: DeepResearchNote[] = []
    ): Promise<string> {
        try {
            const fileUris = Object.values(this.uploadedFiles)
                .filter(f => f.state === 'ACTIVE')
                .map(f => f.googleFileUri);

            const result = await api.agent.sendMessage(message, fileUris, contextNotes);
            return result.text;
        } catch (error) {
            console.error('[Agent] Send message failed:', error);
            return 'I apologize, but I encountered an error processing your request.';
        }
    }

    getUploadedFiles() {
        return this.uploadedFiles;
    }

    clearUploadedFiles() {
        this.uploadedFiles = {};
    }
}

export const agentService = new AgentService();
