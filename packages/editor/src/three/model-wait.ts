interface WaitOptions {
  /** Node ids whose model objects are not in the scene yet. */
  pending: () => string[];
  /** Subset of pending ids whose load already failed. */
  failed?: () => string[];
  intervalMs?: number;
  timeoutMs?: number;
}

/** Resolves once no model is pending; throws when a load failed or the deadline passes. */
export async function waitForModels({
  pending,
  failed = () => [],
  intervalMs = 120,
  timeoutMs = 12_000,
}: WaitOptions): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (let missing = pending(); missing.length > 0; missing = pending()) {
    const bad = failed();
    if (bad.length > 0) throw new Error(`模型资源加载失败：${bad.join(', ')}`);
    if (Date.now() >= deadline) throw new Error(`模型尚未加载完成：${missing.join(', ')}`);
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
