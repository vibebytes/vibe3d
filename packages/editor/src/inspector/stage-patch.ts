import type { Npr, Post } from '@vibebyte/vibe3d-protocol';

type NprPatch = {
  outline?: Npr['outline'] | null;
  rampSteps?: number | null;
  rim?: number | null;
};

type PostPatch = {
  dof?: Post['dof'] | null;
  bloom?: Post['bloom'] | null;
  ssao?: Post['ssao'] | null;
  tonemap?: Post['tonemap'] | null;
};

function merge<T extends object>(current: T | undefined, patch: Record<string, unknown>): T | null {
  const next: Record<string, unknown> = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete next[key];
    else next[key] = value;
  }
  return Object.keys(next).length > 0 ? (next as T) : null;
}

export function patchNpr(current: Npr | undefined, patch: NprPatch): Npr | null {
  return merge<Npr>(current, patch);
}

export function patchPost(current: Post | undefined, patch: PostPatch): Post | null {
  return merge<Post>(current, patch);
}
