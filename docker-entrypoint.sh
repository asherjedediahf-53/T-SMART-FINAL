#!/bin/bash
# ─── Railway dynamic port entrypoint ─────────────────────────────────────────
 
PORT="${PORT:-80}"
 
echo "Configuring Apache on port $PORT..."
 
# Update ports.conf
sed -i "s/Listen 80/Listen $PORT/" /etc/apache2/ports.conf
 
# Update default vhost
sed -i "s/<VirtualHost \*:80>/<VirtualHost *:$PORT>/" /etc/apache2/sites-available/000-default.conf
 
# Suppress the ServerName warning that can delay startup
echo "ServerName 0.0.0.0" >> /etc/apache2/apache2.conf
 
# Ensure .htaccess is respected in web root
cat >> /etc/apache2/apache2.conf <<EOF
<Directory /var/www/html>
    Options Indexes FollowSymLinks
    AllowOverride All
    Require all granted
</Directory>
EOF
 
echo "Starting Apache on port $PORT..."
exec apache2-foreground
