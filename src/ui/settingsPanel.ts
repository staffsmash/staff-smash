import Phaser from 'phaser';
import { FONT, GAME_H, GAME_W } from '../config';
import { music, sfx, toggleMute } from '../sound';
import { BTN_SIZE, BTN_SIZES, loadBtnSize, resetTutorials, saveBtnSize } from '../uiPrefs';
import { makeButton, makeTabs } from './button';

// 2D "설정" 창 (PRD 결정 60 3절): 타이틀의 작은 줄 "설정"으로 연다.
// 배경음악 크기(- · % · +), 소리 켜고 끄기, 단추 크기(터치 화면에서만), 첫 판 안내 다시 보기, 닫기.
// 예전 타이틀 오른쪽 위 음악 조절(ui/soundControls.ts)을 옮겨 왔다. 저장값은 그대로(src/sound.ts·music.ts·uiPrefs.ts).
// Esc는 연 장면이 받아서 close()를 부른다 (Controls 'pause'). 창 바깥(어두운 곳)을 눌러도 닫힌다.
// 판 화면(카메라가 움직이는 장면)에서도 쓸 수 있게 모든 객체를 화면에 고정한다.

const STEP = 0.1;
const DEPTH = 5000;

export interface SettingsPanel {
  /** 닫혔으면 true */
  readonly closed: boolean;
  close(): void;
}

export function openSettings(scene: Phaser.Scene, onClose?: () => void): SettingsPanel {
  const before = new Set(scene.children.list);
  const touch = scene.sys.game.device.input.touch;
  const cx = GAME_W / 2;
  const rowH = 56;
  const rows = touch ? 4 : 3;
  const panelW = 480;
  const headH = 78;
  const panelH = headH + rows * rowH + 30 + 62;
  const top = (GAME_H - panelH) / 2;
  const left = cx - panelW / 2;
  const labelX = left + 40;
  const ctrlX = left + 316;

  let closed = false;
  const panel: SettingsPanel = {
    get closed() {
      return closed;
    },
    close,
  };

  // 어두운 바탕: 아래 단추가 눌리지 않게 막고, 누르면 닫힌다
  const dim = scene.add.rectangle(cx, GAME_H / 2, GAME_W, GAME_H, 0x000000, 0.62).setInteractive();
  dim.on('pointerup', () => close());
  // 창 (바탕을 눌러도 닫히지 않게 따로 막는다)
  scene.add.rectangle(cx, GAME_H / 2, panelW, panelH, 0x1d2433).setStrokeStyle(2, 0x5b6478).setInteractive();
  scene.add.text(cx, top + 36, '설정', { fontFamily: FONT, fontSize: '26px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5);

  const label = (y: number, t: string) =>
    scene.add.text(labelX, y, t, { fontFamily: FONT, fontSize: '17px', fontStyle: 'bold', color: '#c9d3e6' }).setOrigin(0, 0.5);
  let y = top + headH + rowH / 2 - 6;

  // 1) 배경음악 크기
  label(y, '배경음악');
  const val = scene.add.text(ctrlX, y, '', { fontFamily: FONT, fontSize: '18px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5);
  const bump = (d: number) => {
    sfx.unlock();
    music.setVolume(Math.round((music.volume + d) / STEP) * STEP);
    refresh();
  };
  makeButton(scene, ctrlX - 82, y, 44, 38, '-', () => bump(-STEP), 0x2a3346);
  makeButton(scene, ctrlX + 82, y, 44, 38, '+', () => bump(STEP), 0x2a3346);
  y += rowH;

  // 2) 소리 켜고 끄기 (효과음·배경음악 함께, 판 중에는 M)
  label(y, '소리');
  const mute = makeButton(
    scene,
    ctrlX,
    y,
    208,
    40,
    '',
    () => {
      toggleMute();
      refresh();
    },
    0x2a3346,
  );
  y += rowH;

  // 3) 단추 크기 (터치 화면에서만)
  if (touch) {
    label(y, '단추 크기');
    const setSize = makeTabs(
      scene,
      ctrlX,
      y,
      72,
      38,
      BTN_SIZES.map((s) => BTN_SIZE[s].label),
      (i) => {
        saveBtnSize(BTN_SIZES[i]);
        setSize(i);
      },
    );
    setSize(BTN_SIZES.indexOf(loadBtnSize()));
    y += rowH;
  }

  // 4) 첫 판 안내 다시 보기
  label(y, '첫 판 안내');
  const note = scene.add
    .text(ctrlX, y + 33, '', { fontFamily: FONT, fontSize: '14px', color: '#7CFC9A' })
    .setOrigin(0.5);
  makeButton(
    scene,
    ctrlX,
    y,
    208,
    40,
    '안내 다시 보기',
    () => {
      resetTutorials();
      note.setText('다음 판에 안내가 다시 나와요');
    },
    0x2a3346,
  );

  // 닫기
  makeButton(scene, cx, top + panelH - 36, 200, 44, touch ? '닫기' : '닫기 (Esc)', () => close(), 0x6b7280);

  const key = touch ? '' : ' (M)';
  function refresh(): void {
    const v = `${Math.round(music.volume * 100)}%`;
    if (val.text !== v) val.setText(v);
    const m = `${sfx.muted ? '소리 끔' : '소리 켬'}${key}`;
    if (mute.text.text !== m) mute.text.setText(m);
  }
  refresh();
  // M 키로 바꿔도 글자가 따라가게
  scene.events.on(Phaser.Scenes.Events.UPDATE, refresh);

  const created = scene.children.list.filter((o) => !before.has(o));
  for (const o of created) {
    const g = o as Phaser.GameObjects.GameObject & Partial<Phaser.GameObjects.Components.Depth & Phaser.GameObjects.Components.ScrollFactor>;
    g.setDepth?.(DEPTH);
    g.setScrollFactor?.(0);
  }
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => close(true));

  function close(silent = false): void {
    if (closed) return;
    closed = true;
    scene.events.off(Phaser.Scenes.Events.UPDATE, refresh);
    // 누른 손가락이 떨어지는 순간 아래 단추가 눌리지 않게 다음 틱에 지운다
    const destroy = () => created.forEach((o) => o.destroy());
    if (silent) destroy();
    else scene.time.delayedCall(0, destroy);
    if (!silent) onClose?.();
  }

  return panel;
}
