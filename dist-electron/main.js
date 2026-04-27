import { ipcMain as E, app as f, BrowserWindow as O } from "electron";
import { existsSync as F } from "node:fs";
import { fileURLToPath as H } from "node:url";
import a from "node:path";
const P = a.dirname(H(import.meta.url)), b = a.join(P, "..");
process.env.APP_ROOT = b;
const U = process.env.VITE_DEV_SERVER_URL, ee = a.join(b, "dist-electron"), I = a.join(b, "dist");
function J() {
  return f.isPackaged ? f.getAppPath() : b;
}
function L() {
  return f.isPackaged ? a.join(J(), "dist") : I;
}
function N() {
  return U ? a.join(b, "public") : L();
}
process.env.VITE_PUBLIC = N();
const B = /* @__PURE__ */ new Set([
  "host",
  "connection",
  "content-length",
  "transfer-encoding",
  "origin",
  "referer",
  "cookie"
]), R = /* @__PURE__ */ new Map();
let g = null;
function A(e) {
  return e.trim().replace(/\/+$/, "");
}
function T(e) {
  if (!e || typeof e != "object")
    throw new Error("Provider request is required.");
  if (typeof e.baseUrl != "string" || !e.baseUrl.trim())
    throw new Error("Provider base URL is required.");
  return {
    baseUrl: e.baseUrl,
    apiKey: typeof e.apiKey == "string" ? e.apiKey : "",
    customHeaders: typeof e.customHeaders == "string" ? e.customHeaders : "",
    payload: e.payload
  };
}
function x({
  apiKey: e,
  customHeaders: t,
  accept: n,
  contentType: o
}) {
  const r = new Headers();
  o && r.set("Content-Type", o), n && r.set("Accept", n);
  for (const h of (t == null ? void 0 : t.split(/\r?\n/)) ?? []) {
    const l = h.trim();
    if (!l || l.startsWith("#")) continue;
    const p = l.indexOf(":");
    if (p <= 0) continue;
    const u = l.slice(0, p).trim(), v = l.slice(p + 1).trim(), j = u.toLowerCase();
    if (!(!u || !v || B.has(j)))
      try {
        r.set(u, v);
      } catch {
      }
  }
  const d = e == null ? void 0 : e.trim();
  return d && r.set("Authorization", `Bearer ${d}`), r;
}
async function $(e) {
  const t = await e.text();
  if (!e.ok)
    throw new Error(t || `Provider returned ${e.status}`);
  try {
    return JSON.parse(t);
  } catch {
    throw new Error("Provider returned a non-JSON response.");
  }
}
function w(e) {
  return typeof e == "string" ? e : Array.isArray(e) ? e.map((t) => typeof t == "string" ? t : t && typeof t == "object" && "text" in t && typeof t.text == "string" ? t.text : t && typeof t == "object" && "content" in t && typeof t.content == "string" ? t.content : "").join("") : "";
}
function K(e) {
  var o;
  if (!e || typeof e != "object") return "";
  const t = "choices" in e ? e.choices : void 0;
  if (!Array.isArray(t)) return "";
  const n = (o = t[0]) == null ? void 0 : o.delta;
  return !n || typeof n != "object" ? "" : w("content" in n ? n.content : void 0);
}
function M(e) {
  var o;
  if (!e || typeof e != "object") return "";
  const t = "choices" in e ? e.choices : void 0;
  if (!Array.isArray(t)) return "";
  const n = (o = t[0]) == null ? void 0 : o.delta;
  return !n || typeof n != "object" ? "" : w("reasoning_content" in n ? n.reasoning_content : void 0) || w("reasoning" in n ? n.reasoning : void 0) || w("thinking" in n ? n.thinking : void 0) || w("reasoning_details" in n ? n.reasoning_details : void 0);
}
function k(e) {
  return typeof e == "number" && Number.isFinite(e) ? e : void 0;
}
function z(e) {
  if (!e || typeof e != "object" || !("usage" in e)) return;
  const t = e.usage;
  if (!t || typeof t != "object") return;
  const n = k("prompt_tokens" in t ? t.prompt_tokens : void 0), o = k(
    "completion_tokens" in t ? t.completion_tokens : void 0
  ), r = k("total_tokens" in t ? t.total_tokens : void 0);
  if (!(n === void 0 && o === void 0 && r === void 0))
    return { promptTokens: n, completionTokens: o, totalTokens: r };
}
function G(e) {
  var o;
  if (!e || typeof e != "object") return;
  const t = "choices" in e ? e.choices : void 0;
  if (!Array.isArray(t)) return;
  const n = (o = t[0]) == null ? void 0 : o.finish_reason;
  return typeof n == "string" ? n : void 0;
}
function Q() {
  const e = [
    a.join(P, "preload.cjs"),
    a.join(P, "preload.js"),
    a.join(P, "preload.mjs")
  ], t = e.find((n) => F(n));
  if (!t)
    throw new Error(`Unable to find Electron preload script. Checked: ${e.join(", ")}`);
  return t;
}
function C() {
  g = new O({
    width: 1280,
    height: 860,
    minWidth: 940,
    minHeight: 620,
    title: "Chat Forge",
    icon: a.join(N(), "icon.png"),
    webPreferences: {
      preload: Q(),
      contextIsolation: !0,
      nodeIntegration: !1,
      sandbox: !1
    }
  }), g.webContents.on("did-fail-load", (e, t, n, o) => {
    console.error("Failed to load renderer", { errorCode: t, errorDescription: n, validatedURL: o });
  }), U ? g.loadURL(U) : g.loadFile(a.join(L(), "index.html"));
}
E.handle("ai:load-models", async (e, t) => {
  const { baseUrl: n, apiKey: o, customHeaders: r } = T(t), d = await fetch(`${A(n)}/models`, {
    method: "GET",
    headers: x({ apiKey: o, customHeaders: r, accept: "application/json" }),
    cache: "no-store"
  });
  return $(d);
});
E.handle("ai:send-chat", async (e, t) => {
  const { baseUrl: n, apiKey: o, customHeaders: r, payload: d } = T(t), h = await fetch(`${A(n)}/chat/completions`, {
    method: "POST",
    headers: x({
      apiKey: o,
      customHeaders: r,
      contentType: "application/json",
      accept: "application/json"
    }),
    body: JSON.stringify(d),
    cache: "no-store"
  });
  return $(h);
});
E.handle("ai:cancel-stream", (e, t) => {
  var n;
  (n = R.get(t)) == null || n.abort(), R.delete(t);
});
E.handle("ai:stream-chat", async (e, t, n) => {
  const { baseUrl: o, apiKey: r, customHeaders: d, payload: h } = T(n), l = new AbortController();
  R.set(t, l);
  let p, u;
  try {
    let v = function(i) {
      const c = z(i);
      c && (p = c);
      const s = G(i);
      s && (u = s);
      const _ = M(i);
      _ && e.sender.send(`ai:stream-delta:${t}`, {
        type: "reasoning",
        delta: _
      });
      const D = K(i);
      D && e.sender.send(`ai:stream-delta:${t}`, {
        type: "content",
        delta: D
      });
    }, j = function(i) {
      const c = i.trim();
      if (!(!c || c === "[DONE]"))
        try {
          v(JSON.parse(c));
        } catch {
        }
    }, S = function(i) {
      const s = i.trimEnd().trimStart();
      if (!(!s || s.startsWith(":"))) {
        if (s.startsWith("data:")) {
          j(s.slice(5).trimStart());
          return;
        }
        s.startsWith("{") && j(s);
      }
    };
    const y = await fetch(`${A(o)}/chat/completions`, {
      method: "POST",
      headers: x({
        apiKey: r,
        customHeaders: d,
        contentType: "application/json",
        accept: "text/event-stream"
      }),
      body: JSON.stringify(h),
      cache: "no-store",
      signal: l.signal
    });
    if (!y.ok) {
      const i = await y.text();
      throw new Error(i || `Provider returned ${y.status}`);
    }
    if (!y.body)
      throw new Error("Provider response did not include a readable stream.");
    const W = y.body.getReader(), V = new TextDecoder();
    let m = "";
    for (; ; ) {
      const { value: i, done: c } = await W.read();
      m += V.decode(i, { stream: !c });
      const s = m.split(/\r?\n/);
      m = s.pop() ?? "";
      for (const _ of s)
        S(_);
      if (c) break;
    }
    return m.trim() && S(m), { usage: p, finishReason: u };
  } finally {
    R.delete(t);
  }
});
f.on("window-all-closed", () => {
  process.platform !== "darwin" && (f.quit(), g = null);
});
f.on("activate", () => {
  O.getAllWindows().length === 0 && C();
});
f.whenReady().then(C);
export {
  ee as MAIN_DIST,
  I as RENDERER_DIST,
  U as VITE_DEV_SERVER_URL
};
