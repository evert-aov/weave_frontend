FROM node:24-slim AS development

WORKDIR /app
ENV NODE_ENV=development NODE_OPTIONS="--max-old-space-size=4096"
COPY package*.json ./
RUN npm ci
COPY . .
EXPOSE 5000
CMD ["npm", "start", "--", "--host", "0.0.0.0", "--poll", "1000"]

FROM node:24-slim AS builder

WORKDIR /app

ENV NODE_OPTIONS="--max-old-space-size=4096"

COPY package*.json ./
RUN npm ci

COPY . .

RUN npm run build

FROM nginx:1.27-alpine AS runner

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist/frontend/browser /usr/share/nginx/html

EXPOSE 5000

CMD ["nginx", "-g", "daemon off;"]
