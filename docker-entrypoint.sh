#!/bin/bash
# ─── Railway dynamic port entrypoint ─────────────────────────────────────────
# Railway assigns a random PORT via environment variable.
# Apache must listen on that port, not hardcoded 80.

PORT="${PORT:-80}"

# Update Apache to listen on Railway's assigned port
sed -i "s/Listen 80/Listen $PORT/" /etc/apache2/ports.conf
sed -i "s/<VirtualHost \*:80>/<VirtualHost *:$PORT>/" /etc/apache2/sites-available/000-default.conf

echo "Starting Apache on port $PORT..."
exec apache2-foreground
