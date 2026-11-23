/**
 * Aperture fetch worker — deploy as a Cloudflare Worker.
 * Set ALLOWED_ORIGIN to your exact GitHub Pages origin, e.g.
 * https://yourusername.github.io (no trailing slash).
 */
const MAX_BYTES = 2_000_000;
const cors = (origin, allowed) => ({
  'Access-Control-Allow-Origin': allowed || origin || '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Accept, Content-Type',
  'Vary': 'Origin'
});
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
export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = env.ALLOWED_ORIGIN || '';
    const headers = cors(origin, allowed);
    if (request.method === 'OPTIONS') return new Response(null, { headers });
    const json = (obj, status=200) => new Response(JSON.stringify(obj), { status, headers: { ...headers, 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' } });
    if (request.method !== 'GET') return json({error:'Only GET requests are supported.'},405);
    if (allowed && origin !== allowed) return json({error:'This Aperture proxy is not enabled for this site origin.'},403);
    const raw = new URL(request.url).searchParams.get('url');
    if (!raw) return json({error:'Missing ?url= parameter.'},400);
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
