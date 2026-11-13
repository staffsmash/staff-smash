import s1 from './stage1.json';
import s2 from './stage2.json';
import s3 from './stage3.json';

export interface ZoneDef {
  left: number;
  label: string;
  maxAlive: number;
  waves: string[];
  supervisors: string[];
  adds?: { type: string; every: number; max: number };
  /** 웨이브를 정리한 뒤 김부재중 처장의 결재를 기다려야 다음 구역으로 갈 수 있다 */
  approval?: boolean;
}

/** main: 본관 → 사회과학관, learning: 교수학습개발원 → 인문과학관, field: 국제학사 → 운동장 */
export type BackgroundId = 'main' | 'learning' | 'field';

export interface StageDef {
  id: string;
  title: string;
  background: BackgroundId;
  zones: ZoneDef[];
  weapons: { id: string; x: number; y: number }[];
  foods: { id: string; x: number; y: number }[];
}

export const STAGES = [s1, s2, s3] as unknown as StageDef[];
