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
  const prompt = `You are analyzing the first 4 pages of a research paper to extract detailed academic metadata.
  
  Current preliminary metadata:
  - Title: ${currentMetadata.title}
  - Author: ${currentMetadata.author}
  - Subject: ${currentMetadata.subject}
  
  Text from first 4 pages:
  ${firstFourPagesText} \n\n 
  #########################
  TASK:
  Extract accurate metadata and format it according to these requirements:
  1. title: The exact full academic title of the paper.
  2. author: The full name of the primary/lead author.
  3. subject: A 2-3 sentence summary of the paper's core objective or findings (abstract-like).
  4. harvardReference: A COMPLETE and PROPERLY FORMATTED Harvard style reference for this paper.
  5. publisher: The Journal name, Conference name, or University/Repository (e.g., ArXiv, IEEE, Springer).
  6. categories: Exactly THREE relevant academic categories/subjects for this paper.

  Return EXACTLY this JSON structure:
  {
    "title": "...",
    "author": "...",
    "subject": "...",
    "harvardReference": "...",
    "publisher": "...",
    "categories": ["cat1", "cat2", "cat3"]
  }`;

  try {
    if (!genAI) throw new Error('Gemini not initialized');

    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' }
    });

    const response = await result.response;
    const enhanced = JSON.parse(cleanJson(response.text()));
    return {
      title: enhanced.title || currentMetadata.title,
      author: enhanced.author || currentMetadata.author,
      subject: enhanced.subject || currentMetadata.subject,
      harvardReference: enhanced.harvardReference,
      publisher: enhanced.publisher,
      categories: enhanced.categories
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

    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
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

IMPORTANT CONSIDERATIONS:
- Focus on the CORE of what the user is looking for, not generic related terms
- If the user asking for a specific process, method, or relationship, prioritize terms that reflect that specificity
- If the user is asking for a specific period or historical time frame you Must priorities and include it in all search terms (e.g. "If they ask for World war 1, you should include "world war 1" in all search terms not just the word "war")
- If the user is asking about a specific time, tool, method, or relationship, prioritize and always incluse those specifics in all search terms.
- Understand the user's intent and generate spectific search terms not generic ones.

RESPONSE FORMAT (STRICT JSON):
{
  "exact_phrases": [3-4 phrases, 2-3 words max],
  "title_terms": [3-4 terms, 2-3 words max], 
  "abstract_terms": [3 single keywords, 1 word only, MUST PROVIDE MIN OF 3 KEYWORDS],
  "general_terms": [3-4 terms, 2-3 words max]
}

EXAMPLES OF WHAT WORKS IN ARXIV:

EXAMPLE 1 - FINANCIAL MARKETS:
Topic: "financial markets" 
Query: "what is market volatility"

✅ PERFECT FOR ARXIV:
{
  "exact_phrases": ["market volatility", "financial volatility", "price volatility", "volatility models", "market risk"],
  "title_terms": ["market volatility", "financial markets", "price dynamics", "volatility forecasting", "market behavior"],
  "abstract_terms": ["volatility", "stock market", "finance"],
  "general_terms": ["stock market", "market volatility", "financial risk", "price movements"]
}

EXAMPLE 2 - URBAN PLANNING:
Topic: "urban planning sustainability"
Query: "green infrastructure benefits"

✅ PERFECT FOR ARXIV:
{
  "exact_phrases": ["urban planning", "green infrastructure", "sustainable cities", "urban sustainability", "smart cities"],
  "title_terms": ["urban planning", "green infrastructure", "sustainable development", "city planning", "urban design"],
  "abstract_terms": ["sustainability", "infrastructure", "urban"],
  "general_terms": ["urban sustainability", "green cities", "sustainable planning", "eco cities"]
}

EXAMPLE 3 - HISTORY (WW1 Focus)
Topic: "World War 1" Query: "food supplies effect after the war"

✅ PERFECT FOR ARXIV (Anchored):

json
{
  "exact_phrases": ["World War 1 food supply", "post-World War One food scarcity", "World War 1 agriculture", "1914-1918 food distribution", "World War 1 rationing"],
  "title_terms": ["World War 1", "Great War", "1914-1918", "food", "supply"],
  "abstract_terms": ["World War 1", "World War One", "Great War", "nutrition", "1919"],
  "general_terms": ["World War 1 economy", "post-World War 1 recovery", "1914-1918 logistics"]
}

EXAMPLE 4 - CLIMATE SCIENCE (Specific Region)
Topic: "Great Barrier Reef" Query: "coral bleaching impact on biodiversity"

✅ PERFECT FOR ARXIV (Anchored):

json
{
  "exact_phrases": ["Great Barrier Reef bleaching", "Great Barrier Reef coral death", "Great Barrier Reef biodiversity loss", "Great Barrier Reef ecosystems", "Great Barrier Reef heat stress"],
  "title_terms": ["Great Barrier Reef", "bleaching", "reef", "biodiversity"],
  "abstract_terms": ["Great Barrier Reef", "Acropora", "Queensland coast"],
  "general_terms": ["Great Barrier Reef climate change", "Great Barrier Reef ecology"]
}
EXAMPLE 5 - LAW / POLITICS (Specific Clause)
Topic: "Second Amendment" Query: "legal interpretations of the well regulated militia clause"

✅ PERFECT FOR ARXIV (Anchored):

{
  "exact_phrases": ["Second Amendment militia", "Second Amendment interpretation", "Second Amendment rights", "Constitution Second Amendment", "Second Amendment well regulated"],
  "title_terms": ["Second Amendment", "Constitution", "militia", "gun rights"],
  "abstract_terms": ["Second Amendment", "Bill of Rights", "firearms"],
  "general_terms": ["Second Amendment law", "Second Amendment history", "2nd Amendment"]
}

EXAMPLE 6 - MEDICINE (Specific Condition)
Topic: "Type 1 Diabetes" Query: "impact of continuous glucose monitoring on HbA1c"
✅ PERFECT FOR ARXIV (Anchored):
{
  "exact_phrases": ["Type 1 Diabetes CGM", "Type 1 Diabetes glucose monitoring", "Type 1 Diabetes HbA1c", "juvenile diabetes monitoring", "T1D continuous monitoring"],
  "title_terms": ["Type 1 Diabetes", "T1D", "glucose monitoring", "HbA1c"],
  "abstract_terms": ["Type 1 Diabetes", "insulin", "blood sugar"],
  "general_terms": ["Type 1 Diabetes management", "Type 1 Diabetes technology"]
}

KEY SUCCESS FACTORS:
- Use terms that would appear in actual paper TITLES
- Focus on the core what the user is looking for, not generic related terms
- Place key user intent at the front of the search term 
- Generate enough options (4-5) for good coverage
- Think like an academic author naming their paper
- Each search term MUST contain at least one keyword from the original user topics or questions, BUT by understanding the user's intent you can modify those keywords to be more effective for search (e.g. "Sport pychology" could become "athlete mental health" if it better matches the user's intent)
- If the user is asking for a specific period or historical time frame you Must priorities and include it in all search terms (e.g. "If they ask for World war 1, you should include "world war 1" in all search terms not just the word "war")
- If the user is asking about a specific time, tool, method, or relationship, prioritize and always incluse those specifics in all search terms.
- Understand the user's intent and generate spectific search terms not generic ones.

RESPONSE FORMAT (STRICT JSON):
{
  "exact_phrases": [3-4 phrases, 2-3 words max],
  "title_terms": [3-4 terms, 2-3 words max], 
  "abstract_terms": [3 single keywords, 1 word only, MUST PROVIDE MIN OF 3 KEYWORDS],
  "general_terms": [3-4 terms, 2-3 words max]
}
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
      model: 'gemini-1.5-flash',
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


/**
 * Uses LLM to intelligently select the most relevant papers
 * LLM returns paper IDs and titles for verification
 * 
 * @param {Array} papers - Array of ArxivPaper objects (pre-sorted by cosine score)
 * @param {Array} userQuestions - User's research questions
 * @param {Array} keywords - Search keywords
 * @param {number} topN - Number of papers to select
 * @returns {Promise<Array>} - Selected papers with original data intact
 */
async function selectTopPapersWithLLM(papers, userQuestions, keywords, topN) {
  if (papers.length === 0) return [];

  // If we have fewer papers than requested, return all
  if (papers.length <= topN) {
    console.log(`   📊 Only ${papers.length} papers available, returning all`);
    return papers;
  }

  // Build the prompt with paper summaries
  const paperSummaries = papers.map((p, idx) => ({
    index: idx,
    id: p.id, // ArXiv ID (e.g., "2301.12345")
    title: p.title,
    abstract: p.summary.substring(0, 500) // Limit for token efficiency
  }));

  const systemPrompt = `You are an expert research assistant helping to identify the most relevant academic papers for a user's research query. To help them write there assignment, you have been given a list of papers with their titles and abstracts. Your task is to perform a deeper semantic analysis to select the TOP ${topN} most relevant papers title and abstract in relation to the user's research questions and topic.

CONTEXT: Your task is to perform a deeper semantic analysis to select the TOP ${topN} most relevant papers title and abstract in relation to the user's research questions and topic.
- BE very STRICT in your selection, If the title and abstract do not clearly indicate that the paper addresses the user's specific questions, do NOT select it, even if it has some related keywords

#
CRITICAL INSTRUCTIONS:
1. Consider BOTH the title AND abstract when evaluating relevance to the users' specific research questions and keywords
2. Prioritize papers that DIRECTLY address the user's specific questions
3. Look for papers that cover the core concepts mentioned in the user's questions, even if they use different wording
4. Select papers that would provide the most valuable insights for the research
5. Return EXACTLY ${topN} paper selections (or fewer if less than ${topN} papers provided)
6. For each selection, return the paper ID and title for verification

IMPORTANT FACTORS TO CONSIDER:
- If the question is time and historically specific, prioritize papers that are most relevant to that time period, For Example DONT select papers about AI or Blockchain If the user is asking about "economic theories in the 18th century"
- Papers must be in the same domain/field as the user's topic to be relevant
- Papers must be english 
- If the user talking about a specific method or concept, prioritize papers that focus on that method/concept in depth
- If the user is asking about a specific relationship between concepts, prioritize papers that explore that relationship directly
- BE very STRICT in your selection, If the title and abstract do not clearly indicate that the paper addresses the user's specific questions, do NOT select it, even if it has some related keywords

RESPONSE FORMAT (STRICT JSON):
{
  "selections": [
    {
      "id": "arxiv_paper_id",
      "title": "Paper title"
    }
  ]
}

Example:
{
  "selections": [
    {
      "id": "2301.12345",
      "title": "Residential Renewable Energy Solutions"
    },
    {
      "id": "1706.03762",
      "title": "Off-grid renewable energy solutions for rural areas"
    }
  ]
}

Remember: Return EXACTLY ${topN} Paper relating to the user question and topic. Using both ID and title for each paper.`;

  const userPrompt = `\n \n \n  ## ARXIV PAPER SELECTION: ## \n \n\n

${paperSummaries.map(p => `
Paper ${p.index + 1}:
ID: ${p.id}
Title: ${p.title}
Abstract: ${p.abstract}
`).join('\n \n ---###########################--\n \n')}


################################\n \n 

USER'S RESEARCH QUESTION:
${userQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

Topic: ${keywords.join(', ')}

PAPERS TO EVALUATE (${papers.length} total):

TASK: Select the TOP ${topN} most relevant papers from the list above. Return their IDs and titles in the JSON format specified. \n

IMPORTANT FACTORS TO CONSIDER:
- If the question is time and historically specific, prioritize papers that are most relevant to that time period, For Example DONT select papers about AI or Blockchain If the user is asking about "economic theories in the 18th century"
- Papers must be in the same domain/field as the user's topic to be relevant
- Papers must be english 
- If the user talking about a specific method or concept, prioritize papers that focus on that method/concept in depth
- If the user is asking about a specific relationship between concepts, prioritize papers that explore that relationship directly
- BE very STRICT in your selection, If the title and abstract do not clearly indicate that the paper addresses the user's specific questions, do NOT select it, even if it has some related keywords

REMEMBER YOU ARE A STUDENT RESEARCH ASSISSTANT, YOUR GOAL IS TO HELP THE USER SELECT THE MOST RELEVANT PAPERS FOR THEIR SPECIFIC RESEARCH QUESTIONS. RETURN EXACTLY ${topN} PAPERS OR FEWER IF NOT ENOUGH PAPERS ARE HIGHLY RELEVANT.
`;

  try {
    if (!genAI) throw new Error('Gemini not available');

    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1 // Lower temperature for consistent selection
      }
    });

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      systemInstruction: { parts: [{ text: systemPrompt }] }
    });

    const response = await result.response;
    const parsed = JSON.parse(cleanJson(response.text()));
    const selections = parsed.selections || [];

    console.log(`   🤖 LLM selected ${selections.length} papers`);

    // Verify titles match and map to original papers
    const selectedPapers = selections
      .map(selection => {
        const paper = papers.find(p => p.id === selection.id);
        if (!paper) {
          console.warn(`   ⚠️  Paper ID ${selection.id} not found in batch`);
          return null;
        }

        // Verify title matches (for debugging)
        if (paper.title !== selection.title) {
          console.warn(`   ⚠️  Title mismatch for ${selection.id}`);
          console.warn(`      Expected: ${paper.title.substring(0, 60)}...`);
          console.warn(`      Got: ${selection.title.substring(0, 60)}...`);
        }

        return paper; // Return original paper with all data intact
      })
      .filter(p => p !== null);

    console.log(`   ✅ Successfully mapped ${selectedPapers.length} papers`);

    // Verify we got the expected number
    if (selectedPapers.length < selections.length) {
      console.warn(`   ⚠️  Some papers not found: expected ${selections.length}, got ${selectedPapers.length}`);
    }

    return selectedPapers;

  } catch (error) {
    logger.error('LLM paper selection failed:', error);

    // FALLBACK: Return top N by cosine score (already sorted)
    console.log(`   ⚠️  LLM failed, using top ${topN} by cosine score`);
    return papers.slice(0, topN);
  }
}


/**
 * Hybrid Cosine Similarity + LLM Paper Selection
 * 
 * Stage 1: Use cosine similarity to score and rank ALL papers
 * Stage 2: LLM selects top 20 from first 100 papers
 * Stage 3: LLM selects top 20 from the 80 LEFTOVER papers
 * 
 * Returns: Maximum 40 papers for PDF processing
 */
async function filterRelevantPapers(papers, userQuestions, keywords) {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║ HYBRID COSINE + LLM PAPER SELECTION                            ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('📊 Total papers received:', papers.length);
  console.log('❓ User questions:', userQuestions);
  console.log('🔑 Keywords:', keywords);

  if (papers.length === 0) {
    console.log('⚠️  No papers to filter');
    return [];
  }

  // ═══════════════════════════════════════════════════════════════
  // STAGE 1: COSINE SIMILARITY PRE-FILTER
  // ═══════════════════════════════════════════════════════════════
  console.log('\n📐 STAGE 1: Cosine Similarity Pre-Filter');
  console.log('   Creating embeddings for all', papers.length, 'papers...');

  const userIntentText = 'Questions: ' + userQuestions.join('\n') + '\nKeywords: ' + keywords.join(', ');
  const targetVector = await getEmbedding(userIntentText, 'RETRIEVAL_QUERY');

  if (targetVector.length === 0) {
    console.log('   ❌ Failed to create target vector');
    return [];
  }

  const paperTexts = papers.map(p => 'Title: ' + p.title + '\nAbstract: ' + p.summary);
  const paperEmbeddings = await getBatchEmbeddings(paperTexts, 'RETRIEVAL_DOCUMENT');

  // Calculate cosine similarity scores
  const scoredPapers = papers.map((paper, index) => {
    const paperVector = paperEmbeddings[index];
    let score = 0;
    if (paperVector && paperVector.length > 0) {
      score = cosineSimilarity(targetVector, paperVector);
    }
    return Object.assign({}, paper, { relevanceScore: score });
  });

  console.log('   📊 Sample scores:', scoredPapers.slice(0, 3).map(p => ({
    title: p.title.substring(0, 40) + '...',
    score: p.relevanceScore.toFixed(3)
  })));

  // Filter by threshold and sort by score
  const filtered = scoredPapers
    .filter(p => (p.relevanceScore || 0) >= 0.30)
    .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));

  console.log('   ✅ Cosine filtering complete');
  console.log('      Papers with score ≥ 0.30:', filtered.length);
  if (filtered.length > 0) {
    console.log('      Top score:', filtered[0].relevanceScore.toFixed(3));
    console.log('      Lowest score:', filtered[filtered.length - 1].relevanceScore.toFixed(3));
  }

  if (filtered.length === 0) {
    console.log('   ⚠️  No papers passed cosine threshold');
    return [];
  }

  // Take top 100 for first LLM selection
  const top100 = filtered.slice(0, 100);
  console.log('      Taking top', top100.length, 'papers for LLM selection');

  // ═══════════════════════════════════════════════════════════════
  // STAGE 2: LLM SELECTION FROM TOP 100
  // ═══════════════════════════════════════════════════════════════
  console.log('\n🤖 STAGE 2: LLM Selection from Top 100 Papers');
  console.log('   Processing', top100.length, 'papers');
  if (top100.length > 0) {
    console.log('   Cosine score range:',
      top100[0].relevanceScore.toFixed(3),
      'to',
      top100[top100.length - 1].relevanceScore.toFixed(3)
    );
  }

  const stage2Selected = await selectTopPapersWithLLM(
    top100,
    userQuestions,
    keywords,
    20
  );

  console.log('   ✅ Stage 2 complete:', stage2Selected.length, 'papers selected');
  if (stage2Selected.length > 0) {
    console.log('      Sample titles:');
    stage2Selected.slice(0, 3).forEach((p, i) => {
      console.log(`      ${i + 1}. ${p.title.substring(0, 60)}...`);
    });
  }

  // Get the IDs of selected papers to find leftovers
  const stage2SelectedIds = new Set(stage2Selected.map(p => p.id));

  // ═══════════════════════════════════════════════════════════════
  // STAGE 3: LLM SELECTION FROM 80 LEFTOVER PAPERS
  // ═══════════════════════════════════════════════════════════════
  let stage3Selected = [];

  // Get the papers that were NOT selected in Stage 2
  const leftoverPapers = top100.filter(p => !stage2SelectedIds.has(p.id));

  if (leftoverPapers.length > 0) {
    console.log('\n🤖 STAGE 3: LLM Selection from Leftover Papers');
    console.log('   Processing', leftoverPapers.length, 'leftover papers');
    console.log('   Cosine score range:',
      leftoverPapers[0].relevanceScore.toFixed(3),
      'to',
      leftoverPapers[leftoverPapers.length - 1].relevanceScore.toFixed(3)
    );

    stage3Selected = await selectTopPapersWithLLM(
      leftoverPapers,
      userQuestions,
      keywords,
      20
    );

    console.log('   ✅ Stage 3 complete:', stage3Selected.length, 'papers selected');
    if (stage3Selected.length > 0) {
      console.log('      Sample titles:');
      stage3Selected.slice(0, 3).forEach((p, i) => {
        console.log(`      ${i + 1}. ${p.title.substring(0, 60)}...`);
      });
    }
  } else {
    console.log('\n⏭️  STAGE 3: Skipped (no leftover papers)');
  }

  // ═══════════════════════════════════════════════════════════════
  // COMBINE RESULTS
  // ═══════════════════════════════════════════════════════════════
  const finalSelection = [...stage2Selected, ...stage3Selected];

  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║ FINAL SELECTION COMPLETE                                       ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('📊 Total papers selected:', finalSelection.length);
  console.log('   From Stage 2 (top 100):', stage2Selected.length);
  console.log('   From Stage 3 (leftover):', stage3Selected.length);
  if (finalSelection.length > 0) {
    console.log('   Average relevance score:', (
      finalSelection.reduce((sum, p) => sum + (p.relevanceScore || 0), 0) / finalSelection.length
    ).toFixed(3));
  }
  console.log('\n');

  return finalSelection;
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


CONTENT FROM ACADEMIC PAPER:
${contextText}\n\n
###################################

USER'S SPECIFIC QUERIES (Extract ONLY content that DIRECTLY answers these):
${userQuestions}
#####################################
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
        model: 'gemini-1.5-flash',
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

    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
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
