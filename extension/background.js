import { getSettings } from "./settings.js";

const PDF_URL_RE = /\.pdf($|[?#])/i;
const recent = new Map();      // url -> timestamp (anti-doublon)
const jobs = new Map();        // jobId -> {url, folder, ext, done, total}
let jobCounter = 0;

// ---------- Détection automatique ----------

// 1) Réponses HTTP servies en application/pdf (onglet, iframe, <embed>/<object>)
chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (details.method !== "GET" || details.statusCode >= 400) return;
    const ct = (details.responseHeaders || []).find((h) => h.name.toLowerCase() === "content-type");
    if (ct && /application\/(x-)?pdf/i.test(ct.value || "")) {
      autoCapture(details.url, details.tabId);
    }
  },
  { urls: ["http://*/*", "https://*/*"], types: ["main_frame", "sub_frame", "object"] },
  ["responseHeaders"]
);

// 2) Onglet chargé : URL en .pdf, ou scan des liens PDF de la page
chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (info.status !== "complete" || !tab.url || !/^https?:/i.test(tab.url)) return;
  if (PDF_URL_RE.test(tab.url)) return autoCapture(tab.url, tabId);
  const settings = await getSettings();
  if (settings.auto && settings.scanLinks) captureLinkedPdfs(tabId, settings);
});

async function autoCapture(url, tabId) {
  const settings = await getSettings();
  if (!settings.auto) return;
  startCapture(url, tabId, settings);
}

// ---------- Capture ----------

async function startCapture(url, tabId, settings, { force = false } = {}) {
  const now = Date.now();
  if (!force && recent.has(url) && now - recent.get(url) < 5 * 60 * 1000) return null;
  recent.set(url, now);

  const jobId = `job${++jobCounter}`;
  const ext = settings.format === "jpeg" ? "jpg" : "png";
  jobs.set(jobId, { url, tabId, folder: buildFolder(url, settings.folder), ext, done: 0, total: 0 });
  await log({ jobId, url, state: "en cours", done: 0, total: 0 });

  await ensureOffscreen();
  const msg = {
    target: "offscreen",
    type: "render",
    jobId,
    url,
    scale: Number(settings.scale) || 2,
    format: settings.format,
    maxPages: Number(settings.maxPages) || 300
  };
  // Le document offscreen peut mettre quelques ms à charger : on réessaie.
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      if (await chrome.runtime.sendMessage(msg)) return jobId;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  await log({ jobId, url, state: "erreur : moteur de rendu indisponible", done: 0, total: 0 });
  return jobId;
}

async function captureLinkedPdfs(tabId, settings, force = false) {
  let links = [];
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const out = new Set();
        document.querySelectorAll("a[href], iframe[src], embed[src], object[data]").forEach((el) => {
          const raw = el.href || el.src || el.data;
          try {
            const u = new URL(raw, location.href);
            if (/^https?:$/.test(u.protocol) && /\.pdf$/i.test(u.pathname)) out.add(u.href.split("#")[0]);
          } catch {}
        });
        return [...out];
      }
    });
    links = res?.result || [];
  } catch (e) {
    return 0; // page protégée (chrome://, web store…)
  }
  links = links.slice(0, settings.maxLinks);
  for (const url of links) await startCapture(url, tabId, settings, { force });
  return links.length;
}

// ---------- Messages (offscreen + popup) ----------

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.target !== "background") return;
  handle(msg).then(sendResponse, (e) => sendResponse({ error: String(e?.message || e) }));
  return true;
});

async function handle(msg) {
  switch (msg.type) {
    case "page": {
      const job = jobs.get(msg.jobId);
      if (!job) return {};
      job.total = msg.total;
      const n = String(msg.index).padStart(3, "0");
      await chrome.downloads.download({
        url: msg.dataUrl,
        filename: `${job.folder}/page-${n}.${job.ext}`,
        conflictAction: "uniquify",
        saveAs: false
      });
      job.done++;
      setBadge(job.tabId, `${job.done}`);
      await log({ jobId: msg.jobId, url: job.url, state: "en cours", done: job.done, total: job.total });
      return {};
    }
    case "done": {
      const job = jobs.get(msg.jobId);
      if (!job) return {};
      const state = msg.error ? `erreur : ${msg.error}` : "terminé";
      await log({ jobId: msg.jobId, url: job.url, state, done: job.done, total: job.total, folder: job.folder });
      setBadge(job.tabId, msg.error ? "!" : "✓", msg.error ? "#c62828" : "#2e7d32");
      jobs.delete(msg.jobId);
      return {};
    }
    case "captureTab": {
      const settings = await getSettings();
      return { jobId: await startCapture(msg.url, msg.tabId, settings, { force: true }) };
    }
    case "captureLinks": {
      const settings = await getSettings();
      return { count: await captureLinkedPdfs(msg.tabId, settings, true) };
    }
  }
  return {};
}

// ---------- Utilitaires ----------

async function ensureOffscreen() {
  const url = chrome.runtime.getURL("offscreen.html");
  const existing = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"], documentUrls: [url] });
  if (existing.length) return;
  try {
    await chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: ["WORKERS", "BLOBS"],
      justification: "Rendu des pages PDF en images avec pdf.js"
    });
  } catch (e) {
    if (!String(e).includes("single offscreen")) throw e;
  }
}

function buildFolder(url, root) {
  const u = new URL(url);
  const host = clean(u.hostname) || "site";
  let name = decodeURIComponent(u.pathname.split("/").pop() || "document").replace(/\.pdf$/i, "");
  name = clean(name) || "document";
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return `${clean(root) || "Captures-PDF"}/${host}/${name}_${stamp}`;
}

function clean(s) {
  return String(s).replace(/[<>:"/\\|?*\x00-\x1f~]/g, "_").replace(/^[.\s]+|[.\s]+$/g, "").slice(0, 80);
}

function setBadge(tabId, text, color = "#1565c0") {
  if (tabId == null || tabId < 0) return;
  chrome.action.setBadgeText({ tabId, text }).catch(() => {});
  chrome.action.setBadgeBackgroundColor({ tabId, color }).catch(() => {});
}

async function log(entry) {
  const { history = [] } = await chrome.storage.session.get("history");
  const i = history.findIndex((h) => h.jobId === entry.jobId && h.url === entry.url);
  if (i >= 0) history[i] = { ...history[i], ...entry };
  else history.unshift({ ...entry, at: Date.now() });
  await chrome.storage.session.set({ history: history.slice(0, 30) });
}
