
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const level = LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info;
const ts = () => new Date().toISOString();

export const logger = {
  debug: (...a) => { if(level <= LEVELS.debug) console.log(`[${ts()}]`, ...a); },
  info:  (...a) => { if(level <= LEVELS.info)  console.log(`[${ts()}]`, ...a); },
  warn:  (...a) => { if(level <= LEVELS.warn)  console.warn(`[${ts()}] WARN`, ...a); },
  error: (...a) => { if(level <= LEVELS.error) console.error(`[${ts()}] ERROR`, ...a); }
};
