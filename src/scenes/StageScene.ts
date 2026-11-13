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
} from '../config';
import { Controls } from '../input/Controls';
import { TouchPad } from '../ui/TouchPad';
import { Hud } from '../ui/Hud';
import { Player } from '../entities/Player';
import type { AttackDef, Fighter } from '../entities/Fighter';
import type { BossLike, Enemy } from '../entities/Enemy';
import { MailEnemy } from '../entities/MailEnemy';
import { PhoneEnemy } from '../entities/PhoneEnemy';
import { BubbleEnemy } from '../entities/BubbleEnemy';
import { DocBomb } from '../entities/DocBomb';
import { QueueSlip } from '../entities/QueueSlip';
import { StudentEnemy, type StudentKind } from '../entities/StudentEnemy';
import { MinwonLeader } from '../entities/MinwonLeader';
import { NoticeBoss } from '../entities/NoticeBoss';
import { DeadlineBoss } from '../entities/DeadlineBoss';
import { ChonghakGroup, ChonghakMember } from '../entities/Chonghak';
import { Projectile } from '../entities/Projectile';
import { Hazard } from '../entities/Hazard';
import { Pickup, type PickupKind } from '../entities/Pickup';
import { ReportTrap } from '../entities/ReportTrap';
import { Supervisor, type SupervisorKind } from '../entities/Supervisor';
import { WEAPONS, isWeaponId, type WeaponId } from '../entities/weapons';
import {
  createDemandPaper,
  createFallingDoc,
  createQuestionBubble,
  createSonicWave,
  createWeaponIcon,
} from '../entities/rigs';
import { TYPE_LABEL } from '../data/names';
import { STAGES, type StageDef, type ZoneDef } from '../data/stages';
import { heroById } from '../data/heroes';
import { skillById } from '../data/skills';
import { gradeStage, type StageStats } from '../grade';
import { newRun, runClock, type RunState } from '../run';
import { drawBackground } from './background';
import * as fx from '../fx';

// 교직원 모드 스테이지. 구역을 차례로 잠그고 웨이브(src/data/stageN.json)를 정리한다.

const MAX_ATTACKERS = 2;
const TRIGGER_X = 330;
const STUDENT_KINDS: StudentKind[] = ['wrongNumber', 'lateDoc', 'tantrum', 'graduation', 'presidentMail'];

export interface StageData {
  run?: RunState;
  stage?: number;
}

interface DebugBox {
  x: number;
  y: number;
  facing: number;
  reach: number;
  ttl: number;
}

interface MeetingCircle {
  x: number;
  y: number;
  t: number;
  obj: Phaser.GameObjects.Container;
}

export class StageScene extends Phaser.Scene {
  controls!: Controls;
  player!: Player;
  enemies: Enemy[] = [];
  run!: RunState;
  private stageIndex = 0;
  private stage!: StageDef;
  private zones: ZoneDef[] = [];
  private pad: TouchPad | null = null;
  private hud!: Hud;
  private attackers = new Set<Enemy>();
  private projectiles: Projectile[] = [];
  private hazards: Hazard[] = [];
  private pickups: Pickup[] = [];
  private traps: ReportTrap[] = [];
  private sups: Supervisor[] = [];
  private meetings: MeetingCircle[] = [];
  private boss: BossLike | null = null;
  private bossDefeated = false;
  private noticeBoss: NoticeBoss | null = null;
  private zoneIndex = 0;
  private zoneState: 'walk' | 'fight' | 'done' = 'walk';
  private queue: string[] = [];
  private spawnT = 0;
  private addsT = 0;
  private supplyT = 3;
  private approval: 'none' | 'waiting' | 'called' | 'done' = 'none';
  private approvalT = 0;
  private approvalAddT = 0;
  private bumpCd = 0;
  private camMin = 0;
  private hitstop = 0;
  private specialT = -1;
  private specialFired = false;
  private specialObjs: Phaser.GameObjects.GameObject[] = [];
  private paused = false;
  private over = false;
  private overAt = 0;
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

  init(data: StageData): void {
    this.run = data.run ?? newRun('staff', 'kimgukje', 'notice');
    this.stageIndex = Phaser.Math.Clamp(data.stage ?? 0, 0, STAGES.length - 1);
    this.stage = STAGES[this.stageIndex];
    this.zones = this.stage.zones;
    this.run.reached = Math.max(this.run.reached, this.stageIndex + 1);
    this.enemies = [];
    this.attackers = new Set();
    this.projectiles = [];
    this.hazards = [];
    this.pickups = [];
    this.traps = [];
    this.sups = [];
    this.meetings = [];
    this.boss = null;
    this.bossDefeated = false;
    this.noticeBoss = null;
    this.pad = null;
    this.zoneIndex = 0;
    this.zoneState = 'walk';
    this.queue = [];
    this.spawnT = 0;
    this.addsT = 0;
    this.supplyT = 3;
    this.approval = 'none';
    this.approvalT = 0;
    this.approvalAddT = 0;
    this.bumpCd = 0;
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

  private get stageW(): number {
    return this.zones[this.zones.length - 1].left + GAME_W;
  }

  /** 지금 서 있는 구역 이름 (HUD·게임오버 문구) */
  private get zoneLabel(): string {
    return this.zones[Math.min(this.zoneIndex, this.zones.length - 1)].label;
  }

  create(): void {
    this.cameras.main.setBounds(0, 0, this.stageW, GAME_H);
    this.cameras.main.fadeIn(250, 0, 0, 0);
    drawBackground(this, this.stage.background);

    this.controls = new Controls();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.controls.destroy());
    if (FORCE_TOUCH || this.sys.game.device.input.touch) this.pad = new TouchPad(this, this.controls);

    for (const w of this.stage.weapons) {
      if (isWeaponId(w.id)) this.pickups.push(new Pickup(this, w.id, w.x, w.y));
    }
    for (const f of this.stage.foods) this.pickups.push(new Pickup(this, f.id as PickupKind, f.x, f.y));

    const hero = heroById(this.run.hero);
    this.player = new Player(this, 250, 430, hero);
    this.player.lives = this.run.lives;
    this.hud = new Hud(this, this.pad !== null, hero.name);
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
      if (this.over && this.time.now - this.overAt > 1000) this.toRecord();
    });

    const intro = this.stageIndex === 0 ? '오후 4시 52분 · 퇴근 8분 전' : this.stage.title;
    fx.banner(this, intro, `${hero.name}: "${hero.line}" — 오른쪽으로 이동하세요`, 2400);
  }

  update(_t: number, deltaMs: number): void {
    const dt = Math.min(deltaMs, 50) / 1000;
    const c = this.controls;
    if (c.consume('debug')) this.debug = !this.debug;
    if (c.consume('help')) this.hud.toggleHelp();

    if (this.over) {
      // 연타하던 버튼에 바로 넘어가지 않게 1초 기다린다
      if (this.time.now - this.overAt < 1000) {
        c.consume('confirm');
        c.consume('restart');
      } else if (c.consume('confirm')) {
        this.toRecord();
        return;
      }
      if (c.consume('restart')) {
        this.scene.start('select');
        return;
      }
    } else if (!this.finishing) {
      if (c.consume('pause')) this.setPaused(!this.paused);
      if (!this.paused) this.step(dt);
    }

    this.updateCamera(dt);
    const b = this.boss && !this.boss.bossGone ? this.boss : null;
    this.hud.update(this.player, {
      stageTitle: this.stage.title,
      zoneLabel: this.zoneLabel,
      zone: this.zoneIndex,
      zones: this.zones.length,
      combo: this.combo,
      debug: this.debug,
      fps: this.game.loop.actualFps,
      clockMin: runClock(this.run, this.elapsed),
      notice: this.noticeLine(),
      boss: b
        ? { name: b.bossName, type: b.bossType, hp: b.bossHp, maxHp: b.bossMaxHp, extra: b.bossExtra() }
        : null,
    });
    this.pad?.draw(this.player.sp >= 100, this.player.weapon !== null && !this.player.weapon.inFlight);
    this.drawDebug(dt);
  }

  private noticeLine(): string {
    if (this.approval === 'waiting') return `결재 대기 중 · 김부재중 처장 부재중 (${Math.ceil(this.approvalT)}초)`;
    if (this.approval === 'called') return '김부재중 처장이 오는 중…';
    if (this.player.clingBy) return '매달렸다! J(처리) 연타로 떼어 내기';
    if (this.player.state === 'meeting') return '회의 중… 회의록 작성 중';
    return '';
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
    if (this.bumpCd > 0) this.bumpCd -= dt;
    this.player.update(dt, this.controls);
    for (const e of this.enemies) e.update(dt, this.player);
    this.enemies = this.enemies.filter((e) => !e.removed);
    this.updateProjectiles(dt);
    this.updateHazards(dt);
    this.updatePickups(dt);
    for (const t of this.traps) t.update(dt, this.player);
    this.traps = this.traps.filter((t) => !t.removed);
    for (const s of this.sups) s.update(dt, this.player);
    this.sups = this.sups.filter((s) => !s.removed);
    this.updateMeetings(dt);
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
    const z = this.zones[this.zoneIndex];
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
    if (z.adds && this.boss && !this.bossDefeated) {
      this.addsT -= dt;
      const adds = this.enemies.filter((e) => e.kind === z.adds?.type && !e.dead).length;
      if (this.addsT <= 0 && adds < z.adds.max) {
        this.spawnType(z.adds.type);
        this.addsT = z.adds.every;
      }
    }
    this.supplyItems(dt, z);

    // 김부재중 처장 결재: 웨이브를 다 정리한 뒤 버텨야 한다
    if (z.approval && this.approval === 'none' && this.queue.length === 0 && this.enemies.length === 0) {
      this.approval = 'waiting';
      this.approvalT = 9;
      this.approvalAddT = 1.2;
      fx.banner(this, '다음 구역은 결재가 필요합니다', '김부재중 처장 부재중… 돌아올 때까지 버티세요', 2200);
    }
    if (this.approval === 'waiting') {
      this.approvalT -= dt;
      this.approvalAddT -= dt;
      if (this.approvalAddT <= 0 && alive < 2) {
        this.spawnType(Math.random() < 0.6 ? 'mail' : 'phone');
        this.approvalAddT = 2.6;
      }
      if (this.approvalT <= 0) {
        this.approval = 'called';
        this.sups.push(
          new Supervisor(this, 'bujae', 0, () => {
            this.approval = 'done';
            fx.banner(this, '결재 완료!', '이제 다음 구역으로 갈 수 있습니다', 1400);
          }),
        );
      }
    }
    const approved = !z.approval || this.approval === 'done';
    if (approved && this.queue.length === 0 && this.enemies.length === 0) this.clearZone();
  }

  /** 기믹에 필요한 물건을 떨어지지 않게 공급한다 (안내문 롤, 규정집) */
  private supplyItems(dt: number, z: ZoneDef): void {
    let need: WeaponId | null = null;
    if (this.noticeBoss?.wantsNotice) need = 'notice';
    else if (this.enemies.some((e) => e.kind === 'tantrum' && !e.dead)) need = 'rulebook';
    if (!need) return;
    const exists =
      this.pickups.some((p) => p.kind === need && p.x >= z.left) ||
      this.player.weapon?.id === need ||
      this.projectiles.some((p) => p.owner === 'player' && !p.removed);
    if (exists) {
      this.supplyT = need === 'notice' ? 3 : 4;
      return;
    }
    this.supplyT -= dt;
    if (this.supplyT <= 0) {
      this.supplyT = 3;
      const x = z.left + Phaser.Math.Between(180, 780);
      const y = Phaser.Math.Between(FLOOR_TOP + 20, FLOOR_BOTTOM - 20);
      this.pickups.push(new Pickup(this, need, x, y));
      fx.floatText(this, x, y - 60, need === 'notice' ? '안내문 도착!' : '규정집 도착! 던져 보세요', '#9fd3ff', 18);
    }
  }

  private startFight(): void {
    const z = this.zones[this.zoneIndex];
    this.zoneState = 'fight';
    this.queue = [...z.waves];
    this.spawnT = 0.4;
    this.addsT = z.adds?.every ?? 0;
    this.approval = 'none';
    this.goText.setVisible(false);
    const bossZone = z.waves.some((w) => w.endsWith('Boss') || w === 'chonghak');
    if (!bossZone) fx.banner(this, z.label, '민원 접수 중', 1200);
    for (const k of z.supervisors) {
      const delay = k === 'gumto' ? 1.0 : k === 'meeting' ? 9 : k === 'hoho' ? 6 : 3.5;
      this.sups.push(new Supervisor(this, k as SupervisorKind, delay));
    }
  }

  private edgeSpawn(forceRight = false): { x: number; tx: number; y: number } {
    const left = this.zones[this.zoneIndex].left;
    let side = Math.random() < 0.5 ? -1 : 1;
    if (forceRight || (this.zoneIndex === 0 && this.enemies.length === 0)) side = 1;
    return {
      x: side < 0 ? left - 50 : left + GAME_W + 50,
      tx: side < 0 ? left + 100 : left + GAME_W - 100,
      y: Phaser.Math.Between(FLOOR_TOP + 10, FLOOR_BOTTOM - 10),
    };
  }

  private spawnType(type: string): void {
    const left = this.zones[this.zoneIndex].left;
    const p = this.player;
    if (type === 'phone') {
      const x = Phaser.Math.Clamp(p.x + Phaser.Math.Between(-170, 170), left + 70, left + GAME_W - 70);
      const y = Phaser.Math.Clamp(p.y + Phaser.Math.Between(-50, 50), FLOOR_TOP + 8, FLOOR_BOTTOM - 8);
      this.enemies.push(new PhoneEnemy(this, x, y));
      return;
    }
    const isBoss = type.endsWith('Boss') || type === 'chonghak';
    const { x, tx, y } = this.edgeSpawn(isBoss);
    const names = this.run.names;
    switch (type) {
      case 'mail':
        this.enemies.push(new MailEnemy(this, x, y, tx));
        break;
      case 'bubble':
        this.enemies.push(new BubbleEnemy(this, x, y, tx));
        break;
      case 'docbomb':
        this.enemies.push(new DocBomb(this, x, y, tx));
        break;
      case 'queue': {
        let ahead: QueueSlip | null = null;
        const dir = x < left ? -1 : 1;
        for (let i = 0; i < 5; i++) {
          const s: QueueSlip = new QueueSlip(this, x + dir * i * 38, y, tx + dir * i * 38, ahead);
          this.enemies.push(s);
          ahead = s;
        }
        fx.banner(this, '단체 문의 줄', '줄줄이 길을 막습니다 — 위아래로 돌아가거나 하나씩 처리', 1500);
        break;
      }
      case 'minwon':
        this.enemies.push(new MinwonLeader(this, x, y, tx));
        fx.banner(this, '최민원 · 단대학생회 간부', '서명지를 흔들면 민원이 몰려옵니다 — 세게 쳐서 떨어뜨리고 먼저 주우세요', 2200);
        break;
      case 'noticeBoss': {
        const by = Phaser.Math.Clamp(p.y, FLOOR_TOP + 20, FLOOR_BOTTOM - 20);
        const b = new NoticeBoss(this, x, by, tx - 80, names.noticeBoss);
        this.enemies.push(b);
        this.boss = b;
        this.noticeBoss = b;
        this.supplyT = 1.5;
        fx.banner(this, `보스 · ${names.noticeBoss}`, `${TYPE_LABEL.noticeBoss} — 안내문을 3번 붙이세요`, 2800);
        break;
      }
      case 'deadlineBoss': {
        const by = Phaser.Math.Clamp(p.y, FLOOR_TOP + 20, FLOOR_BOTTOM - 20);
        const b = new DeadlineBoss(this, x, by, tx - 80, names.deadline);
        this.enemies.push(b);
        this.boss = b;
        fx.banner(this, `보스 · ${names.deadline}`, `${TYPE_LABEL.deadline} — 마감 시계가 0이 되기 전에 처리하세요`, 2800);
        break;
      }
      case 'chonghak': {
        const g = new ChonghakGroup(this);
        const mk = (role: 'decibel' | 'protest' | 'sitin', mx: number, mtx: number, my: number) => {
          const m = new ChonghakMember(this, role, mx, my, mtx, g);
          g.members.push(m);
          this.enemies.push(m);
        };
        mk('decibel', left + GAME_W + 60, left + 820, FLOOR_TOP + 40);
        mk('protest', left + GAME_W + 120, left + 680, FLOOR_BOTTOM - 40);
        mk('sitin', left + 520, left + 520, 430);
        this.boss = g;
        fx.banner(this, '최종 보스 · 총학 집행부', '김데시벨 · 오시위 · 박드러누움 — 누운 사람은 마지막에 일어납니다', 3000);
        break;
      }
      default:
        if ((STUDENT_KINDS as string[]).includes(type)) {
          const kind = type as StudentKind;
          const name = names[kind];
          this.enemies.push(new StudentEnemy(this, kind, x, y, tx, name));
          fx.banner(this, `${name} 학생 방문`, TYPE_LABEL[kind], 1500);
        }
    }
  }

  private clearZone(): void {
    for (const s of this.sups) s.leave();
    for (const t of this.traps) t.destroy();
    this.traps = [];
    this.player.releaseCling();
    if (this.zoneIndex >= this.zones.length - 1) {
      this.finishStage();
      return;
    }
    this.zoneIndex++;
    this.zoneState = 'walk';
    this.approval = 'none';
    fx.floatText(this, this.player.x, this.player.y - 130, '구역 정리 완료!', '#7CFC9A', 22);
  }

  private stageStats(): StageStats {
    return {
      mode: this.run.mode,
      stageTitle: this.stage.title,
      elapsed: this.elapsed,
      damage: this.damageTaken,
      maxCombo: this.maxCombo,
      lives: this.player.lives,
      clockMin: runClock(this.run, this.elapsed),
    };
  }

  /** 이번 스테이지 기록을 한 판 기록에 더한다 */
  private commitStage(cleared: boolean): StageStats {
    const stats = this.stageStats();
    const r = this.run;
    r.elapsed += this.elapsed;
    r.damage += this.damageTaken;
    r.maxCombo = Math.max(r.maxCombo, this.maxCombo);
    r.lives = this.player.lives;
    if (cleared) {
      r.stages.push({
        stage: this.stageIndex + 1,
        grade: gradeStage(stats).grade,
        elapsed: this.elapsed,
        damage: this.damageTaken,
        maxCombo: this.maxCombo,
      });
    }
    return stats;
  }

  private finishStage(): void {
    this.zoneState = 'done';
    this.finishing = true;
    const stats = this.commitStage(true);
    const last = this.stageIndex >= STAGES.length - 1;
    if (last) this.run.cleared = true;
    this.time.delayedCall(1600, () => {
      this.cameras.main.fadeOut(300, 0, 0, 0);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        if (last) this.scene.start('ending', { run: this.run });
        else this.scene.start('result', { run: this.run, stage: this.stageIndex, stats });
      });
    });
  }

  private gameOver(): void {
    this.over = true;
    this.overAt = this.time.now;
    this.goText.setVisible(false);
    this.commitStage(false);
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
        .text(GAME_W / 2, GAME_H / 2 + 14, `${this.zoneLabel}에서 민원에 밀려 퇴근하지 못했습니다`, {
          fontFamily: FONT,
          fontSize: '18px',
          color: '#ffffff',
        })
        .setOrigin(0.5),
      this.add
        .text(
          GAME_W / 2,
          GAME_H / 2 + 70,
          this.pad ? '화면을 탭해서 기록 남기기' : 'Enter 기록 남기기   ·   R 처음부터 다시',
          { fontFamily: FONT, fontSize: '20px', fontStyle: 'bold', color: '#f5c542' },
        )
        .setOrigin(0.5),
    ];
    for (const o of objs) o.setScrollFactor(0).setDepth(2600);
  }

  private toRecord(): void {
    this.scene.start('record', { run: this.run });
  }

  /** 화면 위쪽 안내 */
  hint(title: string, sub?: string): void {
    fx.banner(this, title, sub, 2600);
  }

  /** 초과근무: 게임 속 시계를 앞으로 돌린다 */
  addPenalty(min: number, text: string): void {
    this.run.penaltyMin += min;
    const cam = this.cameras.main;
    fx.floatText(this, cam.scrollX + GAME_W / 2, 92, text, '#ff8a8a', 22);
  }

  // ---------- 카메라 ----------

  private updateCamera(dt: number): void {
    const cam = this.cameras.main;
    const z = this.zones[this.zoneIndex];
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
      hitSet.add(e);
      if (e.takeHit({ dmg: def.dmg, dir: p.facing, kb: def.kb, knockdown: def.knockdown, tag: def.tag })) {
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
      // 사원증: 돌아와서 손에 잡힌다
      if (pr.returnTo) {
        const caught = pr.returning && Math.abs(pr.x - p.x) < 28;
        if (caught || pr.expired) {
          p.catchCard();
          pr.destroy();
          continue;
        }
      } else if (pr.expired || pr.x < left - 80 || pr.x > left + GAME_W + 80) {
        if (pr.explodes) this.explode(pr.x, pr.y, 90, { player: 0, enemies: 3 }, '펑!');
        pr.destroy();
        continue;
      }
      if (pr.owner === 'enemy') {
        const near = Math.abs(pr.y - p.y) <= DEPTH_RANGE && Math.abs(pr.x - p.x) <= pr.halfW + p.halfW;
        if (near && pr.z >= p.z - 10 && pr.z <= p.z + 80) {
          const dir = Math.sign(pr.vx) || 1;
          const guarding =
            !!p.weapon?.def.guard && p.facing === -dir && ['idle', 'walk', 'wattack'].includes(p.state);
          const kb = pr.tag === 'sonic' ? 220 : 120;
          if (p.takeHit({ dmg: pr.dmg, dir, kb, knockdown: pr.knockdown })) {
            fx.hitSpark(this, p.x, p.y - p.z - 60);
            pr.destroy();
          } else if (guarding) {
            pr.destroy();
          }
        }
        continue;
      }
      for (const e of this.enemies) {
        if (pr.hitSet.has(e) || !e.hittable) continue;
        if (Math.abs(pr.y - e.y) > DEPTH_RANGE || Math.abs(pr.x - e.x) > pr.halfW + e.halfW) continue;
        if (pr.z < e.z - 10 || pr.z > e.z + e.height + 10) continue;
        pr.hitSet.add(e);
        const hit = e.takeHit({
          dmg: pr.dmg,
          dir: Math.sign(pr.vx) || 1,
          kb: 0,
          knockdown: pr.knockdown,
          tag: pr.tag,
          thrown: true,
        });
        if (hit) {
          fx.stampMark(this, e.x, e.y - e.z - Math.min(e.height, 70) * 0.6, pr.tag === 'notice' ? '부착' : '처리');
          this.addCombo(1, true);
        }
        if (pr.explodes) {
          this.explode(pr.x, pr.y, 90, { player: 0, enemies: 3 }, '펑!');
          pr.destroy();
          break;
        }
        if (!pr.returnTo) {
          // 막혔든 맞았든 부딪힌 물건은 떨어진다 (사원증은 꿰뚫고 지나간다)
          pr.destroy();
          break;
        }
      }
    }
    this.projectiles = this.projectiles.filter((x) => !x.removed);
  }

  private updateHazards(dt: number): void {
    const p = this.player;
    for (const h of this.hazards) {
      h.update(dt);
      if (!h.justLanded) continue;
      this.cameras.main.shake(70, 0.004);
      fx.dust(this, h.x, h.y);
      if (h.owner === 'enemy') {
        if (Math.abs(p.x - h.x) <= h.radius && Math.abs(p.y - h.y) <= h.radius * 0.4 && p.z < 30) {
          p.takeHit({ dmg: h.dmg, dir: p.x >= h.x ? 1 : -1, kb: 120, knockdown: false });
        }
      } else {
        let hits = 0;
        for (const e of this.enemies) {
          if (!e.hittable || Math.abs(e.x - h.x) > h.radius + e.halfW || Math.abs(e.y - h.y) > h.radius * 0.45) continue;
          if (e.takeHit({ dmg: h.dmg, dir: e.x >= h.x ? 1 : -1, kb: 0, knockdown: true })) {
            hits++;
            fx.stampMark(this, e.x, e.y - e.z - Math.min(e.height, 70) * 0.6, '규정');
          }
        }
        if (hits) this.addCombo(hits, true);
      }
    }
    this.hazards = this.hazards.filter((h) => !h.removed);
  }

  private updatePickups(dt: number): void {
    const p = this.player;
    for (const it of this.pickups) {
      it.update(dt);
      if (it.removed || it.isWeapon) continue;
      const touching = Math.abs(it.x - p.x) < 34 && Math.abs(it.y - p.y) < 18 && p.z < 20 && p.targetable;
      if (!touching) continue;
      switch (it.kind) {
        case 'donkatsu':
          p.heal(6);
          fx.floatText(this, p.x, p.y - 128, '학식 돈가스! 체력 +6', '#7CFC9A', 18);
          break;
        case 'gimbap':
          p.heal(3);
          fx.floatText(this, p.x, p.y - 128, '삼각김밥! 체력 +3', '#7CFC9A', 18);
          break;
        case 'americano':
          p.coffeeT = 10;
          fx.floatText(this, p.x, p.y - 128, '아메리카노! 처리 속도 UP', '#ffd27f', 18);
          break;
        case 'work':
          if (!p.startReport(1.6, '일거리였다… 검토 중')) continue;
          break;
        case 'petition':
          fx.floatText(this, p.x, p.y - 128, '단체 서명지 접수 완료!', '#7CFC9A', 18);
          break;
      }
      it.destroy();
    }
    this.pickups = this.pickups.filter((i) => !i.removed);
  }

  private updateMeetings(dt: number): void {
    const p = this.player;
    for (const m of this.meetings) {
      m.t += dt;
      m.obj.setScale(1 + Math.sin(m.t * 12) * 0.04);
      if (m.t >= 1.5) {
        const inside = Math.abs(p.x - m.x) < 84 && Math.abs(p.y - m.y) < 30;
        if (inside && p.startMeeting(3)) {
          this.addPenalty(1, '회의 소집 · 1분 경과');
          fx.banner(this, '회의 중…', '회의록을 쓰고 돌아옵니다 (3초)', 1600);
        } else {
          fx.floatText(this, m.x, m.y - 40, '회의 불참 성공!', '#7CFC9A', 16);
        }
        m.obj.destroy();
      }
    }
    this.meetings = this.meetings.filter((m) => m.t < 1.5);
  }

  /** 무기 줍기: 발밑 근처의 무기나 넘어진 서류 뭉치를 집는다 */
  tryPickup(p: Player): boolean {
    const bomb = this.enemies.find(
      (e): e is DocBomb => e instanceof DocBomb && e.pickable && Math.abs(e.x - p.x) < 54 && Math.abs(e.y - p.y) < 26,
    );
    if (bomb) {
      p.equip('bomb', bomb.fuse);
      bomb.destroy();
      fx.floatText(this, p.x, p.y - 124, '서류 뭉치를 들었다! 빨리 던지세요', '#ffe066', 16);
      return true;
    }
    const it = this.pickups.find((i) => i.isWeapon && Math.abs(i.x - p.x) < 44 && Math.abs(i.y - p.y) < 24);
    if (!it || !isWeaponId(it.kind)) return false;
    p.equip(it.kind);
    it.destroy();
    fx.floatText(this, p.x, p.y - 124, `${WEAPONS[it.kind].name} 장착!`, '#9fd3ff', 18);
    return true;
  }

  throwWeapon(p: Player): void {
    const w = p.takeWeaponForThrow();
    if (!w) return;
    const card = w.def.boomerang;
    this.projectiles.push(
      new Projectile(this, {
        x: p.x + p.facing * 26,
        y: p.y,
        z: 52,
        vx: p.facing * (card ? 560 : 640),
        owner: 'player',
        dmg: w.def.throwDmg,
        knockdown: !card,
        tag: w.id === 'notice' ? 'notice' : undefined,
        halfW: 24,
        ttl: card ? 3 : 1.3,
        obj: createWeaponIcon(this, w.id),
        spin: (card ? 22 : 16) * p.facing,
        returnTo: card ? p : undefined,
        explodes: w.id === 'bomb',
      }),
    );
  }

  /** 마감 서류 뭉치를 너무 오래 들고 있었다 */
  explodeInHand(p: Player): void {
    this.explode(p.x, p.y, 80, { player: 2, enemies: 2 }, '손에서 터졌다!');
  }

  explode(x: number, y: number, r: number, dmg: { player: number; enemies: number }, text: string): void {
    const ring = this.add.ellipse(x, y - 20, r * 2, r * 1.2, 0xff9f43, 0.7).setDepth(y + 2);
    this.tweens.add({ targets: ring, scaleX: 1.4, scaleY: 1.4, alpha: 0, duration: 300, onComplete: () => ring.destroy() });
    fx.floatText(this, x, y - 80, text, '#ffb86b', 22);
    this.cameras.main.shake(140, 0.008);
    const p = this.player;
    if (dmg.player > 0 && Math.abs(p.x - x) < r && Math.abs(p.y - y) < r * 0.45 && p.z < 40) {
      p.takeHit({ dmg: dmg.player, dir: p.x >= x ? 1 : -1, kb: 200, knockdown: true });
    }
    if (dmg.enemies > 0) {
      let hits = 0;
      for (const e of this.enemies) {
        if (!e.hittable || Math.abs(e.x - x) > r + e.halfW || Math.abs(e.y - y) > r * 0.45) continue;
        if (e.takeHit({ dmg: dmg.enemies, dir: e.x >= x ? 1 : -1, kb: 0, knockdown: true, thrown: true })) hits++;
      }
      if (hits) this.addCombo(hits, true);
    }
  }

  /** 적이 쏘는 것: 질문, 서류, 요구안, 확성기 음파 */
  fireProjectile(from: Enemy, kind: 'question' | 'paper' | 'demand' | 'sonic', dy: number): void {
    const y = Phaser.Math.Clamp(from.y + dy, FLOOR_TOP, FLOOR_BOTTOM);
    const f = from.facing;
    const spec = {
      question: { obj: () => createQuestionBubble(this), z: 44, v: 330, halfW: 16 },
      paper: { obj: () => createDemandPaper(this), z: 40, v: 360, halfW: 14 },
      demand: { obj: () => createDemandPaper(this), z: 40, v: 300, halfW: 14 },
      sonic: { obj: () => createSonicWave(this, f), z: 34, v: 300, halfW: 26 },
    }[kind];
    this.projectiles.push(
      new Projectile(this, {
        x: from.x + f * 34,
        y,
        z: spec.z,
        vx: f * spec.v,
        owner: 'enemy',
        dmg: 1,
        knockdown: false,
        tag: kind === 'sonic' ? 'sonic' : undefined,
        halfW: spec.halfW,
        ttl: 3.2,
        obj: spec.obj(),
        spin: kind === 'paper' || kind === 'demand' ? 8 * f : 0,
      }),
    );
  }

  /** 줄 서 있는 것(문의 줄, 연좌 농성)에 부딪히면 밀려난다 */
  bumpPlayer(source: Enemy, dir: number, damage = true): void {
    const p = this.player;
    p.x = source.x + dir * (source.halfW + p.halfW + 2);
    if (damage && this.bumpCd <= 0) {
      this.bumpCd = 1.0;
      p.takeHit({ dmg: 1, dir, kb: 160, knockdown: false });
    }
  }

  /** 총장실 메일 학생: 지시 사항 세 장이 떨어진다 */
  dropOrders(px: number, py: number): void {
    const left = this.cameras.main.scrollX;
    fx.banner(this, '총장실 지시 사항 하달!', '바닥의 빨간 표시를 피하세요', 1200);
    for (let i = 0; i < 3; i++) {
      const x = Phaser.Math.Clamp(px + Phaser.Math.Between(-130, 130), left + 50, left + GAME_W - 50);
      const y = Phaser.Math.Clamp(py + Phaser.Math.Between(-40, 40), FLOOR_TOP + 6, FLOOR_BOTTOM - 6);
      this.hazards.push(
        new Hazard(this, {
          x,
          y,
          delay: 0.9 + i * 0.25,
          radius: 42,
          owner: 'enemy',
          dmg: 1,
          obj: createFallingDoc(this, '지시', 0xffffff),
        }),
      );
    }
  }

  /** 단대학생회 간부: 민원 잡몹을 부른다 */
  rally(n: number): void {
    const alive = this.enemies.filter((e) => !e.dead).length;
    for (let i = 0; i < n && alive + i < 6; i++) this.spawnType(Math.random() < 0.7 ? 'mail' : 'bubble');
  }

  dropPetition(x: number, y: number): void {
    const left = this.cameras.main.scrollX;
    const px = Phaser.Math.Clamp(x, left + 60, left + GAME_W - 60);
    const py = Phaser.Math.Clamp(y, FLOOR_TOP + 10, FLOOR_BOTTOM - 10);
    this.pickups.push(new Pickup(this, 'petition', px, py));
  }

  petitionPos(): { x: number; y: number } | null {
    const it = this.pickups.find((i) => i.kind === 'petition' && !i.removed);
    return it ? { x: it.x, y: it.y } : null;
  }

  takePetitionBack(): void {
    this.pickups.find((i) => i.kind === 'petition')?.destroy();
  }

  /** 마감 1분 전 학생: 서류 뭉치를 플레이어 근처에 던져 놓는다 */
  spawnBombNear(px: number, py: number): void {
    const left = this.cameras.main.scrollX;
    const x = Phaser.Math.Clamp(px + (Math.random() < 0.5 ? -1 : 1) * Phaser.Math.Between(110, 180), left + 60, left + GAME_W - 60);
    const y = Phaser.Math.Clamp(py + Phaser.Math.Between(-30, 30), FLOOR_TOP + 8, FLOOR_BOTTOM - 8);
    const b = new DocBomb(this, x, y, x);
    this.enemies.push(b);
    fx.dust(this, x, y);
  }

  addReportTrap(fromX: number, laneY: number, toX: number, toY: number): void {
    const left = this.cameras.main.scrollX;
    const tx = Phaser.Math.Clamp(toX, left + 60, left + GAME_W - 60);
    const ty = Phaser.Math.Clamp(toY, FLOOR_TOP + 10, FLOOR_BOTTOM - 10);
    this.traps.push(new ReportTrap(this, fromX, laneY, tx, ty));
  }

  /** 최몰라 처장: "몰라~" 하며 메일 하나를 넘긴다 */
  passMail(x: number): void {
    const left = this.cameras.main.scrollX;
    const sx = Phaser.Math.Clamp(x, left + 40, left + GAME_W - 40);
    const tx = Phaser.Math.Clamp(this.player.x + (sx < this.player.x ? -120 : 120), left + 80, left + GAME_W - 80);
    this.enemies.push(new MailEnemy(this, sx, FLOOR_TOP + 6, tx));
    fx.floatText(this, sx, FLOOR_TOP - 90, '넘겨받은 민원', '#ffd27f', 15);
  }

  /** 회의소집 부총장: 플레이어 발밑에 회의 원을 그린다 */
  callMeeting(x: number, y: number): void {
    const c = this.add.container(x, y).setDepth(-3);
    const ring = this.add.ellipse(0, 0, 168, 60, 0x7c3aed, 0.25).setStrokeStyle(3, 0x7c3aed, 0.9);
    const t = this.add
      .text(0, 0, '회의 소집 — 원 밖으로!', { fontFamily: FONT, fontSize: '13px', fontStyle: 'bold', color: '#ffffff' })
      .setOrigin(0.5);
    c.add([ring, t]);
    this.meetings.push({ x, y, t: 0, obj: c });
  }

  /** 허허실실 부총장: 간식 하나와 일거리 하나 */
  dropSnacks(_fromX: number, px: number, py: number): void {
    const left = this.cameras.main.scrollX;
    const real = (['donkatsu', 'gimbap', 'americano'] as const)[Phaser.Math.Between(0, 2)];
    const kinds: PickupKind[] = Math.random() < 0.5 ? [real, 'work'] : ['work', real];
    kinds.forEach((k, i) => {
      const x = Phaser.Math.Clamp(px + (i === 0 ? -1 : 1) * Phaser.Math.Between(70, 130), left + 60, left + GAME_W - 60);
      const y = Phaser.Math.Clamp(py + Phaser.Math.Between(-30, 30), FLOOR_TOP + 8, FLOOR_BOTTOM - 8);
      this.pickups.push(new Pickup(this, k, x, y, 10));
    });
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

  /** 보스를 처리하면 남은 잡몹도 함께 처리되고 상사들은 물러난다 */
  private onBossDefeated(title: string, sub: string): void {
    if (this.bossDefeated) return;
    this.bossDefeated = true;
    fx.banner(this, title, sub, 2400);
    for (const o of this.enemies) {
      if (o.dead || o.kind === 'chonghak' || o.kind === 'noticeBoss' || o.kind === 'deadlineBoss') continue;
      o.takeHit({ dmg: 99, dir: o.x >= this.player.x ? 1 : -1, kb: 0, knockdown: true, force: true });
      if (o instanceof DocBomb) o.destroy();
    }
    for (const s of this.sups) s.leave();
    for (const m of this.meetings) m.obj.destroy();
    this.meetings = [];
    this.player.releaseCling();
  }

  onEnemyDefeated(e: Enemy): void {
    if (e.kind === 'noticeBoss') {
      this.onBossDefeated('민원 처리 완료!', `${this.run.names.noticeBoss} 학생이 드디어 공지를 읽었습니다`);
      return;
    }
    if (e.kind === 'deadlineBoss') {
      this.onBossDefeated('마감 처리 완료!', `${this.run.names.deadline} 학생의 과제가 제출되었습니다`);
      return;
    }
    if (e.kind === 'chonghak') return;
    for (const s of this.sups) if (s.tryRecheck(e)) break;
  }

  onChonghakDone(): void {
    this.onBossDefeated('총학 집행부: "총장 면담을 요청합니다!"', '…본관에서 누군가 내려옵니다');
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

  // ---------- 필살기: 업무 스킬 ----------

  startSpecial(): void {
    const skill = skillById(this.run.skill);
    this.player.enterSpecial();
    this.specialT = 0;
    this.specialFired = false;
    const dim = this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x000000, 0.55);
    const t = this.add
      .text(GAME_W / 2, GAME_H / 2 - 30, skill.banner, {
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
      .text(GAME_W / 2, GAME_H / 2 + 36, skill.sub, { fontFamily: FONT, fontSize: '18px', color: '#f5c542' })
      .setOrigin(0.5);
    this.specialObjs = [dim, t, sub];
    for (const o of this.specialObjs) (o as Phaser.GameObjects.Text).setScrollFactor(0).setDepth(2400);
    this.tweens.add({ targets: t, scale: 1, duration: 220, ease: 'Back.Out' });
  }

  private updateSpecial(dt: number): void {
    this.specialT += dt;
    this.player.pose(dt);
    this.player.sync();
    if (!this.specialFired && this.specialT >= 0.6) {
      this.specialFired = true;
      this.cameras.main.flash(160, 255, 255, 255);
      this.cameras.main.shake(220, 0.01);
      this.fireSkill();
    }
    if (this.specialT >= 0.95) {
      for (const o of this.specialObjs) o.destroy();
      this.specialObjs = [];
      this.specialT = -1;
      this.player.endSpecial();
    }
  }

  private skillTargets(): Enemy[] {
    const left = this.cameras.main.scrollX;
    return this.enemies.filter(
      (e) =>
        !e.dead &&
        e.x >= left - 10 &&
        e.x <= left + GAME_W + 10 &&
        !['drop', 'hidden', 'away', 'sitin', 'vanish'].includes(e.state),
    );
  }

  private skillHit(e: Enemy, label: string): void {
    const dir = e.x >= this.player.x ? 1 : -1;
    if (e.takeHit({ dmg: 4, dir, kb: 0, knockdown: true, force: true, thrown: true })) {
      fx.stampMark(this, e.x, e.y - e.z - Math.min(e.height, 70) * 0.6, label);
    }
  }

  private fireSkill(): void {
    const p = this.player;
    const left = this.cameras.main.scrollX;
    switch (this.run.skill) {
      case 'notice':
        for (const e of this.skillTargets()) this.skillHit(e, '공지');
        break;
      case 'batch': {
        // 일괄 처리: 앞으로 돌진하며 길 위(깊이 ±44)의 민원을 처리한다
        const endX = Phaser.Math.Clamp(p.x + p.facing * 460, left + 30, left + GAME_W - 30);
        const lo = Math.min(p.x, endX) - 30;
        const hi = Math.max(p.x, endX) + 30;
        for (const e of this.skillTargets()) if (e.x >= lo && e.x <= hi && Math.abs(e.y - p.y) < 44) this.skillHit(e, '전결');
        const trail = this.add.rectangle((p.x + endX) / 2, p.y - 50, Math.abs(endX - p.x), 70, 0x2f6fd1, 0.35).setDepth(p.y + 1);
        this.tweens.add({ targets: trail, alpha: 0, duration: 400, onComplete: () => trail.destroy() });
        this.tweens.add({ targets: p, x: endX, duration: 220, ease: 'Cubic.Out' });
        break;
      }
      case 'rulebook': {
        // 규정집 낙하: 민원이 몰린 곳(없으면 앞쪽)에 세 권
        const spots = this.skillTargets()
          .sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))
          .slice(0, 3)
          .map((e) => ({ x: e.x, y: e.y }));
        for (let i = spots.length; i < 3; i++) {
          spots.push({ x: Phaser.Math.Clamp(p.x + p.facing * (150 + i * 120), left + 60, left + GAME_W - 60), y: p.y });
        }
        spots.forEach((s, i) =>
          this.hazards.push(
            new Hazard(this, {
              x: s.x,
              y: s.y,
              delay: 0.45 + i * 0.12,
              radius: 95,
              owner: 'player',
              dmg: 4,
              obj: createFallingDoc(this, '규정집', 0x1f5e45, 80, 52),
            }),
          ),
        );
        break;
      }
      case 'transfer': {
        // 내선 돌리기: 같은 줄을 화면 끝까지 꿰뚫는다
        const edge = p.facing > 0 ? left + GAME_W : left;
        for (const e of this.skillTargets()) {
          if (Math.abs(e.y - p.y) < 36 && (e.x - p.x) * p.facing > -10) this.skillHit(e, '연결');
        }
        const beam = this.add
          .rectangle((p.x + edge) / 2, p.y - 50, Math.abs(edge - p.x), 26, 0x9fd3ff, 0.8)
          .setDepth(p.y + 1)
          .setStrokeStyle(3, 0x2f6fd1);
        const label = this.add
          .text((p.x + edge) / 2, p.y - 90, '내선 1004번으로 연결합니다', {
            fontFamily: FONT,
            fontSize: '16px',
            fontStyle: 'bold',
            color: '#ffffff',
            stroke: '#1d4ed8',
            strokeThickness: 4,
          })
          .setOrigin(0.5)
          .setDepth(1600);
        this.tweens.add({ targets: [beam, label], alpha: 0, delay: 250, duration: 450, onComplete: () => { beam.destroy(); label.destroy(); } });
        break;
      }
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
