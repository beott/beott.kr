/** 페이지를 조금이라도 스크롤하면 고정 헤더에 단색 배경을 입힙니다. */
const header = document.querySelector("body > header");

if (header) {
  let ticking = false;

  /** 현재 스크롤 위치에 맞춰 헤더 상태 클래스를 맞춥니다. */
  const syncHeader = () => {
    header.classList.toggle("is-scrolled", window.scrollY > 0);
    ticking = false;
  };

  window.addEventListener(
    "scroll",
    () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(syncHeader);
    },
    { passive: true },
  );
  syncHeader();
}
