import { describe, expect, it } from 'vitest';
import { parseVideoId } from './parseVideoId.ts';

const ID = 'dQw4w9WgXcQ';

describe('parseVideoId', () => {
  it.each([
    ['11자 영상 ID', ID],
    ['앞뒤 공백이 있는 영상 ID', `  ${ID}\n`],
    ['watch 주소', `https://www.youtube.com/watch?v=${ID}`],
    ['다른 파라미터가 섞인 watch 주소', `https://www.youtube.com/watch?list=PL123&v=${ID}&t=42s`],
    ['모바일 watch 주소', `https://m.youtube.com/watch?v=${ID}`],
    ['YouTube Music watch 주소', `https://music.youtube.com/watch?v=${ID}`],
    ['스킴 없는 watch 주소', `youtube.com/watch?v=${ID}`],
    ['youtu.be 주소', `https://youtu.be/${ID}`],
    ['공유 파라미터가 붙은 youtu.be 주소', `https://youtu.be/${ID}?si=abcDEF123&t=10`],
    ['스킴 없는 youtu.be 주소', `youtu.be/${ID}`],
    ['shorts 주소', `https://www.youtube.com/shorts/${ID}`],
    ['파라미터가 붙은 shorts 주소', `https://youtube.com/shorts/${ID}?feature=share`],
    ['embed 주소', `https://www.youtube.com/embed/${ID}`],
    ['nocookie embed 주소', `https://www.youtube-nocookie.com/embed/${ID}?start=30`],
    ['http 주소', `http://www.youtube.com/watch?v=${ID}`],
    ['대문자 호스트', `https://WWW.YOUTUBE.COM/watch?v=${ID}`],
  ])('%s를 해석한다', (_, input) => {
    expect(parseVideoId(input)).toBe(ID);
  });

  it('ID에 쓰이는 -, _ 문자를 받는다', () => {
    expect(parseVideoId('a-b_c-d_e-f')).toBe('a-b_c-d_e-f');
    expect(parseVideoId('https://youtu.be/a-b_c-d_e-f')).toBe('a-b_c-d_e-f');
  });

  it.each([
    ['빈 문자열', ''],
    ['공백만', '   '],
    ['10자 ID', 'dQw4w9WgXc'],
    ['12자 ID', 'dQw4w9WgXcQQ'],
    ['허용하지 않는 문자가 든 ID', 'dQw4w9WgX!Q'],
    ['일반 문장', '좋아하는 노래 링크'],
    ['YouTube가 아닌 호스트', `https://example.com/watch?v=${ID}`],
    ['YouTube를 흉내 낸 호스트', `https://youtube.com.evil.example/watch?v=${ID}`],
    ['v 파라미터 없는 watch 주소', 'https://www.youtube.com/watch?list=PL123'],
    ['ID 길이가 틀린 watch 주소', 'https://www.youtube.com/watch?v=short'],
    ['ID가 없는 youtu.be 주소', 'https://youtu.be/'],
    ['ID 길이가 틀린 youtu.be 주소', `https://youtu.be/${ID}x`],
    ['ID가 없는 shorts 주소', 'https://www.youtube.com/shorts/'],
    ['채널 주소', 'https://www.youtube.com/@channel'],
    ['재생목록 주소', 'https://www.youtube.com/playlist?list=PL123'],
    ['다른 경로에 붙은 v 파라미터', `https://www.youtube.com/results?v=${ID}`],
    ['http/https가 아닌 스킴', `ftp://youtu.be/${ID}`],
    ['javascript 스킴', `javascript:alert('${ID}')`],
  ])('%s에는 null을 돌려준다', (_, input) => {
    expect(parseVideoId(input)).toBeNull();
  });
});
