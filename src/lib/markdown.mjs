/**
 * Hugo(Goldmark, `unsafe = true`)와 같은 HTML을 만드는 Markdown 렌더러입니다.
 *
 * remark(micromark + GFM)로 파싱한 mdast를 Goldmark html renderer와 같은 형식으로 직접 직렬화합니다.
 * Hugo 기본값인 typographer, GFM linkify, footnote, github 방식 heading id를 흉내 냅니다.
 */
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";

const processor = unified().use(remarkParse).use(remarkGfm);

const SUBSTITUTIONS = {
  leftSingleQuote: "&lsquo;",
  rightSingleQuote: "&rsquo;",
  leftDoubleQuote: "&ldquo;",
  rightDoubleQuote: "&rdquo;",
  enDash: "&ndash;",
  emDash: "&mdash;",
  ellipsis: "&hellip;",
  leftAngleQuote: "&laquo;",
  rightAngleQuote: "&raquo;",
  apostrophe: "&rsquo;",
};

/** Goldmark util.EscapeHTML과 같은 문자만 이스케이프합니다. */
export function escapeHtml(value) {
  return value.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]);
}

/** Goldmark util.URLEscape처럼 안전하지 않은 문자를 퍼센트 인코딩하고 HTML 속성으로 이스케이프합니다. */
function escapeUrl(url) {
  const encoded = url.replace(/%(?![0-9a-fA-F]{2})|[^A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]/gu, (char) => encodeURIComponent(char));
  return escapeHtml(encoded);
}

const ASCII_PUNCT = new Set(Array.from("!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~", (char) => char.charCodeAt(0)));
const ASCII_SPACE = new Set([0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x20]);

/** Go unicode.IsSpace / util.IsSpaceRune과 같습니다. */
const isSpaceRune = (char) => /\s/u.test(char) || char === "\u0085";
/** Go unicode.IsPunct와 같습니다. */
const isUnicodePunct = (char) => /\p{P}/u.test(char);
/** Goldmark util.IsPunctRune(기호 포함)과 같습니다. */
const isPunctRune = (char) => /[\p{P}\p{S}]/u.test(char);
const isLetter = (char) => /\p{L}/u.test(char);
const isDigit = (char) => /\p{Nd}/u.test(char);

/** Go처럼 UTF-8 바이트 배열로 다루는 한 줄입니다. */
class ByteLine {
  constructor(text) {
    this.bytes = Buffer.from(text, "utf8");
    this.length = this.bytes.length;
  }

  /** i번째 바이트를 문자로 돌려줍니다(ASCII 비교용). */
  byte(index) {
    return this.bytes[index];
  }

  /** 바이트 offset에서 시작하는 rune을 돌려줍니다(util.ToRune). */
  rune(index) {
    let start = index;
    while (start > 0 && (this.bytes[start] & 0xc0) === 0x80) start -= 1;
    return Array.from(this.bytes.subarray(start, start + 4).toString("utf8"))[0] ?? " ";
  }
}

const code = (char) => char.charCodeAt(0);
const isPunctByte = (value) => ASCII_PUNCT.has(value);
const isSpaceByte = (value) => ASCII_SPACE.has(value);
const isNumericByte = (value) => value >= 0x30 && value <= 0x39;

/** Goldmark parser.ScanDelimiter를 따옴표용으로 옮긴 함수입니다. */
function scanDelimiter(line, before) {
  let end = 0;
  while (end < line.length && line.byte(end) === line.byte(0)) end += 1;
  const after = end !== line.length ? line.rune(end) : " ";
  const beforeIsPunct = isPunctRune(before);
  const beforeIsSpace = isSpaceRune(before);
  const afterIsPunct = isPunctRune(after);
  const afterIsSpace = isSpaceRune(after);
  return {
    canOpen: !afterIsSpace && (!afterIsPunct || beforeIsSpace || beforeIsPunct),
    canClose: !beforeIsSpace && (!beforeIsPunct || afterIsSpace || afterIsPunct),
  };
}

/**
 * Goldmark extension/typographer.go의 Parse를 옮긴 함수입니다.
 * 치환하면 { text, advance }를, 아니면 null을 돌려줍니다. counter는 블록 단위로 초기화됩니다.
 */
function typograph(line, before, counter) {
  const c = line.byte(0);
  if (line.length > 2) {
    if (c === code("-")) {
      if (line.byte(1) === code("-") && line.byte(2) === code("-")) return { text: SUBSTITUTIONS.emDash, advance: 3 };
    } else if (c === code(".")) {
      if (line.byte(1) === code(".") && line.byte(2) === code(".")) return { text: SUBSTITUTIONS.ellipsis, advance: 3 };
      return null;
    }
  }
  if (line.length > 1) {
    if (c === code("<")) return line.byte(1) === code("<") ? { text: SUBSTITUTIONS.leftAngleQuote, advance: 2 } : null;
    if (c === code(">")) return line.byte(1) === code(">") ? { text: SUBSTITUTIONS.rightAngleQuote, advance: 2 } : null;
    if (c === code("-") && line.byte(1) === code("-")) return { text: SUBSTITUTIONS.enDash, advance: 2 };
  }
  if (c !== code("'") && c !== code('"')) return null;
  const d = scanDelimiter(line, before);
  const one = (text) => ({ text, advance: 1 });
  if (c === code("'")) {
    if (d.canOpen && !d.canClose && line.length > 3 && isNumericByte(line.byte(1)) && isNumericByte(line.byte(2)) && line.byte(3) === code("s")) {
      const after = line.length > 4 ? line.rune(4) : " ";
      if (line.length === 3 || isSpaceRune(after) || isPunctRune(after)) return one(SUBSTITUTIONS.apostrophe);
    }
    if (line.length > 1 && (isUnicodePunct(before) || isSpaceRune(before)) && [..."tenl"].map(code).includes(line.byte(1))) {
      return one(SUBSTITUTIONS.apostrophe);
    }
    if (line.length > 1 && (isDigit(before) || isLetter(before)) && isLetter(line.rune(1))) {
      return one(SUBSTITUTIONS.apostrophe);
    }
    if (d.canOpen && !d.canClose) {
      let nt = "leftSingleQuote";
      if (line.length > 1 && [..."smtd"].map(code).includes(line.byte(1)) && (line.length < 3 || isPunctByte(line.byte(2)) || isSpaceByte(line.byte(2)))) {
        nt = "rightSingleQuote";
      }
      const pair = String.fromCharCode(line.byte(1) ?? 0, line.byte(2) ?? 0);
      if (line.length > 2 && ["ve", "ll", "re"].includes(pair) && (line.length < 4 || isPunctByte(line.byte(3)) || isSpaceByte(line.byte(3)))) {
        nt = "rightSingleQuote";
      }
      if (nt === "leftSingleQuote") counter.single += 1;
      return one(SUBSTITUTIONS[nt]);
    }
    // Go 연산자 우선순위 그대로: (len>1 && IsSpace(line[0])) || (IsPunct(line[0]) && len>2 && !IsDigit(line[1]))
    if ((line.length > 1 && isSpaceRune(line.rune(0))) || (isUnicodePunct(line.rune(0)) && line.length > 2 && !isDigit(line.rune(1)))) {
      return one(SUBSTITUTIONS.rightSingleQuote);
    }
    if (counter.single > 0) {
      const isClose = d.canClose && !d.canOpen;
      const maybeClose = d.canClose && d.canOpen && line.length > 1 && isUnicodePunct(line.rune(1))
        && (line.length === 2 || (line.length > 2 && isPunctByte(line.byte(2))) || isSpaceByte(line.byte(2)));
      if (isClose || maybeClose) {
        counter.single -= 1;
        return one(SUBSTITUTIONS.rightSingleQuote);
      }
    }
    return null;
  }
  if (d.canOpen && !d.canClose) {
    counter.double += 1;
    return one(SUBSTITUTIONS.leftDoubleQuote);
  }
  if (counter.double > 0) {
    const isClose = d.canClose && !d.canOpen;
    const maybeClose = d.canClose && d.canOpen && line.length > 1 && isUnicodePunct(line.rune(1))
      && (line.length === 2 || (line.length > 2 && isPunctByte(line.byte(2))) || isSpaceByte(line.byte(2)));
    if (isClose || maybeClose) {
      if (line.length > 1 && line.byte(1) === code('"') && isDigit(before)) return null;
      counter.double -= 1;
      return one(SUBSTITUTIONS.rightDoubleQuote);
    }
  }
  return null;
}

/** Hugo `autoHeadingIDType = "github"`와 같은 규칙으로 heading id를 만듭니다. */
function anchorize(text) {
  let id = "";
  for (const char of text) {
    if (isSpaceRune(char)) id += "-";
    else if (char === "_" || char === "-" || /[\p{L}\p{N}]/u.test(char)) id += char.toLowerCase();
  }
  return id;
}

/** mdast 노드의 순수 텍스트를 이어 붙입니다. */
function plainText(node) {
  if ("value" in node && typeof node.value === "string") return node.value;
  return (node.children || []).map(plainText).join("");
}

/** 문서 하나를 렌더링하는 동안 heading id·footnote 상태를 보관합니다. */
class Renderer {
  constructor(source, tree) {
    this.source = source;
    this.ids = new Map();
    this.definitions = new Map();
    this.footnotes = [];
    for (const node of tree.children) {
      if (node.type === "footnoteDefinition") this.definitions.set(node.identifier, node);
    }
  }

  /** 인라인을 파싱하는 블록(문단·제목·표 칸)에 들어갈 때 typographer 상태를 초기화합니다. */
  enterInlineBlock(node) {
    this.block_ = { start: node.position.start.offset, end: node.position.end.offset };
    this.counter = { single: 0, double: 0 };
  }

  /** Goldmark PrecendingCharacter: 블록 첫 줄 시작이면 줄바꿈, 아니면 원문 앞 문자입니다. */
  precedingChar(offset) {
    if (offset <= this.block_.start || offset <= 0) return "\n";
    const low = this.source.charCodeAt(offset - 1);
    if (low >= 0xdc00 && low <= 0xdfff) return this.source.slice(offset - 2, offset);
    return this.source[offset - 1];
  }

  /** offset부터 현재 줄 끝(줄바꿈 포함, 블록 마지막 줄이면 제외)까지를 바이트 줄로 만듭니다. */
  lineAt(offset) {
    const newline = this.source.indexOf("\n", offset);
    const end = newline === -1 || newline >= this.block_.end ? this.block_.end : newline + 1;
    return new ByteLine(this.source.slice(offset, Math.max(end, offset)));
  }

  /**
   * 텍스트 노드 값의 각 문자를 원문 offset에 맞춥니다. 역슬래시 이스케이프한 문자는 escaped로 표시합니다.
   * 줄 앞 들여쓰기·인용 기호처럼 값에 없는 원문 문자는 건너뜁니다.
   */
  alignText(node) {
    const chars = [];
    let cursor = node.position.start.offset;
    const limit = node.position.end.offset;
    for (const char of node.value) {
      let escaped = false;
      while (cursor < limit && !this.source.startsWith(char, cursor)) {
        if (this.source[cursor] === "\\" && this.source.startsWith(char, cursor + 1)) {
          escaped = true;
          cursor += 1;
          break;
        }
        cursor += 1;
      }
      chars.push({ char, offset: cursor, escaped });
      cursor += char.length;
    }
    return chars;
  }

  /** 원문 offset이 연속인 문자 목록을 typographer로 처리해 HTML로 만듭니다. */
  typographChars(chars) {
    let output = "";
    for (let index = 0; index < chars.length;) {
      const { char, offset, escaped } = chars[index];
      const result = escaped ? null : typograph(this.lineAt(offset), this.precedingChar(offset), this.counter);
      if (!result) {
        output += escapeHtml(char);
        index += 1;
        continue;
      }
      output += result.text;
      index += result.advance;
    }
    return output;
  }

  blocks(children) {
    return children.map((child) => this.block(child)).join("");
  }

  inlines(parent) {
    return parent.children.map((child) => this.inline(child, parent)).join("");
  }

  block(node) {
    switch (node.type) {
      case "paragraph":
        this.enterInlineBlock(node);
        return `<p>${this.inlines(node)}</p>\n`;
      case "heading": {
        this.enterInlineBlock(node);
        const id = this.uniqueId(anchorize(plainText(node)));
        return `<h${node.depth} id="${escapeHtml(id)}">${this.inlines(node)}</h${node.depth}>\n`;
      }
      case "blockquote":
        return `<blockquote>\n${this.blocks(node.children)}</blockquote>\n`;
      case "list": {
        const tag = node.ordered ? "ol" : "ul";
        const start = node.ordered && node.start !== null && node.start !== 1 ? ` start="${node.start}"` : "";
        const items = node.children.map((item) => this.listItem(item, node.spread || node.children.some((child) => child.spread))).join("");
        return `<${tag}${start}>\n${items}</${tag}>\n`;
      }
      case "thematicBreak":
        return "<hr>\n";
      case "html":
        return `${node.value}\n`;
      case "code": {
        const language = node.lang ? ` class="language-${escapeHtml(node.lang)}"` : "";
        return `<pre><code${language}>${escapeHtml(node.value ? `${node.value}\n` : "")}</code></pre>\n`;
      }
      case "table":
        return this.table(node);
      case "footnoteDefinition":
      case "definition":
        return "";
      default:
        throw new Error(`지원하지 않는 Markdown 블록입니다: ${node.type}`);
    }
  }

  listItem(item, loose) {
    let output = "<li>";
    if (item.checked !== null && item.checked !== undefined) {
      output += `<input ${item.checked ? 'checked="" ' : ""}disabled="" type="checkbox"> `;
    }
    const children = item.children;
    if (loose) return `${output}\n${this.blocks(children)}</li>\n`;
    children.forEach((child, index) => {
      if (child.type === "paragraph") {
        this.enterInlineBlock(child);
        output += this.inlines(child);
        if (index < children.length - 1) output += "\n";
      } else {
        output += this.block(child);
      }
    });
    return `${output}</li>\n`;
  }

  table(node) {
    const [head, ...rows] = node.children;
    const cell = (tag, child, index) => {
      this.enterInlineBlock(child);
      const align = node.align?.[index];
      const style = align ? ` style="text-align:${align}"` : "";
      return `<${tag}${style}>${this.inlines(child)}</${tag}>\n`;
    };
    let output = `<table>\n<thead>\n<tr>\n${head.children.map((child, index) => cell("th", child, index)).join("")}</tr>\n</thead>\n`;
    if (rows.length) {
      output += `<tbody>\n${rows.map((row) => `<tr>\n${row.children.map((child, index) => cell("td", child, index)).join("")}</tr>\n`).join("")}</tbody>\n`;
    }
    return `${output}</table>\n`;
  }

  inline(node, parent) {
    switch (node.type) {
      case "text":
        return this.text(node);
      case "break":
        return "<br>\n";
      case "emphasis":
        return `<em>${this.inlines(node)}</em>`;
      case "strong":
        return `<strong>${this.inlines(node)}</strong>`;
      case "delete":
        return `<del>${this.inlines(node)}</del>`;
      case "inlineCode":
        return `<code>${escapeHtml(node.value)}</code>`;
      case "html":
        return node.value;
      case "link": {
        const title = node.title ? ` title="${escapeHtml(node.title)}"` : "";
        return `<a href="${escapeUrl(node.url)}"${title}>${this.inlines(node)}</a>`;
      }
      case "image": {
        const title = node.title ? ` title="${escapeHtml(node.title)}"` : "";
        return `<img src="${escapeUrl(node.url)}" alt="${this.imageAlt(node)}"${title}>`;
      }
      case "footnoteReference":
        return this.footnoteReference(node);
      default:
        throw new Error(`지원하지 않는 Markdown 인라인 요소입니다: ${node.type}`);
    }
  }

  text(node) {
    return this.typographChars(this.alignText(node));
  }

  /** 이미지 alt도 Goldmark처럼 typographer를 거칩니다. alt 원문은 `![` 바로 뒤에서 시작합니다. */
  imageAlt(node) {
    const alt = node.alt || "";
    const start = node.position.start.offset + 2;
    if (this.source.slice(start, start + alt.length) !== alt) return escapeHtml(alt);
    const chars = [];
    let offset = start;
    for (const char of alt) {
      chars.push({ char, offset, escaped: false });
      offset += char.length;
    }
    return this.typographChars(chars);
  }

  uniqueId(base) {
    const count = this.ids.get(base);
    if (count === undefined) {
      this.ids.set(base, 0);
      return base;
    }
    let next = count + 1;
    while (this.ids.has(`${base}-${next}`)) next += 1;
    this.ids.set(base, next);
    this.ids.set(`${base}-${next}`, 0);
    return `${base}-${next}`;
  }

  footnoteReference(node) {
    let index = this.footnotes.indexOf(node.identifier) + 1;
    if (index === 0) {
      if (!this.definitions.has(node.identifier)) return escapeHtml(`[^${node.label}]`);
      this.footnotes.push(node.identifier);
      index = this.footnotes.length;
    }
    return `<sup id="fnref:${index}"><a href="#fn:${index}" class="footnote-ref" role="doc-noteref">${index}</a></sup>`;
  }

  footnoteList() {
    if (!this.footnotes.length) return "";
    const items = this.footnotes.map((identifier, position) => {
      const index = position + 1;
      const backlink = `&#160;<a href="#fnref:${index}" class="footnote-backref" role="doc-backlink">&#x21a9;&#xfe0e;</a>`;
      let body = this.blocks(this.definitions.get(identifier).children);
      body = body.endsWith("</p>\n") ? `${body.slice(0, -5)}${backlink}</p>\n` : `${body}${backlink}`;
      return `<li id="fn:${index}">\n${body}</li>\n`;
    });
    return `<div class="footnotes" role="doc-endnotes">\n<hr>\n<ol>\n${items.join("")}</ol>\n</div>\n`;
  }
}

/** Markdown 본문을 Hugo `.Content`와 같은 HTML 문자열로 렌더링합니다. */
export function renderMarkdown(source) {
  const tree = processor.runSync(processor.parse(source));
  const renderer = new Renderer(source, tree);
  const body = renderer.blocks(tree.children);
  return body + renderer.footnoteList();
}
