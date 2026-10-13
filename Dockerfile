# Built by .github/workflows/release.yml from the repository root. Needs no build step of its own when dist/ is present;
# the workflow builds the web client and the server bundle first and copies them into ./release.
FROM node:22-slim
WORKDIR /app
COPY release/ /app/
ENV TURBOPANTRY_DATA=/data TURBOPANTRY_PORT=47900
RUN mkdir /data && chown node:node /data
VOLUME /data
EXPOSE 47900
USER node
HEALTHCHECK --interval=60s --timeout=5s CMD node -e "fetch('http://127.0.0.1:47900/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "server.mjs"]
