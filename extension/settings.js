export const DEFAULTS = {
  auto: true,          // capture automatique dès qu'un PDF est ouvert
  scanLinks: false,    // capture aussi les PDF liés dans les pages visitées
  scale: 2,            // résolution (1 = 72 dpi, 2 = 144 dpi, 3 = 216 dpi)
  format: "png",       // "png" ou "jpeg"
  maxPages: 300,       // limite de pages par PDF
  maxLinks: 20,        // limite de PDF liés capturés par page
  folder: "Captures-PDF"
};

export async function getSettings() {
  const s = await chrome.storage.sync.get(DEFAULTS);
  return { ...DEFAULTS, ...s };
}
