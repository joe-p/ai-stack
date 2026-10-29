ARG VERSION

FROM node:trixie
RUN npm install --global private-ai-proxy@$VERSION
ENTRYPOINT ["pap", "serve", "--allow-network-access", "--listen", "0.0.0.0:4180"]
