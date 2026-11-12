// 민원 학생 이름(학과·언어 말장난)과 유형. 이름은 매 판 무작위로 유형에 붙는다 (PRD 4절).

export const STUDENT_NAMES = ['김러샤', '이엘LT', '박불어', '최터키', '심절먼', '김첵호', '신세크'];

export const STUDENT_TYPES = [
  'wrongNumber',
  'lateDoc',
  'noticeBoss',
  'tantrum',
  'graduation',
  'deadline',
  'presidentMail',
] as const;

export type StudentType = (typeof STUDENT_TYPES)[number];

export const TYPE_LABEL: Record<StudentType, string> = {
  wrongNumber: '전화번호 잘못 입력한 학생',
  lateDoc: '서류 제출이 늦은 학생',
  noticeBoss: '공지를 안 읽는 학생',
  tantrum: '규정을 읽지 않고 떼쓰는 학생',
  graduation: '졸업요건 안 채우고 졸업시켜 달라는 학생',
  deadline: '마감 1분 전에 오는 학생',
  presidentMail: '총장실로 메일 쓰는 학생',
};

export function assignStudentNames(): Record<StudentType, string> {
  const names = [...STUDENT_NAMES];
  for (let i = names.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [names[i], names[j]] = [names[j], names[i]];
  }
  const out = {} as Record<StudentType, string>;
  STUDENT_TYPES.forEach((t, i) => {
    out[t] = names[i];
  });
  return out;
}
