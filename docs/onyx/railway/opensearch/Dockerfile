# OpenSearch for Railway — thin wrapper over the official image.
#
# WHY THIS EXISTS
# Railway mounts persistent volumes root-owned (mode 755). The official
# opensearchproject image runs as UID 1000 and its entrypoint hard-refuses to
# run as root ("OpenSearch cannot run as root"). So with a Railway volume
# attached:
#   - stock image           -> AccessDeniedException /usr/share/opensearch/data
#   - RAILWAY_RUN_UID=0     -> "OpenSearch cannot run as root", crash loop
# Neither knob alone works. This wrapper starts as root, fixes ownership of the
# mounted data dir, then drops back to UID 1000 and execs the UPSTREAM
# entrypoint unmodified — so OpenSearch's own startup logic is untouched.
#
# The base image ships no gosu / su-exec / su / runuser, so we install
# util-linux for setpriv. NOTE: it must be the full `util-linux` package —
# `util-linux-core` on AL2023 ships chrt/nsenter but NOT setpriv.
#
# REQUIRES on the Railway service:
#   RAILWAY_RUN_UID=0          (so the entrypoint starts with root privileges)
#   discovery.type=single-node (skips bootstrap checks Railway can't satisfy:
#                               vm.max_map_count is a host sysctl)
#   bootstrap.memory_lock=false (Railway grants no memlock ulimit)
#   network.host=::            (Railway private networking is IPv6-only)
#
# Verified against Onyx v4.5.6, which expects OpenSearch over HTTPS with basic
# auth (OPENSEARCH_USE_SSL defaults true, OPENSEARCH_VERIFY_CERTS false).

ARG OPENSEARCH_VERSION=3.6.0
FROM opensearchproject/opensearch:${OPENSEARCH_VERSION}

USER 0

RUN dnf install -y util-linux \
    && dnf clean all \
    && rm -rf /var/cache/dnf

COPY railway-entrypoint.sh /usr/local/bin/railway-entrypoint.sh
RUN chmod +x /usr/local/bin/railway-entrypoint.sh

ENTRYPOINT ["/usr/local/bin/railway-entrypoint.sh"]
CMD ["opensearch"]
