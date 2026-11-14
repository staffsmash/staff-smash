// 조력자 이벤트 문구 (사용자가 2026-11-14 정한 대사). 체력이 바닥일 때 동료 직원·친구들이 달려와 돕는다.
// 이름은 플레이어가 고른 주인공 이름이다.

/** 이름 뒤에 붙는 부르는 말: 끝 글자에 받침이 있으면 "아", 없으면 "야" (김러샤 → 김러샤야, 박불어 → 박불어야).
 *  끝 글자가 로마자면 한국어로 읽은 소리로 정한다: L·M·N·R(엘·엠·엔·알)은 받침 → "아", 나머지는 "야" (이엘LT → 이엘LT야).
 *  끝 글자가 숫자면 읽은 소리로 정한다: 0·1·3·6·7·8(영·일·삼·육·칠·팔)은 받침 → "아". */
export function vocative(name: string): '아' | '야' {
  const last = name.trim().slice(-1);
  if (!last) return '야';
  const code = last.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 !== 0 ? '아' : '야';
  if (/[a-z]/i.test(last)) return 'LMNR'.includes(last.toUpperCase()) ? '아' : '야';
  if (/[0-9]/.test(last)) return '013678'.includes(last) ? '아' : '야';
  return '야';
}

/** 조력자 대사 두 줄. 첫 번째 조력자가 첫 줄, 두 번째가 둘째 줄을 말한다 (세 번째는 둘 중 하나) */
export function helperLines(student: boolean, name: string): [string, string] {
  if (student) {
    const v = vocative(name);
    return [`${name}${v}! 내가 대신 서류내줄게`, `${name}${v}, 도와줄게!`];
  }
  return ['서류 마감기간이니 제가 대신 해드릴게요!', `${name}님! 전화 대신 받아드려요!`];
}

/** 조력자가 왔을 때 화면 위 안내 */
export function helperBanner(student: boolean): string {
  return student ? '친구들이 도우러 왔다!' : '동료 직원들이 도우러 왔다!';
}
