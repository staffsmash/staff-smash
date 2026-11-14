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

/** 무기를 건네주는 자리: 교직원 모드는 경비원(인사하면 준다), 학생 모드는 도서 무인 대출기(대여하면 나온다).
 *  items: 건네줄 무기 id 목록. 한 번에 하나를 무작위로 고르므로 같은 id를 여러 번 쓰면 더 자주 나온다. */
export interface GiverDef {
  x: number;
  y: number;
  items: string[];
}

/** 부수면 먹을 것이 나오는 상자 (교직원: 조기출근 박스, 학생: 수강편람). 적이 아니어서 구역 정리와 상관없다 */
export interface BoxDef {
  x: number;
  y: number;
}

export interface StageDef {
  id: string;
  title: string;
  background: BackgroundDef;
  zones: ZoneDef[];
  /** 바닥에 미리 깔린 무기는 없다. 무기는 경비원·대출기에서 받는다 */
  givers: GiverDef[];
  /** 먹을 것은 상자를 부숴서 얻는다 */
  boxes: BoxDef[];
}

/** 교직원 모드: 본관 → 사회과학관, 교수학습개발원 → 인문과학관, 국제학사 → 운동장 */
export const STAGES = [s1, s2, s3] as unknown as StageDef[];

/** 학생 모드: 같은 장소를 거꾸로 — 대운동장 → 국제학사, 인문과학관 → 교수학습개발원, 사회과학관 → 본관(총장실) */
export const STUDENT_STAGES = [t1, t2, t3] as unknown as StageDef[];

export function stagesFor(mode: GameMode): StageDef[] {
  return mode === 'student' ? STUDENT_STAGES : STAGES;
}
