import data from '../data/weapons.json';
import type { AttackDef } from './Fighter';

// 교직원 무기 4종(스테이플러·안내문 롤·결재판·사원증)과 던지기 전용 물건 2종(규정집·마감 서류 뭉치)

export type WeaponId = 'stapler' | 'notice' | 'clipboard' | 'idcard' | 'rulebook' | 'bomb';
export const WEAPON_IDS: WeaponId[] = ['stapler', 'notice', 'clipboard', 'idcard', 'rulebook', 'bomb'];

interface RawWeapon {
  name: string;
  durability: number;
  total: number;
  active: number[];
  reach: number;
  dmg: number;
  kb: number;
  knockdown: boolean;
  throwDmg: number;
  guard?: boolean;
  boomerang?: boolean;
  throwOnly?: boolean;
}

export interface WeaponDef {
  id: WeaponId;
  name: string;
  /** 휘두를 수 있는 횟수 (0 = 무한) */
  durability: number;
  throwDmg: number;
  attack: AttackDef;
  /** 들고 있으면 정면에서 날아오는 것을 막는다 (결재판) */
  guard: boolean;
  /** 던지면 돌아온다 (사원증) */
  boomerang: boolean;
  /** 휘두르지 못하고 던지기만 한다 (규정집, 서류 뭉치) */
  throwOnly: boolean;
}

const RAW = data as unknown as Record<WeaponId, RawWeapon>;

function build(id: WeaponId): WeaponDef {
  const d = RAW[id];
  return {
    id,
    name: d.name,
    durability: d.durability,
    throwDmg: d.throwDmg,
    guard: !!d.guard,
    boomerang: !!d.boomerang,
    throwOnly: !!d.throwOnly,
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

export const WEAPONS = Object.fromEntries(WEAPON_IDS.map((id) => [id, build(id)])) as Record<WeaponId, WeaponDef>;

export function isWeaponId(s: string): s is WeaponId {
  return (WEAPON_IDS as string[]).includes(s);
}
