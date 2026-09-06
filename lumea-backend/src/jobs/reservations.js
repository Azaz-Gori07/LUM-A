
import { releaseExpired } from '../services/checkout.js';
import { logger } from '../lib/logger.js';

export function startReservationSweeper(){
  const sweep = () => {
    try{
      const released = releaseExpired();
      if(released) logger.info(`reservations: released ${released} expired order hold(s)`);
    }catch(err){
      logger.error('reservations: sweep failed:', err.message);
    }
  };
  sweep();
  const timer = setInterval(sweep, 60_000);
  timer.unref?.();
  return timer;
}
