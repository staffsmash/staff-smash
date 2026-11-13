import type { SkillId } from './skills';

// 학생 모드 필살기: 외국어 주문 4종 (PRD 10절, 결정 44). 효과는 교직원 업무 스킬과 같은 4종(SkillId)이고
// 문구·연출만 다르다. 화면에는 원문과 뜻을 괄호로 함께 쓴다. 공개 전에 해당 언어 전공자 검수를 받는다.

export interface SpellDef {
  /** 효과 (교직원 업무 스킬과 같은 id) */
  id: SkillId;
  lang: string;
  text: string;
  meaning: string;
  /** 오른쪽에서 왼쪽으로 쓰는 글자 (아랍어) */
  rtl?: boolean;
  desc: string;
  /** 연출: 맞힌 자리에 찍히는 도장 글자 (짧게) */
  stamp: string;
  /** 연출: 큰 글자 테두리·효과 색 */
  color: number;
}

export const SPELLS: SpellDef[] = [
  { id: 'notice', lang: '영어', text: 'DEADLINE EXTENDED!', meaning: '마감 연장!', desc: '화면 안 모든 행정을 넘어뜨린다', stamp: '연장', color: 0x1d4ed8 },
  { id: 'batch', lang: '스페인어', text: '¡Olé!', meaning: '좋아!', desc: '앞으로 돌진하며 길 위의 행정을 한꺼번에 뚫는다', stamp: '좋아', color: 0xc8202f },
  { id: 'rulebook', lang: '러시아어', text: 'ЗАЧЁТ!', meaning: '통과!', desc: '행정이 몰린 곳에 글자를 위에서 떨어뜨린다', stamp: '통과', color: 0x7c3aed },
  { id: 'transfer', lang: '아랍어', text: 'يلا!', meaning: '가자!', rtl: true, desc: '같은 줄을 화면 끝까지 꿰뚫는다', stamp: '가자', color: 0x0f766e },
];

export function spellById(id: string): SpellDef {
  return SPELLS.find((s) => s.id === id) ?? SPELLS[0];
}

/** "DEADLINE EXTENDED! (마감 연장!)" */
export function spellLabel(s: SpellDef): string {
  return `${s.text} (${s.meaning})`;
}
