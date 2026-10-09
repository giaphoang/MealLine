#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
task_python="${MEALLINE_AGENT_PYTHON:-}"
if [ -z "$task_python" ]; then
  for candidate in voice_agent/.venv/bin/python ../agent/.venv/bin/python ../nourish/agent/.venv/bin/python; do
    if [ -x "$candidate" ]; then task_python="$candidate"; break; fi
  done
fi
if [ -z "$task_python" ]; then
  echo "Set MEALLINE_AGENT_PYTHON to a Python with the voice_agent/requirements.txt dependencies installed."
  exit 1
fi
export PYTHONDONTWRITEBYTECODE=1
exec "$task_python" -m voice_agent.server "$@"
