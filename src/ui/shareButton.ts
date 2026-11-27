import Phaser from 'phaser';
import { heroById } from '../data/heroes';
import { studentHeroById } from '../data/students';
import { DIFF2D } from '../difficulty';
import { gpaText } from '../grade';
import { staffPortraitCanvas, studentPortraitCanvas } from '../portraits';
import { outcomeText, runClock, type RunState } from '../run';
import { HUFS_TEAL } from '../hufs';
import { prepareShare, type ResultShare } from '../shareCard';
import { makeButton } from './button';

// 2D 결과 공유 그림 (PRD 결정 60 7절): 기록 화면(RecordScene)과, 이름을 남긴 뒤 넘어가는 기록판(LeaderboardScene)의 "공유" 단추.
// 화면이 뜰 때 그림을 미리 그려 두고(prepareShare), 누르는 순간 곧바로 share()를 부른다 (아이폰은 미리 준비해야 공유 창이 뜬다).

/** 한 판의 공유 그림 내용. 닉네임은 남겼을 때만 */
export function runShareData(r: RunState, nickname = ''): ResultShare {
  const student = r.mode === 'student';
  const grades = r.stages.map((s) => s.grade);
  const hero = student ? studentHeroById(r.hero) : heroById(r.hero);
  const gradesLine = student
    ? grades.length
      ? `학점 ${grades.join(' · ')} · GPA ${gpaText(grades)}`
      : '학점 없음'
    : grades.length
      ? `근무평정 ${grades.join(' · ')}`
      : '근무평정 없음';
  return {
    game: '2d',
    mode: r.mode,
    diffLabel: (DIFF2D[r.diff] ?? DIFF2D.normal).label,
    heroName: hero.name,
    portrait: student ? studentPortraitCanvas(studentHeroById(r.hero).look) : staffPortraitCanvas(heroById(r.hero).look),
    outcome: outcomeText(r.mode, r.cleared, r.reached, runClock(r), true),
    gradesLine,
    comboLine: r.maxCombo > 0 ? `${student ? '최대 연속 공격' : '최대 연속 처리'} ${r.maxCombo}회` : undefined,
    nickname: nickname || undefined,
    continued: r.continued,
  };
}

/** "공유" 단추. 누른 뒤 결과("그림을 저장했어요" / "공유하지 못했어요")를 단추 글자로 잠깐 보여 준다 */
export function addShareButton(scene: Phaser.Scene, x: number, y: number, w: number, h: number, data: ResultShare): void {
  const prepared = prepareShare(data);
  const label = '공유';
  let busy = false;
  let timer: Phaser.Time.TimerEvent | null = null;
  const btn = makeButton(
    scene,
    x,
    y,
    w,
    h,
    label,
    () => {
      if (busy) return;
      busy = true;
      // 누른 순간 곧바로 부른다 (await 앞에 다른 일을 하지 않는다)
      void prepared.share().then((res) => {
        busy = false;
        if (!scene.sys.isActive()) return;
        const msg = res === 'saved' ? '그림을 저장했어요' : res === 'failed' ? '공유하지 못했어요' : '';
        if (!msg) return;
        btn.text.setText(msg).setFontSize(15);
        timer?.remove();
        timer = scene.time.delayedCall(2600, () => btn.text.setText(label).setFontSize(17));
      });
    },
    HUFS_TEAL,
  );
}
