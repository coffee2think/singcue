# 2026-10-21 speechAdapter: Web Speech API 래핑 (#9)

## 1. 배경 / 문제

- PRD F2-1은 음성 인식을 버튼으로 켜고 끄고, 마이크 권한이 거부되면 안내하며, 인식 세션이 끝나면 자동으로 다시 시작할 것을 요구한다. F2-6(정지 즉시 실행)은 중간 인식 결과를 써야 한다.
- 기술 설계 문서는 음성 인식 같은 브라우저 의존을 어댑터 뒤에 숨기고, 인식 후보 5개를 모두 명령·구절 판별에 쓰며, `not-allowed`·`no-speech`·`onend`를 어댑터에서 처리하도록 정했다.
- 명령 판별(`commandMatcher`, #8)과 마이크 입력 레벨(`micMeter`, #10)은 다른 세션이 동시에 작업하므로, 이번에는 어댑터가 내보내는 이벤트만 정의하고 컨트롤러 연결은 하지 않는다.

## 2. 검토한 선택지

- **SpeechRecognition 타입**: TypeScript 6의 DOM 타입(`lib.dom.d.ts`)에 SpeechRecognition이 없었다. `@types/dom-speech-recognition`을 설치하면 공용 파일(`package.json`, lockfile)을 바꿔야 해서, playerAdapter(#3)처럼 쓰는 부분만 직접 선언하는 방법과 비교했다.
- **발화 ID**: 결과 목록의 번호(`resultIndex`부터의 i)는 같은 발화의 중간·최종 결과에서 같지만, 세션이 다시 시작되면 0부터 다시 센다. 번호만 쓰면 재시작 뒤 다른 발화와 ID가 겹친다.
- **자동 재시작 중 오류 처리**: PoC는 `not-allowed`·`service-not-allowed`에서만 인식을 껐다. 마이크가 없거나(`audio-capture`) 언어를 지원하지 않을 때(`language-not-supported`)도 재시작하면 같은 오류가 되풀이된다.

## 3. 결정 및 이유

- 타입은 직접 선언했다(`webSpeechApi.ts`). 공용 파일을 건드리지 않는다는 병렬 작업 조건 때문이다. 표준 이름 `SpeechRecognition`을 먼저 찾고 없으면 `webkitSpeechRecognition`을 쓴다.
- 인식 설정은 PoC와 같게 ko-KR, 연속 인식, 중간 결과, 후보 5개로 두었다.
- 발화 ID는 `<세션 번호>-<결과 번호>`로 만든다. 세션 번호는 `onstart`마다 늘린다. 같은 발화의 중간·최종 결과는 같은 ID를 받으므로, 컨트롤러가 "같은 발화에서는 한 번만 실행"(설계 문서, F2-6)을 이 ID로 판단할 수 있다.
- 오류는 모두 호출 측에 전달하고, `fatal` 여부를 함께 준다. `not-allowed`, `service-not-allowed`, `audio-capture`, `language-not-supported`와 어댑터가 만드는 `not-supported`(브라우저 미지원), `start-failed`(start()가 예외를 던짐)는 fatal로 보고 인식을 끈다. `no-speech`, `network`, `aborted`와 모르는 오류는 세션이 끝난 뒤 다시 시작한다. 안내 문구는 설계 문서의 오류 처리 표를 따랐다(권한 거부 시 버튼 조작은 계속 쓸 수 있다고 안내).
- 재시작은 `onend` 뒤 250ms를 기다린다(PoC와 같음). 기다리는 동안 꺼지면 재시작을 취소하고, 이때는 `onend`가 다시 오지 않으므로 꺼짐(`end`, restarting: false)을 어댑터가 직접 알린다.
- 끈 뒤 `onend`가 오기 전에 다시 켜면 Chrome은 start()에서 InvalidStateError를 던질 수 있어, 켤 때마다 새 인식 객체를 만들고 이전 객체의 이벤트는 무시한다.
- 후보는 앞뒤 공백을 지우고 빈 문자열은 뺀다. 후보가 하나도 없으면 결과를 보내지 않는다.

## 4. 구현 내용

`src/adapters/speechAdapter/`

- `webSpeechApi.ts`: 쓰는 부분만 옮긴 SpeechRecognition 타입, `getSpeechRecognition`
- `speechEvents.ts`: 이벤트 타입(`SpeechEvent` = start | result | error | end, `SpeechResult`, `SpeechError`), `toSpeechError`와 `SPEECH_ERROR_MESSAGES`
- `createSpeechAdapter.ts`: `createSpeechAdapter(onEvent)`가 `SpeechAdapter`(start, stop, isEnabled)를 돌려준다. `isSpeechSupported`, `RECOGNITION_SETTINGS`, `RESTART_DELAY_MS`
- `index.ts`: 바깥에 공개하는 이름 모음

## 5. 검증 결과

**자동 검증**

- `npm test`: 테스트 파일 9개, 테스트 134개 통과(이번에 추가한 파일 2개, 테스트 27개)
  - `speechEvents.test.ts`: 오류 코드별 fatal 여부와 문구
  - `createSpeechAdapter.test.ts`: window와 SpeechRecognition을 **모의 객체로 바꾸고** 가짜 타이머로 인식 설정, 자동 재시작(여러 번, 끈 뒤, 재시작 대기 중 끔, 재시작 실패), 오류 전달(`not-allowed`, `no-speech`, 미지원, 시작 실패), 결과 전달(발화 ID, 최종 여부, 후보 목록, 세션 사이 ID 구분)을 확인했다.
- `npm run lint`: 오류 없음
- `npm run build`: 통과

**실제 브라우저 확인** (앱 내 브라우저, Chromium 계열, `http://localhost`에서 커밋하지 않은 임시 확인 페이지로 어댑터를 직접 호출)

- 표준 이름 `SpeechRecognition`이 있어 `isSpeechSupported()`가 true
- 실제 인식 객체에 ko-KR, continuous true, interimResults true, maxAlternatives 5가 그대로 들어간다
- 이 브라우저는 마이크 접근을 막아 `start()` 뒤 실제 `not-allowed` 오류가 왔고, 어댑터가 fatal 오류와 `end`(restarting: false)를 알리고 꺼진 채로 남았다(재시작 반복 없음)

**미확인**

- 실제 마이크로 말했을 때의 결과 전달(발화 ID, 중간·최종 결과, 후보 5개): 마이크를 쓸 수 없어 모의 테스트로만 확인했다.
- 실제 세션 종료(`onend`) 뒤 자동 재시작: 마이크 권한이 있어야 세션이 이어지므로 모의 테스트로만 확인했다.
- `no-speech`, `audio-capture`, `network` 등 `not-allowed` 외 오류의 실제 발생
- Chrome 정식 브라우저, 다른 브라우저(Safari 등), 이어폰 마이크 환경

## 6. 남은 작업 / 보류 사항

- 컨트롤러(`useVoice`)에서 `SpeechEvent`를 받아 `commandMatcher.decide`에 후보를 넘기고, 같은 발화 ID에서 정지를 한 번만 실행하는 연결은 하지 않았다.
- 마이크 장치 이름과 입력 레벨 표시, `no-speech`와 입력 레벨을 함께 본 장치 확인 안내는 micMeter(#10)와 화면 쪽에서 한다.
- `network` 오류가 계속되면 재시작이 되풀이된다. 실사용에서 문제가 되면 재시작 횟수 제한을 검토한다.
- 실제 마이크로 결과 전달과 자동 재시작을 확인해야 한다.
