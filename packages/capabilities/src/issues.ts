export interface ParamIssue {
  path: string;
  message: string;
}

export const toIssues = (
  issues: ReadonlyArray<{ path: ReadonlyArray<string | number>; message: string }>,
): ParamIssue[] => issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));

export const describeIssues = (
  issues: ReadonlyArray<{ path: ReadonlyArray<string | number>; message: string }>,
): string => {
  const list = toIssues(issues);
  return list.length ? list.map((issue) => `${issue.path || '(body)'}: ${issue.message}`).join('; ') : '';
};
