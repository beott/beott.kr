# AGENTS.md

웹진 [비옽 BEOTT](https://beott.kr)의 Astro 정적 사이트(2026-11 Hugo에서 이전). 사람과 코딩 에이전트가 함께 따르는 작업 규칙이다.

## Overview

- Astro `7.4.x`(Node.js `>=22.23.4`, 검증은 Node 24) + Dart Sass(`sass` devDependency)
- UI 프레임워크 없이 `src/`의 `.astro` 템플릿과 `src/lib/`의 순수 JS 모듈로 구성
- Markdown은 Astro 기본 파이프라인이 아니라 `src/lib/markdown.mjs`(Goldmark 호환 렌더러)로 렌더링한다. 기존 Hugo 출력과 HTML·RSS·검색 색인이 같도록 맞춘 것이므로 함부로 remark/rehype 플러그인으로 바꾸지 않는다.
- 슬라이더는 CDN의 Swiper 11 사용

## Commands

```sh
npm ci
# 로컬 개발 서버(astro dev, http://localhost:4321)
make run
# dist/에 빌드 후 repo 루트로 복사(기존 루트 생성물은 먼저 삭제)
make build
# build 후 git add -A, 자동 커밋, 현재 브랜치 push
make deploy
# 단위 테스트(Jest) / 격리 Astro 빌드 통합 테스트
npm test
npm run test:integration
```

- `release` 브랜치는 **소스와 빌드 결과물이 함께 커밋**된다. GitHub Pages가 repo 루트를 서빙하기 때문이다. `scripts/build.sh`가 `astro build`로 `dist/`를 만든 뒤 루트로 복사한다.
- 루트의 생성 파일(`index.html`, `index.json`, `index.xml`, `sitemap.xml`, `posts/`, `css/`, `js/`, `images/`, `tags/`, `categories/` 등)은 **직접 수정하지 않는다**. 소스를 고치고 다시 빌드한다.
- `make clean`은 `scripts/generated-paths.txt`에 적힌 생성물만 지운다. 소스 디렉터리(`src/`, `content/`, `public/`, `assets/`, `scripts/`, `tests/` 등)는 목록에 넣지 않으며, 들어가 있으면 스크립트가 거부한다.
- `make deploy`는 작업 트리 전체를 커밋하므로, 의도하지 않은 변경이 없는지 먼저 확인한다.
- `make deploy`의 마지막 단계(`scripts/deploy.sh` → `scripts/site-gate-deploy.mjs`)는 build가 끝난 뒤 site gate `preflight` 재판정 → `git add -A` → `consume` → `git commit` → `post-commit` → `git push origin release` 순서로만 진행한다. `SITE_GATE_INPUT`·`SITE_GATE_RECEIPT`(절대 경로)가 필요하고, 없거나 gate가 exit 0이 아니면 commit·push하지 않는다. 저장소·index·git 설정·push 대상을 바꿀 수 있는 `GIT_*` 환경 변수(`GIT_CONFIG_*`, `GIT_DIR`, `GIT_INDEX_FILE`, `GIT_SSH_COMMAND` 등)가 있으면 거절하고, add·commit·push는 gate와 같은 git 설정(계정 HOME, system config 제외)으로 실행한다. 실패 시 남은 index·local commit은 자동으로 되돌리지 않는다. `make build`·`make run`은 gate와 무관하다. Windows 배포(`windows.deploy.ps1`)는 gate를 지원하지 않아 거절한다. git을 직접 실행하면 gate를 우회한다.
- GitHub Pages는 repo 루트를 Jekyll로 다시 처리한다. 소스·내부 문서(`src/`, `content/`, `public/`, `assets/`, `scripts/`, `tests/`, `AGENTS.md`, `README.md` 등)는 `_config.yml`의 `exclude`로 배포 사이트에서 뺀다. Jekyll은 패턴을 루트 기준 접두사로도 비교하므로 새 패턴이 산출물 이름과 겹치지 않는지 `npm test`(`tests/pages-exclude.test.js`)와 `npm run test:integration`으로 확인한다. `CNAME`은 커스텀 도메인 파일이라 배포에 남긴다.
- 산출물을 건드리지 않고 빌드만 확인하려면 `npx astro build`만 실행한다(`dist/`는 git에서 제외).
- Hugo 시절 출력과 비교하려면 `node scripts/compare-builds.mjs <hugo 출력 폴더> dist`를 쓴다.

## Source Layout

| 경로 | 역할 |
|---|---|
| `astro.config.mjs` | Astro 설정. 번들 파일을 `css/`·`js/` 아래에 두고, Sass 압축 출력만 쓴다 |
| `src/data/site.json` | 사이트 설정(`title`, `baseURL`, `languageCode`). `main`이 랜딩 페이지 그룹 순서 |
| `src/content.config.ts` | content collection(md+json 쌍 loader, zod 스키마) |
| `src/lib/content-source.mjs` | md+json 쌍 읽기, 메타데이터 스키마(`pageSchema`) |
| `src/lib/site-model.mjs` | 페이지 목록·정렬·draft/예약/만료·태그·랜딩 그룹·검색 색인 규칙 |
| `src/lib/markdown.mjs` | Goldmark 호환 Markdown 렌더러(typographer, 각주, heading id, raw HTML 허용) |
| `src/lib/hugo.mjs`, `src/lib/feeds.mjs` | 날짜 형식, URL 규칙, 자동 요약, RSS·sitemap 생성 |
| `src/layouts/Base.astro` | 공통 head/header/footer |
| `src/components/SiteSearch.astro` | 검색 dialog/페이지 공통 마크업 |
| `src/pages/index.astro` | 랜딩: 히어로 슬라이더, 그룹별 썸네일 슬라이더(Swiper `breakpoints` 설정 포함) |
| `src/pages/[...path].astro` | 글 상세, 소개·문의, 검색 페이지 |
| `src/pages/404.astro` | 없는 주소용 404 페이지(`/404.html`, `noindex`, sitemap·RSS·검색 색인 제외) |
| `src/pages/**/*.xml.ts`, `index.json.ts` | RSS(홈·섹션·태그·카테고리), sitemap, 검색 색인 |
| `assets/sass/index.scss` | 유일한 스타일 소스 |
| `assets/js/*.js` | 헤더 스크롤, 검색(`search-core.js`는 순수 함수), 링크 복사 |
| `content/<경로>/<slug>.md` + `<slug>.json` | 글 본문 + 메타데이터 |
| `public/` | 그대로 복사되는 정적 파일. 이미지는 `public/images/` (`scripts/webp.py`로 webp 변환) |

## Content Authoring

글 하나는 **같은 이름의 Markdown 본문과 JSON 메타데이터 한 쌍**이다. front matter는 쓰지 않는다.

```text
content/posts/3/westworld.md    # 본문(Markdown, raw HTML 허용)
content/posts/3/westworld.json  # 메타데이터
```

```json
{
  "draft": false,
  "hideme": false,
  "title": "글 제목",
  "author": "작성자",
  "filmTitle": "<작품명> 플랫폼",
  "date": "2024-11-04T00:00:00+09:00",
  "tags": ["Netflix"],
  "thumbnail": "/images/1/example-thumbnail.webp",
  "group": "비옽 1호: 모니터 앞 파수꾼들"
}
```

- URL은 `content/` 기준 경로를 소문자로 바꾼 값이다. 예: `content/posts/2/Evil-Genius.md` → `/posts/2/evil-genius/`. 기존 글의 파일 이름을 바꾸면 URL이 바뀌므로 바꾸지 않는다.
- `date`는 시간대(`+09:00`)를 포함한 ISO 문자열로 쓴다. 날짜가 미래면(또는 `publishDate`가 미래면) 빌드에서 빠지고, `expiryDate`가 지나면 빠진다. `draft = true`도 빌드에서 빠진다.
- `group` 값이 `src/data/site.json`의 `main`에 있어야 랜딩에 노출된다.
- `hideme: true`면 랜딩 그룹 줄·공유 버튼·검색 색인에서 제외된다(히어로는 최신 5개를 그대로 쓴다).
- 태그 RSS 경로는 태그를 소문자·공백은 `-`로 바꾼 값이다(`Apple TV+` → `/tags/apple-tv+/index.xml`). 같은 태그를 대소문자만 다르게 쓰면 한 태그로 합쳐진다.
- 스키마(`src/lib/content-source.mjs`)에 맞지 않거나 짝이 되는 `.md`가 없으면 빌드가 실패한다. 스키마에 없는 키도 보존된다.
- 이미지는 `public/images/...`에 두고 본문·`thumbnail`에서 `/images/...`로 참조한다. 원본 URL을 그대로 쓴다(리사이즈 없음).
- 이미지 표시(모든 글 공통, 모바일 `≤767px`): 본문 이미지는 기본적으로 `100vw`로 놓인다. 그 폭에서 높이가 `40svh`를 넘는 이미지만 `assets/js/post-images.js`가 로드 후 크기와 현재 화면으로 판정해 비율을 지킨 채 `max-height: 40svh`로 줄이고 가운데 둔다. 회전·창 크기가 바뀌면 다시 판정한다. 짧은 이미지·가로 스틸은 그대로다.
  - 줄어든 이미지 아래에 '크게 보기' 버튼이 붙는다. 버튼(또는 링크가 아닌 이미지 탭)으로 전체 화면 dialog를 열고, 닫기 버튼·Esc·배경 탭으로 닫으면 같은 스크롤 위치와 버튼으로 돌아간다.
  - 이미지·링크·캡션·alt는 그대로 두고 옮기지 않는다. 링크가 걸린 이미지는 탭하면 원래 링크로 이동하고, '크게 보기' 버튼은 링크 밖(뒤)에 형제로 붙는다(a 안에 button을 넣지 않는다).
  - 만화·도표처럼 순서와 글자를 읽어야 하는 이미지 묶음은 저자가 **본문형**을 직접 고른다. 비율·파일명으로 자동 분류하지 않는다. 아래처럼 `<div class="image-reader">`로 감싸고 앞뒤에 빈 줄을 둔다. 모바일에서는 이미지를 본문 폭으로 잇고, 40svh보다 길면 앞부분 미리보기와 '펼쳐서 보기/접기' 버튼을 붙인다. 본문형 안 이미지는 위의 자동 축소 대상이 아니다.

```markdown
<div class="image-reader">

![만화 1쪽: 첫 장면](/images/3/example-comic-1.webp)

![만화 2쪽: 이어지는 장면](/images/3/example-comic-2.webp)

</div>
```

- `scripts/convert-front-matter.mjs`는 Hugo TOML front matter를 JSON으로 옮긴 1회성 변환 스크립트다(재실행해도 이미 변환된 파일은 건너뜀).

## Styling Rules (`assets/sass/index.scss`)

### Accessibility

- 공통 레이아웃(`baseof.html`)은 `header` / `main` / `footer` 랜드마크를 유지한다. PageSpeed Insights 접근성 항목이다.
- 텍스트 없이 이미지(배경 이미지 포함)만 있는 링크는 `aria-label`로 이름을 준다. 예: 히어로 슬라이드의 `a.hero-link`.

### Typography

- font-size는 파일 상단의 `$font-size-*` 변수만 사용한다. 변수는 `clamp(최소, 선호값, 최대)`와 `rem`으로 정의한다.
- **media query 안에서 font-size를 지정하지 않는다.** 화면마다 수동 조정하면 테스트하지 못한 환경에서 글씨가 과도하게 커진다.
- `em`은 중첩되면 크기가 누적되므로 font-size에 쓰지 않는다.
- 기준 크기는 일반 리뷰/블로그 사이트 수준이다.

| 변수 | 범위 |
|---|---|
| `$font-size-body` | 16 → 18px |
| `$font-size-post-title` | 28 → 40px |
| `$font-size-post-heading` | 20 → 24px |
| `$font-size-post-meta` | 15 → 17px |
| `$font-size-article-body` | 16 → 18px, 2560px 이상 20px (글 상세 본문) |
| `$font-size-article-meta` | 15 → 17px, 2560px 이상 19px (글 상세 작성자/작품명) |
| `$font-size-row-title` | 18 → 24px |
| `$font-size-overlay-title` | 14 → 18px |
| `$font-size-nav` | 16 → 18px |

- `$font-size-large-boost`는 대형 화면 보정값이다. 1920px 이하 0, 2560px 이상 상한 0.125rem(2px)이며 `$font-size-article-*`에만 더한다. `$font-size-body`/`$font-size-post-meta`는 검색 UI에서 그대로 쓴다.

### Layout

- breakpoint는 모바일 `≤767px`, 태블릿 `768–1500px`, 데스크톱 `≥1501px` 세 가지다. 레이아웃과 여백 차이에만 사용한다.
- 글 본문 폭은 `min(85vw, $article-max-width)`로 가운데 정렬한다. `$article-max-width`는 `45rem`(720px) + 대형 화면 보정×40으로, 최대 800px이다. 모바일/태블릿 이미지는 `100vw` full-bleed다.
- 랜딩 썸네일(`.post-item-image`)은 `aspect-ratio: 16 / 9`로 폭에서 높이를 계산한다. **높이를 고정값(`vh`, `px`)으로 지정하지 않는다.** 한 줄당 개수는 `src/pages/index.astro`의 Swiper `slidesPerView`에서 조정한다.
- Swiper `breakpoints`의 `slidesPerView`/`spaceBetween`을 바꾸면 `index.scss`의 `.swiper-slide` 초기 `width`/`margin-right`도 같은 값으로 수정한다. 어긋나면 JS 초기화 시점에 레이아웃이 밀려 CLS가 나빠진다.
- 터치 대상(버튼)은 최소 44px(`2.75rem`)을 유지한다. 예: `$copy-button-size`.
- 모바일 본문 세로 이미지는 모든 이미지에 `max-height`를 거는 방식으로 처리하지 않는다(가로 스틸이 작아진다). `is-tall-image`(JS 판정)에만 `max-height: 40svh`를 둔다. 규칙은 Content Authoring의 '이미지 표시'를 따른다.

### Color

- 포인트 색상은 `$base-color`(`#da322e`), `$base-color-dark`(`#b22a27`)를 사용한다.
- 배경은 `#141414`, 본문 텍스트는 `#fff`, 헤더/섹션 제목은 `#e5e5e5`다.
- 이미지 로딩 전 자리 표시는 `$placeholder-color`(썸네일), `$hero-placeholder-color`(히어로)를 사용한다. 스켈레톤 애니메이션은 쓰지 않는다. 정적 사이트라 늦게 오는 건 이미지뿐이다.

## Verification

스타일을 바꾼 뒤에는 다음을 확인한다.

1. `npx astro build`로 빌드해 SCSS 컴파일 에러가 없는지 확인한다.
2. `make run` 후 375 / 768 / 1280 / 1920 / 3840px 폭에서 랜딩과 글 상세 페이지를 확인한다.
   - 본문 16~18px(2560px 이상 최대 20px), 제목 40px 이하
   - 썸네일 16:9 유지, 오버레이 제목 잘림 없음

## Git

- 커밋 메시지는 Conventional Commits 형식을 따른다. 단, `make deploy`의 자동 커밋(`rebuilding site ...`)은 예외다.
