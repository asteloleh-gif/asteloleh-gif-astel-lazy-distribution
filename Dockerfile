FROM node:22-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914 AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY scripts ./scripts
ADD https://github.com/openai/tunnel-client/releases/download/v0.0.18/tunnel-client-v0.0.18-linux-amd64.zip /tmp/tunnel-client.zip
RUN apk add --no-cache ca-certificates \
    && echo "3c82307316acd93c88a384b62af1d81d3f4cb0efa975f9c0bfaef922866a04c4  /tmp/tunnel-client.zip" | sha256sum -c - \
    && unzip /tmp/tunnel-client.zip -d /tmp/tunnel-extracted \
    && cp /tmp/tunnel-extracted/tunnel-client /usr/local/bin/tunnel-client \
    && chmod 755 /usr/local/bin/tunnel-client \
    && rm -rf /tmp/tunnel-client.zip /tmp/tunnel-extracted
ENV NODE_ENV=production
EXPOSE 8080
CMD ["npm", "start"]
