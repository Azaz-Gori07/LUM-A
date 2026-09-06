
import { env } from './config/env.js';
import { app } from './app.js';
import { startReservationSweeper } from './jobs/reservations.js';
import { logger } from './lib/logger.js';

startReservationSweeper();

const server = app.listen(env.port, () => {
  logger.info(`LUMÉA API listening on http://localhost:${env.port} (${env.isProd ? 'production' : 'development'})`);
});

function shutdown(signal){
  logger.info(`${signal} received — closing gracefully.`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 4000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
