import { describe, expect, it } from 'vitest';
import { parseArgs } from '../src/args';
import { booleanFromFlags, decalFromFlags } from '../src/decal-args';

const flags = (...argv: string[]) => parseArgs(argv).flags;

describe('decal create flags', () => {
  it('文字贴花：参数直通，未给的交给 spec 默认值', () => {
    const params = decalFromFlags(flags('--text', '站前路', '--at', '0,2,0.5'));
    expect(params).toMatchObject({ text: '站前路', position: [0, 2, 0.5] });
    expect(params.width).toBeUndefined();
    expect(params.height).toBeUndefined();
    expect(params.imageSha).toBeUndefined();
  });

  it('图片贴花：--image-sha 与尺寸、旋转、对齐', () => {
    const params = decalFromFlags(
      flags('--image-sha', 'a'.repeat(64), '--width', '3', '--height', '1.5', '--rotation', '0,90,0'),
    );
    expect(params).toMatchObject({
      imageSha: 'a'.repeat(64),
      width: 3,
      height: 1.5,
      rotation: [0, 90, 0],
    });
  });

  it('颜色 / 背景 / 字号 / 粗体 / 挂父节点', () => {
    const params = decalFromFlags(
      flags(
        '--text',
        'X',
        '--color',
        '#ffcc00',
        '--background',
        '#000000cc',
        '--font-size',
        '96',
        '--bold',
        '--parent',
        'n_ab12cd34',
      ),
    );
    expect(params).toMatchObject({
      color: '#ffcc00',
      background: '#000000cc',
      fontSize: 96,
      bold: true,
      parent: 'n_ab12cd34',
    });
  });

  it('缺 text 与 image-sha 时报错', () => {
    expect(() => decalFromFlags(flags('--at', '0,1,0'))).toThrow(/--text/);
  });

  it('同时给 text 与 image-sha 时报错', () => {
    expect(() => decalFromFlags(flags('--text', 'A', '--image-sha', 'b'.repeat(64)))).toThrow(/二选一/);
  });
});

describe('mesh boolean flags', () => {
  it('默认 subtract 并删除工具体', () => {
    expect(booleanFromFlags(flags())).toMatchObject({ op: 'subtract', deleteTool: true });
  });

  it('--op union / --keep-tool', () => {
    expect(booleanFromFlags(flags('--op', 'union', '--keep-tool'))).toMatchObject({
      op: 'union',
      deleteTool: false,
    });
  });

  it('未知 op 报错', () => {
    expect(() => booleanFromFlags(flags('--op', 'carve'))).toThrow(/subtract/);
  });
});
