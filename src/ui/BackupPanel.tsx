import { useRef, useState, type ChangeEvent } from 'react';
import {
  exportBackup,
  importBackup,
  serializeBackup,
  type Backup,
  type BackupStore,
  type ImportResult,
} from '../adapters/storage.ts';
import './BackupPanel.css';

type Props = {
  /** 테스트나 상위 컴포넌트가 저장소를 넘길 수 있다. 없으면 localStorage를 쓴다 */
  store?: BackupStore | null;
  /** 불러오기에 성공한 백업을 알린다 */
  onImported?: (backup: Backup) => void;
};

type Notice =
  | { kind: 'exported'; fileName: string; videos: number }
  | { kind: 'imported'; fileName: string; videos: number }
  | { kind: 'error'; reason: Extract<ImportResult, { ok: false }>['reason'] | 'read-error' };

const ERROR_MESSAGES: Record<Extract<Notice, { kind: 'error' }>['reason'], string> = {
  'invalid-json': 'JSON 파일이 아니라 불러오지 못했습니다.',
  'unsupported-version': '지원하지 않는 백업 형식(version)이라 불러오지 못했습니다.',
  'invalid-format': 'singcue 백업 형식이 아니거나 내용이 손상되어 불러오지 못했습니다.',
  'quota-exceeded': '저장 공간이 부족해 불러오지 못했습니다.',
  'write-error': '브라우저 저장소에 쓸 수 없어 불러오지 못했습니다.',
  'read-error': '파일을 읽지 못했습니다.',
};

/** JSON 백업 내보내기·불러오기(PRD F3-4, F5-4). 파일은 브라우저에서만 만들고 읽으며 서버로 보내지 않는다 */
export function BackupPanel({ store, onImported }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  function handleExport() {
    const backup = store === undefined ? exportBackup() : exportBackup(store);
    const fileName = `singcue-backup-${localDate(new Date())}.json`;
    const url = URL.createObjectURL(new Blob([serializeBackup(backup)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    // 다운로드가 시작될 시간을 둔 뒤 URL을 해제한다
    setTimeout(() => URL.revokeObjectURL(url), 0);
    setNotice({ kind: 'exported', fileName, videos: backup.videos.length });
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // 같은 파일을 다시 골라도 change가 일어나도록 비운다
    event.target.value = '';
    if (!file) return;
    let text: string;
    try {
      text = await file.text();
    } catch {
      setNotice({ kind: 'error', reason: 'read-error' });
      return;
    }
    const result = store === undefined ? importBackup(text) : importBackup(text, store);
    if (!result.ok) {
      setNotice({ kind: 'error', reason: result.reason });
      return;
    }
    setNotice({ kind: 'imported', fileName: file.name, videos: result.backup.videos.length });
    onImported?.(result.backup);
  }

  return (
    <section className="backup" aria-labelledby="backup-title">
      <h2 id="backup-title">백업</h2>
      <p className="backup__hint">
        설정, 구간, 가사 매핑, 연습 기록은 이 브라우저에만 저장되며 서버로 보내지 않습니다. 사이트 데이터를 지우면 모두
        사라지니 JSON 파일로 내보내 두세요.
      </p>
      <div className="backup__actions">
        <button type="button" onClick={handleExport}>
          JSON 내보내기
        </button>
        <button type="button" onClick={() => fileInput.current?.click()}>
          JSON 불러오기
        </button>
        <input
          ref={fileInput}
          className="backup__file"
          type="file"
          accept="application/json,.json"
          aria-label="백업 파일 선택"
          tabIndex={-1}
          onChange={handleFile}
        />
      </div>
      <p className="backup__hint">
        불러오면 설정과 연습 기록은 파일 내용으로 바뀌고, 파일에 있는 영상의 구간·가사 매핑은 덮어씁니다. 파일에 없는
        영상은 그대로 둡니다.
      </p>
      <BackupNotice notice={notice} />
    </section>
  );
}

function BackupNotice({ notice }: { notice: Notice | null }) {
  if (!notice) return null;
  if (notice.kind === 'error') {
    return (
      <p className="message message--error" role="alert">
        {ERROR_MESSAGES[notice.reason]} 기존 데이터는 그대로입니다.
      </p>
    );
  }
  if (notice.kind === 'exported') {
    return (
      <p className="message" role="status">
        영상 {notice.videos}개의 데이터를 {notice.fileName}(으)로 내보냈습니다.
      </p>
    );
  }
  return (
    <p className="message" role="status">
      {notice.fileName}에서 영상 {notice.videos}개의 데이터를 불러왔습니다. 열려 있는 영상은 다시 불러오면 반영됩니다.
    </p>
  );
}

/** 사용자 기기 시간대 기준 YYYY-MM-DD */
function localDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
