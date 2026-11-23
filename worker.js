/**
 * Aperture edge host + fetch proxy.
 * Required Worker variables:
 *   APP_ORIGIN      GitHub Pages site URL, including repository path if applicable
 *   ALLOWED_ORIGIN  The Worker site's own origin, e.g. https://aperture.example.workers.dev
 *
 * Serving the app through this Worker is important: GitHub Pages cannot set the
 * COOP/COEP response headers needed for cross-origin isolated memory features.
 */
const MAX_BYTES = 2_000_000;
const cors = (origin, allowed) => ({
  'Access-Control-Allow-Origin': allowed || origin || '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Accept, Content-Type',
  'Vary': 'Origin'
});
const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
  'Origin-Agent-Cluster': '?1',
  'Cross-Origin-Resource-Policy': 'same-origin'
};
function blockedHost(host) {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (/^(10\.|127\.|169\.254\.|192\.168\.|0\.)/.test(h)) return true;
  const m = h.match(/^172\.(\d+)\./); if (m && +m[1] >= 16 && +m[1] <= 31) return true;
  if (h === '::1' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80:')) return true;
  return false;
}
function validate(raw) {
  let u; try { u = new URL(raw); } catch { throw new Error('Enter a valid website URL.'); }
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error('Only http and https URLs are allowed.');
  if (u.username || u.password) throw new Error('URLs containing usernames or passwords are not allowed.');
  if (blockedHost(u.hostname)) throw new Error('Local and private network addresses are blocked.');
  return u;
}
async function serveApp(request, env) {
  if (!env.APP_ORIGIN) return new Response('Aperture setup required: set the APP_ORIGIN Worker variable to your GitHub Pages URL.', {status: 503});
  let base;
  try { base = new URL(env.APP_ORIGIN.endsWith('/') ? env.APP_ORIGIN : env.APP_ORIGIN + '/'); }
  catch { return new Response('Invalid APP_ORIGIN Worker variable.', {status: 500}); }
  if (!['https:'].includes(base.protocol)) return new Response('APP_ORIGIN must use HTTPS.', {status: 500});
  const incoming = new URL(request.url);
  const relativePath = incoming.pathname.replace(/^\/+/, '');
  const assetUrl = new URL(relativePath || 'index.html', base);
  // Keep all paths inside the configured static-site directory.
  if (!assetUrl.href.startsWith(base.href)) return new Response('Not found.', {status: 404});
  const upstream = await fetch(assetUrl.href, {headers: {'Accept': request.headers.get('Accept') || '*/*'}});
  const headers = new Headers(upstream.headers);
  for (const [k, v] of Object.entries(isolationHeaders)) headers.set(k, v);
  headers.set('Cache-Control', 'no-cache');
  headers.delete('Content-Security-Policy');
  return new Response(upstream.body, {status: upstream.status, statusText: upstream.statusText, headers});
}
export default {
  async fetch(request, env) {
    const incoming = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const allowed = env.ALLOWED_ORIGIN || '';
    const headers = cors(origin, allowed);
    if (request.method === 'OPTIONS') return new Response(null, { headers });
    if (request.method !== 'GET') return new Response('Only GET requests are supported.', {status: 405});

    // The same Worker serves the Aperture frontend (with isolation headers) and
    // the HTML-fetch endpoint (?url=...). Open the Worker root to launch Aperture.
    if (!incoming.searchParams.has('url')) return serveApp(request, env);

    const json = (obj, status=200) => new Response(JSON.stringify(obj), { status, headers: { ...headers, ...isolationHeaders, 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' } });
    // Same-origin fetches from the Worker-hosted Aperture app normally omit the Origin header.
    // Only reject an explicitly supplied Origin when it does not match the configured app origin.
    if (allowed && origin && origin !== allowed) return json({error:'This Aperture proxy is not enabled for this site origin.'},403);
    const raw = incoming.searchParams.get('url');
    let target; try { target=validate(raw); } catch(e) { return json({error:e.message},400); }
    try {
      let response, finalUrl=target.href;
      for(let i=0;i<5;i++) {
        response=await fetch(finalUrl,{redirect:'manual',headers:{'User-Agent':'Mozilla/5.0 (compatible; ApertureViewer/1.0)','Accept':'text/html,application/xhtml+xml;q=0.9'},signal:AbortSignal.timeout(12000)});
        if(response.status>=300 && response.status<400) {
          const loc=response.headers.get('Location'); if(!loc) break;
          finalUrl=new URL(loc,finalUrl).href; validate(finalUrl); continue;
        }
        break;
      }
      if(!response || !response.ok) return json({error:`The destination returned HTTP ${response?.status || 'error'}.`},502);
      const type=response.headers.get('Content-Type')||'';
      if(!/text\/html|application\/xhtml\+xml/i.test(type)) return json({error:'Only HTML pages can be displayed in Aperture.'},415);
      const reader=response.body.getReader(); let chunks=[],size=0;
      while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BYTES){await reader.cancel();return json({error:'This page is larger than the 2 MB viewer limit.'},413)}chunks.push(value)}
      const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length}
      const html=new TextDecoder('utf-8',{fatal:false}).decode(bytes);
      return json({type:'html',html,finalUrl,responseUrl:response.url||finalUrl});
    } catch(e) { return json({error:e.name==='TimeoutError'?'The website took too long to respond.':`Could not fetch this website: ${e.message}`},502); }
  }
};
