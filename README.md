# beott.kr

웹진 [비옽 BEOTT](https://beott.kr)의 정적 사이트. [Astro](https://astro.build)로 빌드하고 GitHub Pages(`release` 브랜치 루트)로 배포한다.

- 검증한 환경: Node.js `v24.13.0`, npm `11.21.2`, Astro `7.4.13`, Dart Sass `1.108.2`(npm 패키지)
  - 2026-11에 Hugo(`v0.170.0`)에서 이전했다. 이전 시점 Hugo 출력과 URL·HTML(정규화 DOM)·RSS·sitemap·검색 색인을 `scripts/compare-builds.mjs`로 비교했다.
- 작업 규칙, 소스 구조, 글 작성 형식은 [AGENTS.md](AGENTS.md)를 따른다.

## 설치

Node.js `22.23.4` 이상이 필요하다(Astro 7 요구사항). Hugo·Dart Sass 별도 설치는 필요 없다.

```sh
npm ci
```

## 로컬 실행

```sh
make run
# 또는
npm run dev
```

## 빌드·배포

```sh
# 루트 생성물 삭제 → astro build(dist/) → dist/를 repo 루트로 복사
make build
# build 후 전체 작업 트리를 커밋하고 현재 브랜치를 push
make deploy
```

- 생성물만 확인하려면 `npx astro build` 후 `dist/`를 본다.
- `make clean`은 `scripts/generated-paths.txt`의 생성물만 지운다.
- GitHub Pages(Jekyll)는 `_config.yml`의 `exclude`에 적힌 소스·내부 문서를 배포 사이트에서 뺀다. 없는 주소는 `404.html`(`src/pages/404.astro`)을 보여 준다.

## 글 작성

글은 `content/<경로>/<slug>.md`(본문)와 `content/<경로>/<slug>.json`(메타데이터) 한 쌍으로 쓴다. 키와 규칙은 AGENTS.md의 Content Authoring을 참고한다.

## 사이트 검색

- 빌드가 `/index.json` 색인을 만든다(`src/pages/index.json.ts`, 규칙은 `src/lib/site-model.mjs`의 `searchEntries`). 공개 posts와 소개·문의만 포함하고 draft/future/expired, `hideme`·`hidden` 글, `build.list = "never"` 페이지는 제외한다.
- 헤더의 `검색` 링크(또는 Windows·Linux `Ctrl + K`, macOS `⌘ + K`. 단축키 안내는 JavaScript가 켜져 있고 마우스·트랙패드가 있는 기기에만 OS에 맞게 표시)가 공통 dialog를 열고, JavaScript가 없으면 `/search/` 페이지로 이동한다. `/search/?q=검색어`로 바로 검색할 수 있다.
- 검색 로직은 `assets/js/search-core.js`(순수 함수), DOM 동작은 `assets/js/search.js`에 있다.

## 테스트

```sh
# 검색 core·Markdown 렌더러·사이트 모델 단위 테스트(Jest)
npm test
# 외부 임시 폴더에 실제 Astro 빌드 후 색인·출력 검증
npm run test:integration
# Hugo 출력과 Astro 출력 비교(Hugo 출력 폴더는 별도로 준비)
node scripts/compare-builds.mjs <hugo 출력 폴더> dist
```
