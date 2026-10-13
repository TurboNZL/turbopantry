# Reaching it from outside (Cloudflare Tunnel)

A Cloudflare Tunnel lets people reach the server without opening a port on your router. It needs a domain on Cloudflare and the `cloudflared` program on the same network as the server.

1. Create the tunnel with `cloudflared tunnel create turbopantry`. It prints an ID and writes a credentials file.
2. Point a hostname at it: `cloudflared tunnel route dns turbopantry pantry.example.com`.
3. Write the tunnel's configuration file (`config.yml`):
   ```
   tunnel: <the tunnel ID>
   credentials-file: /path/to/<the tunnel ID>.json
   ingress:
     - hostname: pantry.example.com
       service: http://localhost:47900
     - service: http_status:404
   ```
   The last rule is required: Cloudflare rejects an ingress list without a catch-all.
4. Run it as a service (`cloudflared service install`, see Cloudflare's documentation for your system) or in a container next to TurboPantry.

If the server runs in Docker, point `service` at the container's address (for example `http://turbopantry:47900` when both are on one Docker network).

Every API route except `/api/health` needs a token, so the tunnel does not expose anyone's recipes. You can add Cloudflare Access in front for a second lock; the Android app and a signed-in browser then need to pass it too.
