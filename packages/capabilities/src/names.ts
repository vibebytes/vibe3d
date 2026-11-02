/** 在小写或数字与后续大写之间断开，下划线换成连字符，再整体转小写。连续大写保持为一段。 */
export function kebab(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/_/g, '-')
    .toLowerCase();
}

/** 去掉大小写和 -/_ 的差别，用来把 flag 配到字段上。 */
export function normalized(name: string): string {
  return name.toLowerCase().replace(/[-_]/g, '');
}
