#!/usr/bin/env bash

set -ex

printf "\033[38;5;45mRemove all generated files and directories...\033[38;5;15m\n"

rm -rf \
  posts/ \
  images/ \
  about/ \
  categories/ \
  public/ \
  js/ \
  page/ \
  resources/ \
  scss/ \
  series/ \
  tags/ \
  vendor/ \
  404.html \
  index.html \
  index.xml \
  robots.txt \
  rss.xsl \
  sitemap.xml
