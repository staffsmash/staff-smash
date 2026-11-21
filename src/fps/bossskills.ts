import * as THREE from 'three';
import type { Ctx } from './enemies';
import { FONT } from '../config';
import { canvasTex } from './textures';

// 11차(2026-11-21) 보스 새 기술 — 1인칭 교직원·학생 모드 공통. Hazards가 갖고 매 프레임 부른다 (적 시간 dt).
// - 거미줄 (최내놔 처장): 처장 손에서 포물선으로 날아가 그림자 자리에 떨어진다. 바닥에 4초 남는다.
//   밟으면 0.6초 동안 처장 곁(약 1.5m)으로 끌려간다 — 끌려가는 동안 화면 가장자리에 거미줄 가닥.
//   거미줄 자체는 아프지 않다 (가까이 끌려가면 보스 근접 배율이 붙을 뿐).
// - MOU 서명선 (총장): 바닥에 길게 그어진다. 1초 예고(옅은 금색, 깜빡임) 뒤 금빛으로 빛나며 닿으면 아프다. 2단계는 두 줄이 엇갈린다.
// - 기념 촬영 (총장): 플래시. 총장이 시야 가운데(좌우 50°) 안에 있으면 2초 동안 화면이 하얘진다 (피해 없음). 고개를 돌리면 피한다.
// - 학위 수여(학생: 학사모)·표창장 수여(교직원: 상장) (총장): 부메랑처럼 날아갔다 돌아온다. 가고 올 때 모두 맞는다. 점프·옆걸음으로 피한다.

/** Game에서 빌려 쓰는 것 (Ctx에 없는 것: 시선 방향, 플레이어 밀기) */
interface SkillHost {
  readonly yaw?: number;
  readonly pos?: THREE.Vector3;
  shove?(dx: number, dz: number, slow: number): void;
}

const hostOf = (c: Ctx) => c as Ctx & SkillHost;

const WEB_N = 3;
const WEB_FLIGHT = 0.8;
const WEB_LIFE = 4;
const WEB_R = 1.35;
const PULL_T = 0.6;
/** 끌려가서 서는 거리 (처장에게서, m) */
const PULL_GAP = 1.5;

const SIGN_N = 4;
const SIGN_LEN = 18;
const SIGN_W = 0.8;
const SIGN_WARN = 1.0;
const SIGN_GLOW = 0.7;
/** 서명선에 닿는 거리 (선 가운데에서, m) */
const SIGN_HIT = 0.6;

/** 플래시가 닿는 시야 (가운데에서 좌우, cos) */
const FLASH_COS = Math.cos((50 * Math.PI) / 180);
const WHITE_HOLD = 1.4;
const WHITE_FADE = 0.6;

const BOOM_SPEED = 11;
const BOOM_Y = 0.65;
/** 이보다 높이 뛰면 넘는다 (m) */
const BOOM_JUMP = 0.5;
const BOOM_HIT = 0.95;

interface Web {
  disc: THREE.Mesh;
  ball: THREE.Mesh;
  warn: THREE.Mesh;
  on: boolean;
  t: number;
  from: THREE.Vector3;
  to: THREE.Vector3;
  owner: THREE.Object3D | null;
}

interface Sign {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  on: boolean;
  t: number;
  x: number;
  z: number;
  ux: number;
  uz: number;
  hit: boolean;
}

interface Boom {
  obj: THREE.Group;
  on: boolean;
  back: boolean;
  t: number;
  pos: THREE.Vector3;
  turn: THREE.Vector3;
  owner: THREE.Object3D | null;
  hitOut: boolean;
  hitBack: boolean;
}

const _a = new THREE.Vector3();

function webTex(): THREE.CanvasTexture {
  return canvasTex(256, 256, (g) => {
    g.strokeStyle = 'rgba(245,245,250,0.95)';
    g.lineWidth = 3;
    const c = 128;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      g.beginPath();
      g.moveTo(c, c);
      g.lineTo(c + Math.cos(a) * 124, c + Math.sin(a) * 124);
      g.stroke();
    }
    g.lineWidth = 2;
    for (const r of [24, 50, 78, 104, 122]) {
      g.beginPath();
      for (let i = 0; i <= 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const rr = r * (i % 2 ? 0.94 : 1);
        if (i === 0) g.moveTo(c + Math.cos(a) * rr, c + Math.sin(a) * rr);
        else g.lineTo(c + Math.cos(a) * rr, c + Math.sin(a) * rr);
      }
      g.stroke();
    }
  });
}

function signTex(): THREE.CanvasTexture {
  return canvasTex(512, 64, (g) => {
    g.strokeStyle = '#ffd34d';
    g.lineWidth = 7;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(6, 40);
    for (let x = 6; x <= 506; x += 6) {
      const y = 32 + Math.sin(x / 13) * 14 + Math.sin(x / 41) * 6;
      g.lineTo(x, y);
    }
    g.stroke();
    // 마지막 휘감는 꼬리
    g.beginPath();
    g.arc(470, 30, 16, 0, Math.PI * 1.6);
    g.stroke();
  });
}

/** 상장: 금테 두른 흰 종이에 "표창장" */
function awardTex(): THREE.CanvasTexture {
  return canvasTex(128, 160, (g) => {
    g.fillStyle = '#fffaf0';
    g.fillRect(0, 0, 128, 160);
    g.strokeStyle = '#d9b44a';
    g.lineWidth = 10;
    g.strokeRect(8, 8, 112, 144);
    g.fillStyle = '#7a1f2b';
    g.font = `bold 26px ${FONT}`;
    g.textAlign = 'center';
    g.fillText('표창장', 64, 52);
    g.fillStyle = '#9aa3ad';
    for (let i = 0; i < 4; i++) g.fillRect(28, 72 + i * 14, 72, 4);
    g.fillStyle = '#c8202f';
    g.beginPath();
    g.arc(92, 134, 12, 0, Math.PI * 2);
    g.fill();
  });
}

export class BossSkills {
  readonly textures: THREE.Texture[] = [];
  private webs: Web[] = [];
  private signs: Sign[] = [];
  private booms: { cap: Boom[]; award: Boom[] } = { cap: [], award: [] };
  private pull: { t: number; owner: THREE.Object3D; dx: number; dz: number } | null = null;
  private strandT = 0;
  private whiteT = 0;
  private strands: HTMLDivElement | null = null;
  private white: HTMLDivElement | null = null;

  constructor(scene: THREE.Scene, warnGeo: THREE.BufferGeometry, warnMat: THREE.Material) {
    // 거미줄: 바닥 원판 (투명 그림) + 날아가는 뭉치 + 떨어질 자리 그림자
    const wt = webTex();
    const st = signTex();
    const at = awardTex();
    this.textures.push(wt, st, at);
    const discGeo = new THREE.PlaneGeometry(WEB_R * 2, WEB_R * 2).rotateX(-Math.PI / 2);
    const discMat = new THREE.MeshBasicMaterial({ map: wt, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -10 });
    const ballGeo = new THREE.IcosahedronGeometry(0.28, 0);
    const ballMat = new THREE.MeshLambertMaterial({ color: 0xf4f4f8, wireframe: true });
    for (let i = 0; i < WEB_N; i++) {
      const disc = new THREE.Mesh(discGeo, discMat.clone());
      disc.visible = false;
      disc.renderOrder = 2;
      const ball = new THREE.Mesh(ballGeo, ballMat);
      ball.visible = false;
      const warn = new THREE.Mesh(warnGeo, warnMat);
      warn.rotation.x = -Math.PI / 2;
      warn.visible = false;
      scene.add(disc, ball, warn);
      this.webs.push({ disc, ball, warn, on: false, t: 0, from: new THREE.Vector3(), to: new THREE.Vector3(), owner: null });
    }
    // MOU 서명선
    const signGeo = new THREE.PlaneGeometry(SIGN_LEN, SIGN_W).rotateX(-Math.PI / 2);
    for (let i = 0; i < SIGN_N; i++) {
      const mat = new THREE.MeshBasicMaterial({
        map: st,
        color: 0xffffff,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -6,
        polygonOffsetUnits: -12,
      });
      const mesh = new THREE.Mesh(signGeo, mat);
      mesh.visible = false;
      mesh.renderOrder = 3;
      scene.add(mesh);
      this.signs.push({ mesh, mat, on: false, t: 0, x: 0, z: 0, ux: 1, uz: 0, hit: false });
    }
    // 학사모 (검은 판 + 모자 + 금술) · 상장 (금테 종이)
    const black = new THREE.MeshLambertMaterial({ color: 0x1d1d22 });
    const gold = new THREE.MeshLambertMaterial({ color: 0xd9b44a, emissive: 0x3a2a00 });
    const paper = new THREE.MeshLambertMaterial({ map: at });
    const paperSide = new THREE.MeshLambertMaterial({ color: 0xd9b44a });
    for (let i = 0; i < 2; i++) {
      const cap = new THREE.Group();
      const board = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.9), black);
      board.rotation.y = Math.PI / 4;
      const crown = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.26, 0.5), black);
      crown.position.y = -0.15;
      const tassel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.36, 0.05), gold);
      tassel.position.set(0.4, -0.15, 0);
      cap.add(board, crown, tassel);
      const award = new THREE.Group();
      const sheet = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.8, 0.03), [paperSide, paperSide, paperSide, paperSide, paper, paper]);
      sheet.rotation.x = -0.5;
      award.add(sheet);
      for (const [grp, list] of [
        [cap, this.booms.cap],
        [award, this.booms.award],
      ] as [THREE.Group, Boom[]][]) {
        grp.visible = false;
        // 멀리서도 보이게 크게 (상장은 비스듬히 기울여 돌린다)
        grp.scale.setScalar(1.5);
        grp.traverse((o) => (o.castShadow = true));
        scene.add(grp);
        list.push({ obj: grp, on: false, back: false, t: 0, pos: new THREE.Vector3(), turn: new THREE.Vector3(), owner: null, hitOut: false, hitBack: false });
      }
    }
  }

  // ---------- 거미줄 ----------

  /** 최내놔 처장이 (x, z)에 거미줄을 던진다. owner = 처장 (밟으면 그쪽으로 끌려간다) */
  throwWeb(from: THREE.Vector3, x: number, z: number, owner: THREE.Object3D): void {
    const w = this.webs.find((q) => !q.on) ?? this.webs[0];
    w.on = true;
    w.t = 0;
    w.from.copy(from);
    w.to.set(x, 0.1, z);
    w.owner = owner;
    w.ball.visible = true;
    w.ball.position.copy(from);
    w.disc.visible = false;
    w.warn.visible = true;
    w.warn.position.set(x, 0.07, z);
    w.warn.scale.setScalar(0.4);
  }

  /** 바닥에 깔린 거미줄 수 (날아가는 것 포함) */
  get websOut(): number {
    let n = 0;
    for (const w of this.webs) if (w.on) n++;
    return n;
  }

  /** 끌려가는 중 */
  get pulling(): boolean {
    return this.pull !== null;
  }

  // ---------- MOU 서명선 ----------

  /** (px, pz)를 지나는 서명선 (cross = 두 줄이 엇갈린다) */
  signLines(px: number, pz: number, cross: boolean): void {
    const a = Math.random() * Math.PI;
    const angles = cross ? [a, a + Math.PI / 2 + (Math.random() - 0.5) * 0.5] : [a];
    for (const ang of angles) {
      const s = this.signs.find((q) => !q.on);
      if (!s) return;
      const off = cross ? 0 : (Math.random() - 0.5) * 0.6;
      s.on = true;
      s.t = 0;
      s.hit = false;
      s.ux = Math.cos(ang);
      s.uz = Math.sin(ang);
      s.x = px - s.uz * off;
      s.z = pz + s.ux * off;
      s.mesh.position.set(s.x, 0.06, s.z);
      s.mesh.rotation.y = -ang;
      s.mesh.scale.set(1, 1, 1);
      s.mat.opacity = 0.3;
      s.mat.color.setHex(0xfff3c4);
      s.mesh.visible = true;
    }
  }

  // ---------- 기념 촬영 ----------

  /** 총장 쪽(at)에서 플래시. 시야 안이면 화면이 하얘진다. 하얘졌으면 true */
  flash(at: THREE.Vector3, c: Ctx): boolean {
    const h = hostOf(c);
    c.fx.confetti(_a.copy(at), 24, 4, 0xffffff, 2, 0.4);
    c.sound('pop', at, 1);
    const yaw = h.yaw ?? 0;
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const dx = at.x - c.eye.x;
    const dz = at.z - c.eye.z;
    const d = Math.hypot(dx, dz) || 1;
    if ((fx * dx + fz * dz) / d < FLASH_COS) return false;
    this.whiteT = WHITE_HOLD + WHITE_FADE;
    this.overlay('white').style.opacity = '1';
    return true;
  }

  /** 화면이 하얘진 동안 */
  get whitedOut(): boolean {
    return this.whiteT > 0;
  }

  // ---------- 학위·표창장 수여 ----------

  /** kind: cap = 학사모(학생 모드), award = 상장(교직원 모드). owner = 총장 (돌아오는 곳) */
  throwBoomerang(kind: 'cap' | 'award', from: THREE.Vector3, owner: THREE.Object3D, c: Ctx): void {
    const b = this.booms[kind].find((q) => !q.on);
    if (!b) return;
    b.on = true;
    b.back = false;
    b.t = 0;
    b.hitOut = false;
    b.hitBack = false;
    b.owner = owner;
    b.pos.set(from.x, BOOM_Y, from.z);
    // 플레이어 자리를 3m 지나 돌아선다 (너무 멀리는 안 간다)
    const dx = c.eye.x - from.x;
    const dz = c.eye.z - from.z;
    const d = Math.hypot(dx, dz) || 1;
    const reach = Math.min(d + 3, 34);
    b.turn.set(from.x + (dx / d) * reach, BOOM_Y, from.z + (dz / d) * reach);
    b.obj.position.copy(b.pos);
    b.obj.visible = true;
    c.sound('throw', from, 0.9);
  }

  // ---------- 매 프레임 ----------

  update(dt: number, c: Ctx): void {
    const eye = c.eye;
    const feet = c.feet;
    for (const w of this.webs) {
      if (!w.on) continue;
      w.t += dt;
      if (w.t < WEB_FLIGHT) {
        const f = w.t / WEB_FLIGHT;
        w.ball.position.lerpVectors(w.from, w.to, f);
        w.ball.position.y += Math.sin(f * Math.PI) * 2.6;
        w.ball.rotation.x += dt * 8;
        w.ball.rotation.y += dt * 6;
        w.warn.scale.setScalar(0.4 + f * 0.7);
        continue;
      }
      if (w.ball.visible) {
        w.ball.visible = false;
        w.warn.visible = false;
        w.disc.visible = true;
        w.disc.position.copy(w.to);
        w.disc.rotation.y = Math.random() * Math.PI;
        (w.disc.material as THREE.MeshBasicMaterial).opacity = 1;
        c.sound('hit', w.to, 0.5);
      }
      const left = WEB_FLIGHT + WEB_LIFE - w.t;
      (w.disc.material as THREE.MeshBasicMaterial).opacity = left < 0.8 ? Math.max(0, left / 0.8) : 1;
      const on = feet < 0.3 && Math.hypot(eye.x - w.to.x, eye.z - w.to.z) < WEB_R * 0.85;
      if (on && !this.pull && w.owner && c.freeze(0.75, '거미줄에 걸렸다! (끌려가는 중)')) {
        // 처장 쪽으로: 처장에게서 플레이어 쪽으로 PULL_GAP 떨어진 자리까지
        const o = w.owner.position;
        const ddx = eye.x - o.x;
        const ddz = eye.z - o.z;
        const dd = Math.hypot(ddx, ddz) || 1;
        this.pull = { t: 0, owner: w.owner, dx: ddx / dd, dz: ddz / dd };
        this.strandT = PULL_T + 0.6;
        this.overlay('strands').style.opacity = '1';
        c.sound('squeal', eye, 0.6);
        left0(w);
        continue;
      }
      if (left <= 0) left0(w);
    }
    // 끌려가기: 0.6초 동안 처장 곁으로 (밀기는 Game.shove — 장애물·구역 경계를 지킨다)
    const q = this.pull;
    const h = hostOf(c);
    if (q && h.pos && h.shove) {
      q.t += dt;
      const o = q.owner.position;
      const tx = o.x + q.dx * PULL_GAP;
      const tz = o.z + q.dz * PULL_GAP;
      const k = Math.min(1, dt / Math.max(0.05, PULL_T - q.t + dt));
      h.shove((tx - h.pos.x) * k, (tz - h.pos.z) * k, 0);
      if (q.t >= PULL_T) this.pull = null;
    } else if (q) this.pull = null;
    if (this.strandT > 0) {
      this.strandT -= dt;
      this.overlay('strands').style.opacity = Math.min(1, Math.max(0, this.strandT / 0.6)).toFixed(2);
    }
    if (this.whiteT > 0) {
      this.whiteT -= dt;
      this.overlay('white').style.opacity = Math.min(1, Math.max(0, this.whiteT / WHITE_FADE)).toFixed(2);
    }
    for (const s of this.signs) {
      if (!s.on) continue;
      s.t += dt;
      if (s.t < SIGN_WARN) {
        // 예고: 옅은 금색, 점점 빠르게 깜빡인다
        s.mat.opacity = 0.18 + 0.3 * (Math.floor(s.t * (6 + s.t * 10)) % 2);
        continue;
      }
      const g = s.t - SIGN_WARN;
      if (g < SIGN_GLOW) {
        if (g - dt < 0) {
          s.mat.color.setHex(0xffd34d);
          s.mesh.scale.set(1, 1, 1.5);
          c.sound('charge', _a.set(s.x, 0.5, s.z), 0.5);
        }
        s.mat.opacity = 0.85 + Math.sin(g * 40) * 0.15;
        if (!s.hit && feet < 0.4) {
          // 선분까지 거리
          const px = eye.x - s.x;
          const pz = eye.z - s.z;
          const along = px * s.ux + pz * s.uz;
          const side = Math.abs(-px * s.uz + pz * s.ux);
          if (Math.abs(along) <= SIGN_LEN / 2 && side < SIGN_HIT) {
            s.hit = true;
            c.hurt(1, _a.set(s.x + s.ux * along, 0.5, s.z + s.uz * along), 'sign');
          }
        }
        continue;
      }
      s.mat.opacity = Math.max(0, 1 - (g - SIGN_GLOW) / 0.3);
      if (g >= SIGN_GLOW + 0.3) {
        s.on = false;
        s.mesh.visible = false;
      }
    }
    for (const b of [...this.booms.cap, ...this.booms.award]) {
      if (!b.on) continue;
      b.t += dt;
      const target = b.back && b.owner ? _a.set(b.owner.position.x, BOOM_Y, b.owner.position.z) : b.turn;
      const dx = target.x - b.pos.x;
      const dz = target.z - b.pos.z;
      const d = Math.hypot(dx, dz);
      const step = BOOM_SPEED * dt;
      if (d <= step || b.t > 8) {
        if (!b.back && b.t <= 8) {
          b.back = true;
        } else {
          b.on = false;
          b.obj.visible = false;
          continue;
        }
      } else {
        b.pos.x += (dx / d) * step;
        b.pos.z += (dz / d) * step;
      }
      b.obj.position.copy(b.pos);
      b.obj.rotation.y += dt * 14;
      const close = Math.hypot(eye.x - b.pos.x, eye.z - b.pos.z) < BOOM_HIT && feet < BOOM_JUMP;
      if (close && !(b.back ? b.hitBack : b.hitOut)) {
        if (b.back) b.hitBack = true;
        else b.hitOut = true;
        c.hurt(1, b.pos, 'cap');
      }
    }

    function left0(w: Web): void {
      w.on = false;
      w.disc.visible = false;
      w.ball.visible = false;
      w.warn.visible = false;
    }
  }

  /** 화면 덮개 (거미줄 가닥 · 하얀 플래시). fps.html을 고치지 않으려고 여기서 만든다 */
  private overlay(kind: 'strands' | 'white'): HTMLDivElement {
    const have = kind === 'strands' ? this.strands : this.white;
    if (have) return have;
    const d = document.createElement('div');
    // 구역 카드·도장(3)·화면 전환(4)·메뉴보다 아래, HUD보다 위
    d.style.cssText = 'position:fixed;inset:0;pointer-events:none;opacity:0;z-index:2;';
    if (kind === 'white') {
      d.style.background = '#ffffff';
    } else {
      // 네 모서리에서 뻗는 거미줄 가닥
      const corner = (x: number, y: number, sx: number, sy: number) => {
        let s = '';
        for (let i = 0; i < 6; i++) {
          const a = (i / 5) * (Math.PI / 2);
          s += `<line vector-effect="non-scaling-stroke" x1="${x}" y1="${y}" x2="${x + sx * Math.cos(a) * 34}" y2="${y + sy * Math.sin(a) * 34}"/>`;
        }
        for (const r of [10, 19, 28]) {
          const pts: string[] = [];
          for (let i = 0; i <= 5; i++) {
            const a = (i / 5) * (Math.PI / 2);
            pts.push(`${x + sx * Math.cos(a) * r},${y + sy * Math.sin(a) * r}`);
          }
          s += `<polyline vector-effect="non-scaling-stroke" fill="none" points="${pts.join(' ')}"/>`;
        }
        return s;
      };
      d.innerHTML =
        `<svg viewBox="0 0 100 100" preserveAspectRatio="none" style="width:100%;height:100%">` +
        `<g stroke="rgba(245,245,250,0.9)" stroke-width="2.5">` +
        corner(0, 0, 1, 1) +
        corner(100, 0, -1, 1) +
        corner(0, 100, 1, -1) +
        corner(100, 100, -1, -1) +
        `</g></svg>`;
    }
    document.body.appendChild(d);
    if (kind === 'strands') this.strands = d;
    else this.white = d;
    return d;
  }

  clear(): void {
    for (const w of this.webs) {
      w.on = false;
      w.disc.visible = false;
      w.ball.visible = false;
      w.warn.visible = false;
    }
    for (const s of this.signs) {
      s.on = false;
      s.mesh.visible = false;
    }
    for (const b of [...this.booms.cap, ...this.booms.award]) {
      b.on = false;
      b.obj.visible = false;
    }
    this.pull = null;
    this.strandT = 0;
    this.whiteT = 0;
    if (this.strands) this.strands.style.opacity = '0';
    if (this.white) this.white.style.opacity = '0';
  }
}
