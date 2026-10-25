import { describe, expect, it } from 'vitest';
import { describeIssues } from '../src/issues';

type Raw = {
  path: ReadonlyArray<string | number>;
  message: string;
  unionErrors?: { issues: Raw[] }[];
};

const issue = (path: (string | number)[], message: string, unionErrors?: Raw[]): Raw => ({
  path,
  message,
  ...(unionErrors ? { unionErrors: unionErrors.map((inner) => ({ issues: [inner] })) } : {}),
});

describe('describeIssues union expansion', () => {
  it('replaces an opaque geometry union failure with the failing leaf fields', () => {
    const text = describeIssues([
      issue(['ops', 0, 'node', 'geometry'], 'Invalid input', [
        issue(['ops', 0, 'node', 'geometry', 'type'], 'Required'),
        issue(['ops', 0, 'node', 'geometry', 'size'], 'Required'),
      ]),
    ]);
    expect(text).toContain('geometry.size');
    expect(text).toContain('Required');
    expect(text).not.toBe('ops.0.node.geometry: Invalid input');
  });

  it('keeps a plain issue untouched', () => {
    expect(describeIssues([issue(['ops', 0, 'op'], 'Invalid discriminator value')])).toBe(
      'ops.0.op: Invalid discriminator value',
    );
  });

  it('groups repeated leaves instead of repeating the same path', () => {
    const text = describeIssues([
      issue(['ops', 0, 'node', 'geometry'], 'Invalid input', [
        issue(['ops', 0, 'node', 'geometry', 'size'], 'Required'),
        issue(['ops', 0, 'node', 'geometry', 'size'], 'Required'),
      ]),
    ]);
    expect(text.match(/geometry\.size/g)?.length).toBe(1);
  });

  it('caps a long tail so one bad payload cannot flood the message', () => {
    const leaves = Array.from({ length: 9 }, (_, i) =>
      issue(['ops', 0, 'node', 'geometry', 'baked', `k${i}`], 'Required'),
    );
    const text = describeIssues([issue(['ops', 0, 'node', 'geometry'], 'Invalid input', leaves)]);
    expect(text.split('; ').length).toBeLessThanOrEqual(6);
  });
});
