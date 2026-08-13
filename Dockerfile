# syntax=docker/dockerfile:1

# node:22-alpine, khớp soosky-storm-api / soosky-weather-marine-api / soosky-plant-care-api
# (dùng chung base layer -> VPS chỉ lưu một bản).

# ---- Stage 1: cài full deps, test, build ----
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

# Test dùng fake repository/source, không gọi network và không cần .env.
RUN npm test

# tsc --noEmit + esbuild -> dist/app.js
RUN npm run build

# ---- Stage 2: runtime, chỉ prod deps ----
FROM node:22-alpine AS runtime

ENV NODE_ENV=production \
    TZ=UTC

WORKDIR /app

# Scheduler tính giờ chạy bằng Intl với SYNC_TIME_ZONE. Base image thiếu ICU tz data
# sẽ âm thầm rơi về UTC và sync sai giờ, nên fail ngay lúc build.
RUN node -e "const tz='America/New_York';if(new Intl.DateTimeFormat('en-US',{timeZone:tz}).resolvedOptions().timeZone!==tz)throw new Error('ICU time zone data is missing from this base image.');"

# Bundle build với --packages=external nên runtime vẫn cần node_modules prod.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

RUN chown -R node:node /app
USER node

EXPOSE 3000

CMD ["node", "dist/app.js"]
