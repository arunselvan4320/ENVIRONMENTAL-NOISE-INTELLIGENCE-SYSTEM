#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
python3 -m venv .venv
source .venv/bin/activate
if [[ "$(uname)" == "Linux" ]]; then
 python -m pip install 'torch>=2.6,<3' --index-url https://download.pytorch.org/whl/cpu
fi
python -m pip install -r requirements-ai.txt
python -m ml.setup_pretrained
python run.py
