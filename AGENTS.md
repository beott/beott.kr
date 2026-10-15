# AGENTS.md

웹진 [비옽 BEOTT](https://beott.kr)의 Hugo 정적 사이트. 사람과 코딩 에이전트가 함께 따르는 작업 규칙이다.

## Overview

- Hugo extended (README 기준 `v0.136.2`) + Dart Sass
- 테마 없이 `layouts/`에 직접 템플릿 작성
- 슬라이더는 CDN의 Swiper 11 사용

## Commands

```sh
# 로컬 서버
make run
# 기존 산출물 삭제 후 repo 루트로 빌드
make build
# build 후 git add -A, 자동 커밋, 현재 브랜치 push
make deploy
```

- `release` 브랜치는 **소스와 빌드 결과물이 함께 커밋**된다. Hugo가 repo 루트(`--destination .`)로 빌드하기 때문이다.
- 루트의 생성 파일(`index.html`, `index.xml`, `sitemap.xml`, `posts/`, `css/`, `js/`, `images/`, `tags/`, `categories/` 등)은 **직접 수정하지 않는다**. 소스를 고치고 다시 빌드한다.
- `make deploy`는 작업 트리 전체를 커밋하므로, 의도하지 않은 변경이 없는지 먼저 확인한다.
- 산출물을 건드리지 않고 빌드만 확인하려면 임시 폴더로 빌드한다.

```sh
hugo --destination /tmp/beott-out --contentDir=content
```

## Source Layout

| 경로 | 역할 |
|---|---|
| `hugo.toml` | 사이트 설정. `params.main`이 랜딩 페이지 그룹 순서 |
| `layouts/_default/baseof.html` | 공통 head/header/footer, SCSS 빌드 파이프라인 |
| `layouts/_default/index.html` | 랜딩: 히어로 슬라이더, 그룹별 썸네일 슬라이더(Swiper `breakpoints` 설정 포함) |
| `layouts/_default/single.html` | 글 상세, 링크 복사 버튼 |
| `assets/sass/index.scss` | 유일한 스타일 소스 |
| `assets/js/post.js` | 링크 복사 동작 |
| `content/posts/<그룹>/*.md` | 글 본문 |
| `content/images/` | 이미지 (`scripts/webp.py`로 webp 변환) |

## Content Front Matter

TOML(`+++`) 형식을 사용한다.

```toml
+++
draft = false
hideme = false
title = "글 제목"
author = "작성자"
filmTitle = "<작품명> 플랫폼"
date = "2024-11-04T00:00:00+09:00"
tags = ["Netflix"]
thumbnail = "/images/1/example-thumbnail.webp"
group = "비옽 1호: 모니터 앞 파수꾼들"
+++
```

- `group` 값이 `hugo.toml`의 `params.main`에 있어야 랜딩에 노출된다.
- `hideme = true`면 랜딩과 공유 버튼에서 제외된다.

## Styling Rules (`assets/sass/index.scss`)

### Accessibility

- 공통 레이아웃(`baseof.html`)은 `header` / `main` / `footer` 랜드마크를 유지한다. PageSpeed Insights 접근성 항목이다.

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
| `$font-size-row-title` | 18 → 24px |
| `$font-size-overlay-title` | 14 → 18px |
| `$font-size-nav` | 16 → 18px |

### Layout

- breakpoint는 모바일 `≤767px`, 태블릿 `768–1500px`, 데스크톱 `≥1501px` 세 가지다. 레이아웃과 여백 차이에만 사용한다.
- 글 본문 폭은 `min(85vw, $article-max-width)`(720px)로 가운데 정렬한다. 모바일/태블릿 이미지는 `100vw` full-bleed다.
- 랜딩 썸네일(`.post-item-image`)은 `aspect-ratio: 16 / 9`로 폭에서 높이를 계산한다. **높이를 고정값(`vh`, `px`)으로 지정하지 않는다.** 한 줄당 개수는 `index.html`의 Swiper `slidesPerView`에서 조정한다.
- Swiper `breakpoints`의 `slidesPerView`/`spaceBetween`을 바꾸면 `index.scss`의 `.swiper-slide` 초기 `width`/`margin-right`도 같은 값으로 수정한다. 어긋나면 JS 초기화 시점에 레이아웃이 밀려 CLS가 나빠진다.
- 터치 대상(버튼)은 최소 44px(`2.75rem`)을 유지한다. 예: `$copy-button-size`.

### Color

- 포인트 색상은 `$base-color`(`#da322e`), `$base-color-dark`(`#b22a27`)를 사용한다.
- 배경은 `#141414`, 본문 텍스트는 `#fff`, 헤더/섹션 제목은 `#e5e5e5`다.
- 이미지 로딩 전 자리 표시는 `$placeholder-color`(썸네일), `$hero-placeholder-color`(히어로)를 사용한다. 스켈레톤 애니메이션은 쓰지 않는다. 정적 사이트라 늦게 오는 건 이미지뿐이다.

## Verification

스타일을 바꾼 뒤에는 다음을 확인한다.

1. 임시 폴더로 빌드해 SCSS 컴파일 에러가 없는지 확인한다.
2. `make run` 후 375 / 768 / 1280 / 1920 / 3840px 폭에서 랜딩과 글 상세 페이지를 확인한다.
   - 본문 16~18px, 제목 40px 이하
   - 썸네일 16:9 유지, 오버레이 제목 잘림 없음

## Git

- 커밋 메시지는 Conventional Commits 형식을 따른다. 단, `make deploy`의 자동 커밋(`rebuilding site ...`)은 예외다.
