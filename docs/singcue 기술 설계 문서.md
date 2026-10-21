# singcue 기술 설계 문서

Oct 21, 2026 · @Louis Choi

## 목적과 입력 문서

이 문서는 singcue PRD의 기능 요구사항(F1-1\~F5-4)을 어떤 모듈과 데이터 구조로 구현할지 정하고, 구현은 이 설계를 따릅니다.

- **기준 문서**: PRD가 주된 기준이고, 기획서와 PoC 결과는 기술 배경과 수치를 가져올 때 참고합니다. 둘이 다르면 PRD를 따릅니다.
- **범위**: 브라우저에서만 동작하는 프론트엔드 앱입니다. 서버와 DB가 없으므로 API 명세는 만들지 않습니다.
- **외부 API 2개**: YouTube IFrame Player API(재생 제어)와 Web Speech API(음성 인식)를 쓰고, 마이크 입력 레벨 표시에는 getUserMedia와 AnalyserNode를 씁니다.
- **실행 환경**: PC의 Chrome, 이어폰 사용, HTTPS 또는 localhost입니다.

## 기술 선택

React, TypeScript, Vite로 만들고 저장은 localStorage에 합니다. 핵심 로직은 화면과 분리한 순수 TypeScript 모듈로 두어 PoC의 판별 규칙을 테스트로 고정할 수 있게 합니다.

| 항목 | 선택 | 이유 |
| --- | --- | --- |
| 언어 | TypeScript | 상태, 명령, 저장 데이터의 형태를 타입으로 고정해 PRD의 규칙을 코드에서 어기기 어렵게 함 |
| 화면 | React | 채용 공고에서 가장 흔한 스택이고, 재생 상태에 따라 화면이 바뀌는 구조에 맞음 |
| 빌드·개발 서버 | Vite | 설정이 적고 localhost에서 바로 실행됨. 마이크 사용 조건(HTTPS 또는 localhost)을 개발 중에도 충족 |
| 상태 관리 | React 기본 기능(useReducer, Context) | 재생 상태 전이는 순수 함수 reducer로 두고 화면 라이브러리에 의존하지 않음. 외부 상태 라이브러리는 쓰지 않음 |
| 저장 | localStorage | 구간, 매핑, 기록, 설정이 모두 작은 JSON이라 충분하고 구현이 단순함. 기록이 매우 많아지면 IndexedDB로 바꾸는 것을 후속 과제로 둠 |
| 테스트 | Vitest | 명령 판별과 구절 매칭을 PoC 로그 값으로 검증함. 화면 테스트는 범위에서 제외 |
| 외부 API | YouTube IFrame Player API, Web Speech API | PRD 제약(공식 임베드만, 서버 없음)을 만족하는 유일한 조합 |

## 전체 구조와 모듈

앱은 화면, 컨트롤러, 핵심 로직, 어댑터 네 층으로 나누고, 의존은 위에서 아래로만 흐릅니다.

&#91;embedded content: 모듈 구조 · 4개 층\]

명령 판별과 구절 매칭은 핵심 로직에 두어 브라우저 없이 Vitest로 검증하고, YouTube·음성 인식·저장 같은 브라우저 의존은 어댑터 뒤에 숨깁니다.

### 폴더 구조

```
singcue/
  docs/              기획서, PRD, 기술 설계
  poc/poc.html       PoC (참고용 보관)
  src/
    core/            commandMatcher, phraseMatcher, playbackMachine, lyricParser, practiceCounter
    adapters/        playerAdapter, speechAdapter, micMeter, storage
    controller/      reducer와 훅 (usePlayback, useVoice)
    ui/              React 컴포넌트
    types.ts         공통 타입
```

## 상태 머신

재생 상태는 준비 전, 정지, 재생 중 셋이고, 실행할 수 있는 명령은 현재 상태가 결정합니다(PRD F2-4, F2-5).

&#91;embedded content: 재생 상태 전이 · 3개 상태\]

| 상태 | 받는 명령 | 무시하는 명령 |
| --- | --- | --- |
| 준비 전 | 없음(영상 불러오기만 가능) | 모든 음성 명령 |
| 정지 | 시작 명령, 구절 인식 점프 | 정지 명령 |
| 재생 중 | 정지 명령 | 시작 명령, 구절 인식 점프(노래 가사에 섞인 명령어로 인한 오작동 차단) |

- **상태의 기준**: YouTube 플레이어의 상태 변경 이벤트(onStateChange)입니다. 사용자가 영상 화면을 직접 눌러 멈추거나 재생해도 상태가 어긋나지 않습니다. 로딩 중(버퍼링)은 재생 중으로 봅니다.
- **구간 끝 감지**: 유튜브 플레이어에는 구간 끝 이벤트가 없어, 재생 중에만 0.25초마다 현재 위치를 확인해 끝 위치와 비교합니다(PRD F2-8의 "1초 이내"를 만족).

구간 끝에 도달했을 때의 전이는 설정에 따라 달라집니다.

| 구간 끝 동작 | 전이 |
| --- | --- |
| 자동 정지(기본) | 재생 중에서 정지로. 끝 위치에서 멈춘다 |
| 자동 반복 | 재생 중을 유지하고 구간 시작 위치로 되돌아간다. 프리롤 적용과 횟수 집계는 미확정 |
| 계속 재생 | 재생 중을 유지하고 아무 동작도 하지 않는다 |

## 음성 명령 처리 흐름

인식 결과 1개는 명령어 포함, 짧은 발화, 상태, 중복 여부를 차례로 확인해 실행·무시·구절 매칭 중 하나로 분류됩니다(PRD F2-2\~F2-6).

&#91;embedded content: 음성 명령 판별 흐름 · 4단계 확인\]

- **정지를 먼저 확인**: 한 발화에 정지와 시작 명령어가 함께 들어 있으면 정지를 따릅니다(PoC와 같은 규칙).
- **후보 5개**: 인식 후보를 모두 정규화해 확인하고, 하나라도 명령 조건을 만족하면 통과합니다.
- **짧은 발화 규칙**: 명령어를 뺀 나머지 글자가 설정값(기본 2자)을 넘으면 가사로 보고 무시합니다. PoC에서 가사 문장이 시작 명령으로 오인된 일이 2번 있었습니다.
- **정지 즉시 실행**: 옵션을 켜면 중간 인식 결과로도 정지를 판별하고, 같은 발화에서는 한 번만 실행합니다. 끄면 최종 결과만 봅니다.
- **개발 정의**: 판별은 순수 함수 `decide(candidates, state, settings, lastCommandAt)`가 맡고, 컨트롤러는 그 결과만 따라 실행합니다.

```ts
type Decision =
  | { action: 'stop' }
  | { action: 'start' }
  | { action: 'phrase'; candidates: string[] }
  | { action: 'ignore'; reason: 'short-rule' | 'state' | 'debounce' | 'no-match' };
```

## 구절 매칭 설계

말한 구절과 입력한 가사 줄의 유사도를 계산해 가장 비슷한 줄을 고르고, 기준(기본 0.5) 이상이면 그 다음 줄의 시작 시간으로 이동합니다(PRD F4-1\~F4-5). 로직은 `phraseMatcher`에 두고 PoC와 같은 방식을 씁니다.

1. **정규화**: 소문자로 바꾸고 공백과 기호를 지웁니다. 가사 줄은 파싱할 때 한 번만 정규화해 둑니다.
2. **유사도**: 편집 거리(Levenshtein)를 길이로 나눠 `1 - 거리 / 더 긴 길이`로 계산합니다. 줄 전체와 비교한 값과, 들은 말의 길이만큼 줄의 앞부분만 잘라 비교한 값 중 큰 값을 씁니다.
3. **후보 5개 비교**: 인식 후보 모두를 모든 줄과 비교해 가장 높은 점수의 줄을 고릅니다.
4. **이동 위치**: 고른 줄의 다음 줄 시작 시간에서 프리롤을 빼고 재생합니다. 다음 줄이 없는 마지막 줄이면 "마지막 구절 다음 위치"로 이동하고, 그 값이 없으면 이동 없이 이유를 안내합니다.
5. **기준 미달**: 이동하지 않고 가장 가까운 구절과 점수를 화면에 보여 줍니다.

```ts
type MatchResult = {
  lineIndex: number;        // 가장 비슷한 줄
  score: number;            // 0~1
  passed: boolean;          // score >= threshold
  seekTo: number | null;    // 이동할 시간(초). 마지막 줄에 다음 위치가 없으면 null
};

matchPhrase(candidates: string[], lines: Line[], endT: number | null, threshold: number): MatchResult
```

PoC에서 정확히 인식된 구절의 유사도는 0.85\~1.00, 오인식이 잦은 어려운 구절은 0.50\~0.89였고, 기준 0.5에서 어려운 구절 9번이 모두 통과했습니다. 자모 단위 유사도는 최적화 단계로 미룹니다.

## 데이터 구조와 저장

데이터는 구간, 가사 매핑, 연습 기록, 설정 네 종류이고, 모두 localStorage에 JSON으로 저장하며 어느 것도 서버로 보내지 않습니다(PRD F1-3, F3-4, F5-2, F5-4).

| 저장 키 | 내용 | 단위 |
| --- | --- | --- |
| `singcue:settings` | 설정 8개 항목 | 사용자 한 명 |
| `singcue:video:<videoId>` | 그 영상의 구간과 가사 매핑 | 영상마다 하나 |
| `singcue:log` | 연습 기록 목록 | 전체 하나 |

음원과 영상 파일은 저장하지 않고, 영상 ID와 사용자가 직접 입력한 구절 텍스트만 둡니다(PRD F3-5).

```ts
type Section = { id: string; name: string; start: number; end: number };   // 초 단위
type Line    = { t: number; text: string };                                // 구절 시작 시간
type VideoData = {
  videoId: string;
  sections: Section[];
  lines: Line[];
  endT: number | null;      // 마지막 구절 다음 위치
};
type PracticeRecord = {
  videoId: string;
  sectionId: string;
  at: string;               // ISO 날짜와 시각
  seconds: number;          // 실제 재생한 시간
};
type Settings = {
  endAction: 'stop' | 'repeat' | 'continue';   // 기본 'stop'
  preroll: number;                              // 기본 1.5
  stopWords: string[];
  startWords: string[];
  stopOnInterim: boolean;
  shortRuleChars: number;                       // 기본 2
  similarityThreshold: number;                  // 기본 0.5
  minPracticeSeconds: number;                   // 기본 3
};
```

- **내보내기와 불러오기**: 전체를 하나의 JSON 파일(`{ version, settings, videos, log }`)로 내보내고 불러옵니다. `version`으로 파일 형식이 바뀔 때 거부하거나 변환합니다.
- **불러올 때 검사**: 형식이 맞지 않으면 기존 데이터를 건드리지 않고 오류를 안내합니다.
- **데이터 삭제**: 사이트 데이터를 지우면 모두 사라지므로 화면에 안내를 표시하고 내보내기를 권합니다(PRD F5-4).
- **연습 기록 시점**: 재생 중에서 정지로 바뀔 때 재생한 시간이 최소 재생 시간 이상이면 1회로 기록합니다(`practiceCounter`).

## 오류 처리

오류는 앱을 멈추지 않고 화면에 이유와 다음 행동을 안내하는 것이 원칙이며, 처리 위치는 모두 어댑터입니다.

| 상황 | 감지 | 처리 |
| --- | --- | --- |
| 마이크 권한 거부 | getUserMedia 거부, 인식 오류 `not-allowed` | 음성 인식을 켜지 못했다고 안내하고 버튼 조작은 계속 쓸 수 있게 함 |
| 소리가 안 들어옴 | 인식 오류 `no-speech`, 입력 레벨이 −55dB 미만으로 4초 지속 | 입력 장치 이름을 보여 주고 장치 확인을 안내 (PoC에서 이어폰 마이크가 안 잡혀 겪은 문제) |
| 인식 세션 종료 | 인식 `onend` | 음성 인식을 켠 상태면 자동으로 다시 시작 |
| 임베드 불가 영상 | 플레이어 `onError` 코드 | 오류 코드별 안내를 보여 주고 다른 영상을 불러오게 함 |
| 자동재생 차단 | 시작 명령 후 3초 안에 재생 상태가 안 됨 | 차단 가능성을 안내하고 재생 버튼을 한 번 눌러 달라고 함 |
| 가져오기 형식 오류 | JSON 파싱, `version` 확인 | 기존 데이터를 유지한 채 오류 안내 |
| 저장 공간 부족 | localStorage 쓰기 예외 | 저장 실패를 알리고 JSON 내보내기를 권함 |

자동재생은 PoC에서 12번 중 12번 성공했지만, 시작 명령이 음성 입력이라 브라우저 정책으로 막히는 경우를 대비해 안내를 둡니다.

## PRD 대응표와 미확정 설계 사항

PRD의 모든 기능 요구사항이 아래 모듈 중 하나 이상에 배정되어 있습니다.

| PRD ID | 기능 | 구현 위치 |
| --- | --- | --- |
| F1-1 | 영상 불러오기 | playerAdapter(주소 해석·오류), 화면 |
| F1-2\~F1-4 | 시작·끝 마킹, 구간 저장·선택 | 컨트롤러(구간 reducer), storage, 화면 |
| F1-5 | 버튼 재생·정지 | playbackMachine, playerAdapter |
| F2-1 | 음성 인식 켜기·끄기, 입력 레벨 | speechAdapter, micMeter |
| F2-2, F2-3 | 정지·시작 명령 | commandMatcher, playbackMachine |
| F2-4, F2-5 | 짧은 발화 규칙, 상태 게이트, 중복 방지 | commandMatcher(`decide`) |
| F2-6 | 정지 즉시 실행 | speechAdapter(중간 결과), commandMatcher |
| F2-7, F2-8 | 프리롤, 구간 끝 동작 | 컨트롤러(위치 확인), playbackMachine |
| F2-9 | 명령어 편집 | storage(설정), 화면 |
| F3-1\~F3-3 | 가사 줄 입력·타이밍 찍기, 마지막 구절 다음 위치 | lyricParser, 화면 |
| F3-4, F3-5 | 매핑 저장·불러오기, 가사·음원 미포함 | storage, 저장소에 파일을 두지 않는 규칙 |
| F4-1\~F4-5 | 구절 인식 점프 | phraseMatcher, commandMatcher(상태 게이트) |
| F5-1 | 연습 1회 판정 | practiceCounter |
| F5-2\~F5-4 | 기록 저장, 리포트, 내보내기 | storage, 화면(집계 함수) |

### 미확정 설계 사항

| 항목 | 현재 안 | 확정 시점 |
| --- | --- | --- |
| 구간 끝 감지 간격 | 0.25초 | 이동 정확도를 점검할 때(개발 후) |
| 반복 가사 구절 선택 | `matchPhrase`에 최근 재생 위치를 힌트로 넘기는 방식 검토 (PRD 미확정과 동일) | 3단계 구현 시 |
| 자동 반복의 횟수 집계 | `practiceCounter`가 구간 완주 이벤트를 받는 방식 검토 (PRD 미확정과 동일) | 4단계 구현 시 |
| 저장 용량 | localStorage로 시작하고, 기록이 많아지면 IndexedDB 전환 검토 | 장기 사용에서 문제가 보일 때 |
