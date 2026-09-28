FROM postgres:17-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends restic curl jq util-linux ca-certificates && rm -rf /var/lib/apt/lists/*
COPY *.sh /scripts/
ENTRYPOINT []
CMD ["bash", "/scripts/backup.sh", "loop"]
