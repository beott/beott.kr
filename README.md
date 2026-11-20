# beott.kr

- 검증한 Hugo: `v0.170.0+withdeploy` (Homebrew, darwin/arm64) + Dart Sass `1.108.2`
  - 2026-11 사이트 검색 추가 시 이 버전으로 빌드와 통합 테스트를 실행했다.
  - 이전에 표기했던 `v0.136.2+extended`는 현재 소스로 실행 검증하지 않았다(커밋된 생성물은 v0.167.0으로 빌드됨).

## Install Hugo

- [Linux](https://gohugo.io/installation/linux/)

```sh
sudo snap install hugo
```

- [macOS](https://gohugo.io/installation/macos/)

```sh
brew install hugo
```

- [Windows](https://gohugo.io/installation/windows/)

```ps1
choco install hugo-extended
```

## Install Dart Sass

- [link](https://gohugo.io/hugo-pipes/transpile-sass-to-css/#installing-in-a-development-environment)

```sh
# Linux
sudo snap install dart-sass
# macOS
brew install sass/sass/sass
# Windows
choco install sass
```

## 로컬 실행

```sh
make run
```

## 배포

```sh
make deploy
```

## 사이트 검색

- Hugo가 홈 출력에 JSON을 추가해 `/index.json` 색인을 만든다(`layouts/index.json`). 공개 posts와 소개·문의만 포함하고 draft/future/expired, `hideme`·`hidden` 글, `build.list = "never"` 페이지는 제외한다.
- 헤더의 `검색` 링크(또는 Windows·Linux `Ctrl + K`, macOS `⌘ + K`. 단축키 안내는 JavaScript가 켜져 있고 마우스·트랙패드가 있는 기기에만 OS에 맞게 표시)가 공통 dialog를 열고, JavaScript가 없으면 `/search/` 페이지로 이동한다. `/search/?q=검색어`로 바로 검색할 수 있다.
- 검색 로직은 `assets/js/search-core.js`(순수 함수), DOM 동작은 `assets/js/search.js`에 있다.

## 테스트

Node.js 22 이상이 필요하다. 배포 빌드(`make build`)와는 별개다.

```sh
npm ci
# 검색 core 단위 테스트(Jest)
npm test
# 외부 임시 폴더에 실제 Hugo 빌드 후 색인·출력 검증
npm run test:integration
```
