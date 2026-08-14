# navicharts-ui — production image
# Multi-stage: build static assets with Node, serve with nginx.

# --- Stage 1: build ---
FROM node:24-alpine AS builder

WORKDIR /app

# Install deps first for better layer caching
COPY package.json package-lock.json ./
RUN npm ci

# Build the production bundle. Vite inlines VITE_* env vars into the bundle at
# build time, so they must be present as ENV when `npm run build` runs.
ARG VITE_NAVICHARTS_URL
ARG VITE_ASTROGATORS_TABLE_URL
ENV VITE_NAVICHARTS_URL=${VITE_NAVICHARTS_URL}
ENV VITE_ASTROGATORS_TABLE_URL=${VITE_ASTROGATORS_TABLE_URL}

COPY . .
RUN npm run build


# --- Stage 2: serve ---
FROM nginx:alpine

# Drop the default nginx site
RUN rm -rf /usr/share/nginx/html/* /etc/nginx/conf.d/default.conf

# Minimal SPA config. App is mounted at /navicharts/ (matches Vite `base`), so
# static assets live under that prefix and SPA fallback goes to
# /navicharts/index.html. Listens on 4176.
RUN printf '%s\n' \
    'server {' \
    '  listen 4176;' \
    '  server_name _;' \
    '  root /usr/share/nginx/html;' \
    '  index index.html;' \
    '  location /navicharts/ {' \
    '    alias /usr/share/nginx/html/;' \
    '    try_files $uri $uri/ /index.html;' \
    '  }' \
    '  location = / { return 301 /navicharts/; }' \
    '}' > /etc/nginx/conf.d/navicharts-ui.conf

COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 4176

CMD ["nginx", "-g", "daemon off;"]
