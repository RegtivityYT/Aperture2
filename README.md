# Aperture — GitHub Pages + Cloudflare Worker

This is a static GitHub Pages frontend plus a small Cloudflare Worker that fetches public HTML pages. The viewer displays sanitised, script-free pages inside Aperture. It is **not a full Chromium browser**: pages that depend on JavaScript, login cookies, complex forms, or anti-bot systems may fail or look incomplete.

## 1. Publish the website on GitHub Pages

1. Create a GitHub repository (for example `aperture`).
2. Upload `index.html`, `style.css`, and `app.js` to the repository root.
3. In **Settings → Pages**, choose **Deploy from a branch**, select `main` and `/ (root)`, then save.
4. Wait for GitHub Pages to publish. Your origin will look like `https://YOURNAME.github.io` for a user site, or `https://YOURNAME.github.io` for a project site's origin too (the project path is not part of the origin).

## 2. Deploy the proxy on Cloudflare Workers (free tier may be enough for light personal use)

1. Sign in to Cloudflare and open **Workers & Pages** → **Create** → **Worker**.
2. Give it a name such as `aperture-proxy` and create/deploy it.
3. Open the Worker editor, replace the starter code with the contents of `worker.js`, and deploy.
4. Open the Worker **Settings → Variables** and add a text variable:
   - Name: `ALLOWED_ORIGIN`
   - Value: your GitHub Pages origin, e.g. `https://YOURNAME.github.io` (no trailing slash; do not include `/aperture`).
5. Deploy again. Copy the Worker URL, e.g. `https://aperture-proxy.YOURSUBDOMAIN.workers.dev`.

## 3. Connect Aperture to the Worker

Open your GitHub Pages site. Click the **gear button** beside the address bar and paste your Worker URL. It is saved in local browser storage on that device. Then try `https://example.com` in the address bar.

## Notes / limitations

- The proxy only fetches HTML over HTTP(S), blocks local/private network hostnames, limits pages to 2 MB and follows a small number of redirects.
- The browser viewer removes scripts and interactive form elements. Links can be followed within Aperture, but sign-in flows, video players, dynamic apps and sites requiring JavaScript will not work as a full browser would.
- Images and stylesheets are loaded by the viewer from their original public URLs. Some sites block those assets or block proxy access altogether.
- Do not use this as a public general-purpose proxy or advertise the Worker as one. It is intended for your own Aperture site. Keep `ALLOWED_ORIGIN` set to your exact GitHub Pages origin and check your Cloudflare usage limits.
- The viewer uses DOMPurify from a CDN and retains page scripts. The iframe runs with `allow-scripts` but deliberately omits `allow-same-origin`, so the viewed page receives an opaque origin and cannot directly access the Aperture parent document. A restrictive Content Security Policy permits common web resources, inline scripts, WebAssembly compilation, workers, Fetch and WebSockets while blocking plugins. DOMPurify still removes event-handler attributes and dangerous embedded content. If the DOMPurify CDN is unavailable, the fallback is less comprehensive; use the online version only with the bundled sanitiser available.
