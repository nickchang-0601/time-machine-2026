(async function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const blankAnswers = () => ({
    warmup: [{ q: '', a: '', w1: '', w2: '', w3: '' }, { q: '', a: '', w1: '', w2: '', w3: '' }],
    share: { work: '', life: '' },
    awards: { changed: { who: '', why: '' }, same: { who: '', why: '' }, thanks: { who: '', why: '' } },
    song: { title: '', artist: '' },
    giftHint: '',
    messages: [],
    surprise: '',
    capsule: '',
  });

  let me = null;
  let state = null;
  let step = 0;

  // ---------- 畫面切換 ----------
  function show(id) {
    $$('.screen').forEach(s => s.classList.toggle('active', s.id === id));
    document.body.dataset.screen = id;
    window.scrollTo(0, 0);
  }
  const persist = () => { dirty = true; if (demo) return true; if (!remoteKnown) { pendingLocal = true; return true; } return Store.save(state); };
  Store.setStatusHandler(s => {
    const note = $('#save-note');
    note.textContent = { local: '內容會自動暫存在這支裝置。', dirty: '儲存中…', saving: '儲存中…', saved: '已自動儲存。', error: '現在連不上，內容先留在這支裝置，稍後會自動再試。' }[s] || '';
    note.classList.toggle('warn', s === 'error');
  });

  // ---------- 雪 ----------
  (function snow() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const box = $('#snow');
    for (let i = 0; i < 26; i++) {
      const f = document.createElement('i');
      const size = 3 + Math.random() * 5;
      f.style.cssText = `left:${Math.random() * 100}%;width:${size}px;height:${size}px;animation-duration:${8 + Math.random() * 10}s;animation-delay:${-Math.random() * 18}s;opacity:${.35 + Math.random() * .5}`;
      box.appendChild(f);
    }
  })();

  // ---------- 身分 ----------
  const params = new URLSearchParams(location.search);
  const token = params.get('t');
  // 展示模式：錄影或示範用。名字顯示成 ITT、地點只寫「南投 民宿」，每次重開都從信封開始，而且不會存任何東西。
  const demo = params.has('demo');
  // 信封要馬上能點：先掛上開信動作，身分資料在背景載入。
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let opened = false, openedAt = 0, ready = false;
  const goInvite = () => setTimeout(() => show('s-invite'), reduced ? 0 : Math.max(0, 850 - (Date.now() - openedAt)));
  $('#envelope').addEventListener('click', function () {
    if (opened) return;
    opened = true; openedAt = Date.now();
    this.classList.add('open');
    openSfx();     // 開信音效
    Music.start(); // 音樂只在真的點開信封的這一刻響起；已經在播就不會中斷
    if (ready) goInvite();
  });

  // 開信音效：用程式合成的紙張摩擦聲加一聲火漆裂開的悶響，不需要音檔。
  function openSfx() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = new AC(), t = ctx.currentTime, dur = 0.5, len = Math.floor(ctx.sampleRate * dur);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) { const p = i / len; d[i] = (Math.random() * 2 - 1) * Math.pow(1 - p, 1.4) * (0.55 + 0.45 * Math.sin(p * 46)); }
      const src = ctx.createBufferSource(); src.buffer = buf;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.9;
      bp.frequency.setValueAtTime(1500, t); bp.frequency.exponentialRampToValueAtTime(5200, t + dur);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.55, t + 0.04); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(bp).connect(g).connect(ctx.destination); src.start(t);
      const o = ctx.createOscillator(), og = ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(210, t); o.frequency.exponentialRampToValueAtTime(70, t + 0.13);
      og.gain.setValueAtTime(0.4, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      o.connect(og).connect(ctx.destination); o.start(t); o.stop(t + 0.18);
      setTimeout(() => ctx.close(), 1200);
    } catch (e) {}
  }
  let songLabel = '一首會讓你想起研究所的歌';
  let customCover = false;
  const gradPhoto = new Image();
  function applyCover(url) {
    gradPhoto.src = url;
    $('#cover-ph').style.backgroundImage = `url("${url}")`;
    $('#photo-bg').style.backgroundImage = `url("${url}")`;
  }
  function settleName(name) {
    const el = $('#env-name');
    if (el.textContent === name) return; // 同一個名字不重播動畫
    el.textContent = name;
    if (el.classList.contains('pending')) {
      el.classList.remove('pending');
      $('#env-hint').classList.remove('writing');
      $('#env-hint').textContent = '點一下信封';
    }
    // 名字像被一筆一筆寫上去：重新觸發一次動畫
    el.classList.remove('inked'); void el.offsetWidth; el.classList.add('inked');
  }
  async function unlockVault(t) {
    try {
      if (!t || typeof NAME_VAULT === 'undefined' || !crypto.subtle) return null;
      const b64 = v => Uint8Array.from(atob(v), c => c.charCodeAt(0));
      const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(t), 'PBKDF2', false, ['deriveBits']);
      const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: b64(NAME_VAULT.salt), iterations: NAME_VAULT.iter }, base, 384));
      const id = [...bits.slice(32, 48)].map(x => x.toString(16).padStart(2, '0')).join('');
      const box = NAME_VAULT.items[id];
      if (!box) return null;
      const raw = b64(box);
      const key = await crypto.subtle.importKey('raw', bits.slice(0, 32), 'AES-GCM', false, ['decrypt']);
      const info = JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12) }, key, raw.slice(12))));
      // 有個人化信件的人，把邀請卡內文換成寫給他的版本（署名那行保留）。
      if (info.l && info.l.length) {
        const box = $('.letter'), sign = box.querySelector('.sign');
        box.querySelectorAll('p:not(.sign)').forEach(el => el.remove());
        info.l.forEach(t => { const el = document.createElement('p'); el.textContent = t; box.insertBefore(el, sign); });
      }
      if (info.song) songLabel = info.song;
      // 背景音樂：下載加密的音檔，用這個人資料裡的鑰匙解開，交給播放器。
      if (info.a) {
        Music.setSource(fetch(info.a.f).then(r => { if (!r.ok) throw new Error('audio'); return r.arrayBuffer(); }).then(async buf => {
          const k = await crypto.subtle.importKey('raw', b64(info.a.k), 'AES-GCM', false, ['decrypt']);
          const b = new Uint8Array(buf);
          const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b.slice(0, 12) }, k, b.slice(12));
          return URL.createObjectURL(new Blob([plain], { type: info.a.t || 'audio/mp4' }));
        }));
      }
      // 有專屬照片的人：下載加密檔、用同一把鑰匙解開，換掉拍立得、登機證背景與存圖浮水印。
      if (info.c) {
        customCover = true;
        if (info.cap) $('#cover-cap').textContent = info.cap;
        fetch(info.c).then(r => r.arrayBuffer()).then(async buf => {
          const b = new Uint8Array(buf);
          const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b.slice(0, 12) }, key, b.slice(12));
          applyCover(URL.createObjectURL(new Blob([plain], { type: 'image/jpeg' })));
        }).catch(() => { customCover = false; Store.cover().then(u => u && applyCover(u)); });
      }
      return info;
    } catch (e) { return null; }
  }

  let knownDone = [];
  let dirty = demo;
  // 後端回來之前不往後端存東西，免得用空白蓋掉對方在別的裝置填好的答案。
  let remoteKnown = !Store.remote || demo, pendingLocal = false;
  // 不管是不是第一次開，都先在手機上解開名字、個人化內容與身分，不等後端。
  const vaultP = unlockVault(token);
  vaultP.then(v => {
    if (demo) settleName('ITT'); else if (v) settleName(v.n);
    // 照片正常是從網站上的加密檔解開；展示模式或解不開時才向後端要。
    if (!v || !v.c) Store.cover().then(url => { if (url && !customCover) applyCover(url); });
  });
  let boot = Store.fast(token);          // 這支裝置開過：直接開場
  let remoteBoot = Store.init(token).then(v => ({ ok: true, v }), () => ({ ok: false }));
  if (!boot && Store.remote && !demo) {
    // 第一次開：信封、邀請卡、登機證、行前說明都只靠手機上解開的資料，完全不等後端。
    show('s-envelope');
    const v = await vaultP;
    if (v && v.id) {
      Store.prime(token, v.id);
      boot = { me: { id: v.id, name: v.n, guestOfHonor: !!v.h }, state: null, done: [] };
    }
  }
  if (!boot) {
    // 展示模式、本機模式，或名字表解不開時：照舊等後端。
    show(Store.remote && token ? 's-envelope' : 's-loading');
    $('#env-name').classList.add('pending');
    $('#env-hint').textContent = '正在寫上你的名字';
    $('#env-hint').classList.add('writing');
    if (demo) settleName('ITT');
    const r = await remoteBoot;
    if (!r.ok) {
      show('s-loading');
      $('#load-msg').textContent = '現在連不上，請檢查網路後重新整理。';
      $('#btn-reload').hidden = false;
      $('#btn-reload').addEventListener('click', () => location.reload());
      return;
    }
    boot = r.v;
    remoteKnown = true;
  } else if (Store.remote && !demo) {
    // 後端在背景回來後再對一次；連不上就每隔幾秒再試。
    (function sync(attempt) {
      remoteBoot.then(r => {
        if (!r.ok) {
          if (attempt < 8) setTimeout(() => { remoteBoot = Store.init(token).then(v => ({ ok: true, v }), () => ({ ok: false })); sync(attempt + 1); }, 4000);
          return;
        }
        if (!r.v) return; // 連結已失效
        const rs = r.v.state;
        if (rs && (rs.updatedAt || 0) > (state.updatedAt || 0)) {
          // 後端的比較新（例如在別的裝置填過）：以後端為準。
          const wasAccepted = state.accepted;
          state = Object.assign({ accepted: false, briefed: false, submittedAt: null, answers: blankAnswers() }, rs);
          state.answers = Object.assign(blankAnswers(), state.answers);
          if (wasAccepted) state.accepted = true;
          if (state.submittedAt || state.briefed) enter();
        }
        knownDone = (r.v.done || []).slice();
        remoteKnown = true;
        if (pendingLocal) { pendingLocal = false; Store.save(state); }
      });
    })(0);
  }
  if (!boot) {
    if (Store.remote) {
      $('#picker-title').textContent = '這個連結打不開';
      $('#picker-text').textContent = '請用主辦人私訊給你的專屬連結開啟。如果連結是對的還是不行，直接跟主辦人說一聲。';
      $('#picker-eyebrow').textContent = 'OOPS';
    } else {
      $('#picker-list').innerHTML = ROSTER.map(p => `<button data-t="${p.token}">${esc(p.name)}</button>`).join('');
      $('#picker-list').addEventListener('click', e => {
        const t = e.target.dataset.t;
        if (t) location.search = '?t=' + t;
      });
    }
    show('s-picker');
    return;
  }
  me = demo ? Object.assign({}, boot.me, { name: 'ITT', guestOfHonor: false }) : boot.me;
  const saved = demo ? null : boot.state;
  const gate = demo ? '南投民宿' : '耕雲齋';
  $('#pass-gate').textContent = gate;
  if (demo) { $('#venue').textContent = '南投 民宿'; $('#map-link').hidden = true; }
  state = Object.assign({ accepted: false, briefed: false, submittedAt: null, answers: blankAnswers() }, saved || {});
  state.answers = Object.assign(blankAnswers(), state.answers);

  $$('.me-name').forEach(el => (el.textContent = me.name));
  settleName(me.name);
  $$('.deadline').forEach(el => (el.textContent = EVENT.deadline));
  $('#map-link').href = EVENT.mapUrl;
  const seatNo = parseInt(String(me.id).slice(1), 10) || 0;
  $('#pass-seat').textContent = String(seatNo).padStart(2, '0') + 'A';

  // ---------- 倒數 ----------
  function tick() {
    const ms = new Date(EVENT.start) - Date.now();
    const el = $('#countdown');
    if (ms <= 0) { el.textContent = '出發了！'; return; }
    const d = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24, m = Math.floor(ms / 6e4) % 60;
    el.textContent = `${d} 天 ${h} 時 ${m} 分`;
  }
  tick(); setInterval(tick, 30000);

  $('#btn-accept').addEventListener('click', () => { state.accepted = true; persist(); show('s-pass'); });
  $('#btn-tobrief').addEventListener('click', () => (state.submittedAt ? openDone() : show('s-brief')));

  // ---------- 行前說明 ----------
  const checks = $$('#checklist input');
  const syncChecks = () => ($('#btn-tofill').disabled = !checks.every(c => c.checked));
  checks.forEach(c => c.addEventListener('change', syncChecks));
  $('#btn-tofill').addEventListener('click', async () => {
    const btn = $('#btn-tofill');
    if (!remoteKnown) {
      // 問卷要用到名單和你之前的答案，這裡才需要等後端。
      const label = btn.textContent; btn.disabled = true; btn.textContent = '準備問卷中…';
      const t0 = Date.now();
      while (!remoteKnown && Date.now() - t0 < 45000) await new Promise(r => setTimeout(r, 200));
      btn.disabled = false; btn.textContent = label;
      if (!remoteKnown) { alert('現在連不上，請確認網路後再按一次。'); return; }
      if (state.submittedAt) { openDone(); return; }
    }
    state.briefed = true; persist(); step = 0; renderStep(); show('s-form');
  });

  // ---------- 登機證存圖 ----------
  $('#btn-savepass').addEventListener('click', async () => {
    await document.fonts.ready;
    const W = 1200, H = 620, c = document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d');
    const css = getComputedStyle(document.documentElement);
    const col = n => css.getPropertyValue(n).trim();
    const serif = "'Noto Serif TC', serif", type = "'Special Elite', monospace";
    x.fillStyle = col('--kraft'); x.fillRect(0, 0, W, H);
    x.fillStyle = col('--paper');
    x.beginPath(); x.roundRect(40, 40, W - 80, H - 80, 28); x.fill();
    x.save(); x.beginPath(); x.roundRect(40, 40, W - 80, H - 80, 28); x.clip();
    x.fillStyle = col('--red'); x.fillRect(40, 40, W - 80, 84);
    // 畢業照當票面的淡淡浮水印
    if (gradPhoto.complete && gradPhoto.naturalWidth) {
      const iw = gradPhoto.naturalWidth, ih = gradPhoto.naturalHeight, bw = W - 80, bh = H - 164;
      const sc = Math.max(bw / iw, bh / ih);
      x.globalAlpha = 0.16; x.filter = 'sepia(1)';
      x.drawImage(gradPhoto, 40 + (bw - iw * sc) / 2, 124 + (bh - ih * sc) / 2, iw * sc, ih * sc);
      x.globalAlpha = 1; x.filter = 'none';
    }
    x.restore();
    x.fillStyle = '#fff3df'; x.font = `30px ${type}`; x.textBaseline = 'middle';
    x.fillText('TIME MACHINE AIRLINES', 80, 84);
    x.textAlign = 'right'; x.fillText('ITT 10TH ANNIVERSARY', 860, 84); x.textAlign = 'left';
    // 撕線
    x.strokeStyle = col('--kraft-dark'); x.lineWidth = 3; x.setLineDash([10, 10]);
    x.beginPath(); x.moveTo(900, 124); x.lineTo(900, H - 40); x.stroke(); x.setLineDash([]);
    // 航線
    const label = (t, lx, ly) => { x.fillStyle = col('--ink-soft'); x.font = `18px ${type}`; x.fillText(t, lx, ly); };
    const big = (t, lx, ly, size = 42) => { x.fillStyle = col('--ink'); x.font = `700 ${size}px ${serif}`; x.fillText(t, lx, ly); };
    label('FROM', 80, 170); label('TO', 560, 170);
    x.fillStyle = col('--ink'); x.font = `96px ${type}`; x.fillText('KHH', 80, 235); x.fillText('NTO', 560, 235);
    x.fillStyle = col('--green'); x.font = `700 30px ${serif}`; x.fillText('高雄 2016', 80, 305); x.fillText('南投 2026', 560, 305);
    x.fillStyle = col('--red'); x.font = '64px serif'; x.fillText('✈', 370, 232);
    label('PASSENGER 旅客', 80, 380); big(me.name, 80, 425, 52);
    label('FLIGHT 航班', 330, 380); big('ITT2016', 330, 425);
    label('DATE 日期', 600, 380); big('25 DEC 2026', 600, 425, 36);
    label('GATE 登機門', 80, 500); big(gate, 80, 540);
    label('SEAT 座位', 330, 500); big($('#pass-seat').textContent, 330, 540);
    label('CLASS 艙等', 600, 500); big('FIRST CLASS', 600, 534, 34);
    x.fillStyle = col('--green'); x.font = `700 19px ${serif}`; x.fillText('放在第一位的朋友', 600, 565);
    // 存根
    x.fillStyle = col('--ink');
    let bx = 940; const widths = [4, 2, 6, 2, 3, 5, 2, 4, 2, 6, 3, 2, 5, 2, 4, 3, 6, 2, 3, 4, 2, 5, 3, 2, 4];
    widths.forEach((w, i) => { if (i % 2 === 0) x.fillRect(bx, 170, w, 220); bx += w + 3; });
    label('BOARDING 12/25', 940, 430);
    x.fillStyle = col('--red-dark'); x.font = `700 30px ${serif}`; x.fillText('回到過去', 940, 480);
    x.fillStyle = col('--ink-soft'); x.font = `20px ${serif}`; x.fillText('行李：1000 元內的心意', 940, 530);
    const url = c.toDataURL('image/png');
    $('#modal-img').src = url; $('#modal-dl').href = url; $('#modal').hidden = false;
  });
  $('#modal-close').addEventListener('click', () => ($('#modal').hidden = true));
  $('#modal').addEventListener('click', e => { if (e.target.id === 'modal') e.target.hidden = true; });

  // ---------- 問卷 ----------
  const others = () => ROSTER.filter(p => p.id !== me.id);
  const field = (label, path, opt = {}) => {
    const v = esc(getPath(path));
    const req = opt.optional ? '' : 'data-req';
    const input = opt.area
      ? `<textarea data-path="${path}" ${req} placeholder="${esc(opt.ph || '')}">${v}</textarea>`
      : `<input type="text" data-path="${path}" ${req} value="${v}" placeholder="${esc(opt.ph || '')}">`;
    return `<div class="field"><label>${label}</label>${input}${opt.help ? `<small>${opt.help}</small>` : ''}</div>`;
  };
  const whoSelect = (path, extra = '') => {
    const cur = getPath(path);
    return `<select data-path="${path}" data-req><option value="">請選一位</option>${extra}${others().map(p => `<option value="${p.id}" ${cur === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>`;
  };

  function getPath(path) { return path.split('.').reduce((o, k) => (o == null ? o : o[k]), state.answers); }
  function setPath(path, val) {
    const ks = path.split('.'); const last = ks.pop();
    ks.reduce((o, k) => o[k], state.answers)[last] = val;
  }

  const warmupBlock = i => `
    <div class="block">
      <p class="block-title">第 ${i + 1} 題</p>
      ${field('題目', `warmup.${i}.q`, { ph: `例：${me.name}現在在哪間公司上班？`, help: '題目裡要有你的名字。' })}
      <div class="field"><span class="legend">四個選項</span>
        <div class="opt right"><span>對</span><input type="text" data-path="warmup.${i}.a" data-req value="${esc(getPath(`warmup.${i}.a`))}" placeholder="正確答案"></div>
        ${[1, 2, 3].map(n => `<div class="opt"><span>錯</span><input type="text" data-path="warmup.${i}.w${n}" data-req value="${esc(getPath(`warmup.${i}.w${n}`))}" placeholder="錯誤選項 ${n}"></div>`).join('')}
        <small>現場會把順序打亂。錯誤選項寫得越像真的越好玩。</small>
      </div>
    </div>`;

  const awardBlock = (key, title, ask) => `
    <div class="block">
      <p class="block-title">${title}</p>
      <div class="field"><label>${ask}</label>${whoSelect(`awards.${key}.who`)}</div>
      ${field('為什麼？', `awards.${key}.why`, { area: true, ph: '一兩句就好', help: '理由會匿名唸出來。' })}
    </div>`;

  function messageBlock(m, i) {
    const isPerson = ROSTER.some(p => p.id === m.to);
    const toOpts = `<option value="all" ${m.to === 'all' ? 'selected' : ''}>全部人</option>`;
    return `
    <div class="block" data-msg="${i}">
      <button type="button" class="remove" data-remove="${i}">刪除</button>
      <p class="block-title">第 ${i + 1} 則</p>
      <div class="field"><label>我想對誰說</label>
        ${whoSelect(`messages.${i}.to`, toOpts + `<option value="custom" ${m.to === 'custom' ? 'selected' : ''}>自己輸入（例如某個小團體）</option>`)}
      </div>
      ${m.to === 'custom' ? field('對象', `messages.${i}.custom`, { ph: '例：當年的報告小組' }) : ''}
      ${field('想說的話', `messages.${i}.text`, { area: true, ph: '想講什麼都可以' })}
      <div class="field"><span class="legend">署名</span><div class="seg">
        <label><input type="radio" name="anon${i}" data-path="messages.${i}.anon" value="0" ${!m.anon ? 'checked' : ''}><span>具名（${esc(me.name)}）</span></label>
        <label><input type="radio" name="anon${i}" data-path="messages.${i}.anon" value="1" ${m.anon ? 'checked' : ''}><span>匿名</span></label>
      </div></div>
      <div class="field"><span class="legend">怎麼給對方</span><div class="seg">
        <label><input type="radio" name="priv${i}" data-path="messages.${i}.priv" value="0" ${!m.priv ? 'checked' : ''}><span>現場公開揭曉</span></label>
        <label><input type="radio" name="priv${i}" data-path="messages.${i}.priv" value="1" ${m.priv ? 'checked' : ''} ${isPerson ? '' : 'disabled'}><span>只給本人看</span></label>
      </div><small>${isPerson ? '選「只給本人看」的話，活動後只會出現在對方的專屬連結裡。' : '對象是特定一個人時，才能選「只給本人看」。'}</small></div>
    </div>`;
  }

  const steps = [
    {
      title: 'Warm up 問答', sub: '出兩題跟自己有關的近況題，開場讓大家用手機搶答。',
      html: () => warmupBlock(0) + warmupBlock(1),
    },
    {
      title: '年度分享', sub: '今年想跟大家分享的兩件事。這裡只要寫題目，當天會請你上台自己講。',
      html: () => field('工作上的分享題目', 'share.work', { ph: '例：我終於離職了' }) + field('生活上的分享題目', 'share.life', { ph: '例：我開始學唱歌' }),
    },
    {
      title: '十週年頒獎', sub: '各選一位，不能選自己。當晚開票頒獎，得獎的人要上台回應。',
      html: () => awardBlock('changed', '改變最多獎', '這十年誰改變最多？') + awardBlock('same', '最沒變獎', '這十年誰最沒變？') + awardBlock('thanks', '最想感謝獎', '這十年你最想感謝誰？'),
    },
    {
      title: '點歌與禮物', sub: '把我們帶回 2016 的一首歌，還有你的交換禮物提示。',
      html: () =>
        field(esc(songLabel), 'song.title', { ph: '歌名' }) +
        field('歌手', 'song.artist', { optional: true, ph: '可不填' }) +
        field('禮物提示', 'giftHint', { optional: true, area: true, ph: '例：冬天用得到，但你不會想自己買', help: '用一句話形容你的禮物，不能講出是什麼。大家會只看提示來選。還沒買可以先空著，之後回來補。' }),
    },
    {
      title: '我有話想說', sub: '對任何人說任何話，可以對一個人、對全部人，或自己定義對象。則數沒有上限，也可以先跳過、之後再回來追加。',
      html: () => state.answers.messages.map(messageBlock).join('') + `<button type="button" class="btn ghost add" id="btn-addmsg">＋ 新增一則</button>`,
    },
    {
      title: '最後兩件事', sub: '',
      html: () =>
        (me.guestOfHonor || !HONOR ? '' : `<div class="block"><p class="block-title">給${esc(HONOR.name)}的驚喜</p><div class="note">${esc(HONOR.name)}看不到這一題，請保密。開場時會全部放給她看。</div>${field(`${esc(HONOR.name)}終於從德國回來了，想對她說一句話`, 'surprise', { area: true, ph: '歡迎回來！' })}</div>`) +
        `<div class="block"><p class="block-title">時光膠囊</p><div class="note">寫給 2036 年的自己。沒有任何人會看到，活動最後一晚一起封存，二十週年再打開。</div>${field('給十年後的自己', 'capsule', { area: true, ph: '2036 年的我，你好嗎？' })}</div>`,
    },
  ];

  function renderStep() {
    const s = steps[step];
    $('#step-count').textContent = `STEP ${step + 1} / ${steps.length}`;
    $('#step-title').textContent = s.title;
    $('#step-sub').textContent = s.sub;
    $('#step-sub').hidden = !s.sub;
    $('#step-body').innerHTML = s.html();
    $('#step-error').textContent = '';
    $('#progress-bar').style.width = ((step + 1) / steps.length) * 100 + '%';
    $('#btn-prev').style.visibility = step === 0 ? 'hidden' : 'visible';
    $('#btn-next').textContent = step === steps.length - 1 ? (state.submittedAt ? '更新我的答案' : '送出') : '下一步';
  }

  $('#step-body').addEventListener('input', e => {
    const p = e.target.dataset.path;
    if (!p) return;
    let v = e.target.value;
    if (/\.(anon|priv)$/.test(p)) v = v === '1';
    setPath(p, v);
    e.target.classList.remove('invalid');
    persist();
    // 換對象時，欄位會跟著變
    if (/^messages\.\d+\.to$/.test(p)) {
      const m = getPath(p.replace(/\.to$/, ''));
      if (!ROSTER.some(x => x.id === m.to)) m.priv = false;
      persist(); renderStep();
    }
  });
  $('#step-body').addEventListener('click', e => {
    if (e.target.id === 'btn-addmsg') {
      state.answers.messages.push({ to: '', custom: '', text: '', anon: false, priv: false });
      persist(); renderStep();
      const blocks = $$('[data-msg]'); blocks[blocks.length - 1].scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    if (e.target.dataset.remove != null) {
      state.answers.messages.splice(+e.target.dataset.remove, 1);
      persist(); renderStep();
    }
  });
  $('#step-body').addEventListener('submit', e => e.preventDefault());

  function validate() {
    const bad = $$('#step-body [data-req]').filter(el => !el.value.trim());
    $$('#step-body .invalid').forEach(el => el.classList.remove('invalid'));
    bad.forEach(el => el.classList.add('invalid'));
    if (!bad.length && step === 0) {
      for (const w of state.answers.warmup) {
        const opts = [w.a, w.w1, w.w2, w.w3].map(v => v.trim());
        if (new Set(opts).size < 4) { $('#step-error').textContent = '同一題的四個選項不能重複，請改成四個不一樣的答案。'; return false; }
      }
    }
    if (bad.length) {
      $('#step-error').textContent = `還有 ${bad.length} 個欄位沒填。`;
      bad[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
      bad[0].focus({ preventScroll: true });
      return false;
    }
    return true;
  }

  $('#btn-next').addEventListener('click', async () => {
    if (!validate()) return;
    if (step < steps.length - 1) { step++; renderStep(); window.scrollTo(0, 0); return; }
    const btn = $('#btn-next'), label = btn.textContent, before = state.submittedAt;
    btn.disabled = true; btn.textContent = '送出中…';
    state.submittedAt = new Date().toISOString();
    const ok = demo ? true : await Store.flush(state);
    btn.disabled = false; btn.textContent = label;
    if (!ok) { state.submittedAt = before; $('#step-error').textContent = '沒有送出成功，內容還留在這支裝置。請確認網路後再按一次。'; return; }
    openDone();
  });
  $('#btn-prev').addEventListener('click', () => { if (step > 0) { step--; renderStep(); window.scrollTo(0, 0); } });

  // ---------- 完成 ----------
  // 先用手上已知的名單畫出來，後端的最新名單回來再補上，不讓人等。
  knownDone = (boot.done || []).slice();
  function drawWall() {
    const done = knownDone.slice();
    if (state.submittedAt && !done.includes(me.id)) done.push(me.id);
    $('#wall').innerHTML = ROSTER.map(p => `<div class="${done.includes(p.id) ? 'in' : ''}">${esc(p.name)}</div>`).join('');
  }
  function openDone() {
    drawWall();
    show('s-done');
    Store.progress().then(d => { knownDone = d; drawWall(); }).catch(() => {});
  }
  $('#btn-edit').addEventListener('click', () => { step = 0; renderStep(); show('s-form'); });
  $('#btn-more').addEventListener('click', () => {
    step = 4;
    state.answers.messages.push({ to: '', custom: '', text: '', anon: false, priv: false });
    persist(); renderStep(); show('s-form');
  });
  $('#btn-pass').addEventListener('click', () => show('s-pass'));

  // ---------- 入口 ----------
  function enter() {
    if (state.submittedAt) { Music.auto(); openDone(); }
    else if (state.briefed) { Music.auto(); step = 0; renderStep(); show('s-form'); }
    else { show('s-envelope'); if (opened) goInvite(); }
  }
  ready = true;
  enter();
})();
