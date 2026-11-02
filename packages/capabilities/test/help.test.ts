import { describe, expect, it } from 'vitest';
import { type ParamDoc, paramDocs } from '../src/help';

const names = (docs: ParamDoc[] = [], prefix = ''): string[] =>
  docs.flatMap((doc) => [`${prefix}${doc.name}`, ...names(doc.fields, `${prefix}${doc.name}.`)]);

describe('paramDocs nested fields', () => {
  it('expands clip into its fields, including track items', () => {
    const clip = paramDocs('animation.define').find((doc) => doc.name === 'clip');
    const all = names(clip?.fields);
    for (const field of [
      'type',
      'loop',
      'duration',
      'tracks[].path',
      'tracks[].interp',
      'tracks[].keys[].t',
    ]) {
      expect(all).toContain(field);
    }
  });

  it('describes the clip object itself', () => {
    const clip = paramDocs('animation.define').find((doc) => doc.name === 'clip');
    expect(clip?.description).toBeTruthy();
  });
});
