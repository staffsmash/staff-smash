import { START_CLOCK } from './config';
import { assignStudentNames, type StudentType } from './data/names';
import type { HeroId } from './data/heroes';
import type { SkillId } from './data/skills';
import type { Grade } from './grade';

// 한 판(교직원 모드 1~3스테이지)의 진행 상태. 스테이지 사이에 넘겨준다.

export interface StageRecord {
  stage: number;
  grade: Grade;
  elapsed: number;
  damage: number;
  maxCombo: number;
}

export interface RunState {
  hero: HeroId;
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

export function newRun(hero: HeroId, skill: SkillId): RunState {
  return {
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

/** 게임 속 시각(자정부터 센 분). 16:52에 시작해 실제 시간과 같은 속도로 흐른다. */
export function runClock(run: RunState, stageElapsed = 0): number {
  return START_CLOCK + (run.elapsed + stageElapsed) / 60 + run.penaltyMin;
}

export function gradesText(run: RunState): string {
  return run.stages.map((s) => s.grade).join('');
}
