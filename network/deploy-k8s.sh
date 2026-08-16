#!/bin/bash
# Wrapper to call the main Kubernetes deployment script.
# This script ensures that the main script is executed from the correct directory context.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE}")" && pwd)"

bash "${SCRIPT_DIR}/k8s/deploy-k8s.sh" "$@"
