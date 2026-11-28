import stats from '../data/enemies.json';
import type { StageScene } from '../scenes/StageScene';
import { Enemy } from './Enemy';
import type { Player } from './Player';
import { neutralPose, type Pose } from './Rig';
import { createRefCellRig } from './rigs';
import { createHwpFileRig } from './studentRigs';

// 결정 61 새 잡몹 A ★ "#REF! 오류 셀"(학생 모드: "최종_진짜최종.hwp") — 2스테이지부터 나온다.
// 천천히 다가와 부딪히면 피해 1칸(메일과 같은 급). 처리되면 작은 것 2개로 갈라진다 (StageScene.splitRefCell).
// 작은 것(small: "#REF!" 작은 칸 / "최종_진짜최종(1).hwp")은 가벼워서 한 대에 처리되고 더는 갈라지지 않는다.
// 처리 문구: 큰 것 "참조 오류 수정!" / "과제 제출 완료!", 작은 것 "수식 수정 완료!" / "사본 삭제!"

const BIG = stats.refcell;
const SMALL = stats.refbit;
/** 작은 것의 크기 (같은 그림을 줄여 쓴다) */
const SMALL_SCALE = 0.62;

export const REFCELL_TEXT = {
  /** 처음 만날 때 띠 (제목, 요령) */
  staffName: '#REF! 오류 셀',
  studentName: '최종_진짜최종.hwp',
  smallStudentName: '최종_진짜최종(1).hwp',
  staffHint: '#REF! 오류 셀은 처리하면 둘로 갈라져요 — 작은 것까지 처리!',
  studentHint: '최종_진짜최종 파일은 처리하면 사본 둘로 갈라져요!',
  staffDone: '참조 오류 수정!',
  studentDone: '과제 제출 완료!',
  staffSmallDone: '수식 수정 완료!',
  studentSmallDone: '사본 삭제!',
} as const;

export class RefCell extends Enemy {
  readonly kind: 'refcell' | 'refbit';
  readonly halfW: number;
  readonly height: number;
  /** 작은 것: 가볍다 (넘어지지 않고 한 대에 사라진다) */
  readonly light: boolean = false;
  readonly small: boolean;
  private readonly S: { hp: number; speedX: number; speedY: number };
  private hitDone = false;
  private phase = Math.random() * 10;

  constructor(scene: StageScene, x: number, y: number, enterTargetX: number, small = false) {
    const st = scene.studentMode;
    const S = small ? SMALL : BIG;
    // 그림자 폭은 몸과 함께 baseScale로 줄어든다 (Fighter.sync)
    super(scene, x, y, st ? createHwpFileRig(scene) : createRefCellRig(scene), S.hp, 62, enterTargetX);
    this.S = S;
    this.small = small;
    this.kind = small ? 'refbit' : 'refcell';
    this.light = small;
    const k = small ? SMALL_SCALE : 1;
    this.baseScale = k;
    this.halfW = Math.round(30 * k);
    this.height = Math.round((st ? 70 : 60) * k);
    if (small) this.hurtTime = 0.2;
    this.defeatText = st
      ? small
        ? REFCELL_TEXT.studentSmallDone
        : REFCELL_TEXT.studentDone
      : small
        ? REFCELL_TEXT.staffSmallDone
        : REFCELL_TEXT.staffDone;
    // 학생 모드: 파일 이름표 (엑셀 칸은 칸에 "#REF!"가 쓰여 있어 이름표가 없다)
    if (st) this.setLabel(small ? REFCELL_TEXT.smallStudentName : REFCELL_TEXT.studentName, '#9fd3ff');
    this.sync();
  }

  /** 갈라져 나올 때 옆으로 톡 튀어나온다 */
  popOut(): void {
    this.vz = 260;
    this.z = 1;
  }

  protected die(): void {
    super.die();
    // 큰 것은 처리되는 순간 작은 것 둘로 갈라진다 (보스가 처리돼 잡몹이 물러날 때는 갈라지지 않는다)
    if (!this.small) this.scene.splitRefCell(this);
  }

  protected think(dt: number, player: Player): void {
    switch (this.state) {
      case 'approach': {
        const { dx, dy } = this.approach(player, this.small ? 40 : 52, this.S.speedX, this.S.speedY);
        if (this.canStartAttack(player, dx, dy, this.small ? 62 : 80)) {
          // 부딪히기: 앞으로 짧게 덤빈다
          this.set('bump');
          this.hitDone = false;
          this.vx = this.facing * (this.small ? 260 : 230);
          this.vy = 0;
        }
        break;
      }
      case 'bump':
        if (!this.hitDone && this.meleeHit(player, 6, 1, 150)) this.hitDone = true;
        if (this.stateT >= 0.2) this.set('recover');
        break;
      case 'recover':
        this.vx *= Math.pow(0.0005, dt);
        this.vy = 0;
        if (this.stateT >= 0.5) {
          this.scene.releaseToken(this);
          this.cooldown = 1.2 + Math.random() * 0.8;
          this.set('approach');
        }
        break;
    }
  }

  protected pose(dt: number): void {
    const p: Pose = neutralPose();
    let sharp = 16;
    switch (this.state) {
      case 'enter':
      case 'approach': {
        const moving = this.vx !== 0 || this.vy !== 0;
        this.phase += dt * (moving ? 10 : 3);
        const s = Math.sin(this.phase);
        p.legF = moving ? s * 0.5 : 0;
        p.legB = moving ? -s * 0.5 : 0;
        p.armF = -s * 0.4;
        p.armB = s * 0.4;
        p.bob = moving ? -Math.abs(s) * 4 : Math.sin(this.phase) * 1.2;
        break;
      }
      case 'bump':
        sharp = 40;
        p.body = 0.35;
        p.armF = -1.6;
        p.armB = -1.6;
        p.legF = 0.5;
        p.legB = 0.6;
        break;
      case 'recover':
        p.body = 0.1;
        break;
      case 'hurt':
        sharp = 30;
        p.body = -0.35;
        p.armF = -0.8;
        p.armB = -0.8;
        break;
      case 'down':
      case 'dying':
        sharp = 14;
        p.body = this.grounded ? -Math.PI / 2 : -1.2;
        p.bob = this.grounded ? -26 : 0;
        break;
      case 'getup':
        p.body = -0.5;
        break;
    }
    this.rig.update(dt, p, sharp);
  }
}
