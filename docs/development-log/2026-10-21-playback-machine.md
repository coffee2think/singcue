# 2026-10-21 재생 상태 머신과 프리롤 계산 (#4)

## 1. 배경 / 문제

- 버튼 재생·정지(F1-5)와 이후 음성 명령(F2-2, F2-3), 구간 끝 동작(F2-8)이 모두 "지금 재생 상태가 무엇인가"에 의존한다. 기술 설계 문서는 이 상태를 준비 전·정지·재생 중 셋으로 두고, YouTube 플레이어의 상태 변경 이벤트를 기준으로 삼도록 정했다.
- F1-5가 "선택한 구간의 시작 위치(프리롤 적용)부터 재생"을 요구하므로, 단계 2의 F2-7 계산 규칙(`max(0, start − preroll)`)을 이번에 먼저 구현한다. 프리롤 설정 화면은 단계 2(#14) 범위다.
- playerAdapter(#3)와 storage(#2)가 다른 작업으로 동시에 진행 중이라, core는 어댑터 코드 없이 독립적으로 동작해야 했다.

## 2. 검토한 선택지

- **reducer가 받는 이벤트 형태**
  - YouTube 상태 코드(-1, 0, 1, 2, 3, 5)를 그대로 받기: 어댑터 변환이 필요 없지만 core가 YouTube API 세부에 묶인다.
  - 앱 기준 이벤트(`loaded`, `playing`, `buffering`, `paused`, `ended`, `error`, `unloaded`)를 core에 정의하고 어댑터가 변환하기: core가 플레이어 종류와 무관해지고 테스트가 읽기 쉽다.
- **준비 전 상태에서 벗어나는 조건**
  - `loaded` 이벤트를 받아야만 정지로 가기: 상태 전이가 엄격하지만, 어댑터가 `loaded` 없이 바로 재생 이벤트를 보내면(자동 재생 등) 실제 플레이어와 상태가 어긋난다.
  - 플레이어 이벤트가 곧 현재 상태를 뜻한다고 보고, 어느 상태에서든 이벤트에 맞는 상태로 가기: 설계 문서의 "상태의 기준은 플레이어 이벤트" 원칙과 맞고, 사용자가 영상을 직접 눌러도 어긋나지 않는다.

## 3. 결정 및 이유

- 앱 기준 이벤트 타입 `PlayerEvent`를 `src/core/playbackMachine.ts`에 정의했다. 작업 지시상 core는 어댑터에 의존하지 않아야 하고, reducer가 받는 이벤트 타입은 core 쪽에 둔다. playerAdapter는 이 형태로 변환해 전달하면 된다.
- 전이는 현재 상태와 상관없이 이벤트가 결정하도록 했다(`playing`·`buffering` → 재생 중, `loaded`·`paused`·`ended` → 정지, `error`·`unloaded` → 준비 전). 플레이어가 상태의 기준이라는 설계 원칙을 그대로 따른 것이다. #3 인수 조건에 따라 어댑터가 버퍼링을 재생 중으로 바꿔 보내더라도, reducer가 `buffering`을 직접 받아도 같은 결과가 나오게 했다.
- 임베드 불가 등 `error`는 준비 전으로 보냈다. 재생할 수 없는 영상이면 음성 명령을 모두 무시하는 준비 전 상태가 맞다고 판단했다(오류 안내 문구는 #3 어댑터 몫).
- 알 수 없는 이벤트가 들어오면 상태를 유지한다. 타입상으로는 들어올 수 없지만, 런타임에 잘못된 값이 와도 상태가 깨지지 않게 했다.
- 상태 타입은 #1에서 만든 `types.ts`의 `PlaybackState`('unready' | 'stopped' | 'playing')를 그대로 썼다.
- `prerollStart(start, preroll)`은 이슈 문구 그대로 `Math.max(0, start - preroll)`로 두었다. 프리롤이 0초 이상인지는 설정 저장·입력 단계(#2, #14)의 검증 몫으로 보고 여기서 따로 막지 않았다.
- 구간 끝 동작(F2-8)은 #13 범위라 이번에 넣지 않았다.

## 4. 구현 내용

- `src/core/playbackMachine.ts`
  - `PlayerEvent` 타입, `INITIAL_PLAYBACK_STATE`('unready')
  - `playbackReducer(state, event)`: 순수 함수 reducer
  - `prerollStart(start, preroll)`: 재생 시작 위치 계산
- `src/core/playbackMachine.test.ts`
  - 세 상태 × 일곱 이벤트, 21가지 전이를 모두 확인
  - 불러오기 → 버퍼링 → 재생 → 멈춤 → 재생 → 끝 → 영상 없음 흐름
  - 알 수 없는 이벤트에서 상태 유지
  - 프리롤 계산: 일반(10초, 1.5초 → 8.5초), 기본 설정값 사용, 시작이 프리롤보다 앞(0초로 고정), 시작과 프리롤이 같음, 프리롤 0
- 공용 파일(`package.json`, `types.ts` 등)은 수정하지 않았다.

## 5. 검증 결과

- `npm test`: 테스트 파일 2개, 테스트 30개 통과(이번에 추가 28개, 기존 2개)
- `npm run lint`: 오류 없음
- `npm run build`: `tsc -b`와 `vite build` 통과
- 수행하지 않은 검증(미확인)
  - 실제 YouTube 플레이어 이벤트와의 연결: playerAdapter(#3)와 컨트롤러(#7)가 아직 없어 확인하지 못했다. 어댑터가 YouTube 상태 코드를 `PlayerEvent`로 바꾸는 규칙이 이 기록의 결정과 맞는지는 #3·#7에서 확인해야 한다.
  - 화면에서 버튼으로 프리롤이 적용된 위치부터 재생되는지: #7 범위라 확인하지 못했다.

## 6. 남은 작업 / 보류 사항

- playerAdapter(#3)가 YouTube 상태 코드를 `PlayerEvent`로 변환해야 한다. 예상 대응: unstarted(-1)·cued(5) → `loaded`, playing(1) → `playing`, buffering(3) → `buffering` 또는 `playing`, paused(2) → `paused`, ended(0) → `ended`, `onError` → `error`.
- 구간 끝 동작(F2-8)은 #13, 자동 반복 시 프리롤 재적용 여부는 #24에서 정한다.
- 프리롤 설정 화면과 입력값 검증은 #14에서 만든다.
