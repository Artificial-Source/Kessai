/**
 * Lightweight structured logging system.
 * Stores logs in a circular buffer and persists warn/error to localStorage.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export type LogEntry = {
  timestamp: string
  level: LogLevel
  source: string
  message: string
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

const MAX_BUFFER_SIZE = 500
const STORAGE_KEY = 'kessai-logs'

const minLevel: LogLevel = import.meta.env.DEV ? 'debug' : 'info'

const buffer: LogEntry[] = []

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[minLevel]
}

function addEntry(level: LogLevel, source: string, message: string): void {
  if (!shouldLog(level)) return

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    source,
    message,
  }

  buffer.push(entry)
  if (buffer.length > MAX_BUFFER_SIZE) {
    buffer.splice(0, buffer.length - MAX_BUFFER_SIZE)
  }

  // Persist warn and error to localStorage
  if (level === 'warn' || level === 'error') {
    persistToStorage()
  }
}

function persistToStorage(): void {
  try {
    const persisted = buffer.filter((e) => e.level === 'warn' || e.level === 'error')
    // Keep only last 200 warn/error entries in storage
    const trimmed = persisted.slice(-200)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
  } catch {
    // localStorage may be full or unavailable — ignore silently
  }
}

function formatEntry(entry: LogEntry): string {
  return `[${entry.timestamp}] ${entry.level.toUpperCase().padEnd(5)} [${entry.source}] ${entry.message}`
}

export const logger = {
  debug(source: string, message: string): void {
    addEntry('debug', source, message)
  },

  info(source: string, message: string): void {
    addEntry('info', source, message)
  },

  warn(source: string, message: string): void {
    addEntry('warn', source, message)
  },

  error(source: string, message: string, error?: unknown): void {
    const errorDetail = error ? `: ${error instanceof Error ? error.message : String(error)}` : ''
    addEntry('error', source, message + errorDetail)
  },

  getLogs(): LogEntry[] {
    return [...buffer]
  },

  downloadLogs(): void {
    const lines = buffer.map(formatEntry).join('\n')
    const blob = new Blob([lines], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `kessai-logs-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  },

  clear(): void {
    buffer.length = 0
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // ignore
    }
  },
}
