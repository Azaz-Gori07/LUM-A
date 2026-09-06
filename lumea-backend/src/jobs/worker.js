
import { logger } from '../lib/logger.js';
import { processQueue } from '../services/mailer.js';

async function tick(){
  try{
    const sent = await processQueue();
    if(sent) logger.info(`worker: delivered ${sent} message(s)`);
  }catch(err){
    logger.error('worker: tick failed:', err.message);
  }
}

setInterval(tick, 4000);
tick();
logger.info('mailer worker running — queued messages go out every 4 seconds (stub transport).');
