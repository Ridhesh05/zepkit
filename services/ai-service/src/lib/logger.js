// Tiny zero-dependency logger. Swap for pino later if needed.
const ts = () => new Date().toISOString();
const line = (level, stream) => (...args) =>
  stream(`[${ts()}] ${level}`, ...args);

export const logger = {
  info: line("INFO ", console.log),
  warn: line("WARN ", console.warn),
  error: line("ERROR", console.error),
  debug: line("DEBUG", process.env.DEBUG ? console.log : () => {}),
};
