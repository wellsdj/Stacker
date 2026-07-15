import { kv } from '@vercel/kv';

export { kv };

export const WINDOWS = ['daily', 'weekly', 'monthly', 'alltime'];
export const TTL_SECONDS = { daily: 3 * 86400, weekly: 10 * 86400, monthly: 40 * 86400, alltime: 0 };

function pad(n) { return String(n).padStart(2, '0'); }

// ISO-8601 week number (Monday-start, week containing the year's first Thursday)
function isoWeek(d) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((date - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return date.getUTCFullYear() + '-W' + pad(week);
}

export function bucketFor(win, now = new Date()) {
  switch (win) {
    case 'daily': return 'daily:' + now.getUTCFullYear() + pad(now.getUTCMonth() + 1) + pad(now.getUTCDate());
    case 'weekly': return 'weekly:' + isoWeek(now);
    case 'monthly': return 'monthly:' + now.getUTCFullYear() + pad(now.getUTCMonth() + 1);
    case 'alltime': return 'alltime:all';
    default: throw new Error('bad window ' + win);
  }
}
