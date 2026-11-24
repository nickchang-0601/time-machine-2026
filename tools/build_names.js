// 產生 names.js：每個名字用對方的連結代碼上鎖，沒有那條連結就解不開。
// 用法：node tools/build_names.js <people.csv 的路徑>
// 鑰匙用刻意放慢的 PBKDF2 推出來，讓暴力猜代碼不划算。
const fs = require('fs');
const crypto = require('crypto');

const ITER = 150000;
const csv = fs.readFileSync(process.argv[2], 'utf8').replace(/^﻿/, '').trim().split(/\r?\n/).slice(1);
const salt = crypto.randomBytes(16);
// 個人化內容（選用）：custom.private.json，格式 { "p03": { "letter": ["第一段"], "cover": "照片路徑", "caption": "拍立得下的字" } }
// 信件與照片都用本人的連結代碼加密；原始檔不進程式碼庫，加密後的照片放在 covers/。
const root = require('path').join(__dirname, '..');
const customPath = require('path').join(root, 'custom.private.json');
const custom = fs.existsSync(customPath) ? JSON.parse(fs.readFileSync(customPath, 'utf8')) : {};
// 每次重建鑰匙都會換，先清掉上一輪加密的照片。
const coversDir = require('path').join(root, 'covers');
fs.mkdirSync(coversDir, { recursive: true });
for (const f of fs.readdirSync(coversDir)) if (f.endsWith('.bin')) fs.unlinkSync(require('path').join(coversDir, f));
const seal = (key, buf) => {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  return Buffer.concat([iv, c.update(buf), c.final(), c.getAuthTag()]);
};
// 背景音樂（選用）：private-audio/song.mp3。整首只加密一份，解開它的鑰匙放在每個人的加密資料裡，
// 所以只有拿到專屬連結的人聽得到；原始音檔不進程式碼庫。
const mediaDir = require('path').join(root, 'media');
fs.mkdirSync(mediaDir, { recursive: true });
for (const f of fs.readdirSync(mediaDir)) if (f.endsWith('.bin')) fs.unlinkSync(require('path').join(mediaDir, f));
let audio = null;
const songFile = ['song.m4a', 'song.mp3'].find(f => fs.existsSync(require('path').join(root, 'private-audio', f)));
const songPath = songFile ? require('path').join(root, 'private-audio', songFile) : null;
if (songPath) {
  const k = crypto.randomBytes(32), name = 'media/' + crypto.randomBytes(8).toString('hex') + '.bin';
  fs.writeFileSync(require('path').join(root, name), seal(k, fs.readFileSync(songPath)));
  audio = { f: name, k: k.toString('base64'), t: songFile.endsWith('.m4a') ? 'audio/mp4' : 'audio/mpeg' };
}
const items = {};
for (const line of csv) {
  const [pid, token, name, honor] = line.split(',');
  const bits = crypto.pbkdf2Sync(token, salt, ITER, 48, 'sha256');
  const key = bits.subarray(0, 32), id = bits.subarray(32, 48).toString('hex');
  const mine = custom[pid] || {};
  // 沒有專屬照片的人用預設的畢業照；每個人各有一份用自己代碼加密的檔案。
  const coverSrc = mine.cover || (fs.existsSync(require('path').join(root, 'private-covers/default.jpg')) ? 'private-covers/default.jpg' : null);
  let coverFile = null;
  if (coverSrc) {
    coverFile = 'covers/' + id.slice(0, 12) + '.bin';
    fs.writeFileSync(require('path').join(root, coverFile), seal(key, fs.readFileSync(require('path').join(root, coverSrc))));
  }
  const info = { n: name, id: pid, h: honor === 'yes', l: mine.letter || null, c: coverFile, cap: mine.caption || null, song: mine.songLabel || null, a: audio };
  items[id] = seal(key, Buffer.from(JSON.stringify(info), 'utf8')).toString('base64');
}
const out = '// 自動產生，請勿手改。名字已加密，要有本人的連結代碼才解得開。\n' +
  'const NAME_VAULT = ' + JSON.stringify({ salt: salt.toString('base64'), iter: ITER, items }, null, 1) + ';\n';
fs.writeFileSync(require('path').join(__dirname, '..', 'names.js'), out);
console.log('wrote', Object.keys(items).length, 'entries');
