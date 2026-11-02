import {
  CAPABILITIES,
  CLI_COMMANDS,
  type CapabilityName,
  type CliSpec,
  type ParamDoc,
  describeCapability,
  kebab,
  normalized,
  positionalOf,
  usageOf,
} from '@vibebyte/vibe3d-capabilities';
import { Vibe3DError } from '@vibebyte/vibe3d-client';
import { commandOf } from './exec';

const LOCAL = ['daemon', 'call <method> --params <json> [--room <id>]', 'job wait <jobId> [--timeout <秒>]'];

function docsOf(params: readonly ParamDoc[]): ParamDoc[] {
  return params.flatMap((param) => [param, ...docsOf(param.fields ?? [])]);
}

function findParam(params: readonly ParamDoc[], field: string): ParamDoc | undefined {
  const want = normalized(field.replace(/\[\]$/, ''));
  return docsOf(params).find((param) => normalized(param.name.replace(/\[\]$/, '')) === want);
}

function formatParam(param: ParamDoc, label: string, cliDefault?: unknown): string {
  const bits = [param.required ? '必填' : '可选'];
  if (param.values && param.values.length > 0)
    bits.push(param.values.map((value) => String(value)).join(' | '));
  else if (param.type) bits.push(param.type);
  if (cliDefault !== undefined) bits.push(`CLI 默认 ${JSON.stringify(cliDefault)}`);
  else if (param.default !== undefined) bits.push(`默认 ${JSON.stringify(param.default)}`);
  if (param.description) bits.push(param.description);
  return `  ${label}  ${bits.join('  ')}`;
}

function detail(command: string): string {
  const row = CLI_COMMANDS.find((item) => item.command === command);
  const hit = commandOf(command.split(' '));
  if (!row || !hit) throw new Vibe3DError('E_INVALID_PARAMS', `未知命令：${command}`);
  const spec = CAPABILITIES[hit.capability];
  const cli = spec.cli as CliSpec;
  const doc = describeCapability(hit.capability as CapabilityName);
  const positional = positionalOf(spec);
  const lines = [`vibe3d ${usageOf(hit.capability)}`];
  if (row.synonyms.length > 0) lines.push(`同义：${row.synonyms.join('，')}`);
  lines.push('', `${doc.title}（能力：${doc.capability}）`, '', '位置参数');
  for (const field of positional) {
    const param = findParam(doc.params, field);
    lines.push(param ? formatParam(param, field, cli.defaults?.[field]) : `  ${field}`);
  }
  if (cli.command === 'scene import') lines.push('  file  本地 SceneDoc 文件');
  lines.push('', '参数');
  const positionalNames = new Set(positional.map((field) => normalized(field)));
  for (const param of doc.params) {
    const bare = param.name.replace(/\[\]$/, '');
    if (positionalNames.has(normalized(bare))) continue;
    const flag = `--${kebab(bare)}`;
    lines.push(formatParam(param, flag, cli.defaults?.[bare]));
    for (const field of param.fields ?? []) {
      const child = field.name.replace(/\[\]$/, '');
      const bits = [field.type, field.values?.join(' | '), field.description].filter(Boolean);
      if (field.default !== undefined) bits.push(`默认 ${JSON.stringify(field.default)}`);
      lines.push(`    ${child}  ${bits.join('  ')}`);
    }
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
  const command = path?.filter((part) => part !== 'help').join(' ') ?? '';
  if (!command) {
    const lines = ['vibe3d', '', ...LOCAL, ''];
    for (const row of CLI_COMMANDS) {
      const doc = describeCapability(row.capability as CapabilityName);
      lines.push(row.usage, `  ${doc.title}`);
    }
    lines.push('');
    return lines.join('\n');
  }
  return detail(command);
}
