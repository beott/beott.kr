/** 비옽 공개 색인의 검증·정규화·검색을 담당하는 순수 함수 모음입니다. */
const QUERY_LIMIT = 200;
const TOKEN_LIMIT = 12;

/** 한글 조합·전각·대소문자와 연속 공백을 검색용으로 맞춥니다. */
export function normalizeText(value) {
  return value.normalize("NFKC").toLocaleLowerCase("ko").replace(/\s+/gu, " ").trim();
}

/** 동일 origin의 정적 페이지 경로만 허용하고 정규화된 주소를 반환합니다. */
export function safeSearchHref(href, origin = "https://beott.kr") {
  if (typeof href !== "string" || !href.startsWith("/") || href.startsWith("//")) return null;
  try {
    const decoded = decodeURIComponent(href);
    if (/[\\\u0000-\u0020\u007f?#]/u.test(decoded) || decoded.startsWith("//") || decoded.includes("//")) return null;
    const url = new URL(href, origin);
    if (url.origin !== new URL(origin).origin || url.search || url.hash || !url.pathname.endsWith("/")) return null;
    return url.pathname;
  } catch {
    return null;
  }
}

/** 불완전한 항목·중복을 제거하고 검색 필드를 최초 한 번만 정규화합니다. */
export function prepareIndex(data, origin = "https://beott.kr") {
  if (!Array.isArray(data)) throw new TypeError("검색 색인은 배열이어야 합니다.");
  const seen = new Set();
  return data.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    if (!["title", "author", "filmTitle", "group", "body"].every((key) => typeof entry[key] === "string")) return [];
    if (!entry.title.trim() || !Array.isArray(entry.tags) || !entry.tags.every((tag) => typeof tag === "string")) return [];
    const href = safeSearchHref(entry.href, origin);
    if (!href || seen.has(href)) return [];
    seen.add(href);
    const title = normalizeText(entry.title);
    const filmTitle = normalizeText(entry.filmTitle);
    const metadata = normalizeText([entry.author, entry.group, ...entry.tags].join(" "));
    const body = normalizeText(entry.body);
    return [{
      title: entry.title,
      filmTitle: entry.filmTitle,
      author: entry.author,
      group: entry.group,
      href,
      normalized: { title, filmTitle, metadata, body, all: [title, filmTitle, metadata, body].join(" ") },
    }];
  });
}

/** 정규화한 본문에서 일치어 부근을 발췌해 길이 변화로 인한 위치 오류를 피합니다. */
function makeSnippet(body, tokens) {
  const positions = tokens.map((token) => body.indexOf(token)).filter((position) => position >= 0);
  const start = Math.max(0, (positions.length ? Math.min(...positions) : 0) - 45);
  const end = Math.min(body.length, start + 180);
  return `${start ? "…" : ""}${body.slice(start, end)}${end < body.length ? "…" : ""}`;
}

/** 검색어를 정규화해 공백 단위 토큰으로 나눕니다(최대 12개). */
export function tokenizeQuery(query) {
  return normalizeText(query.slice(0, QUERY_LIMIT)).split(" ").filter(Boolean).slice(0, TOKEN_LIMIT);
}

/** 원문을 글자 단위로 정규화하며 정규화 문자열의 각 위치가 원문 어디에서 왔는지 기록합니다. */
function mapNormalized(text) {
  let normalized = "";
  const starts = [];
  const ends = [];
  let previousSpace = true;
  for (let index = 0; index < text.length;) {
    const char = String.fromCodePoint(text.codePointAt(index));
    let piece = char.normalize("NFKC").toLocaleLowerCase("ko");
    const isSpace = /^\s+$/u.test(piece);
    if (isSpace && previousSpace) {
      index += char.length;
      continue;
    }
    if (isSpace) piece = " ";
    previousSpace = isSpace;
    for (let offset = 0; offset < piece.length; offset += 1) {
      starts.push(index);
      ends.push(index + char.length);
    }
    normalized += piece;
    index += char.length;
  }
  return { normalized, starts, ends };
}

/** 원문을 검색어 일치 구간과 나머지로 나눕니다. 정규화 기준으로 찾고 원문 표기를 보존합니다. */
export function highlightSegments(text, tokens) {
  if (!text) return [];
  const { normalized, starts, ends } = mapNormalized(text);
  const ranges = [];
  for (const token of tokens) {
    if (!token) continue;
    for (let found = normalized.indexOf(token); found >= 0; found = normalized.indexOf(token, found + 1)) {
      ranges.push([starts[found], ends[found + token.length - 1]]);
    }
  }
  ranges.sort((left, right) => left[0] - right[0]);
  const merged = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range[0] <= last[1]) {
      last[1] = Math.max(last[1], range[1]);
    } else {
      merged.push([...range]);
    }
  }
  const segments = [];
  let cursor = 0;
  for (const [start, end] of merged) {
    if (start > cursor) segments.push({ text: text.slice(cursor, start), match: false });
    segments.push({ text: text.slice(start, end), match: true });
    cursor = end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), match: false });
  return segments;
}

/** 모든 검색어가 맞는 글을 제목·작품명 우선으로 정렬해 건수와 발췌를 반환합니다. */
export function searchEntries(index, query, limit = 60) {
  const normalizedQuery = normalizeText(query.slice(0, QUERY_LIMIT));
  const tokens = tokenizeQuery(query);
  if (!tokens.length) return { entries: [], total: 0 };
  const candidates = index.flatMap((entry) => {
    const fields = entry.normalized;
    if (!tokens.every((token) => fields.all.includes(token))) return [];
    let score = 0;
    if (fields.title === normalizedQuery) score += 10000;
    if (fields.filmTitle === normalizedQuery) score += 8000;
    if (fields.title.startsWith(normalizedQuery)) score += 3000;
    if (fields.filmTitle.startsWith(normalizedQuery)) score += 2000;
    for (const token of tokens) {
      if (fields.title.includes(token)) score += 100;
      if (fields.filmTitle.includes(token)) score += 80;
      if (fields.metadata.includes(token)) score += 20;
      if (fields.body.includes(token)) score += 1;
    }
    return [{ entry, score }];
  });
  candidates.sort((left, right) => right.score - left.score
    || left.entry.title.localeCompare(right.entry.title, "ko")
    || left.entry.href.localeCompare(right.entry.href));
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(100, Math.floor(limit))) : 60;
  return {
    entries: candidates.slice(0, safeLimit).map(({ entry }) => ({
      title: entry.title,
      filmTitle: entry.filmTitle,
      author: entry.author,
      group: entry.group,
      href: entry.href,
      snippet: makeSnippet(entry.normalized.body, tokens),
    })),
    total: candidates.length,
  };
}

/** 색인 요청을 하나의 Promise로 공유하고 실패하면 다음 호출에서 다시 요청합니다. */
export function createIndexLoader(fetchIndex) {
  let pending = null;
  return {
    load() {
      if (!pending) {
        pending = Promise.resolve()
          .then(fetchIndex)
          .then((data) => {
            if (!Array.isArray(data)) throw new TypeError("검색 색인은 배열이어야 합니다.");
            return data;
          })
          .catch((error) => {
            pending = null;
            throw error;
          });
      }
      return pending;
    },
  };
}

/** 편집·IME 조합·다른 dialog를 방해하지 않는 Ctrl/Cmd+K 입력인지 판별합니다. */
export function isSearchShortcut(event, { editing = false, otherDialogOpen = false } = {}) {
  if (editing || otherDialogOpen || event.defaultPrevented) return false;
  if (event.isComposing || event.keyCode === 229) return false;
  if (event.altKey || event.shiftKey) return false;
  if (!(event.ctrlKey || event.metaKey)) return false;
  return typeof event.key === "string" && event.key.toLowerCase() === "k";
}

/** 플랫폼 이름에 맞는 검색 단축키 안내 문구(Apple 계열은 ⌘K, 그 외는 Ctrl K)를 돌려줍니다. */
export function getShortcutLabel(platform) {
  return /mac|iphone|ipad|ipod/i.test(platform || "") ? "⌘K" : "Ctrl K";
}

/** 현재 주소의 다른 쿼리와 hash를 보존한 채 q 값만 바꾼 상대 주소를 만듭니다. */
export function buildSearchUrl(currentHref, query) {
  const url = new URL(currentHref);
  const trimmed = query.trim().slice(0, QUERY_LIMIT);
  if (trimmed) {
    url.searchParams.set("q", trimmed);
  } else {
    url.searchParams.delete("q");
  }
  return `${url.pathname}${url.search}${url.hash}`;
}
