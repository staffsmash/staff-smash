import Phaser from 'phaser';
import {
  DEBUG_DEFAULT,
  DEPTH_RANGE,
  FLOOR_BOTTOM,
  FLOOR_TOP,
  FONT,
  FORCE_TOUCH,
  GAME_H,
  GAME_W,
  START_CLOCK,
} from '../config';
import { Controls } from '../input/Controls';
import { TouchPad } from '../ui/TouchPad';
import { Hud, type BossInfo } from '../ui/Hud';
import { Player } from '../entities/Player';
import type { AttackDef, Fighter } from '../entities/Fighter';
import type { Enemy } from '../entities/Enemy';
import { MailEnemy } from '../entities/MailEnemy';
import { PhoneEnemy } from '../entities/PhoneEnemy';
import { BubbleEnemy } from '../entities/BubbleEnemy';
import { StudentEnemy } from '../entities/StudentEnemy';
import { NoticeBoss } from '../entities/NoticeBoss';
import { Projectile } from '../entities/Projectile';
import { WeaponItem } from '../entities/WeaponItem';
import { ReportTrap } from '../entities/ReportTrap';
import { Supervisor, type SupervisorKind } from '../entities/Supervisor';
import { WEAPONS, isWeaponId } from '../entities/weapons';
import { createQuestionBubble, createWeaponIcon } from '../entities/rigs';
import { assignStudentNames, TYPE_LABEL, type StudentType } from '../data/names';
import stageData from '../data/stage1.json';
import type { StageStats } from '../grade';
import { drawBackground } from './background';
import * as fx from '../fx';

// 교직원 모드 1스테이지. 구역을 차례로 잠그고 웨이브(stage1.json)를 정리한다.

interface ZoneDef {
  left: number;
  label: string;
  maxAlive: number;
  waves: string[];
  supervisors: string[];
  adds?: { type: string; every: number; max: number };
}

interface StageDef {
  id: string;
  title: string;
  zones: ZoneDef[];
  weapons: { id: string; x: number; y: number }[];
}

const STAGE = stageData as StageDef;
const ZONES = STAGE.zones;
const STAGE_W = ZONES[ZONES.length - 1].left + GAME_W;
const MAX_ATTACKERS = 2;
const TRIGGER_X = 330;

interface DebugBox {
  x: number;
  y: number;
  facing: number;
  reach: number;
  ttl: number;
}

export class StageScene extends Phaser.Scene {
  controls!: Controls;
  player!: Player;
  enemies: Enemy[] = [];
  private pad: TouchPad | null = null;
  private hud!: Hud;
  private attackers = new Set<Enemy>();
  private projectiles: Projectile[] = [];
  private items: WeaponItem[] = [];
  private traps: ReportTrap[] = [];
  private sups: Supervisor[] = [];
  private boss: NoticeBoss | null = null;
  private names = {} as Record<StudentType, string>;
  private zoneIndex = 0;
  private zoneState: 'walk' | 'fight' | 'done' = 'walk';
  private queue: string[] = [];
  private spawnT = 0;
  private addsT = 0;
  private noticeT = 3;
  private camMin = 0;
  private hitstop = 0;
  private specialT = -1;
  private specialFired = false;
  private specialObjs: Phaser.GameObjects.GameObject[] = [];
  private paused = false;
  private over = false;
  private finishing = false;
  private debug = false;
  private debugG!: Phaser.GameObjects.Graphics;
  private debugBoxes: DebugBox[] = [];
  private combo = 0;
  private comboT = 0;
  private maxCombo = 0;
  private elapsed = 0;
  private damageTaken = 0;
  private goText!: Phaser.GameObjects.Text;
  private pauseObjs: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super('stage');
  }

  init(): void {
    this.enemies = [];
    this.attackers = new Set();
    this.projectiles = [];
    this.items = [];
    this.traps = [];
    this.sups = [];
    this.boss = null;
    this.pad = null;
    this.zoneIndex = 0;
    this.zoneState = 'walk';
    this.queue = [];
    this.spawnT = 0;
    this.addsT = 0;
    this.noticeT = 3;
    this.camMin = 0;
    this.hitstop = 0;
    this.specialT = -1;
    this.specialFired = false;
    this.specialObjs = [];
    this.paused = false;
    this.over = false;
    this.finishing = false;
    this.debug = DEBUG_DEFAULT;
    this.debugBoxes = [];
    this.combo = 0;
    this.comboT = 0;
    this.maxCombo = 0;
    this.elapsed = 0;
    this.damageTaken = 0;
    this.pauseObjs = [];
  }

  create(): void {
    this.names = assignStudentNames();
    this.cameras.main.setBounds(0, 0, STAGE_W, GAME_H);
    this.cameras.main.fadeIn(250, 0, 0, 0);
    drawBackground(this, STAGE_W);

    this.controls = new Controls();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.controls.destroy());
    if (FORCE_TOUCH || this.sys.game.device.input.touch) this.pad = new TouchPad(this, this.controls);

    for (const w of STAGE.weapons) {
      if (isWeaponId(w.id)) this.items.push(new WeaponItem(this, w.id, w.x, w.y));
    }
    this.player = new Player(this, 250, 430);
    this.hud = new Hud(this, this.pad !== null);
    this.debugG = this.add.graphics().setDepth(1900);

    this.goText = this.add
      .text(GAME_W - 36, 250, 'GO →', {
        fontFamily: FONT,
        fontSize: '44px',
        fontStyle: 'bold',
        color: '#f5c542',
        stroke: '#111318',
        strokeThickness: 6,
      })
      .setOrigin(1, 0.5)
      .setScrollFactor(0)
      .setDepth(1800)
      .setVisible(false);
    this.tweens.add({ targets: this.goText, alpha: 0.2, yoyo: true, repeat: -1, duration: 350 });

    const dim = this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x000000, 0.55);
    const pt = this.add
      .text(GAME_W / 2, GAME_H / 2, '일시정지\n\nEsc · P · II 버튼으로 계속', {
        fontFamily: FONT,
        fontSize: '28px',
        fontStyle: 'bold',
        color: '#ffffff',
        align: 'center',
      })
      .setOrigin(0.5);
    this.pauseObjs = [dim, pt];
    for (const o of [dim, pt]) o.setScrollFactor(0).setDepth(2500).setVisible(false);

    this.input.on('pointerup', () => {
      if (this.over) this.scene.restart();
    });

    fx.banner(this, '오후 4시 52분 · 퇴근 8분 전', `${STAGE.title} — 오른쪽으로 이동하세요`, 2400);
  }

  update(_t: number, deltaMs: number): void {
    const dt = Math.min(deltaMs, 50) / 1000;
    const c = this.controls;
    if (c.consume('debug')) this.debug = !this.debug;
    if (c.consume('help')) this.hud.toggleHelp();

    if (this.over) {
      if (c.consume('restart')) {
        this.scene.restart();
        return;
      }
      if (c.consume('title')) {
        this.scene.start('title');
        return;
      }
    } else if (!this.finishing) {
      if (c.consume('pause')) this.setPaused(!this.paused);
      if (!this.paused) this.step(dt);
    }

    this.updateCamera(dt);
    this.hud.update(this.player, {
      stageTitle: STAGE.title,
      zone: this.zoneIndex,
      zones: ZONES.length,
      combo: this.combo,
      debug: this.debug,
      fps: this.game.loop.actualFps,
      clockMin: this.clockMin,
      boss: this.bossInfo(),
    });
    this.pad?.draw(this.player.sp >= 100, this.player.weapon !== null);
    this.drawDebug(dt);
  }

  private get clockMin(): number {
    return START_CLOCK + this.elapsed / 60;
  }

  private bossInfo(): BossInfo | null {
    const b = this.boss;
    if (!b || b.removed) return null;
    return {
      name: b.name,
      type: TYPE_LABEL.noticeBoss,
      hp: b.hp,
      maxHp: b.maxHp,
      notices: b.notices,
      need: b.needNotices,
    };
  }

  private step(dt: number): void {
    this.elapsed += dt;
    if (this.specialT >= 0) {
      this.updateSpecial(dt);
      return;
    }
    if (this.hitstop > 0) {
      this.hitstop -= dt;
      return;
    }
    this.player.update(dt, this.controls);
    for (const e of this.enemies) e.update(dt, this.player);
    this.enemies = this.enemies.filter((e) => !e.removed);
    this.updateProjectiles(dt);
    for (const it of this.items) it.update(dt);
    this.items = this.items.filter((i) => !i.removed);
    for (const t of this.traps) t.update(dt, this.player);
    this.traps = this.traps.filter((t) => !t.removed);
    for (const s of this.sups) s.update(dt, this.player);
    this.sups = this.sups.filter((s) => !s.removed);
    this.updateZones(dt);
    if (this.comboT > 0) {
      this.comboT -= dt;
      if (this.comboT <= 0) this.combo = 0;
    }
  }

  private setPaused(v: boolean): void {
    this.paused = v;
    for (const o of this.pauseObjs) (o as Phaser.GameObjects.Text).setVisible(v);
    if (v) this.tweens.pauseAll();
    else this.tweens.resumeAll();
  }

  // ---------- 구역 진행 ----------

  private updateZones(dt: number): void {
    const z = ZONES[this.zoneIndex];
    if (this.zoneState === 'walk') {
      this.goText.setVisible(this.zoneIndex > 0 && this.cameras.main.scrollX < z.left - 20);
      if (this.player.x >= z.left + TRIGGER_X) this.startFight();
      return;
    }
    if (this.zoneState !== 'fight') return;

    this.spawnT -= dt;
    const alive = this.enemies.filter((e) => !e.dead).length;
    if (this.queue.length > 0 && this.spawnT <= 0 && alive < z.maxAlive) {
      this.spawnType(this.queue.shift() as string);
      this.spawnT = 0.8;
    }
    // 보스전 지원 잡몹
    if (z.adds && this.boss && !this.boss.dead) {
      this.addsT -= dt;
      const adds = this.enemies.filter((e) => e.kind === z.adds?.type && !e.dead).length;
      if (this.addsT <= 0 && adds < z.adds.max) {
        this.spawnType(z.adds.type);
        this.addsT = z.adds.every;
      }
    }
    if (this.boss && !this.boss.dead) this.supplyNotices(dt);
    if (this.queue.length === 0 && this.enemies.length === 0) this.clearZone();
  }

  /** 보스전: 안내문 롤이 어디에도 없으면 잠시 뒤 새로 놓는다 */
  private supplyNotices(dt: number): void {
    const b = this.boss;
    if (!b || b.notices >= b.needNotices) return;
    // 지나온 구역에 두고 온 안내문은 다시 갈 수 없으므로 세지 않는다
    const left = ZONES[this.zoneIndex].left;
    const exists =
      this.items.some((i) => i.id === 'notice' && i.x >= left) ||
      this.player.weapon?.id === 'notice' ||
      this.projectiles.some((p) => p.tag === 'notice');
    if (exists) {
      this.noticeT = 3;
      return;
    }
    this.noticeT -= dt;
    if (this.noticeT <= 0) {
      this.noticeT = 3;
      const x = left + Phaser.Math.Between(180, 780);
      const y = Phaser.Math.Between(FLOOR_TOP + 20, FLOOR_BOTTOM - 20);
      this.items.push(new WeaponItem(this, 'notice', x, y));
      fx.floatText(this, x, y - 60, '안내문 도착!', '#9fd3ff', 18);
    }
  }

  private startFight(): void {
    const z = ZONES[this.zoneIndex];
    this.zoneState = 'fight';
    this.queue = [...z.waves];
    this.spawnT = 0.4;
    this.addsT = z.adds?.every ?? 0;
    this.goText.setVisible(false);
    if (!z.waves.includes('noticeBoss')) fx.banner(this, z.label, '민원 접수 중', 1200);
    for (const k of z.supervisors) {
      this.sups.push(new Supervisor(this, k as SupervisorKind, k === 'bogo' ? 3.5 : 1.0));
    }
  }

  private spawnType(type: string): void {
    const left = ZONES[this.zoneIndex].left;
    const p = this.player;
    if (type === 'phone') {
      const x = Phaser.Math.Clamp(p.x + Phaser.Math.Between(-170, 170), left + 70, left + GAME_W - 70);
      const y = Phaser.Math.Clamp(p.y + Phaser.Math.Between(-50, 50), FLOOR_TOP + 8, FLOOR_BOTTOM - 8);
      this.enemies.push(new PhoneEnemy(this, x, y));
      return;
    }
    let side = Math.random() < 0.5 ? -1 : 1;
    if (type === 'noticeBoss' || (this.zoneIndex === 0 && this.enemies.length === 0)) side = 1;
    const x = side < 0 ? left - 50 : left + GAME_W + 50;
    const tx = side < 0 ? left + 100 : left + GAME_W - 100;
    const y = Phaser.Math.Between(FLOOR_TOP + 10, FLOOR_BOTTOM - 10);
    switch (type) {
      case 'mail':
        this.enemies.push(new MailEnemy(this, x, y, tx));
        break;
      case 'bubble':
        this.enemies.push(new BubbleEnemy(this, x, y, tx));
        break;
      case 'wrongNumber':
      case 'lateDoc': {
        const name = this.names[type];
        this.enemies.push(new StudentEnemy(this, type, x, y, tx, name));
        fx.banner(this, `${name} 학생 방문`, TYPE_LABEL[type], 1500);
        break;
      }
      case 'noticeBoss': {
        const name = this.names.noticeBoss;
        const by = Phaser.Math.Clamp(p.y, FLOOR_TOP + 20, FLOOR_BOTTOM - 20);
        this.boss = new NoticeBoss(this, x, by, tx - 80, name);
        this.enemies.push(this.boss);
        this.noticeT = 1.5; // 첫 안내문 롤은 곧바로 놓는다
        fx.banner(this, `보스 · ${name}`, `${TYPE_LABEL.noticeBoss} — 안내문을 3번 붙이세요`, 2800);
        break;
      }
    }
  }

  private clearZone(): void {
    for (const s of this.sups) s.leave();
    for (const t of this.traps) t.destroy();
    this.traps = [];
    if (this.zoneIndex >= ZONES.length - 1) {
      this.finishStage();
      return;
    }
    this.zoneIndex++;
    this.zoneState = 'walk';
    fx.floatText(this, this.player.x, this.player.y - 130, '구역 정리 완료!', '#7CFC9A', 22);
  }

  private finishStage(): void {
    this.zoneState = 'done';
    this.finishing = true;
    const stats: StageStats = {
      stageTitle: STAGE.title,
      elapsed: this.elapsed,
      damage: this.damageTaken,
      maxCombo: this.maxCombo,
      lives: this.player.lives,
      clockMin: this.clockMin,
    };
    this.time.delayedCall(1400, () => {
      this.cameras.main.fadeOut(300, 0, 0, 0);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('result', stats));
    });
  }

  private gameOver(): void {
    this.over = true;
    this.goText.setVisible(false);
    const objs = [
      this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x000000, 0.6),
      this.add
        .text(GAME_W / 2, GAME_H / 2 - 50, '야근 확정…', {
          fontFamily: FONT,
          fontSize: '52px',
          fontStyle: 'bold',
          color: '#ff6b6b',
          stroke: '#111318',
          strokeThickness: 8,
        })
        .setOrigin(0.5),
      this.add
        .text(GAME_W / 2, GAME_H / 2 + 14, '민원에 밀려 퇴근하지 못했습니다', {
          fontFamily: FONT,
          fontSize: '18px',
          color: '#ffffff',
        })
        .setOrigin(0.5),
      this.add
        .text(
          GAME_W / 2,
          GAME_H / 2 + 70,
          this.pad ? '화면을 탭해서 다시 하기' : 'Enter·R 다시 하기   ·   T 타이틀로',
          { fontFamily: FONT, fontSize: '20px', fontStyle: 'bold', color: '#f5c542' },
        )
        .setOrigin(0.5),
    ];
    for (const o of objs) o.setScrollFactor(0).setDepth(2600);
  }

  /** 화면 위쪽 안내 */
  hint(title: string, sub?: string): void {
    fx.banner(this, title, sub, 2600);
  }

  // ---------- 카메라 ----------

  private updateCamera(dt: number): void {
    const cam = this.cameras.main;
    const z = ZONES[this.zoneIndex];
    let target = cam.scrollX;
    if (this.zoneState === 'fight') target = z.left;
    else if (this.zoneState === 'walk') target = Phaser.Math.Clamp(this.player.x - 380, this.camMin, z.left);
    const next = cam.scrollX + (target - cam.scrollX) * Math.min(1, dt * 6);
    cam.scrollX = Math.max(this.camMin, next);
    this.camMin = cam.scrollX;
  }

  // ---------- 전투 ----------

  /** 플레이어 공격 판정. 깊이(y) 차이가 DEPTH_RANGE 안이고 앞쪽 사거리 안이면 맞는다. */
  resolvePlayerAttack(p: Player, def: AttackDef, hitSet: Set<Fighter>): number {
    let hits = 0;
    for (const e of this.enemies) {
      if (hitSet.has(e) || !e.hittable) continue;
      if (Math.abs(e.y - p.y) > DEPTH_RANGE) continue;
      const dx = (e.x - p.x) * p.facing;
      if (dx < -8 || dx > def.reach + e.halfW * 0.5) continue;
      if (Math.abs(p.z - e.z) > def.zReach) continue;
      if (e.takeHit({ dmg: def.dmg, dir: p.facing, kb: def.kb, knockdown: def.knockdown, tag: def.tag })) {
        hitSet.add(e);
        hits++;
        fx.stampMark(this, e.x - p.facing * 4, e.y - e.z - Math.min(e.height, 70) * 0.6);
      }
    }
    if (this.debug) this.debugBoxes.push({ x: p.x, y: p.y, facing: p.facing, reach: def.reach, ttl: 0.12 });
    if (hits > 0) this.addCombo(hits, def.knockdown);
    return hits;
  }

  private addCombo(hits: number, heavy: boolean): void {
    this.hitstop = heavy ? 0.09 : 0.05;
    this.player.sp = Math.min(100, this.player.sp + 7 * hits);
    this.combo += hits;
    this.comboT = 1.2;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    if (heavy) this.cameras.main.shake(90, 0.005);
  }

  private updateProjectiles(dt: number): void {
    const left = this.cameras.main.scrollX;
    const p = this.player;
    for (const pr of this.projectiles) {
      pr.update(dt);
      if (pr.removed) continue;
      if (pr.x < left - 80 || pr.x > left + GAME_W + 80) {
        pr.destroy();
        continue;
      }
      if (pr.owner === 'enemy') {
        const near = Math.abs(pr.y - p.y) <= DEPTH_RANGE && Math.abs(pr.x - p.x) <= pr.halfW + p.halfW;
        if (near && pr.z >= p.z - 10 && pr.z <= p.z + 80) {
          if (p.takeHit({ dmg: pr.dmg, dir: Math.sign(pr.vx) || 1, kb: 120, knockdown: pr.knockdown })) {
            fx.hitSpark(this, p.x, p.y - p.z - 60);
            pr.destroy();
          }
        }
        continue;
      }
      for (const e of this.enemies) {
        if (!e.hittable) continue;
        if (Math.abs(pr.y - e.y) > DEPTH_RANGE || Math.abs(pr.x - e.x) > pr.halfW + e.halfW) continue;
        if (pr.z < e.z - 10 || pr.z > e.z + e.height + 10) continue;
        const hit = e.takeHit({
          dmg: pr.dmg,
          dir: Math.sign(pr.vx) || 1,
          kb: 0,
          knockdown: pr.knockdown,
          tag: pr.tag,
        });
        if (hit) {
          fx.stampMark(this, e.x, e.y - e.z - Math.min(e.height, 70) * 0.6, pr.tag === 'notice' ? '부착' : '처리');
          this.addCombo(1, true);
          pr.destroy();
          break;
        }
      }
    }
    this.projectiles = this.projectiles.filter((x) => !x.removed);
  }

  /** 무기 줍기: 발밑 근처의 무기를 집는다 */
  tryPickup(p: Player): boolean {
    const it = this.items.find((i) => Math.abs(i.x - p.x) < 44 && Math.abs(i.y - p.y) < 24);
    if (!it) return false;
    p.equip(it.id);
    it.destroy();
    fx.floatText(this, p.x, p.y - 124, `${WEAPONS[it.id].name} 장착!`, '#9fd3ff', 18);
    return true;
  }

  throwWeapon(p: Player): void {
    const w = p.takeWeaponForThrow();
    if (!w) return;
    this.projectiles.push(
      new Projectile(this, {
        x: p.x + p.facing * 26,
        y: p.y,
        z: 52,
        vx: p.facing * 640,
        owner: 'player',
        dmg: w.def.throwDmg,
        knockdown: true,
        tag: w.id === 'notice' ? 'notice' : undefined,
        halfW: 24,
        ttl: 1.3,
        obj: createWeaponIcon(this, w.id),
        spin: 16 * p.facing,
      }),
    );
  }

  /** 공지를 안 읽는 학생의 "?" 질문 */
  fireQuestion(b: NoticeBoss): void {
    this.projectiles.push(
      new Projectile(this, {
        x: b.x + b.facing * 34,
        y: b.y,
        z: 44,
        vx: b.facing * 330,
        owner: 'enemy',
        dmg: 1,
        knockdown: false,
        halfW: 16,
        ttl: 3.2,
        obj: createQuestionBubble(this),
      }),
    );
  }

  addReportTrap(fromX: number, laneY: number, toX: number, toY: number): void {
    const left = this.cameras.main.scrollX;
    const tx = Phaser.Math.Clamp(toX, left + 60, left + GAME_W - 60);
    const ty = Phaser.Math.Clamp(toY, FLOOR_TOP + 10, FLOOR_BOTTOM - 10);
    this.traps.push(new ReportTrap(this, fromX, laneY, tx, ty));
  }

  canTakeToken(): boolean {
    return this.attackers.size < MAX_ATTACKERS;
  }

  /** 동시에 공격하는 적을 MAX_ATTACKERS명으로 제한한다 */
  takeToken(e: Enemy): boolean {
    if (this.attackers.has(e)) return true;
    if (this.attackers.size >= MAX_ATTACKERS) return false;
    this.attackers.add(e);
    e.hasToken = true;
    return true;
  }

  releaseToken(e: Enemy): void {
    this.attackers.delete(e);
    e.hasToken = false;
  }

  onEnemyDefeated(e: Enemy): void {
    if (e.kind === 'noticeBoss') {
      fx.banner(this, '민원 처리 완료!', `${this.names.noticeBoss} 학생이 드디어 공지를 읽었습니다`, 2200);
      for (const o of this.enemies) {
        if (o !== e && !o.dead) o.takeHit({ dmg: 99, dir: o.x >= this.player.x ? 1 : -1, kb: 0, knockdown: true, force: true });
      }
      for (const s of this.sups) s.leave();
      return;
    }
    for (const s of this.sups) if (s.tryRecheck(e)) break;
  }

  onPlayerHit(dmg: number): void {
    this.damageTaken += dmg;
    this.combo = 0;
    this.comboT = 0;
    this.hitstop = 0.06;
    this.cameras.main.shake(100, 0.006);
  }

  onPlayerKO(): void {
    const p = this.player;
    if (p.lives > 1) {
      p.lives--;
      p.revive();
      fx.floatText(this, p.x, p.y - 130, '다시 출근!', '#ffe066', 24);
    } else {
      p.lives = 0;
      p.state = 'ko';
      this.gameOver();
    }
  }

  // ---------- 필살기: 전체 공지 발송 ----------

  startSpecial(): void {
    this.player.enterSpecial();
    this.specialT = 0;
    this.specialFired = false;
    const dim = this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x000000, 0.55);
    const t = this.add
      .text(GAME_W / 2, GAME_H / 2 - 30, '전체 공지 발송!', {
        fontFamily: FONT,
        fontSize: '64px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#1d4ed8',
        strokeThickness: 10,
      })
      .setOrigin(0.5)
      .setScale(0.3);
    const sub = this.add
      .text(GAME_W / 2, GAME_H / 2 + 36, '수신: 화면 안 모든 민원 · 회신 불필요', {
        fontFamily: FONT,
        fontSize: '18px',
        color: '#f5c542',
      })
      .setOrigin(0.5);
    this.specialObjs = [dim, t, sub];
    for (const o of this.specialObjs) (o as Phaser.GameObjects.Text).setScrollFactor(0).setDepth(2400);
    this.tweens.add({ targets: t, scale: 1, duration: 220, ease: 'Back.Out' });
  }

  private updateSpecial(dt: number): void {
    this.specialT += dt;
    this.player.pose(dt);
    if (!this.specialFired && this.specialT >= 0.6) {
      this.specialFired = true;
      this.cameras.main.flash(160, 255, 255, 255);
      this.cameras.main.shake(220, 0.01);
      const left = this.cameras.main.scrollX;
      for (const e of this.enemies) {
        if (e.dead || e.x < left - 10 || e.x > left + GAME_W + 10) continue;
        if (e.state === 'drop' || e.state === 'hidden' || e.state === 'away') continue;
        const dir = e.x >= this.player.x ? 1 : -1;
        if (e.takeHit({ dmg: 3, dir, kb: 0, knockdown: true, force: true })) {
          fx.stampMark(this, e.x, e.y - e.z - Math.min(e.height, 70) * 0.6, '공지');
        }
      }
    }
    if (this.specialT >= 0.95) {
      for (const o of this.specialObjs) o.destroy();
      this.specialObjs = [];
      this.specialT = -1;
      this.player.endSpecial();
    }
  }

  // ---------- 디버그 ----------

  private drawDebug(dt: number): void {
    const g = this.debugG;
    g.clear();
    if (!this.debug) return;
    for (const f of [this.player as Fighter, ...this.enemies]) {
      g.lineStyle(1, 0x00ffff, 0.9);
      g.strokeRect(f.x - f.halfW, f.y - DEPTH_RANGE, f.halfW * 2, DEPTH_RANGE * 2);
      g.lineStyle(1, 0xffff00, 0.9);
      g.strokeRect(f.x - f.halfW, f.y - f.z - f.height, f.halfW * 2, f.height);
    }
    g.lineStyle(2, 0xff3344, 1);
    for (const b of this.debugBoxes) {
      const x0 = b.facing > 0 ? b.x - 8 : b.x - b.reach;
      g.strokeRect(x0, b.y - DEPTH_RANGE, b.reach + 8, DEPTH_RANGE * 2);
      b.ttl -= dt;
    }
    this.debugBoxes = this.debugBoxes.filter((b) => b.ttl > 0);
  }
}
