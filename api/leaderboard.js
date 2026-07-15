import { kv, WINDOWS, bucketFor } from './_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });

  const win = req.query.window;
  if (!WINDOWS.includes(win)) return res.status(400).json({ error: 'invalid window' });
  const limit = Math.min(Number.parseInt(req.query.limit, 10) || 20, 100);
  const playerId = req.query.playerId || null;

  const bucket = bucketFor(win);
  const zkey = 'lb:' + bucket, bestKey = 'lb:' + bucket + ':bestrun';

  const raw = await kv.zrange(zkey, 0, limit - 1, { rev: true, withScores: true });
  const top = [];
  for (let i = 0; i < raw.length; i += 2) {
    const pid = raw[i], score = raw[i + 1];
    const player = await kv.hgetall('player:' + pid);
    const runId = await kv.hget(bestKey, pid);
    top.push({ rank: i / 2 + 1, playerId: pid, displayName: (player && player.displayName) || 'Player', heightM: score, runId: runId || null });
  }

  let you = null;
  if (playerId) {
    const r = await kv.zrevrank(zkey, playerId);
    if (r !== null) {
      const score = await kv.zscore(zkey, playerId);
      const runId = await kv.hget(bestKey, playerId);
      you = { rank: r + 1, heightM: score, runId: runId || null };
    }
  }

  const totalPlayers = await kv.zcard(zkey);
  return res.status(200).json({ window: win, bucket, top, you, totalPlayers });
}
