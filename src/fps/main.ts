import * as THREE from 'three';
import { bulkTex, loadLogos, mailTex, stampMarkTex } from './textures';
import { buildWorld, type World } from './world';

// Staff Smash: HUFS 1인칭 시험판. 본관 앞에서 날아오는 "새벽 3시 메일"에 도장을 던져 처리한다.
// 본편(2D)과 따로 도는 시험용 페이지다. 사람(학생·총장)은 나오지 않는다.

const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
const TIMER = params.has('timer');
const TOUCH = params.has('touch') || window.matchMedia('(pointer: coarse)').matches;

const EYE = 1.6;
const WALK = 5;
const RUN = 8.5;
const RADIUS = 0.45;
const MAX_HP = 10;
const FIRE_CD = 0.28;
const STAMP_SPEED = 24;
const START_CLOCK = 16 * 60 + 52;
const OFF_HOURS = 17 * 60;

const WAVES = [
  { small: 5, big: 0 },
  { small: 8, big: 1 },
  { small: 11, big: 2 },
];

type Phase = 'title' | 'play' | 'paused' | 'clear' | 'over';

interface Mail {
  obj: THREE.Group;
  body: THREE.Mesh;
  wings: THREE.Mesh[];
  hp: number;
  big: boolean;
  speed: number;
  dmg: number;
  radius: number;
  phase: number;
  state: 'fly' | 'retreat' | 'dying';
  t: number;
  pop: number;
  vel: THREE.Vector3;
}

interface Stamp {
  obj: THREE.Group;
  vel: THREE.Vector3;
  life: number;
}

interface Mark {
  obj: THREE.Sprite | THREE.Mesh;
  t: number;
  life: number;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(70, 1, 0.05, 900);
  world!: World;
  phase: Phase = 'title';
  pos = new THREE.Vector3(0, EYE, 11);
  yaw = 0;
  pitch = 0.12;
  hp = MAX_HP;
  invuln = 0;
  slow = 0;
  cooldown = 0;
  swing = 0;
  bob = 0;
  elapsed = 0;
  wave = 0;
  toSpawn: boolean[] = [];
  spawnT = 0;
  waveDelay = 0;
  mails: Mail[] = [];
  stamps: Stamp[] = [];
  marks: Mark[] = [];
  thrown = 0;
  hits = 0;
  processed = 0;
  keys = new Set<string>();
  firing = false;
  stick = new THREE.Vector2();
  private last = performance.now();
  private viewmodel = new THREE.Group();
  private handStamp = new THREE.Group();
  private mailGeo = new THREE.BoxGeometry(0.9, 0.62, 0.1);
  private wingGeo = new THREE.BoxGeometry(0.34, 0.03, 0.26);
  private mailMats: THREE.Material[];
  private bulkMats: THREE.Material[];
  private wingMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  private stampGeoH = new THREE.BoxGeometry(0.1, 0.24, 0.1);
  private stampGeoS = new THREE.BoxGeometry(0.3, 0.1, 0.3);
  private woodMat = new THREE.MeshLambertMaterial({ color: 0x8b5a2b });
  private redMat = new THREE.MeshLambertMaterial({ color: 0xc8202f });
  private markTex = stampMarkTex();
  private bannerTimer = 0;
  private noteTimer = 0;

  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: !TOUCH });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, TOUCH ? 1.5 : 2));
    this.renderer.shadowMap.enabled = !TOUCH;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    $('app').appendChild(this.renderer.domElement);
    const side = new THREE.MeshLambertMaterial({ color: 0xe8dfc9 });
    const face = new THREE.MeshLambertMaterial({ map: mailTex() });
    const bulk = new THREE.MeshLambertMaterial({ map: bulkTex() });
    this.mailMats = [side, side, side, side, face, face];
    this.bulkMats = [side, side, side, side, bulk, bulk];
    this.scene.add(this.camera);
    this.buildViewmodel();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    if (TOUCH) document.body.classList.add('touch');
  }

  async init(): Promise<void> {
    const logos = await loadLogos();
    this.world = buildWorld(this.scene, logos);
    this.bindInput();
    this.showTitle();
    if (TIMER) {
      const step = () => {
        this.tick();
        setTimeout(step, 16);
      };
      step();
    } else {
      this.renderer.setAnimationLoop(() => this.tick());
    }
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** 화면 오른쪽 아래 주무관의 팔과 도장 */
  private buildViewmodel(): void {
    const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.6), new THREE.MeshLambertMaterial({ color: 0x9cc3e6 }));
    sleeve.position.set(0, -0.05, 0.22);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.14), new THREE.MeshLambertMaterial({ color: 0xf1c7a0 }));
    hand.position.set(0, -0.02, -0.12);
    const handle = new THREE.Mesh(this.stampGeoH, this.woodMat);
    handle.position.set(0, 0.1, -0.14);
    const head = new THREE.Mesh(this.stampGeoS, this.redMat);
    head.position.set(0, 0.25, -0.14);
    this.handStamp.add(handle, head);
    this.viewmodel.add(sleeve, hand, this.handStamp);
    this.viewmodel.scale.setScalar(0.55);
    this.viewmodel.position.set(0.34, -0.3, -0.6);
    this.viewmodel.rotation.set(0.15, -0.12, 0);
    this.camera.add(this.viewmodel);
  }

  // ---------- 입력 ----------

  private bindInput(): void {
    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (e.code === 'Escape' && this.phase === 'play' && !document.pointerLockElement) this.pause();
      if ((e.code === 'Enter' || e.code === 'Space') && (this.phase === 'clear' || this.phase === 'over')) this.restart();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    const canvas = this.renderer.domElement;
    document.addEventListener('mousemove', (e) => {
      if (this.phase !== 'play' || document.pointerLockElement !== canvas) return;
      this.look(e.movementX * 0.0022, e.movementY * 0.0022);
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || this.phase !== 'play') return;
      if (!TOUCH && document.pointerLockElement !== canvas && !DEBUG) {
        canvas.requestPointerLock();
        return;
      }
      this.firing = true;
    });
    window.addEventListener('mouseup', () => (this.firing = false));
    document.addEventListener('pointerlockchange', () => {
      if (!document.pointerLockElement && this.phase === 'play') this.pause();
    });
    if (TOUCH) this.bindTouch();
  }

  private bindTouch(): void {
    const stickEl = $('stick');
    const knob = $('knob');
    let moveId: number | null = null;
    let lookId: number | null = null;
    let origin = { x: 0, y: 0 };
    let lastLook = { x: 0, y: 0 };
    const el = this.renderer.domElement;
    el.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        for (const t of Array.from(e.changedTouches)) {
          if (t.clientX < window.innerWidth * 0.45 && moveId === null) {
            moveId = t.identifier;
            origin = { x: t.clientX, y: t.clientY };
            stickEl.style.left = `${t.clientX - 60}px`;
            stickEl.style.top = `${t.clientY - 60}px`;
            stickEl.style.bottom = 'auto';
          } else if (lookId === null) {
            lookId = t.identifier;
            lastLook = { x: t.clientX, y: t.clientY };
          }
        }
      },
      { passive: false },
    );
    el.addEventListener(
      'touchmove',
      (e) => {
        e.preventDefault();
        for (const t of Array.from(e.changedTouches)) {
          if (t.identifier === moveId) {
            const dx = Math.max(-50, Math.min(50, t.clientX - origin.x));
            const dy = Math.max(-50, Math.min(50, t.clientY - origin.y));
            this.stick.set(dx / 50, dy / 50);
            knob.style.transform = `translate(${dx}px, ${dy}px)`;
          } else if (t.identifier === lookId) {
            if (this.phase === 'play') this.look((t.clientX - lastLook.x) * 0.006, (t.clientY - lastLook.y) * 0.006);
            lastLook = { x: t.clientX, y: t.clientY };
          }
        }
      },
      { passive: false },
    );
    const end = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === moveId) {
          moveId = null;
          this.stick.set(0, 0);
          knob.style.transform = '';
        }
        if (t.identifier === lookId) lookId = null;
      }
    };
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
    const fire = $('fire');
    fire.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.firing = true;
    });
    fire.addEventListener('touchend', () => (this.firing = false));
  }

  look(dx: number, dy: number): void {
    this.yaw -= dx;
    this.pitch = Math.max(-1.2, Math.min(1.35, this.pitch - dy));
  }

  // ---------- 진행 ----------

  private overlay(html: string): void {
    const o = $('overlay');
    o.innerHTML = html;
    o.hidden = false;
  }

  private hideOverlay(): void {
    $('overlay').hidden = true;
  }

  private showTitle(): void {
    this.phase = 'title';
    const ctl = TOUCH
      ? '왼쪽 화면을 끌어 이동, 오른쪽 화면을 끌어 시점, 빨간 버튼으로 도장 던지기'
      : '이동 WASD · 달리기 Shift · 시점 마우스 · 도장 던지기 클릭';
    this.overlay(`
      <div class="panel">
        <img class="emblem" src="hufs/emblem-mono.png" alt=""> <img class="type" src="hufs/hufs-type.png" alt="HUFS">
        <h1>STAFF SMASH <span class="tag">1인칭 시험판</span></h1>
        <p class="big">오후 4시 52분, 본관 앞</p>
        <p>퇴근 8분 전, 본관 쪽에서 "새벽 3시 메일"이 떼로 날아옵니다.<br>도장을 던져 세 차례 몰려오는 메일을 모두 처리하세요.</p>
        <p>${ctl}</p>
        <button id="startBtn" type="button">출근하기</button>
        <a class="btn" href="./">본편(2D)으로</a>
        <p style="font-size:12px;color:#8b95a8">비공식 게임 · 본편과 따로 도는 시험용 페이지입니다</p>
      </div>`);
    $('startBtn').addEventListener('click', () => this.start());
  }

  start(): void {
    this.hideOverlay();
    if (!TOUCH && !DEBUG) this.renderer.domElement.requestPointerLock();
    if (TOUCH && !document.fullscreenElement) {
      // 전체 화면을 못 쓰는 브라우저(iPhone 등)는 그대로 한다
      document.documentElement.requestFullscreen?.().catch(() => undefined);
    }
    if (this.phase === 'title') this.beginWave(0);
    this.phase = 'play';
    this.last = performance.now();
  }

  private pause(): void {
    if (this.phase !== 'play') return;
    this.phase = 'paused';
    this.firing = false;
    this.keys.clear();
    this.overlay(`
      <div class="panel">
        <h1>일시정지</h1>
        <p>${TOUCH ? '버튼을 눌러 계속합니다' : '클릭하면 계속합니다 (마우스로 시점)'}</p>
        <button id="resumeBtn" type="button">계속하기</button>
        <a class="btn" href="./">본편(2D)으로</a>
      </div>`);
    $('resumeBtn').addEventListener('click', () => this.start());
  }

  restart(): void {
    for (const m of this.mails) this.scene.remove(m.obj);
    for (const s of this.stamps) this.scene.remove(s.obj);
    for (const k of this.marks) this.scene.remove(k.obj);
    this.mails = [];
    this.stamps = [];
    this.marks = [];
    this.pos.set(0, EYE, 11);
    this.yaw = 0;
    this.pitch = 0.12;
    this.hp = MAX_HP;
    this.elapsed = 0;
    this.thrown = 0;
    this.hits = 0;
    this.processed = 0;
    this.slow = 0;
    this.invuln = 0;
    this.waveDelay = 0;
    this.phase = 'title';
    this.start();
  }

  private beginWave(i: number): void {
    this.wave = i;
    const w = WAVES[i];
    this.toSpawn = [...Array(w.small).fill(false), ...Array(w.big).fill(true)];
    for (let k = this.toSpawn.length - 1; k > 0; k--) {
      const j = Math.floor(Math.random() * (k + 1));
      [this.toSpawn[k], this.toSpawn[j]] = [this.toSpawn[j], this.toSpawn[k]];
    }
    this.spawnT = 1.2;
    this.banner(`메일 ${i + 1}차 도착!`, i === 0 ? '본관 쪽에서 날아옵니다 — 도장으로 처리하세요' : `${w.small + w.big}통이 몰려옵니다`);
  }

  private banner(title: string, sub = ''): void {
    const b = $('banner');
    b.innerHTML = `${title}${sub ? `<small>${sub}</small>` : ''}`;
    b.style.opacity = '1';
    this.bannerTimer = 2.2;
  }

  private note(text: string): void {
    const n = $('note');
    n.textContent = text;
    n.style.opacity = '1';
    this.noteTimer = 1.4;
  }

  // ---------- 메일 ----------

  private spawnMail(big: boolean): void {
    const obj = new THREE.Group();
    const body = new THREE.Mesh(this.mailGeo, big ? this.bulkMats : this.mailMats);
    body.castShadow = true;
    obj.add(body);
    const wings: THREE.Mesh[] = [];
    for (const s of [-1, 1]) {
      const w = new THREE.Mesh(this.wingGeo, this.wingMat);
      w.position.set(s * 0.55, 0.05, 0);
      obj.add(w);
      wings.push(w);
    }
    const scale = big ? 1.9 : 1.25;
    obj.scale.setScalar(scale);
    // 본관 쪽(먼 곳) 또는 양옆에서 나온다
    const fromSide = Math.random() < 0.3;
    const x = fromSide ? (Math.random() < 0.5 ? -25 : 25) : -18 + Math.random() * 36;
    const z = fromSide ? -10 + Math.random() * 20 : -17 + Math.random() * 3;
    obj.position.set(x, 2.5 + Math.random() * 3.5, z);
    this.scene.add(obj);
    this.mails.push({
      obj,
      body,
      wings,
      hp: big ? 3 : 1,
      big,
      speed: big ? 2.3 : 3.2 + Math.random() * 0.8,
      dmg: big ? 2 : 1,
      radius: 0.55 * scale,
      phase: Math.random() * 6.28,
      state: 'fly',
      t: 0,
      pop: 0,
      vel: new THREE.Vector3(),
    });
  }

  private updateMails(dt: number): void {
    const eye = new THREE.Vector3(this.pos.x, EYE - 0.25, this.pos.z);
    for (const m of this.mails) {
      m.t += dt;
      const o = m.obj;
      m.wings.forEach((w, i) => (w.rotation.z = (i ? -1 : 1) * Math.sin(m.t * 18) * 0.6));
      if (m.pop > 0) {
        m.pop -= dt;
        o.scale.setScalar((m.big ? 1.9 : 1.25) * (1 + Math.max(0, m.pop) * 1.2));
      }
      if (m.state === 'dying') {
        m.vel.y -= 14 * dt;
        o.position.addScaledVector(m.vel, dt);
        o.rotation.x += dt * 9;
        o.rotation.z += dt * 6;
        continue;
      }
      const to = eye.clone().sub(o.position);
      const dist = to.length();
      to.normalize();
      if (m.state === 'retreat') {
        o.position.addScaledVector(to, -m.speed * 1.4 * dt);
        o.position.y += dt * 1.5;
        if (m.t > 1.1) m.state = 'fly';
      } else {
        // 좌우로 흔들리며 다가온다
        const sideV = new THREE.Vector3(-to.z, 0, to.x).multiplyScalar(Math.sin(m.t * 2.6 + m.phase) * 1.4);
        o.position.addScaledVector(to, m.speed * dt).addScaledVector(sideV, dt);
        o.position.y += Math.sin(m.t * 3 + m.phase) * 0.4 * dt;
        if (dist < m.radius + 0.55) {
          this.hurt(m.dmg);
          m.state = 'retreat';
          m.t = 0;
        }
      }
      o.position.y = Math.max(0.9, Math.min(7, o.position.y));
      o.lookAt(eye);
    }
    // 떨어진 메일은 치운다
    this.mails = this.mails.filter((m) => {
      if (m.state === 'dying' && m.obj.position.y < -1) {
        this.scene.remove(m.obj);
        return false;
      }
      return true;
    });
  }

  private hitMail(m: Mail, at: THREE.Vector3): void {
    m.hp--;
    this.hits++;
    m.pop = 0.12;
    this.addMark(at, m.hp <= 0 ? 1.3 : 0.8);
    if (m.hp <= 0) {
      m.state = 'dying';
      m.vel.set((Math.random() - 0.5) * 2, 4, 0).add(new THREE.Vector3(Math.sin(this.yaw) * -3, 0, Math.cos(this.yaw) * -3));
      this.processed++;
      if (m.big) this.note('단체 메일 처리!');
    } else {
      const back = m.obj.position.clone().sub(this.pos).setY(0).normalize();
      m.obj.position.addScaledVector(back, 1.2);
    }
  }

  private addMark(at: THREE.Vector3, size: number): void {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.markTex, transparent: true, depthTest: false }));
    s.position.copy(at);
    s.scale.setScalar(size * 1.6);
    s.renderOrder = 10;
    this.scene.add(s);
    this.marks.push({ obj: s, t: 0, life: 0.8 });
  }

  // ---------- 플레이어 ----------

  private hurt(dmg: number): void {
    if (this.invuln > 0 || this.phase !== 'play') return;
    this.hp = Math.max(0, this.hp - dmg);
    this.invuln = 0.6;
    this.slow = 1.5;
    this.note('메일 확인 중… (느려짐)');
    const v = $('vignette');
    v.style.opacity = '1';
    setTimeout(() => (v.style.opacity = '0'), 160);
    if (this.hp <= 0) this.gameOver();
  }

  fire(): void {
    if (this.cooldown > 0 || this.phase !== 'play') return;
    this.cooldown = FIRE_CD;
    this.swing = 1;
    this.thrown++;
    const obj = new THREE.Group();
    const h = new THREE.Mesh(this.stampGeoH, this.woodMat);
    h.position.y = 0.12;
    const s = new THREE.Mesh(this.stampGeoS, this.redMat);
    obj.add(h, s);
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const start = new THREE.Vector3(0.3, -0.25, -0.5).applyQuaternion(this.camera.quaternion).add(this.camera.position);
    obj.position.copy(start);
    this.scene.add(obj);
    this.stamps.push({ obj, vel: dir.multiplyScalar(STAMP_SPEED).add(new THREE.Vector3(0, 0.8, 0)), life: 1.6 });
  }

  private updateStamps(dt: number): void {
    for (const s of this.stamps) {
      s.life -= dt;
      s.vel.y -= 5 * dt;
      // 빠르게 날아가므로 두 번 나눠 움직이며 맞았는지 본다
      for (let k = 0; k < 2 && s.life > 0; k++) {
        s.obj.position.addScaledVector(s.vel, dt / 2);
        for (const m of this.mails) {
          if (m.state === 'dying') continue;
          if (s.obj.position.distanceTo(m.obj.position) < m.radius + 0.28) {
            this.hitMail(m, s.obj.position.clone());
            s.life = 0;
            break;
          }
        }
      }
      s.obj.rotation.x += dt * 14;
      if (s.obj.position.y < 0.08 && s.life > 0) {
        s.life = 0;
        const ring = new THREE.Mesh(
          new THREE.PlaneGeometry(0.9, 0.9),
          new THREE.MeshBasicMaterial({ map: this.markTex, transparent: true, depthWrite: false }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(s.obj.position.x, 0.02, s.obj.position.z);
        this.scene.add(ring);
        this.marks.push({ obj: ring, t: 0, life: 1.4 });
      }
    }
    this.stamps = this.stamps.filter((s) => {
      if (s.life <= 0) {
        this.scene.remove(s.obj);
        return false;
      }
      return true;
    });
  }

  private updateMarks(dt: number): void {
    for (const k of this.marks) {
      k.t += dt;
      const a = Math.max(0, 1 - k.t / k.life);
      const mat = (k.obj as THREE.Mesh).material as THREE.Material;
      mat.opacity = a;
    }
    this.marks = this.marks.filter((k) => {
      if (k.t >= k.life) {
        this.scene.remove(k.obj);
        return false;
      }
      return true;
    });
  }

  private move(dt: number): void {
    let fx = 0;
    let fz = 0;
    const k = this.keys;
    if (k.has('KeyW') || k.has('ArrowUp')) fz += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) fz -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) fx += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) fx -= 1;
    fx += this.stick.x;
    fz -= this.stick.y;
    const len = Math.hypot(fx, fz);
    if (len > 1) {
      fx /= len;
      fz /= len;
    }
    const running = k.has('ShiftLeft') || k.has('ShiftRight') || this.stick.length() > 0.95;
    const speed = (running ? RUN : WALK) * (this.slow > 0 ? 0.55 : 1);
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    // 앞 = (-sin, -cos), 오른쪽 = (cos, -sin)
    this.pos.x += (fx * cos - fz * sin) * speed * dt;
    this.pos.z += (-fx * sin - fz * cos) * speed * dt;
    const b = this.world.bounds;
    this.pos.x = Math.max(b.minX, Math.min(b.maxX, this.pos.x));
    this.pos.z = Math.max(b.minZ, Math.min(b.maxZ, this.pos.z));
    for (const o of this.world.obstacles) {
      const cx = Math.max(o.minX, Math.min(o.maxX, this.pos.x));
      const cz = Math.max(o.minZ, Math.min(o.maxZ, this.pos.z));
      const dx = this.pos.x - cx;
      const dz = this.pos.z - cz;
      const d = Math.hypot(dx, dz);
      if (d < RADIUS) {
        if (d > 0.0001) {
          this.pos.x = cx + (dx / d) * RADIUS;
          this.pos.z = cz + (dz / d) * RADIUS;
        } else {
          this.pos.z = o.maxZ + RADIUS;
        }
      }
    }
    if (len > 0.1) this.bob += dt * (running ? 13 : 9);
  }

  private gameOver(): void {
    this.phase = 'over';
    this.firing = false;
    document.exitPointerLock?.();
    this.overlay(`
      <div class="panel">
        <h1 style="color:#ff6b6b">야근 확정</h1>
        <p>본관 앞에서 메일에 묻혀 퇴근하지 못했습니다.</p>
        <p>처리한 메일 ${this.processed}통 · 명중률 ${this.accuracy()}%</p>
        <button id="againBtn" type="button">다시 하기</button>
        <a class="btn" href="./">본편(2D)으로</a>
      </div>`);
    $('againBtn').addEventListener('click', () => this.restart());
  }

  private accuracy(): number {
    return this.thrown ? Math.round((this.hits / this.thrown) * 100) : 0;
  }

  private clear(): void {
    this.phase = 'clear';
    this.firing = false;
    document.exitPointerLock?.();
    const clock = START_CLOCK + this.elapsed / 60;
    const m = Math.floor(this.elapsed / 60);
    const s = Math.floor(this.elapsed % 60);
    this.overlay(`
      <div class="panel">
        <img class="emblem" src="hufs/emblem-mono.png" alt="">
        <h1>본관 앞 정리 완료!</h1>
        <p class="big">${clockText(clock)} · ${clock <= OFF_HOURS ? '퇴근까지 ' + Math.ceil(OFF_HOURS - clock) + '분' : '초과근무 ' + Math.floor(clock - OFF_HOURS) + '분'}</p>
        <p>처리한 메일 ${this.processed}통 · 명중률 ${this.accuracy()}% · 걸린 시간 ${m}분 ${s.toString().padStart(2, '0')}초 · 남은 체력 ${this.hp}/${MAX_HP}</p>
        <p style="font-size:13px">1인칭 시험판은 여기까지입니다. 본편은 2D 벨트스크롤입니다.</p>
        <button id="againBtn" type="button">다시 하기</button>
        <a class="btn" href="./">본편(2D)으로</a>
      </div>`);
    $('againBtn').addEventListener('click', () => this.restart());
  }

  // ---------- 매 프레임 ----------

  tick(): void {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.phase === 'play') this.step(dt);
    else if (this.phase === 'title') this.yaw = Math.sin(now / 4000) * 0.25;
    this.camera.position.set(this.pos.x, EYE + Math.sin(this.bob) * 0.05, this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    // 도장 휘두르기
    this.swing = Math.max(0, this.swing - dt * 5);
    this.viewmodel.rotation.x = 0.15 - Math.sin(this.swing * Math.PI) * 1.1;
    this.viewmodel.position.y = -0.3 + Math.sin(this.bob * 0.5) * 0.012;
    this.handStamp.visible = this.cooldown < FIRE_CD * 0.4;
    this.updateHud(dt);
    this.renderer.render(this.scene, this.camera);
  }

  private step(dt: number): void {
    this.elapsed += dt;
    if (this.invuln > 0) this.invuln -= dt;
    if (this.slow > 0) this.slow -= dt;
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.firing) this.fire();
    this.move(dt);
    // 웨이브
    if (this.toSpawn.length > 0) {
      this.spawnT -= dt;
      const alive = this.mails.filter((m) => m.state !== 'dying').length;
      if (this.spawnT <= 0 && alive < 6) {
        this.spawnMail(this.toSpawn.pop() as boolean);
        this.spawnT = 0.85;
      }
    } else if (!this.mails.some((m) => m.state !== 'dying')) {
      if (this.waveDelay <= 0) this.waveDelay = 1.6;
      this.waveDelay -= dt;
      if (this.waveDelay <= 0.0001) {
        this.waveDelay = 0;
        if (this.wave + 1 < WAVES.length) this.beginWave(this.wave + 1);
        else this.clear();
      }
    }
    this.updateMails(dt);
    this.updateStamps(dt);
    this.updateMarks(dt);
  }

  private updateHud(dt: number): void {
    const clock = START_CLOCK + this.elapsed / 60;
    const left = Math.ceil(OFF_HOURS - clock);
    $('clock').innerHTML = `${clockText(clock)} · ${left > 0 ? `퇴근까지 ${left}분` : `초과근무 ${Math.floor(clock - OFF_HOURS)}분`}<small>1인칭 시험판 · 본관 앞</small>`;
    const r = this.hp / MAX_HP;
    const bar = $('hpbar');
    bar.style.width = `${r * 100}%`;
    bar.style.background = r > 0.5 ? '#5bd16b' : r > 0.25 ? '#f5c542' : '#e5484d';
    const remain = this.toSpawn.length + this.mails.filter((m) => m.state !== 'dying').length;
    $('wave').textContent = `${this.wave + 1}차 메일 ${remain}통 남음 · 처리 ${this.processed}통`;
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) $('banner').style.opacity = '0';
    }
    if (this.noteTimer > 0) {
      this.noteTimer -= dt;
      if (this.noteTimer <= 0) $('note').style.opacity = '0';
    }
  }
}

function clockText(min: number): string {
  const t = Math.floor(min);
  return `${Math.floor(t / 60)}:${(t % 60).toString().padStart(2, '0')}`;
}

const game = new Game();
void game.init();
if (DEBUG) (window as unknown as { __fps: Game }).__fps = game;
