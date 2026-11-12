// 스테이지 근무평정 (S~D). 기준: 처리 시간, 받은 피해, 최대 연속 처리 (PRD 12절)

export interface StageStats {
  stageTitle: string;
  elapsed: number;
  damage: number;
  maxCombo: number;
  lives: number;
  clockMin: number;
}

export interface GradeRow {
  label: string;
  value: string;
  points: number;
  max: number;
}

export type Grade = 'S' | 'A' | 'B' | 'C' | 'D';

const step = (v: number, table: [number, number][], fallback: number): number => {
  for (const [limit, pts] of table) if (v <= limit) return pts;
  return fallback;
};

export function gradeStage(s: StageStats): { rows: GradeRow[]; total: number; grade: Grade } {
  const m = Math.floor(s.elapsed / 60);
  const sec = Math.floor(s.elapsed % 60);
  const time = step(s.elapsed, [[120, 40], [180, 30], [260, 20]], 10);
  const dmg = step(s.damage, [[0, 30], [4, 22], [9, 14]], 6);
  const combo = s.maxCombo >= 15 ? 30 : s.maxCombo >= 10 ? 22 : s.maxCombo >= 6 ? 14 : 6;
  const rows: GradeRow[] = [
    { label: '처리 시간', value: `${m}분 ${sec.toString().padStart(2, '0')}초`, points: time, max: 40 },
    { label: '받은 민원 피해', value: `${s.damage}`, points: dmg, max: 30 },
    { label: '최대 연속 처리', value: `${s.maxCombo}회`, points: combo, max: 30 },
  ];
  const total = time + dmg + combo;
  const grade: Grade = total >= 90 ? 'S' : total >= 74 ? 'A' : total >= 56 ? 'B' : total >= 38 ? 'C' : 'D';
  return { rows, total, grade };
}
