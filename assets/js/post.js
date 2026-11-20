/** 글 상세의 링크 복사 버튼과 버튼 위 말풍선 안내를 연결합니다. */
const MESSAGE_DURATION_MS = 3000;
const button = document.getElementById("copy-button");
const message = document.getElementById("copy-message");
let hideTimer = null;

/** 말풍선에 문구를 띄우고 일정 시간 뒤 숨깁니다. 연속 클릭 시 이전 타이머를 취소합니다. */
function showMessage(text, isError) {
  message.textContent = text;
  message.classList.toggle("is-error", isError);
  message.classList.add("is-visible");
  window.clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => {
    message.classList.remove("is-visible");
  }, MESSAGE_DURATION_MS);
}

if (button && message) {
  button.addEventListener("click", () => {
    navigator.clipboard
      .writeText(window.location.href)
      .then(() => showMessage("복사되었습니다!", false))
      .catch((error) => {
        console.error("링크 복사에 실패했습니다:", error);
        showMessage("복사 실패", true);
      });
  });
}
