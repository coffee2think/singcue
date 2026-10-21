import { describe, expect, it } from 'vitest';
import { createStorage, SETTINGS_KEY, type KeyValueStore } from '../adapters/storage.ts';
import { DEFAULT_SETTINGS } from '../core/defaultSettings.ts';
import {
  defaultDraft,
  overlappingWords,
  parsePreroll,
  parseShortRuleChars,
  parseWordList,
  readDraft,
  SETTINGS_ERROR_MESSAGES,
  toDraft,
  type SettingsDraft,
} from './settingsForm.ts';

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, String(value));
    },
  };
}

const validDraft: SettingsDraft = {
  endAction: 'repeat',
  preroll: '2.5',
  stopWords: '그만\n멈춰',
  startWords: '가자',
  stopOnInterim: true,
  shortRuleChars: '3',
  minPracticeSeconds: '5',
};

describe('parsePreroll', () => {
  it.each([
    ['0', 0],
    ['1.5', 1.5],
    [' 3 ', 3],
    ['.5', 0.5],
    ['10', 10],
  ])('"%s"는 %d초', (text, value) => {
    expect(parsePreroll(text)).toBe(value);
  });

  it.each(['', ' ', '-1', '-0.5', 'abc', '1.5초', '1e2', 'Infinity', 'NaN', '1.', '1,5', '9'.repeat(400)])(
    '"%s"는 받지 않는다',
    (text) => {
      expect(parsePreroll(text)).toBeNull();
    },
  );
});

describe('parseShortRuleChars', () => {
  it.each([
    ['0', 0],
    ['2', 2],
    [' 5 ', 5],
  ])('"%s"는 %d자', (text, value) => {
    expect(parseShortRuleChars(text)).toBe(value);
  });

  it.each(['', '-1', '1.5', '2.0', '1e2', 'abc', '두', '9'.repeat(20)])('"%s"는 받지 않는다', (text) => {
    expect(parseShortRuleChars(text)).toBeNull();
  });
});

describe('parseWordList', () => {
  it('줄바꿈과 쉼표로 나누고 앞뒤 공백과 빈 항목을 뺀다', () => {
    expect(parseWordList(' 잠깐 \n\n스탑, 정지 ,\n')).toEqual(['잠깐', '스탑', '정지']);
  });

  it('정규화하면 같은 말은 처음 것만 남긴다', () => {
    expect(parseWordList('stop\nStop\n멈춰\n멈 춰\nSTOP!')).toEqual(['stop', '멈춰']);
  });

  it('판별에 쓰이지 않는 기호만 있는 항목은 뺀다', () => {
    expect(parseWordList('!!\n...\n잠깐')).toEqual(['잠깐']);
  });

  it('빈 입력은 빈 목록', () => {
    expect(parseWordList('  \n , ')).toEqual([]);
  });
});

describe('overlappingWords', () => {
  it('정지 명령어가 들어 있는 시작 명령어를 찾는다', () => {
    expect(overlappingWords(['정지', 'stop'], ['시작', 'Stop', '정지해제'])).toEqual(['Stop', '정지해제']);
  });

  it('기본 목록에는 겹치는 말이 없다', () => {
    expect(overlappingWords(DEFAULT_SETTINGS.stopWords, DEFAULT_SETTINGS.startWords)).toEqual([]);
  });
});

describe('toDraft·defaultDraft', () => {
  it('명령어 목록은 한 줄에 하나씩, 숫자는 글자로 보여 준다', () => {
    expect(defaultDraft()).toEqual({
      endAction: 'stop',
      preroll: '1.5',
      stopWords: '잠깐\n스탑\n스톱\n정지\n멈춰\nstop',
      startWords: '시작\n재생해\n틀어줘\n음악큐',
      stopOnInterim: false,
      shortRuleChars: '2',
      minPracticeSeconds: '3',
    });
  });

  it('기본값 입력란을 그대로 읽으면 기본 명령어 목록을 줄이지 않고 돌려준다', () => {
    const result = readDraft(defaultDraft());
    expect(result).toEqual({
      ok: true,
      settings: {
        endAction: DEFAULT_SETTINGS.endAction,
        preroll: DEFAULT_SETTINGS.preroll,
        stopWords: [...DEFAULT_SETTINGS.stopWords],
        startWords: [...DEFAULT_SETTINGS.startWords],
        stopOnInterim: DEFAULT_SETTINGS.stopOnInterim,
        shortRuleChars: DEFAULT_SETTINGS.shortRuleChars,
        minPracticeSeconds: DEFAULT_SETTINGS.minPracticeSeconds,
      },
    });
  });

  it('기본값 입력란을 바꿔도 DEFAULT_SETTINGS의 목록은 바뀌지 않는다', () => {
    const result = readDraft(defaultDraft());
    if (result.ok) result.settings.stopWords.push('그만');
    expect(DEFAULT_SETTINGS.stopWords).toHaveLength(6);
  });
});

describe('readDraft', () => {
  it('맞는 입력은 설정으로 바꾼다', () => {
    expect(readDraft(validDraft)).toEqual({
      ok: true,
      settings: {
        endAction: 'repeat',
        preroll: 2.5,
        stopWords: ['그만', '멈춰'],
        startWords: ['가자'],
        stopOnInterim: true,
        shortRuleChars: 3,
        minPracticeSeconds: 5,
      },
    });
  });

  it('틀린 항목마다 안내를 돌려준다', () => {
    const result = readDraft({
      ...validDraft,
      preroll: '-1',
      shortRuleChars: '1.5',
      minPracticeSeconds: '3초',
      stopWords: ' ',
      startWords: '',
    });
    expect(result).toEqual({
      ok: false,
      errors: {
        preroll: SETTINGS_ERROR_MESSAGES.preroll,
        shortRuleChars: SETTINGS_ERROR_MESSAGES.shortRuleChars,
        minPracticeSeconds: SETTINGS_ERROR_MESSAGES.minPracticeSeconds,
        stopWords: SETTINGS_ERROR_MESSAGES.stopWords,
        startWords: SETTINGS_ERROR_MESSAGES.startWords,
      },
    });
  });

  it('하나만 틀려도 저장할 설정을 돌려주지 않는다', () => {
    expect(readDraft({ ...validDraft, preroll: 'abc' })).toEqual({
      ok: false,
      errors: { preroll: SETTINGS_ERROR_MESSAGES.preroll },
    });
  });

  it('정지 명령어가 들어 있는 시작 명령어는 받지 않는다', () => {
    expect(readDraft({ ...validDraft, startWords: '가자\n그만해' })).toEqual({
      ok: false,
      errors: { startWords: SETTINGS_ERROR_MESSAGES.overlap(['그만해']) },
    });
  });

  it('프리롤 0초와 짧은 발화 0자는 받는다', () => {
    const result = readDraft({ ...validDraft, preroll: '0', shortRuleChars: '0' });
    expect(result.ok && [result.settings.preroll, result.settings.shortRuleChars]).toEqual([0, 0]);
  });

  it.each([
    ['0', 0],
    ['2.5', 2.5],
    [' 10 ', 10],
  ])('최소 재생 시간 %j는 %d초로 읽는다', (text, seconds) => {
    const result = readDraft({ ...validDraft, minPracticeSeconds: text });
    expect(result.ok && result.settings.minPracticeSeconds).toBe(seconds);
  });

  it.each(['', '-1', 'abc', '1e400', '3초'])('최소 재생 시간 %j는 받지 않는다', (text) => {
    expect(readDraft({ ...validDraft, minPracticeSeconds: text })).toEqual({
      ok: false,
      errors: { minPracticeSeconds: SETTINGS_ERROR_MESSAGES.minPracticeSeconds },
    });
  });
});

describe('storage와 함께', () => {
  it('저장한 설정은 새 어댑터(새로고침)로 읽어도 그대로다', () => {
    const store = memoryStore();
    const result = readDraft(validDraft);
    if (!result.ok) throw new Error('입력이 틀림');
    createStorage(store).saveSettings({ ...DEFAULT_SETTINGS, ...result.settings });

    const reloaded = createStorage(store).loadSettings();
    expect(reloaded).toEqual({ ...DEFAULT_SETTINGS, ...result.settings });
    expect(toDraft(reloaded)).toEqual({ ...validDraft, preroll: '2.5', shortRuleChars: '3', minPracticeSeconds: '5' });
    expect(reloaded.minPracticeSeconds).toBe(5);
    expect(store.data.has(SETTINGS_KEY)).toBe(true);
  });
});
