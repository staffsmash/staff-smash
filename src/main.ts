import Phaser from 'phaser';
import { DEBUG_DEFAULT, FORCE_TIMER, GAME_W, GAME_H } from './config';
import { TitleScene } from './scenes/TitleScene';
import { SelectScene } from './scenes/SelectScene';
import { StageScene } from './scenes/StageScene';
import { ResultScene } from './scenes/ResultScene';
import { EndingScene } from './scenes/EndingScene';
import { StudentEndingScene } from './scenes/StudentEndingScene';
import { RecordScene } from './scenes/RecordScene';
import { LeaderboardScene } from './scenes/LeaderboardScene';
import { follow2d } from './sound';

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
  // 소리는 src/sound.ts가 따로 낸다 (Phaser 자체 AudioContext는 만들지 않는다)
  audio: { noAudio: true },
  fps: { target: 60, forceSetTimeOut: FORCE_TIMER },
  scene: [TitleScene, SelectScene, StageScene, ResultScene, EndingScene, StudentEndingScene, RecordScene, LeaderboardScene],
});

// 효과음·배경음악: 판·보스전·화면에 맞춰 곡을 고른다
follow2d(game);

// 디버그 모드에서는 콘솔에서 상태를 볼 수 있게 한다
if (DEBUG_DEFAULT) (window as unknown as { __game: Phaser.Game }).__game = game;
