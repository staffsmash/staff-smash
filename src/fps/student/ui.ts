import type { SpellDef } from '../../data/spells';

// 학생 모드 화면 조각: 모양(CSS)은 처음 한 번 <style>로 넣고, 요소도 여기서 만든다 (fps.html은 거의 그대로 둔다).
// - 타이틀의 모드 단추, 선택 화면(주인공·외국어 주문), 연속 통과 표시, 주문 큰 글자, 소등 어둠
// - 성공 엔딩 카드 (총장 승인 → 졸업장 → 따르릉! → 자취방 꿈) — 본편 2D StudentEndingScene 흐름을 짧게

const CSS = `
#stuDark { position: fixed; inset: 0; pointer-events: none; display: none; opacity: 0;
  background: radial-gradient(circle at 50% 50%, rgba(4,6,12,0) 0, rgba(4,6,12,0) 15vmin, rgba(4,6,12,.62) 22vmin, rgba(4,6,12,.95) 31vmin); }
#stuDark.on { display: block; }
#stuCombo { position: fixed; right: calc(18px + env(safe-area-inset-right)); top: 34%; pointer-events: none; opacity: 0;
  font-size: 22px; font-weight: 800; color: #ffe066; text-shadow: 0 2px 3px #111318, 0 0 2px #111318; transition: opacity .2s; }
#stuCombo.on { opacity: 1; }
#stuCombo.pop { animation: stuPop .18s ease-out; }
@keyframes stuPop { from { transform: scale(1.35); } to { transform: scale(1); } }
#stuSpell { position: fixed; left: 50%; top: 36%; pointer-events: none; opacity: 0; z-index: 2; text-align: center; white-space: nowrap;
  transform: translate(-50%, -50%); }
#stuSpell .w { display: block; font-size: clamp(30px, 7.2vw, 66px); font-weight: 900; color: #fff;
  -webkit-text-stroke: 3px var(--c, #1d4ed8); paint-order: stroke fill; text-shadow: 0 0 18px var(--c, #1d4ed8), 0 3px 0 #111318; }
#stuSpell .w bdi { font-family: Arial, 'Segoe UI', Tahoma, sans-serif; }
#stuSpell small { display: block; margin-top: 4px; font-size: 16px; font-weight: 700; color: #f5c542; text-shadow: 0 2px 3px #111318; }
#stuSpell.on { animation: stuSpell 1.35s ease-out both; }
@keyframes stuSpell { 0% { opacity: 0; transform: translate(-50%, -50%) scale(.3); } 14% { opacity: 1; transform: translate(-50%, -50%) scale(1.08); }
  22% { transform: translate(-50%, -50%) scale(1); } 78% { opacity: 1; } 100% { opacity: 0; transform: translate(-50%, -50%) scale(1); } }
.modes { display: inline-flex; vertical-align: bottom; justify-content: center; flex-wrap: wrap; gap: 8px 12px; margin: 12px 6px 0; }
.panel .modes button { margin: 0; min-width: 210px; }
.panel .modes button small { display: block; margin-top: 2px; font-size: 12px; font-weight: 400; color: #eef3fa; }
.panel button.stu { background: #b4532a; }
.panel.sel { max-width: 780px; padding-top: 14px; }
.sel .tabs { display: inline-flex; border: 2px solid #111318; border-radius: 6px; overflow: hidden; }
.panel.sel .tabs button { margin: 0; padding: 6px 14px; border: 0; border-radius: 0; background: #33465e; color: #dfe6f2; font-size: 14px; }
.panel.sel .tabs button.on { background: #b4532a; color: #fff; }
.sel h1 { margin: 6px 0 2px; }
.sel .lbl { margin: 6px 0 4px; font-size: 13px; color: #c9d3e6; text-align: left; }
.sel .heroes, .sel .spells { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
.panel.sel .heroes button, .panel.sel .spells button { margin: 0; padding: 6px; border-radius: 6px; border: 2px solid #111318; background: #253447;
  color: #dfe6f2; font-weight: 400; text-align: left; line-height: 1.3; }
.panel.sel .heroes button { display: flex; gap: 6px; align-items: center; font-size: 11px; }
.panel.sel .heroes button img { width: 40px; height: 47px; flex: none; image-rendering: pixelated; }
.panel.sel .heroes button b { display: block; font-size: 15px; color: #fff; }
.panel.sel .spells button { font-size: 12px; text-align: center; }
.panel.sel .spells button small { display: block; color: #9fb0c8; font-size: 11px; }
.panel.sel .spells button bdi { font-family: Arial, 'Segoe UI', Tahoma, sans-serif; font-weight: 700; color: #fff; }
.panel.sel .heroes button.on, .panel.sel .spells button.on { border-color: #f5c542; box-shadow: 0 0 0 2px #f5c542 inset; background: #3a2f1c; }
.sel .srow.center { margin: 6px 0 0; }
.result.stu h1 { letter-spacing: 6px; }
.result.stu .who { margin: 0; font-size: 14px; color: #c9d3e6; }
.result.stu table.rep { margin: 6px auto; border-collapse: collapse; font-size: 14px; }
.result.stu table.rep th { padding: 3px 9px; font-size: 12px; color: #9fb0c8; font-weight: 700; border-bottom: 1px solid rgba(255,255,255,.3); }
.result.stu table.rep td { text-align: center; padding: 3px 9px; }
.result.stu table.rep td.g { padding: 1px 6px; }
.result.stu .gs { display: inline-block; min-width: 34px; padding: 0 4px; border: 3px solid #d0202f; border-radius: 50%; color: #ff6b6b;
  font-weight: 900; font-size: 17px; line-height: 28px; transform: rotate(-8deg); background: rgba(255,250,238,.06); }
.result.stu .gs.F { border-color: #9aa3ad; color: #c9ced8; }
.result.stu .gpa { font-size: 16px; color: #dfe6f2; }
.result.stu .gpa b { font-size: 26px; color: #f5c542; margin: 0 4px; }
#stuEnd { position: fixed; inset: 0; z-index: 6; display: none; overflow: hidden; font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif; }
#stuEnd.on { display: block; }
#stuEnd .shade { position: absolute; inset: 0; background: linear-gradient(rgba(11,13,18,.72), rgba(11,13,18,.15) 30%, rgba(11,13,18,.15) 70%, rgba(11,13,18,.72)); }
#stuEnd .line { position: absolute; left: 50%; top: 9%; transform: translateX(-50%); width: min(94vw, 900px); text-align: center; font-size: clamp(16px, 2.6vw, 24px);
  font-weight: 800; color: #fff; text-shadow: 0 2px 3px #111318, 0 0 3px #111318; opacity: 0; transition: opacity .25s; }
#stuEnd .line.on { opacity: 1; }
#stuEnd .dip { position: absolute; left: 50%; top: 50%; width: min(84vw, 420px); aspect-ratio: 340 / 214; box-sizing: border-box; padding: 3.2% 4%;
  background: #fbf8f0; border: 5px solid #d9b44a; outline: 1.5px solid #d9b44a; outline-offset: -12px; color: #1d1d22; text-align: center;
  transform: translate(-50%, -50%) scale(.6); opacity: 0; transition: transform .32s cubic-bezier(.2,1.4,.4,1), opacity .25s; box-shadow: 6px 7px 0 rgba(0,0,0,.25); }
#stuEnd .dip.on { transform: translate(-50%, -50%) scale(1); opacity: 1; }
#stuEnd .dip img { height: 13%; }
#stuEnd .dip h2 { margin: 1% 0 0; font-size: clamp(18px, 3.4vw, 28px); letter-spacing: 8px; }
#stuEnd .dip .nm { margin: 2% 0; font-size: clamp(13px, 2.2vw, 18px); font-weight: 800; }
#stuEnd .dip .tx { font-size: clamp(10px, 1.6vw, 13px); line-height: 1.6; color: #374151; }
#stuEnd .dip .sg { position: absolute; right: 5%; bottom: 7%; font-size: clamp(10px, 1.6vw, 13px); font-weight: 800; }
#stuEnd .dip .ok { position: absolute; right: 7%; bottom: 3%; width: 32%; aspect-ratio: 2 / 1; display: flex; align-items: center; justify-content: center;
  border: 5px solid #d0202f; border-radius: 12px; color: #d0202f; font-size: clamp(22px, 4vw, 40px); font-weight: 900; opacity: 0;
  transform: rotate(-9deg) scale(2.6); }
#stuEnd .dip .ok.on { animation: stuSlam .18s ease-in both; }
@keyframes stuSlam { to { opacity: .92; transform: rotate(-9deg) scale(1); } }
#stuEnd .ring { position: absolute; left: 50%; top: 72%; transform: translate(-50%, -50%); font-size: clamp(30px, 6vw, 48px); font-weight: 900; color: #ffe066;
  text-shadow: 0 0 2px #111318, 0 3px 0 #111318; opacity: 0; }
#stuEnd .ring.on { opacity: 1; animation: stuRing .11s linear infinite alternate; }
@keyframes stuRing { from { transform: translate(-50%, -50%) scale(1); } to { transform: translate(-50%, -50%) scale(1.15); } }
#stuEnd.shake { animation: stuShake .14s linear infinite; }
@keyframes stuShake { 0% { transform: translate(0, 0) rotate(0); } 25% { transform: translate(-6px, 3px) rotate(-1deg); } 50% { transform: translate(5px, -4px) rotate(1deg); } 75% { transform: translate(-3px, -2px) rotate(-.5deg); } }
#stuEnd .flash { position: absolute; inset: 0; background: #fff; opacity: 0; pointer-events: none; }
#stuEnd .flash.on { animation: stuFlash .5s ease-out both; }
@keyframes stuFlash { from { opacity: 1; } to { opacity: 0; } }
#stuEnd .room { position: absolute; inset: 0; display: none; background: #e8dcc8; }
#stuEnd .room.on { display: block; }
#stuEnd .room .floor { position: absolute; left: 0; right: 0; bottom: 0; height: 26%; background: repeating-linear-gradient(#a87a50 0 24px, #94683f 24px 26px); border-top: 10px solid #bfa98a; }
#stuEnd .room .win { position: absolute; right: 8%; top: 9%; width: 22%; height: 34%; background: linear-gradient(#bfe6ff 55%, #dff3ff 55%);
  border: 8px solid #fff; outline: 6px solid #6b8fd6; }
#stuEnd .room .win::after { content: ''; position: absolute; right: 18%; top: 16%; width: 18%; aspect-ratio: 1; border-radius: 50%; background: #fff3b0; }
#stuEnd .room .poster { position: absolute; left: 33%; top: 12%; width: 9.5%; height: 24%; background: #002c52; border: 2px solid #1d1d22;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6%; }
#stuEnd .room .poster img { width: 62%; }
#stuEnd .room .cal { position: absolute; left: 47%; top: 15%; width: 13.5%; height: 24%; background: #fff; border: 2px solid #1d1d22; box-sizing: border-box; }
#stuEnd .room .cal b { display: block; background: #d0202f; color: #fff; text-align: center; font-size: clamp(9px, 1.4vw, 14px); padding: 4% 0; }
#stuEnd .room .cal i { position: absolute; left: 41%; top: 55%; width: 22%; aspect-ratio: 1; border: 3px solid #d0202f; border-radius: 50%; }
#stuEnd .room .bed { position: absolute; left: 6%; bottom: 18%; width: 50%; height: 15%; background: #8b5a2b; border: 2px solid #1d1d22; }
#stuEnd .room .bed::before { content: ''; position: absolute; left: 3%; top: -40%; width: 18%; height: 55%; background: #fff; border: 2px solid #1d1d22; }
#stuEnd .room .bed::after { content: ''; position: absolute; left: 24%; right: 0; top: -55%; height: 80%; background: #4f7cc4; border: 2px solid #1d1d22; }
#stuEnd .room .clock { position: absolute; left: 63%; bottom: 25%; width: 6%; aspect-ratio: 1; background: #d0202f; border: 2px solid #1d1d22; border-radius: 8px; }
#stuEnd .room .clock::after { content: ''; position: absolute; inset: 18%; background: #fff; border-radius: 50%; }
#stuEnd .room.ringing .clock { animation: stuClock .06s linear infinite alternate; }
@keyframes stuClock { from { transform: rotate(-9deg); } to { transform: rotate(9deg); } }
#stuEnd .sub { position: absolute; left: 50%; transform: translateX(-50%); white-space: nowrap; font-weight: 900; opacity: 0; transition: opacity .3s;
  text-shadow: 0 2px 0 #111318, 0 0 3px #111318; }
#stuEnd .sub.on { opacity: 1; }
#stuEnd .sub.a { bottom: 15%; font-size: clamp(18px, 3vw, 28px); color: #fff; }
#stuEnd .sub.b { bottom: 6%; font-size: clamp(20px, 3.4vw, 32px); color: #ffe066; }
#stuEnd .skip { position: absolute; right: calc(12px + env(safe-area-inset-right)); top: calc(12px + env(safe-area-inset-top)); z-index: 2;
  padding: 6px 12px; border-radius: 6px; border: 2px solid rgba(255,255,255,.5); background: rgba(11,13,18,.6); color: #fff; font: 700 13px 'Malgun Gothic', sans-serif; }
@media (max-height: 500px) {
  /* 휴대폰 가로: 타이틀을 넓게 써서 모드 단추 옆에 설정·본편 단추가 한 줄로 서게 */
  .panel:has(> .modes) { max-width: 840px; }
  .modes { margin-top: 6px; }
  .panel .modes button { min-width: 180px; padding: 6px 14px; }
  .panel .modes button small { font-size: 11px; }
  .panel.sel { padding: 6px 14px; }
  .sel h1 { font-size: 20px; margin: 2px 0 0; }
  .sel .lbl { margin: 3px 0 2px; font-size: 12px; }
  .panel.sel .heroes button { padding: 3px 5px; font-size: 10.5px; line-height: 1.25; }
  .panel.sel .heroes button img { width: 32px; height: 38px; }
  .panel.sel .heroes button b { font-size: 13px; }
  .panel.sel .spells button { padding: 3px 4px; font-size: 11px; }
  .panel.sel .tabs button { padding: 4px 12px; font-size: 13px; }
  .sel .srow.center { margin: 3px 0 0; }
  .result.stu table.rep td, .result.stu table.rep th { padding: 1px 7px; font-size: 12px; }
  .result.stu .gs { font-size: 14px; line-height: 22px; min-width: 28px; border-width: 2px; }
  .result.stu .gpa b { font-size: 20px; }
}
`;

let injected = false;

/** 학생 모드 모양과 늘 있는 요소(연속 통과·주문 글자·엔딩 판)를 한 번 넣는다 */
export function ensureDom(): void {
  if (injected) return;
  injected = true;
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  for (const [id, cls] of [
    ['stuCombo', 'hud'],
    ['stuSpell', 'hud'],
    ['stuEnd', ''],
  ]) {
    const el = document.createElement('div');
    el.id = id;
    if (cls) el.className = cls;
    document.body.appendChild(el);
  }
}

export const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);

/** "DEADLINE EXTENDED! (마감 연장!)" — 원문은 bdi로 감싸 아랍어(rtl)와 괄호가 섞이지 않게 한다 */
export function spellHtml(s: SpellDef): string {
  return `<bdi dir="${s.rtl ? 'rtl' : 'ltr'}">${esc(s.text)}</bdi> (${esc(s.meaning)})`;
}

/** 필살기: 주문 큰 글자 */
export function showSpell(s: SpellDef): void {
  const el = document.getElementById('stuSpell');
  if (!el) return;
  el.style.setProperty('--c', `#${s.color.toString(16).padStart(6, '0')}`);
  el.innerHTML = `<span class="w">${spellHtml(s)}</span><small>${esc(s.lang)} 주문</small>`;
  el.classList.remove('on');
  void el.offsetWidth;
  el.classList.add('on');
}

export function hideSpell(): void {
  document.getElementById('stuSpell')?.classList.remove('on');
}

let comboShown = 0;

export function showCombo(n: number): void {
  const el = document.getElementById('stuCombo');
  if (!el) return;
  if (n < 2) {
    if (comboShown) el.classList.remove('on');
    comboShown = 0;
    return;
  }
  if (n === comboShown) return;
  comboShown = n;
  el.textContent = `${n} 연속 통과!`;
  el.classList.add('on');
  el.classList.remove('pop');
  void el.offsetWidth;
  el.classList.add('pop');
}

// ---------- 성공 엔딩 (DOM 카드) ----------

export interface EndingText {
  name: string;
}

/** 엔딩을 띄운다. 끝나거나 건너뛰면 done을 부른다. skip = 바로 건너뛰기, cancel = done 없이 거두기 */
export function playEnding(t: EndingText, done: () => void): { skip: () => void; cancel: () => void } {
  const root = document.getElementById('stuEnd') as HTMLElement;
  const name = esc(t.name);
  root.className = 'on';
  root.innerHTML = `
    <div class="shade"></div>
    <div class="line" id="seL1">${name}: "서류 제출했습니다, 졸업 승인해 주세요!"</div>
    <div class="line" id="seL2">프레지던트 캉: "졸업 서류, 이제 다 갖췄네요. 졸업 승인합니다."</div>
    <div class="line" id="seL3" style="color:#7CFC9A">${name}: "졸업이다!"</div>
    <div class="dip" id="seDip">
      <img src="hufs/emblem.png" alt="">
      <h2>졸 업 장</h2>
      <div class="nm">성명&nbsp;&nbsp;${name}</div>
      <div class="tx">위 사람은 반려된 졸업 서류를 끝까지 들고<br>총장실까지 찾아왔으므로 이 증서를 수여함.</div>
      <div class="sg">총장&nbsp;&nbsp;프레지던트 캉</div>
      <div class="ok" id="seOk">승인</div>
    </div>
    <div class="ring" id="seRing">따르릉! 따르릉!</div>
    <div class="room" id="seRoom">
      <div class="win"></div>
      <div class="poster"><img src="hufs/emblem-mono.png" alt=""><img src="hufs/hufs-type.png" alt=""></div>
      <div class="cal"><b>수강신청일</b><i></i></div>
      <div class="floor"></div>
      <div class="bed"></div>
      <div class="clock"></div>
      <div class="sub a" id="seS1">…꿈이었다.</div>
      <div class="sub b" id="seS2">오늘은 수강신청 날이다.</div>
    </div>
    <div class="flash" id="seFlash"></div>
    <button class="skip" type="button" id="seSkip">건너뛰기</button>`;
  const timers: number[] = [];
  const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));
  const on = (id: string, v = true) => document.getElementById(id)?.classList.toggle('on', v);
  let finished = false;
  const cancel = () => {
    if (finished) return false;
    finished = true;
    for (const id of timers) clearTimeout(id);
    root.className = '';
    root.innerHTML = '';
    return true;
  };
  const finish = () => {
    if (cancel()) done();
  };
  at(150, () => on('seL1'));
  at(1750, () => on('seL1', false));
  at(1900, () => on('seL2'));
  at(3600, () => on('seL2', false));
  at(3500, () => on('seDip'));
  at(4500, () => {
    on('seOk');
    root.classList.add('shake');
  });
  at(4700, () => root.classList.remove('shake'));
  at(5000, () => on('seL3'));
  at(6500, () => {
    on('seL3', false);
    on('seRing');
    root.classList.add('shake');
  });
  at(8000, () => {
    root.classList.remove('shake');
    on('seRing', false);
    on('seDip', false);
    on('seFlash');
    const room = document.getElementById('seRoom');
    room?.classList.add('on', 'ringing');
  });
  at(8700, () => on('seS1'));
  at(9400, () => document.getElementById('seRoom')?.classList.remove('ringing'));
  at(9800, () => on('seS2'));
  at(12200, finish);
  root.onclick = finish;
  return { skip: finish, cancel: () => void cancel() };
}
