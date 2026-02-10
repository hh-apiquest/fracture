import { EventEmitter } from 'events';
import { ILogger, LogLevel } from '@apiquest/types';

/**
 * Logger for fracture runtime and host integrations.
 */
export class Logger implements ILogger {
  private level: LogLevel;
  private component: string;
  private emitter?: EventEmitter;

  constructor(component: string, level: LogLevel = LogLevel.INFO, emitter?: EventEmitter) {
    this.component = component;
    this.level = level;
    this.emitter = emitter;
  }

  createLogger(component: string): Logger {
    return new Logger(component, this.level, this.emitter);
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  error(message: string, ...args: unknown[]): void {
    this.log(LogLevel.ERROR, message, ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    this.log(LogLevel.WARN, message, ...args);
  }

  info(message: string, ...args: unknown[]): void {
    this.log(LogLevel.INFO, message, ...args);
  }

  debug(message: string, ...args: unknown[]): void {
    this.log(LogLevel.DEBUG, message, ...args);
  }

  trace(message: string, ...args: unknown[]): void {
    this.log(LogLevel.TRACE, message, ...args);
  }

  private log(level: LogLevel, message: string, ...args: unknown[]): void {
    if (level > this.level) return;

    const levelNames = ['error', 'warn', 'info', 'debug', 'trace'];
    const levelName = levelNames[level];
    const prefix = `[${this.component}]`;
    const fullMessage = `${prefix} ${message}`;

    const formattedArgs = args.length > 0
      ? ' ' + args.map(a => {
        if (a instanceof Error) {
          return a.message;
        }
        if (typeof a === 'object' && a !== null) {
          try {
            return JSON.stringify(a);
          } catch {
            return String(a);
          }
        }
        return String(a);
      }).join(' ')
      : '';

    const finalMessage = fullMessage + formattedArgs;

    if (this.emitter !== null && this.emitter !== undefined) {
      this.emitter.emit('console', {
        level,
        levelName,
        component: this.component,
        message: finalMessage,
        args,
        timestamp: new Date().toISOString()
      });
    }
  }
}
