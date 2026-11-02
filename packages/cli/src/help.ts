import {
  CLI_COMMANDS,
  type CapabilityName,
  describeCapability,
  usageOf,
} from '@vibebyte/vibe3d-capabilities';
import { Vibe3DError } from '@vibebyte/vibe3d-client';
import { commandOf } from './exec';

const LOCAL = ['daemon', 'call <method> --params <json> [--room <id>]', 'job wait <jobId> [--timeout <秒>]'];

function detail(command: string): string {
  const row = CLI_COMMANDS.find((item) => item.command === command);
  const hit = commandOf(command.split(' '));
  if (!row || !hit) throw new Vibe3DError('E_INVALID_PARAMS', `未知命令：${command}`);
  const doc = describeCapability(hit.capability as CapabilityName);
  const lines = [usageOf(hit.capability), '', `${doc.title}（能力：${doc.capability}）`, '', '参数'];
  for (const param of doc.params) {
    const bits = [param.required ? '必填' : '可选', param.type, param.description].filter(Boolean);
    lines.push(`  ${param.name}  ${bits.join('  ')}`);
    for (const field of param.fields ?? []) {
      lines.push(`    ${field.name}  ${field.description ?? field.type ?? ''}`);
    }
  }
  if (row.synonyms.length > 0) lines.push('', `同义：${row.synonyms.join('，')}`);
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
      lines.push(`${row.usage}`);
      lines.push(`  ${doc.title}`);
    }
    lines.push('');
    return lines.join('\n');
  }
  return detail(command);
}
