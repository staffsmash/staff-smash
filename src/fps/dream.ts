// 1인칭 교직원 모드 꿈 엔딩 (사용자 2026-11-21): 총장이 "퇴근 승인"·"월급 인상" 도장을 찍어 준 뒤 약 8초.
// 1) 화면이 하얗게 흐려지고 멀리서 휴대폰 알람이 점점 커진다 (Sfx 'alarm')
// 2) 어두운 방, 휴대폰 화면만 보인다: "오전 7:00 · 출근 알람" + "다시 알림 / 끄기" (단추 모양만)
// 3) "…꿈이었다." → 잠시 뒤 "오늘도 출근합니다."
// 4) 결과 화면 (main.ts finish — 제목 아래 "(꿈속 기록)")
// 1.5초가 지나면 Enter·Space·클릭(터치)으로 건너뛴다 (2D EndingScene과 같다).
// 화면 조각은 fps.html을 그대로 두고 여기서 넣는다.

/** 화면 문구 (사용자 확정 2026-11-21 — 글자 그대로) */
const T = {
  alarm: '오전 7:00 · 출근 알람',
  snooze: '다시 알림',
  off: '끄기',
  dream: '…꿈이었다.',
  work: '오늘도 출근합니다.',
} as const;

/** 장면 시각 (ms): 하얘짐 끝 → 방·휴대폰 → 끄기 → 꿈이었다 → 출근합니다 → 끝 */
const AT = { room: 1700, off: 4300, line1: 4600, line2: 6100, end: 8000, skip: 1500 } as const;
/** 알람 소리 간격 (ms) */
const BEEP_MS = 650;

export interface DreamHost {
  /** 게임 화면 (흐리게 한다) */
  canvas: HTMLElement;
  /** 알람 한 번 (vol 0~1) */
  beep(vol: number): void;
}

const CSS = `
#dream { position: fixed; inset: 0; z-index: 50; cursor: pointer; user-select: none; -webkit-user-select: none; touch-action: manipulation; }
#dream .dr-white { position: absolute; inset: 0; background: #fff; opacity: 0; transition: opacity 1.6s ease-in; }
#dream.white .dr-white { opacity: 1; }
#dream .dr-room { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 42%, #101a2c 0%, #05070b 62%); opacity: 0; transition: opacity 0.6s;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 22px; }
#dream.room .dr-room { opacity: 1; }
#dream .dr-phone { width: 250px; height: min(430px, 60vh); border-radius: 34px; background: #111318; border: 3px solid #2a3140; padding: 12px;
  box-shadow: 0 0 70px rgba(120, 170, 255, 0.28); box-sizing: border-box; }
#dream.room.ring .dr-phone { animation: drBuzz 0.14s linear infinite; }
#dream .dr-screen { width: 100%; height: 100%; border-radius: 24px; background: linear-gradient(180deg, #14294f 0%, #0b2a4a 100%);
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px; color: #fff; }
#dream .dr-bell svg { width: 46px; height: 46px; display: block; }
#dream.ring .dr-bell { animation: drBell 0.5s ease-in-out infinite; }
#dream .dr-time { margin: 0; font-size: 20px; font-weight: 800; white-space: nowrap; letter-spacing: -0.3px; }
#dream .dr-btns { display: flex; gap: 10px; }
#dream .dr-btns span { min-width: 82px; padding: 9px 0; border-radius: 22px; font-size: 15px; font-weight: 700; text-align: center;
  border: 2px solid rgba(255, 255, 255, 0.55); color: #fff; transition: transform 0.12s, background 0.12s; }
#dream .dr-btns .off { background: #f5c542; border-color: #f5c542; color: #14294f; }
#dream.offed .dr-btns .off { transform: scale(0.9); background: #d9a92a; }
#dream .dr-line { margin: 0; min-height: 30px; font-size: 24px; font-weight: 800; color: #fff; opacity: 0; transform: translateY(6px);
  transition: opacity 0.6s, transform 0.6s; text-shadow: 0 2px 6px #000; }
#dream .dr-line.on { opacity: 1; transform: none; }
#dream .dr-lines { display: flex; flex-direction: column; align-items: center; gap: 6px; }
#dream .dr-line.l2 { color: #f5c542; }
@keyframes drBuzz { 0% { transform: translateX(-2px) rotate(-0.8deg); } 50% { transform: translateX(2px) rotate(0.8deg); } 100% { transform: translateX(-2px) rotate(-0.8deg); } }
@keyframes drBell { 0%, 100% { transform: rotate(-14deg); } 50% { transform: rotate(14deg); } }
@media (max-height: 500px) {
  #dream .dr-room { flex-direction: row; gap: 28px; }
  #dream .dr-phone { width: 290px; height: min(220px, 66vh); }
  #dream .dr-screen { gap: 12px; }
  #dream .dr-bell svg { width: 34px; height: 34px; }
  #dream .dr-lines { align-items: flex-start; }
}
`;

const BELL =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#f5c542" d="M12 2a1.5 1.5 0 0 0-1.5 1.5v.6A6 6 0 0 0 6 10v4.5L4 17v1h16v-1l-2-2.5V10a6 6 0 0 0-4.5-5.9v-.6A1.5 1.5 0 0 0 12 2zm-2 17a2 2 0 0 0 4 0z"/></svg>';

let styled = false;

/** 꿈 엔딩을 틀고, 끝나거나 건너뛰면 done을 한 번 부른다 */
export function playDream(h: DreamHost, done: () => void): void {
  if (!styled) {
    styled = true;
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  const el = document.createElement('div');
  el.id = 'dream';
  el.innerHTML = `
    <div class="dr-white"></div>
    <div class="dr-room">
      <div class="dr-phone"><div class="dr-screen">
        <div class="dr-bell">${BELL}</div>
        <p class="dr-time">${T.alarm}</p>
        <div class="dr-btns"><span>${T.snooze}</span><span class="off">${T.off}</span></div>
      </div></div>
      <div class="dr-lines"><p class="dr-line l1">${T.dream}</p><p class="dr-line l2">${T.work}</p></div>
    </div>`;
  document.body.appendChild(el);
  const cv = h.canvas.style;
  const start = performance.now();
  const timers: number[] = [];
  const at = (ms: number, f: () => void) => timers.push(window.setTimeout(f, ms));
  let ended = false;

  // 멀리서 울리는 알람이 점점 커진다 (끄기를 누르면 멈춘다)
  let n = 0;
  const beep = window.setInterval(() => h.beep(Math.min(1, 0.12 + 0.14 * n++)), BEEP_MS);
  h.beep(0.08);

  // 1) 하얗게 흐려진다 (처음 모습을 한 번 그린 뒤 바꿔야 전환이 보인다 — 가려진 탭에서도 되게 rAF 대신 offsetWidth)
  void el.offsetWidth;
  cv.transition = 'filter 1.6s ease-in';
  cv.filter = 'blur(6px)';
  el.classList.add('white', 'ring');
  // 2) 어두운 방 · 휴대폰
  at(AT.room, () => el.classList.add('room'));
  at(AT.off, () => {
    el.classList.add('offed');
    el.classList.remove('ring');
    window.clearInterval(beep);
  });
  // 3) 꿈이었다 → 오늘도 출근합니다
  at(AT.line1, () => el.querySelector('.l1')?.classList.add('on'));
  at(AT.line2, () => el.querySelector('.l2')?.classList.add('on'));

  const end = () => {
    if (ended) return;
    ended = true;
    window.clearInterval(beep);
    for (const t of timers) window.clearTimeout(t);
    window.removeEventListener('keydown', onKey);
    el.removeEventListener('click', onClick);
    el.remove();
    cv.transition = '';
    cv.filter = '';
    done();
  };
  const canSkip = () => performance.now() - start >= AT.skip;
  const onKey = (e: KeyboardEvent) => {
    if (e.code !== 'Enter' && e.code !== 'Space' && e.code !== 'NumpadEnter') return;
    e.preventDefault();
    if (canSkip()) end();
  };
  // 클릭(터치 뒤 click)으로 건너뛴다: pointerdown이면 곧이어 오는 click이 결과 화면 단추를 누를 수 있다
  const onClick = () => {
    if (canSkip()) end();
  };
  window.addEventListener('keydown', onKey);
  el.addEventListener('click', onClick);
  // 4) 결과 화면
  at(AT.end, end);
}
