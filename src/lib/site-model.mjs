/**
 * 콘텐츠 항목으로 Hugo와 같은 사이트 모델(페이지 목록, 섹션, 태그, 정렬)을 만듭니다.
 * Astro 페이지·엔드포인트와 테스트가 같은 규칙을 공유하도록 순수 함수로 둡니다.
 */
import { renderMarkdown } from "./markdown.mjs";
import { ZERO_DATE, laterDate, parseDate, urlize } from "./hugo.mjs";

/** Hugo 기본 정렬(날짜 내림차순 → 링크 제목 → 경로)로 비교합니다. weight는 쓰지 않습니다. */
export function compareDefault(left, right) {
  if (left.date.epoch !== right.date.epoch) return right.date.epoch > left.date.epoch ? 1 : -1;
  if (left.linkTitle !== right.linkTitle) return left.linkTitle < right.linkTitle ? -1 : 1;
  if (left.url !== right.url) return left.url < right.url ? -1 : 1;
  return 0;
}

/** 날짜 오름차순(같으면 기존 순서 유지)으로 정렬한 새 배열을 돌려줍니다(Hugo `sort . "Date" "asc"`). */
export function sortByDateAsc(pages) {
  return [...pages].sort((left, right) => (left.date.epoch === right.date.epoch ? 0 : left.date.epoch < right.date.epoch ? -1 : 1));
}

/** 날짜 내림차순 정렬(Hugo `sort . "Date" "desc"`)입니다. */
export function sortByDateDesc(pages) {
  return [...pages].sort((left, right) => (left.date.epoch === right.date.epoch ? 0 : left.date.epoch > right.date.epoch ? -1 : 1));
}

/** 목록에서 가장 최근 lastmod(Hugo `ByLastmod.Reverse` 첫 항목)를 돌려줍니다. */
function latestLastmod(pages) {
  return pages.reduce((latest, page) => laterDate(latest, page.lastmod), ZERO_DATE);
}

/** 목록에서 가장 최근 date를 돌려줍니다. */
function latestDate(pages) {
  return pages.reduce((latest, page) => laterDate(latest, page.date), ZERO_DATE);
}

/** 콘텐츠 항목 하나를 페이지 객체로 바꿉니다. */
function toPage(entry) {
  const { id, data, body } = entry;
  const segments = id.split("/");
  const date = parseDate(data.date);
  const publishDate = data.publishDate ? parseDate(data.publishDate) : date;
  return {
    kind: "page",
    id,
    section: segments.length > 1 ? segments[0] : "",
    url: `/${segments.map(urlize).join("/")}/`,
    title: data.title,
    linkTitle: data.title,
    params: data,
    body,
    date,
    publishDate,
    lastmod: data.lastmod ? parseDate(data.lastmod) : date,
    expiryDate: parseDate(data.expiryDate),
    draft: data.draft === true,
    list: data.build?.list ?? "always",
    render: data.build?.render ?? "always",
  };
}

/** 빌드 시점 기준으로 draft·예약(future)·만료(expired)가 아닌지 확인합니다(Hugo 기본 빌드 옵션). */
export function isPublished(page, now) {
  if (page.draft) return false;
  if (!page.publishDate.zero && page.publishDate.epoch > now.getTime()) return false;
  if (!page.expiryDate.zero && page.expiryDate.epoch <= now.getTime()) return false;
  return true;
}

/** 목록용 페이지(섹션·홈·taxonomy)를 만듭니다. */
function listPage(kind, url, title, pages) {
  const sorted = [...pages].sort(compareDefault);
  return { kind, url, title, linkTitle: title, pages: sorted, date: latestDate(sorted), lastmod: latestLastmod(sorted) };
}

/**
 * 사이트 모델을 만듭니다.
 * @param {{ id: string, data: object, body: string }[]} entries content 항목
 * @param {{ site: { title: string, baseURL: string, main: string[] }, now?: Date }} options
 */
export function buildSite(entries, { site, now = new Date() }) {
  const pages = entries.map(toPage).filter((page) => isPublished(page, now));
  const urls = new Map();
  for (const page of pages) {
    if (urls.has(page.url)) throw new Error(`URL이 겹칩니다: ${page.url} (${urls.get(page.url)}, ${page.id})`);
    urls.set(page.url, page.id);
  }
  for (const page of pages) {
    page.html = renderMarkdown(page.body);
  }
  const rendered = pages.filter((page) => page.render !== "never");
  const regularPages = pages.filter((page) => page.list !== "never").sort(compareDefault);

  const sections = new Map();
  for (const page of regularPages) {
    if (!page.section) continue;
    if (!sections.has(page.section)) sections.set(page.section, []);
    sections.get(page.section).push(page);
  }
  const sectionPages = [...sections].map(([name, members]) => (
    listPage("section", `/${urlize(name)}/`, name.charAt(0).toUpperCase() + name.slice(1), members)
  ));

  const taxonomies = [
    { name: "tags", title: "Tags", param: "tags" },
    { name: "categories", title: "Categories", param: "categories" },
  ].map(({ name, title, param }) => {
    const terms = new Map();
    // Hugo는 콘텐츠 파일 경로 순서로 처음 만난 표기를 term 제목으로 씁니다(예: "WAVVE"와 "Wavve").
    const byPath = [...regularPages].sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
    for (const page of byPath) {
      for (const value of page.params[param] ?? []) {
        const slug = urlize(value);
        if (!terms.has(slug)) terms.set(slug, { slug, title: value, members: [] });
        if (!terms.get(slug).members.includes(page)) terms.get(slug).members.push(page);
      }
    }
    const termPages = [...terms.values()].map((term) => ({
      ...listPage("term", `/${name}/${term.slug}/`, term.title, term.members),
      slug: term.slug,
    }));
    return { ...listPage("taxonomy", `/${name}/`, title, termPages), name, terms: termPages.sort(compareDefault) };
  });

  const home = { ...listPage("home", "/", site.title, regularPages), pages: regularPages };
  // Hugo sitemap은 목록에서 빠진(`build.list = "never"`) 검색 페이지를 누락했으므로, 렌더링되는 모든 HTML 페이지를 넣습니다.
  const sitemapPages = [home, ...sectionPages, ...taxonomies, ...taxonomies.flatMap((taxonomy) => taxonomy.terms), ...rendered]
    .sort(compareDefault);

  return { site, pages, rendered, regularPages, sections: sectionPages, taxonomies, home, sitemapPages };
}

/** 랜딩 히어로: posts 섹션 글을 날짜 내림차순으로 5개(`hideme`와 무관, 기존 템플릿과 동일). */
export function heroPosts(model) {
  return sortByDateDesc(model.regularPages.filter((page) => page.section === "posts")).slice(0, 5);
}

/**
 * 랜딩 그룹 줄: `site.main` 순서대로, 해당 group의 글을 날짜 오름차순으로 보여 줍니다.
 * 기존 템플릿처럼 그룹에 글이 하나라도 있으면 줄을 만들고, `hideme = true` 글만 숨깁니다.
 */
export function groupRows(model) {
  return model.site.main
    .map((group) => ({ group, pages: model.regularPages.filter((page) => page.params.group === group) }))
    .filter((row) => row.pages.length > 0)
    .map((row) => ({ group: row.group, pages: sortByDateAsc(row.pages).filter((page) => page.params.hideme !== true) }));
}

/**
 * 검색 색인 항목: 공개 posts(hideme·hidden 제외)와 소개·문의만 포함합니다(기존 `layouts/index.json`).
 * 키 순서는 Go jsonify처럼 알파벳순입니다.
 */
export function searchEntries(model, plainBody) {
  return model.regularPages
    .filter((page) => {
      const isPost = page.section === "posts" && page.params.hideme !== true && page.params.hidden !== true;
      const isInfo = page.id === "about" || page.id === "contact-us";
      return isPost || isInfo;
    })
    .map((page) => ({
      author: page.params.author || "",
      body: plainBody(page.html),
      filmTitle: page.params.filmTitle || "",
      group: page.params.group || "",
      href: page.url,
      tags: page.params.tags || [],
      title: page.title,
    }));
}
