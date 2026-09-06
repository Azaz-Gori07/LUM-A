
import { ApiError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

export function notFound(req, res){
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `No route matches ${req.method} ${req.originalUrl}` } });
}

export function errorHandler(err, req, res, next){ // eslint-disable-line no-unused-vars
  if(err instanceof ApiError){
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if(err && err.type === 'entity.parse.failed'){
    return res.status(400).json({ error: { code: 'BAD_JSON', message: 'The request body is not valid JSON.' } });
  }
  logger.error('Unhandled error:', err);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Something slipped a stitch on our side. It has been logged.' } });
}
