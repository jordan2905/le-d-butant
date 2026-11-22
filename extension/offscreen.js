import * as pdfjsLib from "./lib/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("lib/pdf.worker.min.mjs");

const queue = [];
let busy = false;

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.target !== "offscreen" || msg.type !== "render") return;
  queue.push(msg);
  sendResponse(true);
  next();
});

async function next() {
  if (busy || !queue.length) return;
  busy = true;
  const job = queue.shift();
  try {
    await render(job);
    await send({ type: "done", jobId: job.jobId });
  } catch (e) {
    await send({ type: "done", jobId: job.jobId, error: String(e?.message || e) });
  } finally {
    busy = false;
    next();
  }
}

async function render({ jobId, url, scale, format, maxPages }) {
  const resp = await fetch(url, { credentials: "include" });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = new Uint8Array(await resp.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const total = Math.min(pdf.numPages, maxPages);
  const mime = format === "jpeg" ? "image/jpeg" : "image/png";

  for (let i = 1; i <= total; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // intent "print" : pas de requestAnimationFrame (inactif dans un document invisible)
    await page.render({ canvasContext: ctx, viewport, intent: "print" }).promise;
    const dataUrl = canvas.toDataURL(mime, 0.92);
    await send({ type: "page", jobId, index: i, total, dataUrl });
    page.cleanup();
    canvas.width = canvas.height = 0;
  }
  await pdf.destroy();
}

function send(msg) {
  return chrome.runtime.sendMessage({ target: "background", ...msg });
}
