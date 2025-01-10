#!/usr/bin/env bash

set -ex

@echo "Run the site..."
hugo server --contentDir=content --bind=0.0.0.0 --baseURL=http://127.0.0.1
