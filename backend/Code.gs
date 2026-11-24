/**
 * ITT 十週年：Google 試算表後端。
 * 貼進試算表的 Apps Script，先執行一次 setup()，再部署成網頁應用程式。
 * 名單寫在最上方的 ROSTER_NAMES / HONOR_NAME（由另一段私人設定提供）。
 */

const SHEET_PEOPLE = 'people';   // id | token | name | honor
const SHEET_ANSWERS = 'answers'; // id | name | accepted | submittedAt | updatedAt | json
const SHEET_CONFIG = 'config';   // key | value

function setup() {
  const ss = SpreadsheetApp.getActive();
  const people = ensureSheet_(ss, SHEET_PEOPLE, ['id', 'token', 'name', 'honor']);
  const answers = ensureSheet_(ss, SHEET_ANSWERS, ['id', 'name', 'accepted', 'submittedAt', 'updatedAt', 'json']);
  const config = ensureSheet_(ss, SHEET_CONFIG, ['key', 'value']);

  // 已經有名單就不重產，避免把發出去的連結作廢。
  if (people.getLastRow() < 2) {
    const rows = ROSTER_NAMES.map(function (name, i) {
      return ['p' + ('0' + (i + 1)).slice(-2), newToken_(), name, name === HONOR_NAME ? 'yes' : ''];
    });
    // 多一個測試帳號，不會出現在名單與完成牆上，測完可以整列刪掉。
    rows.push(['p00', newToken_(), '測試', 'test']);
    people.getRange(2, 1, rows.length, 4).setValues(rows);
  }
  if (config.getLastRow() < 2) {
    config.getRange(2, 1, 1, 2).setValues([['hostToken', newToken_()]]);
  }
  // 答案分頁藏起來，避免主持人不小心看到。
  answers.hideSheet();
  Logger.log('setup 完成，people 分頁共 ' + (people.getLastRow() - 1) + ' 列（含 1 個測試帳號）');
}

function ensureSheet_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  sh.setFrozenRows(1);
  return sh;
}

function newToken_() {
  return Utilities.getUuid().replace(/-/g, '').slice(0, 14);
}

function doGet(e) { return handle_(e.parameter || {}); }
function doPost(e) {
  let req = {};
  try { req = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'bad_json' }); }
  return handle_(req);
}

function handle_(req) {
  try {
    const people = readPeople_();
    const me = people.filter(function (p) { return p.token && p.token === req.token; })[0];
    if (!me) return json_({ ok: false, error: 'bad_token' });

    if (req.action === 'init') {
      const all = readAnswers_();
      const mine = all.filter(function (r) { return r.id === me.id; })[0];
      const honor = people.filter(function (p) { return p.honor; })[0];
      return json_({
        ok: true,
        me: { id: me.id, name: me.name, guestOfHonor: !!me.honor },
        roster: people.filter(function (p) { return !p.test; }).map(function (p) { return { id: p.id, name: p.name }; }),
        honorId: honor ? honor.id : null,
        state: mine && mine.json ? JSON.parse(mine.json) : null,
        done: doneIds_(all),
      });
    }
    if (req.action === 'cover') {
      return json_({ ok: true, dataUrl: typeof COVER_B64 === 'string' ? 'data:image/jpeg;base64,' + COVER_B64 : '' });
    }
    if (req.action === 'progress') {
      return json_({ ok: true, done: doneIds_(readAnswers_()) });
    }
    if (req.action === 'save') {
      const state = req.state;
      if (!state || typeof state !== 'object') return json_({ ok: false, error: 'bad_state' });
      const text = JSON.stringify(state);
      if (text.length > 45000) return json_({ ok: false, error: 'too_long' });
      const lock = LockService.getScriptLock();
      lock.waitLock(20000);
      try {
        const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_ANSWERS);
        const ids = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().map(function (r) { return r[0]; }) : [];
        let row = ids.indexOf(me.id) + 2;
        if (row < 2) row = sh.getLastRow() + 1;
        sh.getRange(row, 1, 1, 6).setValues([[me.id, me.name, state.accepted ? 'yes' : '', state.submittedAt || '', new Date().toISOString(), text]]);
        SpreadsheetApp.flush();
      } finally {
        lock.releaseLock();
      }
      return json_({ ok: true, savedAt: new Date().toISOString() });
    }
    return json_({ ok: false, error: 'bad_action' });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function readPeople_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_PEOPLE);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues().map(function (r) {
    return { id: String(r[0]), token: String(r[1]), name: String(r[2]), honor: String(r[3]) === 'yes', test: String(r[3]) === 'test' };
  });
}

function readAnswers_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_ANSWERS);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 6).getValues().map(function (r) {
    return { id: String(r[0]), submittedAt: String(r[3]), json: String(r[5]) };
  });
}

function doneIds_(all) {
  return all.filter(function (r) { return r.submittedAt && r.id !== 'p00'; }).map(function (r) { return r.id; });
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
