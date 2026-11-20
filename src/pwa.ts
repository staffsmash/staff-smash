// 홈 화면에 추가한 "앱"(Three Party Problem)으로 열렸는지 판단하고, 휴대폰 브라우저에서는 설치 안내 한 줄을 띄운다.
// 2D(src/main.ts → TitleScene)와 1인칭(src/fps/main.ts) 두 진입점이 같이 쓴다. 첫 화면은 app.html (manifest의 start_url).
// - 앱(standalone·fullscreen, 아이폰 navigator.standalone)으로 열렸을 때만 타이틀에 "처음으로"(→ app.html)가 보인다.
// - 설치 안내: 터치 기기 + 브라우저(앱 아님) + 타이틀 화면에서만. ×를 누르면 이 기기(localStorage)에 기억해 다시 안 띄운다.
// - service worker·오프라인 캐시는 일부러 넣지 않는다 (늘 최신 판이 열리게).

/** 첫 화면(두 게임 고르기) 주소. 2D·1인칭 모두 사이트 맨 위 폴더에 있으므로 상대 경로로 충분하다 */
export const APP_HOME = './app.html';

const CLOSED_KEY = 'tpp-install-hint-closed';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function mq(q: string): boolean {
  return typeof matchMedia === 'function' && matchMedia(q).matches;
}

/** 지금 이 순간 앱 모드인가. 브라우저에서 게임이 전체 화면(requestFullscreen)을 켠 것은 앱으로 치지 않는다 */
function detectApp(): boolean {
  if ((navigator as Navigator & { standalone?: boolean }).standalone === true) return true;
  if (mq('(display-mode: standalone)')) return true;
  return mq('(display-mode: fullscreen)') && !document.fullscreenElement;
}

// 페이지를 연 순간의 판단을 기억한다 (앱 안에서 게임이 전체 화면을 켰다가 타이틀로 돌아와도 앱으로 본다)
const OPENED_AS_APP = detectApp();

/** 홈 화면 앱으로 열렸는가 */
export function isApp(): boolean {
  return OPENED_AS_APP || detectApp();
}

function isTouch(): boolean {
  return mq('(pointer: coarse)');
}

function isIOS(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

function closedBefore(): boolean {
  try {
    return localStorage.getItem(CLOSED_KEY) === '1';
  } catch {
    return false;
  }
}

/** 1인칭 타이틀 링크 줄(.tlinks)에 넣을 "처음으로" (앱일 때만, 아니면 빈 글자) */
export function appHomeLink(): string {
  return isApp() ? `<a href="${APP_HOME}">처음으로</a>` : '';
}

/** 첫 화면으로 */
export function goAppHome(): void {
  location.assign(APP_HOME);
}

// ---------- 설치 안내 띠 ----------

let deferred: InstallPromptEvent | null = null;
let onTitle = false;
let bar: HTMLDivElement | null = null;
let installed = false;

const CSS = `
#pwaHint { position: fixed; z-index: 9; left: 50%; transform: translateX(-50%);
  bottom: calc(8px + env(safe-area-inset-bottom)); max-width: calc(100vw - 24px - env(safe-area-inset-left) - env(safe-area-inset-right));
  box-sizing: border-box; display: flex; align-items: center; gap: 8px; padding: 6px 6px 6px 12px;
  background: rgba(0, 44, 82, .94); border: 1px solid #e0bb62; border-radius: 999px; color: #fff;
  font: 600 12.5px/1.35 'Malgun Gothic', 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif;
  box-shadow: 0 2px 10px rgba(0, 0, 0, .35); pointer-events: auto; touch-action: manipulation; -webkit-user-select: none; user-select: none; }
#pwaHint[hidden] { display: none; }
#pwaHint .msg { flex: 1 1 auto; min-width: 0; }
#pwaHint button { flex: none; border: 0; font: inherit; cursor: pointer; }
#pwaHint .inst { padding: 5px 12px; border-radius: 999px; background: #e0bb62; color: #002c52; font-weight: 800; }
#pwaHint .x { width: 28px; height: 28px; border-radius: 50%; background: rgba(255, 255, 255, .14); color: #fff; font-size: 16px; line-height: 28px; padding: 0; }
`;

function message(): { text: string; button: boolean } {
  if (isIOS()) return { text: '공유 → 홈 화면에 추가하면 앱처럼 전체 화면으로 할 수 있어요', button: false };
  if (deferred) return { text: '홈 화면에 설치하면 앱처럼 전체 화면으로 할 수 있어요', button: true };
  return { text: '브라우저 메뉴 → 홈 화면에 추가하면 앱처럼 전체 화면으로 할 수 있어요', button: false };
}

function wanted(): boolean {
  return onTitle && !installed && !isApp() && isTouch() && !closedBefore();
}

function render(): void {
  if (!wanted()) {
    if (bar) bar.hidden = true;
    return;
  }
  if (!bar) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.append(style);
    bar = document.createElement('div');
    bar.id = 'pwaHint';
    bar.setAttribute('role', 'note');
    document.body.append(bar);
    // 안내를 눌러도 아래 게임 화면(캔버스)이 같이 눌리지 않게
    for (const ev of ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'mousedown', 'click']) {
      bar.addEventListener(ev, (e) => e.stopPropagation());
    }
  }
  const m = message();
  bar.innerHTML = `${m.button ? '<button class="inst" type="button">앱 설치</button>' : ''}<span class="msg"></span><button class="x" type="button" aria-label="닫기">×</button>`;
  (bar.querySelector('.msg') as HTMLElement).textContent = m.text;
  bar.querySelector('.inst')?.addEventListener('click', () => void install());
  bar.querySelector('.x')?.addEventListener('click', () => {
    try {
      localStorage.setItem(CLOSED_KEY, '1');
    } catch {
      /* 저장을 막은 브라우저는 이번만 닫는다 */
    }
    if (bar) bar.hidden = true;
  });
  bar.hidden = false;
}

async function install(): Promise<void> {
  const e = deferred;
  if (!e) return;
  deferred = null;
  try {
    await e.prompt();
    const choice = await e.userChoice;
    if (choice.outcome === 'accepted') installed = true;
  } catch {
    /* 이미 쓴 이벤트 등 */
  }
  render();
}

/** 타이틀 화면이 떴다 (설치 안내를 보여도 된다) */
export function titleShown(): void {
  onTitle = true;
  render();
}

/** 타이틀을 떠났다 (게임 시작·다른 화면) — 안내를 숨긴다 */
export function titleLeft(): void {
  onTitle = false;
  if (bar) bar.hidden = true;
}

// 크롬(안드로이드)이 설치를 제안할 수 있으면 오는 이벤트. 기본 미니 안내줄 대신 우리 띠의 "앱 설치" 단추로 받는다
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferred = e as InstallPromptEvent;
  render();
});
window.addEventListener('appinstalled', () => {
  installed = true;
  deferred = null;
  render();
});
