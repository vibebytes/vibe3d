export interface ParamIssue {
  path: string;
  message: string;
}

interface RawIssue {
  path: ReadonlyArray<string | number>;
  message: string;
  unionErrors?: ReadonlyArray<{ issues: ReadonlyArray<RawIssue> }>;
}

const MAX_LEAVES = 6;

const expand = (issue: RawIssue, depth = 0): RawIssue[] => {
  const branches = issue.unionErrors;
  if (!branches || branches.length === 0 || depth > 4) return [issue];
  const tried = branches.map((branch) => ({
    leaves: branch.issues.flatMap((inner) => expand(inner as RawIssue, depth + 1)),
  }));
  const best = Math.min(...tried.map((entry) => entry.leaves.length));
  const chosen = tried.filter((entry) => entry.leaves.length === best);
  const leaves = chosen.flatMap((entry) => entry.leaves);
  return leaves.length > 0 ? leaves : [issue];
};

const rank = (issue: RawIssue): number => {
  const required = /^required$/i.test(issue.message.trim()) ? 2 : /invalid literal/i.test(issue.message) ? -1 : 0;
  return required * 100 + issue.path.length;
};

const OPTION_LIST = /^Invalid discriminator value\. Expected (.+)$/s;

const compact = (message: string): string => {
  const match = OPTION_LIST.exec(message);
  if (!match) return message;
  const options = (match[1] ?? '')
    .split('|')
    .map((part) => part.trim().replace(/^'|'$/g, ''))
    .filter(Boolean);
  if (options.length <= 3) return message;
  return `discriminator 不在允许值内（可选 ${options.length} 项：${options.slice(0, 4).join(' / ')} …，完整清单见 schema）`;
};

export const toIssues = (issues: ReadonlyArray<RawIssue>): ParamIssue[] => {
  const seen = new Set<string>();
  const out: ParamIssue[] = [];
  const leaves = issues.flatMap((issue) => expand(issue)).sort((a, b) => rank(b) - rank(a));
  for (const leaf of leaves) {
    const path = leaf.path.join('.');
    const key = `${path}|${leaf.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ path, message: compact(leaf.message) });
    if (out.length >= MAX_LEAVES) break;
  }
  return out;
};

export const describeIssues = (issues: ReadonlyArray<RawIssue>): string => {
  const list = toIssues(issues);
  return list.length ? list.map((issue) => `${issue.path || '(body)'}: ${issue.message}`).join('; ') : '';
};
