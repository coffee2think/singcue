import { describe, expect, it } from 'vitest';
import { toPlayerError } from '../adapters/playerAdapter/index.ts';
import {
  initialVideoLoadState,
  videoLoadReducer,
  type VideoLoadAction,
  type VideoLoadState,
} from './videoLoadState.ts';

const ID = 'dQw4w9WgXcQ';
const OTHER = 'a-b_c-d_e-f';

function run(actions: VideoLoadAction[], from: VideoLoadState = initialVideoLoadState) {
  return actions.reduce(videoLoadReducer, from);
}

describe('videoLoadReducer', () => {
  it('처음에는 영상이 없다', () => {
    expect(initialVideoLoadState).toEqual({ status: 'empty' });
  });

  it('불러오기 요청은 불러오는 중이 되고 요청마다 번호가 늘어난다', () => {
    const first = run([{ type: 'request', videoId: ID }]);
    expect(first).toEqual({ status: 'loading', request: { requestId: 1, videoId: ID } });

    const second = run([{ type: 'request', videoId: OTHER }], first);
    expect(second).toEqual({ status: 'loading', request: { requestId: 2, videoId: OTHER } });
  });

  it('같은 영상을 다시 요청해도 새 요청으로 본다', () => {
    const state = run([
      { type: 'request', videoId: ID },
      { type: 'playerEvent', requestId: 1, event: { type: 'error', error: toPlayerError(150) } },
      { type: 'request', videoId: ID },
    ]);
    expect(state).toEqual({ status: 'loading', request: { requestId: 2, videoId: ID } });
  });

  it('플레이어 준비 신호로 준비됨이 된다', () => {
    const state = run([
      { type: 'request', videoId: ID },
      { type: 'playerEvent', requestId: 1, event: { type: 'ready' } },
    ]);
    expect(state).toEqual({ status: 'ready', request: { requestId: 1, videoId: ID } });
  });

  it('준비된 뒤의 재생 상태 변경은 준비됨을 유지한다', () => {
    const state = run([
      { type: 'request', videoId: ID },
      { type: 'playerEvent', requestId: 1, event: { type: 'ready' } },
      { type: 'playerEvent', requestId: 1, event: { type: 'stateChange', status: 'playing' } },
    ]);
    expect(state.status).toBe('ready');
  });

  it('플레이어 오류는 코드와 안내 문구를 남긴다', () => {
    const state = run([
      { type: 'request', videoId: ID },
      { type: 'playerEvent', requestId: 1, event: { type: 'ready' } },
      { type: 'playerEvent', requestId: 1, event: { type: 'error', error: toPlayerError(101) } },
    ]);
    expect(state).toEqual({
      status: 'error',
      request: { requestId: 1, videoId: ID },
      code: 101,
      message: toPlayerError(101).message,
    });
  });

  it('오류 뒤에 늦게 온 준비·상태 변경은 오류 안내를 지우지 않는다', () => {
    const error = run([
      { type: 'request', videoId: ID },
      { type: 'playerEvent', requestId: 1, event: { type: 'error', error: toPlayerError(150) } },
    ]);
    const state = run(
      [
        { type: 'playerEvent', requestId: 1, event: { type: 'ready' } },
        { type: 'playerEvent', requestId: 1, event: { type: 'stateChange', status: 'stopped' } },
      ],
      error,
    );
    expect(state).toBe(error);
  });

  it('플레이어를 만들지 못하면 코드 없이 오류가 된다', () => {
    const state = run([
      { type: 'request', videoId: ID },
      { type: 'failed', requestId: 1, message: '불러오지 못했습니다' },
    ]);
    expect(state).toEqual({
      status: 'error',
      request: { requestId: 1, videoId: ID },
      code: null,
      message: '불러오지 못했습니다',
    });
  });

  it('앞선 요청에서 늦게 온 이벤트는 버린다', () => {
    const loading = run([
      { type: 'request', videoId: ID },
      { type: 'request', videoId: OTHER },
    ]);
    const state = run(
      [
        { type: 'playerEvent', requestId: 1, event: { type: 'ready' } },
        { type: 'playerEvent', requestId: 1, event: { type: 'error', error: toPlayerError(150) } },
        { type: 'failed', requestId: 1, message: '늦은 실패' },
      ],
      loading,
    );
    expect(state).toBe(loading);
  });

  it('영상이 없을 때 온 이벤트는 버린다', () => {
    const state = run([{ type: 'playerEvent', requestId: 1, event: { type: 'ready' } }]);
    expect(state).toBe(initialVideoLoadState);
  });
});
