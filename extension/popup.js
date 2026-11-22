import { getSettings } from "./settings.js";

const $ = (id) => document.getElementById(id);
const FIELDS = ["auto", "scanLinks", "scale", "format", "maxPages"];

const settings = await getSettings();
for (const f of FIELDS) {
  const el = $(f);
  if (el.type === "checkbox") el.checked = !!settings[f];
  else el.value = settings[f];
  el.addEventListener("change", () => {
    const v = el.type === "checkbox" ? el.checked : el.type === "number" ? Number(el.value) : el.value;
    chrome.storage.sync.set({ [f]: v });
  });
}

const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

$("captureTab").onclick = async () => {
  const r = await chrome.runtime.sendMessage({ target: "background", type: "captureTab", url: tab.url, tabId: tab.id });
  $("msg").textContent = r?.error ? `Erreur : ${r.error}` : "Capture lancée…";
};
$("captureLinks").onclick = async () => {
  const r = await chrome.runtime.sendMessage({ target: "background", type: "captureLinks", tabId: tab.id });
  $("msg").textContent = r?.error ? `Erreur : ${r.error}` : `${r.count} PDF trouvé(s) dans la page.`;
};

async function renderHistory() {
  const { history = [] } = await chrome.storage.session.get("history");
  $("history").innerHTML = "";
  for (const h of history) {
    const li = document.createElement("li");
    const name = decodeURIComponent(h.url.split("/").pop().split("?")[0]) || h.url;
    li.textContent = name;
    const s = document.createElement("small");
    s.textContent = ` — ${h.state} (${h.done}/${h.total || "?"} pages)`;
    li.append(s);
    li.title = h.url;
    $("history").append(li);
  }
  if (!history.length) $("history").innerHTML = "<li><small>Aucune capture pour l'instant.</small></li>";
}
renderHistory();
chrome.storage.session.onChanged.addListener(renderHistory);
