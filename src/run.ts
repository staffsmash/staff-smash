import { OFF_HOURS, START_CLOCK, clockText } from './config';
import { assignStudentNames, type StudentType } from './data/names';
import type { SkillId } from './data/skills';
import { gpa, type Grade } from './grade';
import type { GameMode } from './records';

// 한 판(모드 하나, 1~3스테이지)의 진행 상태. 스테이지 사이에 넘겨준다.
// 교직원 모드: hero = HeroId(data/heroes), skill = 업무 스킬. 학생 모드: hero = StudentHeroId(data/students), skill = 외국어 주문(data/spells, 같은 SkillId).

export interface StageRecord {
  stage: number;
  grade: Grade;
  elapsed: number;
  damage: number;
  maxCombo: number;
}

export interface RunState {
  mode: GameMode;
  hero: string;
  skill: SkillId;
  names: Record<StudentType, string>;
  lives: number;
  /** 지난 스테이지까지의 실제 시간(초) */
  elapsed: number;
  /** 회의 소집, 마감 연장 등으로 늘어난 시간(분) */
  penaltyMin: number;
  damage: number;
  maxCombo: number;
  stages: StageRecord[];
  /** 도달한 스테이지 (1~3) */
  reached: number;
  cleared: boolean;
}

export function newRun(mode: GameMode, hero: string, skill: SkillId): RunState {
  return {
    mode,
    hero,
    skill,
    names: assignStudentNames(),
    lives: 3,
    elapsed: 0,
    penaltyMin: 0,
    damage: 0,
    maxCombo: 0,
    stages: [],
    reached: 1,
    cleared: false,
  };
}

/** 게임 속 시각(자정부터 센 분). 두 모드 모두 16:52에 시작해 실제 시간과 같은 속도로 흐른다.
 *  교직원: 17:00 퇴근, 학생: 17:00 본관 업무 마감 전에 총장 승인. 기록판은 이 시각으로 순위를 매긴다. */
export function runClock(run: RunState, stageElapsed = 0): number {
  return START_CLOCK + (run.elapsed + stageElapsed) / 60 + run.penaltyMin;
}

export function gradesText(run: RunState): string {
  return run.stages.map((s) => s.grade).join('');
}

/** 학생 모드 누적 평점 (깬 스테이지 평균, 4.5 만점). 깬 스테이지가 없으면 null */
export function runGpa(run: RunState): number | null {
  return gpa(run.stages.map((s) => s.grade));
}

/** 마감(17:00)에 맞췄는지. 교직원은 정시 퇴근, 학생은 본관 마감 전 승인 */
export function onTime(clockMin: number): boolean {
  return clockMin <= OFF_HOURS + 0.001;
}

/** 17:00(교직원 퇴근·학생 본관 마감)을 몇 분 넘겼나. 두 모드 공통. 화면 시계(분 버림)와 맞추고, 조금이라도 넘겼으면 1분 이상 */
export function lateMin(clockMin: number): number {
  return Math.max(1, Math.floor(clockMin - OFF_HOURS));
}

/**
 * 한 판의 결과 문구.
 * - long(기록 화면): "정시 퇴근! (17:00)", "졸업 승인! (16:58)", "2스테이지에서 학사경고 (16:57)" …
 * - short(기록판 칸): "정시 퇴근", "퇴근 · 3분 초과", "졸업 승인", "승인 · 마감 3분 지남", "2스테이지에서 학사경고" …
 */
export function outcomeText(mode: GameMode, cleared: boolean, reached: number, clockMin: number, long: boolean): string {
  if (mode === 'student') {
    if (!cleared) return long ? `${reached}스테이지에서 학사경고 (${clockText(clockMin)})` : `${reached}스테이지에서 학사경고`;
    if (onTime(clockMin)) return long ? `졸업 승인! (${clockText(clockMin)})` : '졸업 승인';
    const late = lateMin(clockMin);
    return long ? `승인 ${clockText(clockMin)} · 마감 ${late}분 지남` : `승인 · 마감 ${late}분 지남`;
  }
  if (!cleared) return long ? `${reached}스테이지에서 야근 확정 (${clockText(clockMin)})` : `${reached}스테이지에서 야근`;
  if (onTime(clockMin)) return long ? `정시 퇴근! (${clockText(Math.max(clockMin, OFF_HOURS))})` : '정시 퇴근';
  const over = lateMin(clockMin);
  return long ? `퇴근 ${clockText(clockMin)} · ${over}분 초과근무` : `퇴근 · ${over}분 초과`;
}
