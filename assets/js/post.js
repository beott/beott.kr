document.getElementById("copy-button").addEventListener("click", function() {
  const link = window.location.href; // 현재 페이지 주소 복사
  const message = document.getElementById("copy-message");

  navigator.clipboard.writeText(link).then(() => {
    // message.style.display = "inline"; // 문구 표시
    message.style.display = "block"; // 문구 표시
    message.textContent = "복사되었습니다!";
    
    // 3초 후 문구 숨기기
    setTimeout(() => {
      message.style.display = "none";
    }, 3000);
  }).catch((error) => {
    console.error("복사에 실패했습니다:", error);
    // message.style.display = "inline";
    message.style.display = "block";
    message.textContent = "복사 실패";
    
    setTimeout(() => {
      message.style.display = "none";
    }, 3000);
  });
});
