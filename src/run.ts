import { START_CLOCK } from './config';
import { assignStudentNames, type StudentType } from './data/names';
import type { SkillId } from './data/skills';
import type { Grade } from './grade';
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
