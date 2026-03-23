// services/researchAgentService.ts
//
// Frontend service for the Research Agent.
// Packages the student's workspace (loaded PDFs + saved notes) and sends
// a task — with an optional preset workflow — to the backend ReAct agent loop.

import { api } from './apiClient';
import { LoadedPdf, ResearchAgentResult } from '../types';

/**
 * Packages the student's workspace and sends a task to the Research Agent.
 *
 * @param task        - The student's request (e.g. "Extract the methodology section")
 * @param contextPdfs - LoadedPdf objects currently in the student's context window
 * @param savedNotes  - Saved notes from DatabaseContext (savedNotes array)
 * @param workflowId  - Optional preset workflow (e.g. "get_findings", "summarise_paper")
 *                      Omit for free-form agent reasoning with no preset steps.
 * @returns ResearchAgentResult with success flag, response text, memory, and debug history
 */
export const runResearchAgentTask = async (
  task: string,
  contextPdfs: LoadedPdf[],
  savedNotes: any[],
  workflowId?: string
): Promise<ResearchAgentResult> => {

  // Package papers — send text content + metadata only, NOT the raw ArrayBuffer.
  // The pages[] string array comes from pdfService.extractPdfData and is what
  // the agent's read_page / read_pages tools operate on.
  const papers = contextPdfs.map(pdf => ({
    uri: pdf.uri,
    title: pdf.metadata?.title || 'Untitled',
    author: pdf.metadata?.author || 'Unknown',
    abstract: pdf.metadata?.subject || '',
    harvardReference: pdf.metadata?.harvardReference || '',  // PdfMetadata already has this field
    totalPages: pdf.numPages,
    pages: pdf.pages,               // string[] — one string per page
    references: pdf.references || []
  }));

  // Package notes — normalise field names between DB format and in-memory format
  const notes = savedNotes.map(note => ({
    quote: note.quote || note.content || '',
    justification: note.justification || '',
    pageNumber: note.page_number ?? note.pageNumber ?? 0,
    pdfUri: note.paper_uri || note.pdfUri || '',
    paperTitle: note.paper_title || '',
    tags: note.tags || [],
    relatedQuestion: note.related_question || note.relatedQuestion || ''
  }));

  const result = await api.researchAgent.runTask(task, papers, notes, workflowId);
  return result as ResearchAgentResult;
};
