import { ALL_STUDENTS } from './students';

// 민원 학생 이름(학과·언어 말장난)과 유형. 이름은 매 판 무작위로 유형에 붙는다 (PRD 4절).
// 2026-11-21 (11차): 외형·성별·나라말 인사는 이름을 따른다 (students.ts의 studentByName). 유형은 지금처럼 무작위.

export const STUDENT_NAMES = ALL_STUDENTS.map((s) => s.name);

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
