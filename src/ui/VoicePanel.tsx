import { MIN_DB } from '../adapters/micMeter/index.ts';
import {
  summarizeLatencies,
  type ResultSource,
  type UseVoice,
  type VoiceLogEntry,
  type VoiceStatus,
} from '../controller/useVoice.ts';
import './VoicePanel.css';

type Props = { voice: UseVoice };

const STATUS_LABELS: Record<VoiceStatus, string> = {
  off: '꺼짐',
  starting: '켜는 중…',
  on: '듣는 중',
};

const OUTCOME_LABELS: Record<VoiceLogEntry['outcome'], string> = {
  stop: '정지',
  start: '시작',
  phrase: '구절',
  ignore: '무시',
};

const SOURCE_LABELS: Record<ResultSource, string> = {
  interim: '중간 결과',
  final: '최종 결과',
};

/** 음성 패널(PRD F2-1~F2-6). 인식 켜기·끄기, 마이크 장치와 입력 레벨, 판별 기록, 명령의 반응 시간을 보여 준다 */
export function VoicePanel({ voice }: Props) {
  const active = voice.status !== 'off';
  const latencySummaries = summarizeLatencies(voice.latencies);

  return (
    <section className="voice" aria-label="음성 제어">
      <h2>음성 제어</h2>
      <p className="voice__privacy">
        음성 인식은 브라우저의 Web Speech API를 사용합니다. 말한 소리가 인식을 위해 브라우저 제공사(Chrome은
        Google)의 서버로 전송될 수 있습니다. 음원, 가사, 연습 기록은 서버로 보내지 않습니다.
      </p>
      {!voice.supported && (
        <p className="message message--error" role="alert">
          이 브라우저는 음성 인식(Web Speech API)을 지원하지 않습니다. Chrome을 사용하세요. 버튼 조작은 계속 쓸 수
          있습니다.
        </p>
      )}

      <div className="voice__controls">
        <button type="button" onClick={active ? voice.disable : voice.enable} aria-pressed={active}>
          {active ? '음성 인식 끄기' : '음성 인식 켜기'}
        </button>
        <p className="message" role="status">
          <strong>{STATUS_LABELS[voice.status]}</strong>
          {active && voice.deviceLabel !== null && ` · 마이크: ${voice.deviceLabel}`}
        </p>
      </div>

      {active && (
        <div className="voice__level">
          <span>입력 레벨</span>
          <meter min={MIN_DB} max={0} value={voice.level} aria-label="입력 레벨" />
          <span className="voice__db">{voice.level <= MIN_DB ? '−∞' : voice.level} dB</span>
        </div>
      )}

      {voice.error !== null && (
        <p className="message message--error" role="alert">
          {voice.error}
        </p>
      )}
      {voice.silent && active && (
        <p className="message message--error" role="alert">
          소리가 들어오지 않습니다. 사용 중인 마이크({voice.deviceLabel ?? '이름 없음'})가 맞는지, 입력 레벨이
          움직이는지 확인하세요.
        </p>
      )}
      {voice.autoplayBlocked && (
        <p className="message message--error" role="alert">
          시작 명령 후 3초가 지나도 재생되지 않았습니다. 브라우저가 자동재생을 막았을 수 있으니 재생 버튼을 한 번
          눌러 주세요.
        </p>
      )}

      {active && voice.heard !== null && <p className="voice__heard">들은 말: “{voice.heard}”</p>}

      {voice.log.length > 0 && (
        <ol className="voice__log" aria-label="판별 기록">
          {voice.log.map((entry) => (
            <li key={entry.id} className={`voice__entry voice__entry--${entry.outcome}`}>
              <span className="voice__outcome">{OUTCOME_LABELS[entry.outcome]}</span>
              <span className="voice__text">“{entry.text}”</span>
              {entry.reason !== null && <span className="voice__reason">{entry.reason}</span>}
              {entry.latency !== null && (
                <span className="voice__latency">
                  {SOURCE_LABELS[entry.source]}로 실행 · 반응 {entry.latency.ms}ms · 첫 인식부터{' '}
                  {entry.latency.sinceFirstResultMs}ms
                </span>
              )}
            </li>
          ))}
        </ol>
      )}

      {latencySummaries.length > 0 && (
        <div className="voice__latencies">
          <h3>반응 시간</h3>
          <p className="voice__note">
            반응: 명령을 실행한 인식 결과를 받은 뒤 재생 상태가 바뀔 때까지. 첫 인식부터: 같은 발화의 첫 인식 결과를
            받은 뒤부터. 이 화면을 연 동안의 최근 {voice.latencies.length}회 평균입니다.
          </p>
          <table>
            <thead>
              <tr>
                <th scope="col">명령</th>
                <th scope="col">횟수</th>
                <th scope="col">반응</th>
                <th scope="col">첫 인식부터</th>
              </tr>
            </thead>
            <tbody>
              {latencySummaries.map((summary) => (
                <tr key={`${summary.command}-${summary.source}`}>
                  <th scope="row">
                    {OUTCOME_LABELS[summary.command]}({SOURCE_LABELS[summary.source]})
                  </th>
                  <td>{summary.count}</td>
                  <td>{summary.averageMs}ms</td>
                  <td>{summary.averageSinceFirstResultMs}ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
