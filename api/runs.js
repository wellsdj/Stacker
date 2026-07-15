import { nanoid } from 'nanoid';
import { kv, WINDOWS, bucketFor, TTL_SECONDS } from './_lib.js';

const MAX_BLOCKS = 5000;
const BASE_M = 10, STEP_M = 5, BH = 56;
const BH_PER_M = BH / STEP_M;

// recompute the run's height from its block list as a basic anti-cheat check —
// mirrors heightM()/boostExtra() in index.html (base + per-floor + 5x-bonus meters)
function expectedHeight(blocks) {
  let bonus = 0;
  for (const b of blocks) if (b.h) bonus += (b.h - BH);
  return BASE_M + STEP_M * blocks.length + Math.round(bonus / BH_PER_M);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  const { playerId, displayName, heightM, skinId, perfectStreakMax, blocks, clientTs } = req.body || {};
  if (!playerId || typeof heightM !== 'number' || !Array.isArray(blocks)) {
    return res.status(400).json({ error: 'invalid payload' });
  }
  if (blocks.length > MAX_BLOCKS) return res.status(400).json({ error: 'too many blocks' });
  if (Math.abs(expectedHeight(blocks) - heightM) > 1) {
    return res.status(400).json({ error: 'height mismatch' });
  }

  const runId = nanoid();
  const ts = Date.now();
  const safeName = String(displayName || ('Player-' + playerId.slice(0, 4))).slice(0, 24);

  const run = {
    runId, playerId, displayName: safeName, heightM,
    skinId: skinId || null, perfectStreakMax: perfectStreakMax || 0,
    blocks, ts, clientTs: clientTs || null,
  };
  await kv.set('run:' + runId, JSON.stringify(run));
  await kv.hset('player:' + playerId, { displayName: safeName, lastTs: ts });
  await kv.hincrby('player:' + playerId, 'totalRuns', 1);

  const rank = {}, totalPlayers = {};
  for (const win of WINDOWS) {
    const bucket = bucketFor(win);
    const zkey = 'lb:' + bucket, bestKey = 'lb:' + bucket + ':bestrun';
    const current = await kv.zscore(zkey, playerId);
    if (current === null || heightM > current) {
      await kv.zadd(zkey, { score: heightM, member: playerId });
      await kv.hset(bestKey, { [playerId]: runId });
      const ttl = TTL_SECONDS[win];
      if (ttl) { await kv.expire(zkey, ttl); await kv.expire(bestKey, ttl); }
    }
    const r = await kv.zrevrank(zkey, playerId);
    rank[win] = r === null ? null : r + 1;
    totalPlayers[win] = await kv.zcard(zkey);
  }

  return res.status(200).json({ runId, rank, totalPlayers });
}
