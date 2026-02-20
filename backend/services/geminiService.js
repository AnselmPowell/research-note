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

/**
 * Utility to wrap a promise with a timeout
 */
function withTimeout(promise, ms, operationName = 'Operation') {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${operationName} timed out after ${ms}ms`)), ms)
    )
  ]);
}

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
  3. year: The 4-digit publication year.
  4. subject: A 2-3 sentence summary of the paper's core objective or findings (abstract-like).
  5. harvardReference: A COMPLETE and PROPERLY FORMATTED Harvard style reference for this paper.
  6. publisher: The Journal name, Conference name, or University/Repository (e.g., ArXiv, IEEE, Springer).
  7. categories: Exactly THREE relevant academic categories/subjects for this paper.

  Return EXACTLY this JSON structure:
  {
    "title": "...",
    "author": "...",
    "year": "...",
    "subject": "...",
    "harvardReference": "...",
    "publisher": "...",
    "categories": ["cat1", "cat2", "cat3"]
  }`;

  // TIER 1: Try Gemini with timeout
  try {
    if (!genAI) throw new Error('Gemini not initialized');

    const model = genAI.getGenerativeModel({ model: 'gemini-2-flash' });
    const result = await withTimeout(
      model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' }
      }),
      80000, // 80 seconds
      'Gemini Enhance Metadata'
    );

    const response = await result.response;
    const enhanced = JSON.parse(cleanJson(response.text()));
    console.log('[enhanceMetadata] ✅ Tier 1 (Gemini) success');
    return {
      title: enhanced.title || currentMetadata.title,
      author: enhanced.author || currentMetadata.author,
      year: enhanced.year,
      subject: enhanced.subject || currentMetadata.subject,
      harvardReference: enhanced.harvardReference,
      publisher: enhanced.publisher,
      categories: enhanced.categories
    };

  } catch (geminiError) {
    console.warn('[enhanceMetadata] Tier 1 (Gemini) failed:', geminiError.message);

    // TIER 2: Try GPT with timeout
    try {
      const result = await withTimeout(
        callOpenAI(prompt),
        80000, // 80 seconds
        'GPT Enhance Metadata'
      );
      console.log('[enhanceMetadata] ✅ Tier 2 (GPT) success');
      return {
        title: result.title || currentMetadata.title,
        author: result.author || currentMetadata.author,
        year: result.year,
        subject: result.subject || currentMetadata.subject,
        harvardReference: result.harvardReference,
        publisher: result.publisher,
        categories: result.categories
      };

    } catch (gptError) {
      console.warn('[enhanceMetadata] Tier 2 (GPT) failed:', gptError.message);

      // TIER 3: Basic fallback
      console.log('[enhanceMetadata] Using Tier 3 (basic fallback)');
      return {
        title: currentMetadata.title,
        author: currentMetadata.author,
        year: '',
        subject: currentMetadata.subject,
        harvardReference: '',
        publisher: '',
        categories: []
      };
    }
  }
}

async function generateSearchVariations(originalQuery) {
  const prompt = `Generate 5 additional, distinct search queries for: "${originalQuery}".
Return JSON array of strings.`;

  // TIER 1: Try Gemini with timeout
  try {
    if (!genAI) throw new Error('Gemini not initialized');

    const model = genAI.getGenerativeModel({ model: 'gemini-2-flash' });
    const result = await withTimeout(
      model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' }
      }),
      80000, // 80 seconds
      'Gemini Search Variations'
    );

    const response = await result.response;
    const queries = JSON.parse(cleanJson(response.text()));
    return Array.isArray(queries) ? queries : [];

  } catch (geminiError) {
    console.warn('[generateSearchVariations] Tier 1 (Gemini) failed:', geminiError.message);

    // TIER 2: Try GPT with timeout
    try {
      const gptPrompt = `Generate 5 additional, distinct search queries for: "${originalQuery}".
Return ONLY a JSON array of strings. Example: ["query1", "query2", "query3", "query4", "query5"]`;

      const parsed = await withTimeout(
        callOpenAI(gptPrompt),
        80000, // 80 seconds
        'GPT Search Variations'
      );

      const queries = Array.isArray(parsed) ? parsed : [];
      console.log('[generateSearchVariations] ✅ Tier 2 (GPT) success');
      return queries;

    } catch (gptError) {
      console.warn('[generateSearchVariations] Tier 2 (GPT) failed:', gptError.message);

      // TIER 3: Basic fallback
      console.log('[generateSearchVariations] Using Tier 3 (basic fallback)');
      return [
        `${originalQuery} research`,
        `${originalQuery} study`,
        `${originalQuery} analysis`,
        `${originalQuery} paper`,
        `${originalQuery} academic`
      ];
    }
  }
}


async function generateArxivSearchTerms(topics, questions) {
  console.log('📊 Generating ArXiv search terms (keyword-focused)...');

  // VALIDATE INPUTS: Ensure topics and questions are arrays
  const safeTopics = Array.isArray(topics) ? topics : (topics ? [topics] : []);
  const safeQuestions = Array.isArray(questions) ? questions : (questions ? [questions] : []);

  console.log('[ArxivSearchTerms] Input validation:', {
    topicsType: typeof topics,
    topicsIsArray: Array.isArray(topics),
    questionsType: typeof questions,
    questionsIsArray: Array.isArray(questions),
    safeTopicsLength: safeTopics.length,
    safeQuestionsLength: safeQuestions.length
  });

  const userQuery = [...safeTopics, ...safeQuestions].join('. ');

    const systemPrompt = `You are an academic keyword generation engine.

Your sole task is to convert a user's natural-language research question into high-quality academic search keywords suitable for abstract-only searches in academic paper databases.

You must follow the rules below exactly.

OBJECTIVE
Given a user research question, generate:
One primary keyword phrase that captures the core academic subject
Three secondary keyword phrases that represent: key variables, mechanisms, scope (e.g. global, longitudinal, comparative, psychological, economic)
Then generate multiple keyword combinations using strict AND logic, prioritised from most specific → slightly broader.

CRITICAL RULES
1. Preserve academic entities
If the query contains a named historical event, theory, discipline, or proper noun, it must remain intact as a single phrase
Example:
✅ "world war 1"
❌ "world" AND "war" AND "1"

2. Use academic phrasing
Convert informal language into terminology commonly used in academic literature
Example:
User: "athlete mental state and wellbeing"
Output: "sports psychology", "mental health"

3. Avoid noise
Do NOT include:
filler words
verbs
questions
adjectives unless academically meaningful
Every keyword must plausibly appear in an academic abstract

4. primary words should be the main subject the user is focusing on
understand what the user wants to know about, e.g time period, object, method, place etc.. make that the main keyword.
the primary key will show up with every search so it must be focused and main subject matter/period/methods etc in time or place

5. Secondary_keywords should be one word only
This additional keyword should complete the query asked by the user
max of 3 key words
As much as possible, these should be a single word, keep it to one word.


OUTPUT FORMAT (MANDATORY)
Return ONLY valid JSON. No explanations. No markdown. No prose.
{
  "primary_keyword": "string",
  "secondary_keywords": ["string", "string", "string"],
  "query_combinations": [
    "primary AND secondary AND secondary",
    "primary AND secondary",
    "primary AND secondary"
  ]
}

EXAMPLES (FOLLOW THESE PATTERNS EXACTLY)

Example 1
User query: "How did World War 1 affect food supplies globally?"
{
  "primary_keyword": "world war 1",
  "secondary_keywords": ["food", "global"],
  "query_combinations": [
    "world war 1 AND food AND global",
    "world war 1 AND food",
    "world war 1 AND global"
  ]
}

Example 2
User query: "Athlete mental state and wellbeing in competitive sport"
{
  "primary_keyword": "sports psychology",
  "secondary_keywords": ["mental health", "athlete wellbeing", "competitive sport"],
  "query_combinations": [
    "sports psychology AND mental health AND competitive sport",
    "sports psychology AND athlete wellbeing",
    "sports psychology AND mental health"
  ]
}

Example 3
User query: "How does inflation affect unemployment rates?"
{
  "primary_keyword": "inflation",
  "secondary_keywords": ["unemployment", "labor market", "economic growth"],
  "query_combinations": [
    "inflation AND unemployment AND labor market",
    "inflation AND unemployment",
    "inflation AND economic growth"
  ]
}

Example 4
User query: "How does social media influence teenage identity?"
{
  "primary_keyword": "social media",
  "secondary_keywords": ["teenage", "adolescent", "development"],
  "query_combinations": [
    "social media AND teenage AND adolescent",
    "social media AND teenage AND development",
    "social media AND teenage",
    "social media AND development"
  ]
}

Example 5
User query: "What impact does sleep deprivation have on memory?"
{
  "primary_keyword": "sleep deprivation",
  "secondary_keywords": ["memory", "cognitive function", "learning"],
  "query_combinations": [
    "sleep deprivation AND memory AND cognitive function",
    "sleep deprivation AND memory",
    "sleep deprivation AND learning"
  ]
}

Example 6
User query: "How does climate change affect coral reefs?"
{
  "primary_keyword": "climate change",
  "secondary_keywords": ["coral reefs", "marine", "ocean"],
  "query_combinations": [
    "climate change AND coral reefs AND marine",
    "climate change AND coral reefs",
    "climate change AND ocean"
  ]
}

Example 7
User query: "Does class size affect student academic performance?"
{
  "primary_keyword": "classroom size",
  "secondary_keywords": ["academic", "performance", "education"],
  "query_combinations": [
    "classroom size AND academic",
    "classroom size AND performance",
    "classroom size AND education"
  ]
}

User query:
"${userQuery}"`;

  // TIER 3: Basic fallback - just use topics/questions as-is
  const basicFallback = {
    primary_keyword: safeTopics[0] || safeQuestions[0] || '',
    secondary_keywords: [...safeTopics.slice(1), ...safeQuestions].slice(0, 3),
    query_combinations: safeTopics.length > 0
      ? safeTopics.map(t => t)
      : safeQuestions.map(q => q)
  };

  // Helper to validate and return structured keywords
  const processResult = (parsed, fallback) => {
    let combos = parsed.query_combinations || [];
    combos = combos.map(c => Array.isArray(c) ? c[0] : c).filter(c => c && typeof c === 'string');

    const validated = {
      primary_keyword: (parsed.primary_keyword && typeof parsed.primary_keyword === 'string')
        ? parsed.primary_keyword.trim()
        : fallback.primary_keyword,
      secondary_keywords: Array.isArray(parsed.secondary_keywords)
        ? parsed.secondary_keywords.filter(s => s && typeof s === 'string').slice(0, 3)
        : fallback.secondary_keywords,
      query_combinations: combos.length > 0 ? combos : fallback.query_combinations
    };

    // Safety net: if combinations empty but primary exists, build one
    if (validated.query_combinations.length === 0 && validated.primary_keyword) {
      validated.query_combinations = [validated.primary_keyword];
    }

    return validated;
  };

  // TIER 1: Try Gemini Flash (fast, optimized model) with timeout
  try {
    console.log('[ArxivSearchTerms] Tier 1: Attempting Gemini Flash...');
    if (!genAI) throw new Error('Gemini not initialized');

    const model = genAI.getGenerativeModel({
      model: 'gemini-2-flash',
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1
      }
    });

    // Wrap with 30s timeout for Tier 1
    const result = await withTimeout(
      model.generateContent({
        contents: [{ role: 'user', parts: [{ text: systemPrompt }] }]
      }),
      30000,
      'Gemini Flash ArxivSearchTerms'
    );

    const response = await result.response;
    const parsed = JSON.parse(cleanJson(response.text()));
    const validated = processResult(parsed, basicFallback);
    
    console.log('[ArxivSearchTerms] ✅ Tier 1 Success (Gemini Flash):', validated);
    return validated;

  } catch (geminiError) {
    console.warn('[ArxivSearchTerms] Tier 1 Failed:', {
      error: geminiError.message,
      type: geminiError.constructor.name
    });

    // TIER 2: Fallback to GPT-4o Mini (ultra-fast, reliable) with timeout
    try {
      console.log('[ArxivSearchTerms] Tier 2: Attempting GPT-4o Mini fallback...');
      
      const gptPrompt = `You are an academic keyword generation engine.

Your sole task is to convert a user's natural-language research question into high-quality academic search keywords.

OBJECTIVE: Generate one primary keyword, three secondary keywords, and query combinations.

CRITICAL: Return ONLY valid JSON in this exact format:
{
  "primary_keyword": "string",
  "secondary_keywords": ["string", "string", "string"],
  "query_combinations": ["primary AND secondary", "primary AND secondary"]
}

User query: "${userQuery}"`;

      const gptResult = await withTimeout(
        callOpenAI(gptPrompt),
        30000,
        'GPT-4o Mini ArxivSearchTerms'
      );

      const validated = processResult(gptResult, basicFallback);
      console.log('[ArxivSearchTerms] ✅ Tier 2 Success (GPT-4o Mini):', validated);
      return validated;

    } catch (gptError) {
      console.warn('[ArxivSearchTerms] Tier 2 Failed:', {
        error: gptError.message,
        type: gptError.constructor.name
      });

      // TIER 3: Use basic fallback
      console.log('[ArxivSearchTerms] ⚠️  Tier 3: Using basic fallback (no AI)');
      return basicFallback;
    }
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
    abstract: p.summary.split(/\s+/).slice(0, 200).join(' ') // First 200 words for token efficiency
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
6. For each selection, return the paper index (number from the list), ID, and title for verification

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
      "index": 0,
      "id": "arxiv_paper_id",
      "title": "Paper title"
    }
  ]
}

Example:
{
  "selections": [
    {
      "index": 5,
      "id": "2301.12345",
      "title": "Residential Renewable Energy Solutions"
    },
    {
      "index": 12,
      "id": "1706.03762",
      "title": "Off-grid renewable energy solutions for rural areas"
    }
  ]
}

Remember: Return EXACTLY ${topN} Paper relating to the user question and topic. Using index, ID and title for each paper.`;

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

    console.log(`   📏 [LLM-SELECT] Prompt sizes: systemPrompt=${systemPrompt.length} chars, userPrompt=${userPrompt.length} chars, total=${systemPrompt.length + userPrompt.length} chars`);
    console.log(`   📏 [LLM-SELECT] Papers in prompt: ${paperSummaries.length}, topN requested: ${topN}`);
    console.log(`   ⏱️  [LLM-SELECT] Calling generateContent at ${new Date().toISOString()}...`);

    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1 // Lower temperature for consistent selection
      }
    });

    const result = await withTimeout(
      model.generateContent({
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] }
      }),
      80000, // 80 seconds
      'Gemini Paper Selection'
    );

    console.log(`   ⏱️  [LLM-SELECT] generateContent returned at ${new Date().toISOString()}`);

    const response = await result.response;
    const usage = response.usageMetadata;
    if (usage) {
      const inputCost = (usage.promptTokenCount / 1000000) * 0.10;
      const outputCost = (usage.candidatesTokenCount / 1000000) * 0.40;
      console.log(`   💰 [LLM-SELECT] Usage: ${usage.promptTokenCount} in, ${usage.candidatesTokenCount} out. Est Cost: $${(inputCost + outputCost).toFixed(4)}`);
    }
    console.log(`   ⏱️  [LLM-SELECT] response.text() ready at ${new Date().toISOString()}`);
    const parsed = JSON.parse(cleanJson(response.text()));
    const selections = parsed.selections || [];

    console.log(`   🤖 LLM selected ${selections.length} papers`);

    // Verify and map to original papers using multi-layered matching
    const selectedPapers = selections
      .map(selection => {
        // 1. Try Index match (most reliable)
        if (typeof selection.index === 'number' && papers[selection.index]) {
          return papers[selection.index];
        }

        // 2. Try Exact ID match
        let paper = papers.find(p => p.id === selection.id);
        if (paper) return paper;

        // 3. Try Partial ID match (ArXiv IDs are URLs, LLMs often return just the ID part)
        if (typeof selection.id === 'string') {
          paper = papers.find(p => p.id.includes(selection.id) || selection.id.includes(p.id));
          if (paper) return paper;
        }

        // 4. Try Title match (Fuzzy last resort)
        if (selection.title) {
          paper = papers.find(p => p.title.toLowerCase().includes(selection.title.toLowerCase()) ||
            selection.title.toLowerCase().includes(p.title.toLowerCase()));
          if (paper) return paper;
        }

        return null;
      })
      .filter(p => !!p);

    console.log(`   ✅ Successfully mapped ${selectedPapers.length} papers`);

    // RESCUE FALLBACK: If LLM selected papers but mapping failed completely, don't return 0
    if (selectedPapers.length === 0 && selections.length > 0) {
      console.warn(`   ⚠️  Mapping failed for all ${selections.length} selections, rescuing with top ${topN} by cosine`);
      // Use the provided papers (which are already sorted by cosine)
      return papers.slice(0, topN);
    }

    return selectedPapers;

  } catch (error) {
    logger.error('Gemini paper selection failed, trying OpenAI fallback:', error);

    try {
      const openaiPrompt = `${systemPrompt}\n\n${userPrompt}`;
      const parsed = await callOpenAI(openaiPrompt);
      const selections = parsed.selections || [];

      console.log(`   🤖 OpenAI selected ${selections.length} papers`);

      const selectedPapers = selections
        .map(selection => {
          // Same multi-layered matching for OpenAI
          if (typeof selection.index === 'number' && papers[selection.index]) return papers[selection.index];
          let paper = papers.find(p => p.id === selection.id);
          if (paper) return paper;
          if (typeof selection.id === 'string') {
            paper = papers.find(p => p.id.includes(selection.id) || selection.id.includes(p.id));
            if (paper) return paper;
          }
          if (selection.title) {
            paper = papers.find(p => p.title.toLowerCase().includes(selection.title.toLowerCase()));
            if (paper) return paper;
          }
          return null;
        })
        .filter(p => !!p);

      console.log(`   ✅ OpenAI successfully mapped ${selectedPapers.length} papers`);

      // RESCUE FALLBACK
      if (selectedPapers.length === 0 && selections.length > 0) {
        console.warn(`   ⚠️  OpenAI mapping failed, rescuing with top ${topN} by cosine`);
        return papers.slice(0, topN);
      }

      return selectedPapers;
    } catch (openaiError) {
      logger.error('Both Gemini and OpenAI failed for paper selection:', openaiError);
      // FALLBACK: Return top N by cosine score (already sorted)
      console.log(`   ⚠️  ALL LLMs failed, using top ${topN} by cosine score`);
      return papers.slice(0, topN);
    }
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
    .filter(p => (p.relevanceScore || 0) >= 0.48)
    .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));

  console.log('   ✅ Cosine filtering complete');
  console.log('      Papers with score ≥ 0.48:', filtered.length);
  if (filtered.length > 0) {
    console.log('      Top score:', filtered[0].relevanceScore.toFixed(3));
    console.log('      Lowest score:', filtered[filtered.length - 1].relevanceScore.toFixed(3));

    console.log('\n      📋 Top 20 PDF titles after Stage 1 (Cosine Sorting):');
    filtered.slice(0, 20).forEach((p, i) => {
      console.log(`      ${i + 1}. [${p.relevanceScore.toFixed(3)}] ${p.title.substring(0, 80)}${p.title.length > 80 ? '...' : ''}`);
    });
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
      if (p && p.title) {
        console.log(`      ${i + 1}. ${p.title.substring(0, 60)}...`);
      }
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
        if (p && p.title) {
          console.log(`      ${i + 1}. ${p.title.substring(0, 60)}...`);
        }
      });
    }
  } else {
    console.log('\n⏭️  STAGE 3: Skipped (no leftover papers)');
  }

  // ═══════════════════════════════════════════════════════════════
  // COMBINE RESULTS & DEDUPLICATE
  // ═══════════════════════════════════════════════════════════════
  const combined = [...stage2Selected, ...stage3Selected];
  const finalSelection = [];
  const seenFinalIds = new Set();

  combined.forEach(p => {
    if (p && p.id && !seenFinalIds.has(p.id)) {
      seenFinalIds.add(p.id);
      finalSelection.push(p);
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // STAGE 4: RESCUE FALLBACK
  // If LLM was overly strict and selected < 30 papers, 
  // take the next top 10 highest-scored papers that were not selected.
  // ═══════════════════════════════════════════════════════════════
  if (finalSelection.length < 30) {
    console.log(`\n🆘 STAGE 4: Rescue Fallback (Current count: ${finalSelection.length})`);
    
    // top100 is already sorted by cosine score from Stage 1
    const rescuePapers = top100
      .filter(p => !seenFinalIds.has(p.id)) // Only those NOT picked by LLM in Stages 2/3
      .slice(0, 10); // Take the top 10 next-best matches

    rescuePapers.forEach(p => {
      seenFinalIds.add(p.id);
      finalSelection.push(p);
    });

    console.log(`   ✅ Rescued ${rescuePapers.length} additional papers based on cosine score`);
  }

  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║ FINAL SELECTION COMPLETE                                       ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('📊 Total papers selected:', finalSelection.length);
  console.log('   From Stage 2 (top 100):', stage2Selected.length);
  console.log('   From Stage 3 (leftover):', stage3Selected.length);
  const rescuedCount = finalSelection.length - (stage2Selected.length + stage3Selected.length);
  if (rescuedCount > 0) {
    console.log('   From Stage 4 (rescue):  ', rescuedCount);
  }
  if (finalSelection.length > 0) {
    console.log('   Average relevance score:', (
      finalSelection.reduce((sum, p) => sum + (p.relevanceScore || 0), 0) / finalSelection.length
    ).toFixed(3));
  }
  console.log('\n');

  return finalSelection;
}

async function extractNotesFromPages(relevantPages, userQuestions, paperTitle, paperAbstract, referenceList, onStreamCallback) {
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
If nothing directly answers the queries, return {"notes": []}.\n

IMPORTANT FOR CITATIONS:
- When you find inline citations like [1], [2], or [Smith et al., 2020] in the extracted text, match them to the REFERENCE LIST above
- In the "citations" array, provide BOTH the inline citation AND the full reference from the list
- Example: If text contains "[1]", find reference #1 from the list above and include it as the full reference\n

Remember: You must justify WHY each extraction directly answers the user's query. If you cannot provide a strong justification, do not include it.\n
Most importantly, must extract the EXACT text from the paper dont shorten or paraphrase or add or remove content.`;

    try {
      if (!genAI) throw new Error('Gemini not available');

      const model = genAI.getGenerativeModel({
        model: 'gemini-3-flash-preview',
        generationConfig: {
          responseMimeType: 'application/json'
        }
      });

      const result = await withTimeout(
        model.generateContent({
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          systemInstruction: { parts: [{ text: systemPrompt }] }
        }),
        80000, // 80 seconds
        'Gemini Note Extraction'
      );

      const response = await result.response;
      const usage = response.usageMetadata;
      if (usage) {
        const inputCost = (usage.promptTokenCount / 1000000) * 0.10;
        const outputCost = (usage.candidatesTokenCount / 1000000) * 0.40;
        console.log(`      💰 [LLM-EXTRACT] Usage: ${usage.promptTokenCount} in, ${usage.candidatesTokenCount} out. Est Cost: $${(inputCost + outputCost).toFixed(4)}`);
      }
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

/**
 * Exponential backoff retry — mirrors original retryOperation.
 * Specifically handles 503/UNAVAILABLE responses from Gemini Grounding.
 * Uses the existing `delay` util from top of this file.
 */
async function retryWithBackoff(operation, retries = 3, delayMs = 1000) {
  try {
    return await operation();
  } catch (error) {
    const is503 =
      error?.status === 503 ||
      error?.code === 503 ||
      (typeof error?.message === 'string' && error.message.includes('503')) ||
      error?.status === 'UNAVAILABLE' ||
      error?.error?.code === 503 ||
      error?.error?.status === 'UNAVAILABLE';

    if (retries > 0 && is503) {
      logger.warn(`[Grounding] 503 Unavailable. Retrying in ${delayMs}ms... (${retries} attempts left)`);
      await delay(delayMs); // `delay` already defined at top of this file
      return retryWithBackoff(operation, retries - 1, delayMs * 2);
    }
    throw error;
  }
}

/**
 * Google Grounding search via Gemini — mirrors original searchGoogleGrounding.
 * Uses @google/generative-ai SDK (backend) instead of @google/genai (frontend).
 * Key differences from original:
 *   - genAI.getGenerativeModel().generateContent() instead of ai.models.generateContent()
 *   - response.text() call (method) instead of response.text (property)
 *   - cleanJson() sanitizer already exists in this file — reused directly
 * Query comes pre-built from aggregator (includes filetype:pdf OR site:.edu operators).
 * Returns raw results array — normalisation happens in searchAggregator.ts.
 */
async function searchWithGrounding(query) {
  const prompt = `You are a specialized Academic Search Engine.
User Query: "${query}"

GOAL: Perform a deep search and return a list of academic papers/PDFs with summaries in JSON format.

INSTRUCTIONS:
1. Find relevant academic papers, PDFs, and articles.
2. Select the top 10-15 most relevant results.
3. For EACH result, write a concise academic summary (3-4 sentences) describing the paper's focus or findings.
4. Return a valid JSON object matching this schema exactly:
{
  "results": [
    {
      "title": "Title of the paper",
      "uri": "The exact URL found",
      "summary": "The generated abstract/summary...",
      "isPdf": true
    }
  ]
}`;

  // TIER 1: Try Gemini with googleSearch tool
  try {
    if (!genAI) throw new Error('Gemini not initialized');

    const model = genAI.getGenerativeModel({
      model: 'gemini-2-flash',
      tools: [{ googleSearch: {} }]
    });

    const result = await retryWithBackoff(
      () => withTimeout(model.generateContent(prompt), 80000, 'Gemini Grounding Search'),
      3,
      1000
    );

    let jsonText = result.response.text();
    if (!jsonText) throw new Error('Empty response');

    jsonText = cleanJson(jsonText);
    let parsed = JSON.parse(jsonText);

    let resultsArray = [];
    if (Array.isArray(parsed)) {
      resultsArray = parsed;
    } else if (parsed && Array.isArray(parsed.results)) {
      resultsArray = parsed.results;
    }

    console.log('[searchWithGrounding] ✅ Tier 1 (Gemini) success:', resultsArray.length, 'results');
    return resultsArray;

  } catch (geminiError) {
    console.warn('[searchWithGrounding] Tier 1 (Gemini) failed:', geminiError.message);

    // TIER 2: Try GPT fallback
    try {
      const gptPrompt = `You are a specialized Academic Search Engine.
User Query: "${query}"

Find the top 10 academic papers/PDFs and return as JSON:
{
  "results": [
    {"title": "...", "uri": "...", "summary": "...", "isPdf": true}
  ]
}`;

      const parsed = await withTimeout(
        callOpenAI(gptPrompt),
        80000, // 80 seconds
        'GPT Grounding Search'
      );

      let resultsArray = [];
      if (Array.isArray(parsed)) {
        resultsArray = parsed;
      } else if (parsed && Array.isArray(parsed.results)) {
        resultsArray = parsed.results;
      }

      console.log('[searchWithGrounding] ✅ Tier 2 (GPT) success:', resultsArray.length, 'results');
      return resultsArray;

    } catch (gptError) {
      console.warn('[searchWithGrounding] Tier 2 (GPT) failed:', gptError.message);

      // TIER 3: Basic fallback
      console.log('[searchWithGrounding] Using Tier 3 (basic fallback)');
      return [];
    }
  }
}

async function generateInsightQueries(userQuestions, contextQuery) {
  const prompt = `Context: The user has gathered several academic PDF papers regarding "${contextQuery}".
  User Goal: They want to answer the following specific questions from these papers: "${userQuestions}".
  Task: Generate 5 semantic search phrases or short questions.
  Return ONLY the 5 phrases as a JSON array of strings. Example: ["phrase1", "phrase2", "phrase3", "phrase4", "phrase5"]`;

  // TIER 1: Try Gemini with timeout
  try {
    if (!genAI) throw new Error('Gemini not initialized');

    const model = genAI.getGenerativeModel({ model: 'gemini-2-flash' });
    const result = await withTimeout(
      model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' }
      }),
      80000, // 80 seconds
      'Gemini Insight Queries'
    );

    const response = await result.response;
    const queries = JSON.parse(cleanJson(response.text()));
    return Array.isArray(queries) ? queries : [userQuestions];

  } catch (geminiError) {
    console.warn('[generateInsightQueries] Tier 1 (Gemini) failed:', geminiError.message);

    // TIER 2: Try GPT with timeout
    try {
      const gptPrompt = `Context: The user has papers regarding "${contextQuery}".
Goal: Answer these questions: "${userQuestions}".
Generate 5 semantic search phrases as a JSON array.`;

      const parsed = await withTimeout(
        callOpenAI(gptPrompt),
        80000, // 80 seconds
        'GPT Insight Queries'
      );

      const queries = Array.isArray(parsed) ? parsed : [userQuestions];
      console.log('[generateInsightQueries] ✅ Tier 2 (GPT) success');
      return queries;

    } catch (gptError) {
      console.warn('[generateInsightQueries] Tier 2 (GPT) failed:', gptError.message);

      // TIER 3: Basic fallback
      console.log('[generateInsightQueries] Using Tier 3 (basic fallback)');
      return [userQuestions];
    }
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
  generateInsightQueries,
  searchWithGrounding
};
