/**
 * 기존 Hugo 출력과 같은 결과를 내기 위한 호환 함수 모음입니다.
 * (날짜 형식, 경로 규칙, 이스케이프, 자동 요약, 검색 본문 추출)
 */
import { decodeHTML } from "entities";

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Hugo의 0 시각(time.Time{})입니다. */
export const ZERO_DATE = Object.freeze({ epoch: Number.NEGATIVE_INFINITY, offsetMinutes: 0, zero: true });

/**
 * front matter 날짜 문자열을 원래 시간대(offset)를 보존한 값으로 바꿉니다.
 * 시간대가 없으면 Hugo 기본값처럼 UTC로 봅니다. 값이 없으면 ZERO_DATE를 돌려줍니다.
 */
export function parseDate(value) {
  if (value === undefined || value === null || value === "") return ZERO_DATE;
  const match = String(value).trim().match(DATE_PATTERN);
  if (!match) throw new Error(`해석할 수 없는 날짜입니다: ${value}`);
  const [, year, month, day, hour = "0", minute = "0", second = "0", zone = "Z"] = match;
  let offsetMinutes = 0;
  if (zone !== "Z") {
    const digits = zone.replace(":", "");
    offsetMinutes = (digits[0] === "-" ? -1 : 1) * (Number(digits.slice(1, 3)) * 60 + Number(digits.slice(3, 5)));
  }
  const local = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  return { epoch: local - offsetMinutes * 60_000, offsetMinutes, zero: false };
}

/** 날짜의 원래 시간대 기준 달력 값을 돌려줍니다. */
function localParts(date) {
  const shifted = new Date(date.epoch + date.offsetMinutes * 60_000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
  };
}

const pad = (value, size = 2) => String(value).padStart(size, "0");

/** 시간대 offset을 `+0900` 또는 `+09:00` 형식으로 만듭니다. */
function formatOffset(offsetMinutes, separator) {
  const sign = offsetMinutes < 0 ? "-" : "+";
  const absolute = Math.abs(offsetMinutes);
  return `${sign}${pad(Math.floor(absolute / 60))}${separator}${pad(absolute % 60)}`;
}

/** Go `Mon, 02 Jan 2006 15:04:05 -0700` 형식(RSS pubDate)으로 만듭니다. */
export function formatRssDate(date) {
  if (date.zero) return "Mon, 01 Jan 0001 00:00:00 +0000";
  const p = localParts(date);
  return `${WEEKDAYS[p.weekday]}, ${pad(p.day)} ${MONTHS[p.month]} ${p.year} ${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)} ${formatOffset(date.offsetMinutes, "")}`;
}

/** Go `2006-01-02T15:04:05-07:00` 형식(sitemap lastmod)으로 만듭니다. */
export function formatIsoDate(date) {
  if (date.zero) return "0001-01-01T00:00:00+00:00";
  const p = localParts(date);
  return `${p.year}-${pad(p.month + 1)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}${formatOffset(date.offsetMinutes, ":")}`;
}

/** 날짜 두 개 중 늦은 쪽을 돌려줍니다. 같으면 앞의 값을 유지합니다. */
export function laterDate(left, right) {
  return right.epoch > left.epoch ? right : left;
}

/**
 * Hugo `urlize`/경로 정규화와 같은 규칙으로 경로 조각을 만듭니다.
 * 공백은 `-`, 문자·숫자와 `%._-#+~/` 외 문자는 제거하고 소문자로 바꿉니다.
 */
export function urlize(value) {
  let output = "";
  for (const char of String(value).trim()) {
    if (/\s/u.test(char)) output += "-";
    else if (/[\p{L}\p{N}\p{M}%._\-#+~/\\]/u.test(char)) output += char;
  }
  return output.replace(/-{2,}/g, "-").toLowerCase();
}

/** Go html/template이 텍스트에 적용하는 이스케이프와 같습니다(`+`도 `&#43;`로 바꿈). */
export function escapeTemplateText(value) {
  return String(value).replace(/[\0"&'+<>]/g, (char) => ({
    "\0": "�",
    '"': "&#34;",
    "&": "&amp;",
    "'": "&#39;",
    "+": "&#43;",
    "<": "&lt;",
    ">": "&gt;",
  })[char]);
}

/** Go encoding/xml EscapeText(`transform.XMLEscape`)와 같은 이스케이프입니다. */
export function escapeXmlText(value) {
  return String(value).replace(/[\t\n\r"&'<>]|[^\t\n\r -퟿-�\u{10000}-\u{10FFFF}]/gu, (char) => ({
    "\t": "&#x9;",
    "\n": "&#xA;",
    "\r": "&#xD;",
    '"': "&#34;",
    "&": "&amp;",
    "'": "&#39;",
    "<": "&lt;",
    ">": "&gt;",
  })[char] ?? "�");
}

/** Hugo가 RSS 출력에 적용하는 absURL 치환처럼 `/`로 시작하는 src·href를 절대 주소로 바꿉니다. */
export function absolutizeXmlUrls(xml, baseURL) {
  const base = baseURL.replace(/\/$/, "");
  return xml.replace(/\b(src|href)=(&#34;|")\/(?!\/)/g, (_, attribute, quote) => `${attribute}=${quote}${base}/`);
}

/** Go encoding/json처럼 `<`, `>`, `&`, U+2028, U+2029를 유니코드 이스케이프한 JSON을 만듭니다. */
export function goJsonify(value) {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

const VOID_ELEMENTS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const PROBABLY_TAG = /^<\/?[A-Za-z]+>?$/;
const PROBABLY_ATTRIBUTE = /^[A-Za-z]+=["']/;

/** 자동 요약 경계가 열린 요소 안에서 끝나면 그 요소가 닫히는 위치까지 늘립니다. */
function expandToBalancedHtml(input, low, high, maxHigh) {
  if (low >= high || high >= maxHigh) return high;
  const stack = [];
  const tagPattern = /<(\/?)([A-Za-z][A-Za-z0-9-]*)[^>]*?(\/?)>/g;
  tagPattern.lastIndex = low;
  let match;
  while ((match = tagPattern.exec(input))) {
    const end = match.index + match[0].length;
    if (match.index >= high && stack.length === 0) return high;
    if (end > maxHigh) break;
    const [, closing, rawName, selfClosing] = match;
    const name = rawName.toLowerCase();
    if (VOID_ELEMENTS.has(name) || selfClosing) continue;
    if (closing) {
      const index = stack.lastIndexOf(name);
      if (index !== -1) stack.length = index;
    } else {
      stack.push(name);
    }
    if (match.index >= high && stack.length === 0) return end;
  }
  return high;
}

/**
 * Hugo 자동 요약(`.Summary`, summaryLength 70, CJK 비활성)을 재현합니다.
 * 문단(`</p>`) 단위로 단어를 세어 70단어에 도달한 문단까지를 요약으로 씁니다.
 */
export function summarize(html, numWords = 70) {
  let count = 0;
  const countWord = (word) => {
    const trimmed = word.trim();
    if (!trimmed || trimmed === ">" || PROBABLY_TAG.test(trimmed) || PROBABLY_ATTRIBUTE.test(trimmed)) return 0;
    return 1;
  };
  for (let start = 0; start < html.length;) {
    const rest = html.slice(start);
    const closing = rest.indexOf("</p>");
    if (closing === -1) break;
    const paragraph = rest.slice(0, closing);
    let wordStart = 0;
    for (let index = 0; index < paragraph.length;) {
      const char = String.fromCodePoint(paragraph.codePointAt(index));
      if (/\s/u.test(char) || index + char.length === paragraph.length) {
        count += countWord(paragraph.slice(wordStart, index));
        wordStart = index;
        if (count >= numWords) break;
      }
      index += char.length;
    }
    if (count >= numWords) {
      const high = expandToBalancedHtml(html, 0, start + closing + 4, html.length);
      return html.slice(0, high).trim();
    }
    start += closing + 3;
  }
  return html.trim();
}

/**
 * 검색 색인 본문을 만듭니다. 기존 `layouts/index.json`처럼 `<br>`·블록 경계를 공백으로 바꾸고
 * 태그 제거(plainify) → HTML 엔티티 해제 → 공백 정리 순서로 처리합니다.
 */
export function plainSearchBody(html) {
  const spaced = html.replace(/<br\s*\/?>|<\/(?:p|h[1-6]|li|dt|dd|blockquote|pre|div|figcaption|tr|td|th)>/gi, " ");
  const stripped = spaced.replace(/\n/g, " ").replace(/<[^>]*>/g, "");
  // Go RE2의 `\s`는 ASCII 공백만 뜻하므로 각주 앞 `&#160;`(NBSP)은 그대로 남깁니다.
  return decodeHTML(stripped).replace(/[\t\n\f\r ]+/g, " ").trim();
}
