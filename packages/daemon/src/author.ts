export const AUTHOR_ENV = 'VIBE3D_AUTHOR';
export const MAX_AUTHOR_LENGTH = 80;

export function currentAuthor(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const raw = env[AUTHOR_ENV]?.trim();
  if (!raw) return undefined;
  return raw.slice(0, MAX_AUTHOR_LENGTH);
}
