#!/bin/sh
# Render the Onyx router config for Railway, then hand off to nginx.
set -eu

: "${PORT:=8080}"
: "${ONYX_BACKEND_API_HOST:=onyx-api.railway.internal:8080}"
: "${ONYX_WEB_SERVER_HOST:=onyx-web.railway.internal:3000}"
: "${NGINX_PROXY_CONNECT_TIMEOUT:=60}"
: "${NGINX_PROXY_SEND_TIMEOUT:=60}"
: "${NGINX_PROXY_READ_TIMEOUT:=60}"

# nginx needs an explicit `resolver` to resolve names at request time; it will
# not read /etc/resolv.conf for that. Lift Railway's nameserver out of resolv.conf
# so this works in any Railway environment without hardcoding an address.
# IPv6 nameservers must be bracketed for nginx.
if [ -z "${NGINX_RESOLVER:-}" ]; then
    NGINX_RESOLVER=$(
        awk '/^nameserver/ { print ($2 ~ /:/) ? "[" $2 "]" : $2 }' /etc/resolv.conf \
        | tr '\n' ' ' | sed 's/ *$//'
    )
fi
if [ -z "$NGINX_RESOLVER" ]; then
    echo "[entrypoint] no nameserver in /etc/resolv.conf; falling back to Cloudflare" >&2
    NGINX_RESOLVER="1.1.1.1"
fi
export PORT ONYX_BACKEND_API_HOST ONYX_WEB_SERVER_HOST NGINX_RESOLVER \
       NGINX_PROXY_CONNECT_TIMEOUT NGINX_PROXY_SEND_TIMEOUT NGINX_PROXY_READ_TIMEOUT

echo "[entrypoint] PORT=$PORT api=$ONYX_BACKEND_API_HOST web=$ONYX_WEB_SERVER_HOST resolver=$NGINX_RESOLVER"

envsubst '${PORT} ${ONYX_BACKEND_API_HOST} ${ONYX_WEB_SERVER_HOST} ${NGINX_RESOLVER} ${NGINX_PROXY_CONNECT_TIMEOUT} ${NGINX_PROXY_SEND_TIMEOUT} ${NGINX_PROXY_READ_TIMEOUT}' \
    < /etc/nginx/templates/onyx.conf.template \
    > /etc/nginx/conf.d/default.conf

nginx -t
exec nginx -g 'daemon off;'
