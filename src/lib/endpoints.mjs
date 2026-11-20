/** 정적 텍스트 엔드포인트 응답을 만듭니다. */
export function textResponse(body, contentType) {
  return new Response(body, { headers: { "Content-Type": `${contentType}; charset=utf-8` } });
}
