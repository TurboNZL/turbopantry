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
4. Run it as a service (`cloudflared service install`, see Cloudflare's documentation for your system).

Every API route except `/api/health` needs a token, so the tunnel alone does not expose anyone's recipes.

## Adding Cloudflare Access (optional second lock)
If you put a Cloudflare Access policy in front of the hostname, browsers get Cloudflare's login page first. Devices that cannot do that (the phone app) use a **service token**: in Cloudflare Zero Trust create one, add a policy with the action **Service Auth** that allows it, then on each device open **Settings → Server → Cloudflare Access** and paste the token's **Client ID** and **Client Secret**. TurboPantry sends them on every request.
- The server's address in the app is the tunnel's hostname.
- Access answers a request that carries the service token with a cookie, which is how a browser on the same address keeps working afterwards.
- The service token is a credential: it is kept on that device only.
