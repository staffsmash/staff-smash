# Staff Smash: HUFS (비공식)

교직원과 학생이 서로의 입장을 웃으면서 겪어 보는 2D 벨트스크롤 액션 게임. 비공식 게임이며, 등장 인물과 부서는 가상이다.

현재 단계: **M0 프로토타입**. 블록형 주인공(주무관) 1명, 잡몹 "새벽 3시 메일" 1종, 이동·점프·대시·3타 콤보·필살기·피격·다운, 깊이 판정, 구역 3개를 넣었다.

## 조작

| 동작 | PC | 모바일 |
|---|---|---|
| 이동 (깊이축 포함) | 방향키 / WASD | 왼쪽 화면 드래그 |
| 대시 | 같은 방향 두 번 | 조이스틱 끝까지 밀기 |
| 처리(공격) | J | A |
| 점프 (공중에서 J = 내려찍기) | K / Space | B |
| 필살기 "전체 공지 발송" | I (게이지가 차면) | SP |
| 일시정지 | Esc / P | II |
| 판정 상자 보기 | ` / F2 | 주소 뒤에 `?debug` |

PC에서 모바일 패드를 시험하려면 주소 뒤에 `?touch`를 붙인다.

## 개발

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # dist/ 생성
npm run preview  # 빌드 결과 확인
```

- 엔진: Phaser 3 + TypeScript, 빌드: Vite
- `main` 브랜치에 올리면 GitHub Actions가 빌드해서 GitHub Pages로 배포한다.
- 에셋 출처는 `assets/CREDITS.md`에 기록한다.
