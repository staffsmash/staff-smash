import Phaser from 'phaser';
import { DEBUG_DEFAULT, FORCE_TIMER, GAME_W, GAME_H } from './config';
import { TitleScene } from './scenes/TitleScene';
import { StageScene } from './scenes/StageScene';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_W,
  height: GAME_H,
  backgroundColor: '#1d1f24',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  input: { activePointers: 4 },
  fps: { target: 60, forceSetTimeOut: FORCE_TIMER },
  scene: [TitleScene, StageScene],
});

// 디버그 모드에서는 콘솔에서 상태를 볼 수 있게 한다
if (DEBUG_DEFAULT) (window as unknown as { __game: Phaser.Game }).__game = game;
