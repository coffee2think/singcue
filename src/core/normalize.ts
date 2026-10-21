// 음성 명령 판별과 구절 매칭이 함께 쓰는 정규화. 기술 설계 문서의 "구절 매칭 설계" 1단계를 따른다.

/** 문자(\p{L})와 숫자(\p{N})가 아닌 글자. 공백, 문장 부호, 기호, 말줄임표 등 */
const NON_WORD = /[^\p{L}\p{N}]/gu;

/** 소문자로 바꾸고 공백과 기호를 지운다 */
export function normalize(text: string): string {
  return text.toLowerCase().replace(NON_WORD, '');
}
