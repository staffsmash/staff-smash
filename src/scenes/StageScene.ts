import Phaser from 'phaser';
import { DEBUG_DEFAULT, DEPTH_RANGE, FLOOR_BOTTOM, FLOOR_TOP, FONT, FORCE_TOUCH, GAME_H, GAME_W } from '../config';
import { Controls } from '../input/Controls';
import { TouchPad } from '../ui/TouchPad';
import { Hud } from '../ui/Hud';
import { Player, type AttackDef } from '../entities/Player';
import { MailEnemy } from '../entities/MailEnemy';
import type { Fighter } from '../entities/Fighter';
import { drawBackground } from './background';
import * as fx from '../fx';

// M0 스테이지: 구역 3개를 차례로 잠그고 웨이브를 정리한다.

const ZONES = [
  { left: 0, count: 2, label: '구역 1 · 민원 창구' },
  { left: 960, count: 3, label: '구역 2 · 본관 복도' },
  { left: 1920, count: 4, label: '구역 3 · 본관 현관' },
];
const STAGE_W = ZONES[ZONES.length - 1].left + GAME_W;
const MAX_ALIVE = 3;
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
  enemies: MailEnemy[] = [];
  private pad: TouchPad | null = null;
  private hud!: Hud;
  private attackers = new Set<MailEnemy>();
  private zoneIndex = 0;
  private zoneState: 'walk' | 'fight' | 'done' = 'walk';
  private toSpawn = 0;
  private spawnT = 0;
  private camMin = 0;
  private hitstop = 0;
  private specialT = -1;
  private specialFired = false;
  private specialObjs: Phaser.GameObjects.GameObject[] = [];
  private paused = false;
  private over = false;
  private debug = false;
  private debugG!: Phaser.GameObjects.Graphics;
  private debugBoxes: DebugBox[] = [];
  private combo = 0;
  private comboT = 0;
  private maxCombo = 0;
  private elapsed = 0;
  private goText!: Phaser.GameObjects.Text;
  private pauseObjs: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super('stage');
  }

  init(): void {
    this.enemies = [];
    this.attackers = new Set();
    this.pad = null;
    this.zoneIndex = 0;
    this.zoneState = 'walk';
    this.toSpawn = 0;
    this.spawnT = 0;
    this.camMin = 0;
    this.hitstop = 0;
    this.specialT = -1;
    this.specialFired = false;
    this.specialObjs = [];
    this.paused = false;
    this.over = false;
    this.debug = DEBUG_DEFAULT;
    this.debugBoxes = [];
    this.combo = 0;
    this.comboT = 0;
    this.maxCombo = 0;
    this.elapsed = 0;
    this.pauseObjs = [];
  }

  create(): void {
    this.cameras.main.setBounds(0, 0, STAGE_W, GAME_H);
    this.cameras.main.fadeIn(250, 0, 0, 0);
    drawBackground(this, STAGE_W);

    this.controls = new Controls();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.controls.destroy());
    if (FORCE_TOUCH || this.sys.game.device.input.touch) this.pad = new TouchPad(this, this.controls);

    this.player = new Player(this, 250, 430);
    this.hud = new Hud(this);
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

    fx.banner(this, '오후 5시 52분. 퇴근 8분 전', '오른쪽 민원 창구로 이동하세요', 2200);
  }

  update(_t: number, deltaMs: number): void {
    const dt = Math.min(deltaMs, 50) / 1000;
    const c = this.controls;
    if (c.consume('debug')) this.debug = !this.debug;

    if (this.over) {
      if (c.consume('restart')) {
        this.scene.restart();
        return;
      }
    } else {
      if (c.consume('pause')) this.setPaused(!this.paused);
      if (!this.paused) this.step(dt);
    }

    this.updateCamera(dt);
    this.hud.update(this.player, {
      zone: this.zoneIndex,
      zones: ZONES.length,
      combo: this.combo,
      debug: this.debug,
      fps: this.game.loop.actualFps,
      touch: this.pad !== null,
    });
    this.pad?.draw(this.player.sp >= 100);
    this.drawDebug(dt);
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
    } else if (this.zoneState === 'fight') {
      this.spawnT -= dt;
      const alive = this.enemies.filter((e) => !e.dead).length;
      if (this.toSpawn > 0 && this.spawnT <= 0 && alive < MAX_ALIVE) {
        this.spawnEnemy();
        this.toSpawn--;
        this.spawnT = 0.8;
      }
      if (this.toSpawn === 0 && this.enemies.length === 0) this.clearZone();
    }
  }

  private startFight(): void {
    const z = ZONES[this.zoneIndex];
    this.zoneState = 'fight';
    this.toSpawn = z.count;
    this.spawnT = 0.4;
    this.goText.setVisible(false);
    fx.banner(this, z.label, '민원 접수 중', 1200);
  }

  private spawnEnemy(): void {
    const left = ZONES[this.zoneIndex].left;
    let side = Math.random() < 0.5 ? -1 : 1;
    if (this.zoneIndex === 0 && this.enemies.length === 0) side = 1;
    const x = side < 0 ? left - 50 : left + GAME_W + 50;
    const targetX = side < 0 ? left + 90 : left + GAME_W - 90;
    const y = Phaser.Math.Between(FLOOR_TOP + 10, FLOOR_BOTTOM - 10);
    this.enemies.push(new MailEnemy(this, x, y, targetX));
  }

  private clearZone(): void {
    if (this.zoneIndex >= ZONES.length - 1) {
      this.finish();
      return;
    }
    this.zoneIndex++;
    this.zoneState = 'walk';
    fx.floatText(this, this.player.x, this.player.y - 130, '구역 정리 완료!', '#7CFC9A', 22);
  }

  private finish(): void {
    this.zoneState = 'done';
    const m = Math.floor(this.elapsed / 60);
    const s = Math.floor(this.elapsed % 60);
    this.showOverlay(
      'M0 클리어 · 정시 퇴근!',
      `걸린 시간 ${m}분 ${s.toString().padStart(2, '0')}초 · 최대 연속 처리 ${this.maxCombo} · 남은 목숨 ${this.player.lives}`,
      '#7CFC9A',
    );
  }

  private gameOver(): void {
    this.showOverlay('야근 확정…', '민원에 밀려 퇴근하지 못했습니다', '#ff6b6b');
  }

  private showOverlay(title: string, sub: string, color: string): void {
    this.over = true;
    this.goText.setVisible(false);
    const objs = [
      this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x000000, 0.6),
      this.add
        .text(GAME_W / 2, GAME_H / 2 - 50, title, {
          fontFamily: FONT,
          fontSize: '52px',
          fontStyle: 'bold',
          color,
          stroke: '#111318',
          strokeThickness: 8,
        })
        .setOrigin(0.5),
      this.add
        .text(GAME_W / 2, GAME_H / 2 + 14, sub, { fontFamily: FONT, fontSize: '18px', color: '#ffffff' })
        .setOrigin(0.5),
      this.add
        .text(GAME_W / 2, GAME_H / 2 + 70, this.pad ? '화면을 탭해서 다시 하기' : 'Enter 또는 R로 다시 하기', {
          fontFamily: FONT,
          fontSize: '20px',
          fontStyle: 'bold',
          color: '#f5c542',
        })
        .setOrigin(0.5),
    ];
    for (const o of objs) o.setScrollFactor(0).setDepth(2600);
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
      if (e.takeHit({ dmg: def.dmg, dir: p.facing, kb: def.kb, knockdown: def.knockdown })) {
        hitSet.add(e);
        hits++;
        fx.stampMark(this, e.x - p.facing * 4, e.y - e.z - 36);
      }
    }
    if (this.debug) this.debugBoxes.push({ x: p.x, y: p.y, facing: p.facing, reach: def.reach, ttl: 0.12 });
    if (hits > 0) {
      this.hitstop = def.knockdown ? 0.09 : 0.05;
      p.sp = Math.min(100, p.sp + 7 * hits);
      this.combo += hits;
      this.comboT = 1.2;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      if (def.knockdown) this.cameras.main.shake(90, 0.005);
    }
    return hits;
  }

  canTakeToken(): boolean {
    return this.attackers.size < MAX_ATTACKERS;
  }

  /** 동시에 공격하는 적을 MAX_ATTACKERS명으로 제한한다 */
  takeToken(e: MailEnemy): boolean {
    if (this.attackers.has(e)) return true;
    if (this.attackers.size >= MAX_ATTACKERS) return false;
    this.attackers.add(e);
    e.hasToken = true;
    return true;
  }

  releaseToken(e: MailEnemy): void {
    this.attackers.delete(e);
    e.hasToken = false;
  }

  onPlayerHit(): void {
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
        const dir = e.x >= this.player.x ? 1 : -1;
        if (e.takeHit({ dmg: 3, dir, kb: 0, knockdown: true, force: true })) {
          fx.stampMark(this, e.x, e.y - e.z - 36, '공지');
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
