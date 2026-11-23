# Aperture — GitHub Pages + Cloudflare Worker

Aperture uses GitHub Pages for its static files and a Cloudflare Worker to serve those files with the browser security headers required for cross-origin isolated memory features, while also fetching public HTML pages for the viewer.

> **Important:** After deployment, open Aperture using the **Cloudflare Worker HTTPS URL**, not the direct GitHub Pages URL. GitHub Pages does not let this project configure the required COOP/COEP response headers. Opening the GitHub Pages URL directly will continue to show the isolated-memory warning.

## 1. Publish the static files on GitHub Pages

1. Create a GitHub repository and upload `index.html`, `style.css`, and `app.js` to its root.
2. In **Settings → Pages**, choose **Deploy from a branch**, select `main` and `/ (root)`, then save.
3. Note the published site URL. For a project repository it may look like `https://YOURNAME.github.io/REPOSITORY/`; for a user site it may look like `https://YOURNAME.github.io/`.

## 2. Deploy the Cloudflare Worker

1. In Cloudflare, open **Workers & Pages** and create a Worker.
2. Replace its code with the contents of `worker.js`, then deploy.
3. In the Worker **Settings → Variables**, add these text variables:
   - `APP_ORIGIN`: your GitHub Pages site URL, including the repository path when using a project site, e.g. `https://YOURNAME.github.io/REPOSITORY/`.
   - `ALLOWED_ORIGIN`: the Worker site's origin, e.g. `https://aperture-proxy.YOURSUBDOMAIN.workers.dev` (origin only, no trailing slash or path).
4. Deploy the Worker again.
5. Open the Worker URL itself in Chrome or Edge, e.g. `https://aperture-proxy.YOURSUBDOMAIN.workers.dev/`. This is now the Aperture launch URL. Bookmark this URL and use it instead of the GitHub Pages URL.

The Worker serves Aperture's static files from `APP_ORIGIN` and adds:
- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: credentialless`
- `Origin-Agent-Cluster: ?1`

These response headers enable `crossOriginIsolated` and features such as `SharedArrayBuffer` in supported browsers. The `credentialless` COEP mode is used to reduce breakage from third-party no-CORS resources while preserving cross-origin isolation.

## 3. Connect the HTML fetch endpoint

1. When Aperture is opened from the Worker URL, click the gear beside the address bar.
2. Enter the same Worker URL, e.g. `https://aperture-proxy.YOURSUBDOMAIN.workers.dev`.
3. Try a public page such as `https://example.com`.

## Notes and limitations

- Use a current version of Chrome or Edge over HTTPS. Private browsing policies, embedded previews, browser extensions, or managed-device policies can still disable some capabilities.
- The isolated-memory fix applies to the Aperture top-level app. It does not turn the proxied iframe into a full browser engine, and individual sites may still reject proxy viewing.
- The viewer is a lightweight HTML proxy, not full Chromium. Login cookies, service workers, advanced browser APIs, some WebSockets, and some cross-origin resources may not work normally.
- The proxy only fetches HTML over HTTP(S), blocks local/private network hostnames, limits pages to 2 MB and follows a small number of redirects.
- Keep `ALLOWED_ORIGIN` set to your exact Worker origin. Do not run this as a public general-purpose proxy.
