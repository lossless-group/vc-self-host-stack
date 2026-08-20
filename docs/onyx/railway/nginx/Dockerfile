# Onyx path router for Railway.
#
# Onyx serves one origin split by path (/api + /openapi.json + /scim +
# /auth/saml -> backend, everything else -> Next.js web server). Railway's edge
# maps a domain to a single service and cannot path-route, so upstream's nginx
# service has to be deployed rather than dropped. This is the ONLY Onyx service
# with a public domain; every other service stays private.
#
# See nginx.conf.template for the three deviations from upstream's config.

FROM nginx:1.25.5-alpine

# envsubst
RUN apk add --no-cache gettext

COPY nginx.conf.template /etc/nginx/templates/onyx.conf.template
COPY entrypoint.sh /docker-entrypoint-railway.sh
RUN chmod +x /docker-entrypoint-railway.sh

# The stock nginx image ships a default server on :80 that would collide with
# our default_server on $PORT.
RUN rm -f /etc/nginx/conf.d/default.conf

ENTRYPOINT ["/docker-entrypoint-railway.sh"]
