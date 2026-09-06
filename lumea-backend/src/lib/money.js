
export const usd = cents =>
  (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
