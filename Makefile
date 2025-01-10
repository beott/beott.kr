# SHELL := /usr/bin/env bash -ex
BRANCH := $(shell git rev-parse --abbrev-ref HEAD)

# 운영체제에 따라 다른 변수나 동작을 설정
ifeq ($(OS), Windows_NT)
    # Windows
    OSFLAG := WINDOWS
    PRINTER := Write-Host
		CLEAN := powershell -ExecutionPolicy Bypass -File .\scripts\windows.clean.ps1
		BUILD := powershell -ExecutionPolicy Bypass -File .\scripts\windows.build.ps1
		DEPLOY := powershell -ExecutionPolicy Bypass -File .\scripts\windows.deploy.ps1
		RUN := powershell -ExecutionPolicy Bypass -File .\scripts\windows.run.ps1
else
    # uname으로 운영체제 구분
		UNAME_S := $(shell uname -s)
    ifeq ($(UNAME_S), Linux)
        OSFLAG := LINUX
    endif
    ifeq ($(UNAME_S), Darwin)
        OSFLAG := MACOS
    endif
    PRINTER := printf
		CLEAN := ./scripts/clean.sh
		BUILD := ./scripts/build.sh
		DEPLOY := ./scripts/deploy.sh
		RUN := ./scripts/run.sh
endif

# ANSI Escape Code - Color
# https://en.wikipedia.org/wiki/ANSI_escape_code#colors

all:
	@echo "Usage: make [clean|build|deploy|run]"
.PHONY: all

clean:
	$(CLEAN)
.PHONY: clean

build: clean
	$(BUILD)
.PHONY: build

deploy: build
	$(DEPLOY)
.PHONY: deploy

run:
	$(RUN)
.PHONY: run
