import { type SceneDoc, sceneDocSchema } from '@vibebyte/vibe3d-protocol';

export function parseSceneDoc(text: string, filename: string): SceneDoc {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new Error(`${filename} 不是合法 JSON：${(error as Error).message}`);
  }
  const parsed = sceneDocSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    if (!issue) throw new Error(`${filename} 文档结构不合法`);
    const path = issue.path.length ? issue.path.join('.') : '(root)';
    throw new Error(`${filename} 文档结构不合法：${path} ${issue.message}`);
  }
  return parsed.data;
}

export async function readSceneDocFile(path: string): Promise<SceneDoc> {
  const { readFile } = await import('node:fs/promises');
  const { basename } = await import('node:path');
  return parseSceneDoc(await readFile(path, 'utf8'), basename(path));
}
