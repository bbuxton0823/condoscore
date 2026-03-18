import type { SearchResult, SearchParams } from "@shared/schema";

export interface IStorage {
  cacheSearch(key: string, result: SearchResult): void;
  getCachedSearch(key: string): SearchResult | undefined;
}

export class MemStorage implements IStorage {
  private searchCache: Map<string, { result: SearchResult; timestamp: number }>;

  constructor() {
    this.searchCache = new Map();
  }

  cacheSearch(key: string, result: SearchResult): void {
    this.searchCache.set(key, { result, timestamp: Date.now() });
    // Evict entries older than 15 minutes
    const cutoff = Date.now() - 15 * 60 * 1000;
    for (const [k, v] of this.searchCache.entries()) {
      if (v.timestamp < cutoff) this.searchCache.delete(k);
    }
  }

  getCachedSearch(key: string): SearchResult | undefined {
    const entry = this.searchCache.get(key);
    if (!entry) return undefined;
    // 15-minute TTL
    if (Date.now() - entry.timestamp > 15 * 60 * 1000) {
      this.searchCache.delete(key);
      return undefined;
    }
    return entry.result;
  }
}

export const storage = new MemStorage();
