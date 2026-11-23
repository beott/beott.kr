import { describe, expect, test } from "@jest/globals";
import { buildSite, filmLabel, groupRows, issueShortcuts, relatedByWork, workTitles } from "../src/lib/site-model.mjs";

const now = new Date("2026-01-01T00:00:00Z");

/** 테스트용 content 항목을 만듭니다. */
function entry(id, data = {}) {
  return { id, data: { title: id, author: `${id} 필자`, ...data }, body: "본문" };
}

describe("작품 이름", () => {
  // filmTitle의 <…> 안 이름만 작품으로 본다. 플랫폼·시즌 같은 바깥 글자는 작품명이 아니다
  test("extracts work titles inside angle brackets only", () => {
    expect(workTitles("<킹덤> 넷플릭스")).toEqual(["킹덤"]);
    expect(workTitles("<킹덤>, <킹덤: 아신전> 넷플릭스")).toEqual(["킹덤", "킹덤: 아신전"]);
    expect(workTitles("<파친코> 시즌2 Apple TV+")).toEqual(["파친코"]);
    expect(workTitles("<보 번햄 : 못 나가서 만든 쇼> 넷플릭스")).toEqual(["보 번햄 : 못 나가서 만든 쇼"]);
    expect(workTitles("")).toEqual([]);
    expect(workTitles(undefined)).toEqual([]);
    expect(workTitles("작품명 없음")).toEqual([]);
  });

  // 카드 표시용 작품명은 데이터에 있는 이름만 <…>로 묶어 보여 주고, 없으면 빈 문자열
  test("formats the card film label from data without guessing", () => {
    expect(filmLabel({ filmTitle: "<킹덤>, <킹덤: 아신전> 넷플릭스" })).toBe("<킹덤>, <킹덤: 아신전>");
    expect(filmLabel({ filmTitle: "" })).toBe("");
    expect(filmLabel({})).toBe("");
  });
});

describe("같은 작품의 다른 비평", () => {
  const site = { title: "BEOTT", baseURL: "https://beott.kr/", languageCode: "ko", main: ["비옽 1호: 킹덤"] };
  const entries = [
    entry("posts/1/kingdom-2", { filmTitle: "<킹덤> 넷플릭스", date: "2024-10-02T00:00:00+09:00" }),
    entry("posts/1/kingdom-1", { filmTitle: "<킹덤> 넷플릭스", date: "2024-10-01T00:00:00+09:00" }),
    entry("posts/1/kingdom-5", { filmTitle: "<킹덤>, <킹덤: 아신전> 넷플릭스", date: "2024-10-05T00:00:00+09:00" }),
    entry("posts/1/kingdom-hidden", { filmTitle: "<킹덤> 넷플릭스", date: "2024-10-06T00:00:00+09:00", hideme: true }),
    entry("posts/1/kingdom-draft", { filmTitle: "<킹덤> 넷플릭스", date: "2024-10-07T00:00:00+09:00", draft: true }),
    entry("posts/1/squid", { filmTitle: "<오징어 게임> 넷플릭스", date: "2024-10-03T00:00:00+09:00" }),
    entry("posts/3/ott", { filmTitle: "", date: "2025-03-21T00:00:00+09:00" }),
    entry("about", { filmTitle: "<킹덤>" }),
  ];
  const model = buildSite(entries, { site, now });
  const page = id => model.rendered.find(candidate => candidate.id === id);

  // 현재 글을 빼고, 같은 작품을 다룬 공개 posts만 날짜 오름차순으로 돌려준다
  test("lists other published posts about the same work, oldest first", () => {
    const related = relatedByWork(model, page("posts/1/kingdom-1"));

    expect(related.map(item => item.url)).toEqual(["/posts/1/kingdom-2/", "/posts/1/kingdom-5/"]);
    expect(related.map(item => item.params.author)).toEqual(["posts/1/kingdom-2 필자", "posts/1/kingdom-5 필자"]);
  });

  // 여러 작품을 다룬 글은 그중 하나라도 같으면 관련 글이다
  test("matches posts that share any one of several works", () => {
    expect(relatedByWork(model, page("posts/1/kingdom-5")).map(item => item.id)).toEqual(["posts/1/kingdom-1", "posts/1/kingdom-2"]);
  });

  // 같은 작품 글이 없거나 작품명이 비면 빈 목록(영역을 숨김)
  test("returns an empty list when no other post shares the work", () => {
    expect(relatedByWork(model, page("posts/1/squid"))).toEqual([]);
    expect(relatedByWork(model, page("posts/3/ott"))).toEqual([]);
    expect(relatedByWork(model, page("about"))).toEqual([]);
  });
});

describe("호별 목차 바로가기", () => {
  const site = { title: "BEOTT", baseURL: "https://beott.kr/", languageCode: "ko",
    main: ["RECOMMEND", "비옽 3호: 울타리 친 정원", "비옽 3호: SF", "비옽 2호: MAPPING", "비옽 1호: 킹덤", "비옽 4호: 빈 호"] };
  const entries = [
    entry("posts/recommend/a", { group: "RECOMMEND", date: "2025-05-01T00:00:00+09:00" }),
    entry("posts/3/a", { group: "비옽 3호: 울타리 친 정원", date: "2025-03-01T00:00:00+09:00" }),
    entry("posts/3/b", { group: "비옽 3호: SF", date: "2025-02-01T00:00:00+09:00" }),
    entry("posts/2/a", { group: "비옽 2호: MAPPING", date: "2025-01-01T00:00:00+09:00" }),
    entry("posts/1/a", { group: "비옽 1호: 킹덤", date: "2024-10-01T00:00:00+09:00" }),
  ];
  const model = buildSite(entries, { site, now });

  // 홈 그룹 줄 순서에서 각 호의 첫 줄로 가는 앵커를 만든다. 글이 없는 호(4호)는 줄이 없으니 바로가기도 없다
  test("links each issue to its first home row in row order", () => {
    const rows = groupRows(model);

    expect(issueShortcuts(rows)).toEqual([
      { issue: 3, label: "3호", anchor: "issue-3", group: "비옽 3호: 울타리 친 정원" },
      { issue: 2, label: "2호", anchor: "issue-2", group: "비옽 2호: MAPPING" },
      { issue: 1, label: "1호", anchor: "issue-1", group: "비옽 1호: 킹덤" },
    ]);
  });
});
