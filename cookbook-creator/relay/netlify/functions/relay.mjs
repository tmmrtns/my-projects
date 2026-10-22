// Small page relay for Cookbook Creator: GET /relay?url=<page or image address>
// Only answers requests that come from the allowed sites, only public http(s) addresses, size and time limited.
import { lookup } from "node:dns/promises";
import net from "node:net";

const ALLOWED_ORIGINS = ["https://tmmrtns.github.io"];
const MAX_BYTES = 3 * 1024 * 1024;
const OK_TYPES = /^(text\/|application\/(xhtml\+xml|xml|json|ld\+json)|image\/(jpeg|png|webp|gif|avif))/i;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

function isPrivate(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase();
    return l === "::1" || l === "::" || l.startsWith("fc") || l.startsWith("fd") || l.startsWith("fe8") || l.startsWith("fe9") || l.startsWith("fea") || l.startsWith("feb") || l.startsWith("::ffff:");
  }
  return true;
}
async function checkTarget(u) {
  if (!/^https?:$/.test(u.protocol)) throw new Error("Only http and https addresses are allowed.");
  if (u.username || u.password) throw new Error("Addresses with a login are not allowed.");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (/(^|\.)(localhost|local|internal|lan)$/i.test(host)) throw new Error("Not a public address.");
  const ips = net.isIP(host) ? [host] : (await lookup(host, { all: true })).map((r) => r.address);
  if (!ips.length || ips.some(isPrivate)) throw new Error("Not a public address.");
}

export default async (req) => {
  const origin = req.headers.get("origin") || "";
  const cors = { "Access-Control-Allow-Origin": origin, Vary: "Origin", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Max-Age": "86400" };
  if (!ALLOWED_ORIGINS.includes(origin)) return new Response("Not allowed from this site.", { status: 403 });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "GET") return new Response("GET only.", { status: 405, headers: cors });
  const fail = (m, s = 400) => new Response(m, { status: s, headers: { ...cors, "content-type": "text/plain; charset=utf-8" } });
  let target;
  try { target = new URL(new URL(req.url).searchParams.get("url") || ""); } catch { return fail("Missing or invalid url."); }
  try {
    let res;
    for (let hop = 0; hop < 5; hop++) {
      await checkTarget(target);
      res = await fetch(target, {
        redirect: "manual",
        signal: AbortSignal.timeout(12000),
        headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/*;q=0.8,*/*;q=0.5", "accept-language": "en,nl;q=0.8" },
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) { target = new URL(res.headers.get("location"), target); res = null; continue; }
      break;
    }
    if (!res) return fail("Too many redirects.", 502);
    if (!res.ok) return fail("The page answered with status " + res.status + ".", 502);
    const type = res.headers.get("content-type") || "";
    if (!OK_TYPES.test(type)) return fail("That kind of file is not supported.", 415);
    const len = Number(res.headers.get("content-length") || 0);
    if (len > MAX_BYTES) return fail("That file is too large.", 413);
    const reader = res.body.getReader(); const chunks = []; let size = 0;
    for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > MAX_BYTES) { try { reader.cancel(); } catch {} return fail("That file is too large.", 413); } chunks.push(value); }
    const body = new Uint8Array(size); let off = 0; for (const c of chunks) { body.set(c, off); off += c.length; }
    return new Response(body, { status: 200, headers: { ...cors, "content-type": type, "cache-control": "public, max-age=300" } });
  } catch (e) {
    return fail(e && e.message ? String(e.message).slice(0, 120) : "Could not fetch that page.", 502);
  }
};
export const config = { path: "/relay" };
