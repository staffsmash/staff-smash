// 1인칭 시험판 설정(난이도·감도·소리·조준 보조·화면 효과)과 난이도별 최고 기록.
// 모두 이 브라우저의 localStorage에만 둔다 (온라인 기록판으로는 보내지 않는다).
// 저장소를 못 쓰는 환경(사생활 보호 창, 막힌 저장소)에서도 기본값과 메모리 값으로 그대로 돈다.

export type DiffKey = 'easy' | 'normal' | 'hard';

export interface Diff {
  label: string;
  /** 적의 빠르기(움직임·공격 박자 전체) */
  speed: number;
  /** 받는 피해 */
  damage: number;
  /** 보스 체력 */
  bossHp: number;
  /** 차례마다 몰려오는 민원 수 */
  count: number;
  /** 조준 보조 각도(라디안, 0이면 PC에서는 안 씀. 터치는 설정을 켜면 최소 0.14) */
  assist: number;
  /** 음식이 떨어질 확률 더하기 */
  drop: number;
  /** 4초 동안 안 맞으면 1초에 회복하는 체력 */
  regen: number;
}

export const DIFFS: Record<DiffKey, Diff> = {
  // 2026-11-13 사용자: v2(옛 보통)도 "넘 어렵다" → 초보를 처음 고르는 값으로, 고급이 옛 보통 정도
  easy: { label: '초보', speed: 0.7, damage: 0.4, bossHp: 0.6, count: 0.6, assist: 0.22, drop: 0.15, regen: 0.25 },
  normal: { label: '중급', speed: 0.88, damage: 0.7, bossHp: 0.85, count: 0.85, assist: 0.1, drop: 0.05, regen: 0 },
  hard: { label: '고급', speed: 1.05, damage: 1.1, bossHp: 1.1, count: 1, assist: 0, drop: 0, regen: 0 },
};

export const DIFF_KEYS: DiffKey[] = ['easy', 'normal', 'hard'];

export interface Settings {
  diff: DiffKey;
  /** 마우스·터치 감도 배율 */
  sens: number;
  /** 소리 크기 0~1 */
  volume: number;
  /** 조준 보조 (터치에서만 쓴다) */
  assist: boolean;
  /** 화면 흔들림·번쩍임 줄이기 (진동도 끈다) */
  calm: boolean;
}

const SETTINGS_KEY = 'staffsmash.fps.settings';
const BEST_KEY = 'staffsmash.fps.best';

const DEFAULTS: Settings = { diff: 'easy', sens: 1, volume: 0.8, assist: true, calm: false };

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const isDiff = (v: unknown): v is DiffKey => typeof v === 'string' && v in DIFFS;

export function loadSettings(): Settings {
  const s = { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return s;
    const o = JSON.parse(raw) as Partial<Record<keyof Settings, unknown>>;
    if (isDiff(o.diff)) s.diff = o.diff;
    if (typeof o.sens === 'number' && Number.isFinite(o.sens)) s.sens = clamp(o.sens, 0.4, 2.5);
    if (typeof o.volume === 'number' && Number.isFinite(o.volume)) s.volume = clamp(o.volume, 0, 1);
    if (typeof o.assist === 'boolean') s.assist = o.assist;
    if (typeof o.calm === 'boolean') s.calm = o.calm;
  } catch {
    /* 저장소가 없거나 값이 깨졌으면 기본값 */
  }
  return s;
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* 저장 못 해도 이번 판에는 적용된다 */
  }
}

// ---------- 최고 기록 ----------

export interface Best {
  /** 근무평정 점수 (100점 만점) */
  total: number;
  grade: string;
  /** 걸린 시간 (초) */
  time: number;
}

let bestCache: Partial<Record<DiffKey, Best>> | null = null;

export function loadBest(): Partial<Record<DiffKey, Best>> {
  if (bestCache) return bestCache;
  const out: Partial<Record<DiffKey, Best>> = {};
  try {
    const raw = localStorage.getItem(BEST_KEY);
    if (raw) {
      const o = JSON.parse(raw) as Record<string, unknown>;
      for (const k of DIFF_KEYS) {
        const b = o[k] as Partial<Best> | undefined;
        if (b && typeof b.total === 'number' && typeof b.time === 'number' && typeof b.grade === 'string' && /^[SABCD]$/.test(b.grade)) {
          out[k] = { total: b.total, grade: b.grade, time: b.time };
        }
      }
    }
  } catch {
    /* 기록 없음 */
  }
  bestCache = out;
  return out;
}

/** 이번 판 기록을 견준다. 점수가 높을수록, 같으면 빠를수록 좋은 기록. */
export function recordBest(diff: DiffKey, rec: Best): { best: Best; isNew: boolean; prev: Best | null } {
  const all = loadBest();
  const prev = all[diff] ?? null;
  const isNew = !prev || rec.total > prev.total || (rec.total === prev.total && rec.time < prev.time);
  if (isNew) {
    all[diff] = { ...rec, time: Math.round(rec.time * 10) / 10 };
    try {
      localStorage.setItem(BEST_KEY, JSON.stringify(all));
    } catch {
      /* 저장 못 해도 이 창에서는 보여 준다 */
    }
  }
  return { best: all[diff] as Best, isNew, prev };
}

export function timeText(sec: number): string {
  const s = Math.floor(sec);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

/** 타이틀·결과 화면용 한 줄: "초보 A · 3:42 | 중급 — | 고급 —" */
export function bestLine(highlight?: DiffKey): string {
  const all = loadBest();
  return DIFF_KEYS.map((k) => {
    const b = all[k];
    const body = b ? `<b>${b.grade}</b> ${timeText(b.time)}` : '—';
    return `<span class="${k === highlight ? 'cur' : ''}">${DIFFS[k].label} ${body}</span>`;
  }).join('');
}

// ---------- 설정 화면 ----------

export function settingsHtml(s: Settings, opts: { touch: boolean; inRun: boolean }): string {
  const seg = DIFF_KEYS.map(
    (k) => `<button type="button" data-diff="${k}" class="${s.diff === k ? 'on' : ''}" aria-pressed="${s.diff === k}">${DIFFS[k].label}</button>`,
  ).join('');
  return `
    <div class="settings">
      <div class="srow"><span class="slabel">난이도</span><div class="seg" role="group" aria-label="난이도">${seg}</div></div>
      <p class="snote">${opts.inRun ? '난이도는 다음 판부터 적용됩니다' : '초보는 민원이 적고 느리며, 안 맞고 있으면 체력이 차오르고 조준을 도와줍니다'}</p>
      <div class="srow"><label class="slabel" for="setSens">${opts.touch ? '터치 감도' : '마우스 감도'}</label>
        <input type="range" id="setSens" min="0.4" max="2.5" step="0.1" value="${s.sens}"><output id="setSensOut">${s.sens.toFixed(1)}배</output></div>
      <div class="srow"><label class="slabel" for="setVol">소리 크기</label>
        <input type="range" id="setVol" min="0" max="100" step="5" value="${Math.round(s.volume * 100)}"><output id="setVolOut">${Math.round(s.volume * 100)}%</output></div>
      ${
        opts.touch
          ? `<div class="srow"><label class="slabel" for="setAssist">조준 보조</label><input type="checkbox" id="setAssist" ${s.assist ? 'checked' : ''}><span class="shint">조준점 가까운 민원 쪽으로 도장이 살짝 휩니다</span></div>`
          : ''
      }
      <div class="srow"><label class="slabel" for="setCalm">화면 흔들림·번쩍임 줄이기</label><input type="checkbox" id="setCalm" ${s.calm ? 'checked' : ''}><span class="shint">진동도 끕니다</span></div>
    </div>`;
}

/** 설정 화면의 입력을 묶는다. 바뀔 때마다 저장하고 onChange를 부른다. */
export function bindSettings(root: HTMLElement, s: Settings, onChange: (key: keyof Settings) => void): void {
  root.querySelectorAll<HTMLButtonElement>('[data-diff]').forEach((b) =>
    b.addEventListener('click', () => {
      const d = b.dataset.diff;
      if (!isDiff(d)) return;
      s.diff = d;
      root.querySelectorAll<HTMLButtonElement>('[data-diff]').forEach((x) => {
        x.classList.toggle('on', x === b);
        x.setAttribute('aria-pressed', String(x === b));
      });
      saveSettings(s);
      onChange('diff');
    }),
  );
  const sens = root.querySelector<HTMLInputElement>('#setSens');
  sens?.addEventListener('input', () => {
    s.sens = clamp(Number(sens.value) || 1, 0.4, 2.5);
    const out = root.querySelector('#setSensOut');
    if (out) out.textContent = `${s.sens.toFixed(1)}배`;
    saveSettings(s);
    onChange('sens');
  });
  const vol = root.querySelector<HTMLInputElement>('#setVol');
  vol?.addEventListener('input', () => {
    s.volume = clamp((Number(vol.value) || 0) / 100, 0, 1);
    const out = root.querySelector('#setVolOut');
    if (out) out.textContent = `${Math.round(s.volume * 100)}%`;
    saveSettings(s);
    onChange('volume');
  });
  for (const [id, key] of [
    ['#setAssist', 'assist'],
    ['#setCalm', 'calm'],
  ] as const) {
    const el = root.querySelector<HTMLInputElement>(id);
    el?.addEventListener('change', () => {
      s[key] = el.checked;
      saveSettings(s);
      onChange(key);
    });
  }
}
