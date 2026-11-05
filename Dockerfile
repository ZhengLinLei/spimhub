# syntax=docker/dockerfile:1
# =========================================================================
#   SpimHub - A MIPS Assembly IDE for Web Browsers
#
#   Web IDE (default target):
#       docker build -t spimhub .
#       docker run -d -p 8080:80 --name spimhub spimhub      ->  http://localhost:8080
#
#   Command line assembler / simulator:
#       docker build --target cli -t spimhub-cli .
#       docker run -i --rm -v "$PWD":/work spimhub-cli program.asm
# =========================================================================

# ---------- Build: TypeScript + SCSS -> docs/ and dist/, typecheck and tests ----------
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json tsconfig.app.json ./
COPY scripts ./scripts
COPY bin ./bin
COPY src ./src
COPY test ./test
COPY extensions ./extensions
RUN npm run typecheck && npm test

# ---------- CLI: spimhub program.asm ----------
FROM node:22-alpine AS cli
WORKDIR /app
COPY --from=build /app/bin ./bin
COPY --from=build /app/dist ./dist
COPY --from=build /app/src/examples ./examples
WORKDIR /work
USER node
ENTRYPOINT ["node", "/app/bin/spimhub.js"]
CMD ["--help"]

# ---------- Web: docs/ (index.html, style.css, script.js, img/) served by nginx ----------
FROM nginx:1.27-alpine AS web
LABEL org.opencontainers.image.title="SpimHub" \
      org.opencontainers.image.description="MIPS & RISC-V Assembly IDE with a visual pipeline" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.source="https://github.com/ZhengLinLei/spimhub-depr"
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
RUN rm -rf /usr/share/nginx/html/*
COPY --from=build /app/docs /usr/share/nginx/html
# Example extension server: /extensions/index.json
COPY --from=build /app/extensions /usr/share/nginx/html/extensions
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO /dev/null http://127.0.0.1/healthz || exit 1
