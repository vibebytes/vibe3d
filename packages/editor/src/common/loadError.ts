const LOAD_ERROR_RE =
  /failed to fetch|could not load|dynamically imported module|load failed|fetch failed|net::\s*err_/i;

export function isLoadError(message: string): boolean {
  return LOAD_ERROR_RE.test(message);
}
