import data from '../data/weapons.json';
import type { AttackDef } from './Fighter';

export type WeaponId = 'stapler' | 'notice';

export interface WeaponDef {
  id: WeaponId;
  name: string;
  /** 휘두를 수 있는 횟수 */
  durability: number;
  throwDmg: number;
  attack: AttackDef;
}

function build(id: WeaponId): WeaponDef {
  const d = data[id];
  return {
    id,
    name: d.name,
    durability: d.durability,
    throwDmg: d.throwDmg,
    attack: {
      total: d.total,
      active: [d.active[0], d.active[1]],
      chainAt: d.total * 0.7,
      reach: d.reach,
      zReach: 30,
      dmg: d.dmg,
      kb: d.kb,
      knockdown: d.knockdown,
      // 안내문 롤로 친 타격은 "안내문 부착"으로 친다 (공지를 안 읽는 학생 보스 기믹)
      tag: id === 'notice' ? 'notice' : undefined,
    },
  };
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  stapler: build('stapler'),
  notice: build('notice'),
};

export function isWeaponId(s: string): s is WeaponId {
  return s === 'stapler' || s === 'notice';
}
