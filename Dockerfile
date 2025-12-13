# Stage 1: Build the application
FROM node:18-alpine AS builder

# Install git to clone the repository
RUN apk add --no-cache git

WORKDIR /app

# Argument to force cache busting when the git repo updates
# usage: docker-compose build --build-arg CACHEBUST=$(date +%s)
ARG CACHEBUST=1

# Clone the repository (master branch)
# We clone into the current directory (.)
RUN git clone -b master https://github.com/WayneChang65/web-liu.git .

# Install dependencies
RUN npm install

# Build the project (Vite build)
RUN npm run build

# Stage 2: Serve the application with Apache (httpd)
FROM httpd:2.4-alpine

USER daemon

# Remove default apache index.html
RUN rm -rf /usr/local/apache2/htdocs/*

# Copy the built assets from the builder stage to Apache's default document root
COPY --from=builder /app/dist /usr/local/apache2/htdocs/

# Expose port 80
EXPOSE 80
