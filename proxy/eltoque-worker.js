/**
 * Proxy mínimo para la API de tasas de elTOQUE (Cloudflare Workers, plan gratuito).
 *
 * Para qué: el navegador puede no tener permiso (CORS) para llamar directo a tasas.eltoque.com,
 * y así el token tampoco queda en el teléfono.
 *
 * Despliegue (5 minutos):
 *   1. dash.cloudflare.com → Workers & Pages → Create → Worker → pega este archivo → Deploy.
 *   2. Settings → Variables and Secrets → Add → Secret: ELTOQUE_TOKEN = tu token de elTOQUE.
 *   3. (Opcional) Variable ALLOWED_ORIGIN = https://adnielys.github.io
 *   4. Copia la URL del worker (https://….workers.dev) en Centro Familiar → Ajustes → Tipo de cambio → Proxy.
 *
 * Cachea la respuesta 30 minutos para respetar los límites de la API (60/min por clave).
 */
const API = "https://tasas.eltoque.com/v1/trmi";

export default {
  async fetch(request, env, ctx) {
    const origin = env.ALLOWED_ORIGIN || "*";
    const cors = { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "GET") return new Response("Method not allowed", { status: 405, headers: cors });
    if (!env.ELTOQUE_TOKEN) return new Response("Falta el secreto ELTOQUE_TOKEN", { status: 500, headers: cors });

    const url = new URL(request.url);
    const upstream = new URL(API);
    for (const k of ["date_from", "date_to"]) if (url.searchParams.get(k)) upstream.searchParams.set(k, url.searchParams.get(k));

    const cache = caches.default;
    const cacheKey = new Request(`${upstream}`, { method: "GET" });
    let res = await cache.match(cacheKey);
    if (!res) {
      const r = await fetch(upstream, { headers: { Authorization: `Bearer ${env.ELTOQUE_TOKEN}`, Accept: "application/json" } });
      res = new Response(r.body, r);
      res.headers.set("Cache-Control", "public, max-age=1800");
      if (r.ok) ctx.waitUntil(cache.put(cacheKey, res.clone()));
    }
    const out = new Response(res.body, res);
    for (const [k, v] of Object.entries(cors)) out.headers.set(k, v);
    return out;
  },
};
