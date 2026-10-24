# Headless Blender for rendering the rating-glass icons. Used by the Makefile.
FROM ubuntu:24.04

ARG BLENDER_VERSION=5.2.0
ARG BLENDER_SERIES=5.2

RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl xz-utils \
        libx11-6 libxi6 libxxf86vm1 libxfixes3 libxrender1 libxkbcommon0 \
        libsm6 libice6 libgl1 libegl1 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL "https://download.blender.org/release/Blender${BLENDER_SERIES}/blender-${BLENDER_VERSION}-linux-x64.tar.xz" \
        | tar -xJ -C /opt \
    && ln -s "/opt/blender-${BLENDER_VERSION}-linux-x64/blender" /usr/local/bin/blender

ENV HOME=/tmp
WORKDIR /work
ENTRYPOINT ["blender", "-b"]
