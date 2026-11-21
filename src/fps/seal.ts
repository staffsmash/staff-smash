import * as THREE from 'three';
import type { Enemy } from './enemies';

// 인감 도장(학생: 출석 스티커)이 더 잘 보이게 (2026-11-17). 8초 동안 기본 공격(도장·서류 — 무기는 아니다)이:
// - 맞히고 남은 잡몹은 넘어뜨린다 (Game.knockDown — 1.2초 쓰러졌다가 일어난다).
// - 한 번에 처리한 잡몹은 뒤로 튕기며 한 바퀴 구른 뒤 사라지게 한다 (SealRolls, 처리 연출).
// - 맞은 자리에서 SEAL_R 안의 다른 잡몹도 넘어뜨린다 (처리하지는 않는다).
// 사람(보스·중간보스·창구 직원)과 전필수 학과장의 수강편람 탑은 빠진다. 떨어뜨리는 확률은 그대로다. 연결은 Game.sealHit (main.ts).

/** 도장이 맞은 자리에서 이 거리 안의 다른 잡몹도 넘어진다 (m) */
export const SEAL_R = 2.5;
/** 구르는 시간 (끝 30%는 작아지며 사라진다), 밀려나는 거리 */
const ROLL_T = 0.8;
const ROLL_SLIDE = 2.8;

interface Roll {
  t: number;
  /** 밀려나는 쪽 (수평 단위 벡터) */
  dir: THREE.Vector3;
  /** 구르는 축 (위 × dir: 윗부분이 플레이어 반대쪽으로 넘어간다) */
  axis: THREE.Vector3;
  q0: THREE.Quaternion;
  /** 처리된 순간의 맞는 점 */
  pos0: THREE.Vector3;
  /** 몸 원점 → 맞는 점 (위쪽으로만. 이 점을 중심으로 구른다) */
  off: THREE.Vector3;
  s0: number;
}

const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();

export class SealRolls {
  private rolls = new WeakMap<Enemy, Roll>();

  /** 처리된 잡몹을 굴린다 (이미 die()가 불린 뒤). from: 밀어내는 쪽 (플레이어 자리) */
  start(e: Enemy, from: THREE.Vector3): void {
    const o = e.obj;
    const dir = new THREE.Vector3(e.center.x - from.x, 0, e.center.z - from.z);
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, -1);
    dir.normalize();
    o.scale.setScalar(e.baseScale);
    this.rolls.set(e, {
      t: 0,
      dir,
      axis: new THREE.Vector3(dir.z, 0, -dir.x),
      q0: o.quaternion.clone(),
      pos0: e.center.clone(),
      off: new THREE.Vector3(0, e.center.y - o.position.y, 0),
      s0: e.baseScale,
    });
  }

  rolling(e: Enemy): boolean {
    return this.rolls.has(e);
  }

  /** 구르는 중이면 이번 단계는 구르기만 하고 true. 다 구르면 치운다 (gone) */
  hold(e: Enemy, dt: number): boolean {
    const r = this.rolls.get(e);
    if (!r) return false;
    r.t += dt;
    const k = Math.min(1, r.t / ROLL_T);
    // 뒤로 튕기며(살짝 떠서) 한 바퀴 구른다 → 끝에서 작아지며 사라진다
    const kr = Math.min(1, k / 0.8);
    const th = Math.PI * 2 * kr * kr * (3 - 2 * kr);
    const slide = ROLL_SLIDE * (1 - (1 - k) ** 3);
    const hop = Math.sin(Math.PI * Math.min(1, k / 0.75)) * 0.8;
    const px = r.pos0.x + r.dir.x * slide;
    const py = r.pos0.y + hop;
    const pz = r.pos0.z + r.dir.z * slide;
    const o = e.obj;
    _q.setFromAxisAngle(r.axis, th);
    o.quaternion.copy(_q).multiply(r.q0);
    o.position.set(px, py, pz).sub(_v.copy(r.off).applyQuaternion(_q));
    o.scale.setScalar(r.s0 * (k < 0.7 ? 1 : Math.max(0.01, 1 - (k - 0.7) / 0.3)));
    e.center.set(px, py, pz);
    if (k >= 1) {
      e.gone = true;
      this.rolls.delete(e);
    }
    return true;
  }
}
