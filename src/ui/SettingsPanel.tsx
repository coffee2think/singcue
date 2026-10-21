import { useState, type FormEvent } from 'react';
import { createStorage, type SaveResult, type StorageAdapter } from '../adapters/storage.ts';
import { DEFAULT_SETTINGS } from '../core/defaultSettings.ts';
import type { EndAction, Settings } from '../types.ts';
import {
  defaultDraft,
  END_ACTION_LABELS,
  readDraft,
  toDraft,
  type DraftErrors,
  type DraftField,
  type PanelSettings,
  type SettingsDraft,
} from './settingsForm.ts';

type Props = {
  /** 테스트나 상위 컴포넌트가 저장소를 넘길 수 있다. 없으면 localStorage를 쓴다 */
  storage?: StorageAdapter;
  /** 저장에 성공한 설정을 알린다 */
  onChange?: (settings: Settings) => void;
};

type Notice = { kind: 'saved' | 'reset' } | { kind: 'error'; reason: Extract<SaveResult, { ok: false }>['reason'] };

const END_ACTIONS = Object.keys(END_ACTION_LABELS) as EndAction[];

/** 설정 패널(PRD F2-7, F2-9). 저장 버튼을 누를 때 입력값을 확인해 `singcue:settings`에 저장한다 */
export function SettingsPanel({ storage: givenStorage, onChange }: Props) {
  const [storage] = useState(() => givenStorage ?? createStorage());
  const [saved, setSaved] = useState(() => storage.loadSettings());
  const [draft, setDraft] = useState<SettingsDraft>(() => toDraft(saved));
  const [errors, setErrors] = useState<DraftErrors>({});
  const [notice, setNotice] = useState<Notice | null>(null);

  function update<K extends keyof SettingsDraft>(key: K, value: SettingsDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setNotice(null);
  }

  function save(panel: PanelSettings, kind: 'saved' | 'reset') {
    // 패널에 없는 항목(유사도 기준, 최소 재생 시간)은 저장된 값을 그대로 둔다
    const next: Settings = { ...saved, ...panel };
    const result = storage.saveSettings(next);
    if (!result.ok) {
      setNotice({ kind: 'error', reason: result.reason });
      return;
    }
    setSaved(next);
    setDraft(toDraft(next));
    setErrors({});
    setNotice({ kind });
    onChange?.(next);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = readDraft(draft);
    if (!result.ok) {
      setErrors(result.errors);
      setNotice(null);
      return;
    }
    save(result.settings, 'saved');
  }

  function handleReset() {
    const result = readDraft(defaultDraft());
    if (result.ok) save(result.settings, 'reset');
  }

  const fieldProps = (field: DraftField) => ({
    id: `settings-${field}`,
    'aria-invalid': errors[field] !== undefined,
    'aria-describedby': errors[field] ? `settings-${field}-error` : undefined,
  });

  return (
    <form className="settings" aria-labelledby="settings-title" onSubmit={handleSubmit} noValidate>
      <h2 id="settings-title">설정</h2>

      <fieldset>
        <legend>구간 끝 동작</legend>
        {END_ACTIONS.map((action) => (
          <label key={action} className="settings__choice">
            <input
              type="radio"
              name="endAction"
              value={action}
              checked={draft.endAction === action}
              onChange={() => update('endAction', action)}
            />
            {END_ACTION_LABELS[action]}
            {action === DEFAULT_SETTINGS.endAction && ' (기본)'}
          </label>
        ))}
      </fieldset>

      <div className="settings__field">
        <label htmlFor="settings-preroll">프리롤(초, 0 이상)</label>
        <input
          {...fieldProps('preroll')}
          type="text"
          inputMode="decimal"
          value={draft.preroll}
          onChange={(event) => update('preroll', event.target.value)}
        />
        <p className="settings__hint">구간 시작보다 이만큼 앞에서 재생합니다. 기본 {DEFAULT_SETTINGS.preroll}초</p>
        <FieldError field="preroll" errors={errors} />
      </div>

      <div className="settings__field">
        <label htmlFor="settings-shortRuleChars">짧은 발화 허용 글자 수(0 이상의 정수)</label>
        <input
          {...fieldProps('shortRuleChars')}
          type="text"
          inputMode="numeric"
          value={draft.shortRuleChars}
          onChange={(event) => update('shortRuleChars', event.target.value)}
        />
        <p className="settings__hint">
          명령어를 뺀 나머지 글자가 이보다 많으면 가사로 보고 무시합니다. 기본 {DEFAULT_SETTINGS.shortRuleChars}자
        </p>
        <FieldError field="shortRuleChars" errors={errors} />
      </div>

      <label className="settings__choice">
        <input
          type="checkbox"
          checked={draft.stopOnInterim}
          onChange={(event) => update('stopOnInterim', event.target.checked)}
        />
        정지 즉시 실행(중간 인식 결과로 정지)
      </label>

      <div className="settings__lists">
        <WordListField
          field="stopWords"
          label="정지 명령어"
          value={draft.stopWords}
          errors={errors}
          fieldProps={fieldProps('stopWords')}
          onChange={(value) => update('stopWords', value)}
        />
        <WordListField
          field="startWords"
          label="시작 명령어"
          value={draft.startWords}
          errors={errors}
          fieldProps={fieldProps('startWords')}
          onChange={(value) => update('startWords', value)}
        />
      </div>

      <div className="settings__actions">
        <button type="submit">저장</button>
        <button type="button" onClick={handleReset}>
          기본값으로 되돌리기
        </button>
      </div>
      <SettingsNotice notice={notice} />
    </form>
  );
}

type WordListFieldProps = {
  field: 'stopWords' | 'startWords';
  label: string;
  value: string;
  errors: DraftErrors;
  fieldProps: { id: string; 'aria-invalid': boolean; 'aria-describedby': string | undefined };
  onChange: (value: string) => void;
};

function WordListField({ field, label, value, errors, fieldProps, onChange }: WordListFieldProps) {
  return (
    <div className="settings__field">
      <label htmlFor={fieldProps.id}>{label}(한 줄에 하나씩)</label>
      <textarea
        {...fieldProps}
        rows={6}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        spellCheck={false}
      />
      <p className="settings__hint">기본: {DEFAULT_SETTINGS[field].join(', ')}</p>
      <FieldError field={field} errors={errors} />
    </div>
  );
}

function FieldError({ field, errors }: { field: DraftField; errors: DraftErrors }) {
  const message = errors[field];
  if (!message) return null;
  return (
    <p id={`settings-${field}-error`} className="message message--error" role="alert">
      {message}
    </p>
  );
}

function SettingsNotice({ notice }: { notice: Notice | null }) {
  if (!notice) return null;
  if (notice.kind === 'error') {
    return (
      <p className="message message--error" role="alert">
        {notice.reason === 'quota-exceeded'
          ? '저장 공간이 부족해 설정을 저장하지 못했습니다. 이전 설정이 그대로 유지됩니다.'
          : '브라우저 저장소에 쓸 수 없어 설정을 저장하지 못했습니다. 이전 설정이 그대로 유지됩니다.'}
      </p>
    );
  }
  return (
    <p className="message" role="status">
      {notice.kind === 'reset' ? '기본값으로 되돌려 저장했습니다.' : '설정을 저장했습니다.'}
    </p>
  );
}
