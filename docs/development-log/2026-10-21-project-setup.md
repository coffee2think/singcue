# 2026-10-21 프로젝트 기반 구성 (#1)

## 1. 배경 / 문제

- 저장소에는 기획 문서와 PoC(`poc/poc.html`)만 있고 앱 코드가 없었다.
- 이후 이슈(#2~#29)가 모두 같은 빌드·테스트 환경과 공통 타입 위에서 진행되므로, 기술 설계 문서의 기술 선택과 폴더 구조를 먼저 고정할 필요가 있었다.

## 2. 검토한 선택지

- **골격 생성 방식**
  - `npm create vite` 템플릿: 빠르지만 대화형 프롬프트와 템플릿 예시 파일(로고, CSS 등)을 정리해야 한다.
  - 설정 파일을 직접 작성: 필요한 파일만 두고 폴더 구조를 설계 문서와 바로 맞출 수 있다.
- 기술 스택 자체(React, TypeScript, Vite, Vitest, localStorage)는 기술 설계 문서에서 이미 결정되어 있어 다시 검토하지 않았다.

## 3. 결정 및 이유

- Vite react-ts 템플릿과 같은 구성(tsconfig 참조 분리, ESLint flat config)을 직접 작성했다. 템플릿의 예시 자산을 지우는 수고가 없고, 설계 문서의 `core/adapters/controller/ui` 구조를 처음부터 맞출 수 있다.
- `DEFAULT_SETTINGS`는 화면과 무관한 순수 값이므로 `src/core/defaultSettings.ts`에 두었다. 이후 storage 어댑터와 commandMatcher가 이 값을 가져다 쓴다.
- 재생 상태 타입 `PlaybackState`('unready' | 'stopped' | 'playing')를 `types.ts`에 추가했다. 설계 문서의 상태 머신이 세 상태를 정의하고, `decide()`의 인자로 필요하기 때문이다.
- `stopOnInterim`은 PRD에서 미정이다. 측정 전까지는 PoC 로그 설정(`interim: false`)과 같게 false로 두고, 코드 주석에 #15에서 결정한다고 적었다.
- 설치한 주요 버전: React 19.3, TypeScript 6.0, Vite 8.3, Vitest 5.0, ESLint 10.13, typescript-eslint 8.72.

## 4. 구현 내용

- 설정: `package.json`(dev, build, preview, lint, test 스크립트), `tsconfig*.json`, `vite.config.ts`(Vitest 설정 포함), `eslint.config.js`, `.gitignore`
- 앱 진입점: `index.html`, `src/main.tsx`, `src/ui/App.tsx`(제목만 표시하는 자리)
- 폴더: `src/core`, `src/adapters`, `src/controller`, `src/ui`. 아직 파일이 없는 `adapters`, `controller`에는 `.gitkeep`을 두었다.
- `src/types.ts`: Section, Line, VideoData, PracticeRecord, Settings, Decision, MatchResult와 보조 타입(PlaybackState, EndAction, IgnoreReason)
- `src/core/defaultSettings.ts`와 테스트: PRD 설정 항목 8개의 기본값, `Object.freeze`로 변경 방지

## 5. 검증 결과

- `npm test`: 테스트 파일 1개, 테스트 2개 통과
- `npm run lint`: 오류 없음. 일부러 잘못 쓴 임시 파일(미사용 변수, `any`)에서 오류 2건이 나는 것을 확인해 lint가 실제로 동작함을 확인했다(임시 파일은 삭제).
- `npm run build`: `tsc -b`와 `vite build` 통과
- `npm run dev`: http://localhost:5173 에서 페이지가 열리고 제목이 표시되며 콘솔 오류가 없음을 앱 내 브라우저로 확인했다.
- 수행하지 않은 검증: 화면 테스트(설계 문서상 범위 밖), Chrome 외 브라우저

## 6. 남은 작업 / 보류 사항

- `stopOnInterim` 기본값은 #15(이어폰 환경 검증)에서 측정 후 결정한다.
- storage 테스트(#2)에는 localStorage가 필요하므로, 그때 Vitest 환경(jsdom 등)이나 모의 객체를 정한다.
- `poc/poc_log_261021.json`의 가사 포함 문제는 #19에서 처리한다. 이번에는 ESLint 대상에서만 `poc` 폴더를 제외했다.
