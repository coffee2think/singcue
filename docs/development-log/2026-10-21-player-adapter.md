# 2026-10-21 playerAdapter: 영상 주소 해석과 IFrame 플레이어 래핑 (#3)

## 1. 배경 / 문제

- PRD F1-1은 영상 주소(watch, youtu.be, shorts, embed)나 영상 ID로 공식 임베드 플레이어에 영상을 준비하고, 잘못된 입력과 임베드 불가 영상을 안내하며 앱이 멈추지 않을 것을 요구한다.
- 기술 설계 문서는 YouTube 의존을 어댑터 뒤에 숨기고, 재생 상태의 기준을 플레이어의 `onStateChange`로 두며 버퍼링을 재생 중으로 본다고 정했다. 오류 처리 위치도 어댑터다.
- 상태 머신(#4)은 다른 세션이 동시에 작업하므로, 이번에는 어댑터가 내보내는 이벤트 타입만 정의하고 상태 머신과의 연결은 하지 않는다.

## 2. 검토한 선택지

- **주소 해석 방식**
  - PoC의 정규식(`youtu.be/`, `?v=`, `/shorts/`, `/embed/` 뒤 11자): 짧지만 호스트를 확인하지 않아 `example.com/watch?v=...`처럼 YouTube가 아닌 주소도 받는다.
  - `URL`로 파싱한 뒤 호스트와 경로를 확인: 코드가 조금 길지만 YouTube 주소만 받고, 경로 형식별 규칙이 분명하다.
- **YT 타입**
  - `@types/youtube` 설치: 전체 API 타입을 얻지만 공용 파일(`package.json`, lockfile)을 바꿔야 한다. 다른 이슈가 병렬로 진행 중이라 충돌 가능성이 있다.
  - 쓰는 부분만 직접 선언: 의존성 추가 없이 필요한 메서드 6개와 이벤트 3개만 타입으로 둔다.
- **시작 전 상태(-1) 처리**: 처음에는 버퍼링·재생만 재생 중으로, 나머지(-1 포함)는 정지로 바꿨다. 실제 브라우저에서 처음 재생할 때 상태가 -1, 3, -1, 3, 1 순서로 와서 재생 도중 잠깐(약 2ms) 정지로 바뀌는 것을 보고, -1을 정지로 바꿀지 알리지 않을지 다시 검토했다.

## 3. 결정 및 이유

- 주소는 `URL`로 파싱해 YouTube 호스트(youtube.com, www, m, music, youtube-nocookie.com, youtu.be)만 받는다. 스킴 없이 붙여 넣은 주소(`youtu.be/...`)는 `https://`를 붙여 해석하고, http/https 외 스킴은 거부한다. 경로 형식은 PRD에 적힌 4가지만 받고 `/live/` 등은 넣지 않았다.
- YT 타입은 직접 선언했다. 공용 파일을 건드리지 않는다는 병렬 작업 조건을 지키기 위해서다.
- 플레이어 상태는 `'playing' | 'stopped'`(`PlayerStatus`, 공통 타입 `PlaybackState`에서 'unready'를 뺀 것)로 바꿔 알린다. 'unready'는 영상을 불러오기 전 앱의 상태라 플레이어가 보낼 일이 없다.
- 시작 전(-1)은 알리지 않기로 했다. -1을 정지로 보내면 처음 재생할 때 재생 중 → 정지 → 재생 중으로 흔들려 상태 머신과 연습 기록(정지로 바뀔 때 기록)에 잡음이 된다. 실제로 확인한 모든 순서에서 -1 앞뒤에 정지(2, 5) 또는 재생(3, 1)이 와서 -1을 빼도 상태가 어긋나지 않았다.
- 같은 상태가 이어지면 한 번만 알린다. 재생 중 이동하면 3, 1이 오는데, 둘 다 재생 중이라 상태 머신 입장에서는 전이가 아니기 때문이다.
- 처음 플레이어를 만들면 상태 변경 이벤트가 오지 않으므로(실제 브라우저에서 확인), 'ready' 이벤트를 "영상이 준비된 정지 상태"로 보면 된다고 주석에 적었다.
- 오류 코드 안내 문구는 YouTube IFrame Player API 문서의 코드(2, 5, 100, 101, 150, 153)마다 두고, 모르는 코드는 번호와 함께 일반 안내를 한다. 실제 브라우저에서 없는 영상 ID를 불러왔을 때 100이 아니라 150이 와서, 101/150 문구는 "퍼가기를 막았거나 볼 수 없는 영상"을 함께 안내하도록 바꿨다.
- 다른 영상 불러오기(`load`)는 `cueVideoById`로 자동재생 없이 준비한다(PRD "영상이 준비된다").

## 4. 구현 내용

`src/adapters/playerAdapter/`

- `parseVideoId.ts`: 주소·ID 해석. 해석할 수 없으면 null
- `playerEvents.ts`: 어댑터 이벤트 타입(`PlayerEvent` = ready | stateChange | error, `PlayerStatus`, `PlayerError`), `toPlayerStatus`(YT 상태 → 재생 상태, -1은 null), `toPlayerError`와 `PLAYER_ERROR_MESSAGES`
- `youtubeIframeApi.ts`: 쓰는 부분만 옮긴 YT 타입, `loadYouTubeIframeApi`(스크립트를 한 번만 넣고 `onYouTubeIframeAPIReady`를 기다림. 기존 콜백은 그대로 부르고, 불러오기에 실패하면 다음 호출에서 다시 시도)
- `createPlayer.ts`: `createPlayer(element, videoId, onEvent)`가 플레이어 준비 후 `PlayerAdapter`(play, pause, seekTo, getCurrentTime, load, destroy)를 돌려준다. `seekTo`는 0보다 앞을 0으로 맞춘다. playerVars는 PoC와 같다(playsinline, rel=0, http(s)에서 origin).
- `index.ts`: 바깥에 공개하는 이름 모음

## 5. 검증 결과

**자동 검증**

- `npm test`: 테스트 파일 5개, 테스트 55개 통과(이번에 추가한 파일 4개)
  - `parseVideoId.test.ts`: 11자 ID와 4가지 주소 형식, 그 변형(파라미터, 스킴 없음, 모바일, nocookie 등) 16건과 -, _ 문자 1건, 잘못된 입력 18건
  - `playerEvents.test.ts`: 상태 변환, 오류 코드별 문구
  - `youtubeIframeApi.test.ts`, `createPlayer.test.ts`: window·document·YT.Player를 **모의 객체로 바꿔** 스크립트 삽입, 준비 콜백, 실패 후 재시도, 이벤트 변환, 메서드 위임을 확인했다. 이 두 파일은 실제 YouTube 동작을 확인하지 않는다.
- `npm run lint`: 오류 없음
- `npm run build`: 통과

**실제 브라우저 확인** (앱 내 브라우저, Chromium 계열, `http://localhost`에서 커밋하지 않은 임시 확인 페이지로 어댑터를 직접 호출)

- IFrame API 스크립트를 불러와 플레이어가 만들어지고 'ready'가 온다. iframe 주소에 playsinline, rel=0, origin이 들어간다.
- `seekTo(30)` 후 `play()` → 'playing', `getCurrentTime()` 약 32.7초. 재생 중 `seekTo(60)` → 약 62.4초, 버퍼링(3)이 왔지만 추가 이벤트 없이 재생 중 유지
- `pause()` → 'stopped', 정지 중에는 `getCurrentTime()` 값이 그대로
- `load()`(shorts 주소에서 해석한 ID) → 'stopped', 위치 0, 자동재생 없음. 이어서 `play()` → 'playing'
- 영상 화면을 직접 클릭해 재생·정지 → 'playing', 'stopped'가 온다(설계 문서의 "사용자가 영상을 직접 눌러도 상태가 어긋나지 않음")
- 없는 영상 ID(`aaaaaaaaaaa`) → `onError` 150과 안내 문구가 오고 페이지 오류 없음. 콘솔 오류 없음
- 원본 상태 순서 기록: 처음 재생 -1, 3, -1, 3, 1 / 재생 중 영상 바꾸기 2, -1, 5 / 재생 중 이동 3, 1

**미확인**

- 오류 코드 2, 5, 100, 101, 153의 실제 발생: 문구만 만들고 모의 테스트로만 확인했다. 150은 없는 영상 ID로만 확인했고, 실제로 퍼가기가 막힌 영상에서는 확인하지 않았다.
- IFrame API 스크립트를 불러오지 못하는 경우(오프라인 등): 모의 테스트로만 확인
- 영상이 끝까지 재생됐을 때(0, 끝남): 모의 테스트로만 확인
- Chrome 정식 브라우저, 다른 브라우저, `file://`로 열었을 때의 동작

## 6. 남은 작업 / 보류 사항

- 상태 머신(#4)과 컨트롤러에서 `PlayerEvent`를 받아 전이하는 연결은 하지 않았다. 'ready'를 준비 전 → 정지 전이로, 'stateChange'를 정지·재생 중 전이로 쓰는 것을 전제로 했다.
- 화면(주소 입력, 오류 안내 표시)은 이 이슈 범위 밖이다. `parseVideoId`가 null이면 "유효한 YouTube 링크가 아닙니다" 같은 입력 오류 안내는 화면 쪽에서 한다.
- 자동재생 차단 감지(시작 명령 후 3초 안에 재생 상태가 안 됨)는 컨트롤러에서 'stateChange' 이벤트로 구현한다.
- `src/adapters/.gitkeep`은 storage(#2) 작업과 겹치지 않도록 이번에는 지우지 않았다.
