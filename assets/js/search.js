/** 공통 검색 dialog와 /search/ 페이지의 DOM 동작을 연결합니다. */
import {
  buildSearchUrl,
  createIndexLoader,
  getShortcutLabel,
  isSearchShortcut,
  prepareIndex,
  searchEntries,
} from "./search-core.js";

const MESSAGES = {
  empty: "검색어를 입력하세요.",
  loading: "검색 색인을 불러오는 중입니다…",
  failed: "검색 색인을 불러오지 못했습니다. 다시 시도해 주세요.",
  none: "일치하는 글이 없습니다.",
};

const roots = Array.from(document.querySelectorAll("[data-site-search]"));
const dialogRoot = roots.find((root) => root.dataset.mode === "dialog") || null;
const pageRoot = roots.find((root) => root.dataset.mode === "page") || null;
const indexUrl = roots[0] ? new URL(roots[0].dataset.searchIndex || "/index.json", window.location.href) : null;

/** 동일 origin 색인을 받아 구조를 검사한 뒤 검색용으로 준비합니다. */
async function fetchIndex() {
  if (!indexUrl || indexUrl.origin !== window.location.origin) {
    throw new Error("검색 색인 주소가 올바르지 않습니다.");
  }
  const response = await fetch(indexUrl.href, { credentials: "same-origin" });
  if (!response.ok) throw new Error(`검색 색인 응답 오류: ${response.status}`);
  const data = await response.json();
  return prepareIndex(data, window.location.origin);
}

const loader = createIndexLoader(fetchIndex);

/** 텍스트만 담은 요소를 만들어 검색 결과에 HTML이 해석되지 않게 합니다. */
function textElement(tag, className, text) {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
}

/** 검색 결과 하나를 안전한 링크 항목으로 만듭니다. */
function createResultItem(hit) {
  const item = document.createElement("li");
  item.className = "search-result";
  const link = document.createElement("a");
  link.className = "search-result-link";
  link.href = hit.href;
  link.dataset.searchResult = "";
  link.append(textElement("span", "search-result-title", hit.title));
  const meta = [hit.filmTitle, hit.author, hit.group].filter(Boolean).join(" · ");
  if (meta) link.append(textElement("span", "search-result-meta", meta));
  if (hit.snippet) link.append(textElement("span", "search-result-snippet", hit.snippet));
  item.append(link);
  return item;
}

/** 편집 가능한 요소에서 발생한 키 입력인지 확인합니다. */
function isEditingTarget(target) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])"));
}

/** 검색 루트 하나의 입력·상태·결과 렌더링을 관리합니다. */
function createController(root) {
  const input = root.querySelector("[data-search-input]");
  const form = root.querySelector("[data-search-form]");
  const status = root.querySelector("[data-search-status]");
  const results = root.querySelector("[data-search-results]");
  const retry = root.querySelector("[data-search-retry]");
  const allLink = root.querySelector("[data-search-all]");
  const limit = Number.parseInt(root.dataset.searchLimit || "8", 10);
  const isPage = root.dataset.mode === "page";
  let revision = 0;
  let renderedRevision = 0;
  let composing = false;

  /** 상태 문구를 바꾸고 재시도 버튼 표시 여부를 맞춥니다. */
  function setStatus(message, failed = false) {
    status.textContent = message;
    retry.hidden = !failed;
  }

  /** 전체 검색 페이지 링크와 검색 페이지 주소의 q를 현재 입력과 맞춥니다. */
  function syncUrls(query) {
    if (allLink) {
      const target = new URL(allLink.getAttribute("href"), window.location.href);
      allLink.href = buildSearchUrl(target.href, query);
    }
    if (isPage) {
      window.history.replaceState(window.history.state, "", buildSearchUrl(window.location.href, query));
    }
  }

  /** 결과 목록을 비우고 새 결과를 텍스트 노드로만 그립니다. */
  function render(found) {
    results.replaceChildren(...found.entries.map(createResultItem));
    if (!found.total) {
      setStatus(MESSAGES.none);
      return;
    }
    const shown = found.entries.length;
    const suffix = shown < found.total ? ` 중 ${shown}건을 표시합니다.` : "을 찾았습니다.";
    setStatus(`${found.total}건${suffix}`);
  }

  /** 최신 입력에 대해서만 결과를 그리도록 revision을 확인하며 검색합니다. */
  async function run() {
    revision += 1;
    const current = revision;
    const query = input.value;
    syncUrls(query);
    // 이전 검색어의 결과를 Enter·↑↓로 선택하지 못하도록 새 검색 시작 시 바로 비웁니다.
    results.replaceChildren();
    if (!query.trim()) {
      setStatus(MESSAGES.empty);
      return;
    }
    setStatus(MESSAGES.loading);
    try {
      const index = await loader.load();
      if (current !== revision) return;
      render(searchEntries(index, query, limit));
      renderedRevision = current;
    } catch (error) {
      if (current !== revision) return;
      console.error("[search] 색인 로딩 실패", error);
      results.replaceChildren();
      setStatus(MESSAGES.failed, true);
    }
  }

  /** 결과 링크 목록을 반환합니다. */
  function links() {
    return Array.from(results.querySelectorAll("[data-search-result]"));
  }

  /** ↑↓로 입력창과 결과 링크 사이 초점을 옮깁니다. */
  function moveFocus(event) {
    const items = links();
    if (!items.length) return;
    const position = items.indexOf(document.activeElement);
    const step = event.key === "ArrowDown" ? 1 : -1;
    const next = position + step;
    event.preventDefault();
    if (next < 0) {
      input.focus();
      return;
    }
    items[Math.min(next, items.length - 1)].focus();
  }

  input.addEventListener("compositionstart", () => {
    composing = true;
  });
  input.addEventListener("compositionend", () => {
    composing = false;
    run();
  });
  input.addEventListener("input", (event) => {
    // 조합 중인 글자는 확정 전이므로 compositionend에서 한 번만 검색합니다.
    if (event.isComposing || composing) return;
    run();
  });
  retry.addEventListener("click", () => {
    input.focus();
    run();
  });
  form.addEventListener("submit", (event) => {
    if (composing) {
      event.preventDefault();
      return;
    }
    if (isPage) {
      event.preventDefault();
      run();
      return;
    }
    const first = renderedRevision === revision ? links()[0] : null;
    if (!first) return;
    event.preventDefault();
    window.location.assign(first.href);
  });
  root.addEventListener("keydown", (event) => {
    if (event.isComposing || event.keyCode === 229 || composing) {
      // IME 확정용 Enter가 폼 제출·결과 이동으로 이어지지 않게 막습니다.
      if (event.key === "Enter" && event.target === input) event.preventDefault();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (event.target === input || links().includes(event.target)) moveFocus(event);
    }
  });

  return {
    root,
    input,
    isComposing: () => composing,
    run,
  };
}

/** 검색 페이지에 q 주소 값을 반영해 바로 검색합니다. */
function initPage(controller) {
  const query = new URLSearchParams(window.location.search).get("q") || "";
  controller.input.value = query.slice(0, 200);
  if (controller.input.value.trim()) controller.run();
}

/** 정밀 포인터(마우스·트랙패드)가 있는 기기에서만 OS에 맞는 단축키 안내를 보여 줍니다. */
function showShortcutHints() {
  const hasFinePointer = typeof window.matchMedia === "function" && window.matchMedia("(any-pointer: fine)").matches;
  if (!hasFinePointer) return;
  const platform = navigator.userAgentData?.platform || navigator.platform || navigator.userAgent;
  const label = getShortcutLabel(platform);
  document.querySelectorAll("[data-search-shortcut]").forEach((hint) => {
    hint.textContent = label;
    hint.hidden = false;
  });
}

/** 공통 dialog의 열기·닫기·초점 복귀·단축키를 연결합니다. */
function initDialog(controller, pageController) {
  const dialog = controller.root;
  const launchers = Array.from(document.querySelectorAll("[data-search-launch]"));
  let opener = null;
  let pointerStartedOnBackdrop = false;

  /** 지원하지 않는 브라우저는 실제 /search/ 링크로 이동하게 둡니다. */
  function canOpen() {
    return typeof dialog.showModal === "function";
  }

  /** 좌표가 dialog 상자 바깥(backdrop)인지 확인합니다. */
  function isOnBackdrop(event) {
    if (event.target !== dialog) return false;
    const rect = dialog.getBoundingClientRect();
    return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
  }

  /** dialog를 열고 입력창에 초점을 둡니다. */
  function open(source) {
    if (pageController) {
      pageController.input.focus();
      pageController.input.select();
      return;
    }
    if (dialog.open) {
      controller.input.focus();
      return;
    }
    opener = source instanceof HTMLElement ? source : document.activeElement;
    dialog.showModal();
    controller.input.focus();
    controller.input.select();
    if (controller.input.value.trim()) controller.run();
  }

  /** 다른 dialog가 열려 있는지 확인합니다. */
  function otherDialogOpen() {
    return Array.from(document.querySelectorAll("dialog[open]")).some((element) => element !== dialog);
  }

  /** Tab 이동을 dialog 안에서 순환시킵니다. */
  function trapTab(event) {
    const focusable = Array.from(dialog.querySelectorAll("a[href], button:not([disabled]), input:not([disabled])"))
      .filter((element) => !element.hidden && element.getClientRects().length > 0);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
      return;
    }
    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  showShortcutHints();

  launchers.forEach((launcher) => {
    launcher.addEventListener("click", (event) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (!pageController && !canOpen()) return;
      event.preventDefault();
      open(launcher);
    });
  });

  document.addEventListener("keydown", (event) => {
    const editing = isEditingTarget(event.target) && !event.target.closest("[data-site-search]");
    if (!isSearchShortcut(event, { editing, otherDialogOpen: otherDialogOpen() })) return;
    if (!pageController && !canOpen()) return;
    event.preventDefault();
    open(document.activeElement);
  });

  dialog.querySelector("[data-search-close]").addEventListener("click", () => dialog.close());
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "Tab") trapTab(event);
  });
  dialog.addEventListener("cancel", (event) => {
    if (controller.isComposing()) event.preventDefault();
  });
  dialog.addEventListener("pointerdown", (event) => {
    pointerStartedOnBackdrop = isOnBackdrop(event);
  });
  dialog.addEventListener("pointerup", (event) => {
    const shouldClose = pointerStartedOnBackdrop && isOnBackdrop(event);
    pointerStartedOnBackdrop = false;
    if (shouldClose) dialog.close();
  });
  dialog.addEventListener("close", () => {
    const target = opener;
    opener = null;
    if (target && target.isConnected && typeof target.focus === "function") target.focus();
  });
}

const pageController = pageRoot ? createController(pageRoot) : null;
if (pageController) initPage(pageController);
if (dialogRoot) initDialog(createController(dialogRoot), pageController);
