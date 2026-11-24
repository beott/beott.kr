import { describe, expect, test } from "@jest/globals";
import { CARD_WIDTHS, HERO_WIDTHS, imageSrcset, localImagePath, optimizedUrl } from "../src/lib/responsive-images.mjs";

describe("반응형 이미지 경로", () => {
  test("extracts site image paths from relative and absolute URLs", () => {
    expect(localImagePath("/images/choice/Gannibal-thumbnail.png")).toBe("/images/choice/Gannibal-thumbnail.png");
    expect(localImagePath("https://beott.kr/images/1/kingdom-1-thumbnail.webp")).toBe("/images/1/kingdom-1-thumbnail.webp");
    expect(localImagePath("https://cdn.example/a.jpg")).toBe("");
    expect(localImagePath("")).toBe("");
  });

  test("builds derivative URLs next to the original path", () => {
    expect(optimizedUrl("/images/choice/Gannibal-thumbnail.png", 800)).toBe("/images/opt/choice/Gannibal-thumbnail-w800.webp");
    expect(imageSrcset("/images/a.jpg", [400, 800])).toBe("/images/opt/a-w400.webp 400w, /images/opt/a-w800.webp 800w");
    expect(CARD_WIDTHS).toEqual([400, 800]);
    expect(HERO_WIDTHS).toEqual([800, 1280, 1920]);
  });
});
