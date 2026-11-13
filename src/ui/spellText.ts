import Phaser from 'phaser';
import { FONT } from '../config';
import type { SpellDef } from '../data/spells';

// 외국어 주문 한 줄: "영어 · DEADLINE EXTENDED! (마감 연장!)".
// 원문은 글자 객체를 따로 만들어 아랍어는 rtl(오른쪽 → 왼쪽)로 그리고, 앞의 언어 이름과 뒤의 한국어 뜻은 분리해 둔다.
// 원문과 한국어를 한 글자 객체에 섞으면 느낌표·괄호 자리가 양방향 규칙에 따라 뒤섞이기 때문이다.

export interface SpellLineOpts {
  /** 글자 크기(px). maxW를 넘으면 줄여서 맞춘다 */
  size: number;
  color?: string;
  /** 원문 색 (기본: color) */
  wordColor?: string;
  /** 뜻 색 (기본: color) */
  meaningColor?: string;
  maxW?: number;
  /** true면 x를 가운데로, 아니면 왼쪽 끝으로 */
  center?: boolean;
  /** 언어 이름 앞에 붙일 말 (예: "필살기 ") */
  prefix?: string;
  stroke?: string;
  strokeThickness?: number;
  /** 굵게 (기본 true) */
  bold?: boolean;
}

export function addSpellLine(scene: Phaser.Scene, x: number, y: number, s: SpellDef, o: SpellLineOpts): Phaser.GameObjects.Container {
  const color = o.color ?? '#ffffff';
  const style = (c: string, rtl = false): Phaser.Types.GameObjects.Text.TextStyle => ({
    fontFamily: FONT,
    fontSize: `${o.size}px`,
    fontStyle: o.bold === false ? 'normal' : 'bold',
    color: c,
    rtl,
    ...(o.stroke ? { stroke: o.stroke, strokeThickness: o.strokeThickness ?? 4 } : {}),
  });
  const head = scene.add.text(0, 0, `${o.prefix ?? ''}${s.lang} · `, style(color));
  const word = scene.add.text(0, 0, s.text, style(o.wordColor ?? color, !!s.rtl));
  const tail = scene.add.text(0, 0, ` (${s.meaning})`, style(o.meaningColor ?? color));
  const parts = [head, word, tail];
  const width = () => parts.reduce((a, t) => a + t.width, 0);
  let size = o.size;
  while (o.maxW !== undefined && width() > o.maxW && size > 10) {
    size--;
    for (const t of parts) t.setFontSize(size);
  }
  const total = width();
  let px = o.center ? -total / 2 : 0;
  for (const t of parts) {
    // rtl 글자는 Phaser가 원점을 오른쪽 끝으로 바꾸므로 셋 다 왼쪽 끝 기준으로 다시 맞춘다
    t.setOrigin(0, 0.5).setPosition(px, 0);
    px += t.width;
  }
  // 컨테이너 너비 = 한 줄 전체 너비 (가운데 맞추기에 쓴다)
  return scene.add.container(x, y, parts).setSize(total, Math.max(...parts.map((t) => t.height)));
}
