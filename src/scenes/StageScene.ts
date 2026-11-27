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
import { JUMP_ATTACK, Player } from '../entities/Player';
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
import { WINDOW_STAFF, WINDOW_STAFF_KINDS, WindowStaff, windowStaffHero, type WindowStaffKind } from '../entities/WindowStaff';
import { JeonpilBoss, DocTower } from '../entities/JeonpilBoss';
import { BujaeBoss } from '../entities/BujaeBoss';
import { HanhakgoBoss } from '../entities/HanhakgoBoss';
import { PresidentBoss } from '../entities/PresidentBoss';
import { Cobweb, PenLine, SignLine } from '../entities/FloorGimmicks';
import { ChonghakAide } from '../entities/ChonghakAide';
import { Projectile } from '../entities/Projectile';
import { Hazard } from '../entities/Hazard';
import { Pickup, type PickupKind } from '../entities/Pickup';
import { GIFT_COOLDOWN, GIVER_TEXT, Giver } from '../entities/Giver';
import { Crate } from '../entities/Crate';
import { Helper, type HelperLook } from '../entities/Helper';
import { ReportTrap } from '../entities/ReportTrap';
import { Supervisor, type SupervisorKind } from '../entities/Supervisor';
import { Visitor } from '../entities/Visitor';
import { CheerMember } from '../entities/CheerMember';
import { CHEER_LOOKS, createPlaque } from '../entities/visitRigs';
import { WEAPONS, isWeaponId, weaponName, type WeaponId } from '../entities/weapons';
import {
  createDemandPaper,
  createFallingDoc,
  createPresidentPortrait,
  createQuestionBubble,
  createSonicWave,
} from '../entities/rigs';
import {
  createBigStamp,
  createBookCart,
  createCapIcon,
  createErrorWindow,
  createPacket,
  createPassportIcon,
  createRankArrow,
  createZachetDrop,
  weaponIcon,
} from '../entities/studentRigs';
import { TYPE_LABEL } from '../data/names';
import { stagesFor, type StageDef, type ZoneDef } from '../data/stages';
import { HEROES, heroById } from '../data/heroes';
import { STUDENT_HEROES, studentHeroById } from '../data/students';
import { helperBanner, helperLines } from '../data/helpers';
import { skillById } from '../data/skills';
import { spellById, spellLabel } from '../data/spells';
import {
  CHEER_N,
  CHEER_SEC,
  CLICKER_MUL,
  CLICKER_SEC,
  GLOVE_STAMPS,
  GRAPH_STAMPS,
  HUSH_MUL,
  HUSH_SEC,
  PLAQUE_SEC,
  REWARD_DESC_2D,
  REWARD_NAME,
  VISIT_SEC,
  VISIT_STAMPS,
  visitFor,
  type VisitReward,
} from '../data/visits';
import { gradeStage, type StageStats } from '../grade';
import { newRun, runClock, type RunState } from '../run';
import { hpBonus, perkMul } from '../perks';
import { DIFF2D, type Diff2d } from '../difficulty';
import { BTN_SIZE, BTN_SIZES, loadBtnSize, markTutorialSeen, onBtnSize, saveBtnSize, tutorialSeen, type BtnSize } from '../uiPrefs';
import { noteCombo, noteSpecialKills, noteStageNoDamage, noteVisitSuccess } from '../badges';
import { drawBackground } from './background';
import * as fx from '../fx';
import * as sound from '../sound';

// 스테이지. 구역을 차례로 잠그고 웨이브(교직원 src/data/stageN.json, 학생 studentN.json)를 정리한다.
// run.mode가 모든 것을 정한다: 교직원 모드는 민원 처리(방해 상사, 교수 서명 대기), 학생 모드는 행정 돌파(창구 직원, 학과장·교수·학장·총장).

const MAX_ATTACKERS = 2;
const TRIGGER_X = 330;
const STUDENT_KINDS: StudentKind[] = ['wrongNumber', 'lateDoc', 'tantrum', 'graduation', 'presidentMail'];
/** 학생 모드 보스 (처리되면 남은 잡몹이 함께 물러난다). 한학고 학장은 3스테이지 총장실 앞 관문 */
const STUDENT_BOSSES = ['jeonpilBoss', 'bujaeBoss', 'hanhakgoBoss', 'presidentBoss'];
/** 잡몹 (조력자가 한꺼번에 처리해 주고, 처리하면 가끔 무언가를 떨어뜨린다). 나머지는 중간보스·보스다 */
const ORDINARY = new Set(['mail', 'phone', 'bubble', 'docbomb', 'queue']);
/** 조력자 이벤트: 맞고 남은 체력이 이 비율 이하로 떨어지면 HELPER_CHANCE 확률로 온다 (스테이지마다 한 번) */
const HELPER_HP = 0.25;
const HELPER_CHANCE = 0.6;
/** 조력자가 도착해 효과가 나는 시각(초), 회복량(최대 체력 비율), 무적 시간(초) */
const HELPER_ARRIVE = 0.9;
const HELPER_HEAL = 0.35;
const HELPER_INVULN = 2;
/** 조력자가 중간보스·보스에게 깎는 체력(최대 체력 비율)과 그 아래로는 깎지 않는 바닥 */
const HELPER_CHIP = 0.1;
const HELPER_FLOOR = 0.05;
/** 잡몹을 처리했을 때 떨어뜨릴 확률: 보조배터리, 먹을 것 (상자가 주된 공급원이다) */
const DROP_BATTERY = 0.035;
const DROP_FOOD = 0.04;
/** 잡몹이 가끔 떨어뜨리는 것 (각각): 연차 쿠폰(학생: 공결 확인서), 셔틀버스 시간표, 단톡방 공지 캡처, 인감 도장(학생: 출석 스티커) */
const DROP_PERK = 0.025;
const PERKS: PickupKind[] = ['shield', 'shuttle', 'capture', 'seal'];
/** 연차 쿠폰(공결 확인서)이 기다려 주는 시간, 셔틀버스 시간표가 빠르게 해 주는 시간, 단톡방 공지 캡처로 잡몹이 멈추는 시간,
 *  인감 도장(출석 스티커)으로 맨손 공격이 잡몹을 넘어뜨리는 시간 (초) */
const SHIELD_SEC = 30;
const SHUTTLE_SEC = 10;
const CAPTURE_SEC = 2.5;
const SEAL_SEC = 8;
/** 돌발 방문 (교직원 모드, data/visits.ts): 고른 구역의 싸움이 시작된 뒤 이만큼(초, 무작위) 지나고
 *  안내 띠(구역 소개 등)·조력자·필살기가 없을 때 나온다 */
const VISIT_DELAY: [number, number] = [3, 7];
/** 방문 중 잡몹 보충: 보낼 웨이브가 다 나왔으면 VISIT_TRICKLE_T초마다, 잡몹이 VISIT_TRICKLE_MAX개 아래일 때 하나씩 (1인칭 돕기 이벤트 TRICKLE과 같은 값) */
const VISIT_TRICKLE_T = 3.5;
const VISIT_TRICKLE_MAX = 3;
/** 실사 통과 현판 안전지대 반지름 (x 방향 px, 깊이 방향은 0.45배) — 1인칭 5m에 맞춘 2D 거리 */
const PLAQUE_R = 140;
/** 사원증(학생증)이 되돌아오기 시작하는 거리: 던지는 속도 560px/s, 감속 1500px/s² (Projectile 기본값) */
const CARD_RANGE = (560 * 560) / (2 * 1500);
/** 이어하기 벌점 (분, 결정 60 — 게임오버된 시각에서 이어가고 2분을 더한다) */
const RETRY_PENALTY = 2;
/** 첫 판 안내: 단계를 해냈을 때 ✓를 보여 주는 시간(초), 1단계(이동)에서 움직여야 하는 거리(px) */
const TUT_OK_SEC = 0.7;
const TUT_MOVE = 150;
/** 첫 판 안내: 시작 안내 띠(1.6초 + 사라지는 0.3초)가 걷힌 뒤 1단계를 띄운다 (초) */
const TUT_INTRO_SEC = 1.9;
/** 첫 판 안내 "건너뛰기" 단추 (화면 좌표 — 터치 일시정지 단추 왼쪽) */
const SKIP_BTN = { x: 826, y: 34, w: 92, h: 34 };

/** 첫 판 안내(직접 해 보는 5단계 연습, 결정 60) 진행 상태 */
interface Tutorial {
  /** -1 = 시작 안내 띠가 사라지기를 기다리는 중, 0~4 = 단계 */
  step: number;
  /** 시작 안내 띠가 사라질 때까지 남은 시간 (초) */
  wait: number;
  /** ✓를 보여 주는 남은 시간 (0보다 크면 다음 단계로 넘어가는 중) */
  okT: number;
  /** 1단계: 지금까지 움직인 거리 */
  moved: number;
  lastX: number;
  lastY: number;
  /** 5단계: 필살기를 썼다 (연출이 끝나면 ✓) */
  specialUsed: boolean;
  /** 4단계에 놓아 준 사원증(학생증) — 연습이 끝나면 거둔다 */
  card: Pickup | null;
  box: Phaser.GameObjects.Container;
  title: Phaser.GameObjects.Text;
  sub: Phaser.GameObjects.Text;
  skip: Phaser.GameObjects.Container;
}

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

/** 프레지던트 캉 2페이즈: 수강신청 서버 폭주 */
interface ServerStorm {
  t: number;
  sec: number;
  dropT: number;
  packetT: number;
  queue: number;
}

export class StageScene extends Phaser.Scene {
  controls!: Controls;
  player!: Player;
  enemies: Enemy[] = [];
  run!: RunState;
  private stages: StageDef[] = [];
  private stageIndex = 0;
  private stage!: StageDef;
  private zones: ZoneDef[] = [];
  private pad: TouchPad | null = null;
  private hud!: Hud;
  private attackers = new Set<Enemy>();
  private projectiles: Projectile[] = [];
  private hazards: Hazard[] = [];
  private pickups: Pickup[] = [];
  private givers: Giver[] = [];
  private crates: Crate[] = [];
  private helpers: Helper[] = [];
  /** 조력자 이벤트: 이번 스테이지에 이미 왔는지, 온 뒤 지난 시간(-1 = 진행 중 아님) */
  private helperUsed = false;
  private helperT = -1;
  /** 지난 스테이지에서 바닥 체력(HELPER_HP 이하)으로 이어받아 들어왔다: 첫 피격 때 조력자 확률을 굴린다 */
  private helperPrimed = false;
  /** 경비원(대출기) 사용법 안내를 이번 스테이지에 보여 줬는지 */
  private giverHinted = false;
  /** 경비원이 기믹 무기를 던져 주러 오는 중 */
  private supplyPending = false;
  /** 던진 무기마다 이미 맞힌 상자·경비원 (던진 무기의 hitSet이 열쇠다) */
  private touched = new WeakMap<object, Set<object>>();
  /** 상자·경비원이 마지막으로 맞은 휘두르기 번호 (Player.swing) */
  private swingHits = new Map<object, number>();
  private traps: ReportTrap[] = [];
  private sups: Supervisor[] = [];
  private meetings: MeetingCircle[] = [];
  private penLines: PenLine[] = [];
  /** 최내놔 처장의 거미줄과 던진 처장 (밟으면 그 처장 곁으로 끌려간다) */
  private webs: { web: Cobweb; sup: Supervisor }[] = [];
  /** 거미줄에 걸려 끌려가는 중 */
  private pull: { fx: number; fy: number; tx: number; ty: number; t: number } | null = null;
  /** 권학생이 부른 총학 집행부 */
  private aides: ChonghakAide[] = [];
  /** 프레지던트 캉의 MOU 서명선 */
  private signs: SignLine[] = [];
  /** 잠깐 멈췄을 때 위쪽 안내 (성적표 F·거미줄) */
  private freezeNote = '';
  private storm: ServerStorm | null = null;
  /** 돌발 방문 (교직원 모드, 한 판에 한 번): 이번 스테이지에서 나올 구역(-1 = 없음), 그 구역 싸움이 시작된 뒤 남은 대기,
   *  지금 와 있는 상대, 방문 중 잡몹 보충 */
  private visitZone = -1;
  private visitWait = 0;
  private visitor: Visitor | null = null;
  private trickleT = 0;
  /** 돌발 방문 보상: 응원단(남은 시간), 실사 통과 현판(안전지대), 쉿! 정숙 표지판(잡몹 느려짐 남은 시간) */
  private cheer: CheerMember[] = [];
  private cheerT = 0;
  private plaque: { x: number; y: number; t: number; obj: Phaser.GameObjects.Container; ring: Phaser.GameObjects.Ellipse } | null = null;
  private hushT = 0;
  private ticketNo = 86;
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
  /** 2D 난이도 수치 (run.diff → DIFF2D) */
  private diff: Diff2d = DIFF2D.normal;
  /** 인물 장점 배율 (해당 없으면 1, src/perks.ts) */
  private perk = { move: 1, special: 1, throw: 1, power: 1, buff: 1 };
  /** 이번 필살기(발동~효과 끝)로 처리한 잡몹 수 (배지 "일괄 처리") */
  private specialKills = 0;
  /** 첫 판 안내 (이 기기에서 처음 하는 2D 판의 1스테이지). 진행 중에는 시계가 멈추고 첫 구역 싸움이 시작되지 않는다 */
  private tut: Tutorial | null = null;
  /** 게임오버 화면의 "이 스테이지부터 다시" 단추 자리 (없으면 null) */
  private retryRect: Phaser.Geom.Rectangle | null = null;
  /** 일시정지 화면의 단추 크기 고르기 (터치 화면에서만) */
  private sizeBtns: { size: BtnSize; rect: Phaser.Geom.Rectangle; bg: Phaser.GameObjects.Rectangle; text: Phaser.GameObjects.Text }[] = [];

  constructor() {
    super('stage');
  }

  init(data: StageData): void {
    this.run = data.run ?? newRun('staff', 'kimgukje', 'notice');
    this.stages = stagesFor(this.run.mode);
    this.stageIndex = Phaser.Math.Clamp(data.stage ?? 0, 0, this.stages.length - 1);
    this.stage = this.stages[this.stageIndex];
    this.zones = this.stage.zones;
    this.run.reached = Math.max(this.run.reached, this.stageIndex + 1);
    this.enemies = [];
    this.attackers = new Set();
    this.projectiles = [];
    this.hazards = [];
    this.pickups = [];
    this.givers = [];
    this.crates = [];
    this.helpers = [];
    this.helperUsed = false;
    this.helperT = -1;
    this.helperPrimed = false;
    this.giverHinted = false;
    this.supplyPending = false;
    this.touched = new WeakMap();
    this.swingHits = new Map();
    this.traps = [];
    this.sups = [];
    this.meetings = [];
    this.penLines = [];
    this.webs = [];
    this.pull = null;
    this.aides = [];
    this.signs = [];
    this.freezeNote = '';
    this.storm = null;
    this.visitor = null;
    this.visitWait = 0;
    this.trickleT = 0;
    this.cheer = [];
    this.cheerT = 0;
    this.plaque = null;
    this.hushT = 0;
    this.visitZone = this.pickVisitZone();
    this.ticketNo = 86;
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
    this.diff = DIFF2D[this.run.diff] ?? DIFF2D.normal;
    const id = this.run.hero;
    this.perk = {
      move: perkMul(id, 'move'),
      special: perkMul(id, 'special'),
      throw: perkMul(id, 'throw'),
      power: perkMul(id, 'power'),
      buff: perkMul(id, 'buff'),
    };
    this.specialKills = 0;
    this.tut = null;
    this.retryRect = null;
    this.sizeBtns = [];
  }

  /** 플레이어가 받는 피해 배율 (2D 난이도, Player.takeHit이 묻는다) */
  get hurtMul(): number {
    return this.diff.damage;
  }

  /** 학생 모드인지 (적 외형·문구가 바뀐다) */
  get studentMode(): boolean {
    return this.run.mode === 'student';
  }

  private get stageW(): number {
    return this.zones[this.zones.length - 1].left + GAME_W;
  }

  /** 지금 서 있는 구역 이름 (HUD·게임오버 문구) */
  private get zoneLabel(): string {
    return this.zones[Math.min(this.zoneIndex, this.zones.length - 1)].label;
  }

  create(): void {
    const st = this.studentMode;
    this.cameras.main.setBounds(0, 0, this.stageW, GAME_H);
    this.cameras.main.fadeIn(250, 0, 0, 0);
    drawBackground(this, this.stage);

    this.controls = new Controls();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.controls.destroy());
    if (FORCE_TOUCH || this.sys.game.device.input.touch) this.pad = new TouchPad(this, this.controls);

    // 바닥에 미리 깔린 무기·음식은 없다: 무기는 경비원(대출기)에게서, 먹을 것은 상자를 부숴서 얻는다
    // 경비 선생님은 자리 순서대로 남·여가 번갈아 선다 (11차)
    this.stage.givers.forEach((g, i) => this.givers.push(new Giver(this, st ? 'kiosk' : 'guard', g.x, g.y, g.items, false, i % 2 === 1)));
    for (const b of this.stage.boxes) this.crates.push(new Crate(this, b.x, b.y, st));

    const hero = st ? studentHeroById(this.run.hero) : heroById(this.run.hero);
    this.player = new Player(
      this,
      250,
      430,
      st ? { student: true, look: studentHeroById(this.run.hero).look } : { student: false, look: heroById(this.run.hero).look },
    );
    this.player.lives = this.run.lives;
    // 인물 장점 (결정 60): 최대 체력 +1칸 (12 → 13), 이동 +10%
    this.player.maxHp += hpBonus(this.run.hero);
    this.player.hp = this.player.maxHp;
    this.player.moveMul = this.perk.move;
    // 지난 스테이지에서 깎인 체력을 그대로 이어받는다. 없으면 최대 체력 (새 판·디버그로 바로 연 스테이지·이어하기)
    const carried = this.run.hp;
    if (carried !== undefined) this.player.hp = Phaser.Math.Clamp(carried, 1, this.player.maxHp);
    // 이미 바닥 체력으로 들어왔으면 첫 피격에도 조력자 확률을 한 번 굴린다 (maybeCallHelpers)
    this.helperPrimed = this.player.hp <= this.player.maxHp * HELPER_HP;
    this.hud = new Hud(this, this.pad !== null, hero.name, st);
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
    if (this.pad) this.buildSizeRow();

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.paused) {
        const b = this.sizeBtns.find((s) => s.rect.contains(p.x, p.y));
        if (b) saveBtnSize(b.size);
        return;
      }
      const s = SKIP_BTN;
      if (this.tut && Math.abs(p.x - s.x) <= s.w / 2 && Math.abs(p.y - s.y) <= s.h / 2) this.endTutorial(true);
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (!this.over || this.time.now - this.overAt <= 1000) return;
      if (this.retryRect?.contains(p.x, p.y)) this.continueStage();
      else this.toRecord();
    });

    const first = st ? '오후 4시 52분 · 본관 마감 8분 전' : '오후 4시 52분 · 퇴근 8분 전';
    const intro = this.stageIndex === 0 ? first : this.stage.title;
    // 이 기기에서 처음 하는 2D 판: 1스테이지 첫 구역 싸움 전에 직접 해 보는 5단계 연습 (시작 안내 띠가 사라지면 나온다)
    if (this.stageIndex === 0 && !tutorialSeen('2d')) {
      fx.banner(this, intro, `${hero.name}: "${hero.line}"`, 1600);
      this.startTutorial();
    } else {
      fx.banner(this, intro, `${hero.name}: "${hero.line}" — 오른쪽으로 이동하세요`, 2400);
    }
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
        c.consume('retry');
      } else if (this.retryRect && c.consume('retry')) {
        this.continueStage();
        return;
      } else if (c.consume('confirm')) {
        this.toRecord();
        return;
      }
      if (c.consume('restart')) {
        this.scene.start('select', { mode: this.run.mode });
        return;
      }
    } else if (!this.finishing) {
      if (c.consume('pause')) this.setPaused(!this.paused);
      if (!this.paused) this.step(dt);
    } else if (this.studentMode) {
      // 마무리 연출: 승인하는 프레지던트 캉, 걸어 나가는 학과장·교수가 멈춰 버리지 않게 움직임만 이어 간다
      for (const e of this.enemies) e.update(dt, this.player);
      this.enemies = this.enemies.filter((e) => !e.removed);
    }

    this.updateCamera(dt);
    const b = this.boss && !this.boss.bossGone ? this.boss : null;
    sound.stageMusic(this.run.mode, !!b && !this.bossDefeated, this.paused);
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
      perks: this.visitPerks(),
      boss: b
        ? { name: b.bossName, type: b.bossType, hp: b.bossHp, maxHp: b.bossMaxHp, extra: b.bossExtra() }
        : null,
    });
    if (this.pad) {
      const hw = this.player.weapon;
      // 사원증을 든 채 다른 물건 위에 서 있으면 버튼은 "줍기"(바꿔 들기)
      const holding = hw !== null && !hw.inFlight && !(hw.def.boomerang && this.pickableAt(this.player));
      const greet = this.greetTarget(this.player) ? (this.studentMode ? '대여' : '인사') : null;
      this.pad.draw(this.player.sp >= 100, holding, greet);
    }
    this.drawDebug(dt);
  }

  private noticeLine(): string {
    if (this.approval === 'waiting') return `교수 서명 대기 중 · 김부재중 교수 부재중 (${Math.ceil(this.approvalT)}초)`;
    if (this.approval === 'called') return '김부재중 교수가 오는 중…';
    if (this.player.clingBy) return '매달렸다! J(처리) 연타로 떼어 내기';
    if (this.player.state === 'meeting') return '회의 중… 회의록 작성 중';
    const v = this.visitor;
    if (v?.active) return `돌발 방문 · ${v.def.name} — 결재판 ${v.stamps}/${VISIT_STAMPS} · 남은 시간 ${Math.ceil(v.timeLeft)}초`;
    if (this.storm) {
      const n = Math.max(1, Math.round((this.storm.queue * this.storm.t) / this.storm.sec));
      return `수강신청 서버 폭주! 대기 인원 ${n.toLocaleString('ko-KR')}명 — 빨간 표시를 피하세요`;
    }
    if (this.player.state === 'frozen') return this.freezeNote || '잠깐 멈춤…';
    return '';
  }

  private step(dt: number): void {
    // 첫 판 안내(연습) 중에는 게임 속 시계가 멈춘다 (기록에 영향 없음)
    if (this.tut) this.updateTutorial(dt);
    else this.elapsed += dt;
    if (this.specialT >= 0) {
      this.updateSpecial(dt);
      return;
    }
    if (this.hitstop > 0) {
      this.hitstop -= dt;
      return;
    }
    if (this.bumpCd > 0) this.bumpCd -= dt;
    const prevX = this.player.x;
    this.player.update(dt, this.controls);
    this.updatePull(dt);
    // 2D 난이도: 적 이동·공격 빠르기 (돌발 방문 상대는 제한 시간 20초가 그대로 흐르게 뺀다)
    // 쉿! 정숙 표지판: 잡몹만 이동·발사(공격) 속도 절반
    for (const e of this.enemies) {
      let edt = e instanceof Visitor ? dt : dt * this.diff.speed;
      if (this.hushT > 0 && ORDINARY.has(e.kind)) edt *= HUSH_MUL;
      e.update(edt, this.player);
    }
    this.enemies = this.enemies.filter((e) => !e.removed);
    if (this.visitor?.removed) this.visitor = null;
    this.updateVisitRewards(dt);
    this.updateProjectiles(dt);
    this.updateHazards(dt);
    this.updatePickups(dt);
    this.updateProps(dt);
    this.updateHelpers(dt);
    for (const t of this.traps) t.update(dt, this.player);
    this.traps = this.traps.filter((t) => !t.removed);
    for (const s of this.sups) s.update(dt, this.player);
    this.sups = this.sups.filter((s) => !s.removed);
    this.updateMeetings(dt);
    this.updateFloorGimmicks(dt, prevX);
    this.updateStorm(dt);
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
    if (v) this.drawSizeRow();
  }

  /** 일시정지 화면 아래쪽: 단추 크기 작게·보통·크게 (터치 화면에서만, 누르면 바로 바뀐다 — 결정 60) */
  private buildSizeRow(): void {
    const y = GAME_H / 2 + 132;
    const label = this.add
      .text(GAME_W / 2, y - 42, '단추 크기', { fontFamily: FONT, fontSize: '18px', fontStyle: 'bold', color: '#dfe6f2' })
      .setOrigin(0.5);
    const objs: Phaser.GameObjects.GameObject[] = [label];
    BTN_SIZES.forEach((size, i) => {
      const x = GAME_W / 2 + (i - 1) * 124;
      const bg = this.add.rectangle(x, y, 108, 46, 0x111827, 0.92).setStrokeStyle(2, 0xf5c542);
      const text = this.add
        .text(x, y, BTN_SIZE[size].label, { fontFamily: FONT, fontSize: '20px', fontStyle: 'bold', color: '#ffffff' })
        .setOrigin(0.5);
      this.sizeBtns.push({ size, rect: new Phaser.Geom.Rectangle(x - 54, y - 23, 108, 46), bg, text });
      objs.push(bg, text);
    });
    for (const o of objs) (o as Phaser.GameObjects.Text).setScrollFactor(0).setDepth(2501).setVisible(false);
    this.pauseObjs.push(...objs);
    const off = onBtnSize(() => this.drawSizeRow());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, off);
  }

  private drawSizeRow(): void {
    const cur = loadBtnSize();
    for (const b of this.sizeBtns) {
      const on = b.size === cur;
      b.bg.setFillStyle(on ? 0xf5c542 : 0x111827, on ? 1 : 0.92);
      b.text.setColor(on ? '#111318' : '#ffffff');
    }
  }

  // ---------- 구역 진행 ----------

  /** 구역을 끝내지 못하게 막는 적이 남았는지 (승인하고 선 채로 남는 프레지던트 캉은 막지 않는다) */
  private get enemiesLeft(): boolean {
    return this.enemies.some((e) => !(e.dead && e.staysAfter));
  }

  private updateZones(dt: number): void {
    const z = this.zones[this.zoneIndex];
    if (this.zoneState === 'walk') {
      this.goText.setVisible(this.zoneIndex > 0 && this.cameras.main.scrollX < z.left - 20);
      // 첫 판 안내(연습) 중에는 적이 오지 않는다
      if (this.player.x >= z.left + TRIGGER_X && !this.tut) this.startFight();
      return;
    }
    if (this.zoneState !== 'fight') return;

    this.spawnT -= dt;
    // 돌발 방문 상대는 웨이브 머릿수에 넣지 않는다
    const alive = this.enemies.filter((e) => !e.dead && !(e instanceof Visitor)).length;
    if (this.queue.length > 0 && this.spawnT <= 0 && alive < z.maxAlive) {
      this.spawnType(this.queue.shift() as string);
      this.spawnT = 0.8;
    }
    // 보스전 지원 잡몹 (서버 폭주 중에는 쉰다)
    if (z.adds && this.boss && !this.bossDefeated && !this.storm) {
      this.addsT -= dt;
      const adds = this.enemies.filter((e) => e.kind === z.adds?.type && !e.dead).length;
      if (this.addsT <= 0 && adds < z.adds.max) {
        this.spawnType(z.adds.type);
        this.addsT = z.adds.every;
      }
    }
    this.supplyItems(dt, z);
    this.updateVisit(dt);

    // 김부재중 교수 서명: 웨이브를 다 정리한 뒤 버텨야 한다 (돌발 방문이 남았으면 그 뒤에)
    if (z.approval && this.approval === 'none' && this.queue.length === 0 && this.enemies.length === 0 && !this.visitHolds) {
      this.approval = 'waiting';
      this.approvalT = 9;
      this.approvalAddT = 1.2;
      fx.banner(this, '다음 구역은 교수 서명이 필요합니다', '김부재중 교수 부재중… 돌아올 때까지 버티세요', 2200);
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
            fx.banner(this, '서명 완료!', '이제 다음 구역으로 갈 수 있습니다', 1400);
          }),
        );
      }
    }
    const approved = !z.approval || this.approval === 'done';
    if (approved && this.queue.length === 0 && !this.enemiesLeft && !this.visitHolds) this.clearZone();
  }

  /** 기믹에 필요한 물건을 떨어지지 않게 공급한다 (안내문 롤, 규정집, 김부재중 교수전의 던질 것) */
  private supplyItems(dt: number, z: ZoneDef): void {
    let need: WeaponId | null = null;
    if (this.noticeBoss?.wantsNotice) need = 'notice';
    else if (this.enemies.some((e) => e.kind === 'tantrum' && !e.dead)) need = 'rulebook';
    else if (this.enemies.some((e) => e.kind === 'bujaeBoss' && !e.dead)) need = 'stapler';
    if (!need) return;
    const anyThrowable = need === 'stapler';
    const exists =
      this.supplyPending ||
      this.pickups.some((p) => (anyThrowable ? p.isWeapon : p.kind === need) && p.x >= z.left && !p.removed) ||
      (anyThrowable ? this.player.weapon !== null : this.player.weapon?.id === need) ||
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
      this.deliverSupply(need, x, y);
    }
  }

  /** 기믹 무기 공급. 교직원 모드: 구역의 경비원이 (x, y)로 던져 준다 (없으면 화면 끝에서 들어와서).
   *  학생 모드: 구역의 도서 무인 대출기 앞으로 튀어나온다 (대출기가 없으면 (x, y)에 놓인다). */
  private deliverSupply(need: WeaponId, x: number, y: number): void {
    const giver = this.givers.find((g) => !g.courier && g.inView());
    if (this.studentMode) {
      const text = need === 'notice' ? '안내문 도착!' : need === 'rulebook' ? '규정집 도착! 던져 보세요' : '텀블러 도착! 던져 보세요';
      if (giver) {
        const left = this.cameras.main.scrollX;
        const side = this.player.x >= giver.x ? 1 : -1;
        const tx = Phaser.Math.Clamp(giver.x + side * Phaser.Math.Between(60, 120), left + 50, left + GAME_W - 50);
        const ty = Phaser.Math.Clamp(giver.y + Phaser.Math.Between(40, 90), FLOOR_TOP + 10, FLOOR_BOTTOM - 10);
        giver.blink();
        this.tossItem(need, giver, tx, ty, 0);
        fx.floatText(this, tx, ty - 60, text, '#9fd3ff', 18);
      } else {
        this.pickups.push(new Pickup(this, need, x, y, 0, true));
        fx.floatText(this, x, y - 60, text, '#9fd3ff', 18);
      }
      return;
    }
    const toss = (g: Giver) => {
      g.tossPose(x);
      this.tossItem(need, g, x, y, 0);
      fx.floatText(this, g.x, g.y - g.height - 34, GIVER_TEXT.guardToss, '#9fd3ff', 18);
    };
    if (giver) {
      toss(giver);
      return;
    }
    // 이 구역에 경비원이 없으면 가까운 화면 끝에서 들어와 던져 주고 나간다
    const left = this.cameras.main.scrollX;
    const fromRight = x - left > GAME_W / 2;
    const fromX = fromRight ? left + GAME_W + 50 : left - 50;
    const stopX = fromRight ? left + GAME_W - 110 : left + 110;
    this.supplyPending = true;
    const courier: Giver = Giver.courierIn(this, fromX, FLOOR_TOP + 12, stopX, () => {
      this.supplyPending = false;
      toss(courier);
    });
    this.givers.push(courier);
  }

  /** 경비원(대출기)이 물건을 (tx, ty)로 던져 준다 */
  private tossItem(kind: PickupKind, g: Giver, tx: number, ty: number, ttl: number): Pickup {
    const h = g.handPos;
    const d = Math.hypot(tx - h.x, (ty - h.y) * 2);
    const it = new Pickup(this, kind, tx, ty, ttl, this.studentMode).tossFrom(h.x, h.y, h.z, 0.35 + d / 1100, 40 + d * 0.12);
    this.pickups.push(it);
    return it;
  }

  private startFight(): void {
    const z = this.zones[this.zoneIndex];
    this.zoneState = 'fight';
    this.queue = this.scaleWaves(z.waves);
    this.spawnT = 0.4;
    this.addsT = z.adds?.every ?? 0;
    this.approval = 'none';
    this.goText.setVisible(false);
    if (this.zoneIndex === this.visitZone) this.visitWait = Phaser.Math.FloatBetween(VISIT_DELAY[0], VISIT_DELAY[1]);
    const bossZone = z.waves.some((w) => w.endsWith('Boss') || w === 'chonghak');
    if (!bossZone) fx.banner(this, z.label, this.studentMode ? '서류 들고 돌파!' : '민원 접수 중', 1200);
    // 학생 3스테이지는 관문(한학고 학장) 뒤 총장실이라 보스 구역마다 새로 센다
    else this.bossDefeated = false;
    for (const k of z.supervisors) {
      const delay = k === 'meeting' ? 9 : k === 'hoho' ? 6 : 3.5;
      this.sups.push(new Supervisor(this, k as SupervisorKind, delay));
    }
  }

  /** 2D 난이도: 웨이브의 잡몹 수를 배율만큼 (반올림, 최소 1). 중간보스·보스는 그대로 두고, 빼거나 더하는 잡몹은 웨이브 전체에 고르게 고른다 */
  private scaleWaves(waves: string[]): string[] {
    const mobs = waves.map((w, i) => (ORDINARY.has(w) ? i : -1)).filter((i) => i >= 0);
    const n = mobs.length;
    const want = n === 0 ? 0 : Math.max(1, Math.round(n * this.diff.count));
    if (want === n) return [...waves];
    if (want < n) {
      const cut = n - want;
      const drop = new Set<number>();
      for (let j = 0; j < cut; j++) drop.add(mobs[Math.floor(((j + 0.5) * n) / cut)]);
      return waves.filter((_, i) => !drop.has(i));
    }
    // 더할 때는 고른 잡몹 바로 뒤에 같은 잡몹을 하나 더 넣는다
    const extra = want - n;
    const dup = new Map<number, number>();
    for (let j = 0; j < extra; j++) {
      const i = mobs[Math.floor(((j + 0.5) * n) / extra) % n];
      dup.set(i, (dup.get(i) ?? 0) + 1);
    }
    const out: string[] = [];
    waves.forEach((w, i) => {
      out.push(w);
      for (let r = 0; r < (dup.get(i) ?? 0); r++) out.push(w);
    });
    return out;
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
    const before = this.enemies.length;
    this.spawnRaw(type);
    // 2D 난이도: 중간보스·보스 체력(결재 진행) 배율. 잡몹·돌발 방문 상대·수강편람 탑은 그대로
    const k = this.diff.bossHp;
    if (k === 1) return;
    for (const e of this.enemies.slice(before)) {
      if (ORDINARY.has(e.kind) || e instanceof Visitor || e instanceof DocTower) continue;
      e.maxHp = Math.max(1, Math.round(e.maxHp * k));
      e.hp = e.maxHp;
    }
  }

  private spawnRaw(type: string): void {
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
      case 'queue':
        this.spawnQueue(x, y, tx, 5);
        if (this.studentMode) fx.banner(this, '대기번호표 행렬', '줄줄이 길을 막습니다 — 위아래로 돌아가거나 하나씩 처리', 1500);
        else fx.banner(this, '단체 문의 줄', '줄줄이 길을 막습니다 — 위아래로 돌아가거나 하나씩 처리', 1500);
        break;
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
        fx.banner(this, '최종 보스 · 총학 집행부', '김데시벨 · 오시위 · 박장수생 — 누운 사람은 마지막에 일어납니다', 3000);
        break;
      }
      case 'jeonpilBoss': {
        const by = Phaser.Math.Clamp(p.y - 30, FLOOR_TOP + 10, FLOOR_BOTTOM - 40);
        const b = new JeonpilBoss(this, x, by, tx - 120);
        this.enemies.push(b);
        this.boss = b;
        fx.banner(this, '보스 · 전필수 스페인어과 학과장', '수강편람 탑부터 무너뜨려야 설득할 수 있어요 — 재수강 도장 그림자를 피하세요', 3000);
        break;
      }
      case 'bujaeBoss': {
        const by = Phaser.Math.Clamp(p.y, FLOOR_TOP + 20, FLOOR_BOTTOM - 20);
        const b = new BujaeBoss(this, x, by, tx - 80);
        this.enemies.push(b);
        this.boss = b;
        this.supplyT = 2;
        fx.banner(this, '보스 · 김부재중 교수', '던진 물건은 되받아칩니다 — 반사 직후나 등 뒤를 노리세요', 3000);
        break;
      }
      case 'hanhakgoBoss': {
        const by = Phaser.Math.Clamp(p.y, FLOOR_TOP + 20, FLOOR_BOTTOM - 20);
        const b = new HanhakgoBoss(this, x, by, tx - 100);
        this.enemies.push(b);
        this.boss = b;
        fx.banner(this, '관문 · 한학고 영어대학 학장', '성적표 둘 중 하나는 F — A+만 주우세요', 3000);
        break;
      }
      case 'presidentBoss': {
        const by = Phaser.Math.Clamp(p.y, FLOOR_TOP + 30, FLOOR_BOTTOM - 30);
        const b = new PresidentBoss(this, x, by, tx - 120);
        this.enemies.push(b);
        this.boss = b;
        fx.banner(this, '최종 보스 · 프레지던트 캉', '졸업 서류 최종 결재 — 거대 도장 그림자를 피하며 설득하세요', 3000);
        this.showPresidentCard();
        break;
      }
      default:
        if ((WINDOW_STAFF_KINDS as string[]).includes(type)) {
          const kind = type as WindowStaffKind;
          const hero = windowStaffHero(kind);
          this.enemies.push(new WindowStaff(this, kind, x, y, tx));
          fx.banner(this, `창구 · ${hero.name}`, `"${hero.line}" — ${WINDOW_STAFF[kind].hint}`, 2400);
        } else if ((STUDENT_KINDS as string[]).includes(type)) {
          const kind = type as StudentKind;
          const name = names[kind];
          this.enemies.push(new StudentEnemy(this, kind, x, y, tx, name));
          fx.banner(this, `${name} 학생 방문`, TYPE_LABEL[kind], 1500);
        }
    }
  }

  /** 줄줄이 이어진 단체 문의 줄 / 대기번호표 */
  private spawnQueue(x: number, y: number, tx: number, n: number): void {
    const left = this.zones[this.zoneIndex].left;
    let ahead: QueueSlip | null = null;
    const dir = x < left ? -1 : 1;
    for (let i = 0; i < n; i++) {
      const s: QueueSlip = new QueueSlip(this, x + dir * i * 38, y, tx + dir * i * 38, ahead);
      this.enemies.push(s);
      ahead = s;
    }
  }

  /** 프레지던트 캉 등장: 큰 초상이 오른쪽에서 잠깐 들어왔다 나간다 */
  private showPresidentCard(): void {
    const card = createPresidentPortrait(this, GAME_W + 120, 286).setScrollFactor(0).setDepth(1850);
    this.tweens.add({ targets: card, x: GAME_W - 128, duration: 380, ease: 'Back.Out' });
    this.tweens.add({ targets: card, x: GAME_W + 140, delay: 2600, duration: 320, ease: 'Cubic.In', onComplete: () => card.destroy() });
  }

  private clearZone(): void {
    for (const s of this.sups) s.leave();
    for (const t of this.traps) t.destroy();
    this.traps = [];
    this.clearFloorGimmicks();
    this.player.releaseCling();
    if (this.zoneIndex >= this.zones.length - 1) {
      this.finishStage();
      return;
    }
    this.zoneIndex++;
    this.zoneState = 'walk';
    this.approval = 'none';
    fx.floatText(this, this.player.x, this.player.y - 130, this.studentMode ? '구역 통과!' : '구역 정리 완료!', '#7CFC9A', 22);
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
      // 남은 체력을 다음 스테이지로 넘긴다. 넘어져 KO 처리 전에 스테이지가 끝났으면(체력 0) 1로 버틴 것으로 본다
      r.hp = Math.max(1, this.player.hp);
      r.stages.push({
        stage: this.stageIndex + 1,
        grade: gradeStage(stats).grade,
        elapsed: this.elapsed,
        damage: this.damageTaken,
        maxCombo: this.maxCombo,
      });
    }
    // 한 판 시간에 더했으니 이 스테이지 몫은 비운다 — 게임오버·클리어 화면에서 HUD 시계가 이 스테이지 시간을 두 번 세지 않게
    // (이어하기를 하면 화면의 시각에서 그대로 +2분으로 이어진다)
    this.elapsed = 0;
    return stats;
  }

  private finishStage(): void {
    this.zoneState = 'done';
    this.finishing = true;
    // 배지 "무사고 근무": 이 스테이지를 받은 피해 없이 끝냈다
    if (this.damageTaken === 0) noteStageNoDamage();
    const stats = this.commitStage(true);
    const last = this.stageIndex >= this.stages.length - 1;
    if (last) this.run.cleared = true;
    // 학생 모드 마지막: 프레지던트 캉의 "검토 끝났습니다"를 조금 더 보여 준다
    const hold = last && this.studentMode ? 2800 : 1600;
    this.time.delayedCall(hold, () => {
      this.cameras.main.fadeOut(300, 0, 0, 0);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        if (last) this.scene.start('ending', { run: this.run });
        else this.scene.start('result', { run: this.run, stage: this.stageIndex, stats });
      });
    });
  }

  private gameOver(): void {
    const st = this.studentMode;
    this.over = true;
    this.overAt = this.time.now;
    this.goText.setVisible(false);
    this.commitStage(false);
    const sub = st
      ? `${this.zoneLabel}에서 행정에 밀려 졸업 서류를 내지 못했습니다`
      : `${this.zoneLabel}에서 민원에 밀려 퇴근하지 못했습니다`;
    // 이어하기 (결정 60): 한 판에 한 번. 이미 썼으면 단추가 없다
    const retry = !this.run.continued;
    const dy = retry ? -16 : 0;
    const objs: (Phaser.GameObjects.Rectangle | Phaser.GameObjects.Text)[] = [
      this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x000000, 0.6),
      this.add
        .text(GAME_W / 2, GAME_H / 2 - 50 + dy, st ? '학사경고' : '야근 확정…', {
          fontFamily: FONT,
          fontSize: '52px',
          fontStyle: 'bold',
          color: '#ff6b6b',
          stroke: '#111318',
          strokeThickness: 8,
        })
        .setOrigin(0.5),
      this.add
        .text(GAME_W / 2, GAME_H / 2 + 14 + dy, sub, {
          fontFamily: FONT,
          fontSize: '18px',
          color: '#ffffff',
        })
        .setOrigin(0.5),
    ];
    if (retry) {
      const y = GAME_H / 2 + 66;
      const label = this.pad ? '이 스테이지부터 다시 (+2분)' : 'C  이 스테이지부터 다시 (+2분)';
      objs.push(
        this.add.rectangle(GAME_W / 2, y, 400, 52, 0x1f4e79, 0.95).setStrokeStyle(3, 0xf5c542),
        this.add
          .text(GAME_W / 2, y, label, { fontFamily: FONT, fontSize: '21px', fontStyle: 'bold', color: '#ffffff' })
          .setOrigin(0.5),
      );
      this.retryRect = new Phaser.Geom.Rectangle(GAME_W / 2 - 200, y - 26, 400, 52);
    }
    const prompt = this.pad
      ? retry
        ? '다른 곳을 탭하면 이름 남기기'
        : '화면을 탭해서 이름 남기기'
      : 'Enter 이름 남기기   ·   R 처음부터 다시';
    objs.push(
      this.add
        .text(GAME_W / 2, GAME_H / 2 + (retry ? 128 : 70), prompt, {
          fontFamily: FONT,
          fontSize: '20px',
          fontStyle: 'bold',
          color: '#f5c542',
        })
        .setOrigin(0.5),
    );
    for (const o of objs) o.setScrollFactor(0).setDepth(2600);
  }

  private toRecord(): void {
    this.scene.start('record', { run: this.run });
  }

  /**
   * 이어하기 (결정 60, 한 판에 한 번): 이 스테이지를 처음부터 다시 한다.
   * 게임 속 시계는 되돌리지 않는다 — 실패한 시도의 시간은 gameOver의 commitStage가 run.elapsed에 이미 더했고, 벌점 2분을 더한다.
   * 목숨 3개·체력 가득. 손에 든 무기·아이템 효과는 2D에서 스테이지마다 비운 채 시작하므로 처음 상태와 같다.
   * 이 스테이지에서 돌발 방문이 나왔다가 끝나지 않았으면 다시 나온다 (아직 안 나왔으면 원래대로 나온다).
   */
  private continueStage(): void {
    const r = this.run;
    if (r.continued) return;
    r.continued = true;
    r.penaltyMin += RETRY_PENALTY;
    r.lives = 3;
    r.hp = undefined;
    if (this.visitor && this.visitor.outcome === 'none') r.visitDone = false;
    this.retryRect = null;
    this.scene.restart({ run: r, stage: this.stageIndex });
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

  /** 맞힌 자리에 찍히는 도장 글자. 학생 모드: 사람(창구 직원·보스)은 "설득", 행정 사물은 "통과" */
  private hitLabel(e: Enemy): string {
    if (e.kind === 'visit') return '결재';
    if (!this.studentMode) return '처리';
    return e.persuadable ? '설득' : '통과';
  }

  /** 플레이어 공격 판정. 깊이(y) 차이가 DEPTH_RANGE 안이고 앞쪽 사거리 안이면 맞는다. */
  resolvePlayerAttack(p: Player, def: AttackDef, hitSet: Set<Fighter>): number {
    let hits = 0;
    // 인물 장점 "처리 위력 +10%": 맨손·도장 처리(점프 공격 포함, 보스 결재 진행도). 든 무기로 휘두르는 것은 그대로
    const dmg = def.bare || def === JUMP_ATTACK ? def.dmg * this.perk.power : def.dmg;
    for (const e of this.enemies) {
      if (hitSet.has(e) || !e.hittable) continue;
      if (Math.abs(e.y - p.y) > DEPTH_RANGE) continue;
      const dx = (e.x - p.x) * p.facing;
      if (dx < -8 || dx > def.reach + e.halfW * 0.5) continue;
      if (Math.abs(p.z - e.z) > def.zReach) continue;
      hitSet.add(e);
      // 인감 도장(출석 스티커): 맨손 공격이 잡몹만 넘어뜨린다 (중간보스·보스·사람은 그대로)
      const knockdown = def.knockdown || (def.bare === true && p.sealT > 0 && ORDINARY.has(e.kind));
      if (e.takeHit({ dmg, dir: p.facing, kb: def.kb, knockdown, tag: def.tag })) {
        hits++;
        fx.stampMark(this, e.x - p.facing * 4, e.y - e.z - Math.min(e.height, 70) * 0.6, this.hitLabel(e));
        if (this.studentMode && e.persuadable && Math.random() < 0.3) this.persuadeText(e);
      }
    }
    this.meleeProps(p, def, dmg);
    if (this.debug) this.debugBoxes.push({ x: p.x, y: p.y, facing: p.facing, reach: def.reach, ttl: 0.12 });
    if (hits > 0) this.addCombo(hits, def.knockdown);
    return hits;
  }

  /** 던질 때 같은 상자·경비원은 한 번만 맞는다. key = 그 던진 무기의 hitSet */
  private touchOnce(key: object, target: object): boolean {
    let set = this.touched.get(key);
    if (!set) {
      set = new Set();
      this.touched.set(key, set);
    }
    if (set.has(target)) return false;
    set.add(target);
    return true;
  }

  /** 플레이어의 공격이 상자(부서진다)나 경비원(인사부터 하라며 무기를 안 준다)에 닿았는지. 한 번 휘두르기에 한 번만 */
  private meleeProps(p: Player, def: AttackDef, dmg: number): void {
    if (p.z > def.zReach) return;
    const inReach = (x: number, y: number, halfW: number) => {
      const dx = (x - p.x) * p.facing;
      return Math.abs(y - p.y) <= DEPTH_RANGE && dx >= -8 && dx <= def.reach + halfW * 0.5;
    };
    const fresh = (target: object) => {
      if (this.swingHits.get(target) === p.swing) return false;
      this.swingHits.set(target, p.swing);
      return true;
    };
    for (const c of this.crates) {
      if (!c.removed && inReach(c.x, c.y, c.halfW) && fresh(c)) this.hitCrate(c, dmg, p.facing);
    }
    for (const g of this.givers) {
      if (g.kind === 'guard' && !g.removed && inReach(g.x, g.y, g.halfW) && fresh(g)) g.rudeHit();
    }
  }

  /** 던진 무기가 상자·경비원에 닿았는지. 부딪힌 무기는 떨어진다 (사원증은 꿰뚫고, 서류 뭉치는 터진다) */
  private projectileProps(pr: Projectile): void {
    const dir = Math.sign(pr.vx) || 1;
    const hits = (x: number, y: number, halfW: number, height: number) =>
      Math.abs(pr.y - y) <= DEPTH_RANGE && Math.abs(pr.x - x) <= pr.halfW + halfW && pr.z <= height + 10;
    const stop = (): boolean => {
      // 돌발 방문 보상(장갑·그래프)은 상자도 부수고 그대로 지나간다
      if (pr.pierce) return false;
      if (pr.explodes) {
        this.explode(pr.x, pr.y, 90, this.blast, this.studentMode ? '따르릉!' : '펑!');
        pr.destroy();
        return true;
      }
      if (!pr.returnTo) {
        pr.destroy();
        return true;
      }
      return false;
    };
    for (const c of this.crates) {
      if (c.removed || !hits(c.x, c.y, c.halfW, c.height) || !this.touchOnce(pr.hitSet, c)) continue;
      this.hitCrate(c, pr.dmg, dir);
      if (stop()) return;
    }
    for (const g of this.givers) {
      if (g.kind !== 'guard' || g.removed || !hits(g.x, g.y, g.halfW, g.height) || !this.touchOnce(pr.hitSet, g)) continue;
      g.rudeHit();
      if (stop()) return;
    }
  }

  /** 상자를 친다. 부서지면 식권(25%)이나 먹을 것이 튀어나온다 */
  private hitCrate(c: Crate, dmg: number, dir: number): void {
    if (!c.hit(dmg, dir)) return;
    const st = this.studentMode;
    fx.floatText(this, c.x, c.y - 84, st ? '수강편람 사이에서 뭔가 떨어졌다!' : '조기출근 박스 개봉!', '#ffe066', 18);
    const r = Math.random();
    const kind: PickupKind = r < 0.25 ? 'mealticket' : r < 0.5 ? 'donkatsu' : r < 0.8 ? 'gimbap' : 'americano';
    const left = this.cameras.main.scrollX;
    const tx = Phaser.Math.Clamp(c.x + dir * 36, left + 40, left + GAME_W - 40);
    const ty = Phaser.Math.Clamp(c.y + 8, FLOOR_TOP + 6, FLOOR_BOTTOM - 6);
    this.pickups.push(new Pickup(this, kind, tx, ty).tossFrom(c.x, c.y, 34, 0.45, 60));
  }

  /** 학생 모드: 사람을 맞히면 가끔 "설득" 말이 떠오른다 */
  private persuadeText(e: Enemy): void {
    const lines = ['설득!', '반려 취소!', '한 번만 봐 주세요!', '서류 다 있어요!', '검토 부탁드려요!'];
    fx.floatText(this, e.x, e.y - e.z - e.height * e.baseScale - 20, lines[Math.floor(Math.random() * lines.length)], '#9fd3ff', 16);
  }

  private addCombo(hits: number, heavy: boolean): void {
    this.hitstop = heavy ? 0.09 : 0.05;
    // 인물 장점 "필살기 충전 +15%": 맞힐 때 차는 양 (보조배터리 +50은 그대로)
    this.player.sp = Math.min(100, this.player.sp + 7 * hits * this.perk.special);
    this.bumpCombo(hits);
    if (heavy) this.cameras.main.shake(90, 0.005);
  }

  /** 연속 처리 수를 올린다 (1.2초 안에 다음 처리가 이어지면 계속, 맞으면 끊긴다). 오를 때마다 배지 "민원 처리 달인"(30연속)을 본다 */
  private bumpCombo(n: number): void {
    if (n <= 0) return;
    this.combo += n;
    this.comboT = 1.2;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    noteCombo(this.combo);
  }

  private updateProjectiles(dt: number): void {
    const left = this.cameras.main.scrollX;
    const p = this.player;
    for (const pr of this.projectiles) {
      pr.update(dt);
      if (pr.removed) continue;
      // 사원증·학생증: 돌아와서 손에 잡힌다
      if (pr.returnTo && pr.owner === 'player') {
        const caught = pr.returning && Math.abs(pr.x - p.x) < 28;
        if (caught || pr.expired) {
          // 취업률 상승 그래프: 한 번 던지면 돌아와서 사라진다
          if (pr.weaponId === 'graph') {
            fx.dust(this, pr.x, pr.y);
            pr.destroy();
            continue;
          }
          // 날아가 있는 동안 다른 물건으로 바꿔 들었으면 사원증은 발밑에 떨어진다
          if (p.weapon?.def.boomerang) p.catchCard();
          else this.dropCard(pr.x, p.y);
          pr.destroy();
          continue;
        }
      } else if (pr.returnTo) {
        // 프레지던트 캉의 학사모: 돌아와 손에 잡히면 사라진다
        if ((pr.returning && Math.abs(pr.x - pr.returnTo.x) < 30) || pr.expired) {
          pr.destroy();
          continue;
        }
      } else if (pr.expired || pr.x < left - 80 || pr.x > left + GAME_W + 80) {
        if (pr.explodes) this.explode(pr.x, pr.y, 90, this.blast, this.studentMode ? '따르릉!' : '펑!');
        pr.destroy();
        continue;
      }
      if (pr.owner === 'enemy') {
        const near = Math.abs(pr.y - p.y) <= DEPTH_RANGE && Math.abs(pr.x - p.x) <= pr.halfW + p.halfW;
        // 학사모(부메랑)는 가고 올 때 한 번씩만 맞고 그대로 날아간다
        const boomerang = !!pr.returnTo;
        if (near && pr.z >= p.z - 10 && pr.z <= p.z + 80 && !(boomerang && pr.hitSet.has(p))) {
          const dir = Math.sign(pr.vx) || 1;
          const guarding =
            !!p.weapon?.def.guard && p.facing === -dir && ['idle', 'walk', 'wattack'].includes(p.state);
          const kb = pr.tag === 'sonic' ? 220 : 120;
          if (p.takeHit({ dmg: pr.dmg, dir, kb, knockdown: pr.knockdown })) {
            fx.hitSpark(this, p.x, p.y - p.z - 60);
            if (boomerang) pr.hitSet.add(p);
            else pr.destroy();
          } else if (guarding || p.shieldPopT > 0) {
            // 결재판으로 막았거나 연차 쿠폰(공결 확인서)에 막혔다
            if (boomerang) pr.hitSet.add(p);
            else pr.destroy();
          }
        }
        continue;
      }
      // 권학생이 부른 총학 집행부가 던진 물건을 막는다 (사원증·학생증은 지나간다)
      if (!pr.returnTo && !pr.pierce) {
        const aide = this.aides.find((a) => a.stops(pr.x, pr.y, pr.z, pr.halfW));
        if (aide) {
          aide.blockedText();
          if (pr.explodes) this.explode(pr.x, pr.y, 90, this.blast, this.studentMode ? '따르릉!' : '펑!');
          pr.destroy();
          continue;
        }
      }
      for (const e of this.enemies) {
        if (pr.hitSet.has(e) || !e.hittable) continue;
        if (Math.abs(pr.y - e.y) > DEPTH_RANGE || Math.abs(pr.x - e.x) > pr.halfW + e.halfW) continue;
        if (pr.z < e.z - 10 || pr.z > e.z + e.height + 10) continue;
        pr.hitSet.add(e);
        // 돌발 방문 보상(장갑·그래프): 잡몹은 꿰뚫으며 처리, 사람은 도장 4발만큼 결재 진행
        if (pr.pierce) {
          this.rewardHit(pr, e);
          continue;
        }
        // 김부재중 교수: 정면으로 날아온 것은 결재판으로 되받아친다
        if (e instanceof BujaeBoss && e.canReflect(Math.sign(pr.vx) || 1)) {
          this.reflect(pr, e);
          break;
        }
        const hit = e.takeHit({
          dmg: pr.dmg,
          dir: Math.sign(pr.vx) || 1,
          kb: 0,
          knockdown: pr.knockdown,
          tag: pr.tag,
          thrown: true,
        });
        if (hit) {
          const label = this.studentMode || e.kind === 'visit' ? this.hitLabel(e) : pr.tag === 'notice' ? '부착' : '처리';
          fx.stampMark(this, e.x, e.y - e.z - Math.min(e.height, 70) * 0.6, label);
          this.addCombo(1, true);
        }
        if (pr.explodes) {
          this.explode(pr.x, pr.y, 90, this.blast, this.studentMode ? '따르릉!' : '펑!');
          pr.destroy();
          break;
        }
        if (!pr.returnTo) {
          // 막혔든 맞았든 부딪힌 물건은 떨어진다 (사원증은 꿰뚫고 지나간다)
          pr.destroy();
          break;
        }
      }
      if (!pr.removed) this.projectileProps(pr);
    }
    this.projectiles = this.projectiles.filter((x) => !x.removed);
  }

  /** 김부재중 교수가 던진 무기를 결재판으로 되받아친다 */
  private reflect(pr: Projectile, boss: BujaeBoss): void {
    const dir = -(Math.sign(pr.vx) || 1);
    if (pr.returnTo) this.player.catchCard();
    const obj = pr.weaponId ? weaponIcon(this, pr.weaponId, this.studentMode) : createDemandPaper(this);
    pr.destroy();
    this.projectiles.push(
      new Projectile(this, {
        x: boss.x + dir * 40,
        y: boss.y,
        z: 52,
        vx: dir * 520,
        owner: 'enemy',
        dmg: 1,
        knockdown: false,
        halfW: 20,
        ttl: 2.4,
        obj,
        spin: 18 * dir,
      }),
    );
    fx.stampMark(this, boss.x + dir * 30, boss.y - 90, '반사');
    this.cameras.main.shake(70, 0.004);
    boss.onReflected();
  }

  private updateHazards(dt: number): void {
    const p = this.player;
    for (const h of this.hazards) {
      h.update(dt);
      if (!h.justLanded) continue;
      this.cameras.main.shake(70, 0.004);
      fx.dust(this, h.x, h.y);
      if (h.mark) this.floorImprint(h.x, h.y, h.mark, h.radius);
      if (h.owner === 'enemy') {
        if (Math.abs(p.x - h.x) <= h.radius && Math.abs(p.y - h.y) <= h.radius * 0.4 && p.z < 30) {
          p.takeHit({ dmg: h.dmg, dir: p.x >= h.x ? 1 : -1, kb: 120, knockdown: h.knockdown });
        }
      } else {
        let hits = 0;
        const label = this.studentMode ? spellById(this.run.skill).stamp : '규정';
        for (const e of this.enemies) {
          if (!e.hittable || Math.abs(e.x - h.x) > h.radius + e.halfW || Math.abs(e.y - h.y) > h.radius * 0.45) continue;
          const hp0 = e.hp;
          if (e.takeHit({ dmg: h.dmg, dir: e.x >= h.x ? 1 : -1, kb: 0, knockdown: true, stamps: h.dmg })) {
            hits++;
            fx.stampMark(this, e.x, e.y - e.z - Math.min(e.height, 70) * 0.6, label);
            // 플레이어 쪽 낙하물은 필살기(규정집 낙하 / ЗАЧЁТ!)뿐이다
            this.countSpecialKill(e, hp0);
          }
        }
        if (hits) this.addCombo(hits, true);
      }
    }
    this.hazards = this.hazards.filter((h) => !h.removed);
  }

  /** 거대 도장이 바닥에 남긴 자국 (곧 사라진다) */
  private floorImprint(x: number, y: number, label: string, r: number): void {
    const c = this.add.container(x, y).setDepth(-3);
    c.add(this.add.rectangle(0, 0, r * 1.7, r * 0.55, 0xd0202f, 0.2).setStrokeStyle(3, 0xd0202f, 0.8));
    c.add(
      this.add
        .text(0, 0, label, { fontFamily: FONT, fontSize: `${Math.round(r * 0.4)}px`, fontStyle: 'bold', color: '#d0202f' })
        .setOrigin(0.5)
        .setScale(1, 0.55),
    );
    this.tweens.add({ targets: c, alpha: 0, delay: 700, duration: 600, onComplete: () => c.destroy() });
  }

  /** 인물 장점 "아이템 시간 +30%"를 적용한 지속 시간 (초) */
  private buffSec(sec: number): number {
    return sec * this.perk.buff;
  }

  /** 돌발 방문 보상 설명 (띠 아래 줄): 아이템 시간 장점이면 초 수를 늘려 쓴다 */
  private rewardDesc(reward: VisitReward): string {
    const d = REWARD_DESC_2D[reward];
    const secs: Partial<Record<VisitReward, number>> = { clicker: CLICKER_SEC, cheer: CHEER_SEC, plaque: PLAQUE_SEC, hush: HUSH_SEC };
    const sec = secs[reward];
    if (sec === undefined || this.perk.buff === 1) return d;
    return d.replace(`${sec}초`, `${Math.round(this.buffSec(sec))}초`);
  }

  private updatePickups(dt: number): void {
    const p = this.player;
    for (const it of this.pickups) {
      it.update(dt);
      if (it.removed || it.isWeapon || !it.landed) continue;
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
          p.coffeeT = this.buffSec(10);
          fx.floatText(this, p.x, p.y - 128, this.studentMode ? '아메리카노! 공격 속도 UP' : '아메리카노! 처리 속도 UP', '#ffd27f', 18);
          break;
        case 'mealticket':
          p.hp = p.maxHp;
          fx.floatText(this, p.x, p.y - 128, '식권! 체력 모두 회복', '#7CFC9A', 18);
          break;
        case 'battery':
          p.sp = Math.min(100, p.sp + 50);
          fx.floatText(this, p.x, p.y - 128, '보조배터리! 필살기 게이지 +50', '#f5c542', 18);
          break;
        case 'shield':
          p.shieldT = this.buffSec(SHIELD_SEC);
          fx.floatText(
            this,
            p.x,
            p.y - 128,
            this.studentMode ? '공결 확인서! 다음 한 번은 안 맞아요' : '연차 쿠폰! 다음 한 번은 안 맞아요',
            '#9fd3ff',
            18,
          );
          break;
        case 'shuttle':
          p.shuttleT = this.buffSec(SHUTTLE_SEC);
          fx.floatText(this, p.x, p.y - 128, `셔틀버스 시간표! ${Math.round(p.shuttleT)}초 동안 빨라져요`, '#ffd27f', 18);
          break;
        case 'capture':
          this.freezeMobs(this.buffSec(CAPTURE_SEC));
          fx.floatText(this, p.x, p.y - 128, '단톡방 공지 캡처! 잡몹이 잠깐 멈춰요', '#9fd3ff', 18);
          break;
        case 'seal':
          p.sealT = this.buffSec(SEAL_SEC);
          fx.floatText(
            this,
            p.x,
            p.y - 128,
            `${this.studentMode ? '출석 스티커' : '인감 도장'}! ${Math.round(p.sealT)}초 동안 맨손 공격이 넘어뜨려요`,
            '#ff9f9f',
            18,
          );
          break;
        case 'work':
          if (!p.startReport(1.6, '일거리였다… 검토 중')) continue;
          break;
        case 'petition':
          fx.floatText(this, p.x, p.y - 128, '단체 서명지 접수 완료!', '#7CFC9A', 18);
          break;
        case 'gradeA':
          p.heal(3);
          fx.floatText(this, p.x, p.y - 128, 'A+ 성적표! 체력 +3', '#7CFC9A', 18);
          break;
        case 'gradeF':
          if (!p.freeze(1.4, 'F 학점…')) continue;
          this.freezeNote = 'F 학점… 정정 기간이 아닙니다 (잠깐 멈춤)';
          break;
        case 'visitBox':
          if (it.reward) this.openVisitBox(it.reward, it.x, it.y);
          break;
      }
      sound.play('pickup');
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

  /** 무기 줍기: 발밑 근처의 무기나 넘어진 서류 뭉치(마감 시계)를 집는다 */
  tryPickup(p: Player): boolean {
    const bomb = this.enemies.find(
      (e): e is DocBomb => e instanceof DocBomb && e.pickable && Math.abs(e.x - p.x) < 54 && Math.abs(e.y - p.y) < 26,
    );
    if (bomb) {
      p.equip('bomb', bomb.fuse);
      bomb.destroy();
      const text = this.studentMode ? '마감 시계를 들었다! 빨리 던지세요' : '서류 뭉치를 들었다! 빨리 던지세요';
      fx.floatText(this, p.x, p.y - 124, text, '#ffe066', 16);
      return true;
    }
    const it = this.pickups.find((i) => i.isWeapon && i.landed && Math.abs(i.x - p.x) < 44 && Math.abs(i.y - p.y) < 24);
    if (!it || !isWeaponId(it.kind)) return false;
    p.equip(it.kind);
    it.destroy();
    fx.floatText(this, p.x, p.y - 124, `${weaponName(WEAPONS[it.kind], this.studentMode)} 장착!`, '#9fd3ff', 18);
    return true;
  }

  /** 발밑에 주울 것이 있는지 (무기·넘어진 서류 뭉치) — 터치 버튼 이름과 사원증 바꿔 들기에 쓴다 */
  pickableAt(p: Player): boolean {
    return (
      this.enemies.some((e) => e instanceof DocBomb && e.pickable && Math.abs(e.x - p.x) < 54 && Math.abs(e.y - p.y) < 26) ||
      this.pickups.some((i) => i.isWeapon && i.landed && !i.removed && Math.abs(i.x - p.x) < 44 && Math.abs(i.y - p.y) < 24)
    );
  }

  /** 사원증(학생증)을 든 채 다른 물건 위에서 줍기: 사원증을 발밑에 내려놓고 그 물건을 든다.
   *  사원증이 날아가 있는 중이면 돌아올 때 바닥에 떨어진다 (updateProjectiles). */
  swapCard(p: Player): boolean {
    const card = p.weapon;
    if (!card?.def.boomerang || !this.pickableAt(p)) return false;
    p.weapon = null;
    if (!this.tryPickup(p)) {
      p.weapon = card;
      return false;
    }
    if (!card.inFlight) this.dropCard(p.x - p.facing * 34, p.y);
    return true;
  }

  private dropCard(x: number, y: number): void {
    const left = this.cameras.main.scrollX;
    const cx = Phaser.Math.Clamp(x, left + 40, left + GAME_W - 40);
    const cy = Phaser.Math.Clamp(y, FLOOR_TOP + 6, FLOOR_BOTTOM - 6);
    this.pickups.push(new Pickup(this, 'idcard', cx, cy, 0, this.studentMode));
  }

  // ---------- 경비원 · 도서 무인 대출기 · 상자 ----------

  /** 인사(대여)할 경비원·대출기: 가깝고, 발밑에 주울 것이 없고, 무기를 들었으면 그쪽을 보고 있을 때 */
  private greetTarget(p: Player): Giver | null {
    if (p.state !== 'idle' && p.state !== 'walk') return null;
    if (this.pickableAt(p)) return null;
    let best: Giver | null = null;
    for (const g of this.givers) {
      if (!g.near(p)) continue;
      const facingIt = Math.abs(g.x - p.x) < 16 || Math.sign(g.x - p.x) === p.facing;
      if (p.weapon && !p.weapon.inFlight && !facingIt) continue;
      if (!best || Math.abs(g.x - p.x) < Math.abs(best.x - p.x)) best = g;
    }
    return best;
  }

  /** L(줍기 버튼): 경비원에게 인사하면 무기를 준다 / 대출기에서 대여하면 무기가 나온다 */
  tryGreet(p: Player): boolean {
    const g = this.greetTarget(p);
    if (!g) return false;
    const st = this.studentMode;
    p.startGreet(g.x >= p.x ? 1 : -1, st ? null : GIVER_TEXT.hello);
    g.face(p.x);
    if (st) {
      if (g.cooldown > 0) {
        g.later(0.2, () => g.say(GIVER_TEXT.kioskCooldown, 1.3));
        return true;
      }
      g.cooldown = GIFT_COOLDOWN;
      g.later(0.3, () => {
        g.blink();
        g.say(GIVER_TEXT.kioskGive, 1.6);
        this.giveWeapon(g);
      });
      return true;
    }
    if (g.refuseT > 0) {
      g.later(0.5, () => g.say(GIVER_TEXT.guardRefuse, 1.6));
      return true;
    }
    if (g.cooldown > 0) {
      g.later(0.5, () => g.say(GIVER_TEXT.guardCooldown, 1.4));
      return true;
    }
    g.cooldown = GIFT_COOLDOWN;
    g.later(0.45, () => {
      if (g.refuseT > 0) {
        // 인사하고 나서 바로 건드렸다
        g.cooldown = 0;
        return;
      }
      g.bow();
      g.say(GIVER_TEXT.guardGive, 2.0);
      this.giveWeapon(g);
    });
    return true;
  }

  /** 무기를 건넨다: 손이 비어 있으면 바로 들려 주고, 아니면 발밑에 떨어뜨린다 */
  private giveWeapon(g: Giver): void {
    const p = this.player;
    const st = this.studentMode;
    const id = g.pickItem();
    if (!p.weapon && p.state !== 'ko') {
      const h = g.handPos;
      const icon = weaponIcon(this, id, st).setPosition(h.x, h.y - h.z).setDepth(1500);
      this.tweens.add({ targets: icon, x: p.x, y: p.y - 60, scale: 0.7, duration: 220, ease: 'Sine.Out', onComplete: () => icon.destroy() });
      p.equip(id);
      fx.floatText(this, p.x, p.y - 124, `${weaponName(WEAPONS[id], st)} 장착!`, '#9fd3ff', 18);
      return;
    }
    const left = this.cameras.main.scrollX;
    const dir = g.x >= p.x ? 1 : -1;
    const tx = Phaser.Math.Clamp(p.x + dir * 34, left + 40, left + GAME_W - 40);
    const ty = Phaser.Math.Clamp(p.y + 6, FLOOR_TOP + 6, FLOOR_BOTTOM - 6);
    this.tossItem(id, g, tx, ty, 0);
  }

  private updateProps(dt: number): void {
    const p = this.player;
    for (const g of this.givers) g.update(dt, p);
    this.givers = this.givers.filter((g) => !g.removed);
    if (this.supplyPending && !this.givers.some((g) => g.courier)) this.supplyPending = false;
    for (const c of this.crates) c.update(dt);
    this.crates = this.crates.filter((c) => !c.removed);
    // 처음 경비원(대출기)이 보이면 쓰는 법을 알려 준다 (다른 안내 띠와 겹치지 않게)
    if (!this.giverHinted && this.elapsed > 2.8 && fx.bannerFree(this)) {
      const g = this.givers.find((x) => !x.courier && x.inView());
      if (g) {
        this.giverHinted = true;
        const key = this.pad ? '(줍기 버튼)' : '(L)';
        const sub = this.studentMode
          ? `도서 무인 대출기에서 대여하면${key} 무기가 나옵니다`
          : `경비 선생님께 인사하면${key} 무기를 줍니다`;
        fx.banner(this, g.name, sub, 2800);
      }
    }
  }

  // ---------- 조력자 이벤트 ----------

  /** 맞고 체력이 바닥(최대의 25% 이하)으로 떨어지면 60% 확률로 조력자가 온다. 스테이지마다 한 번, 연출 중에는 안 온다.
   *  체력이 이어지므로 이미 바닥 체력으로 스테이지를 시작했으면 그 스테이지 첫 피격을 "떨어진 것"으로 친다 */
  private maybeCallHelpers(dmg: number): void {
    const p = this.player;
    const lim = p.maxHp * HELPER_HP;
    const primed = this.helperPrimed;
    this.helperPrimed = false;
    if (this.helperUsed || p.hp <= 0 || p.hp > lim || (p.hp + dmg <= lim && !primed)) return;
    if (this.over || this.finishing || this.bossDefeated || this.specialT >= 0 || this.zoneState === 'done') return;
    if (Math.random() >= HELPER_CHANCE) return;
    this.callHelpers();
  }

  /** 다른 주인공 2~3명(교직원: 동료 직원, 학생: 친구)이 화면 끝에서 달려온다 */
  callHelpers(): void {
    const st = this.studentMode;
    const p = this.player;
    this.helperUsed = true;
    this.helperT = 0;
    p.invuln = Math.max(p.invuln, HELPER_ARRIVE + 0.3);
    const lines = helperLines(st, (st ? studentHeroById(this.run.hero) : heroById(this.run.hero)).name);
    const pool: { name: string; look: HelperLook }[] = st
      ? STUDENT_HEROES.filter((h) => h.id !== this.run.hero).map((h) => ({ name: h.name, look: { student: true, look: h.look } }))
      : HEROES.filter((h) => h.id !== this.run.hero).map((h) => ({ name: h.name, look: { student: false, look: h.look } }));
    Phaser.Utils.Array.Shuffle(pool);
    const n = Math.min(pool.length, Math.random() < 0.5 ? 2 : 3);
    const left = this.cameras.main.scrollX;
    const first = p.x - left < GAME_W / 2 ? 1 : -1;
    const names: string[] = [];
    for (let i = 0; i < n; i++) {
      const side = i % 2 === 0 ? first : -first;
      const dist = i < 2 ? 130 : 240;
      const line = i < 2 ? lines[i] : lines[Math.floor(Math.random() * 2)];
      this.helpers.push(
        new Helper(this, {
          look: pool[i].look,
          name: pool[i].name,
          line,
          fromX: side > 0 ? left + GAME_W + 60 : left - 60,
          y: p.y + [-40, 40, 0][i],
          targetX: Phaser.Math.Clamp(p.x + side * dist, left + 60, left + GAME_W - 60),
          arriveIn: HELPER_ARRIVE - 0.05,
        }),
      );
      names.push(pool[i].name);
    }
    fx.banner(this, helperBanner(st), names.join(' · '), 2000);
  }

  private updateHelpers(dt: number): void {
    for (const h of this.helpers) h.update(dt, this.player.x);
    this.helpers = this.helpers.filter((h) => !h.removed);
    if (this.helperT < 0) return;
    this.helperT += dt;
    if (this.helperT >= HELPER_ARRIVE) {
      this.helperT = -1;
      this.helperEffect();
    }
  }

  /** 조력자 도착: 화면 안 잡몹은 모두 처리, 중간보스·보스는 조금만 깎고(끝내 주지는 않는다), 체력 회복 + 잠깐 무적 */
  private helperEffect(): void {
    const p = this.player;
    const st = this.studentMode;
    const left = this.cameras.main.scrollX;
    let processed = 0;
    for (const e of [...this.enemies]) {
      if (e.dead || e.removed || e.x < left - 10 || e.x > left + GAME_W + 10) continue;
      // 돌발 방문 상대(사람)는 조력자가 건드리지 않는다
      if (e instanceof Visitor) continue;
      const top = e.y - e.z - Math.min(e.height, 70) * 0.6;
      if (ORDINARY.has(e.kind)) {
        fx.stampMark(this, e.x, top, st ? '통과' : '처리');
        if (e instanceof DocBomb) e.destroy();
        else e.takeHit({ dmg: 99, dir: e.x >= p.x ? 1 : -1, kb: 0, knockdown: true, force: true });
        processed++;
        continue;
      }
      const floor = Math.max(1, Math.ceil(e.maxHp * HELPER_FLOOR));
      if (e.hp > floor) {
        e.hp = Math.max(floor, e.hp - Math.ceil(e.maxHp * HELPER_CHIP));
        e.rig.flash();
        fx.stampMark(this, e.x, top, this.hitLabel(e));
      }
    }
    this.bumpCombo(processed);
    const heal = Math.round(p.maxHp * HELPER_HEAL);
    p.heal(heal);
    p.invuln = Math.max(p.invuln, HELPER_INVULN);
    fx.floatText(this, p.x, p.y - 130, `체력 +${heal}`, '#7CFC9A', 20);
    this.cameras.main.flash(120, 255, 255, 255);
  }

  /** 잡몹을 처리하면 가끔 보조배터리·먹을 것·연차 쿠폰(공결 확인서)·셔틀버스 시간표·단톡방 공지 캡처·인감 도장(출석 스티커)을 떨어뜨린다 */
  private randomDrop(e: Enemy): void {
    let r = Math.random();
    let kind: PickupKind | null = null;
    if (r < DROP_BATTERY) kind = 'battery';
    else if ((r -= DROP_BATTERY) < DROP_FOOD) kind = Math.random() < 0.6 ? 'gimbap' : 'americano';
    else if ((r -= DROP_FOOD) < DROP_PERK * PERKS.length) kind = PERKS[Math.min(PERKS.length - 1, Math.floor(r / DROP_PERK))];
    if (!kind) return;
    const left = this.cameras.main.scrollX;
    const x = Phaser.Math.Clamp(e.x, left + 40, left + GAME_W - 40);
    const y = Phaser.Math.Clamp(e.y, FLOOR_TOP + 6, FLOOR_BOTTOM - 6);
    this.pickups.push(new Pickup(this, kind, x, y, 10, this.studentMode).tossFrom(e.x, e.y, 30, 0.4, 50));
  }

  /** 단톡방 공지 캡처: 살아 있는 잡몹을 모두 sec초 멈춘다 (중간보스·보스·사람은 그대로). 멈춘 수 */
  freezeMobs(sec: number): number {
    let n = 0;
    for (const e of this.enemies) {
      if (ORDINARY.has(e.kind) && e.freezeFor(sec)) n++;
    }
    return n;
  }

  throwWeapon(p: Player): void {
    const w = p.takeWeaponForThrow();
    if (!w) return;
    if (w.id === 'glove' || w.id === 'graph') {
      this.throwReward(p, w.id);
      if (w.id === 'glove' && !p.weapon) fx.floatText(this, p.x, p.y - 124, `${weaponName(w.def, this.studentMode)} 다 씀`, '#cfd6e3', 16);
      return;
    }
    const card = w.def.boomerang;
    // 인물 장점 "던지기 위력·거리 +20%": 피해와 날아가는 거리 (사원증은 되돌아오기 시작하는 거리)
    const k = this.perk.throw;
    this.projectiles.push(
      new Projectile(this, {
        x: p.x + p.facing * 26,
        y: p.y,
        z: 52,
        vx: p.facing * (card ? 560 : 640),
        owner: 'player',
        dmg: w.def.throwDmg * k,
        knockdown: !card,
        tag: w.id === 'notice' ? 'notice' : undefined,
        halfW: 24,
        ttl: card ? 3 : 1.3 * k,
        obj: weaponIcon(this, w.id, this.studentMode),
        spin: (card ? 22 : 16) * p.facing,
        returnTo: card ? p : undefined,
        range: card && k !== 1 ? CARD_RANGE * k : undefined,
        explodes: w.id === 'bomb',
        weaponId: w.id,
      }),
    );
  }

  /** 던진 서류 뭉치(마감 시계)가 터질 때 잡몹이 받는 피해 (던지기 장점이면 +20%) */
  private get blast(): { player: number; enemies: number } {
    return { player: 0, enemies: 3 * this.perk.throw };
  }

  /** 마감 서류 뭉치(마감 시계)를 너무 오래 들고 있었다 */
  explodeInHand(p: Player): void {
    this.explode(p.x, p.y, 80, { player: 2, enemies: 2 }, this.studentMode ? '손에서 울렸다!' : '손에서 터졌다!');
  }

  explode(x: number, y: number, r: number, dmg: { player: number; enemies: number }, text: string): void {
    const ring = this.add.ellipse(x, y - 20, r * 2, r * 1.2, 0xff9f43, 0.7).setDepth(y + 2);
    this.tweens.add({ targets: ring, scaleX: 1.4, scaleY: 1.4, alpha: 0, duration: 300, onComplete: () => ring.destroy() });
    fx.floatText(this, x, y - 80, text, '#ffb86b', 22);
    sound.play('boom', 0.8);
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
    // 폭발은 상자도 부순다
    for (const c of this.crates) {
      if (!c.removed && Math.abs(c.x - x) <= r + c.halfW && Math.abs(c.y - y) <= r * 0.45) this.hitCrate(c, 2, c.x >= x ? 1 : -1);
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

  /** 줄 서 있는 것(문의 줄, 연좌 농성, 서류 탑)에 부딪히면 밀려난다 */
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

  /** 박학과장: "그건 선생님이 알아서 하세요" 하며 메일 하나를 넘긴다 */
  passMail(x: number): void {
    const left = this.cameras.main.scrollX;
    const sx = Phaser.Math.Clamp(x, left + 40, left + GAME_W - 40);
    const tx = Phaser.Math.Clamp(this.player.x + (sx < this.player.x ? -120 : 120), left + 80, left + GAME_W - 80);
    this.enemies.push(new MailEnemy(this, sx, FLOOR_TOP + 6, tx));
    fx.floatText(this, sx, FLOOR_TOP - 90, '넘겨받은 민원', '#ffd27f', 15);
  }

  /** 최내놔 처장: 거미줄을 (x, y)에 던진다 (그림자 예고 → 바닥에 4초) */
  throwWeb(sup: Supervisor, x: number, y: number): void {
    const left = this.cameras.main.scrollX;
    const wx = Phaser.Math.Clamp(x, left + 70, left + GAME_W - 70);
    const wy = Phaser.Math.Clamp(y, FLOOR_TOP + 14, FLOOR_BOTTOM - 10);
    this.webs.push({ web: new Cobweb(this, sup.posX, sup.laneY - 80, wx, wy), sup });
  }

  /** 회의회의부총장: 플레이어 발밑에 회의 원을 그린다 */
  callMeeting(x: number, y: number): void {
    const c = this.add.container(x, y).setDepth(-3);
    const ring = this.add.ellipse(0, 0, 168, 60, 0x7c3aed, 0.25).setStrokeStyle(3, 0x7c3aed, 0.9);
    const t = this.add
      .text(0, 0, '회의 소집 — 원 밖으로!', { fontFamily: FONT, fontSize: '13px', fontStyle: 'bold', color: '#ffffff' })
      .setOrigin(0.5);
    c.add([ring, t]);
    this.meetings.push({ x, y, t: 0, obj: c });
  }

  /** 몰라몰라부총장: 간식 하나와 일거리 하나 */
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

  // ---------- 학생 모드: 창구 직원·보스 기믹 ----------

  /** 대기번호표에 쓸 다음 번호 ("087", "088", …) */
  nextTicketNo(): string {
    this.ticketNo++;
    return String(this.ticketNo).padStart(3, '0');
  }

  /** 김전략: 플레이어 주위에 빨간 순위 하락 화살표가 떨어진다 (하나는 플레이어 자리) */
  dropRankArrows(px: number, py: number, n: number): void {
    const left = this.cameras.main.scrollX;
    for (let i = 0; i < n; i++) {
      const aim = i === 0;
      const x = Phaser.Math.Clamp(px + (aim ? 0 : Phaser.Math.Between(-170, 170)), left + 50, left + GAME_W - 50);
      const y = Phaser.Math.Clamp(py + (aim ? 0 : Phaser.Math.Between(-50, 50)), FLOOR_TOP + 6, FLOOR_BOTTOM - 6);
      this.hazards.push(new Hazard(this, { x, y, delay: 0.9 + i * 0.22, radius: 40, owner: 'enemy', dmg: 1, obj: createRankArrow(this) }));
    }
  }

  /** 최도서관: 플레이어 깊이(y)로 책수레를 밀어 보낸다 (바닥을 굴러서 점프로 넘는다) */
  pushBookCart(from: Enemy, y: number): void {
    const f = from.facing;
    this.projectiles.push(
      new Projectile(this, {
        x: from.x + f * 40,
        y: Phaser.Math.Clamp(y, FLOOR_TOP + 6, FLOOR_BOTTOM - 6),
        z: 0,
        vx: f * 330,
        owner: 'enemy',
        dmg: 1,
        knockdown: false,
        tag: 'cart',
        halfW: 30,
        ttl: 3.6,
        obj: createBookCart(this),
      }),
    );
  }

  /** 권학생: 총학 집행부 둘이 화면 끝에서 달려와 권학생 앞(플레이어 쪽)에 선다 */
  callAides(staff: Enemy, px: number): void {
    const left = this.cameras.main.scrollX;
    const dir = Math.sign(px - staff.x) || 1;
    const fromX = dir > 0 ? left + GAME_W + 60 : left - 60;
    const roles = ['protest', 'decibel'] as const;
    roles.forEach((role, i) => this.aides.push(new ChonghakAide(this, role, fromX + dir * i * 50, staff, i)));
  }

  hasAides(): boolean {
    return this.aides.some((a) => !a.removed);
  }

  /** 나진취: 플레이어 양옆에 빨간 첨삭 선을 긋는다 */
  drawPenLines(px: number, life: number): void {
    const left = this.cameras.main.scrollX;
    for (const side of [-1, 1]) {
      const x = px + side * Phaser.Math.Between(120, 170);
      if (x < left + 50 || x > left + GAME_W - 50) continue;
      this.penLines.push(new PenLine(this, x, life));
    }
  }

  /** 김국제: 여권·서류를 부채꼴로 던진다 */
  fireFan(from: Enemy, n: number): void {
    const f = from.facing;
    for (let i = 0; i < n; i++) {
      const k = n === 1 ? 0 : i / (n - 1) - 0.5;
      this.projectiles.push(
        new Projectile(this, {
          x: from.x + f * 30,
          y: from.y,
          z: 44,
          vx: f * 300,
          vy: k * 300,
          owner: 'enemy',
          dmg: 1,
          knockdown: false,
          halfW: 14,
          ttl: 3,
          obj: createPassportIcon(this, i % 2 === 1),
          spin: 6 * f,
        }),
      );
    }
  }

  /** 김학종지: 대기번호표 줄을 부른다 */
  summonTickets(n: number): void {
    const { x, tx, y } = this.edgeSpawn();
    this.spawnQueue(x, y, tx, n);
    const left = this.cameras.main.scrollX;
    fx.floatText(this, Phaser.Math.Clamp(x, left + 80, left + GAME_W - 80), y - 70, '번호표 발행!', '#9fd3ff', 18);
  }

  countSlips(): number {
    return this.enemies.filter((e) => e instanceof QueueSlip && !e.dead).length;
  }

  /** 창구 직원이 퇴근하면 그 사람이 남긴 기믹을 거둔다 */
  onWindowStaffDone(e: WindowStaff): void {
    if (e.kind === 'jinchwi') for (const l of this.penLines) l.destroy();
  }

  /** 한학고 학장: 플레이어 양옆에 성적표 둘 (A+ 하나, F 하나 — 어느 쪽인지는 무작위) */
  dropGrades(fromX: number, px: number, py: number): void {
    const left = this.cameras.main.scrollX;
    const kinds: PickupKind[] = Math.random() < 0.5 ? ['gradeA', 'gradeF'] : ['gradeF', 'gradeA'];
    kinds.forEach((k, i) => {
      const x = Phaser.Math.Clamp(px + (i === 0 ? -1 : 1) * Phaser.Math.Between(70, 120), left + 60, left + GAME_W - 60);
      const y = Phaser.Math.Clamp(py + Phaser.Math.Between(-24, 24), FLOOR_TOP + 8, FLOOR_BOTTOM - 8);
      this.pickups.push(new Pickup(this, k, x, y, 9, true).tossFrom(fromX, y, 70, 0.5, 60));
    });
  }

  hasGrades(): boolean {
    return this.pickups.some((i) => (i.kind === 'gradeA' || i.kind === 'gradeF') && !i.removed);
  }

  /** 전필수 학과장: 수강편람 탑을 세운다 */
  spawnDocTower(x: number, y: number): DocTower {
    const t = new DocTower(this, x, y);
    this.enemies.push(t);
    fx.dust(this, x, y);
    return t;
  }

  /** 거대 도장 내리찍기 (전필수 학과장 "재수강", 프레지던트 캉 "보류"·"재검토") */
  slamStamp(x: number, y: number, label: string, delay: number): void {
    const left = this.cameras.main.scrollX;
    this.hazards.push(
      new Hazard(this, {
        x: Phaser.Math.Clamp(x, left + 60, left + GAME_W - 60),
        y: Phaser.Math.Clamp(y, FLOOR_TOP + 6, FLOOR_BOTTOM - 6),
        delay,
        radius: 62,
        owner: 'enemy',
        dmg: 2,
        knockdown: true,
        mark: label,
        obj: createBigStamp(this, label),
      }),
    );
  }

  /** 프레지던트 캉 MOU 서명: 플레이어를 지나는 긴 서명선 (cross = 2페이즈, 두 줄이 엇갈린다) */
  signLines(px: number, py: number, cross: boolean): void {
    const left = this.cameras.main.scrollX;
    const clampY = (y: number) => Phaser.Math.Clamp(y, FLOOR_TOP + 4, FLOOR_BOTTOM - 4);
    const x1 = Math.max(left + 30, px - 300);
    const x2 = Math.min(left + GAME_W - 30, px + 300);
    if (cross) {
      this.signs.push(new SignLine(this, x1, clampY(py - 60), x2, clampY(py + 60)));
      this.signs.push(new SignLine(this, x1, clampY(py + 60), x2, clampY(py - 60)));
    } else {
      const tilt = Phaser.Math.Between(-24, 24);
      this.signs.push(new SignLine(this, x1, clampY(py - tilt), x2, clampY(py + tilt)));
    }
  }

  /** 프레지던트 캉 기념 촬영: 캉 쪽을 보고 있으면 2초 동안 화면이 하얘진다 (피해 없음) */
  cameraFlash(from: Enemy): void {
    const p = this.player;
    fx.floatText(this, from.x, from.y - from.height * from.baseScale - 30, '찰칵!', '#ffffff', 22);
    const facing = p.facing === (Math.sign(from.x - p.x) || 1);
    if (!facing || !p.targetable) {
      this.cameras.main.flash(90, 255, 255, 255);
      fx.floatText(this, p.x, p.y - 130, '고개 돌리기 성공!', '#7CFC9A', 16);
      return;
    }
    const white = this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0xffffff, 1).setScrollFactor(0).setDepth(2300);
    this.tweens.add({ targets: white, alpha: 0, delay: 1400, duration: 600, onComplete: () => white.destroy() });
    fx.floatText(this, p.x, p.y - 130, '눈부셔!', '#ffe066', 18);
  }

  /** 프레지던트 캉 학위 수여: 학사모가 부메랑처럼 날아갔다 돌아온다 (점프하거나 위아래로 비킨다) */
  throwCap(from: Enemy, y: number): void {
    const f = from.facing;
    this.projectiles.push(
      new Projectile(this, {
        x: from.x + f * 40,
        y: Phaser.Math.Clamp(y, FLOOR_TOP + 6, FLOOR_BOTTOM - 6),
        z: 30,
        vx: f * 600,
        owner: 'enemy',
        dmg: 1,
        knockdown: false,
        tag: 'cap',
        halfW: 22,
        ttl: 3.4,
        obj: createCapIcon(this),
        spin: 14 * f,
        returnTo: from,
      }),
    );
  }

  /** 프레지던트 캉 2페이즈: 수강신청 서버 폭주 (오류 창이 떨어지고 패킷이 날아온다) */
  startServerStorm(sec: number): void {
    this.storm = { t: sec, sec, dropT: 0.4, packetT: 1.0, queue: Phaser.Math.Between(9000, 15000) };
    this.cameras.main.flash(160, 80, 120, 255);
  }

  private updateStorm(dt: number): void {
    const s = this.storm;
    if (!s) return;
    s.t -= dt;
    if (s.t <= 0) {
      this.storm = null;
      return;
    }
    const left = this.cameras.main.scrollX;
    const p = this.player;
    s.dropT -= dt;
    if (s.dropT <= 0) {
      s.dropT = 0.44;
      const aim = Math.random() < 0.35;
      const x = aim ? p.x + Phaser.Math.Between(-50, 50) : left + Phaser.Math.Between(60, GAME_W - 60);
      const y = aim ? p.y + Phaser.Math.Between(-16, 16) : Phaser.Math.Between(FLOOR_TOP + 8, FLOOR_BOTTOM - 8);
      this.hazards.push(
        new Hazard(this, {
          x: Phaser.Math.Clamp(x, left + 40, left + GAME_W - 40),
          y: Phaser.Math.Clamp(y, FLOOR_TOP + 6, FLOOR_BOTTOM - 6),
          delay: 0.95,
          radius: 34,
          owner: 'enemy',
          dmg: 1,
          obj: createErrorWindow(this),
        }),
      );
    }
    s.packetT -= dt;
    if (s.packetT <= 0) {
      s.packetT = 1.4;
      const fromRight = Math.random() < 0.5;
      // 한 줄은 플레이어 깊이, 한 줄은 아무 데나 (점프하거나 위아래로 비켜서 피한다)
      for (const ly of [p.y, Phaser.Math.Between(FLOOR_TOP + 10, FLOOR_BOTTOM - 10)]) {
        this.projectiles.push(
          new Projectile(this, {
            x: fromRight ? left + GAME_W + 30 : left - 30,
            y: Phaser.Math.Clamp(ly, FLOOR_TOP, FLOOR_BOTTOM),
            z: 30,
            vx: fromRight ? -290 : 290,
            owner: 'enemy',
            dmg: 1,
            knockdown: false,
            halfW: 16,
            ttl: 4,
            obj: createPacket(this),
          }),
        );
      }
    }
  }

  private updateFloorGimmicks(dt: number, prevX: number): void {
    const p = this.player;
    for (const l of this.penLines) {
      l.update(dt);
      if (!l.removed) l.block(p, prevX);
    }
    this.penLines = this.penLines.filter((x) => !x.removed);
    // 최내놔 처장의 거미줄: 밟으면 처장 곁으로 끌려간다 (피해 없음)
    for (const w of this.webs) {
      w.web.update(dt);
      if (w.web.removed || !w.web.landed || this.pull || p.z > 6 || !w.web.contains(p.x, p.y)) continue;
      if (!p.freeze(0.75, '거미줄에 걸렸다!')) continue;
      const left = this.cameras.main.scrollX;
      const side = p.x >= w.sup.posX ? 1 : -1;
      this.pull = {
        fx: p.x,
        fy: p.y,
        tx: Phaser.Math.Clamp(w.sup.posX + side * 60, left + 40, left + GAME_W - 40),
        ty: FLOOR_TOP + 10,
        t: 0,
      };
      this.freezeNote = '거미줄에 걸렸다! (끌려가는 중)';
      w.web.destroy();
    }
    this.webs = this.webs.filter((w) => !w.web.removed);
    // 권학생이 부른 총학 집행부: 닿으면 밀려날 뿐 아프지 않다
    for (const a of this.aides) {
      a.update(dt, p.x);
      if (!a.removed) a.push(p);
    }
    this.aides = this.aides.filter((a) => !a.removed);
    // 프레지던트 캉의 MOU 서명선
    for (const s of this.signs) {
      s.update(dt);
      if (s.touches(p)) {
        s.hit = true;
        p.takeHit({ dmg: 1, dir: p.facing > 0 ? -1 : 1, kb: 120, knockdown: false });
      }
    }
    this.signs = this.signs.filter((x) => !x.removed);
  }

  /** 거미줄에 걸리면 0.6초 동안 처장 곁(약 60px)으로 끌려간다 */
  private updatePull(dt: number): void {
    const q = this.pull;
    if (!q) return;
    q.t += dt;
    const k = Math.min(1, q.t / 0.6);
    const e = 1 - (1 - k) * (1 - k);
    const p = this.player;
    p.x = q.fx + (q.tx - q.fx) * e;
    p.y = q.fy + (q.ty - q.fy) * e;
    p.sync();
    if (k >= 1) this.pull = null;
  }

  private clearFloorGimmicks(): void {
    for (const x of this.penLines) x.destroy();
    for (const w of this.webs) w.web.destroy();
    for (const a of this.aides) a.destroy();
    for (const x of this.signs) x.destroy();
    this.penLines = [];
    this.webs = [];
    this.aides = [];
    this.signs = [];
    this.pull = null;
    this.storm = null;
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
    sound.play('clear');
    fx.banner(this, title, sub, 2400);
    for (const o of this.enemies) {
      if (o.dead || o.kind === 'chonghak' || o.kind === 'noticeBoss' || o.kind === 'deadlineBoss' || o instanceof Visitor) continue;
      if (STUDENT_BOSSES.includes(o.kind)) continue;
      o.takeHit({ dmg: 99, dir: o.x >= this.player.x ? 1 : -1, kb: 0, knockdown: true, force: true });
      if (o instanceof DocBomb) o.destroy();
    }
    for (const s of this.sups) s.leave();
    for (const m of this.meetings) m.obj.destroy();
    this.meetings = [];
    if (this.studentMode) {
      // 학생 모드: 보스가 설득되면 날아오던 도장·오류 창·서류도 멈춘다
      for (const h of this.hazards) if (h.owner === 'enemy') h.destroy();
      for (const pr of this.projectiles) if (pr.owner === 'enemy') pr.destroy();
      this.clearFloorGimmicks();
    }
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
    if (e.kind === 'jeonpilBoss') {
      this.onBossDefeated('승인 완료!', '전필수 학과장이 졸업 사정을 통과시켰습니다');
      return;
    }
    if (e.kind === 'bujaeBoss') {
      this.onBossDefeated('서명 완료!', '김부재중 교수가 서명했습니다');
      return;
    }
    if (e.kind === 'hanhakgoBoss') {
      this.onBossDefeated('승인 완료!', '한학고 학장이 성적 정정을 승인했습니다');
      return;
    }
    if (e.kind === 'presidentBoss') {
      this.onBossDefeated('검토 완료!', '프레지던트 캉: "좋아요, 검토 끝났습니다."');
      return;
    }
    if (e.kind === 'chonghak') return;
    if (ORDINARY.has(e.kind) && !this.bossDefeated) this.randomDrop(e);
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
    this.maybeCallHelpers(dmg);
  }

  onPlayerKO(): void {
    const p = this.player;
    if (p.lives > 1) {
      p.lives--;
      p.revive();
      fx.floatText(this, p.x, p.y - 130, this.studentMode ? '다시 등교!' : '다시 출근!', '#ffe066', 24);
    } else {
      p.lives = 0;
      p.state = 'ko';
      this.gameOver();
    }
  }

  // ---------- 필살기: 업무 스킬 / 외국어 주문 ----------

  startSpecial(): void {
    this.player.enterSpecial();
    this.specialT = 0;
    this.specialFired = false;
    this.specialKills = 0;
    const dim = this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x000000, 0.55);
    if (this.studentMode) {
      this.specialObjs = [dim, ...this.spellBanner()];
    } else {
      const skill = skillById(this.run.skill);
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
      this.tweens.add({ targets: t, scale: 1, duration: 220, ease: 'Back.Out' });
    }
    for (const o of this.specialObjs) (o as Phaser.GameObjects.Text).setScrollFactor(0).setDepth(2400);
  }

  /** 외국어 주문 큰 글자: 원문 + (뜻). 아랍어는 오른쪽에서 왼쪽으로 쓴다 */
  private spellBanner(): Phaser.GameObjects.GameObject[] {
    const spell = spellById(this.run.skill);
    const stroke = `#${spell.color.toString(16).padStart(6, '0')}`;
    const style = { fontFamily: FONT, fontSize: '58px', fontStyle: 'bold', color: '#ffffff', stroke, strokeThickness: 10 };
    const box = this.add.container(GAME_W / 2, GAME_H / 2 - 30);
    if (spell.rtl) {
      const word = this.add
        .text(0, 0, spell.text, { ...style, fontFamily: 'Arial, "Segoe UI", Tahoma, sans-serif', fontSize: '66px', rtl: true })
        .setOrigin(0, 0.5);
      const mean = this.add.text(0, 0, ` (${spell.meaning})`, style).setOrigin(0, 0.5);
      const total = word.width + mean.width;
      word.x = -total / 2;
      mean.x = -total / 2 + word.width;
      box.add([word, mean]);
    } else {
      box.add(this.add.text(0, 0, spellLabel(spell), style).setOrigin(0.5));
    }
    const bounds = box.getBounds();
    const fit = Math.min(1, 900 / Math.max(1, bounds.width));
    box.setScale(0.3 * fit);
    this.tweens.add({ targets: box, scale: fit, duration: 220, ease: 'Back.Out' });
    const sub = this.add
      .text(GAME_W / 2, GAME_H / 2 + 40, `${spell.lang} 주문 · ${spell.desc}`, { fontFamily: FONT, fontSize: '18px', color: '#f5c542' })
      .setOrigin(0.5);
    return [box, sub];
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
    const hp0 = e.hp;
    if (e.takeHit({ dmg: 4, dir, kb: 0, knockdown: true, force: true, thrown: true, stamps: 4 })) {
      fx.stampMark(this, e.x, e.y - e.z - Math.min(e.height, 70) * 0.6, label);
      this.countSpecialKill(e, hp0);
    }
  }

  /** 필살기에 맞은 잡몹이 이번에 처리됐으면 센다 (배지 "일괄 처리": 필살기 한 번에 10명 이상) */
  private countSpecialKill(e: Enemy, hp0: number): void {
    if (!ORDINARY.has(e.kind) || hp0 <= 0 || e.hp > 0) return;
    this.specialKills++;
    noteSpecialKills(this.specialKills);
  }

  private fireSkill(): void {
    const p = this.player;
    const left = this.cameras.main.scrollX;
    const st = this.studentMode;
    const spell = spellById(this.run.skill);
    const label = (staff: string) => (st ? spell.stamp : staff);
    switch (this.run.skill) {
      case 'notice':
        for (const e of this.skillTargets()) this.skillHit(e, label('공지'));
        break;
      case 'batch': {
        // 일괄 처리 / ¡Olé!: 앞으로 돌진하며 길 위(깊이 ±44)의 적을 뚫는다
        const endX = Phaser.Math.Clamp(p.x + p.facing * 460, left + 30, left + GAME_W - 30);
        const lo = Math.min(p.x, endX) - 30;
        const hi = Math.max(p.x, endX) + 30;
        for (const e of this.skillTargets()) if (e.x >= lo && e.x <= hi && Math.abs(e.y - p.y) < 44) this.skillHit(e, label('전결'));
        const trail = this.add
          .rectangle((p.x + endX) / 2, p.y - 50, Math.abs(endX - p.x), 70, st ? 0xc8202f : 0x2f6fd1, 0.35)
          .setDepth(p.y + 1);
        this.tweens.add({ targets: trail, alpha: 0, duration: 400, onComplete: () => trail.destroy() });
        this.tweens.add({ targets: p, x: endX, duration: 220, ease: 'Cubic.Out' });
        break;
      }
      case 'rulebook': {
        // 규정집 낙하 / ЗАЧЁТ!: 적이 몰린 곳(없으면 앞쪽)에 세 번 떨어진다
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
              obj: st ? createZachetDrop(this) : createFallingDoc(this, '규정집', 0x1f5e45, 80, 52),
            }),
          ),
        );
        break;
      }
      case 'transfer': {
        // 내선 돌리기 / يلا!: 같은 줄을 화면 끝까지 꿰뚫는다
        const edge = p.facing > 0 ? left + GAME_W : left;
        for (const e of this.skillTargets()) {
          if (Math.abs(e.y - p.y) < 36 && (e.x - p.x) * p.facing > -10) this.skillHit(e, label('연결'));
        }
        const beam = this.add
          .rectangle((p.x + edge) / 2, p.y - 50, Math.abs(edge - p.x), 26, st ? 0x99f6e4 : 0x9fd3ff, 0.8)
          .setDepth(p.y + 1)
          .setStrokeStyle(3, st ? 0x0f766e : 0x2f6fd1);
        if (st) {
          this.arabicFlow(Math.min(p.x, edge), Math.max(p.x, edge), p.y - 50);
          this.tweens.add({ targets: beam, alpha: 0, delay: 250, duration: 450, onComplete: () => beam.destroy() });
        } else {
          const text = this.add
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
          this.tweens.add({
            targets: [beam, text],
            alpha: 0,
            delay: 250,
            duration: 450,
            onComplete: () => {
              beam.destroy();
              text.destroy();
            },
          });
        }
        break;
      }
    }
  }

  /** 아랍어 주문: "يلا" 글자들이 줄을 따라 오른쪽에서 왼쪽으로 흘러간다 */
  private arabicFlow(lo: number, hi: number, y: number): void {
    for (let i = 0; i < 4; i++) {
      const t = this.add
        .text(hi + i * 70, y - 4, 'يلا!', {
          fontFamily: 'Arial, "Segoe UI", Tahoma, sans-serif',
          fontSize: '30px',
          fontStyle: 'bold',
          color: '#ffffff',
          stroke: '#0f766e',
          strokeThickness: 6,
          rtl: true,
        })
        .setOrigin(0.5)
        .setDepth(1600);
      this.tweens.add({
        targets: t,
        x: lo - 60,
        duration: 650,
        delay: i * 60,
        ease: 'Sine.In',
        onComplete: () => t.destroy(),
      });
    }
  }

  // ---------- 첫 판 안내 (직접 해 보는 5단계 연습, 결정 60) ----------
  // 이 기기에서 처음 하는 2D 판(교직원·학생 구분 없이 한 번)의 1스테이지 첫 구역, 잡몹이 나오기 전.
  // 화면 위 띠에 한 단계씩 보여 주고, 해 보면 ✓를 잠깐 보여 준 뒤 다음 단계로. 그동안 시계가 멈추고 적이 오지 않는다.
  // 끝까지 했거나 오른쪽 위 "건너뛰기"를 누르면 markTutorialSeen('2d') (설정 "안내 다시 보기"가 지운다).

  /** 단계별 이름과 하는 법 (PC·터치 키 이름이 다르다) */
  private tutSteps(): { name: string; how: string }[] {
    const touch = this.pad !== null;
    const act = this.studentMode ? '공격' : '처리';
    const card = this.studentMode ? '학생증' : '사원증';
    return [
      { name: '이동', how: touch ? '화면 왼쪽을 누른 채 밀어서 움직여 보세요' : '방향키나 WASD로 움직여 보세요' },
      { name: act, how: touch ? `A 단추로 ${act}해 보세요` : `J 키로 ${act}해 보세요` },
      { name: '점프', how: touch ? 'B 단추로 점프해 보세요' : 'K 키(또는 Space)로 점프해 보세요' },
      {
        name: '줍기·던지기',
        how: touch ? `줍기 단추로 ${card}을 줍고, 한 번 더 눌러 던져 보세요` : `L 키로 ${card}을 줍고, 한 번 더 눌러 던져 보세요`,
      },
      {
        name: '필살기',
        how: touch ? '게이지를 채워 줬어요. SP 단추로 필살기를 써 보세요' : '게이지를 채워 줬어요. I 키로 필살기를 써 보세요',
      },
    ];
  }

  private startTutorial(): void {
    const box = this.add.container(GAME_W / 2, 150).setScrollFactor(0).setDepth(1850).setVisible(false);
    box.add(this.add.rectangle(0, 0, 600, 106, 0x111827, 0.9).setStrokeStyle(2, 0xf5c542));
    box.add(
      this.add
        .text(0, -34, '첫 판 연습 · 연습하는 동안 시계가 멈춰요', { fontFamily: FONT, fontSize: '13px', color: '#9fd3ff' })
        .setOrigin(0.5),
    );
    const title = this.add
      .text(0, -6, '', { fontFamily: FONT, fontSize: '26px', fontStyle: 'bold', color: '#ffffff' })
      .setOrigin(0.5);
    const sub = this.add.text(0, 30, '', { fontFamily: FONT, fontSize: '17px', color: '#f5c542' }).setOrigin(0.5);
    box.add([title, sub]);
    const s = SKIP_BTN;
    const skip = this.add.container(s.x, s.y).setScrollFactor(0).setDepth(2050);
    skip.add(this.add.rectangle(0, 0, s.w, s.h, 0x111827, 0.85).setStrokeStyle(2, 0xffffff, 0.6));
    skip.add(this.add.text(0, 0, '건너뛰기', { fontFamily: FONT, fontSize: '15px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5));
    this.tut = {
      step: -1,
      wait: TUT_INTRO_SEC,
      okT: 0,
      moved: 0,
      lastX: this.player.x,
      lastY: this.player.y,
      specialUsed: false,
      card: null,
      box,
      title,
      sub,
      skip,
    };
  }

  private showTutStep(i: number): void {
    const t = this.tut;
    if (!t) return;
    const steps = this.tutSteps();
    t.step = i;
    t.okT = 0;
    t.lastX = this.player.x;
    t.lastY = this.player.y;
    t.title.setText(`${i + 1}/${steps.length} · ${steps[i].name}`).setColor('#ffffff');
    t.sub.setText(steps[i].how);
    t.box.setVisible(true).setAlpha(0);
    this.tweens.add({ targets: t.box, alpha: 1, duration: 180 });
    const p = this.player;
    if (i === 3) {
      // 발 앞에 사원증(학생증)을 놓아 준다 — 줍고 던지면 된다 (연습이 끝나면 거둔다)
      const left = this.cameras.main.scrollX;
      const x = Phaser.Math.Clamp(p.x + p.facing * 26, left + 40, left + GAME_W - 40);
      const y = Phaser.Math.Clamp(p.y, FLOOR_TOP + 6, FLOOR_BOTTOM - 6);
      t.card = new Pickup(this, 'idcard', x, y, 0, this.studentMode);
      this.pickups.push(t.card);
      fx.dust(this, x, y);
    }
    if (i === 4) p.sp = 100;
  }

  private updateTutorial(dt: number): void {
    const t = this.tut;
    if (!t) return;
    const p = this.player;
    if (t.step < 0) {
      // 시작 안내 띠("오후 4시 52분 · 퇴근 8분 전")가 사라지면 1단계
      t.wait -= dt;
      if (t.wait <= 0) this.showTutStep(0);
      return;
    }
    if (t.okT > 0) {
      t.okT -= dt;
      if (t.okT <= 0) {
        if (t.step >= this.tutSteps().length - 1) this.endTutorial(false);
        else this.showTutStep(t.step + 1);
      }
      return;
    }
    let ok = false;
    switch (t.step) {
      case 0:
        if (p.state === 'walk') t.moved += Math.hypot(p.x - t.lastX, p.y - t.lastY);
        ok = t.moved >= TUT_MOVE;
        break;
      case 1:
        ok = p.state === 'attack' || p.state === 'wattack';
        break;
      case 2:
        ok = p.state === 'jump';
        break;
      case 3:
        ok = this.projectiles.some((pr) => pr.owner === 'player');
        break;
      case 4:
        // 필살기 연출이 끝나면 ✓ (쓰기 전에는 게이지를 가득 채워 둔다)
        if (this.specialT >= 0) t.specialUsed = true;
        else if (!t.specialUsed) p.sp = 100;
        ok = t.specialUsed && this.specialT < 0;
        break;
    }
    t.lastX = p.x;
    t.lastY = p.y;
    if (ok) {
      t.okT = TUT_OK_SEC;
      t.title.setText('✓ 잘했어요!').setColor('#7CFC9A');
      sound.play('pickup');
    }
  }

  /** 연습을 끝낸다 (끝까지 했거나 건너뛰었다). 시계가 다시 흐르고, 오른쪽으로 가면 첫 구역 싸움이 시작된다 */
  private endTutorial(skipped: boolean): void {
    const t = this.tut;
    if (!t) return;
    this.tut = null;
    markTutorialSeen('2d');
    t.box.destroy();
    t.skip.destroy();
    // 연습용 사원증(학생증)을 거둔다 (2D는 맨손으로 시작한다 — 1구역 경비 선생님에게는 사원증이 없다)
    const p = this.player;
    t.card?.destroy();
    for (const it of this.pickups) if (it.kind === 'idcard') it.destroy();
    for (const pr of this.projectiles) if (pr.owner === 'player' && pr.weaponId === 'idcard') pr.destroy();
    if (p.weapon?.id === 'idcard') p.weapon = null;
    // 필살기 단계에서 채워 준 게이지는 쓰지 않고 건너뛰면 거둔다
    if (t.step >= 4 && !t.specialUsed) p.sp = 0;
    // 시작 안내 띠가 아직 떠 있을 때 건너뛰었으면 겹치지 않게 띄우지 않는다.
    // 연습하며 이미 싸움 시작 자리를 넘어갔으면 곧바로 싸움이 시작되므로(구역 안내 띠가 뜬다) 띄우지 않는다
    if (t.step < 0 || p.x >= this.zones[this.zoneIndex].left + TRIGGER_X) return;
    if (skipped) fx.banner(this, '연습을 건너뛰었어요', '오른쪽으로 이동하세요', 1600);
    else fx.banner(this, '연습 끝!', '이제 오른쪽으로 이동하세요', 1600);
  }

  // ---------- 돌발 방문 (교직원 모드, data/visits.ts) ----------

  /** 돌발 방문이 나올 구역: 교직원 모드에서 이 판에 고른 스테이지(처음 부를 때 1~3 중 무작위로 정해 둔다)의 잡몹 구간 하나.
   *  보스전 구역은 빼고, 이미 나왔거나 다른 스테이지면 -1 */
  private pickVisitZone(): number {
    const r = this.run;
    if (r.mode !== 'staff' || r.visitDone || !visitFor(r.hero)) return -1;
    if (r.visitStage === undefined) r.visitStage = Math.floor(Math.random() * this.stages.length);
    if (r.visitStage !== this.stageIndex) return -1;
    const mobZones: number[] = [];
    this.zones.forEach((z, i) => {
      if (!z.waves.some((w) => w.endsWith('Boss') || w === 'chonghak')) mobZones.push(i);
    });
    return mobZones.length > 0 ? mobZones[Math.floor(Math.random() * mobZones.length)] : -1;
  }

  /** 돌발 방문이 나올 차례이거나 진행 중이면 구역이 끝나지 않는다 (교수 서명 대기도 그 뒤) */
  private get visitHolds(): boolean {
    return (this.zoneIndex === this.visitZone && !this.run.visitDone) || this.visitor !== null;
  }

  /** 지금 방문 상대가 들어와도 되는지: 안내 띠(구역 소개 등)·조력자·필살기·연출이 없을 때 */
  private visitFree(): boolean {
    return (
      fx.bannerFree(this) &&
      this.helperT < 0 &&
      this.helpers.length === 0 &&
      this.specialT < 0 &&
      !this.over &&
      !this.finishing &&
      this.approval !== 'called' &&
      this.player.targetable
    );
  }

  /** 싸우는 중 매 프레임: 나올 차례면 기다렸다가 부르고, 와 있는 동안은 잡몹을 조금씩 보충한다 */
  private updateVisit(dt: number): void {
    const v = this.visitor;
    if (!v) {
      if (this.zoneIndex !== this.visitZone || this.run.visitDone) return;
      this.visitWait -= dt;
      if (this.visitWait <= 0 && this.visitFree()) this.startVisit(this.run.hero);
      return;
    }
    if (!v.active) return;
    this.trickleT -= dt;
    if (this.trickleT > 0) return;
    this.trickleT = VISIT_TRICKLE_T;
    const mobs = this.enemies.filter((e) => !e.dead && ORDINARY.has(e.kind)).length;
    if (this.queue.length === 0 && mobs < VISIT_TRICKLE_MAX) {
      const r = Math.random();
      this.spawnType(r < 0.5 ? 'mail' : r < 0.75 ? 'phone' : 'bubble');
    }
  }

  /** 방문 상대가 플레이어에게서 먼 쪽 화면 끝에서 빠르게 들어온다 */
  private startVisit(hero: string): boolean {
    const def = visitFor(hero);
    if (!def) return false;
    this.run.visitDone = true;
    const left = this.cameras.main.scrollX;
    const p = this.player;
    const fromRight = p.x - left < GAME_W / 2;
    const x = fromRight ? left + GAME_W + 60 : left - 60;
    const tx = Phaser.Math.Clamp(p.x + (fromRight ? 230 : -230), left + 80, left + GAME_W - 80);
    const y = Phaser.Math.Clamp(p.y + Phaser.Math.Between(-40, 40), FLOOR_TOP + 10, FLOOR_BOTTOM - 10);
    const v = new Visitor(this, def, x, y, tx);
    this.visitor = v;
    this.enemies.push(v);
    this.trickleT = VISIT_TRICKLE_T;
    // 화면 띠 (사용자 확정 문구 "돌발 방문! ○○ — 도장으로 결재판을 채우세요 (20초)"를 띠의 두 줄로 나눠 쓴다)
    fx.banner(this, `돌발 방문! ${def.name}`, `도장으로 결재판을 채우세요 (${VISIT_SEC}초)`, 2600);
    sound.play('open');
    return true;
  }

  /**
   * 시험 지름길 (?debug — 콘솔에서 __game.scene.getScene('stage').callVisit('parkhaksa')):
   * 지금 자리에서 바로 돌발 방문을 시작한다. heroId를 비우면 고른 교직원. 와 있던 상대는 물린다.
   * 부르면 이 판의 돌발 방문은 나온 것으로 친다 (저절로는 다시 나오지 않는다).
   */
  callVisit(heroId?: string): string {
    if (!DEBUG_DEFAULT) return 'debug only (?debug)';
    const id = heroId ?? this.run.hero;
    if (!visitFor(id)) return `no visit for "${id}"`;
    const old = this.visitor;
    if (old && !old.removed) {
      old.destroy();
      this.enemies = this.enemies.filter((e) => e !== old);
    }
    this.visitor = null;
    this.startVisit(id);
    return `visit ${id}`;
  }

  /** 방문이 끝났다 (Visitor가 부른다): 성공·실패 글자 */
  onVisitEnd(v: Visitor, win: boolean): void {
    if (win) {
      sound.play('clear');
      fx.floatText(this, v.x, v.y - 200, '결재 완료!', '#7CFC9A', 24);
      // 배지 "돌발 방문 해결"·"손님맞이 완료" (고른 교직원 id로 센다)
      noteVisitSuccess(this.run.hero);
    } else {
      fx.floatText(this, v.x, v.y - 200, '시간 초과…', '#ff8a8a', 20);
    }
  }

  /** 성공한 방문 상대가 떠나며 보상 상자를 떨어뜨린다 (상자 위 이름표와 띠에 보상 이름) */
  dropVisitBox(x: number, y: number, reward: VisitReward): void {
    const left = this.cameras.main.scrollX;
    const tx = Phaser.Math.Clamp(x + (x - left < GAME_W / 2 ? 46 : -46), left + 50, left + GAME_W - 50);
    const ty = Phaser.Math.Clamp(y + 12, FLOOR_TOP + 8, FLOOR_BOTTOM - 8);
    const name = REWARD_NAME[reward];
    this.pickups.push(new Pickup(this, 'visitBox', tx, ty, 0, this.studentMode, reward, name).tossFrom(x, y, 60, 0.5, 60));
    fx.banner(this, '보상 상자!', `${name} — 상자를 집으세요`, 1800);
  }

  /** 보상 상자를 집었다: 장갑·그래프는 손에 든다(손이 차 있으면 발밑에), 나머지는 바로 발동 */
  private openVisitBox(reward: VisitReward, x: number, y: number): void {
    const p = this.player;
    const name = REWARD_NAME[reward];
    fx.banner(this, name, this.rewardDesc(reward), 2600);
    switch (reward) {
      case 'glove':
      case 'graph':
        if (!p.weapon) {
          p.equip(reward);
          fx.floatText(this, p.x, p.y - 124, `${name} 장착!`, '#9fd3ff', 18);
        } else {
          const left = this.cameras.main.scrollX;
          const wx = Phaser.Math.Clamp(x + p.facing * 34, left + 40, left + GAME_W - 40);
          this.pickups.push(new Pickup(this, reward, wx, y, 0, this.studentMode));
          fx.floatText(this, p.x, p.y - 124, `${name}은 발밑에 — 손을 비우고 L로 집으세요`, '#9fd3ff', 16);
        }
        break;
      case 'clicker':
        p.clickT = this.buffSec(CLICKER_SEC);
        fx.floatText(this, p.x, p.y - 124, `도장 연사 ${CLICKER_MUL}배!`, '#ffd27f', 18);
        break;
      case 'cheer':
        this.callCheer();
        break;
      case 'plaque':
        this.placePlaque(x, y);
        break;
      case 'hush':
        this.hushT = this.buffSec(HUSH_SEC);
        for (const e of this.enemies) {
          if (!e.dead && ORDINARY.has(e.kind)) fx.floatText(this, e.x, e.y - e.z - e.height - 10, '쉿!', '#9fd3ff', 16);
        }
        break;
    }
  }

  /** 응원단 호출권: 동아리원 둘이 양쪽 화면 끝에서 달려와 곁에 붙는다 */
  private callCheer(): void {
    for (const c of this.cheer) c.leave();
    const left = this.cameras.main.scrollX;
    const sec = this.buffSec(CHEER_SEC);
    for (let i = 0; i < CHEER_N; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      this.cheer.push(new CheerMember(this, CHEER_LOOKS[i % CHEER_LOOKS.length], side, side < 0 ? left - 60 : left + GAME_W + 60, sec));
    }
    this.cheerT = sec;
  }

  /** 실사 통과 현판: 집은 자리에 서고 둘레가 안전지대가 된다 */
  private placePlaque(x: number, y: number): void {
    if (this.plaque) {
      this.plaque.obj.destroy();
      this.plaque.ring.destroy();
    }
    const ring = this.add
      .ellipse(x, y, PLAQUE_R * 2, PLAQUE_R * 0.9, 0x5bd16b, 0.14)
      .setStrokeStyle(3, 0x5bd16b, 0.85)
      .setDepth(-4);
    // 현판은 집은 자리 바로 옆 조금 뒤쪽(깊이)에 세워 플레이어 몸에 가리지 않게 한다
    const px = x - this.player.facing * 50;
    const py = Math.max(FLOOR_TOP, y - 16);
    const obj = createPlaque(this).setPosition(px, py).setDepth(py);
    this.plaque = { x, y, t: this.buffSec(PLAQUE_SEC), obj, ring };
    fx.dust(this, px, py);
  }

  /** (x, y)가 실사 통과 현판 안전지대 안인지 (Player.takeHit이 묻는다) */
  safeAt(x: number, y: number): boolean {
    const q = this.plaque;
    if (!q) return false;
    const dx = (x - q.x) / PLAQUE_R;
    const dy = (y - q.y) / (PLAQUE_R * 0.45);
    return dx * dx + dy * dy <= 1;
  }

  /** 응원단·현판·정숙 표지판 시간 */
  private updateVisitRewards(dt: number): void {
    for (const c of this.cheer) c.update(dt);
    this.cheer = this.cheer.filter((c) => !c.removed);
    if (this.cheerT > 0) this.cheerT -= dt;
    if (this.hushT > 0) this.hushT -= dt;
    const q = this.plaque;
    if (q) {
      q.t -= dt;
      const blink = q.t < 2.5 && Math.floor(q.t * 8) % 2 === 0;
      q.ring.setVisible(!blink);
      if (q.t <= 0) {
        q.obj.destroy();
        q.ring.destroy();
        this.plaque = null;
      }
    }
  }

  /** HUD 체력 상자 아래에 보일 돌발 방문 보상 효과 */
  private visitPerks(): string[] {
    const out: string[] = [];
    const p = this.player;
    if (p.clickT > 0) out.push(`매크로 클리커 · 연사 ${CLICKER_MUL}배 ${Math.ceil(p.clickT)}초`);
    if (this.cheerT > 0) out.push(`응원단 · ${Math.ceil(this.cheerT)}초`);
    if (this.plaque) out.push(`실사 통과 현판 · 안전지대 ${Math.ceil(this.plaque.t)}초`);
    if (this.hushT > 0) out.push(`쉿! 정숙 · 잡몹 느려짐 ${Math.ceil(this.hushT)}초`);
    return out;
  }

  /** 잡몹인지 (응원단이 처리할 대상) */
  isMob(e: Enemy): boolean {
    return ORDINARY.has(e.kind);
  }

  /** 잡몹 하나를 바로 처리한다 (서류 뭉치는 터뜨리지 않고 거둔다 — 조력자와 같다) */
  private processMob(e: Enemy, dir: number): void {
    fx.stampMark(this, e.x, e.y - e.z - Math.min(e.height, 70) * 0.6, '처리');
    if (e instanceof DocBomb) e.destroy();
    else e.takeHit({ dmg: 99, dir, kb: 0, knockdown: true, force: true });
  }

  /** 응원단 동아리원이 잡몹 하나를 처리했다 */
  cheerProcess(e: Enemy, fromX: number): void {
    this.processMob(e, e.x >= fromX ? 1 : -1);
    this.bumpCombo(1);
  }

  /** 로켓 펀치 장갑·취업률 상승 그래프가 닿았다: 잡몹은 처리(개수 제한 없이 꿰뚫는다), 사람(보스·방문 상대)은 도장 4발만큼 */
  private rewardHit(pr: Projectile, e: Enemy): void {
    const dir = Math.sign(pr.vx) || 1;
    if (ORDINARY.has(e.kind)) {
      // 줄줄이 꿰뚫으므로 잡몹마다 멈칫(히트스톱)은 가볍게
      this.processMob(e, dir);
      this.addCombo(1, false);
      return;
    }
    // 던지기 장점이면 도장 수(위력)도 +20% (반올림 — 4발 → 5발)
    const n = Math.round((pr.weaponId === 'graph' ? GRAPH_STAMPS : GLOVE_STAMPS) * this.perk.throw);
    if (e.takeHit({ dmg: n, stamps: n, dir, kb: 0, knockdown: false, thrown: true })) {
      fx.stampMark(this, e.x, e.y - e.z - Math.min(e.height, 70) * 0.6, this.hitLabel(e));
      this.addCombo(1, true);
    }
  }

  /** 로켓 펀치 장갑(일직선, 꿰뚫기) · 취업률 상승 그래프(화면 폭의 절반까지 날아갔다 돌아오는 부메랑, 빙글빙글) */
  private throwReward(p: Player, id: 'glove' | 'graph'): void {
    const f = p.facing;
    const obj = weaponIcon(this, id, this.studentMode);
    if (id === 'glove') {
      obj.setScale(f, 1);
      this.projectiles.push(
        new Projectile(this, {
          x: p.x + f * 26,
          y: p.y,
          z: 52,
          vx: f * 640,
          owner: 'player',
          dmg: GLOVE_STAMPS,
          knockdown: false,
          halfW: 26,
          ttl: 2.2 * this.perk.throw,
          obj,
          pierce: true,
          weaponId: 'glove',
        }),
      );
      sound.play('dash');
      return;
    }
    this.projectiles.push(
      new Projectile(this, {
        x: p.x + f * 26,
        y: p.y,
        z: 52,
        vx: f * 700,
        owner: 'player',
        dmg: GRAPH_STAMPS,
        knockdown: false,
        halfW: 26,
        ttl: 4,
        obj,
        spin: 14 * f,
        returnTo: p,
        range: (GAME_W / 2) * this.perk.throw,
        pierce: true,
        weaponId: 'graph',
      }),
    );
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
