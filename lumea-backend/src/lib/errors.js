
export class ApiError extends Error {
  constructor(status, code, message, details){
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const fail = (status, code, message, details) => {
  throw new ApiError(status, code, message, details);
};

export function parse(schema, data){
  const result = schema.safeParse(data);
  if(!result.success){
    fail(422, 'VALIDATION_ERROR', 'Some fields need attention.',
      result.error.issues.map(i => ({ path: i.path.join('.') || '(root)', message: i.message })));
  }
  return result.data;
}

// Async-handler wrapper: catches both sync throws and rejected promises,
// forwarding either to the central error middleware.
export const ah = fn => (req, res, next) => {
  Promise.resolve().then(() => fn(req, res, next)).catch(next);
};

// Strip HTML tags from user-supplied strings to prevent stored XSS.
export function stripHtml(str){
  if(typeof str !== 'string') return str;
  return str.replace(/<[^>]*>/g, '').replace(/&[a-z]+;/gi, '').trim();
}
