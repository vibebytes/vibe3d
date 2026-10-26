export interface MemoRuntime<T> {
  get(): Promise<T>;
  reset(): void;
}

export function createMemoRuntime<T>(factory: () => Promise<T>): MemoRuntime<T> {
  let current: Promise<T> | undefined;
  return {
    get() {
      current ??= factory().catch((err: unknown) => {
        current = undefined;
        throw err;
      });
      return current;
    },
    reset() {
      current = undefined;
    },
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
