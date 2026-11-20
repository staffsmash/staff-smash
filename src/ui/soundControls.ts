import Phaser from 'phaser';
import { FONT, GAME_W } from '../config';
import { music, sfx, toggleMute } from '../sound';
import { makeButton } from './button';

// 2D 타이틀 오른쪽 위: 배경음악 크기(- / +)와 소리 끄고 켜기. 판 중에는 M 키로 끈다.
// 값은 1인칭 설정 화면과 같은 저장값을 쓴다 (src/sound.ts).

const STEP = 0.1;

export function addSoundControls(scene: Phaser.Scene): void {
  const y = 30;
  const muteX = GAME_W - 60;
  const plusX = muteX - 74;
  const valX = plusX - 42;
  const minusX = valX - 42;
  const style = { fontFamily: FONT, fontSize: '15px', fontStyle: 'bold', color: '#ffffff' };
  scene.add.text(minusX - 24, y, '배경음악', { ...style, color: '#c9d3e6' }).setOrigin(1, 0.5);
  const val = scene.add.text(valX, y, '', style).setOrigin(0.5);
  const bump = (d: number) => {
    sfx.unlock();
    music.setVolume(Math.round((music.volume + d) / STEP) * STEP);
  };
  makeButton(scene, minusX, y, 32, 32, '-', () => bump(-STEP), 0x2a3346);
  makeButton(scene, plusX, y, 32, 32, '+', () => bump(STEP), 0x2a3346);
  const mute = makeButton(scene, muteX, y, 96, 32, '', () => toggleMute(), 0x2a3346);
  mute.text.setFontSize(15);
  const key = scene.sys.game.device.input.touch ? '' : ' (M)';
  const refresh = () => {
    const v = `${Math.round(music.volume * 100)}%`;
    if (val.text !== v) val.setText(v);
    const m = `${sfx.muted ? '소리 끔' : '소리 켬'}${key}`;
    if (mute.text.text !== m) mute.text.setText(m);
  };
  refresh();
  scene.events.on(Phaser.Scenes.Events.UPDATE, refresh);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off(Phaser.Scenes.Events.UPDATE, refresh));
}
