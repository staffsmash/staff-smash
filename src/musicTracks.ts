// 배경음악 악보 네 곡. 교직원·학생·보스 세 곡은 이 게임을 위해 새로 지은 짧은 반복곡이다.
// Boo 곡만 사용자 결정(2026-11-28, PRD 결정 61)으로 김승민 「외대 옥상」 후렴 첫 4마디 가락을 옮겼다
// (사용자가 준 mp3에서 두 번 나오는 후렴을 박마다 음높이로 읽어 서로 맞춰 본 값. 원음 파일은 넣지 않는다. 원곡자 허락은 사용자가 챙긴다).
// 소리 내는 쪽은 src/music.ts. 여기에는 박자·화음·가락·반주 무늬만 둔다.
//
// 적는 법
// - 가락: 마디 하나를 띄어쓰기로 나눈 글자들로 적는다. 8개면 8분음표, 16개면 16분음표 하나씩이다.
//   'C5' = 음 이름 + 옥타브(#·b 가능), '-' = 앞 음을 늘인다, '.' = 쉼표.
// - 화음: 마디마다 'Fmaj7' 처럼 적고, 한 마디에 둘이면 'Gm7 C7' (반 마디씩).
// - 반주 무늬: 16칸(16분음표) 기준. 베이스는 [칸, 음, 길이(칸)] — 음은 'R' 근음, '5' 5도, '8' 옥타브 위, '3' 화음의 3도.

export type TrackId = 'staff' | 'student' | 'boss' | 'boo';

export interface Song {
  /** 화면에 보일 일은 없지만 디버그용 이름 */
  title: string;
  bpm: number;
  /** 마디마다 가락 */
  lead: string[];
  /** 마디마다 화음 */
  chords: string[];
  /** 가락 소리: 파형과 걸러 낼 높이(Hz, 0이면 안 거름) */
  leadWave: OscillatorType;
  leadCut: number;
  /** 가락 크기 */
  leadVol: number;
  /** 베이스 */
  bassWave: OscillatorType;
  bassCut: number;
  bassVol: number;
  bass: [number, 'R' | '5' | '8' | '3', number][];
  /** 화음 반주: 'stab' = 화음을 짧게 끊어 치기 (칸 목록), 'arp' = 화음 음을 16분음표로 돌기 */
  comp: { kind: 'stab'; steps: number[]; len: number; vol: number; wave: OscillatorType } | { kind: 'arp'; vol: number; wave: OscillatorType; octave: number };
  /** 북: 16칸 문자열 ('x' = 침, 'o' = 약하게) */
  kick: string;
  snare: string;
  hat: string;
}

// ---------- 교직원: 사무실 오후, 가볍고 보통 빠르기 (F장조, 120 BPM, 16마디 = 32초) ----------

const STAFF: Song = {
  title: '오후 4시의 사무실',
  bpm: 120,
  chords: [
    'Fmaj7', 'Dm7', 'Gm7', 'C7',
    'Fmaj7', 'Dm7', 'Gm7 C7', 'F',
    'Bbmaj7', 'C7', 'Am7', 'Dm7',
    'Gm7', 'C7', 'Fmaj7 Dm7', 'Gm7 C7',
  ],
  lead: [
    'C5 - A4 - F4 A4 C5 E5',
    'D5 - C5 A4 - . F4 A4',
    'Bb4 - A4 G4 - D5 C5 Bb4',
    'A4 - G4 - E4 - . .',
    'C5 - A4 - F4 A4 C5 F5',
    'E5 - D5 C5 - A4 C5 D5',
    'Bb4 - D5 - C5 - Bb4 E4',
    'F4 - - . . . C5 D5',
    'F5 - D5 - Bb4 - D5 F5',
    'E5 - - C5 G4 - Bb4 C5',
    'A4 - C5 E5 - D5 C5 A4',
    'D5 - - - F5 - E5 D5',
    'D5 - Bb4 - G4 - Bb4 D5',
    'C5 - - E5 G5 - E5 C5',
    'A4 - C5 - F5 - D5 -',
    'Bb4 - A4 - G4 - E4 -',
  ],
  leadWave: 'square',
  leadCut: 2200,
  leadVol: 0.13,
  bassWave: 'triangle',
  bassCut: 0,
  bassVol: 0.3,
  bass: [
    [0, 'R', 3],
    [4, '5', 2],
    [8, '8', 3],
    [12, '5', 2],
    [14, '3', 2],
  ],
  comp: { kind: 'stab', steps: [4, 12, 14], len: 1, vol: 0.045, wave: 'triangle' },
  kick: 'x.......x.......',
  snare: '....o.......o...',
  hat: 'o.o.o.o.o.o.o.o.',
};

// ---------- 학생: 캠퍼스 낮, 밝고 조금 빠르게 (G장조, 140 BPM, 16마디 ≈ 27초) ----------

const STUDENT: Song = {
  title: '캠퍼스 한낮',
  bpm: 140,
  chords: [
    'G', 'D', 'Em', 'C',
    'G', 'D', 'C', 'D',
    'Em', 'C', 'G', 'D',
    'C', 'D', 'Bm Em', 'C D',
  ],
  lead: [
    'D5 - B4 D5 G5 - F#5 D5',
    'E5 - D5 - A4 - F#4 A4',
    'B4 - G4 B4 E5 - D5 B4',
    'C5 - - E5 D5 - C5 A4',
    'D5 - B4 D5 G5 - A5 G5',
    'F#5 - E5 D5 - A4 B4 D5',
    'E5 - - C5 G5 - E5 C5',
    'D5 - - - . . A4 D5',
    'E5 - G5 - B5 - G5 E5',
    'G5 - E5 - C5 - E5 G5',
    'D5 - B4 - G4 - B4 D5',
    'F#5 - - E5 D5 - A4 -',
    'C5 E5 G5 - E5 C5 E5 G5',
    'A5 - F#5 - D5 - F#5 A5',
    'B5 - A5 - G5 - F#5 E5',
    'E5 - C5 - D5 - F#5 A5',
  ],
  leadWave: 'square',
  leadCut: 4200,
  leadVol: 0.11,
  bassWave: 'triangle',
  bassCut: 0,
  bassVol: 0.3,
  bass: [
    [0, 'R', 2],
    [2, '8', 2],
    [4, 'R', 2],
    [6, '8', 2],
    [8, 'R', 2],
    [10, '8', 2],
    [12, '5', 2],
    [14, '8', 2],
  ],
  comp: { kind: 'arp', vol: 0.035, wave: 'square', octave: 5 },
  kick: 'x.......x.x.....',
  snare: '....x.......x...',
  hat: 'o.o.o.o.o.o.o.x.',
};

// ---------- 보스전: 빠르고 긴장되게 (A단조, 160 BPM, 16마디 = 24초) ----------

const BOSS: Song = {
  title: '결재 대기 중',
  bpm: 160,
  chords: [
    'Am', 'F', 'Dm', 'E',
    'Am', 'F', 'Dm', 'E',
    'F', 'G', 'Em', 'Am',
    'Dm', 'Bb', 'E', 'E7',
  ],
  lead: [
    'A4 . A4 C5 E5 - D5 C5',
    'F5 - E5 - C5 - A4 C5',
    'D5 - F5 - A5 - G5 F5',
    'E5 - - G#4 B4 - D5 -',
    'A5 . A5 G5 E5 - C5 E5',
    'F5 - A5 - C6 - A5 F5',
    'D5 F5 D5 A4 D5 F5 A5 F5',
    'G#5 - - - E5 - B4 -',
    'C5 - F5 - A5 - G5 F5',
    'D5 - G5 - B5 - A5 G5',
    'E5 - G5 B5 E6 - D6 B5',
    'C6 - B5 A5 E5 - . .',
    'F5 - E5 D5 A4 - D5 F5',
    'F5 - D5 Bb4 F4 - Bb4 D5',
    'E5 - G#5 - B5 - G#5 E5',
    'D5 - C5 - B4 - G#4 -',
  ],
  leadWave: 'square',
  leadCut: 3200,
  leadVol: 0.12,
  bassWave: 'sawtooth',
  bassCut: 700,
  bassVol: 0.32,
  bass: [
    [0, 'R', 1],
    [2, 'R', 1],
    [4, '8', 1],
    [6, 'R', 1],
    [8, 'R', 1],
    [10, 'R', 1],
    [12, '8', 1],
    [14, '5', 1],
  ],
  comp: { kind: 'stab', steps: [0, 6, 10], len: 2, vol: 0.035, wave: 'square' },
  kick: 'x...x...x...x...',
  snare: '....x.......x..o',
  hat: 'oooooooooooooooo',
};

// ---------- Boo 호출: 김승민 「외대 옥상」 후렴 첫 4마디 (G장조, 88 BPM, 4마디 ≈ 10.9초) ----------
// 1인칭에서 Boo가 붙잡아 나는 동안(약 9.7초)만 튼다 (src/sound.ts followFps). 착지하면 1초 동안 줄며 원래 곡으로.
// 가락은 원곡보다 한 옥타브 위(목소리 G3~D4 → G4~D5), 화음은 반 마디씩 읽은 값을 정리했다.

const BOO: Song = {
  title: '외대 옥상 (후렴)',
  bpm: 88,
  chords: ['Am7 Em7', 'Am7 G', 'D G', 'D G'],
  lead: [
    'B4 A4 - B4 A4 - - G4 A4 - E4 G4 - - - -',
    'A4 B4 A4 - G4 A4 - F#4 G4 A4 G4 - A4 G4 - F#4',
    'B4 E4 A4 B4 A4 - - D5 A4 - D5 G4 - - - F#4',
    'A4 B4 A4 - - G4 A4 G4 - A4 G4 - D5 G4 - -',
  ],
  leadWave: 'square',
  leadCut: 1800,
  leadVol: 0.13,
  bassWave: 'triangle',
  bassCut: 0,
  bassVol: 0.3,
  bass: [
    [0, 'R', 3],
    [4, '5', 2],
    [8, 'R', 3],
    [12, '5', 2],
    [14, '8', 2],
  ],
  comp: { kind: 'stab', steps: [2, 6, 10, 14], len: 1, vol: 0.04, wave: 'triangle' },
  kick: 'x.....x.x.......',
  snare: '....x.......x...',
  hat: 'o.o.o.o.o.o.o.o.',
};

export const SONGS: Record<TrackId, Song> = { staff: STAFF, student: STUDENT, boss: BOSS, boo: BOO };
