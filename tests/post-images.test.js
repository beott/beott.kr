import { describe, expect, test } from "@jest/globals";
import { isTallImage, needsReaderToggle, TALL_VIEWPORT_RATIO } from "../assets/js/post-images-core.js";
import { renderMarkdown } from "../src/lib/markdown.mjs";

// 390×844 휴대폰: 40svh = 337.6px
const phone = { displayWidth: 390, viewportHeight: 844 };

describe("모바일 세로 이미지 판정", () => {
  // 본문 표시 폭(모바일 100vw)에 놓았을 때 높이가 40svh를 넘는 이미지만 대상이다
  test("marks only images taller than 40svh at the original display width", () => {
    expect(TALL_VIEWPORT_RATIO).toBe(0.4);
    // kingdom-2 포스터 1024×1536 → 585px > 337.6px
    expect(isTallImage({ naturalWidth: 1024, naturalHeight: 1536, ...phone })).toBe(true);
    // 가로 스틸 800×450 → 219px
    expect(isTallImage({ naturalWidth: 800, naturalHeight: 450, ...phone })).toBe(false);
    // 정사각형 1000×1000 → 390px > 337.6px (세로가 길지 않아도 40svh를 넘으면 대상)
    expect(isTallImage({ naturalWidth: 1000, naturalHeight: 1000, ...phone })).toBe(true);
    // 경계: 정확히 40svh는 대상이 아니다
    expect(isTallImage({ naturalWidth: 390, naturalHeight: 337.6, ...phone })).toBe(false);
  });

  // 같은 이미지도 화면이 바뀌면 다시 판정한다(가로 모드 844×390에서는 짧은 가로 화면 기준)
  test("depends on the current viewport, not on the image alone", () => {
    expect(isTallImage({ naturalWidth: 800, naturalHeight: 450, displayWidth: 844, viewportHeight: 390 })).toBe(true);
    expect(isTallImage({ naturalWidth: 800, naturalHeight: 450, displayWidth: 390, viewportHeight: 844 })).toBe(false);
  });

  // 아직 로드 전(크기 0)이거나 값이 없으면 대상이 아니다(기존 표시 유지)
  test("leaves images without known sizes unchanged", () => {
    expect(isTallImage({ naturalWidth: 0, naturalHeight: 0, ...phone })).toBe(false);
    expect(isTallImage({ naturalWidth: 1024, naturalHeight: 1536, displayWidth: 0, viewportHeight: 844 })).toBe(false);
    expect(isTallImage({})).toBe(false);
  });

  // 저자 선택 본문형은 내용이 40svh보다 길 때만 미리보기+펼치기를 붙인다
  test("collapses an author-selected reader only when it is longer than the preview", () => {
    expect(needsReaderToggle(1200, 844)).toBe(true);
    expect(needsReaderToggle(300, 844)).toBe(false);
    expect(needsReaderToggle(0, 844)).toBe(false);
  });
});

describe("저자 선택 본문형 문법", () => {
  // 가이드 예제 그대로: raw HTML div와 빈 줄, Markdown 이미지가 div 안 문단으로 렌더링된다
  test("renders the guide example as a reader block around markdown images", () => {
    const html = renderMarkdown('<div class="image-reader">\n\n![만화 1쪽](/images/a.webp)\n\n![만화 2쪽](/images/b.webp)\n\n</div>');

    expect(html).toBe('<div class="image-reader">\n<p><img src="/images/a.webp" alt="만화 1쪽"></p>\n' +
      '<p><img src="/images/b.webp" alt="만화 2쪽"></p>\n</div>\n');
  });
});
