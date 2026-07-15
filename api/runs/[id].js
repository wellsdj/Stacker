import { kv } from '../_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });

  const { id } = req.query;
  const raw = await kv.get('run:' + id);
  if (!raw) return res.status(404).json({ error: 'not found' });

  const run = typeof raw === 'string' ? JSON.parse(raw) : raw;
  return res.status(200).json(run);
}
