# singcue

YouTube 영상을 보며 노래를 연습할 때 음성 명령("스톱", "시작")으로 재생을 멈추고 이어 가고, 부른 구절을 인식해 다음 구절로 이동하는 연습 도우미입니다. 서버 없이 브라우저에서만 동작하고 데이터는 localStorage에 저장합니다.

- 기능 명세: [`docs/singcue PRD (기능 명세서).md`](<docs/singcue PRD (기능 명세서).md>)
- 기술 설계: [`docs/singcue 기술 설계 문서.md`](<docs/singcue 기술 설계 문서.md>)
- 개발 기록: [`docs/development-log/`](docs/development-log/)

## 개발

```bash
npm install
npm run dev     # 개발 서버
npm test        # Vitest
npm run lint    # ESLint
npm run build   # 타입 검사와 빌드
```

PC의 Chrome에서 이어폰을 쓰는 환경을 기준으로 합니다. 마이크는 HTTPS 또는 localhost에서만 쓸 수 있습니다.

## 가사·음원 미포함 규칙

singcue는 가사와 음원을 제공하지 않습니다. 사용자가 직접 입력한 구절 텍스트와 영상 ID만 사용자의 브라우저에 저장합니다(PRD F3-5, 비기능 요구사항 "저작권").

- **저장소와 배포물에 넣지 않는 것**: 실제 곡의 가사(일부 구절 포함), 음원·영상 파일, 가사·자막 파일(`.lrc`, `.srt`, `.vtt` 등). 테스트 코드, 예시 데이터, 문서, 이슈와 PR 본문, 커밋 메시지에도 실제 가사를 적지 않습니다.
- **예시·테스트 데이터**: 직접 만든 가상의 구절만 씁니다. 예시는 [`examples/sample-video.json`](examples/sample-video.json)에 있습니다(영상 ID `sampleVid01`도 가상의 값).
- **사용자 데이터**: 앱에서 내보낸 JSON 백업(`singcue-backup*.json`, `singcue-export*.json`)에는 사용자가 입력한 가사가 들어 있으므로 저장소에 올리지 않습니다.
- **PoC 로그**: 실제 곡으로 시험한 로그에는 인식된 가사가 남습니다. [`poc/poc_log_261021.json`](poc/poc_log_261021.json)은 가사를 지운 판이며, 지운 방식은 파일의 `redaction` 항목에 적혀 있습니다. 새로 내려받은 PoC 로그(`poc/poc_log_*.json`)는 가사를 지우기 전까지 커밋하지 않습니다.
- **재생**: YouTube 공식 임베드 플레이어만 쓰고, 영상·오디오 추출 도구와 비공식 자막 추출은 쓰지 않습니다. 시연 영상은 공유저작물, CC 라이선스 곡, 직접 녹음한 곡으로 만듭니다.

위 파일 형식은 [`.gitignore`](.gitignore)로 막아 두었지만, 확장자로 막을 수 없는 가사 텍스트는 커밋 전에 직접 확인해야 합니다.
