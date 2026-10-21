# 2026-10-22 유사도 기준 설정 (#23)

## 1. 배경 / 문제

- PRD F4-4는 연습자가 구절 인식의 유사도 기준을 곡에 맞게 0~1 사이에서 바꿀 수 있게 하고, 기본값은 0.5, 바꾼 값은 다음 인식부터 적용되도록 요구한다. PRD "설정 항목" 표에도 유사도 기준 0.5, 범위 0~1, 단계 4로 적혀 있다.
- `Settings.similarityThreshold`, 기본값(`DEFAULT_SETTINGS`, 0.5), `singcue:settings` 저장·읽기, 구절 매칭에서의 사용(#22 `useVoice`)은 이미 있었다. 설정 화면에만 입력이 없어, #22 확인 때는 저장소에 값을 직접 넣었다(`2026-10-22-phrase-jump.md`).
- 제약: #53, #28, #29가 다른 세션에서 동시에 진행 중이라 고칠 수 있는 파일을 `SettingsPanel.tsx`, `SettingsPanel.css`, `settingsForm.ts`와 각 테스트, 이 기록으로 정했다. `useVoice.ts`, `storage.ts`, `App.tsx`, `BackupPanel`, `types.ts`는 고치지 않는다.

## 2. 검토한 선택지

- **입력 방식**
  - 다른 숫자 설정(프리롤, 최소 재생 시간)과 같은 텍스트 입력 + 저장 버튼 때 확인: 기존 검증·오류 안내(`readDraft`, `FieldError`)를 그대로 쓴다.
  - 슬라이더(`type="range"`): 범위 밖 값이 들어오지 않지만, 패널의 다른 숫자 항목과 모양·검증 방식이 달라지고 0.85 같은 값을 정확히 맞추기 어렵다.
- **"다음 인식부터 적용"을 위해 `useVoice`를 고쳐야 하는지**: `useVoice.ts`를 읽어 확인했다(아래 3). 고칠 필요가 없었다.

## 3. 결정 및 이유

- **텍스트 입력**으로 했다. 설정 패널의 다른 숫자 항목과 같은 방식(입력한 글자를 그대로 들고 있다가 저장할 때 확인)이고, PoC 수치(0.85~1.00, 0.50~0.89)처럼 소수 둘째 자리까지 바로 적을 수 있다.
- **범위**: 0 이상 1 이하(양 끝 포함). `parseSimilarityThreshold`는 프리롤과 같은 숫자 형식(`parsePreroll`, 지수 표기·단위·쉼표 거부)으로 읽은 뒤 1 이하만 받는다. 0이면 가장 가까운 구절로 늘 이동하고 1이면 완전히 같을 때만 이동한다. PRD 범위가 0~1이라 양 끝을 막지 않았다.
- **적용 시점(코드 확인)**: `src/controller/useVoice.ts`의 `handleResult`는 인식 결과가 올 때마다 `storage.loadSettings()`를 부르고(405행), `phrase` 판별에서 그 값의 `settings.similarityThreshold`를 `resolvePhrase`에 넘긴다(454행). 훅 처음에 한 번만 읽어 두는 곳은 없다. `App.tsx`는 `createStorage()`(localStorage)를 `useVoice`에 넘기고, `SettingsPanel`은 저장소를 받지 않아 자기 `createStorage()`(같은 localStorage)를 쓴다. `loadSettings`는 매번 `singcue:settings`를 다시 읽는다. 따라서 설정 패널에서 저장하면 음성 인식을 켠 채로도 다음 인식 결과부터 새 값이 쓰인다. `useVoice.ts`는 고치지 않았다.
- **안내 문구**: 낮추면 오인식이 잦은 곡에서 이동이 쉬워지고, 높이면 엉뚱한 구절로 이동하는 일이 줄어든다는 방향과 "다음 인식부터 적용됩니다"를 힌트에 적었다.

## 4. 구현 내용

- `src/ui/settingsForm.ts`
  - `PanelSettings`에 `similarityThreshold`, `SettingsDraft`·`DraftField`에 `similarityThreshold` 추가
  - `parseSimilarityThreshold(text)`: 0 이상 1 이하의 숫자, 아니면 `null`
  - `SETTINGS_ERROR_MESSAGES.similarityThreshold`, `toDraft`·`readDraft`에 항목 추가
- `src/ui/SettingsPanel.tsx`: "짧은 발화 허용 글자 수" 아래에 "구절 인식 유사도 기준(0~1)" 입력과 힌트(기본값 표시), 오류 안내 추가. 저장 때 `{ ...saved, ...panel }` 병합은 그대로 두고 주석만 고쳤다. "기본값으로 되돌리기"는 `defaultDraft()`를 쓰므로 0.5로 돌아간다.
- `src/ui/settingsForm.test.ts`: `parseSimilarityThreshold` 허용·거부 값, `readDraft`의 양 끝(0, 1)·범위 밖 값, 기본 입력란(0.5), 유사도 기준만 바꿔 저장한 뒤 새 어댑터로 읽기(새로고침) 테스트 추가
- `SettingsPanel.css`는 기존 `.settings__field` 스타일로 충분해 고치지 않았다.

## 5. 검증 결과

**자동 검증**
- `npx vitest run`: 테스트 파일 28개, 테스트 509개 통과
- `npm run lint`: 오류 없음
- `npm run build`: 통과

**앱 내 브라우저 확인(dev 서버, 실제 설정 화면)**
- 저장소를 비운 상태에서 입력란 값 0.5(기본값)
- 1.5 입력 후 저장 → "유사도 기준은 0 이상 1 이하의 숫자로 입력하세요." 안내, `aria-invalid="true"`, 저장소에 쓰지 않음
- 0.8 입력 후 저장 → "설정을 저장했습니다.", `singcue:settings`의 `similarityThreshold` 0.8(다른 항목은 기본값 그대로)
- 새로고침 → 입력란 0.8 유지
- "기본값으로 되돌리기" → 입력란·저장소 모두 0.5
- 콘솔 오류 없음

**앱 내 브라우저 확인(가짜 인식)**

아래는 **실제 마이크·음성이 아니라** 가짜 `SpeechRecognition`(스크립트로 최종 결과를 넣음)과 가짜 `getUserMedia`(오실레이터 스트림)로 확인했다. 플레이어(YouTube, `dQw4w9WgXcQ`)와 앱 코드는 실제 것이고, 가사 매핑은 저장소에 가상의 구절 3개와 `endT`를 넣었다.
- 기준 0.5에서 "파란 우산을 펴고 들고" → 유사도 0.78 / 기준 0.50, 다음 구절로 이동
- "멈춰"로 정지한 뒤, 음성 인식을 켠 채로 설정 화면에서 0.9를 입력해 저장 → 같은 말 → "유사도 0.78 / 기준 0.90", 이동하지 않음. 새로고침이나 음성 인식 다시 켜기 없이 다음 인식부터 새 값이 쓰였다
- "기본값으로 되돌리기" 뒤 같은 말 → "기준 0.50", 이동

**미확인**
- 실제 마이크와 실제 음성으로 기준을 바꿔 가며 구절 이동이 달라지는지: 앱 내 브라우저에서는 가짜 인식으로만 확인했다. Chrome 정식 브라우저에서 사람이 직접 확인해야 한다.
- 375px 폭 등 좁은 화면에서의 배치: 앱 내 브라우저 창이 가려져 있어 화면으로 보지 않았다. 기존 `.settings__field` 스타일을 그대로 쓴다.

## 6. 남은 작업 / 보류 사항

- `storage.ts`의 `toSettings`는 `similarityThreshold`가 유한한 숫자인지만 보고 0~1 범위는 확인하지 않는다. 설정 화면으로는 범위 밖 값이 저장되지 않지만, 저장소를 직접 고치거나 범위 밖 값이 든 백업을 불러오면 그대로 쓰인다. `storage.ts`는 이번 범위 밖이라 고치지 않았다.
- 곡마다 다른 기준(F4-4의 "곡에 맞게")은 지금 전역 설정 하나로만 둔다. 영상별 기준이 필요하면 `VideoData`에 항목을 더해야 하므로 `types.ts` 변경이 필요하다.
