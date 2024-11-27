SHELL := bash
BRANCH := $(shell git rev-parse --abbrev-ref HEAD)

# 기본적으로 OS를 식별하는 변수를 설정
UNAME_S := $(shell uname -s)
RM := rm -rf
LINE_CONTINUATION := \

# 운영체제에 따라 다른 변수나 동작을 설정
ifeq ($(OS), Windows_NT)
    # Windows의 경우
    OSFLAG := WINDOWS
    RM := powershell -Command Remove-Item -Force -Recurse
    IGNORE_ERRORS := -ErrorAction SilentlyContinue; exit 0
#		LINE_CONTINUATION := `
    PRINTER := echo
else
    IGNORE_ERRORS :=
    PRINTER := printf
    # uname으로 운영체제 구분
    ifeq ($(UNAME_S), Linux)
        OSFLAG := LINUX
    endif
    ifeq ($(UNAME_S), Darwin)
        OSFLAG := MACOS
    endif
endif

# ANSI Escape Code - Color
# https://en.wikipedia.org/wiki/ANSI_escape_code#colors

all:
	@echo "Usage: make [clean|build|deploy|run]"
.PHONY: all

clean:
	@echo "Remove all generated files and directories...$(OSFLAG)"
	$(RM) posts/ $(IGNORE_ERRORS)
	$(RM) about/  $(IGNORE_ERRORS)
	$(RM) contact-us/  $(IGNORE_ERRORS)
	$(RM) categories/  $(IGNORE_ERRORS)
	$(RM) docs/  $(IGNORE_ERRORS)
	$(RM) public/  $(IGNORE_ERRORS)
	$(RM) js/  $(IGNORE_ERRORS)
	$(RM) page/  $(IGNORE_ERRORS)
	$(RM) resources/  $(IGNORE_ERRORS)
	$(RM) css/  $(IGNORE_ERRORS)
	$(RM) sass/  $(IGNORE_ERRORS)
	$(RM) series/  $(IGNORE_ERRORS)
	$(RM) tags/  $(IGNORE_ERRORS)
	$(RM) vendor/  $(IGNORE_ERRORS)
	$(RM) 404.html $(IGNORE_ERRORS)
	$(RM) images/ $(IGNORE_ERRORS)
	$(RM) index.html $(IGNORE_ERRORS)
	$(RM) index.xml $(IGNORE_ERRORS)
	$(RM) robots.txt $(IGNORE_ERRORS)
	$(RM) rss.xsl $(IGNORE_ERRORS)
	$(RM) sitemap.xml $(IGNORE_ERRORS)
.PHONY: clean

build: clean
	@$(PRINTER) "\033[38;5;45mBuild the site...\033[38;5;15m\n"
	hugo build -d .
.PHONY: build

deploy: build
	git add -A
	@msg="rebuilding site $(shell date '+%Y-%m-%dT%H:%M:%S %Z%z') on Unix-like system"; \
	echo "$$msg"; \
	git commit -m "$$msg"
	@$(PRINTER) "\033[38;5;46mDeploying updates to GitHub...\033[38;5;15m\n"
	@git push origin $(BRANCH)
	@$(PRINTER) "\033[38;5;198mCOMPLETE! \033[38;5;15m\n"
.PHONY: deploy

# run: clean
run:
	@echo "Run the site..."
	@#echo "--bind=0.0.0.0 --baseURL=http://192.168.0.177 --port=1313"
	hugo server -D -d . --bind=0.0.0.0
.PHONY: run
