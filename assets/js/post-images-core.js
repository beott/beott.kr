/** 글 상세 이미지 표시 판정(순수 함수). DOM 연결은 post-images.js가 맡습니다. */

/** 모바일에서 세로 이미지를 줄이는 기준: 화면(svh) 높이의 40%. */
export const TALL_VIEWPORT_RATIO = 0.4;

/**
 * 원래 본문 표시 폭에 놓았을 때 높이가 화면 높이의 40%를 넘는지 판정합니다.
 * 크기를 아직 모르면(로드 전 등) 대상이 아닙니다.
 */
export function isTallImage({ naturalWidth, naturalHeight, displayWidth, viewportHeight } = {}) {
  if (!(naturalWidth > 0 && naturalHeight > 0 && displayWidth > 0 && viewportHeight > 0)) return false;
  return (displayWidth * naturalHeight) / naturalWidth > viewportHeight * TALL_VIEWPORT_RATIO;
}

/** 저자 선택 본문형(.image-reader)이 미리보기 높이(40svh)보다 길어 펼치기 버튼이 필요한지 판정합니다. */
export function needsReaderToggle(contentHeight, viewportHeight) {
  return contentHeight > viewportHeight * TALL_VIEWPORT_RATIO;
}
