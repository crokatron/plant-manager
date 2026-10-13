#!/bin/bash
set -euo pipefail
# Upstream's migration CLI refuses APP_DEBUG=false. Only initialization needs it.
exec env APP_DEBUG=true /usr/local/bin/docker-entrypoint.sh /bin/bash /opt/run-plants.sh
