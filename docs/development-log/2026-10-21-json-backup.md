# 2026-10-21 JSON 백업 내보내기·불러오기 (#18)

## 1. 배경 / 문제

- PRD F3-4는 입력한 매핑을 JSON 파일로 내보내고 불러오면 같은 구절과 시간이 복원되고, 데이터는 사용자 기기에만 저장하라고 정한다. F5-4는 기록을 백업하고, 사이트 데이터를 지우면 사라진다는 안내를 화면에 표시하라고 정한다.
- 기술 설계 문서의 "데이터 구조와 저장"은 전체를 하나의 JSON 파일(`{ version, settings, videos, log }`)로 내보내고 불러오며, `version`으로 형식 변경을 거부하거나 변환하고, 형식이 맞지 않으면 기존 데이터를 건드리지 않고 오류를 안내하라고 정한다.
- localStorage 읽기·쓰기는 storage 어댑터(#2)에 이미 있다. 이번 작업은 그 위에 백업 기능과 화면을 얹는 것이다.
- 다른 세션(#11)이 `App.tsx`를 동시에 고치고 있어, 이번 작업은 `storage.ts`, `storage.test.ts`, `SettingsPanel.tsx`와 새 `BackupPanel.tsx`·`BackupPanel.css`만 고치기로 범위를 정했다. `storage.ts`의 기존 함수 시그니처는 바꾸지 않는다.

## 2. 검토한 선택지

- **불러올 때 형식 확인의 엄격함**: 저장소에서 읽을 때(`loadVideo`)처럼 틀린 구절·구간만 버리고 나머지를 받기와, 하나라도 틀리면 파일 전체를 거부하기. 앞의 방법은 일부만 복원돼도 사용자가 알아채기 어렵다.
- **불러오기 범위**: 저장된 영상 데이터를 모두 지우고 파일 내용으로 바꾸기와, 파일에 있는 영상만 덮어쓰고 나머지는 두기. 모두 바꾸면 파일에 없는 영상 데이터가 사라진다.
- **영상 키를 찾는 방법**: 기존 `KeyValueStore`(`getItem`, `setItem`)로는 저장된 영상 키를 알 수 없다. 기존 타입을 넓히면 기존 함수의 시그니처가 바뀌므로, 백업 함수만 받는 새 타입을 두기로 했다.
- **백업 화면 위치**: `App.tsx`에 따로 붙이기와 `SettingsPanel` 안에 붙이기. 이번 작업 범위에서 `App.tsx`를 고치지 않으므로 `SettingsPanel` 안에 붙였다.

## 3. 결정 및 이유

- 파일 형식은 `{ version: 1, settings, videos: VideoData[], log: PracticeRecord[] }`이다. `videos`는 영상 ID를 키로 하는 객체 대신 `VideoData` 목록으로 두었다. `VideoData`에 이미 `videoId`가 있어 키와 값이 어긋날 일이 없다. 같은 `videoId`가 두 번 나오면 형식 오류로 본다.
- 불러올 때는 JSON 파싱 → `version` 확인 → 모든 항목의 형식 확인을 먼저 끝내고, 하나라도 틀리면 아무것도 쓰지 않는다. 오류 이유는 `invalid-json`, `unsupported-version`, `invalid-format` 세 가지로 나눠 화면에서 다르게 안내한다. 지금은 version 1만 있어 다른 version은 거부한다(변환은 형식이 바뀔 때 추가).
- 쓰는 도중 저장 공간 부족 등으로 실패하면, 쓰기 전에 읽어 둔 원래 값으로 되돌린다. 되돌릴 때는 쓴 키를 먼저 모두 지워 공간을 비운 뒤 원래 값을 쓴다. 키마다 지우고 바로 쓰면 아직 남은 새 값 때문에 원래 값이 다시 넘칠 수 있었다(테스트에서 실제로 실패해 순서를 바꿨다).
- 설정과 연습 기록은 파일 내용으로 바꾸고, 영상 데이터는 파일에 있는 영상만 덮어쓴다. 이 규칙을 백업 화면에 문구로 표시한다.
- 파일에 있던 알 수 없는 항목(예: 영상에 붙은 다른 필드)은 저장하지 않는다. 기존 `toSettings`·`toVideoData`로 한 번 더 걸러 형식에 있는 항목만 쓴다.
- 파일은 브라우저에서 `Blob`과 `<a download>`로 만들고, 불러오기는 `<input type="file">`과 `File.text()`로 읽는다. 네트워크 요청은 하지 않는다.
- `SettingsPanel`의 최상위를 `<form>`에서 fragment로 바꾸고 `<form>` 뒤에 `<BackupPanel>`을 형제로 붙였다. form 안에 두면 백업 버튼이 설정 저장 form에 섞인다. 백업을 불러오면 설정 입력란도 불러온 설정으로 바꾸고 `onChange`로 알린다.

### 연습 기록(`log`)

- 연습 기록(PRD F5, `practiceCounter`)은 아직 구현되지 않았고 `singcue:log`를 쓰는 곳도 없다. 타입(`PracticeRecord`)과 저장 키는 기술 설계 문서에 정해져 있다.
- 그래서 저장 키 `singcue:log`(`LOG_KEY`)를 storage에 추가하고, 내보낼 때 형식이 맞는 기록만 읽어 넣는다. 지금은 항상 빈 목록 `[]`이 나간다.
- 불러올 때는 `log`가 배열이고 모든 기록이 `PracticeRecord` 형식이어야 받으며, 파일의 기록으로 `singcue:log`를 바꾼다.
- 단계 5에서 연습 기록을 구현할 때 같은 키와 형식을 쓰면 백업이 그대로 이어진다. 연습 기록을 읽고 쓰는 일반 함수(`loadLog` 등)는 이번에 만들지 않았다.

## 4. 구현 내용

`src/adapters/storage.ts` (기존 함수와 시그니처는 그대로, 아래만 추가)

- `LOG_KEY`, `BACKUP_VERSION`(1), `Backup`, `BackupStore`(`KeyValueStore` + `length`, `key`, `removeItem`), `BackupParseResult`, `ImportResult`
- `exportBackup(store)`: 설정, `singcue:video:` 키 전체(영상 ID 순), 연습 기록을 모은다. 읽기 규칙은 `loadSettings`·`loadVideo`와 같다.
- `serializeBackup(backup)`: 들여쓰기 2칸 JSON
- `parseBackup(text)`: 형식 확인
- `importBackup(text, store)`: 확인 후 쓰기, 실패하면 되돌리기

`src/ui/BackupPanel.tsx`, `src/ui/BackupPanel.css`

- "JSON 내보내기"(파일 이름 `singcue-backup-YYYY-MM-DD.json`, 기기 시간대 날짜), "JSON 불러오기"(숨긴 파일 입력란을 연다), 기기에만 저장된다는 안내와 사이트 데이터 삭제 안내(F5-4), 불러오기 규칙 안내, 결과 안내(`role="status"`, 오류는 `role="alert"`와 "기존 데이터는 그대로입니다.")

`src/ui/SettingsPanel.tsx`

- `<BackupPanel>` 연결, 불러온 설정을 입력란에 반영

`src/adapters/storage.test.ts`

- 테스트 28개 추가(내보내기 5개, 불러오기 23개). 형식 오류 17가지, 저장 공간 부족 중 되돌리기, 알 수 없는 항목 버리기 포함. 테스트의 구절은 모두 직접 만든 가상의 구절이다.

## 5. 검증 결과

**자동 검증**

- `npm test`: 테스트 파일 24개, 테스트 358개 통과(`storage.test.ts` 52개, 이 중 이번에 추가한 것 28개)
- `npm run lint`: 오류 없음
- `npm run build`: 통과
- `BackupPanel` 컴포넌트는 자동 테스트가 없다(화면 테스트는 기술 설계 문서에서 범위 밖이고, 테스트 환경에 DOM이 없다). 아래 브라우저 확인으로 대신했다.

**실제 브라우저 확인** (앱 내 브라우저, Chromium 계열, `npx vite --port 5188`로 띄운 `http://localhost:5188`. 시작 전 `singcue:` 키를 모두 지움. 브라우저 창이 숨겨진 상태라 클릭·입력은 접근성 트리의 요소 참조로 했고 화면 모습은 보지 않았다)

- 단계 3 완료 기준: 영상 `dQw4w9WgXcQ`를 불러오고 가사 매핑 입력란에 `examples/sample-video.json`의 가상 구절 3개와 시간(0:12, 0:18.4, 0:24.7, 마지막 구절 다음 위치 0:31)을 입력해 "목록 만들기" → `singcue:video:dQw4w9WgXcQ`에 저장됨
- "JSON 내보내기" → 안내 "영상 1개의 데이터를 singcue-backup-2026-10-21.json(으)로 내보냈습니다.", 만들어진 Blob은 `application/json`이고 내용이 `{ version: 1, settings, videos: [그 영상], log: [] }`였다.
- localStorage를 모두 지우고 새로고침(사이트 데이터 삭제를 흉내) → 내보낸 내용을 파일 입력란에 넣음 → "…영상 1개의 데이터를 불러왔습니다." 안내, `singcue:video:dQw4w9WgXcQ`가 내보내기 전과 글자 하나까지 같고 `singcue:settings`, `singcue:log`(`[]`)도 쓰였다.
- 프리롤만 2.5로 바꾼 백업을 불러오면 설정 패널의 프리롤 입력란이 바로 2.5로 바뀌었다.
- 새로고침 후 같은 영상을 다시 불러오면 가사 매핑 목록에 같은 구절 3개와 0:12·0:18.4·0:24.7·0:31이 표시됐다.
- 형식 오류: JSON이 아닌 파일, 손상된 JSON, `version` 2·0, `settings`가 빈 객체, 구절 시간이 문자열인 파일을 불러오면 각각 이유에 맞는 오류 안내가 뜨고, 데이터가 있는 상태에서 localStorage 전체가 불러오기 전과 같았다.
- 네트워크: 페이지가 요청한 곳은 `localhost:5188`(앱 파일)과 `www.youtube.com`(플레이어)뿐이었다. 내보내기·불러오기 중 다른 요청은 없었다.
- 콘솔 오류 없음

**미확인**

- 실제 파일 다운로드: 확인 중 다운로드가 실제로 일어나지 않도록 `<a>.click()`을 가로채고 `URL.createObjectURL`에 넘긴 Blob 내용과 `download` 이름만 확인했다. 브라우저가 파일을 저장하는지, 저장된 파일 이름은 보지 않았다.
- 실제 파일 선택 창: 파일은 스크립트로 만든 `File`을 파일 입력란에 넣어 `change`를 일으켰다. "JSON 불러오기" 버튼으로 운영체제 파일 선택 창이 열리는지와, 디스크의 파일을 고르는 흐름은 확인하지 않았다.
- 불러오는 도중 저장 공간 부족·저장소 접근 불가: 실제로 일으켜 보지 않았다. 테스트(용량 제한이 있는 메모리 저장소)로만 확인했다.
- 화면 모습과 좁은 화면(375px) 배치: 브라우저 창이 숨겨져 있어 보지 않았다.
- Chrome 정식 브라우저, 다른 브라우저, 실제 모바일 기기, 키보드만으로 조작, 화면 낭독기 안내

## 6. 남은 작업 / 보류 사항

- 연습 기록(단계 5)을 구현할 때 `singcue:log`와 `PracticeRecord` 형식을 그대로 쓰고, 일반 읽기·쓰기 함수를 storage에 추가한다.
- 열려 있는 영상의 구간·가사 매핑 화면은 백업을 불러와도 바로 바뀌지 않는다. 같은 영상을 다시 불러오거나 새로고침하면 반영되며, 화면에 그렇게 안내한다. 바로 반영하려면 `App.tsx`가 불러오기 결과를 받아 패널을 다시 그리게 해야 하는데, 이번 범위에서 `App.tsx`를 고치지 않았다.
- `BackupPanel`은 `SettingsPanel`의 `storage` prop과 별개로 기본 localStorage를 쓴다. 상위에서 저장소를 바꿔 넘길 일이 생기면 `SettingsPanel`에서 `store`도 넘기도록 한다.
- version 2 이상이 생기면 `parseBackup`에서 이전 버전 변환을 추가한다.
- 불러오기 전에 덮어쓸 내용을 미리 보여 주거나 확인을 받는 기능은 넣지 않았다.
