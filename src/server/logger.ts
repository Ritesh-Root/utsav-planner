/**
 * Structured JSON logs that Cloud Logging understands. Callers pass counts,
 * hashes and timings only — never the user's text.
 */
export type LogFields = Record<string, string | number | boolean | null | undefined>;

export interface Logger {
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
}

type Severity = 'INFO' | 'WARNING' | 'ERROR';

/** A logger that writes JSON lines, by default to standard output. */
export function createLogger(
  write: (line: string) => void = (line) => {
    process.stdout.write(`${line}\n`);
  },
): Logger {
  const log = (severity: Severity, message: string, fields: LogFields = {}) => {
    write(JSON.stringify({ severity, message, time: new Date().toISOString(), ...fields }));
  };
  return {
    info: (message, fields) => {
      log('INFO', message, fields);
    },
    warn: (message, fields) => {
      log('WARNING', message, fields);
    },
    error: (message, fields) => {
      log('ERROR', message, fields);
    },
  };
}
