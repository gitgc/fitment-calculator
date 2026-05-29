FROM caddy:2

COPY Caddyfile /etc/caddy/Caddyfile
COPY src/ /srv/

EXPOSE 80
