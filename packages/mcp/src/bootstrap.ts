export function createMemoRuntime<T>(factory: () => Promise<T>): () => Promise<T> {
  let current: Promise<T> | undefined;
  return () => {
    current ??= factory().catch((err: unknown) => {
      current = undefined;
      throw err;
    });
    return current;
  };
}

export function prewarm<T>(get: () => Promise<T>, onError?: (err: unknown) => void): void {
  void get().then(
    () => undefined,
    (err: unknown) => {
      onError?.(err);
    },
  );
}
