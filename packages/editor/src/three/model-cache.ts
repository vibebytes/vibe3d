export interface ModelCache<T> {
  load(sha: string, url: string): Promise<T>;
  clear(sha?: string): void;
}

export function createModelCache<T>(fetch: (sha: string, url: string) => Promise<T>): ModelCache<T> {
  const entries = new Map<string, Promise<T>>();

  function load(sha: string, url: string): Promise<T> {
    const hit = entries.get(sha);
    if (hit) return hit;
    const promise = fetch(sha, url);
    entries.set(sha, promise);
    promise.catch(() => entries.delete(sha));
    return promise;
  }

  return {
    load,
    clear(sha?: string) {
      if (sha === undefined) entries.clear();
      else entries.delete(sha);
    },
  };
}
