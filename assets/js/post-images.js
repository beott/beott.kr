/**
 * 글 상세 본문 이미지(모바일 ≤767px):
 * - 본문 표시 폭(100vw)에서 40svh를 넘는 이미지만 비율을 지켜 40svh로 줄이고, 크게 보기 dialog를 붙입니다.
 * - 저자가 고른 본문형(.image-reader)은 앞부분만 보여 주고 펼치기/접기로 본문 폭에서 읽게 합니다.
 * 이미지·링크·캡션 DOM은 옮기지 않습니다. 버튼은 링크 밖(형제)에 두어 a와 button을 중첩하지 않습니다.
 */
import { isTallImage, needsReaderToggle } from "./post-images-core.js";

const MOBILE = window.matchMedia("(max-width: 767px)");
const contents = document.querySelector("article .post-contents");

/** 현재 화면의 svh 높이(px). svh를 모르는 브라우저는 innerHeight를 씁니다. */
function smallViewportHeight() {
  const probe = document.createElement("div");
  probe.style.cssText = "position:fixed;top:0;height:100vh;height:100svh;width:0;visibility:hidden;pointer-events:none";
  document.body.append(probe);
  const height = probe.getBoundingClientRect().height || window.innerHeight;
  probe.remove();
  return height;
}

let viewer = null;
let lastTrigger = null;
let savedScrollY = 0;

/** 크게 보기 dialog를 한 번만 만듭니다. Esc(cancel)·닫기 버튼·배경/이미지 탭으로 닫힙니다. */
function ensureViewer() {
  if (viewer) return viewer;
  viewer = document.createElement("dialog");
  viewer.className = "image-viewer";
  viewer.setAttribute("aria-label", "이미지 크게 보기");
  const close = document.createElement("button");
  close.type = "button";
  close.className = "image-viewer-close";
  close.textContent = "닫기";
  const image = document.createElement("img");
  viewer.append(close, image);
  close.addEventListener("click", () => viewer.close());
  viewer.addEventListener("click", (event) => {
    if (event.target === viewer || event.target === image) viewer.close();
  });
  // 닫힌 뒤 같은 스크롤 위치와 연 버튼으로 돌아간다
  viewer.addEventListener("close", () => {
    window.scrollTo(window.scrollX, savedScrollY);
    lastTrigger?.focus({ preventScroll: true });
  });
  document.body.append(viewer);
  return viewer;
}

/** 이미지를 dialog로 크게 엽니다. trigger는 닫힌 뒤 focus를 돌려줄 요소입니다. */
function openViewer(source, trigger) {
  const dialog = ensureViewer();
  const image = dialog.querySelector("img");
  image.src = source.currentSrc || source.src;
  image.alt = source.alt;
  lastTrigger = trigger;
  savedScrollY = window.scrollY;
  dialog.showModal();
  dialog.querySelector(".image-viewer-close").focus({ preventScroll: true });
}

/** 세로 이미지 하나에 크게 보기 버튼을 붙입니다(링크 이미지는 링크 뒤 형제로). */
function zoomButtonFor(image) {
  if (image.zoomButton) return image.zoomButton;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "image-zoom-button";
  button.textContent = "크게 보기";
  button.setAttribute("aria-label", image.alt ? `이미지 크게 보기: ${image.alt}` : "이미지 크게 보기");
  button.hidden = true;
  button.addEventListener("click", () => openViewer(image, button));
  (image.closest("a") ?? image).after(button);
  // 링크가 아닌 이미지는 탭으로도 연다. 링크 이미지는 원래 링크 동작을 그대로 둔다
  if (!image.closest("a")) {
    image.addEventListener("click", () => {
      if (image.classList.contains("is-tall-image")) openViewer(image, button);
    });
  }
  image.zoomButton = button;
  return button;
}

/** 이미지 하나를 현재 화면 기준으로 다시 판정합니다. */
function updateImage(image, viewportHeight) {
  // 모바일 CSS가 본문 이미지를 100vw로 놓으므로 원래 표시 폭은 화면 폭이다
  const tall = MOBILE.matches && isTallImage({ naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight,
    displayWidth: document.documentElement.clientWidth, viewportHeight });
  image.classList.toggle("is-tall-image", tall);
  if (tall || image.zoomButton) zoomButtonFor(image).hidden = !tall;
}

let readerCount = 0;

/** 저자 선택 본문형 하나에 미리보기+펼치기/접기를 붙이거나 뗍니다. */
function updateReader(reader, viewportHeight) {
  const expanded = reader.classList.contains("is-expanded");
  // max-height로 잘려 있어도 scrollHeight는 전체 내용 높이다
  const collapsible = MOBILE.matches && needsReaderToggle(reader.scrollHeight, viewportHeight);
  reader.classList.toggle("is-collapsed", collapsible && !expanded);
  let button = reader.toggleButton;
  if (!collapsible) {
    if (button) button.hidden = true;
    return;
  }
  if (!button) {
    reader.id ||= `image-reader-${++readerCount}`;
    button = document.createElement("button");
    button.type = "button";
    button.className = "image-reader-toggle";
    button.setAttribute("aria-controls", reader.id);
    button.addEventListener("click", () => {
      const open = !reader.classList.contains("is-expanded");
      reader.classList.toggle("is-expanded", open);
      reader.classList.toggle("is-collapsed", !open);
      setToggleState(button, open);
      // 접으면 내용이 줄어드니 버튼을 화면에 남겨 읽던 자리를 잃지 않게 한다
      if (!open) button.scrollIntoView({ block: "nearest" });
    });
    reader.after(button);
    reader.toggleButton = button;
  }
  button.hidden = false;
  setToggleState(button, expanded);
}

/** 펼치기 버튼의 문구와 aria-expanded를 맞춥니다. */
function setToggleState(button, open) {
  button.textContent = open ? "접기" : "펼쳐서 보기";
  button.setAttribute("aria-expanded", String(open));
}

/** 본문 전체를 현재 화면 기준으로 다시 판정합니다. */
function refresh() {
  const viewportHeight = smallViewportHeight();
  for (const image of contents.querySelectorAll("img")) {
    if (!image.closest(".image-reader")) updateImage(image, viewportHeight);
  }
  for (const reader of contents.querySelectorAll(".image-reader")) updateReader(reader, viewportHeight);
}

if (contents) {
  let frame = 0;
  const schedule = () => {
    window.cancelAnimationFrame(frame);
    frame = window.requestAnimationFrame(refresh);
  };
  // 크기는 이미지가 로드된 뒤에야 알 수 있고, 회전·창 크기 변경 때 기준이 바뀐다
  for (const image of contents.querySelectorAll("img")) {
    if (!image.complete) image.addEventListener("load", schedule, { once: true });
  }
  window.addEventListener("resize", schedule);
  MOBILE.addEventListener("change", schedule);
  refresh();
}
