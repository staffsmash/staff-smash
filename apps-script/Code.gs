/**
 * Staff Smash: HUFS 기록판 서버 (Google Apps Script 웹앱)
 * - 게임 전용 계정(staffsmash0)의 Google 시트에 붙여서 배포한다. 설치 방법은 같은 폴더 README.md.
 * - doPost: 기록 1건 추가 (닉네임이 비면 익명 — 순위에는 안 나오고 플레이 수에만 잡힌다)
 * - doGet : ?mode=staff|student 상위 20개와 플레이 수
 * - 개인정보는 받지 않는다. 부적절한 닉네임·조작 기록은 시트에서 행을 지우면 된다.
 */

const SHEET_NAME = 'records';
const HEADERS = ['ts', 'mode', 'nickname', 'stage', 'cleared', 'clockMin', 'elapsed', 'grades', 'hero', 'skill', 'version'];
const BAD = [
  '시발', '씨발', 'ㅅㅂ', 'ㅆㅂ', '병신', 'ㅂㅅ', '좆', '개새', '새끼', '지랄', '미친놈', '미친년',
  '꺼져', '닥쳐', '보지', '자지', '섹스', 'fuck', 'shit', 'bitch', 'sex',
];

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(HEADERS);
  }
  return sh;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function num_(v, min, max, fallback) {
  const n = Number(v);
  if (!isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function nick_(raw) {
  const name = String(raw || '').trim().replace(/\s+/g, ' ');
  const len = Array.from(name).length;
  if (len < 2 || len > 8) return '';
  const flat = name.toLowerCase().replace(/\s/g, '');
  if (BAD.some((b) => flat.indexOf(b) >= 0)) return '';
  return name;
}

function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents);
    const mode = d.mode === 'student' ? 'student' : 'staff';
    const stage = Math.round(num_(d.stage, 0, 3, 0));
    const row = [
      new Date(),
      mode,
      nick_(d.nickname),
      stage,
      d.cleared === true && stage === 3,
      num_(d.clockMin, 900, 1440, 1440),
      num_(d.elapsed, 0, 7200, 7200),
      String(d.grades || '').slice(0, 6),
      String(d.hero || '').slice(0, 20),
      String(d.skill || '').slice(0, 20),
      String(d.version || '').slice(0, 10),
    ];
    const lock = LockService.getScriptLock();
    lock.waitLock(5000);
    try {
      sheet_().appendRow(row);
    } finally {
      lock.releaseLock();
    }
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function doGet(e) {
  const mode = e && e.parameter && e.parameter.mode === 'student' ? 'student' : 'staff';
  const rows = sheet_().getDataRange().getValues().slice(1).filter((r) => r[1] === mode);
  const named = rows.filter((r) => r[2]);
  const entries = named.map((r) => ({
    ts: new Date(r[0]).getTime(),
    mode: mode,
    nickname: String(r[2]),
    stage: Number(r[3]),
    cleared: r[4] === true || r[4] === 'TRUE',
    clockMin: Number(r[5]),
    elapsed: Number(r[6]),
    grades: String(r[7]),
    hero: String(r[8]),
    skill: String(r[9]),
    version: String(r[10]),
  }));
  entries.sort((a, b) => {
    const sa = a.cleared ? 4 : a.stage;
    const sb = b.cleared ? 4 : b.stage;
    if (sa !== sb) return sb - sa;
    if (a.clockMin !== b.clockMin) return a.clockMin - b.clockMin;
    return a.elapsed - b.elapsed;
  });
  const players = {};
  named.forEach((r) => (players[r[2]] = true));
  return json_({ ok: true, entries: entries.slice(0, 20), plays: rows.length, players: Object.keys(players).length });
}
