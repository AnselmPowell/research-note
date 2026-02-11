interface CachedMetadata {
  title: string;
  author: string;
  subject: string;
  harvardReference?: string;
  publisher?: string;
  categories?: string[];
  timestamp: number;
}

const CACHE_PREFIX = 'ai-metadata-cache:';
const CACHE_EXPIRY_DAYS = 14;

// Use Web Crypto API for reliable hashing
const generateHash = async (text: string): Promise<string> => {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16); // First 16 chars
  } catch (error) {
    console.warn('[MetadataCache] Crypto API failed, using fallback hash');
    // Fallback to simple hash
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }
};

export const getCachedMetadata = async (firstFourPagesText: string): Promise<CachedMetadata | null> => {
  try {
    const hashKey = await generateHash(firstFourPagesText);
    const cacheKey = CACHE_PREFIX + hashKey;
    const cached = localStorage.getItem(cacheKey);
    if (!cached) return null;

    const parsed = JSON.parse(cached) as CachedMetadata;
    const isExpired = Date.now() - parsed.timestamp > CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

    if (isExpired) {
      localStorage.removeItem(cacheKey);
      return null;
    }

    return parsed;
  } catch (error) {
    console.warn('[MetadataCache] Error reading cache:', error);
    return null;
  }
};

export const setCachedMetadata = async (
  firstFourPagesText: string,
  metadata: {
    title: string;
    author: string;
    subject: string;
    harvardReference?: string;
    publisher?: string;
    categories?: string[];
  }
): Promise<void> => {
  let hashKey = '';
  let cacheKey = '';
  let cacheValue: CachedMetadata | null = null;

  try {
    hashKey = await generateHash(firstFourPagesText);
    cacheKey = CACHE_PREFIX + hashKey;
    cacheValue = {
      ...metadata,
      timestamp: Date.now()
    };

    localStorage.setItem(cacheKey, JSON.stringify(cacheValue));
    console.log('[MetadataCache] Cached metadata for hash:', hashKey);
  } catch (error: any) {
    console.warn('[MetadataCache] Error saving cache:', error);
    // If localStorage is full, try to clean up and retry
    if (error.name === 'QuotaExceededError') {
      cleanupExpiredCache();
      try {
        if (cacheKey && cacheValue) {
          localStorage.setItem(cacheKey, JSON.stringify(cacheValue));
        }
      } catch (retryError) {
        console.error('[MetadataCache] Failed to save even after cleanup:', retryError);
      }
    }
  }
};

export const cleanupExpiredCache = (): void => {
  try {
    const keysToRemove: string[] = [];
    const now = Date.now();

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(CACHE_PREFIX)) {
        try {
          const cached = JSON.parse(localStorage.getItem(key)!) as CachedMetadata;
          const isExpired = now - cached.timestamp > CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
          if (isExpired) {
            keysToRemove.push(key);
          }
        } catch (parseError) {
          // Remove corrupted entries
          keysToRemove.push(key);
        }
      }
    }

    keysToRemove.forEach(key => localStorage.removeItem(key));
    if (keysToRemove.length > 0) {
      console.log('[MetadataCache] Cleaned up', keysToRemove.length, 'expired cache entries');
    }
  } catch (error) {
    console.warn('[MetadataCache] Error during cleanup:', error);
  }
};
