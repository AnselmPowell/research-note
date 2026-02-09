/**
 * Fuzzy PDF search service
 * Handles word-level matching with OCR tolerance, hyphenation, plurals, and anchor strategies
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * A single word extracted from PDF.js textContent.items
 * Tracks provenance back to the original item for highlighting
 */
export interface WordToken {
    word: string;           // Normalized (lowercase, punctuation-stripped)
    rawWord: string;        // Original text before normalization
    itemIndex: number;      // Index into textContent.items[] array
    charStart: number;      // Start char position within item.str
    charEnd: number;        // End char position within item.str (exclusive)
    globalIndex: number;    // Sequential word number across the page (0, 1, 2, ...)
}

/**
 * Result of a successful fuzzy match on a page
 */
export interface MatchResult {
    matchedWords: WordToken[];    // All PDF words that were part of the match
    score: number;                 // Quality score (0-1)
    matchRatio: number;            // Percent of note words matched
    startWordIndex: number;        // Index of first matched word in page
    endWordIndex: number;          // Index of last matched word in page
}

/**
 * Final result returned to PdfWorkspace
 */
export interface FuzzySearchResult {
    pageNumber: number;            // 1-indexed page where match was found
    match: MatchResult | null;     // Null if no match found (fallback navigation)
}

// ============================================================================
// FUNCTION 1: normalizeWord
// ============================================================================

/**
 * Normalizes a word for fuzzy comparison
 * Strips leading/trailing punctuation, lowercases
 * 
 * @param word - Raw word from PDF or note
 * @returns Normalized word (empty string if only punctuation)
 */
export function normalizeWord(word: string): string {
    return word
        .toLowerCase()
        .replace(/^[^a-z0-9]+/, '')   // Strip leading non-alphanumeric
        .replace(/[^a-z0-9]+$/, '');  // Strip trailing non-alphanumeric
}

// ============================================================================
// FUNCTION 2: fuzzyWordMatch (METHOD 3's 4-TIER SYSTEM)
// ============================================================================

/**
 * Determines if two normalized words are "close enough" to be considered a match
 * 
 * TIER 1: Exact match
 * TIER 2: Collapsed match (remove ALL non-alphanumeric) — handles hyphens, apostrophes
 * TIER 3: Contains match (≥3 chars) — handles OCR fragments, plurals
 * TIER 4: Edit distance (≤1 char difference) — handles OCR typos
 * 
 * @param word1 - First normalized word
 * @param word2 - Second normalized word
 * @returns True if words match according to fuzzy rules
 */
export function fuzzyWordMatch(word1: string, word2: string): boolean {
    // Both inputs are already lowercased and punctuation-stripped by normalizeWord()
    if (!word1 || !word2) return false;

    // TIER 1: Exact match
    if (word1 === word2) return true;

    // TIER 2: Remove ALL non-alphanumeric and compare
    // Handles: "self-organizing" vs "selforganizing", "John's" vs "johns", "build-step" vs "buildstep"
    const collapsed1 = word1.replace(/[^a-z0-9]/g, '');
    const collapsed2 = word2.replace(/[^a-z0-9]/g, '');

    if (collapsed1.length > 0 && collapsed1 === collapsed2) return true;

    // Protect against very short words matching everything
    if (collapsed1.length < 3 || collapsed2.length < 3) return false;

    // TIER 3: One contains the other (min 3 chars to avoid false positives)
    // Handles: "model" vs "models", "2020" vs "2020.", OCR fragments
    if (collapsed1.includes(collapsed2) || collapsed2.includes(collapsed1)) return true;

    // TIER 4: Single character edit distance (same length ±1, differ by ≤1 char)
    // Handles: OCR typos like "tbe" vs "the", "ﬁnd" vs "find", "recognise" vs "recognize"
    if (Math.abs(collapsed1.length - collapsed2.length) <= 1) {
        let diffs = 0;
        const shorter = collapsed1.length <= collapsed2.length ? collapsed1 : collapsed2;
        const longer = collapsed1.length <= collapsed2.length ? collapsed2 : collapsed1;

        if (shorter.length === longer.length) {
            // Same length: count character differences
            for (let i = 0; i < shorter.length; i++) {
                if (shorter[i] !== longer[i]) diffs++;
                if (diffs > 1) break;
            }
            if (diffs <= 1) return true;
        } else {
            // Length differs by 1: check if one char was inserted/deleted
            let si = 0, li = 0;
            while (si < shorter.length && li < longer.length) {
                if (shorter[si] !== longer[li]) {
                    diffs++;
                    if (diffs > 1) break;
                    li++;  // Skip one char in the longer word
                } else {
                    si++;
                    li++;
                }
            }
            if (diffs <= 1) return true;
        }
    }

    return false;
}

// ============================================================================
// FUNCTION 3: tokenizeTextItems
// ============================================================================

/**
 * Extracts individual words from PDF.js textContent.items for a single page
 * Preserves the mapping back to item indices for highlighting
 * 
 * @param items - textContent.items from page.getTextContent()
 * @returns Array of WordToken objects in reading order
 */
export function tokenizeTextItems(items: any[]): WordToken[] {
    const tokens: WordToken[] = [];
    let globalIndex = 0;

    for (let itemIdx = 0; itemIdx < items.length; itemIdx++) {
        const item = items[itemIdx];
        const str: string = item.str;

        if (!str || str.trim().length === 0) continue;

        // Use regex to find word boundaries (sequences of non-whitespace)
        const wordMatches = str.matchAll(/\S+/g);

        for (const match of wordMatches) {
            const rawWord = match[0];
            const charStart = match.index!;
            const charEnd = charStart + rawWord.length;

            const normalized = normalizeWord(rawWord);
            if (normalized.length === 0) continue; // Skip pure punctuation

            tokens.push({
                word: normalized,
                rawWord: rawWord,
                itemIndex: itemIdx,
                charStart: charStart,
                charEnd: charEnd,
                globalIndex: globalIndex,
            });

            globalIndex++;
        }
    }

    return tokens;
}

// ============================================================================
// FUNCTION 4: tokenizeNoteText
// ============================================================================

/**
 * Extracts normalized words from a note's quote text
 * 
 * @param noteText - The note.quote string from the LLM
 * @returns Array of normalized words
 */
export function tokenizeNoteText(noteText: string): string[] {
    return noteText
        .split(/\s+/)
        .map(w => normalizeWord(w))
        .filter(w => w.length > 0);
}

// ============================================================================
// FUNCTION 5: findBestMatch (METHOD 3's MULTIPLE ANCHORS + BIDIRECTIONAL SCAN)
// ============================================================================

/**
 * Finds the best fuzzy word match for a note's text within a page's extracted words
 * 
 * STRATEGY:
 * 1. Try multiple anchor words (word[0], word[1], word[2]) to handle common first words
 * 2. For each anchor found in the PDF, scan BACKWARD and FORWARD
 * 3. Score based on match ratio and word density
 * 4. Return the best candidate above minimum thresholds
 * 
 * @param pageWords - Words extracted from PDF page
 * @param noteWords - Words extracted from note quote
 * @returns Best match result, or null if no good match found
 */
export function findBestMatch(pageWords: WordToken[], noteWords: string[]): MatchResult | null {
    if (noteWords.length === 0 || pageWords.length === 0) return null;

    // Configuration thresholds
    const MIN_MATCH_RATIO = 0.45;          // Must match at least 45% of note words
    const MAX_WINDOW_MULTIPLIER = 2.5;     // PDF span can't be more than 2.5x note length
    const MAX_SKIP_GAP = 4;                // Max page words to skip between consecutive matches

    let bestResult: MatchResult | null = null;
    let bestScore = 0;

    // MULTIPLE ANCHOR STRATEGY: Try word[0], word[1], word[2] as anchors
    // This solves the "common first word" problem ("The", "A", "In", etc.)
    const anchorIndices: number[] = [0];
    if (noteWords.length > 2) anchorIndices.push(1);
    if (noteWords.length > 4) anchorIndices.push(2);

    for (const anchorNoteIdx of anchorIndices) {
        const anchorWord = noteWords[anchorNoteIdx];

        // Find every position in pageWords where this anchor matches
        for (let anchorPageIdx = 0; anchorPageIdx < pageWords.length; anchorPageIdx++) {
            if (!fuzzyWordMatch(pageWords[anchorPageIdx].word, anchorWord)) continue;

            // Found an anchor — now scan BACKWARD and FORWARD from this position

            const matchedWords: WordToken[] = [pageWords[anchorPageIdx]];
            let matchedCount = 1;

            // --- BACKWARD SCAN (for words before the anchor in the note) ---
            let backNoteIdx = anchorNoteIdx - 1;
            let backPageIdx = anchorPageIdx - 1;
            // Limit backward search to avoid scanning the entire page
            const backLimit = Math.max(0, anchorPageIdx - Math.ceil(anchorNoteIdx * MAX_WINDOW_MULTIPLIER));

            while (backNoteIdx >= 0 && backPageIdx >= backLimit) {
                if (fuzzyWordMatch(pageWords[backPageIdx].word, noteWords[backNoteIdx])) {
                    matchedWords.unshift(pageWords[backPageIdx]); // Add to start
                    matchedCount++;
                    backNoteIdx--;
                }
                backPageIdx--;
            }

            // --- FORWARD SCAN (for words after the anchor in the note) ---
            let fwdNoteIdx = anchorNoteIdx + 1;
            let fwdPageIdx = anchorPageIdx + 1;
            const fwdLimit = Math.min(
                pageWords.length,
                anchorPageIdx + Math.ceil((noteWords.length - anchorNoteIdx) * MAX_WINDOW_MULTIPLIER)
            );

            let consecutiveSkips = 0;

            while (fwdNoteIdx < noteWords.length && fwdPageIdx < fwdLimit) {
                if (fuzzyWordMatch(pageWords[fwdPageIdx].word, noteWords[fwdNoteIdx])) {
                    matchedWords.push(pageWords[fwdPageIdx]);
                    matchedCount++;
                    fwdNoteIdx++;
                    consecutiveSkips = 0; // Reset skip counter
                } else {
                    consecutiveSkips++;

                    // If too many consecutive skips, try skipping a note word instead
                    if (consecutiveSkips > MAX_SKIP_GAP) {
                        // Check if the NEXT note word matches this page word
                        if (fwdNoteIdx + 1 < noteWords.length &&
                            fuzzyWordMatch(pageWords[fwdPageIdx].word, noteWords[fwdNoteIdx + 1])) {
                            // Skip the current note word, match the next one
                            fwdNoteIdx++; // Skip unmatched note word
                            matchedWords.push(pageWords[fwdPageIdx]);
                            matchedCount++;
                            fwdNoteIdx++; // Move past the matched word
                            consecutiveSkips = 0;
                        } else {
                            // Can't recover — stop extending this candidate
                            break;
                        }
                    }
                }
                fwdPageIdx++;
            }

            // --- SCORE THIS CANDIDATE ---
            const matchRatio = matchedCount / noteWords.length;

            // Must meet minimum match ratio
            if (matchRatio < MIN_MATCH_RATIO) continue;

            // Calculate span (distance from first to last matched word)
            const firstMatched = matchedWords[0];
            const lastMatched = matchedWords[matchedWords.length - 1];
            const spanLength = lastMatched.globalIndex - firstMatched.globalIndex + 1;

            // Span must not be too spread out
            if (spanLength > noteWords.length * MAX_WINDOW_MULTIPLIER) continue;

            // Calculate density: how tightly packed are the matches?
            const density = matchedCount / Math.max(spanLength, 1);

            // Final score: weighted combination of match ratio and density
            const score = (matchRatio * 0.7) + (density * 0.3);

            // Keep the best result
            if (score > bestScore) {
                bestScore = score;
                bestResult = {
                    matchedWords: matchedWords,
                    score: score,
                    matchRatio: matchRatio,
                    startWordIndex: firstMatched.globalIndex,
                    endWordIndex: lastMatched.globalIndex,
                };
            }
        }
    }

    return bestResult;
}

// ============================================================================
// FUNCTION 6: fuzzyFindInPage (ORCHESTRATOR)
// ============================================================================

/**
 * Searches for a note's quoted text in the PDF using fuzzy word matching
 * Tries the target page first, then page-1, then page+1
 * 
 * @param pdfDoc - PDFDocumentProxy from PDF.js
 * @param targetPage - 1-indexed page number from the note
 * @param noteText - The note's quote text
 * @param numPages - Total pages in the PDF
 * @returns FuzzySearchResult with page number and match (or null if fallback)
 */
export async function fuzzyFindInPage(
    pdfDoc: any,
    targetPage: number,
    noteText: string,
    numPages: number
): Promise<FuzzySearchResult> {

    const noteWords = tokenizeNoteText(noteText);

    // If note text is too short to match meaningfully, fallback to navigation
    if (noteWords.length < 2) {
        return { pageNumber: targetPage, match: null };
    }

    // Track pages searched to avoid redundant processing as we expand the radius
    const searchedPages = new Set<number>();

    // Helper: Internal function to search a specific page and track it
    const trySearchOnPage = async (pageNum: number): Promise<MatchResult | null> => {
        if (pageNum < 1 || pageNum > numPages || searchedPages.has(pageNum)) return null;

        searchedPages.add(pageNum);
        try {
            const page = await pdfDoc.getPage(pageNum);
            const textContent = await page.getTextContent();
            const pageWords = tokenizeTextItems(textContent.items);
            if (pageWords.length === 0) return null;

            const match = findBestMatch(pageWords, noteWords);
            // Accept matches with score ≥ 0.40
            if (match !== null && match.score >= 0.40) return match;
        } catch (err) {
            // Silently fail for individual page errors to allow the loop to continue
        }
        return null;
    };

    // TIER 1: Target Page (Highest probability)
    let match = await trySearchOnPage(targetPage);
    if (match) return { pageNumber: targetPage, match };

    // TIER 2: Immediate Neighbors (±1)
    for (const p of [targetPage - 1, targetPage + 1]) {
        match = await trySearchOnPage(p);
        if (match) return { pageNumber: p, match };
    }

    // TIER 3: Extended Neighbors (±2)
    for (const p of [targetPage - 2, targetPage + 2]) {
        match = await trySearchOnPage(p);
        if (match) return { pageNumber: p, match };
    }

    // TIER 4: Full Document Scan (Deep Scan)
    // Last resort search from beginning to end
    for (let p = 1; p <= numPages; p++) {
        match = await trySearchOnPage(p);
        if (match) return { pageNumber: p, match };
    }

    // No match found anywhere — fallback to just navigating to the target page
    return { pageNumber: targetPage, match: null };
}
