# 2026-10-21 storage 어댑터: 설정·영상 데이터 저장 (#2)

## 1. 배경 / 문제

- 구간(F1-3), 가사 매핑(F3-4), 설정(F2-9)을 새로고침 후에도 유지하려면 브라우저 저장소에 읽고 쓰는 모듈이 필요했다.
- 기술 설계 문서는 저장 키를 `singcue:settings`, `singcue:video:<videoId>`로 정했고, 저장 공간 부족(localStorage 쓰기 예외) 때도 앱을 멈추지 않고 실패를 알리도록 정했다.
- localStorage 값은 사용자가 직접 고치거나 이전 형식이 남아 있을 수 있어, 그대로 믿고 쓰면 화면이나 핵심 로직이 잘못된 값으로 오류를 낼 수 있다.

## 2. 검토한 선택지

- **테스트에서 localStorage를 준비하는 방법**
  - Vitest 환경을 jsdom 등으로 바꾸기: 실제와 비슷하지만 의존성(`package.json`)이 늘고, 같은 시기에 병렬로 진행 중인 #3, #4 작업과 공용 파일 충돌 가능성이 생긴다. jsdom에서 저장 공간 부족을 재현하려면 결국 모의 객체가 필요하다.
  - 저장소를 인자로 받기(`createStorage(store)`): 의존성 추가 없이 메모리 구현과 "쓰기 때 예외를 던지는 저장소"를 넣어 모든 경우를 검증할 수 있다. 인자를 생략하면 전역 `localStorage`를 쓴다.
- **값이 일부만 손상된 경우의 처리**
  - 전체를 기본값으로 되돌리기: 단순하지만, 설정 항목 하나만 틀려도 사용자가 고친 명령어 등이 모두 사라진다.
  - 항목별로 형식을 확인해 틀린 항목만 기본값으로 채우기(설정), 형식이 틀린 구간·구절만 버리기(영상 데이터): 남길 수 있는 데이터를 최대한 살린다.
- **쓰기 실패를 알리는 방법**: 예외를 다시 던지기와 결과 값(`SaveResult`)으로 돌려주기를 비교했다. 설계 문서의 "앱을 멈추지 않는다" 원칙과 인수 조건에 맞춰 결과 값으로 정했다.

## 3. 결정 및 이유

- `createStorage(store?)` 팩토리로 저장소를 주입한다. Vitest 환경을 바꾸지 않아 공용 설정 파일을 수정하지 않았다.
- 읽기는 값이 없음, JSON 파싱 실패, 객체가 아닌 값, `getItem` 예외, localStorage 접근 불가 모두 기본값을 돌려준다.
  - 설정: 항목별로 형식을 확인하고 틀리거나 빠진 항목만 `DEFAULT_SETTINGS` 값으로 채운다. 배열은 복사해 돌려줘 `DEFAULT_SETTINGS`가 바뀌지 않게 했다.
  - 영상 데이터: 기본값은 `{ videoId, sections: [], lines: [], endT: null }`. 형식이 틀린 구간·구절만 버리고, `videoId`는 저장 키의 값을 쓴다.
- 쓰기는 예외를 던지지 않고 `SaveResult`를 돌려준다. `QuotaExceededError`(Chrome·Safari)와 `NS_ERROR_DOM_QUOTA_REACHED`(예전 Firefox)는 `reason: 'quota-exceeded'`, 그 밖의 예외와 localStorage를 쓸 수 없는 환경은 `reason: 'write-error'`로 구분했다. 화면이 저장 공간 부족일 때만 "JSON 내보내기를 권함" 안내를 고를 수 있게 하기 위해서다.
- `singcue:log`(연습 기록)와 JSON 내보내기·불러오기는 이번 이슈의 인수 조건에 없어 넣지 않았다.

## 4. 구현 내용

- `src/adapters/storage.ts`
  - `SETTINGS_KEY`, `videoKey(videoId)`: 저장 키
  - `createStorage(store?)`: `loadSettings`, `saveSettings`, `loadVideo`, `saveVideo`를 가진 어댑터를 만든다
  - `SaveResult`: `{ ok: true } | { ok: false; reason: 'quota-exceeded' | 'write-error'; error }`
  - `defaultVideoData(videoId)`: 영상 데이터 기본값
- `src/adapters/storage.test.ts`: 메모리 저장소와 예외를 던지는 저장소로 24개 테스트

## 5. 검증 결과

- `npm test`: 테스트 파일 2개, 테스트 26개 통과(storage 24개, 기존 defaultSettings 2개)
  - 인수 조건 1(키 읽기·쓰기): 두 키에 JSON으로 쓰고 새 어댑터로 같은 값을 읽는 것을 확인
  - 인수 조건 2(기본값): 값 없음, 손상된 JSON, 빈 문자열, `null`·배열·숫자·문자열, 일부 항목 손상을 확인
  - 인수 조건 3(쓰기 예외): `QuotaExceededError` DOMException을 던지는 저장소에서 예외 없이 `quota-exceeded` 결과를 돌려주고, 이후 읽기도 정상인 것을 확인
- 테스트가 실제로 결함을 잡는지 확인: 쓰기의 예외 처리를 일부러 망가뜨리면 7개, 읽기의 예외 처리를 없애면 4개 테스트가 실패하는 것을 확인했다(확인 후 원래 코드로 되돌림).
- `npm run lint`: 오류 없음
- `npm run build`: `tsc -b`와 `vite build` 통과
- 실제 브라우저 확인: 개발 서버(별도 포트)를 앱 내 브라우저(Chromium 기반)로 열고 콘솔에서 모듈을 불러와 확인했다.
  - 실제 localStorage에 두 키로 저장·재읽기, 손상된 JSON에서 기본값 반환
  - localStorage를 가득 채워 실제 `QuotaExceededError`가 나는 상태에서 `saveVideo`가 예외 없이 `{ ok: false, reason: 'quota-exceeded' }`를 돌려주고, 저장된 설정은 계속 읽히는 것을 확인
- 미확인
  - 데스크톱 Chrome에서의 확인(앱 내 브라우저는 Chromium 기반이지만 같은 브라우저는 아니다. 저장 한도도 이 브라우저에서는 약 50MB로 나와 일반 Chrome과 다를 수 있다)
  - 화면에서 저장 실패 안내가 표시되는지(이 어댑터를 쓰는 화면이 아직 없다)

## 6. 남은 작업 / 보류 사항

- `singcue:log` 읽기·쓰기와 JSON 내보내기·불러오기(`{ version, settings, videos, log }`)는 해당 이슈(F5-2, F5-4, F3-4)에서 이 어댑터에 추가한다.
- 저장 실패 결과를 받아 "저장 실패, JSON 내보내기 권장"을 안내하는 화면은 컨트롤러·화면 작업에서 연결한다.
- `src/adapters/.gitkeep`은 병렬 작업(#3)과 같은 폴더를 쓰므로 이번에는 지우지 않았다.
