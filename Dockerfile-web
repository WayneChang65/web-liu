# Stage 1: Build the application
FROM node:22-alpine AS builder

# Install git to clone the repository
RUN apk add --no-cache git

WORKDIR /app

# Argument to force cache busting when the git repo updates
# usage: docker-compose build --build-arg CACHEBUST=$(date +%s)
ARG CACHEBUST=1

# Clone the repository (master branch)
# We clone into the current directory (.)
RUN git clone -b master https://github.com/WayneChang65/web-liu.git .

# M6: install the exact dependency set from the committed lockfile.
# npm's lockfile records every platform's optional deps, so `npm ci` is
# portable across macOS/Linux — no need to delete the lockfile anymore.
RUN npm ci

# Build the project (Vite build)
RUN npm run build

# Stage 2: Serve the application with Apache (httpd)
FROM httpd:2.4-alpine

# Remove default apache index.html
RUN rm -rf /usr/local/apache2/htdocs/*

# Copy the built assets from the builder stage to Apache's default document root
COPY --from=builder /app/dist /usr/local/apache2/htdocs/

# M6: run as the unprivileged 'daemon' user. Non-root cannot bind port 80,
# so Apache listens on 8088 (updated in docker-compose service port).
RUN sed -i 's/^Listen 80$/Listen 8088/' /usr/local/apache2/conf/httpd.conf \
    && chown -R daemon:daemon /usr/local/apache2/htdocs \
    && chown -R daemon:daemon /usr/local/apache2/logs

# M6: security headers (CSP itself ships as a <meta> tag in the HTML pages)
RUN { \
      echo '<IfModule mod_headers.c>'; \
      echo '  Header always set X-Content-Type-Options "nosniff"'; \
      echo '  Header always set X-Frame-Options "DENY"'; \
      echo '  Header always set Referrer-Policy "strict-origin-when-cross-origin"'; \
      echo '  Header always set Cross-Origin-Opener-Policy "same-origin"'; \
      echo '</IfModule>'; \
    } >> /usr/local/apache2/conf/httpd.conf

USER daemon

EXPOSE 8088
