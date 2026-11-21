/** GitHub Pages(Jekyll 3.10)가 `_config.yml`의 `exclude`로 건너뛰는 경로를 계산합니다. */

/** `_config.yml`의 `exclude:` 목록(`  - 항목` 형식)만 읽습니다. 다른 키는 무시합니다. */
export function readPagesExclude(configText) {
  const patterns = [];
  let inExclude = false;
  for (const line of configText.split(/\r?\n/)) {
    if (/^\s*(#|$)/.test(line)) continue;
    if (/^\S/.test(line)) {
      inExclude = /^exclude:\s*$/.test(line);
      continue;
    }
    const item = line.match(/^\s+-\s+(.+?)\s*$/);
    if (inExclude && item) patterns.push(item[1].replace(/^(["'])(.*)\1$/, "$2"));
  }
  return patterns;
}

/** Ruby `File.fnmatch?`(플래그 없음)처럼 `*`·`?`만 해석하는 정규식을 만듭니다. `*`는 `/`도 지납니다. */
function fnmatchRegExp(pattern) {
  if (/[[\]{}\\]/.test(pattern)) throw new Error(`지원하지 않는 exclude 패턴입니다: ${pattern}`);
  const body = pattern.replace(/[.+^$()|]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${body}$`);
}

/**
 * Jekyll 3.10 `EntryFilter#glob_include?`와 같은 규칙으로 source 기준 상대 경로가 제외되는지 판단합니다.
 * 패턴은 source 루트에 붙여 비교하므로 최상위 기준이고, glob 일치 외에 문자열 접두사 일치도 제외합니다
 * (예: `public`은 `images/public`은 건드리지 않지만 루트의 `publicity.html`은 제외).
 * Jekyll은 디렉터리를 내려가며 항목마다 검사하므로 상위 경로 중 하나라도 걸리면 제외로 봅니다.
 */
export function isExcludedByPages(patterns, path) {
  const parts = path.replace(/^\/+|\/+$/g, "").split("/");
  return parts.some((_, index) => {
    const prefix = parts.slice(0, index + 1).join("/");
    return patterns.some((pattern) => fnmatchRegExp(pattern).test(prefix) || prefix.startsWith(pattern));
  });
}

/** Jekyll 3.10 `EntryFilter#special?`·`backup?`: 경로 마디가 `.`·`_`·`#`·`~`로 시작하거나 `~`로 끝나면 건너뜁니다. */
export function isSpecialForJekyll(path) {
  return path.split("/").some((part) => /^[._#~]/.test(part) || part.endsWith("~"));
}

/**
 * Jekyll 3.10 기본 exclude 목록입니다. `_config.yml`에 exclude를 직접 쓰면 기본값은 덮어써지지만,
 * 설정이 바뀌어도 산출물이 사라지지 않도록 산출물 이름이 이 목록과 겹치지 않는지 따로 확인합니다.
 */
export const JEKYLL_DEFAULT_EXCLUDES = [
  "Gemfile",
  "Gemfile.lock",
  "node_modules",
  "vendor/bundle/",
  "vendor/cache/",
  "vendor/gems/",
  "vendor/ruby/",
];
