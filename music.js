// 背景音樂〈晴天〉，單曲循環。
// 正常情況：網頁自己播一份加密下載的音檔，點開信封的那一下就能直接出聲（手機也可以）。
// 音檔拿不到時才退回嵌入 YouTube 官方 MV（手機上要再點一下播放器）。
const Music = (function () {
  const VIDEO_ID = 'DYptgVvkVLQ';
  const START_AT = 15;
  let box, pill, playing = false, stoppedByUser = false, autoOn = false, wantPlay = false;

  // ---------- 音檔 ----------
  const audio = new Audio();
  audio.preload = 'auto';
  let songUrl = null, sourcePending = false, onSong = false;

  // 一小段無聲：在點擊的當下先播它，手機才會把這個播放器記成「使用者同意出聲」，
  // 之後音檔下載好再換上去就能直接播。
  const silentUrl = (function () {
    const n = 1600, b = new ArrayBuffer(44 + n), v = new DataView(b);
    const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    str(0, 'RIFF'); v.setUint32(4, 36 + n, true); str(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true); str(36, 'data'); v.setUint32(40, n, true);
    for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);
    return URL.createObjectURL(new Blob([b], { type: 'audio/wav' }));
  })();

  audio.addEventListener('playing', () => { if (onSong) setPlaying(true); });
  audio.addEventListener('pause', () => { if (onSong) setPlaying(false); });

  function playSong() {
    if (!onSong) { onSong = true; audio.loop = true; audio.src = songUrl; }
    const p = audio.play();
    if (p && p.catch) p.catch(() => setPlaying(false)); // 被瀏覽器擋下：等下一次觸碰或按右下角
  }
  function setSource(promise) {
    sourcePending = true;
    promise.then(url => {
      songUrl = url; sourcePending = false;
      if ((wantPlay || autoOn) && !stoppedByUser) playSong();
    }).catch(() => {
      sourcePending = false;
      if (wantPlay) startYT();
    });
  }

  // ---------- 介面 ----------
  const css = `
  #music { position: fixed; right: 12px; bottom: 12px; z-index: 20; font-family: 'LXGW WenKai TC', serif; }
  #music-pill { display: flex; align-items: center; gap: 8px; min-height: 44px; padding: 0 14px; border-radius: 999px; border: 2px solid #3a2e28;
    background: #fbf5e6; color: #3a2e28; font: 700 15px 'Noto Serif TC', serif; cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,.3); }
  #music-pill .disc { width: 22px; height: 22px; border-radius: 50%; background: radial-gradient(circle, #fbf5e6 0 18%, #b23a2e 19% 34%, #2a211c 35%); }
  #music.playing .disc { animation: spin 3s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  #music-card { background: #fbf5e6; border-radius: 14px; padding: 12px; margin-bottom: 8px; box-shadow: 0 10px 30px rgba(0,0,0,.5); border: 2px solid #b23a2e; }
  #music-card p { margin: 0 2px 10px; font: 700 17px/1.5 'Noto Serif TC', serif; color: #3a2e28; text-align: center; }
  #music-card p small { display: block; font: 400 13px 'LXGW WenKai TC', serif; color: #7a6a5e; }
  #music-frame { width: 100%; aspect-ratio: 16 / 9; border-radius: 8px; overflow: hidden; background: #000; }
  #music-frame iframe { width: 100%; height: 100%; display: block; }
  #music:not(.min) { left: 12px; right: 12px; max-width: 420px; margin: 0 auto; }
  #music:not(.min) #music-pill { display: none; }
  #music-skip { display: block; margin: 8px auto 0; min-height: 40px; padding: 0 14px; border: 0; background: none; color: #7a6a5e; font: 14px 'LXGW WenKai TC', serif; text-decoration: underline; cursor: pointer; }
  #music.min #music-card { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; opacity: 0; pointer-events: none; }
  `;

  function build() {
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    box = document.createElement('div'); box.id = 'music'; box.className = 'min';
    box.innerHTML = `<div id="music-card"><p id="music-tip">周杰倫〈晴天〉</p><div id="music-frame"><div id="yt-player"></div></div><button id="music-skip" type="button">先不用音樂</button></div>
      <button id="music-pill" type="button" aria-label="背景音樂開關"><span class="disc"></span><span id="music-label">播放晴天</span></button>`;
    document.body.appendChild(box);
    pill = box.querySelector('#music-pill');
    pill.addEventListener('click', e => { e.stopPropagation(); playing ? pause() : start(); });
    box.querySelector('#music-skip').addEventListener('click', e => { e.stopPropagation(); pause(); });
    // 不經過信封的畫面：瀏覽器若擋下自動播放，第一次點擊、觸碰或按鍵就開始播。
    const first = e => {
      if (e.target.closest && e.target.closest('#music')) return;
      if (!autoOn) return; // 還在信封畫面：等對方真的點開信封才出聲
      ['pointerdown', 'keydown', 'touchend'].forEach(t => removeEventListener(t, first, true));
      if (!playing && !stoppedByUser) start();
    };
    ['pointerdown', 'keydown', 'touchend'].forEach(t => addEventListener(t, first, true));
  }
  function setPlaying(v) {
    playing = v;
    if (!box) return;
    box.classList.toggle('playing', v);
    box.querySelector('#music-label').textContent = v ? '晴天 播放中' : '播放晴天';
    if (v) box.classList.add('min');
  }

  // ---------- 對外 ----------
  // 要在使用者點擊的當下呼叫。已經在播就什麼都不做，不會中斷。
  function start() {
    wantPlay = true; stoppedByUser = false;
    if (playing) return;
    if (songUrl) { playSong(); return; }
    if (sourcePending) {
      // 音檔還在下載：先用無聲片段把播放器「解鎖」，下載好會自動接著播。
      if (!onSong) { audio.loop = false; audio.src = silentUrl; const p = audio.play(); if (p && p.catch) p.catch(() => {}); }
      return;
    }
    startYT();
  }
  function pause() {
    wantPlay = false; stoppedByUser = true;
    if (onSong) audio.pause();
    if (ytReady) yt.pauseVideo();
    setPlaying(false);
    if (box) box.classList.add('min');
  }
  // 不經過信封的畫面（回來繼續填、已送出）才用：一載入就試著播，被擋就等第一次觸碰。
  function auto() {
    autoOn = true;
    if (playing || stoppedByUser) return;
    if (songUrl) playSong();
  }

  // ---------- 備援：YouTube ----------
  let yt = null, ytReady = false, ytLoading = false;
  function startYT() {
    if (ytReady) { yt.playVideo(); promptIfBlocked(); return; }
    if (ytLoading) return;
    ytLoading = true;
    const s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api'; document.head.appendChild(s);
    window.onYouTubeIframeAPIReady = () => {
      yt = new YT.Player('yt-player', {
        width: 200, height: 113, videoId: VIDEO_ID,
        playerVars: { start: START_AT, playsinline: 1, rel: 0, controls: 1 },
        events: {
          onReady: () => { ytReady = true; if (wantPlay) { yt.playVideo(); promptIfBlocked(); } },
          onStateChange: e => {
            if (e.data === YT.PlayerState.ENDED) { yt.seekTo(START_AT, true); yt.playVideo(); }
            setPlaying(e.data === YT.PlayerState.PLAYING || e.data === YT.PlayerState.BUFFERING);
          },
        },
      });
    };
  }
  function promptIfBlocked() {
    setTimeout(() => {
      if (!playing && wantPlay) {
        box.classList.remove('min');
        box.querySelector('#music-tip').innerHTML = '👇 點一下播放鍵，邊聽〈晴天〉邊看<small>手機不讓網站自動放音樂，要請你親手按一下</small>';
      }
    }, 1300);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
  return { start, pause, auto, setSource };
})();
