# syntax=docker/dockerfile:1.7
FROM node:24-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

FROM node:24-alpine AS builder
ARG INTERNAL_BACKEND_URL=http://backend:8000
ARG NEXT_PUBLIC_API_URL=
ARG NEXT_PUBLIC_CHATBOT_SSO_ENABLED=false
ARG NEXT_PUBLIC_CHATBOT_URL=/chatbot
ENV NEXT_TELEMETRY_DISABLED=1 \
    INTERNAL_BACKEND_URL=${INTERNAL_BACKEND_URL} \
    NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
    NEXT_PUBLIC_CHATBOT_SSO_ENABLED=${NEXT_PUBLIC_CHATBOT_SSO_ENABLED} \
    NEXT_PUBLIC_CHATBOT_URL=${NEXT_PUBLIC_CHATBOT_URL}
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24-alpine AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3000
CMD ["node", "server.js"]
