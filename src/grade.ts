import type { GameMode } from './records';

// 스테이지 평가. 교직원: 근무평정 S~D, 학생: 학점 A+~F (PRD 12절). 기준: 걸린 시간, 받은 피해, 최대 연속 처리
// 두 모드 모두 같은 점수(100점 만점)를 쓰고, 점수를 등급으로 바꾸는 표와 항목 이름만 다르다.
// 학점은 1~2글자라서 세 스테이지를 이어 붙여도 기록판 서버의 grades 칸(6글자)에 들어간다 (예: A+B0A0).

export interface StageStats {
  mode: GameMode;
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

export type StaffGrade = 'S' | 'A' | 'B' | 'C' | 'D';
export type StudentGrade = 'A+' | 'A0' | 'B+' | 'B0' | 'C+' | 'C0' | 'D+' | 'D0' | 'F';
export type Grade = StaffGrade | StudentGrade;

/** 학점 → 평점 (4.5 만점) */
export const GRADE_POINTS: Record<StudentGrade, number> = {
  'A+': 4.5,
  A0: 4.0,
  'B+': 3.5,
  B0: 3.0,
  'C+': 2.5,
  C0: 2.0,
  'D+': 1.5,
  D0: 1.0,
  F: 0,
};

const step = (v: number, table: [number, number][], fallback: number): number => {
  for (const [limit, pts] of table) if (v <= limit) return pts;
  return fallback;
};

function staffGrade(total: number): StaffGrade {
  return total >= 90 ? 'S' : total >= 74 ? 'A' : total >= 56 ? 'B' : total >= 38 ? 'C' : 'D';
}

function studentGrade(total: number): StudentGrade {
  if (total >= 90) return 'A+';
  if (total >= 80) return 'A0';
  if (total >= 70) return 'B+';
  if (total >= 60) return 'B0';
  if (total >= 50) return 'C+';
  if (total >= 40) return 'C0';
  if (total >= 30) return 'D+';
  if (total >= 20) return 'D0';
  return 'F';
}

export function gradeStage(s: StageStats): { rows: GradeRow[]; total: number; grade: Grade } {
  const m = Math.floor(s.elapsed / 60);
  const sec = Math.floor(s.elapsed % 60);
  const time = step(s.elapsed, [[120, 40], [180, 30], [260, 20]], 10);
  const dmg = step(s.damage, [[0, 30], [4, 22], [9, 14]], 6);
  const combo = s.maxCombo >= 15 ? 30 : s.maxCombo >= 10 ? 22 : s.maxCombo >= 6 ? 14 : 6;
  const student = s.mode === 'student';
  const rows: GradeRow[] = [
    { label: student ? '걸린 시간' : '처리 시간', value: `${m}분 ${sec.toString().padStart(2, '0')}초`, points: time, max: 40 },
    { label: student ? '받은 피해' : '받은 민원 피해', value: `${s.damage}`, points: dmg, max: 30 },
    { label: student ? '최대 연속 공격' : '최대 연속 처리', value: `${s.maxCombo}회`, points: combo, max: 30 },
  ];
  const total = time + dmg + combo;
  const grade: Grade = student ? studentGrade(total) : staffGrade(total);
  return { rows, total, grade };
}

export function isStudentGrade(g: string): g is StudentGrade {
  return Object.prototype.hasOwnProperty.call(GRADE_POINTS, g);
}

/** 기록판의 grades 글자("A+B0A0")를 학점 목록으로 나눈다. 교직원 평정 글자는 건너뛴다. */
export function parseStudentGrades(text: string): StudentGrade[] {
  return (text.match(/A\+|A0|B\+|B0|C\+|C0|D\+|D0|F/g) ?? []) as StudentGrade[];
}

/** 평점 평균 (깬 스테이지만, 소수 둘째 자리). 깬 스테이지가 없으면 null */
export function gpa(grades: readonly string[]): number | null {
  const pts = grades.filter(isStudentGrade).map((g) => GRADE_POINTS[g]);
  if (pts.length === 0) return null;
  return Math.round((pts.reduce((a, b) => a + b, 0) / pts.length) * 100) / 100;
}

/** "4.17" — 깬 스테이지가 없으면 "-" */
export function gpaText(grades: readonly string[]): string {
  const v = gpa(grades);
  return v === null ? '-' : v.toFixed(2);
}
