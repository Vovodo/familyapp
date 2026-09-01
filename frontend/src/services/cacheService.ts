/**
 * Ultra-fast in-memory and persistent sessionStorage cache service for instant (0ms) page navigation.
 * Implements SWR (Stale-While-Revalidate) pattern across all family features.
 */

class FastCacheService {
  private memoryCache = new Map<string, any>();

  public get<T>(key: string): T | null {
    if (this.memoryCache.has(key)) {
      return this.memoryCache.get(key) as T;
    }
    try {
      const stored = sessionStorage.getItem(`ailem_cache_${key}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        this.memoryCache.set(key, parsed);
        return parsed as T;
      }
    } catch {
      // Ignore parse error
    }
    return null;
  }

  public set<T>(key: string, data: T): void {
    this.memoryCache.set(key, data);
    try {
      sessionStorage.setItem(`ailem_cache_${key}`, JSON.stringify(data));
    } catch {
      // Ignore storage error
    }
  }

  public remove(key: string): void {
    this.memoryCache.delete(key);
    try {
      sessionStorage.removeItem(`ailem_cache_${key}`);
    } catch {}
  }

  public clear(): void {
    this.memoryCache.clear();
    try {
      const keys = Object.keys(sessionStorage);
      for (const k of keys) {
        if (k.startsWith('ailem_cache_')) {
          sessionStorage.removeItem(k);
        }
      }
    } catch {}
  }

  public clearFamily(familyId: string): void {
    for (const k of Array.from(this.memoryCache.keys())) {
      if (k.includes(familyId)) {
        this.memoryCache.delete(k);
        try {
          sessionStorage.removeItem(`ailem_cache_${k}`);
        } catch {}
      }
    }
  }
}

export const cacheService = new FastCacheService();
