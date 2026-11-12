// 교직원 필살기: 업무 스킬 4종 (PRD 10절). 효과 4종은 학생 모드 외국어 주문과 짝을 이룬다.

export type SkillId = 'notice' | 'batch' | 'rulebook' | 'transfer';

export interface SkillDef {
  id: SkillId;
  name: string;
  desc: string;
  banner: string;
  sub: string;
}

export const SKILLS: SkillDef[] = [
  {
    id: 'notice',
    name: '전체 공지 발송',
    desc: '화면 안 모든 민원을 넘어뜨린다',
    banner: '전체 공지 발송!',
    sub: '수신: 화면 안 모든 민원 · 회신 불필요',
  },
  {
    id: 'batch',
    name: '일괄 처리',
    desc: '앞으로 돌진하며 길 위의 민원을 한꺼번에 처리한다',
    banner: '일괄 처리!',
    sub: '결재 라인 생략 · 전결 처리',
  },
  {
    id: 'rulebook',
    name: '규정집 낙하',
    desc: '민원이 몰린 곳에 두꺼운 규정집 세 권을 떨어뜨린다',
    banner: '규정집 낙하!',
    sub: '학칙 제○조 제○항에 따라…',
  },
  {
    id: 'transfer',
    name: '내선 돌리기',
    desc: '같은 줄의 민원을 화면 끝까지 꿰뚫는다',
    banner: '내선 돌리기!',
    sub: '담당 부서로 연결해 드리겠습니다',
  },
];

export function skillById(id: string): SkillDef {
  return SKILLS.find((s) => s.id === id) ?? SKILLS[0];
}
