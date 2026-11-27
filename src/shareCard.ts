// 결과 공유 그림 (PRD 결정 60, 2026-11-27 사용자 "가"). 2D 기록 화면·1인칭 결과 화면의 "공유" 단추가 쓴다.
// 1080×1080 정사각형: 배지·게임 이름 / 2D·1인칭 · 모드 · 난이도 / 인물 그림·이름 / 결과(퇴근 시각 등) / 평정·학점 / 최대 연속 / 닉네임(남겼을 때만) / 주소.
// 실명·학번 칸은 없다.
//
// 쓰는 법: 결과 화면이 뜰 때 const sh = prepareShare(data) 로 그림을 미리 그려 두고, 단추를 누르면 sh.share().
// (아이폰 사파리는 누른 순간 곧바로 navigator.share를 불러야 공유 창이 뜬다 — 누른 뒤에 그림을 그리면 막힌다)
// 휴대폰: 공유 창(카톡 등) / 공유할 수 없는 브라우저(PC 등): PNG 파일로 저장.

export interface ResultShare {
  game: '2d' | 'fps';
  mode: 'staff' | 'student';
  /** '초보' · '중급' · '고급' */
  diffLabel: string;
  heroName: string;
  /** 인물 그림 (data URL 또는 캔버스). 없으면 빈 칸 없이 이름만 */
  portrait?: string | HTMLCanvasElement | null;
  /** 결과 한 줄: "퇴근 17:03 · 3분 초과근무", "2스테이지에서 야근 확정 (16:58)" … (run.ts outcomeText long 등) */
  outcome: string;
  /** 평정·학점 한 줄: "근무평정 A · S · B", "학점 A+ · A0 · GPA 4.25" */
  gradesLine: string;
  /** "최대 연속 처리 24회" (없으면 안 씀) */
  comboLine?: string;
  /** 기록판 닉네임 (비었으면 안 씀) */
  nickname?: string;
  /** 이어하기를 썼으면 작게 "이어하기 1회" */
  continued?: boolean;
}

export type ShareOutcome = 'shared' | 'saved' | 'cancelled' | 'failed';

const W = 1080;
const FONT = "'Malgun Gothic', 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif";
const SITE = 'staffsmash.github.io/staff-smash';
const FILE = 'three-party-problem.png';

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((res) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => res(null);
    im.src = src;
  });
}

/** 너비를 넘으면 글자 크기를 줄여 한 줄에 맞춘다 */
function fitText(g: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, size: number, weight = 700, minSize = 22): void {
  let s = size;
  g.font = `${weight} ${s}px ${FONT}`;
  while (g.measureText(text).width > maxW && s > minSize) {
    s -= 2;
    g.font = `${weight} ${s}px ${FONT}`;
  }
  g.fillText(text, x, y, maxW);
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** 공유 그림을 그린다 */
export async function drawShareCard(d: ResultShare): Promise<HTMLCanvasElement> {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = W;
  const g = c.getContext('2d') as CanvasRenderingContext2D;

  // 바탕: 남색 + 위쪽이 밝은 둥근 빛 (app.html과 같은 색)
  const bg = g.createRadialGradient(W / 2, 260, 60, W / 2, 420, 900);
  bg.addColorStop(0, '#0b4274');
  bg.addColorStop(0.6, '#002c52');
  bg.addColorStop(1, '#001d38');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, W);
  g.strokeStyle = '#e0bb62';
  g.lineWidth = 10;
  roundRect(g, 22, 22, W - 44, W - 44, 36);
  g.stroke();

  const [badge, portrait] = await Promise.all([
    loadImage('logo/badge.png'),
    typeof d.portrait === 'string' ? loadImage(d.portrait) : Promise.resolve(d.portrait ?? null),
  ]);

  // 위: 배지 + 게임 이름 + 판 정보
  if (badge) g.drawImage(badge, 64, 60, 210, 210);
  g.textBaseline = 'alphabetic';
  g.textAlign = 'left';
  g.fillStyle = '#ffffff';
  fitText(g, 'Three Party Problem', 300, 160, W - 300 - 70, 70, 900);
  g.fillStyle = '#e0bb62';
  g.fillRect(302, 182, 150, 8);
  const modeText = `${d.game === '2d' ? '2D' : '1인칭'} · ${d.mode === 'staff' ? '교직원 모드' : '학생 모드'} · ${d.diffLabel}`;
  g.fillStyle = '#c9d3e6';
  fitText(g, modeText, 300, 245, W - 300 - 70, 38, 700);

  // 가운데: 인물 그림 + 이름·결과
  const boxX = 80;
  const boxY = 330;
  const boxW = 300;
  const boxH = 350;
  g.fillStyle = 'rgba(255,255,255,0.1)';
  roundRect(g, boxX, boxY, boxW, boxH, 24);
  g.fill();
  if (portrait) {
    const pw = 'naturalWidth' in portrait ? portrait.naturalWidth : (portrait as HTMLCanvasElement).width;
    const ph = 'naturalHeight' in portrait ? portrait.naturalHeight : (portrait as HTMLCanvasElement).height;
    if (pw > 0 && ph > 0) {
      const k = Math.min((boxW - 40) / pw, (boxH - 40) / ph);
      const w = pw * k;
      const h = ph * k;
      g.imageSmoothingEnabled = false; // 블록 그림은 또렷하게
      g.drawImage(portrait, boxX + (boxW - w) / 2, boxY + boxH - 20 - h, w, h);
      g.imageSmoothingEnabled = true;
    }
  }
  const tx = boxX + boxW + 50;
  const tw = W - tx - 80;
  g.fillStyle = '#ffffff';
  fitText(g, d.heroName, tx, boxY + 80, tw, 72, 900);
  g.fillStyle = '#f5c542';
  fitText(g, d.outcome, tx, boxY + 170, tw, 50, 800);
  g.fillStyle = '#ffffff';
  fitText(g, d.gradesLine, tx, boxY + 250, tw, 40, 700);
  if (d.comboLine) {
    g.fillStyle = '#c9d3e6';
    fitText(g, d.comboLine, tx, boxY + 320, tw, 36, 700);
  }

  // 아래: 닉네임 · 이어하기 · 주소
  let y = 790;
  if (d.nickname) {
    g.fillStyle = '#ffffff';
    g.textAlign = 'center';
    fitText(g, `닉네임 ${d.nickname}`, W / 2, y, W - 160, 40, 700);
    y += 56;
  }
  if (d.continued) {
    g.fillStyle = '#9fb0c8';
    g.textAlign = 'center';
    fitText(g, '이어하기 1회', W / 2, y, W - 160, 28, 400);
  }
  g.fillStyle = '#e0bb62';
  g.fillRect(W / 2 - 120, 920, 240, 6);
  g.fillStyle = '#c9d3e6';
  g.textAlign = 'center';
  fitText(g, SITE, W / 2, 985, W - 160, 36, 700);
  return c;
}

function toBlob(c: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((res) => c.toBlob((b) => res(b), 'image/png'));
}

function download(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = FILE;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export interface PreparedShare {
  /** 그림이 다 그려지면 끝나는 약속 */
  ready: Promise<void>;
  /** 단추를 누른 순간 부른다: 휴대폰은 공유 창, 아니면 파일 저장 */
  share(): Promise<ShareOutcome>;
}

/** 결과 화면이 뜰 때 불러 그림을 미리 그려 둔다 */
export function prepareShare(d: ResultShare): PreparedShare {
  let blob: Blob | null = null;
  const ready = drawShareCard(d)
    .then(toBlob)
    .then((b) => {
      blob = b;
    })
    .catch(() => undefined);
  const text = `Three Party Problem · ${d.heroName} · ${d.outcome}`;
  return {
    ready,
    async share(): Promise<ShareOutcome> {
      if (!blob) await ready;
      if (!blob) return 'failed';
      const file = new File([blob], FILE, { type: 'image/png' });
      const nav = navigator;
      // 공유 창은 휴대폰(터치)에서만. PC는 파일 저장 — 윈도 Chrome은 canShare가 true라 그대로 두면 윈도 공유 창이 뜬다
      const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
      if (touch && typeof nav.share === 'function' && typeof nav.canShare === 'function' && nav.canShare({ files: [file] })) {
        try {
          await nav.share({ files: [file], title: 'Three Party Problem', text });
          return 'shared';
        } catch (e) {
          if ((e as DOMException)?.name === 'AbortError') return 'cancelled';
          // 공유가 막히면(누른 지 오래됨 등) 파일로 저장
        }
      }
      try {
        download(blob);
        return 'saved';
      } catch {
        return 'failed';
      }
    },
  };
}
