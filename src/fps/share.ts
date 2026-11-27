import { prepareShare, type PreparedShare, type ResultShare } from '../shareCard';

// 1인칭 결과 화면(교직원·학생, 성공·실패 모두)의 "공유" 단추 (PRD 결정 60 · 7절).
// 결과 화면이 뜰 때 그림을 미리 그려 두고(아이폰은 누른 순간 곧바로 공유 창을 불러야 한다), 누르면 share().
// 기록판에 닉네임을 남기면(board.ts가 ".frec-done b"에 이름을 쓴다) 닉네임을 넣어 그림을 다시 그린다.

const params = new URLSearchParams(location.search);

/** 시험용 (?debug): 마지막으로 준비한 공유 그림 내용 */
export const lastShare: { data: ResultShare | null; sh: PreparedShare | null } = { data: null, sh: null };

/** 결과 화면 패널에 "공유" 단추를 붙인다 (처음 화면 단추 앞). 단추 아래 한 줄로 결과를 알린다 */
export function attachShareButton(root: HTMLElement, data: ResultShare): void {
  const panel = (root.querySelector('.panel') as HTMLElement | null) ?? root;
  let cur = data;
  let sh = prepareShare(cur);
  lastShare.data = cur;
  lastShare.sh = sh;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'shareBtn';
  btn.className = 'ghost';
  btn.textContent = '공유';
  const msg = document.createElement('p');
  msg.className = 'share-msg';
  msg.setAttribute('aria-live', 'polite');
  msg.style.cssText = 'margin: 6px 0 0; font-size: 13px; color: #c9d3e6';
  const anchor = panel.querySelector('#titleBtn');
  if (anchor) anchor.before(btn);
  else panel.appendChild(btn);
  // 단추 줄이 끊기지 않게 알림 줄은 패널 맨 아래
  panel.appendChild(msg);
  // 단추에서 Enter·Space가 결과 화면 키(다시 하기)로 새지 않게
  btn.addEventListener('keydown', (e) => e.stopPropagation());
  btn.addEventListener('click', () => {
    msg.textContent = '';
    void sh.share().then((r) => {
      if (r === 'saved') msg.textContent = '그림을 저장했어요';
      else if (r === 'failed') msg.textContent = '공유하지 못했어요';
    });
  });
  // 기록판에 닉네임을 남겼으면 닉네임을 넣어 다시 그린다 (익명이면 그대로)
  const obs = new MutationObserver(() => {
    if (!panel.isConnected) {
      obs.disconnect();
      return;
    }
    const nick = panel.querySelector('.frec-done b')?.textContent?.trim() ?? '';
    if (!nick || nick === cur.nickname) return;
    cur = { ...cur, nickname: nick };
    sh = prepareShare(cur);
    lastShare.data = cur;
    lastShare.sh = sh;
  });
  obs.observe(panel, { childList: true, subtree: true });
}

if (params.has('debug')) Object.assign(window as object, { __fpsShare: lastShare });
