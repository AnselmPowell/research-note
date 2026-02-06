const { GoogleGenerativeAI } = require('@google/generative-ai');
const { initializeEnvironment } = require('../config/env');
const cache = require('./cache');
const { asyncPool } = require('../utils/asyncPool');
const logger = require('../utils/logger');

const config = initializeEnvironment();

let genAI = null;
if (config.geminiApiKey) {
  genAI = new GoogleGenerativeAI(config.geminiApiKey);
  logger.info('✅ Gemini AI initialized');
} else {
  logger.warn('⚠️  Gemini API key missing');
}

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const cleanJson = (text) => text.replace(/```json/g, '').replace(/```/g, '').trim();

async function callOpenAI(prompt) {
  if (!config.openaiApiKey) throw new Error('OpenAI API key not configured');
  
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.openaiApiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a precise research analyst. Output valid JSON only.' },
        { role: 'user', content: prompt }
      ],
      response_format: { type: 'json_object' }
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI Error: ${response.status} - ${err}`);
  }

  const data = await response.json();
  return JSON.parse(data.choices[0]?.message?.content || '{}');
}


async function enhanceMetadata(firstFourPagesText, currentMetadata) {
  const prompt = `You are analyzing the first 4 pages of a research paper to extract missing metadata.

Current metadata:
- Title: ${currentMetadata.title}
- Author: ${currentMetadata.author}
- Subject: ${currentMetadata.subject}

Text from first 4 pages:
${firstFourPagesText}

Extract and return JSON:
{
  "title": "exact paper title",
  "author": "main author",
  "subject": "brief abstract"
}`;

  try {
    if (!genAI) throw new Error('Gemini not initialized');

    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' }
    });

    const response = await result.response;
    const enhanced = JSON.parse(cleanJson(response.text()));
    return {
      title: enhanced.title || currentMetadata.title,
      author: enhanced.author || currentMetadata.author,
      subject: enhanced.subject || currentMetadata.subject
    };
  } catch (error) {
    logger.warn('Gemini failed, trying OpenAI');
    const result = await callOpenAI(prompt);
    return {
      title: result.title || currentMetadata.title,
      author: result.author || currentMetadata.author,
      subject: result.subject || currentMetadata.subject
    };
  }
}

async function generateSearchVariations(originalQuery) {
  const prompt = `Generate 5 additional, distinct search queries for: "${originalQuery}".
Return JSON array of strings.`;

  try {
    if (!genAI) throw new Error('Gemini not initialized');

    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' }
    });

    const response = await result.response;
    const queries = JSON.parse(cleanJson(response.text()));
    return Array.isArray(queries) ? queries : [];
  } catch (error) {
    logger.warn('Gemini failed, using fallback');
    return [
      `${originalQuery} research`,
      `${originalQuery} study`,
      `${originalQuery} analysis`,
      `${originalQuery} paper`,
      `${originalQuery} academic`
    ];
  }
}


async function generateArxivSearchTerms(topics, questions) {
  const prompt = `User Topics: "${topics.join(', ')}"
User Questions: "${questions.join('; ')}"

Generate structured arXiv search terms as JSON:
{
  "exact_phrases": [],
  "title_terms": [],
  "abstract_terms": [],
  "general_terms": []
}

Max 8 total terms.`;

  const fallback = {
    exact_phrases: [],
    title_terms: topics.slice(0, 3),
    abstract_terms: [],
    general_terms: topics.slice(0, 3)
  };

  try {
    if (!genAI) throw new Error('Gemini not initialized');

    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' }
    });

    const response = await result.response;
    const data = JSON.parse(cleanJson(response.text()));
    return {
      exact_phrases: Array.isArray(data.exact_phrases) ? data.exact_phrases : [],
      title_terms: Array.isArray(data.title_terms) ? data.title_terms : [],
      abstract_terms: Array.isArray(data.abstract_terms) ? data.abstract_terms : [],
      general_terms: Array.isArray(data.general_terms) ? data.general_terms : []
    };
  } catch (error) {
    logger.warn('Gemini failed, using fallback');
    return fallback;
  }
}

async function getEmbedding(text, taskType) {
  if (!genAI) return [];
  taskType = taskType || 'RETRIEVAL_DOCUMENT';

  const cacheKey = taskType + ':' + text.trim();
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-embedding-001' });
      const result = await model.embedContent({
        content: { parts: [{ text }] },
        taskType
      });

      const vec = result.embedding?.values || [];
      if (vec.length > 0) cache.set(cacheKey, vec);
      return vec;
    } catch (error) {
      if (error?.status === 429 && attempt < 2) {
        const backoff = Math.pow(2, attempt) * 2000 + Math.random() * 1000;
        await delay(backoff);
        continue;
      }
      if (attempt === 2) return [];
    }
  }
  return [];
}


async function getBatchEmbeddings(texts, taskType) {
  if (!genAI || !config.geminiApiKey) {
    return texts.map(() => []);
  }
  taskType = taskType || 'RETRIEVAL_DOCUMENT';

  const results = new Array(texts.length).fill([]);
  const uncachedIndices = [];
  const uncachedTexts = [];

  // Check cache
  texts.forEach((text, i) => {
    const key = taskType + ':' + text.trim();
    if (cache.has(key)) {
      results[i] = cache.get(key);
    } else {
      uncachedIndices.push(i);
      uncachedTexts.push(text);
    }
  });

  if (uncachedTexts.length === 0) return results;

  // Batch process
  const BATCH_SIZE = 50;
  const batches = [];
  for (let i = 0; i < uncachedTexts.length; i += BATCH_SIZE) {
    batches.push({
      texts: uncachedTexts.slice(i, i + BATCH_SIZE),
      indices: uncachedIndices.slice(i, i + BATCH_SIZE)
    });
  }

  await asyncPool(3, batches, async (batch) => {
    const requests = batch.texts.map(t => ({
      model: 'models/gemini-embedding-001',
      content: { parts: [{ text: t }] },
      taskType
    }));

    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents?key=${config.geminiApiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ requests })
          }
        );

        if (!response.ok) {
          if (response.status === 429 || response.status === 503) {
            throw new Error('Rate Limit');
          }
          throw new Error('HTTP ' + response.status);
        }

        const data = await response.json();
        const embeddings = data.embeddings.map(e => e.values || []);

        embeddings.forEach((emb, i) => {
          const originalIndex = batch.indices[i];
          const text = batch.texts[i];
          cache.set(taskType + ':' + text.trim(), emb);
          results[originalIndex] = emb;
        });

        break;
      } catch (err) {
        if (attempt < 3) {
          const backoff = Math.pow(2, attempt) * 2000 + Math.random() * 1000;
          await delay(backoff);
        }
      }
    }
  });

  return results;
}

function cosineSimilarity(vecA, vecB) {
  const dotProduct = vecA.reduce((acc, val, i) => acc + val * vecB[i], 0);
  const magA = Math.sqrt(vecA.reduce((acc, val) => acc + val * val, 0));
  const magB = Math.sqrt(vecB.reduce((acc, val) => acc + val * val, 0));
  if (magA === 0 || magB === 0) return 0;
  return dotProduct / (magA * magB);
}


async function filterRelevantPapers(papers, userQuestions, keywords) {
  console.log('[filterRelevantPapers] START:', { papersCount: papers.length, userQuestions, keywords });
  if (papers.length === 0) return [];

  const userIntentText = 'Questions: ' + userQuestions.join('\n') + '\nKeywords: ' + keywords.join(', ');
  console.log('[filterRelevantPapers] Getting embedding for:', userIntentText.substring(0, 100));
  const targetVector = await getEmbedding(userIntentText, 'RETRIEVAL_QUERY');
  console.log('[filterRelevantPapers] Target vector length:', targetVector.length);
  if (targetVector.length === 0) return [];

  const paperTexts = papers.map(p => 'Title: ' + p.title + '\nAbstract: ' + p.summary);
  const paperEmbeddings = await getBatchEmbeddings(paperTexts, 'RETRIEVAL_DOCUMENT');

  const scoredPapers = papers.map((paper, index) => {
    const paperVector = paperEmbeddings[index];
    let score = 0;
    if (paperVector && paperVector.length > 0) {
      score = cosineSimilarity(targetVector, paperVector);
    }
    return Object.assign({}, paper, { relevanceScore: score });
  });

  console.log('[filterRelevantPapers] Scored papers sample:', scoredPapers.slice(0, 3).map(p => ({ title: p.title, score: p.relevanceScore })));

  const filtered = scoredPapers.filter(p => (p.relevanceScore || 0) >= 0.30);
  console.log('[filterRelevantPapers] After filter (>=0.30):', filtered.length, 'papers');

  const result = filtered.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0)).slice(0, 20);
  console.log('[filterRelevantPapers] Final result:', result.length, 'papers');

  return result;
}

async function extractNotesFromPages(relevantPages, userQuestions, paperTitle, paperAbstract, referenceList) {
  if (!genAI && !config.openaiApiKey) {
    logger.warn('No AI services for note extraction');
    return [];
  }

  const BATCH_SIZE = 8;
  const CONCURRENCY = 3;

  const batches = [];
  for (let i = 0; i < relevantPages.length; i += BATCH_SIZE) {
    batches.push(relevantPages.slice(i, i + BATCH_SIZE));
  }

  const processBatch = async (batch) => {
    await delay(Math.random() * 2000);

    const contextText = batch.map(p =>
      '==Page ' + (p.pageIndex + 1) + '==\n' + p.text + '\n==Page ' + (p.pageIndex + 1) + '=='
    ).join('\n\n');

    const prompt = `You are a PhD Research Assistant.
User's Questions: "${userQuestions}"

Extract insights that DIRECTLY answer the questions.
Return JSON:
{
  "notes": [{
    "quote": "text...",
    "justification": "why selected...",
    "relatedQuestion": "q...",
    "pageNumber": 12,
    "relevanceScore": 0.95,
    "citations": []
  }]
}

Pages:
${contextText}`;

    try {
      if (!genAI) throw new Error('Gemini not available');

      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' }
      });

      const response = await result.response;
      const parsed = JSON.parse(cleanJson(response.text()));
      const notes = Array.isArray(parsed) ? parsed : (parsed.notes || []);

      return notes.map(note => ({
        quote: note.quote || '',
        justification: note.justification || 'Relevant.',
        relatedQuestion: note.relatedQuestion || 'General',
        pageNumber: note.pageNumber,
        pdfUri: batch[0]?.pdfUri || '',
        relevanceScore: note.relevanceScore || 0.75,
        citations: note.citations || []
      }));
    } catch (error) {
      logger.warn('Gemini extraction failed, trying OpenAI');
      const parsed = await callOpenAI(prompt);
      const notes = Array.isArray(parsed) ? parsed : (parsed.notes || []);
      return notes;
    }
  };

  const results = await asyncPool(CONCURRENCY, batches, processBatch);
  return results.flat().filter(n => n !== null);
}


async function performSearch(query) {
  if (!config.googleSearchKey || !config.googleSearchCx) {
    throw new Error('Google Search API not configured');
  }

  const variations = await generateSearchVariations(query);
  const allQueries = Array.from(new Set([query].concat(variations)));

  const fetchSingle = async (q) => {
    try {
      const params = new URLSearchParams({
        key: config.googleSearchKey,
        cx: config.googleSearchCx,
        q: q.replace(/:pdf/gi, '').replace(/filetype:pdf/gi, '').trim(),
        fileType: 'pdf',
        num: '10'
      });

      const response = await fetch('https://www.googleapis.com/customsearch/v1?' + params.toString());
      if (!response.ok) return [];
      const data = await response.json();
      return data.items || [];
    } catch (e) {
      return [];
    }
  };

  const resultsArrays = await Promise.all(allQueries.map(fetchSingle));
  const uniqueSourcesMap = new Map();

  resultsArrays.flat().forEach(item => {
    const link = item.link || '';
    if (link && link.toLowerCase().includes('pdf')) {
      if (!uniqueSourcesMap.has(link)) {
        uniqueSourcesMap.set(link, {
          title: item.title || 'Untitled PDF',
          uri: link,
          snippet: item.snippet || 'No description.'
        });
      }
    }
  });

  const sources = Array.from(uniqueSourcesMap.values());
  return {
    summary: sources.length === 0 ? 'No PDF results found.' : 'Found ' + sources.length + ' unique PDF sources.',
    sources,
    allQueries
  };
}

module.exports = {
  enhanceMetadata,
  generateSearchVariations,
  generateArxivSearchTerms,
  getEmbedding,
  getBatchEmbeddings,
  filterRelevantPapers,
  extractNotesFromPages,
  performSearch
};

async function generateInsightQueries(userQuestions, contextQuery) {
  const prompt = `Context: The user has gathered several academic PDF papers regarding "${contextQuery}".
User Goal: They want to answer the following specific questions from these papers: "${userQuestions}".
Task: Generate 5 semantic search phrases or short questions.
Return ONLY the 5 phrases as a JSON array of strings.`;

  try {
    if (!genAI) throw new Error('Gemini not initialized');

    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' }
    });

    const response = await result.response;
    const queries = JSON.parse(cleanJson(response.text()));
    return Array.isArray(queries) ? queries : [];
  } catch (error) {
    logger.warn('Gemini failed for insight queries, using fallback');
    return [userQuestions];
  }
}

module.exports = {
  enhanceMetadata,
  generateSearchVariations,
  generateArxivSearchTerms,
  getEmbedding,
  getBatchEmbeddings,
  filterRelevantPapers,
  extractNotesFromPages,
  performSearch,
  generateInsightQueries
};
