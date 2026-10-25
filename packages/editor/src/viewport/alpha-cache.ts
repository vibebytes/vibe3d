export interface AlphaRendererOptions {
  antialias: boolean;
  alpha: boolean;
  preserveDrawingBuffer: boolean;
}

export function alphaRendererOptions(samples: number): AlphaRendererOptions {
  return { antialias: samples > 0, alpha: true, preserveDrawingBuffer: false };
}

export interface AlphaRendererCache<T> {
  get(): T;
  release(): void;
}

export function alphaRendererCache<T>(create: () => T, destroy: (value: T) => void): AlphaRendererCache<T> {
  let value: T | null = null;
  return {
    get(): T {
      if (value === null) value = create();
      return value;
    },
    release(): void {
      if (value !== null) {
        destroy(value);
        value = null;
      }
    },
  };
}
