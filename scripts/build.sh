#!/usr/bin/env bash

set -ex

printf "\033[38;5;45mBuild the site...\033[38;5;15m\n"
hugo --destination . --contentDir=content
