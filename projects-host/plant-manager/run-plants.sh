#!/bin/bash
set -euo pipefail
sed -i 's/^ *APP_DEBUG=.*/APP_DEBUG=false/' /var/www/html/.env
export APP_DEBUG=false
printf 'display_errors=Off\nlog_errors=On\nerror_reporting=E_ALL & ~E_NOTICE & ~E_WARNING & ~E_DEPRECATED\n' > /usr/local/etc/php/conf.d/errors.ini
exec apache2-foreground
