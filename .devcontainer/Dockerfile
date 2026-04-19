FROM node:24-trixie-slim

RUN apt-get update && apt-get install -y --no-install-recommends git openssh-client \
	&& rm -rf /var/lib/apt/lists/*
