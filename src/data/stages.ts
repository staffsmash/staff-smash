import type { GameMode } from '../records';
import s1 from './stage1.json';
import s2 from './stage2.json';
import s3 from './stage3.json';
import t1 from './student1.json';
import t2 from './student2.json';
import t3 from './student3.json';

/** 구역 배경 그림 (src/scenes/background.ts의 ZONE_ART). 한 구역 = 화면 한 장(960px) */
export type ZoneArtId =
  | 'bonCounter'
  | 'bonLobby'
  | 'bonFront'
  | 'socialScience'
  | 'learningFront'
  | 'learningLobby'
  | 'humanitiesFront'
  | 'humanitiesHall'
  | 'dormFront'
  | 'stands'
  | 'track'
  /** 대운동장 (교직원 모드: "퇴근 (정문) →" 표지가 있다) */
  | 'fieldExit'
  /** 대운동장 (학생 모드: 표지 없음) */
  | 'field'
  | 'presidentOffice';

/** 하늘·시간: 낮, 늦은 오후, 해 질 녘 */
export type SkyTime = 'day' | 'late' | 'dusk';

export interface BackgroundDef {
  /** 배경 무작위 요소(창 불빛, 모래 알갱이 등)의 씨앗. 같은 씨앗이면 늘 같은 그림이다 */
  seed: string;
  sky: SkyTime;
  /** 실내·실외 경계 기둥 자리(x). 없으면 실내·실외가 바뀌는 구역 경계마다 자동으로 세운다 */
  edges?: number[];
}

export interface ZoneDef {
  left: number;
  label: string;
  art: ZoneArtId;
  maxAlive: number;
  waves: string[];
  supervisors: string[];
  adds?: { type: string; every: number; max: number };
  /** 웨이브를 정리한 뒤 김부재중 처장의 결재를 기다려야 다음 구역으로 갈 수 있다 */
  approval?: boolean;
}

export interface StageDef {
  id: string;
  title: string;
  background: BackgroundDef;
  zones: ZoneDef[];
  weapons: { id: string; x: number; y: number }[];
  foods: { id: string; x: number; y: number }[];
}

/** 교직원 모드: 본관 → 사회과학관, 교수학습개발원 → 인문과학관, 국제학사 → 운동장 */
export const STAGES = [s1, s2, s3] as unknown as StageDef[];

/** 학생 모드: 같은 장소를 거꾸로 — 대운동장 → 국제학사, 인문과학관 → 교수학습개발원, 사회과학관 → 본관(총장실) */
export const STUDENT_STAGES = [t1, t2, t3] as unknown as StageDef[];

export function stagesFor(mode: GameMode): StageDef[] {
  return mode === 'student' ? STUDENT_STAGES : STAGES;
}
