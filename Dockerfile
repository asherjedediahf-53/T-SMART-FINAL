# ─── T-SMART — Railway Dockerfile ────────────────────────────────────────────
# Uses the official PHP 8.2 + Apache image (same as XAMPP's stack).
# Railway will auto-detect this file and use it instead of nixpacks.

FROM php:8.2-apache

# Enable mysqli and mbstring extensions (same as XAMPP)
RUN docker-php-ext-install mysqli
RUN a2enmod rewrite

# Copy all project files into Apache's web root
COPY . /var/www/html/

# Make sure Apache can read everything
RUN chown -R www-data:www-data /var/www/html

# Allow .htaccess overrides (needed for clean URLs)
RUN sed -i 's/AllowOverride None/AllowOverride All/g' /etc/apache2/apache2.conf

# Railway sets the PORT env variable — tell Apache to listen on it
RUN echo 'ServerName localhost' >> /etc/apache2/apache2.conf
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 80

ENTRYPOINT ["/docker-entrypoint.sh"]
