import { describe, expect, test } from "@jest/globals";
import { renderMarkdown } from "../src/lib/markdown.mjs";

describe("Goldmark 호환 Markdown 렌더링", () => {
  // 따옴표 치환은 Goldmark typographer 규칙(블록 단위 짝 맞춤)을 따른다
  test("replaces quotes like the Goldmark typographer", () => {
    expect(renderMarkdown('그는 "울타리 때문"이라고 했다. "끝."\n')).toBe(
      "<p>그는 &ldquo;울타리 때문&quot;이라고 했다. &ldquo;끝.&rdquo;</p>\n",
    );
    // Goldmark는 `</sub>` 뒤 따옴표를 여는 따옴표로 본다(기존 Hugo 출력과 동일한 동작)
    expect(renderMarkdown("'인클로저<sub>Enclosure</sub>'의 역사\n")).toBe(
      "<p>&lsquo;인클로저<sub>Enclosure</sub>&lsquo;의 역사</p>\n",
    );
    expect(renderMarkdown("Nagi's (...) 1994--2004\n")).toBe("<p>Nagi&rsquo;s (&hellip;) 1994&ndash;2004</p>\n");
  });

  // 한국어 작품명 괄호(<킹덤>)는 HTML 태그가 아니므로 이스케이프하고, raw HTML은 그대로 둔다
  test("escapes Korean angle brackets and keeps raw HTML", () => {
    expect(renderMarkdown("<다크<sub>Dark</sub>>(2017)\n")).toBe("<p>&lt;다크<sub>Dark</sub>&gt;(2017)</p>\n");
  });

  // 제목 id는 Hugo github 방식(소문자, 문장부호 제거, 공백은 -)
  test("creates github style heading ids with duplicates numbered", () => {
    expect(renderMarkdown("# <폭군>의 여전한 작법\n\n# 0.\n\n# 0.\n")).toBe(
      '<h1 id="폭군의-여전한-작법">&lt;폭군&gt;의 여전한 작법</h1>\n<h1 id="0">0.</h1>\n<h1 id="0-1">0.</h1>\n',
    );
  });

  // 각주는 참조 순서대로 번호를 매기고 문서 끝에 Goldmark 마크업으로 모은다
  test("renders footnotes in reference order", () => {
    const html = renderMarkdown("본문[^b] 그리고[^a]\n\n[^a]: 가\n[^b]: 나\n");
    expect(html).toContain('<sup id="fnref:1"><a href="#fn:1" class="footnote-ref" role="doc-noteref">1</a></sup>');
    expect(html).toContain('<li id="fn:1">\n<p>나&#160;<a href="#fnref:1" class="footnote-backref" role="doc-backlink">&#x21a9;&#xfe0e;</a></p>\n</li>');
    expect(html.indexOf('id="fn:2"')).toBeGreaterThan(html.indexOf('id="fn:1"'));
  });

  // 역슬래시 줄바꿈, 이미지 alt typographer, 이메일 자동 링크, 한 개 물결 취소선
  test("handles hard breaks, image alt, linkify and single tilde strikethrough", () => {
    expect(renderMarkdown("> 첫 줄\\\n> 둘째 줄\n")).toBe("<blockquote>\n<p>첫 줄<br>\n둘째 줄</p>\n</blockquote>\n");
    expect(renderMarkdown("![Nagi's](/images/a.webp)\n")).toBe('<p><img src="/images/a.webp" alt="Nagi&rsquo;s"></p>\n');
    expect(renderMarkdown("- 문의 : mag.beott@gmail.com\n")).toBe(
      '<ul>\n<li>문의 : <a href="mailto:mag.beott@gmail.com">mag.beott@gmail.com</a></li>\n</ul>\n',
    );
    expect(renderMarkdown("(1994~2004)나 (2005~2013)\n")).toBe("<p>(1994<del>2004)나 (2005</del>2013)</p>\n");
  });
});
