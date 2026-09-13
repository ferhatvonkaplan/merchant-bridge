# Temporary HTTPS preview

The permanent S3 + CloudFront deployment currently needs AWS administrator action. A Cloudflare Quick Tunnel can expose the **production build only** while that is resolved. This is a temporary demonstration endpoint, not an always-on production host.

The hostname is allocated by Cloudflare and can change when the tunnel restarts. Availability depends on this computer remaining awake, connected, and running both preview processes. Quick Tunnels do not provide a production uptime guarantee. No Cloudflare account, persistent credential, DNS record, paid subscription, or AWS permission change is created by these commands.

## Start

Build and verify the static release:

```sh
npm run check
```

In one terminal, serve the public build:

```sh
npm run preview:serve
```

In another terminal, use the installed official `cloudflared` CLI:

```sh
mkdir -p artifacts
printf '{}\n' > artifacts/quick-tunnel-config.yml
cloudflared tunnel --config artifacts/quick-tunnel-config.yml --url http://127.0.0.1:4174 --no-autoupdate --protocol http2 --metrics 127.0.0.1:0
```

The empty project-specific configuration keeps this preview separate from existing named-tunnel configuration. Do not substitute a development server URL or point the tunnel at a source checkout, system service, dashboard, or credential endpoint.

The process prints an HTTPS `trycloudflare.com` address. Save the actual current hostname locally in `artifacts/preview-url.txt`, then verify it before sharing. The file and tunnel logs are ignored by Git.

## What is exposed

`scripts/serve-preview.py` builds an exact allowlist from `dist/`. It binds only to `127.0.0.1:4174`, serves GET/HEAD, rejects writes, and provides no directory listing or source fallback. Hidden files, unsupported files, and symlinks prevent startup. Runtime requests for files outside the build return 404.

The server sends a restrictive content-security policy and other browser security headers. It does not log visitor addresses, query strings, or product input. Product JSON processing still happens in the browser; there is no upload endpoint.

Only the public site, synthetic examples, checklist, fonts and license notices are included. Prospect research, outreach drafts, AWS state, and permission files remain outside `dist/` and are not served.

## Verify the actual address

```sh
MERCHANT_BRIDGE_TEST_URL=https://ACTUAL-HOSTNAME.trycloudflare.com npm run test:e2e
```

Also check that `/src/App.tsx`, `/sales/prospects.csv`, `/artifacts/aws-deployment.json`, `/.git/config`, and `/package.json` return 404. HTTPS checks must use certificate verification; do not bypass a TLS warning.

## Stop

Stop the two terminal processes with Ctrl-C. This removes availability of the temporary preview. Do not stop unrelated `cloudflared` processes. The deployment state records this task's process/session references locally so the correct processes can be identified.

The GitHub inquiry form is a separate persistent route. It remains available when this temporary site stops; it requires a GitHub account and is public. Do not put confidential data in an inquiry.

Official background: [Cloudflare Quick Tunnels](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/).
