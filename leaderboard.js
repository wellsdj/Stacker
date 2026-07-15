(function () {
  'use strict';
  const PID_KEY = 'city_player_id', NAME_KEY = 'city_display_name';

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0, v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function ensurePlayerId() {
    let id = localStorage.getItem(PID_KEY);
    if (!id) { id = uuid(); localStorage.setItem(PID_KEY, id); }
    let name = localStorage.getItem(NAME_KEY);
    if (!name) { name = 'Player-' + id.slice(0, 4); localStorage.setItem(NAME_KEY, name); }
    return { id, name };
  }

  async function submitRun(payload) {
    const { id, name } = ensurePlayerId();
    try {
      const res = await fetch('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: id, displayName: name, clientTs: Date.now(), ...payload }),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (e) { return null; }
  }

  async function fetchWindow(win) {
    const { id } = ensurePlayerId();
    try {
      const res = await fetch('/api/leaderboard?window=' + win + '&limit=20&playerId=' + encodeURIComponent(id));
      if (!res.ok) return null;
      return await res.json();
    } catch (e) { return null; }
  }

  function navClick() { if (window.playSfx && window.audioNav) window.playSfx(window.audioNav); }

  // ---------- Stats modal (4 tabs: daily/weekly/monthly/all-time) ----------
  const WINDOWS = [
    { id: 'daily', label: 'Daily' }, { id: 'weekly', label: 'Weekly' },
    { id: 'monthly', label: 'Monthly' }, { id: 'alltime', label: 'All-time' },
  ];
  let activeWindow = 'daily';
  let modalEl, tabsEl, listEl, youEl, built = false;

  function ensureModal() {
    if (built) return;
    modalEl = document.getElementById('statsModal');
    tabsEl = modalEl.querySelector('.statsTabs');
    listEl = modalEl.querySelector('.statsList');
    youEl = modalEl.querySelector('.statsYou');
    WINDOWS.forEach((w) => {
      const btn = document.createElement('button');
      btn.className = 'statsTab'; btn.textContent = w.label; btn.dataset.win = w.id;
      btn.addEventListener('click', () => { navClick(); activeWindow = w.id; renderTabs(); loadActive(); });
      tabsEl.appendChild(btn);
    });
    document.getElementById('statsClose').addEventListener('click', () => { navClick(); closeStatsModal(); });
    built = true;
  }

  function renderTabs() {
    [...tabsEl.children].forEach((b) => b.classList.toggle('active', b.dataset.win === activeWindow));
  }

  async function loadActive() {
    listEl.innerHTML = '<div class="statsMsg">Loading…</div>';
    youEl.textContent = '';
    const data = await fetchWindow(activeWindow);
    if (!data) { listEl.innerHTML = '<div class="statsMsg">Couldn’t load the leaderboard.</div>'; return; }
    const { id } = ensurePlayerId();
    listEl.innerHTML = '';
    if (!data.top.length) {
      listEl.innerHTML = '<div class="statsMsg">No runs yet — be the first!</div>';
    } else {
      for (const row of data.top) {
        const div = document.createElement('div');
        div.className = 'statsRow' + (row.playerId === id ? ' me' : '');
        const rank = document.createElement('span'); rank.className = 'statsRank'; rank.textContent = '#' + row.rank;
        const name = document.createElement('span'); name.className = 'statsName'; name.textContent = row.displayName;
        const height = document.createElement('span'); height.className = 'statsHeight'; height.textContent = row.heightM + ' m';
        div.append(rank, name, height);
        if (row.runId) {
          div.classList.add('clickable');
          div.addEventListener('click', () => { navClick(); if (window.LeaderboardViewer3D) window.LeaderboardViewer3D.open(row.runId); });
        }
        listEl.appendChild(div);
      }
    }
    youEl.textContent = data.you
      ? 'Your rank: #' + data.you.rank + ' of ' + data.totalPlayers + ' · ' + data.you.heightM + ' m'
      : 'Play a run to get ranked!';
  }

  function openStatsModal() {
    ensureModal();
    modalEl.classList.remove('hidden');
    renderTabs();
    loadActive();
  }
  function closeStatsModal() { if (modalEl) modalEl.classList.add('hidden'); }

  window.Leaderboard = { ensurePlayerId, submitRun, fetchWindow, openStatsModal, closeStatsModal };

  document.getElementById('statsBtn').addEventListener('click', () => { navClick(); openStatsModal(); });
})();
