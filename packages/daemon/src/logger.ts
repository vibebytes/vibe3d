type Level = 'debug' | 'info' | 'warn' | 'error';

const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export interface Logger {
  debug(fields: Record<string, unknown>, msg?: string): void;
  info(fields: Record<string, unknown>, msg?: string): void;
  warn(fields: Record<string, unknown>, msg?: string): void;
  error(fields: Record<string, unknown>, msg?: string): void;
  child(fields: Record<string, unknown>): Logger;
}

export function createLogger(level: Level = 'info', base: Record<string, unknown> = {}): Logger {
  const emit = (lvl: Level, fields: Record<string, unknown>, msg?: string): void => {
    if (ORDER[lvl] < ORDER[level]) return;
    const line = JSON.stringify({ ts: new Date().toISOString(), level: lvl, msg, ...base, ...fields });
    if (lvl === 'error' || lvl === 'warn') process.stderr.write(`${line}\n`);
    else process.stdout.write(`${line}\n`);
  };
  return {
    debug: (f, m) => emit('debug', f, m),
    info: (f, m) => emit('info', f, m),
    warn: (f, m) => emit('warn', f, m),
    error: (f, m) => emit('error', f, m),
    child: (f) => createLogger(level, { ...base, ...f }),
  };
}
