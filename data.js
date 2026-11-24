// 資料層。有設定後端網址就讀寫 Google 試算表，沒有就只用本機暫存（原型模式）。
const EVENT = {
  start: '2026-12-25T15:00:00+08:00',
  deadline: '12/20（日）',
  mapUrl: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('南投 耕雲齋民宿'),
};

let ROSTER = [];   // [{ id, name }]
let HONOR = null;  // { id, name }

const Store = (function () {
  // 只有在本機開發時，才允許用 ?api= 臨時指到測試後端。
  const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
  const override = isLocal ? new URLSearchParams(location.search).get('api') : null;
  const apiUrl = override || (typeof CONFIG !== 'undefined' && CONFIG.apiUrl) || '';
  const remote = !!apiUrl;

  let token = null, meId = null, timer = null, pending = null, inflight = null;
  let onStatus = () => {};
  const cacheKey = () => 'itt10:' + meId;

  async function call(action, payload) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 25000);
    try {
      let res;
      if (payload) {
        // text/plain 才不會觸發跨網域預檢，Apps Script 收不到預檢請求。
        res = await fetch(apiUrl, {
          method: 'POST', redirect: 'follow', signal: ctl.signal,
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(Object.assign({ action, token }, payload)),
        });
      } else {
        res = await fetch(apiUrl + '?action=' + action + '&token=' + encodeURIComponent(token), { redirect: 'follow', signal: ctl.signal });
      }
      return await res.json();
    } finally { clearTimeout(t); }
  }

  const readCache = () => { try { return JSON.parse(localStorage.getItem(cacheKey())) || null; } catch (e) { return null; } };
  const writeCache = s => { try { localStorage.setItem(cacheKey(), JSON.stringify(s)); return true; } catch (e) { return false; } };

  // 回傳 { me, state, done }；連結無效回傳 null；連不上後端會丟出錯誤。
  async function init(t) {
    token = t;
    if (!remote) {
      const names = window.LOCAL_ROSTER || ['同學一', '同學二', '同學三', '同學四'];
      ROSTER = names.map((name, i) => ({ id: 'p' + String(i + 1).padStart(2, '0'), name, token: 'demo-' + String(i + 1).padStart(2, '0') }));
      HONOR = ROSTER.find(p => p.name === window.LOCAL_HONOR) || null;
      const me = ROSTER.find(p => p.token === t);
      if (!me) return null;
      meId = me.id;
      return { me: { id: me.id, name: me.name, guestOfHonor: !!HONOR && HONOR.id === me.id }, state: readCache(), done: await progress() };
    }
    if (!t) return null;
    const r = await call('init');
    if (!r.ok) { if (r.error === 'bad_token') return null; throw new Error(r.error); }
    ROSTER = r.roster;
    HONOR = ROSTER.find(p => p.id === r.honorId) || null;
    meId = r.me.id;
    try { localStorage.setItem('itt10:boot:' + t, JSON.stringify({ me: r.me, roster: r.roster, honorId: r.honorId })); } catch (e) {}
    // 這支裝置上有比後端更新、還沒同步上去的內容，就以裝置為準並補傳。
    const cached = readCache();
    let state = r.state;
    if (cached && (!state || (cached.updatedAt || 0) > (state.updatedAt || 0))) { state = cached; save(state); }
    else if (state) writeCache(state); // 記在這支裝置，下次開場不用等
    return { me: r.me, state, done: r.done };
  }

  // 這支裝置開過這條連結的話，不等後端、直接用上次記下來的資料開場。
  function fast(t) {
    if (!remote || !t) return null;
    try {
      const b = JSON.parse(localStorage.getItem('itt10:boot:' + t));
      if (!b || !b.me) return null;
      token = t; ROSTER = b.roster; HONOR = ROSTER.find(p => p.id === b.honorId) || null; meId = b.me.id;
      return { me: b.me, state: readCache(), done: [] };
    } catch (e) { return null; }
  }

  // 身分先由手機上解開的名字表決定時，先把代碼和編號記下來，之後存檔才知道存給誰。
  function prime(t, id) { token = t; meId = id; }

  async function push() {
    if (inflight) { await inflight; }
    if (!pending) return true;
    const s = pending; pending = null;
    onStatus('saving');
    inflight = (async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const r = await call('save', { state: s });
          if (r.ok) return true;
          if (r.error === 'bad_token' || r.error === 'too_long') return false;
        } catch (e) { /* 網路問題，稍後重試 */ }
        await new Promise(r => setTimeout(r, 1200 * (attempt + 1)));
      }
      return false;
    })();
    const ok = await inflight; inflight = null;
    if (!ok && !pending) pending = s; // 留著，下次再試
    onStatus(ok ? 'saved' : 'error');
    return ok;
  }

  // 每次輸入都呼叫：先寫本機，後端延後一點再送，避免每個字都打一次。
  function save(state) {
    state.updatedAt = Date.now();
    const okLocal = writeCache(state);
    if (!remote) { onStatus(okLocal ? 'local' : 'error'); return okLocal; }
    pending = JSON.parse(JSON.stringify(state));
    onStatus('dirty');
    clearTimeout(timer);
    timer = setTimeout(push, 1500);
    return okLocal;
  }

  // 送出時呼叫：立刻送到後端並等結果。
  async function flush(state) {
    const okLocal = save(state);
    if (!remote) return okLocal;
    clearTimeout(timer);
    return push();
  }

  async function progress() {
    if (!remote) {
      return ROSTER.filter(p => { try { return (JSON.parse(localStorage.getItem('itt10:' + p.id)) || {}).submittedAt; } catch (e) { return false; } }).map(p => p.id);
    }
    const r = await call('progress');
    return r.ok ? r.done : [];
  }

  // 邀請卡用的畢業照。只有帶著有效連結才拿得到，拿過一次就存在這支裝置。
  async function cover() {
    if (!remote) return 'photos/IMG_6968.jpg';
    try { const c = localStorage.getItem('itt10:cover'); if (c) return c; } catch (e) {}
    // 後端偶爾會慢或失敗，最多試三次，免得拍立得空白。
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await call('cover');
        if (r.ok && r.dataUrl) { try { localStorage.setItem('itt10:cover', r.dataUrl); } catch (e) {} return r.dataUrl; }
      } catch (e) {}
      await new Promise(res => setTimeout(res, 1500));
    }
    return '';
  }

  // 關掉頁面前，把還沒送出的內容補送一次。
  addEventListener('pagehide', () => {
    if (remote && pending && navigator.sendBeacon) {
      navigator.sendBeacon(apiUrl, new Blob([JSON.stringify({ action: 'save', token, state: pending })], { type: 'text/plain;charset=utf-8' }));
    }
  });

  return { remote, init, fast, prime, save, flush, progress, cover, setStatusHandler: fn => (onStatus = fn) };
})();
