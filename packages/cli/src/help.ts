import {
  CAPABILITIES,
  CLI_COMMANDS,
  type CapabilityName,
  type CliSpec,
  type ParamDoc,
  defOf,
  describeCapability,
  fieldAt,
  kebab,
  normalized,
  objectShape,
  positionalOf,
  usageOf,
} from '@vibebyte/vibe3d-capabilities';
import { Vibe3DError } from '@vibebyte/vibe3d-client';
import type { z } from 'zod';
import { commandOf } from './exec';

const LOCAL = ['daemon', 'call <method> --params <json> [--room <id>]', 'job wait <jobId> [--timeout <秒>]'];

function isRequired(schema: z.ZodTypeAny | undefined): boolean {
  if (!schema) return false;
  let current = schema;
  for (let i = 0; i < 6; i += 1) {
    const def = defOf(current);
    if (def.typeName === 'ZodOptional' || def.typeName === 'ZodDefault') return false;
    if (def.typeName === 'ZodEffects' && def.schema) {
      current = def.schema as z.ZodTypeAny;
      continue;
    }
    return true;
  }
  return true;
}

function docsOf(params: readonly ParamDoc[]): ParamDoc[] {
  return params.flatMap((param) => [param, ...docsOf(param.fields ?? [])]);
}

function findParam(params: readonly ParamDoc[], field: string): ParamDoc | undefined {
  const want = normalized(field.replace(/\[\]$/, ''));
  return docsOf(params).find((param) => normalized(param.name.replace(/\[\]$/, '')) === want);
}

function formatParam(
  param: ParamDoc,
  label: string,
  cliDefault?: unknown,
  requiredOverride?: boolean,
): string {
  const required = requiredOverride ?? (cliDefault !== undefined ? false : param.required);
  const bits = [required ? '必填' : '可选'];
  if (param.values && param.values.length > 0)
    bits.push(param.values.map((value) => String(value)).join(' | '));
  else if (param.type) bits.push(param.type);
  if (cliDefault !== undefined) bits.push(`CLI 默认 ${JSON.stringify(cliDefault)}`);
  else if (param.default !== undefined) bits.push(`默认 ${JSON.stringify(param.default)}`);
  if (param.description) bits.push(param.description);
  return `  ${label}  ${bits.join('  ')}`;
}

function renderFields(fields: readonly ParamDoc[], indent: string, lines: string[]): void {
  for (const field of fields) {
    const child = field.name.replace(/\[\]$/, '');
    const bits = [field.type, field.values?.join(' | '), field.description].filter(Boolean);
    if (field.default !== undefined) bits.push(`默认 ${JSON.stringify(field.default)}`);
    lines.push(`${indent}${child}  ${bits.join('  ')}`);
    if (field.fields && field.fields.length > 0) {
      renderFields(field.fields, `${indent}  `, lines);
    }
  }
}

function detail(tokens: string[]): string {
  const hit = commandOf(tokens);
  const row = hit ? CLI_COMMANDS.find((item) => item.command === hit.command) : undefined;
  if (!row || !hit || hit.positionals.length > 0) {
    throw new Vibe3DError('E_INVALID_PARAMS', `未知命令：${tokens.join(' ')}`);
  }
  const spec = CAPABILITIES[hit.capability];
  const cli = spec.cli as CliSpec;
  const shape = objectShape(spec.input) ?? {};
  const doc = describeCapability(hit.capability as CapabilityName);
  const positional = positionalOf(spec);
  const lines = [`vibe3d ${usageOf(hit.capability)}`];
  if (row.synonyms.length > 0) lines.push(`同义：${row.synonyms.join('，')}`);
  lines.push('', `${doc.title}（能力：${doc.capability}）`, '', '位置参数');
  for (const field of positional) {
    const param = findParam(doc.params, field);
    const schemaReq = isRequired(fieldAt(spec.input, field)) && !(field in (cli.defaults ?? {}));
    lines.push(param ? formatParam(param, field, cli.defaults?.[field], schemaReq) : `  ${field}`);
  }
  if (cli.command === 'scene import') lines.push('  file  必填  本地 SceneDoc 文件');
  lines.push('', '参数');
  const positionalNames = new Set(positional.map((field) => normalized(field)));
  for (const param of doc.params) {
    const bare = param.name.replace(/\[\]$/, '');
    if (positionalNames.has(normalized(bare))) continue;
    const canonical = Object.keys(shape).find((key) => normalized(key) === normalized(bare)) ?? bare;
    if (cli.command === 'scene import' && canonical === 'doc') continue;
    const flag = `--${kebab(canonical)}`;
    lines.push(formatParam(param, flag, cli.defaults?.[canonical]));
    renderFields(param.fields ?? [], '    ', lines);
  }
  for (const [flag, path] of Object.entries(cli.aliases ?? {})) {
    const target = path
      .split('.')
      .map((part) => kebab(part))
      .join('.');
    lines.push(`别名：--${flag} → --${target}`);
  }
  lines.push('', '示例', `  vibe3d ${row.example}`, '');
  return lines.join('\n');
}

/** 不带路径时列出全部命令；带命令路径时打印该命令的参数说明。 */
export function helpText(path?: string[]): string {
  const tokens = path?.filter((part) => part !== 'help' && !part.startsWith('-')) ?? [];
  if (tokens.length === 0) {
    const lines = ['vibe3d', '', ...LOCAL, ''];
    for (const row of CLI_COMMANDS) {
      const doc = describeCapability(row.capability as CapabilityName);
      lines.push(row.usage, `  ${doc.title}`);
    }
    lines.push('');
    return lines.join('\n');
  }
  return detail(tokens);
}
