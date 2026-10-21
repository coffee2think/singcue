# 2026-10-22 연습 기록 저장과 최소 재생 시간 설정 (#27)

## 1. 배경 / 문제

- PRD F5-1은 구간 재생이 최소 재생 시간(기본 3초) 이상일 때만 연습 1회로 세고 이 값을 설정에서 바꿀 수 있게, F5-2는 1회마다 구간·날짜와 시각·재생 시간을 브라우저 저장소에 남겨 새로고침해도 유지되게 요구한다. 기술 설계 문서는 저장 키를 `singcue:log`(전체 하나)로, 저장 공간 부족 시 "저장 실패를 알리고 JSON 내보내기를 권함"으로 정했다.
- 판정은 #26 `practiceCounter`(순수 함수, `start`·`lap`·`stop` 입력)가, 자동 반복의 바퀴 완료는 #13 `usePlayback.subscribeLap`이 이미 만들어 두었다. #24 결정으로 자동 반복은 바퀴마다 1회로 센다. 이번 작업은 이 둘을 이어 저장하고 화면에 연결하는 일이다.
- 제약: #22가 다른 세션에서 `App.tsx`, `usePlayback.ts`, `playback.ts`, `useVoice.ts`, `VoicePanel`을 동시에 고치고 있어, 1단계에서 고칠 수 있는 파일을 `storage.ts`, 새 `usePracticeLog.ts`, `SettingsPanel.tsx`, `settingsForm.ts`와 각 테스트로 정했다. `App.tsx`에는 #22 병합 뒤 연결만 추가한다. `types.ts`·`usePlayback.ts`는 고치지 않는다.

## 2. 검토한 선택지

- **저장 함수를 두는 곳**
  - `exportBackup`처럼 저장소를 받는 독립 함수(`appendLog(records, store)`): `StorageAdapter`를 받는 다른 훅들과 모양이 달라진다.
  - `StorageAdapter`에 `loadLog`·`appendLog`를 더하기: 기존 함수 시그니처는 그대로이고, 훅이 설정과 기록을 같은 어댑터로 다룬다. 어댑터 객체를 직접 만드는 테스트 대역이 없어 다른 파일에 영향이 없다.
- **재생 상태 전이를 이벤트로 바꾸는 방법**
  - 이전 상태를 ref에 두고 전이를 비교하기
  - `playing`·영상·구간을 의존성으로 하는 effect에서 시작 시 `start`, 정리(cleanup) 시 `stop`을 보내기: 재생 종료·영상 교체·구간 변경·화면에서 빠짐이 모두 정리 함수 한 곳으로 모인다.
- **저장 실패 안내 위치**: `App.tsx`는 연결만 추가하기로 했고 새 컴포넌트 파일은 범위 밖이라, 허용 범위 안에서 JSON 내보내기 버튼과 가장 가까운 `SettingsPanel`(백업 패널 바로 위)에 두었다.

- **App.tsx 연결 시점**: 1단계(위 파일)를 커밋·push한 뒤 #22 병합을 기다렸다. #22(PR #54)가 병합된 것을 확인하고 `origin/main`(bd96f19)을 merge commit으로 반영한 뒤 `App.tsx`에 연결만 추가했다(2단계). 병합 때 충돌은 없었다.

## 3. 결정 및 이유

- **저장**: `StorageAdapter`에 `loadLog()`와 `appendLog(records)`를 추가했다(기존 함수 시그니처 변경 없음). `appendLog`는 형식이 맞는 기존 기록(`readLog`, #18 내보내기와 같은 함수) 뒤에 덧붙여 `singcue:log` 전체를 다시 쓴다. 쓰기 실패는 기존 `write`와 같이 `SaveResult`(`quota-exceeded`·`write-error`)로 돌려주며 저장소는 그대로다. 그 결과 #18 백업의 `exportBackup().log`·`importBackup`이 같은 키·같은 읽기 규칙을 쓰므로 새로 쌓은 기록이 그대로 내보내지고, 불러온 기록 뒤에 다음 기록이 이어 붙는다(테스트로 확인).
  - 형식이 틀린 기존 기록은 덧붙여 쓸 때 빠진다. 내보내기도 같은 기준으로 빼므로 그대로 두었다.
- **`usePracticeLog`**: 판정 상태·저장·오류를 `createPracticeLogger(storage)`로 떼어 React 없이 테스트하고, 훅은 effect 연결과 `useSyncExternalStore`로 오류 표시만 맡는다.
  - 재생 중이 되면 `start`(`videoId`, 고른 구간 `section.id`), 재생 중이 끝나거나 영상·구간이 바뀌거나 화면에서 빠지면 `stop`. 재생 중에 다른 구간을 고르면 이전 구간 바퀴를 닫고 새 구간으로 시작한다(`practiceCounter`가 재생 중 `start`를 받는 경우와 같은 판정).
  - 최소 재생 시간은 판정할 때마다 `singcue:settings`에서 읽는다. `usePlayback`이 프리롤·구간 끝 동작을 쓸 때마다 읽는 것과 같은 방식이라, 설정 패널에서 바꾼 값이 다음 판정부터 반영된다.
  - 저장에 실패한 기록은 메모리에 두었다가 다음 기록과 함께 다시 저장한다. 다음 저장에 성공하면 안내가 사라진다. 새로고침하면 사라지므로 안내 문구에 적었다.
- **바퀴 완료 → `lap` 시각 변환 근거**: `lap.at = startedAt + seconds * 1000`.
  - `playback.ts`의 `checkSectionEnd`는 `seconds = (now - watch.lapStartedAt) / 1000`으로 계산하고 다음 바퀴 시작을 같은 `now`로 잡는다. 따라서 이 식은 usePlayback이 바퀴 끝으로 본 시각 `now`를 그대로 되살리며(부동소수 오차 수준), 다음 바퀴 시작 시각과도 맞는다.
  - 리스너가 같은 틱에서 불리므로 `Date.now()`를 써도 거의 같지만, 리스너 호출 시점에 기대지 않도록 바퀴 값에서 계산했다.
  - `practiceCounter`는 재생 시간을 자기 바퀴 시작 시각과의 차로 계산한다. 첫 바퀴의 시작은 이 훅의 effect가 잡은 `Date.now()`이고 usePlayback의 바퀴 시작도 같은 커밋의 effect에서 잡으므로 차이는 수 ms 이하로 본다. 두 번째 바퀴부터는 위 식 덕분에 같은 시각을 쓴다.
  - `lap.section`은 쓰지 않는다. 구간은 `start` 때 넘긴 고른 구간을 기준으로 한다.
- **최소 재생 시간 입력**: PRD에 범위가 "변경 가능"으로만 있어 프리롤과 같은 0 이상의 숫자(초)로 받고, `parsePreroll`을 그대로 썼다. 0초면 구간을 재생할 때마다 기록된다.

## 4. 구현 내용

**1단계**(#22 병합 전, commit 9f81e4f)
- `src/adapters/storage.ts`: `StorageAdapter.loadLog`, `StorageAdapter.appendLog` 추가. `readLog` 주석 갱신
- `src/controller/usePracticeLog.ts`(새 파일): `lapEvent`, `createPracticeLogger`, `usePracticeLog({ playback, videoId, section, storage })` → `{ error, dismissError }`
- `src/ui/settingsForm.ts`: `PanelSettings`·`SettingsDraft`·검증에 `minPracticeSeconds` 추가
- `src/ui/SettingsPanel.tsx`: 최소 재생 시간 입력란, `practiceLogError`·`onDismissPracticeLogError` prop과 저장 실패 안내(백업 패널 위, JSON 내보내기 권함)
- `src/ui/SettingsPanel.css`(새 파일): 저장 실패 안내 배치. `app.css`는 고치지 않았다
- 테스트: `storage.test.ts`(연습 기록 7개), `usePracticeLog.test.ts`(새 파일 10개), `settingsForm.test.ts`(최소 재생 시간)

**2단계**(#22 병합 뒤)
- `origin/main`(bd96f19, #22 PR #54 병합)을 merge commit으로 반영. 충돌 없음
- `src/ui/App.tsx`: `usePracticeLog` 호출(영상 ID는 준비된 영상만, 고른 구간, 같은 `storage`)과 `SettingsPanel`에 오류·닫기 prop 전달만 추가했다. #22가 바꾼 `useVoice` 호출과 `getCurrentTime`은 건드리지 않았다
- 브라우저 확인 중 저장 실패 안내의 위쪽 여백이 `app.css`의 `.message { margin: 0 }`(나중에 불림)에 덮이는 것을 발견해, `SettingsPanel.css`의 선택자를 `.message.practice-log-error`로 바꿨다

## 5. 검증 결과

**자동 검사**(2단계 반영 뒤)
- `npx vitest run`: 테스트 파일 28개, 테스트 486개 통과
- `npm run lint`: 오류 없음
- `npm run build`: `tsc -b`와 `vite build` 통과

**실제 브라우저 확인**(앱 내 브라우저, `vite --port 5227`, 영상 `dQw4w9WgXcQ`, 구간 0:20~0:26을 저장소에 넣어 두고 화면에서 골라 재생 버튼으로 시작. 설정은 화면의 설정 패널에서 바꿔 저장)
- 자동 정지, 최소 3초: 재생 → 자동 정지로 `singcue:log`에 1건 저장(`seconds` 8.014, 프리롤 1.5초와 버퍼링 포함). 구간 ID·영상 ID·ISO 시각이 들어 있음: 확인
- 2초 재생 뒤 정지 버튼: 기록되지 않음: 확인
- 자동 반복: 약 20초 재생 뒤 정지 버튼 → 바퀴 2건(7.501, 7.751초)과 마지막 바퀴 1건(4.759초) 저장. 두 번째·세 번째 기록의 `at`이 직전 기록의 `at + seconds`와 정확히 같아(16:04:15.504 + 7.501 = 16:04:23.005, + 7.751 = 16:04:30.756) 바퀴 완료 → `lap` 시각 변환이 의도대로 이어짐: 확인
- 최소 재생 시간 변경: 설정 패널에서 10초로 저장 → 자동 정지(약 8초) 2번 모두 기록되지 않음(도중에 상태가 "재생 중"인 것을 확인). 5초로 저장 → 다음 재생(8.267초)이 기록됨. 새로고침 없이 다음 판정부터 반영: 확인
- 새로고침 후 유지: 새로고침 뒤 기록 5건과 최소 재생 시간 입력란 "5"가 그대로: 확인
- 저장 실패: `Storage.prototype.setItem`을 바꿔 `singcue:log` 쓰기에서 `QuotaExceededError`를 던지게 한 뒤 재생 → 설정 패널 아래·백업 패널 바로 위에 `role="alert"` 안내("저장 공간이 부족해 … JSON 내보내기 …")가 표시되고 저장소 기록은 그대로: 확인. 쓰기를 되돌린 뒤 다시 재생 → 실패했던 기록(8.012초)과 새 기록(7.763초)이 함께 저장되고 안내가 사라짐: 확인
- JSON 내보내기와의 연결: dev 서버의 `exportBackup()`을 직접 불러 `log`에 위 기록 7건이 모두 들어 있는 것을 확인. 화면의 내보내기 버튼으로 파일을 받는 것은 하지 않았다
- 이번 확인 중 #53(이동 직후 버퍼링 중 정지 무시)은 만나지 않았다

**미확인**
- 저장 실패 안내의 화면 모양: 앱 내 브라우저 창이 가려져 있어 스크린샷이 그려지지 않았다. 계산된 스타일(`display: flex`, 오류 색, 위 여백 24px)과 문구·위치(DOM 순서)만 확인했다. "닫기" 버튼은 단위 테스트(`dismissError`)로만 확인
- 실제 `localStorage` 용량을 채운 저장 공간 부족: 위처럼 예외를 흉내 내어 확인했다
- 음성 시작·정지 명령으로 재생·정지할 때의 기록: 마이크를 쓰지 않아 확인하지 않았다. 재생 상태 전이는 버튼과 같은 경로(`usePlayback.state`)라 같게 동작할 것으로 예상한다
- 재생 중 다른 구간을 고르는 경우, 영상 화면을 직접 눌러 재생하는 경우, 구절 인식 점프(#22)로 재생하는 경우: 브라우저에서 확인하지 않았다

## 6. 남은 작업 / 보류 사항

- 구간은 재생을 시작할 때 **고른 구간**으로 기록한다. 구절 인식 점프(#22 `playAt`)로 고른 구간 밖으로 이동해 재생해도 고른 구간으로 기록되고, 구간을 고르지 않았으면 기록하지 않는다. `usePlayback`이 지금 재생 중인 구간을 알려 주지 않아(마지막 `play` 구간은 내부 ref) 이 파일 범위에서는 정할 수 없었다. 필요하면 리포트(F5-3) 단계에서 다시 본다
- 저장에 실패한 기록은 메모리에만 있어 새로고침하면 사라지고, JSON 내보내기에도 들어가지 않는다(안내 문구에 적음)
- 저장 실패 안내가 페이지 아래쪽 설정 패널에 있어 재생 중에는 바로 보이지 않을 수 있다. 화면 위쪽 안내가 필요하면 `App.tsx`나 새 컴포넌트에서 다룬다(이번 범위 밖)
- 리포트(F5-3)에서 `at`(바퀴 시작 시각) 기준으로 날짜를 셀지 다시 볼 수 있다(#26 기록과 같음)
