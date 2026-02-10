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
  console.log('📊 Generating ArXiv search terms...');
  
  const systemPrompt = `You are an arXiv search expert who creates SHORT, TARGETED keywords that actually find relevant papers, to figure out the BEST keyword to get the most relevant papers, you must understand the USER'S INTENT and what be most valuable to them.

CRITICAL RULES FOR ARXIV SUCCESS:
1. arXiv search works BEST with 1-3 word phrases, to figure out the BEST keyword you must understand the USER'S INTENT and what be most valuable to them.
2. Use EXACT keywords that appear in academic paper titles
3. Start with the MAIN SUBJECT/DOMAIN first
4. Avoid connecting words (like "for", "in", "of", "the")
5. Generate MORE terms (4-5 each) but keep them SHORT

RESPONSE FORMAT (STRICT JSON):
{
  "exact_phrases": [3-4 phrases, 2-3 words max],
  "title_terms": [3-4 terms, 2-3 words max], 
  "abstract_terms": [3 single keywords, 1 word only, MUST PROVIDE MIN OF 3 KEYWORDS],
  "general_terms": [3-4 terms, 2-3 words max]
}

EXAMPLES OF WHAT WORKS IN ARXIV:

EXAMPLE 1 - MACHINE LEARNING:
Topic: "transformer models"
Query: "how do attention mechanisms work"

✅ PERFECT FOR ARXIV:
{
  "exact_phrases": ["transformer models", "attention mechanism", "self attention", "neural architecture", "sequence modeling"],
  "title_terms": ["transformer", "attention mechanism", "neural networks", "deep learning", "language models"],
  "abstract_terms": ["attention", "transformer", "language models"],
  "general_terms": ["machine learning", "deep learning", "neural networks", "language models"]
}

EXAMPLE 2 - FINANCIAL MARKETS:
Topic: "financial markets" 
Query: "what is market volatility"

✅ PERFECT FOR ARXIV:
{
  "exact_phrases": ["market volatility", "financial volatility", "price volatility", "volatility models", "market risk"],
  "title_terms": ["market volatility", "financial markets", "price dynamics", "volatility forecasting", "market behavior"],
  "abstract_terms": ["volatility", "stock market", "finance"],
  "general_terms": ["stock market", "market volatility", "financial risk", "price movements"]
}

EXAMPLE 3 - URBAN PLANNING:
Topic: "urban planning sustainability"
Query: "green infrastructure benefits"

✅ PERFECT FOR ARXIV:
{
  "exact_phrases": ["urban planning", "green infrastructure", "sustainable cities", "urban sustainability", "smart cities"],
  "title_terms": ["urban planning", "green infrastructure", "sustainable development", "city planning", "urban design"],
  "abstract_terms": ["sustainability", "infrastructure", "urban"],
  "general_terms": ["urban sustainability", "green cities", "sustainable planning", "eco cities"]
}

KEY SUCCESS FACTORS:
- Use terms that would appear in actual paper TITLES
- Focus on the core what the user is looking for, not generic related terms
- Keep it simple and direct
- Generate enough options (4-5) for good coverage
- Think like an academic author naming their paper
- Each search term MUST contain at least one keyword from the original user topics or questions, BUT by understanding the user's intent you can modify those keywords to be more effective for search (e.g. "Sport pychology" could become "athlete mental health" if it better matches the user's intent)
`;

  const userPrompt = `RESEARCH TOPICS: ${topics.join(', ')}

SPECIFIC RESEARCH QUESTIONS:
${questions.map(q => `- ${q}`).join('\n')}

Based on these research topics and questions provided by the user, generate optimized and highly relevant search terms for finding academic papers on arXiv, you must understand what the user is specifically looking for to genarate relevant topics.

IMPORTANT: 
- You must first take time to understand the main research subject and the specific questions the user wants to answer.
- Make sure that those keywords are at the FRONT of the search terms (This is very important for arXiv search relevance)
- Each search term MUST contain at least one keyword from the original user topics or questions, BUT by understanding the user's intent you can modify those keywords to be more effective for search (e.g. "Sport pychology" could become "athlete mental health" if it better matches the user's intent)
- These terms will be passed to arXiv API but don't make them generic one-word phrases
- These terms will be passed to arXiv API to look for matching paper titles and abstracts.
Return ONLY valid JSON matching the format specified in the system prompt.`;

  const fallback = {
    exact_phrases: questions.slice(0, 3),
    title_terms: topics.slice(0, 3),
    abstract_terms: [...topics, ...questions].slice(0, 3),
    general_terms: [...topics, ...questions].slice(0, 3)
  };

  try {
    if (!genAI) throw new Error('Gemini not initialized');

    const model = genAI.getGenerativeModel({ 
      model: 'gemini-2.0-flash-exp',
      generationConfig: {
        responseMimeType: "application/json"
      }
    });

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      systemInstruction: { parts: [{ text: systemPrompt }] }
    });

    const response = await result.response;
    const parsedTerms = JSON.parse(cleanJson(response.text()));

    // ✅ VALIDATION LAYER (from Python v1)
    // Extract keywords from original topics/questions (words > 3 chars)
    const allKeywords = new Set();
    topics.forEach(topic => {
      topic.split(/\s+/).forEach(word => {
        if (word.length > 3) allKeywords.add(word.toLowerCase());
      });
    });
    questions.forEach(query => {
      query.split(/\s+/).forEach(word => {
        if (word.length > 3) allKeywords.add(word.toLowerCase());
      });
    });

    // Validate and filter terms
    const validatedTerms = {};
    ['exact_phrases', 'title_terms', 'abstract_terms', 'general_terms'].forEach(key => {
      if (!parsedTerms[key] || !Array.isArray(parsedTerms[key])) {
        parsedTerms[key] = [];
      }

      validatedTerms[key] = parsedTerms[key].filter(term => {
        if (!term || typeof term !== 'string') return false;
        
        const termWords = new Set(term.toLowerCase().split(/\s+/));
        // Check if term contains at least one keyword from original query
        const hasOverlap = [...allKeywords].some(kw => [...termWords].some(tw => tw.includes(kw) || kw.includes(tw)));
        return allKeywords.size === 0 || hasOverlap;
      });

      // Fallback: if no terms passed validation, use original topics/queries
      if (validatedTerms[key].length === 0) {
        if (key === 'exact_phrases') {
          validatedTerms[key] = questions.filter(q => q.split(/\s+/).length > 1).slice(0, 3);
        } else if (key === 'title_terms') {
          validatedTerms[key] = topics.filter(t => t.split(/\s+/).length > 1).slice(0, 3);
        } else if (key === 'abstract_terms') {
          validatedTerms[key] = questions.slice(0, 3);
        } else if (key === 'general_terms') {
          validatedTerms[key] = [...topics, ...questions].slice(0, 3);
        }
      }
    });

    console.log('✅ Generated and validated ArXiv search terms:', validatedTerms);
    return validatedTerms;

  } catch (error) {
    logger.warn('❌ Error generating ArXiv search terms:', error);
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
      console.error('[getEmbedding] Error on attempt', attempt + 1, ':', {
        status: error?.status,
        message: error?.message,
        model: 'gemini-embedding-001'
      });

      if (error?.status === 429 && attempt < 2) {
        const backoff = Math.pow(2, attempt) * 2000 + Math.random() * 1000;
        await delay(backoff);
        continue;
      }
      if (attempt === 2) {
        logger.error('[getEmbedding] All attempts failed, returning empty vector');
        return [];
      }
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
          const errorText = await response.text();
          console.error('[getBatchEmbeddings] API error:', {
            status: response.status,
            statusText: response.statusText,
            error: errorText,
            model: 'gemini-embedding-001',
            attempt: attempt + 1
          });

          if (response.status === 429 || response.status === 503) {
            throw new Error('Rate Limit');
          }
          throw new Error('HTTP ' + response.status + ': ' + errorText);
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
  console.log('\n🔬 [SERVICE] extractNotesFromPages - STARTING');
  console.log('   📄 Paper:', paperTitle);
  console.log('   📊 Relevant pages:', relevantPages?.length);
  console.log('   🔍 First page has pdfUri:', !!relevantPages?.[0]?.pdfUri);
  console.log('   📍 First page pdfUri:', relevantPages?.[0]?.pdfUri);

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

  console.log('   📦 Created', batches.length, 'batches for processing\n');

  const processBatch = async (batch, batchIndex) => {
    console.log(`\n   🔄 [BATCH ${batchIndex + 1}/${batches.length}] Processing ${batch.length} pages`);
    console.log(`      First page in batch has pdfUri: ${!!batch[0]?.pdfUri}`);
    console.log(`      First page pdfUri: ${batch[0]?.pdfUri}`);

    await delay(Math.random() * 2000);

    const contextText = batch.map(p =>
      '==Page ' + (p.pageIndex + 1) + '==\n' + p.text + '\n==Page ' + (p.pageIndex + 1) + '=='
    ).join('\n\n');

    // ✅ ENHANCED SYSTEM PROMPT (from Python v1)
    const systemPrompt = `You are an research assistant analyzing academic papers to extract relevant information based on specific user queries.  

Your Goal: Extract information from research papers that DIRECTLY relates to any of the user's queries below. Be STRICT! You must understand the user intent by the query wording and what they are truly asking for. Only extract content that DIRECTLY answers the user's queries

CRITICAL INSTRUCTIONS - BE VERY STRICT:
1. ONLY extract content that DIRECTLY answers the user's specific queries
2. Do NOT extract content that is only remotely relevant
3. If nothing in the pages DIRECTLY answers the user's queries, return an empty array
4. Extract the EXACT text from the page that answers the user's queries
5. Include sufficient surrounding text to maintain context
6. Keep ALL citation references found in the text (like [1] or [Smith et al., 2020])
7. ALWAYS include the correct page number for each extraction
8. For each extraction, specify EXACTLY which user query it relates to (use the exact query wording)

JUSTIFICATION REQUIREMENT:
- You MUST explain in detail what the extracted text is talking about in the broader context of the full academic paper
- You MUST explain what the user is asking for and WHY the text you extracted relates to the user's query
- You MUST explain WHY it answers what they are looking for
- If your justification does not DIRECTLY show how the text answers the user's question, DO NOT include it in the output

CITATION INSTRUCTIONS:
1. Include any citation references (like "[1]" or "[Smith et al., 2020]") found in the extracted text
2. Keep citations in the extracted text exactly as they appear
3. IMPORTANT: Match inline citations to the REFERENCE LIST provided at the top of the prompt
4. For each inline citation found in the extracted text, look up the full reference from the REFERENCE LIST
5. Format citations as an array: [{"inline": "[1]", "full": "Complete reference from the list"}]
6. If you cannot find a matching reference in the list, use the inline citation text as the full reference

RESPONSE FORMAT (STRICT JSON):
{
  "notes": [{
    "quote": "The exact extracted text with [citations] preserved",
    "justification": "Detailed explanation of what this text discusses in the paper's context, what the user is asking for, and why this text directly answers their query",
    "relatedQuestion": "The exact user query this answers",
    "pageNumber": 12,
    "relevanceScore": 0.95,
    "citations": [
      {"inline": "[1]", "full": "Vaswani, A., et al. (2017). Attention is all you need. In Advances in neural information processing systems (pp. 5998-6008)."},
      {"inline": "[Smith et al., 2020]", "full": "Smith, J., et al. (2020). Deep learning approaches to natural language processing."}
    ]
  }]
}

Remember: Be STRICT! You must understand the user intent by the query wording and what they are truly asking for. Only extract content that DIRECTLY answers the user's queries. If nothing is directly relevant, return {"notes": []}.`;

    // ✅ ENHANCED USER PROMPT WITH REFERENCE LIST
    const userPrompt = `PAPER CONTEXT:
Title: "${paperTitle || 'Unknown'}"
Abstract: "${paperAbstract || 'Not available'}"

REFERENCE LIST FROM THIS PAPER:
${referenceList && referenceList.length > 0 
  ? referenceList.map((ref, idx) => `${idx + 1}. ${ref}`).join('\n')
  : 'No references available'}

####

PAPER INFORMATION:
Title: "${paperTitle || 'Unknown'}"
Abstract: "${paperAbstract || 'Not available'}"

USER'S SPECIFIC QUERIES (Extract ONLY content that DIRECTLY answers these):
${userQuestions}

CONTENT FROM ACADEMIC PAPER:
${contextText}

TASK: 
Extract passages that DIRECTLY answer the user's specific queries above. 
Be STRICT - if content only seems remotely related, DO NOT include it.
If nothing directly answers the queries, return {"notes": []}.

IMPORTANT FOR CITATIONS:
- When you find inline citations like [1], [2], or [Smith et al., 2020] in the extracted text, match them to the REFERENCE LIST above
- In the "citations" array, provide BOTH the inline citation AND the full reference from the list
- Example: If text contains "[1]", find reference #1 from the list above and include it as the full reference

Remember: You must justify WHY each extraction directly answers the user's query. If you cannot provide a strong justification, do not include it.`;

    try {
      if (!genAI) throw new Error('Gemini not available');

      const model = genAI.getGenerativeModel({ 
        model: 'gemini-2.0-flash-exp',
        generationConfig: {
          responseMimeType: 'application/json'
        }
      });

      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] }
      });

      const response = await result.response;
      const parsed = JSON.parse(cleanJson(response.text()));
      const notes = Array.isArray(parsed) ? parsed : (parsed.notes || []);

      console.log(`      ✅ AI returned ${notes.length} notes`);
      console.log(`      🔗 Assigning pdfUri from batch[0]: ${batch[0]?.pdfUri}`);

      // ✅ MAP TO DeepResearchNote INTERFACE
      const mappedNotes = notes.map(note => ({
        quote: note.quote || note.content || '',  // Handle both Python ("content") and current ("quote") formats
        justification: note.justification || 'Relevant.',
        relatedQuestion: note.relatedQuestion || note.matches_topic || 'General',  // Handle Python format
        pageNumber: note.pageNumber || note.page_number || 1,  // Handle Python format
        pdfUri: batch[0]?.pdfUri || '',  // ← CRITICAL: Stamp with source PDF
        relevanceScore: note.relevanceScore || 0.75,
        citations: Array.isArray(note.citations) ? note.citations : []
      }));

      console.log(`      📝 First note mapped: pdfUri=${mappedNotes[0]?.pdfUri}, page=${mappedNotes[0]?.pageNumber}\n`);

      // ✅ STREAMING: Call callback immediately
      if (onStreamCallback && mappedNotes.length > 0) {
        onStreamCallback(mappedNotes);
      }

      return mappedNotes;
    } catch (error) {
      logger.warn('Gemini extraction failed, trying OpenAI');
      
      // ✅ OPENAI FALLBACK (same enhanced prompt)
      try {
        const openaiPrompt = `${systemPrompt}\n\n${userPrompt}`;
        const parsed = await callOpenAI(openaiPrompt);
        const notes = Array.isArray(parsed) ? parsed : (parsed.notes || []);

        console.log(`      ⚠️  OpenAI fallback: ${notes.length} notes returned`);
        console.log(`      🔗 Assigning pdfUri from batch[0]: ${batch[0]?.pdfUri}`);

        const mappedNotes = notes.map(note => ({
          quote: note.quote || note.content || '',
          justification: note.justification || 'Relevant.',
          relatedQuestion: note.relatedQuestion || note.matches_topic || 'General',
          pageNumber: note.pageNumber || note.page_number || 1,
          pdfUri: batch[0]?.pdfUri || '',
          relevanceScore: note.relevanceScore || 0.75,
          citations: Array.isArray(note.citations) ? note.citations : []
        }));

        if (onStreamCallback && mappedNotes.length > 0) {
          onStreamCallback(mappedNotes);
        }

        return mappedNotes;
      } catch (fallbackError) {
        logger.error('Both Gemini and OpenAI failed:', fallbackError);
        return [];
      }
    }
  };

  const results = await asyncPool(CONCURRENCY, batches, (batch, index) => processBatch(batch, index));
  const finalNotes = results.flat().filter(n => n !== null);

  console.log('\n✅ [SERVICE] extractNotesFromPages - COMPLETE');
  console.log('   📊 Total notes:', finalNotes.length);
  console.log('   🔗 First note pdfUri:', finalNotes[0]?.pdfUri);
  console.log('   📄 First note page:', finalNotes[0]?.pageNumber);
  console.log('   📝 First note quote:', finalNotes[0]?.quote?.substring(0, 60) + '...\n');

  return finalNotes;
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
