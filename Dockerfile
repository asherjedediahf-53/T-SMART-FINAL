# ─── T-SMART — Railway Dockerfile ────────────────────────────────────────────
FROM php:8.2-apache
 
# Install mysqli extension and enable mod_rewrite
RUN docker-php-ext-install mysqli && a2enmod rewrite
 
# Copy project files into Apache web root
COPY . /var/www/html/
 
# Fix permissions
RUN chown -R www-data:www-data /var/www/html
 
# Copy and permission the entrypoint
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh
 
EXPOSE 80
 
ENTRYPOINT ["/docker-entrypoint.sh"]
