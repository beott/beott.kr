import { describe, expect, test } from "@jest/globals";
import {
  buildSearchUrl,
  createIndexLoader,
  getShortcutLabel,
  isSearchShortcut,
  normalizeText,
  prepareIndex,
  searchEntries,
  safeSearchHref,
} from "../assets/js/search-core.js";

/** 검색 테스트용 공개 문서를 만듭니다. */
function entry(title, extra = {}) {
  return {
    title,
    href: "/posts/example/",
    author: "",
    filmTitle: "",
    group: "",
    tags: [],
    body: "",
    ...extra,
  };
}

describe("검색 준비와 주소 검증", () => {
  test("한글 조합, 전각, 대소문자와 공백을 정규화한다", () => {
    expect(normalizeText("  한글　ＮＥＴＦＬＩＸ\n  ﬃ ")).toBe("한글 netflix ffi");
  });

  test.each([
    "javascript:alert(1)", "//other.test/post/", "/\\other.test/",
    "/posts/\nfoo/", "https://other.test/posts/", "/posts/%5cevil/",
    "/posts/%0aevil/", "/posts/%2f%2fevil/", "/posts/?q=test",
  ])("위험하거나 정적 페이지가 아닌 주소를 거부한다: %s", (href) => {
    expect(safeSearchHref(href, "https://beott.kr")).toBeNull();
  });

  test("한글 및 percent encoding 경로는 동일 origin에서 허용한다", () => {
    expect(safeSearchHref("/posts/영화/", "https://beott.kr")).toBe("/posts/%EC%98%81%ED%99%94/");
    expect(safeSearchHref("/posts/a/", "http://localhost:8080")).toBe("/posts/a/");
  });

  test("데이터 구조를 확인하고 중복과 안전하지 않은 문서를 제거한다", () => {
    const prepared = prepareIndex([
      entry("제목"), entry("중복"), null, entry("위험", { href: "//evil.test/" }),
      entry("태그 오류", { href: "/bad/", tags: ["a", 2] }),
    ], "https://beott.kr");
    expect(prepared).toHaveLength(1);
    expect(() => prepareIndex({}, "https://beott.kr")).toThrow();
  });
});

describe("AND 검색, 순위와 발췌", () => {
  test("제목, 작품명, 작성자, 호수, 태그, 본문에 나뉜 토큰을 모두 검색한다", () => {
    const index = prepareIndex([entry("정원", {
      filmTitle: "<웨스트월드>", author: "비옽", group: "비옽 3호",
      tags: ["HBO"], body: "공동체의 미래",
    })]);
    expect(searchEntries(index, "정원 웨스트월드 비옽 3호 HBO 공동체").total).toBe(1);
    expect(searchEntries(index, "정원 없는단어").total).toBe(0);
    expect(searchEntries(index, "<웨스트월드>").total).toBe(1);
  });

  test("제목과 작품명 일치가 반복되는 본문보다 먼저 나온다", () => {
    const index = prepareIndex([
      entry("본문", { href: "/body/", body: "킹덤 ".repeat(1000) }),
      entry("리뷰", { href: "/film/", filmTitle: "킹덤" }),
      entry("킹덤", { href: "/title/" }),
    ]);
    expect(searchEntries(index, "킹덤").entries.map((hit) => hit.title)).toEqual(["킹덤", "리뷰", "본문"]);
  });

  test("동점은 제목, 경로로 정렬하고 상한과 총 개수를 따로 반환한다", () => {
    const index = prepareIndex([
      entry("가", { href: "/z/", body: "영화" }),
      entry("가", { href: "/a/", body: "영화" }),
      entry("나", { href: "/b/", body: "영화" }),
    ]);
    const result = searchEntries(index, "영화", 2);
    expect(result.total).toBe(3);
    expect(result.entries.map((hit) => hit.href)).toEqual(["/a/", "/z/"]);
  });

  test("빈 검색은 전체 문서를 나열하지 않는다", () => {
    expect(searchEntries(prepareIndex([entry("글")]), " \n ")).toEqual({ entries: [], total: 0 });
  });

  test("NFKC 길이가 바뀌어도 본문 검색 위치의 발췌가 유지된다", () => {
    const index = prepareIndex([entry("본문", {
      body: "앞부분 ".repeat(100) + "ﬃ 한글 찾는곳 " + "뒷부분 ".repeat(100),
    })]);
    const hit = searchEntries(index, "ffi 한글").entries[0];
    expect(hit.snippet).toContain("ffi 한글 찾는곳");
    expect(hit.snippet.length).toBeLessThanOrEqual(182);
  });

  test("HTML처럼 보이는 문자열도 결과에서 문자열로 유지한다", () => {
    const index = prepareIndex([entry("<img src=x onerror=alert(1)>", { body: "a & b" })]);
    expect(searchEntries(index, "<img").entries[0].title).toBe("<img src=x onerror=alert(1)>");
    expect(searchEntries(index, "a & b").entries[0].snippet).toBe("a & b");
  });
});

describe("색인 지연 로딩", () => {
  test("동시에 요청해도 한 번만 불러오고 결과를 공유한다", async () => {
    let calls = 0;
    const loader = createIndexLoader(async () => {
      calls += 1;
      return [entry("공유")];
    });
    const [first, second] = await Promise.all([loader.load(), loader.load()]);
    expect(calls).toBe(1);
    expect(first).toBe(second);
    expect(first[0].title).toBe("공유");
  });

  test("실패하면 공유 요청을 초기화해 다시 시도할 수 있다", async () => {
    let calls = 0;
    const loader = createIndexLoader(async () => {
      calls += 1;
      if (calls === 1) throw new Error("network");
      return [entry("재시도")];
    });
    await expect(loader.load()).rejects.toThrow("network");
    await expect(loader.load()).resolves.toHaveLength(1);
    expect(calls).toBe(2);
  });

  test("배열이 아닌 응답은 실패로 처리하고 다시 시도한다", async () => {
    let calls = 0;
    const loader = createIndexLoader(async () => {
      calls += 1;
      return calls === 1 ? { title: "x" } : [];
    });
    await expect(loader.load()).rejects.toThrow(TypeError);
    await expect(loader.load()).resolves.toEqual([]);
  });
});

describe("검색 단축키", () => {
  /** 기본값이 Ctrl+K인 키보드 이벤트 모양을 만듭니다. */
  function key(extra = {}) {
    return { key: "k", ctrlKey: true, metaKey: false, altKey: false, shiftKey: false, isComposing: false, keyCode: 75, defaultPrevented: false, ...extra };
  }

  test("Ctrl+K와 Cmd+K를 검색 열기로 인식한다", () => {
    expect(isSearchShortcut(key())).toBe(true);
    expect(isSearchShortcut(key({ ctrlKey: false, metaKey: true, key: "K" }))).toBe(true);
  });

  test.each([
    ["조합 중", key({ isComposing: true })],
    ["IME 처리 키", key({ keyCode: 229 })],
    ["Alt 조합", key({ altKey: true })],
    ["Shift 조합", key({ shiftKey: true })],
    ["다른 키", key({ key: "j" })],
    ["수정키 없음", key({ ctrlKey: false })],
    ["이미 처리됨", key({ defaultPrevented: true })],
  ])("%s이면 가로채지 않는다", (_name, event) => {
    expect(isSearchShortcut(event)).toBe(false);
  });

  test("편집 중이거나 다른 dialog가 열려 있으면 가로채지 않는다", () => {
    expect(isSearchShortcut(key(), { editing: true })).toBe(false);
    expect(isSearchShortcut(key(), { otherDialogOpen: true })).toBe(false);
  });
});

describe("단축키 안내 문구", () => {
  test.each([
    ["macOS", "⌘K"],
    ["MacIntel", "⌘K"],
    ["iPad", "⌘K"],
    ["Win32", "Ctrl K"],
    ["Windows", "Ctrl K"],
    ["Linux x86_64", "Ctrl K"],
    ["", "Ctrl K"],
    [undefined, "Ctrl K"],
  ])("플랫폼 %p에는 %p를 보여 준다", (platform, label) => {
    expect(getShortcutLabel(platform)).toBe(label);
  });
});

describe("검색 페이지 주소", () => {
  test("다른 쿼리와 hash를 보존하며 q만 바꾼다", () => {
    expect(buildSearchUrl("https://beott.kr/search/?utm=a&q=old#top", "킹덤 1")).toBe("/search/?utm=a&q=%ED%82%B9%EB%8D%A4+1#top");
  });

  test("빈 검색어는 q를 제거한다", () => {
    expect(buildSearchUrl("https://beott.kr/search/?q=old&x=1", "  ")).toBe("/search/?x=1");
    expect(buildSearchUrl("https://beott.kr/search/?q=old", "")).toBe("/search/");
  });

  test("검색어 길이를 입력 상한으로 자른다", () => {
    const url = new URL(buildSearchUrl("https://beott.kr/search/", "가".repeat(300)), "https://beott.kr");
    expect(url.searchParams.get("q")).toHaveLength(200);
  });
});
