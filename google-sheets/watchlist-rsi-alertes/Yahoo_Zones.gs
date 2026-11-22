/**
 * ============================================================================
 *  YAHOO FINANCE (source de secours) · DIAGNOSTIC DES TICKERS · ZONES MENSUELLES v2
 * ============================================================================
 *  À coller dans un 2e fichier du même projet Apps Script (voir README.md).
 *  - Données Yahoo Finance : historique journalier (RSI hebdo, croisements de
 *    moyennes, RSI de secours) et mensuel (zones mensuelles), sans GOOGLEFINANCE.
 *  - Diagnostic : trouve le bon ticker des valeurs en erreur et le corrige.
 *  - Zones mensuelles v2 : remplace le calcul de l'onglet « Zones » qui échoue.
 * ============================================================================
 */

// Préfixe Google Finance → suffixe Yahoo
const YH_SUFFIXES = {
  EPA: '.PA', ENXTPA: '.PA', AMS: '.AS', ENXTAM: '.AS', EBR: '.BR', ENXTBR: '.BR', ELI: '.LS', ENXTLS: '.LS',
  BIT: '.MI', BME: '.MC', VIE: '.VI', LON: '.L', ETR: '.DE', FRA: '.F', SWX: '.SW', VTX: '.SW', STO: '.ST',
  CPH: '.CO', HEL: '.HE', OSL: '.OL', TSE: '.TO', TYO: '.T', HKG: '.HK', ASX: '.AX', WSE: '.WA', ATH: '.AT',
  NASDAQ: '', NYSE: '', NYSEARCA: '', NYSEAMERICAN: '', BATS: '', OTCMKTS: '',
};
// Suffixe Yahoo → préfixe Google Finance (sens inverse, pour les suggestions)
const YH_VERS_GOOGLE = {
  PA: 'EPA', AS: 'AMS', BR: 'EBR', LS: 'ELI', MI: 'BIT', MC: 'BME', VI: 'VIE', L: 'LON', DE: 'ETR', F: 'FRA',
  SW: 'SWX', ST: 'STO', CO: 'CPH', HE: 'HEL', OL: 'OSL', TO: 'TSE', T: 'TYO', HK: 'HKG', AX: 'ASX', WA: 'WSE', AT: 'ATH',
};
const YH_BOURSES_US = { NMS: 'NASDAQ', NGM: 'NASDAQ', NCM: 'NASDAQ', NAS: 'NASDAQ', NYQ: 'NYSE', NYS: 'NYSE', PCX: 'NYSEARCA', ASE: 'NYSEAMERICAN', BTS: 'BATS' };

/** « EPA:MC » → « MC.PA », « NASDAQ:NVDA » → « NVDA », « NYSE:BRK.B » → « BRK-B ». */
function yhSymbole_(tickerGoogle) {
  const t = String(tickerGoogle || '').trim().toUpperCase();
  if (!t) return '';
  const i = t.indexOf(':');
  if (i < 0) return t.replace(/\./g, '-');
  const bourse = t.slice(0, i), code = t.slice(i + 1).replace(/\./g, '-');
  return bourse in YH_SUFFIXES ? code + YH_SUFFIXES[bourse] : code;
}

/** « MC.PA » → « EPA:MC » ; « NVDA » (bourse NMS) → « NASDAQ:NVDA ». */
function yhVersGoogle_(symbole, bourseYahoo) {
  const m = String(symbole).match(/^(.+)\.([A-Z]{1,2})$/);
  if (m && YH_VERS_GOOGLE[m[2]]) return YH_VERS_GOOGLE[m[2]] + ':' + m[1];
  const us = YH_BOURSES_US[bourseYahoo];
  return us ? us + ':' + String(symbole).replace(/-/g, '.') : '';
}

/**
 * Télécharge l'historique Yahoo de plusieurs tickers (par lots, en parallèle).
 * Renvoie { tickerGoogle: {t[], o[], h[], l[], c[], prix, devise, nom} | null }.
 */
function yhCharger_(tickers, periode, intervalle) {
  const res = {};
  const uniques = Array.from(new Set(tickers.map(x => String(x || '').trim()).filter(Boolean)));
  const requete = (tk, hote) => ({
    url: 'https://' + hote + '.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(yhSymbole_(tk)) +
      '?range=' + periode + '&interval=' + intervalle + '&includePrePost=false',
    muteHttpExceptions: true,
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
  });
  const passe = (liste, hote) => {
    for (let i = 0; i < liste.length; i += 20) {
      const lot = liste.slice(i, i + 20);
      let reps = [];
      try { reps = UrlFetchApp.fetchAll(lot.map(tk => requete(tk, hote))); } catch (e) { reps = []; }
      lot.forEach((tk, j) => { res[tk] = yhParser_(reps[j]); });
      Utilities.sleep(250);
    }
  };
  passe(uniques, 'query1');
  const echecs = uniques.filter(tk => !res[tk]);
  if (echecs.length) { Utilities.sleep(2000); passe(echecs, 'query2'); }
  return res;
}

function yhParser_(rep) {
  if (!rep || rep.getResponseCode() !== 200) return null;
  try {
    const r = JSON.parse(rep.getContentText()).chart.result[0];
    if (!r || !r.timestamp) return null;
    const q = r.indicators.quote[0];
    const d = { t: [], o: [], h: [], l: [], c: [], prix: r.meta.regularMarketPrice, devise: r.meta.currency, nom: r.meta.longName || r.meta.shortName || '' };
    r.timestamp.forEach((ts, i) => {
      if (q.close[i] == null || q.high[i] == null || q.low[i] == null) return;
      d.t.push(new Date(ts * 1000)); d.o.push(q.open[i]); d.h.push(q.high[i]); d.l.push(q.low[i]); d.c.push(q.close[i]);
    });
    if (!d.c.length) return null;
    if (typeof d.prix !== 'number') d.prix = d.c[d.c.length - 1];
    return d;
  } catch (e) {
    return null;
  }
}

/** Série RSI de Wilder (NaN tant qu'il n'y a pas assez de données). */
function yhRsiSerie_(c, p) {
  const out = c.map(() => NaN);
  if (c.length <= p) return out;
  let mh = 0, mb = 0;
  for (let i = 1; i <= p; i++) { const d = c[i] - c[i - 1]; mh += Math.max(d, 0); mb += Math.max(-d, 0); }
  mh /= p; mb /= p;
  out[p] = mb === 0 ? 100 : 100 - 100 / (1 + mh / mb);
  for (let i = p + 1; i < c.length; i++) {
    const d = c[i] - c[i - 1];
    mh = (mh * (p - 1) + Math.max(d, 0)) / p;
    mb = (mb * (p - 1) + Math.max(-d, 0)) / p;
    out[i] = mb === 0 ? 100 : 100 - 100 / (1 + mh / mb);
  }
  return out;
}

/** Clôtures hebdomadaires (dernière clôture de chaque semaine) à partir du journalier. */
function yhHebdo_(d) {
  const sem = [];
  let cle = null;
  d.t.forEach((t, i) => {
    const lundi = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() - (t.getUTCDay() + 6) % 7));
    const k = lundi.getTime();
    if (k !== cle) { sem.push(d.c[i]); cle = k; } else sem[sem.length - 1] = d.c[i];
  });
  return sem;
}

/** RSI J / J-1, RSI hebdo, MM50 / MM200 et dernier croisement (≤ 10 séances). */
function yhIndicateurs_(d, p) {
  const n = d.c.length;
  const r = yhRsiSerie_(d.c, p);
  const rh = yhRsiSerie_(yhHebdo_(d), p);
  const mm = (k, recul) => {
    if (n - recul < k) return NaN;
    let s = 0;
    for (let i = n - recul - k; i < n - recul; i++) s += d.c[i];
    return s / k;
  };
  let croisement = null;
  for (let k = 0; k < 10 && n >= 201 + k; k++) {
    const a50 = mm(50, k), a200 = mm(200, k), b50 = mm(50, k + 1), b200 = mm(200, k + 1);
    if (b50 <= b200 && a50 > a200) { croisement = { type: 'golden', seances: k, date: d.t[n - 1 - k] }; break; }
    if (b50 >= b200 && a50 < a200) { croisement = { type: 'death', seances: k, date: d.t[n - 1 - k] }; break; }
  }
  return {
    prix: d.prix, devise: d.devise, nom: d.nom,
    rsiJ: r[n - 1], rsiJ1: r[n - 2], rsiH: rh[rh.length - 1],
    mm50: mm(50, 0), mm200: mm(200, 0), croisement,
  };
}

/** Indicateurs Yahoo pour une liste de tickers Google (2 ans de journalier). */
function yhIndicateursPour_(tickers, periodeRsi) {
  const brut = yhCharger_(tickers, '2y', '1d');
  const res = {};
  Object.keys(brut).forEach(tk => { if (brut[tk]) res[tk] = yhIndicateurs_(brut[tk], periodeRsi); });
  return res;
}

/* ========================= DIAGNOSTIC DES TICKERS ========================= */

/** Liste les tickers en erreur (Watchlist, Zones_PRT, Mes_positions) et propose le bon. */
function diagnostiquerTickers() {
  const ss = SpreadsheetApp.getActive();
  const aVerifier = [];
  const wl = ss.getSheetByName(RSI_CFG.ONGLET_WATCHLIST);
  if (wl) {
    const w = rsiLireEntetes_(wl);
    const cRsi = w.col[RSI_CFG.ENTETE_RSI];
    const nb = wl.getLastRow() - w.ligne;
    if (nb > 0) wl.getRange(w.ligne + 1, 1, nb, wl.getLastColumn()).getValues().forEach((r, i) => {
      const tk = String(r[w.col['Ticker'] - 1] || '').trim();
      if (!tk) return;
      const prixKo = typeof r[w.col['Prix'] - 1] !== 'number';
      const rsiKo = cRsi && r[cRsi - 1] === 'n/d';
      if (prixKo || rsiKo) aVerifier.push({ onglet: wl.getName(), ligne: w.ligne + 1 + i, col: w.col['Ticker'], tk, nom: r[w.col['Société'] - 1], pb: prixKo ? 'Prix introuvable' : 'RSI introuvable' });
    });
  }
  [[RSI_CFG.ONGLET_ZONES, 1, 7, 2], [RSI_CFG.ONGLET_POSITIONS, 2, 9, 3]].forEach(([nomOnglet, cTk, cPrix, cNom]) => {
    const sh = ss.getSheetByName(nomOnglet);
    const nb = sh ? sh.getLastRow() - 4 : 0;
    if (nb > 0) sh.getRange(5, 1, nb, sh.getLastColumn()).getValues().forEach((r, i) => {
      const tk = String(r[cTk - 1] || '').trim();
      if (tk && typeof r[cPrix - 1] !== 'number') aVerifier.push({ onglet: nomOnglet, ligne: 5 + i, col: cTk, tk, nom: r[cNom - 1], pb: 'Prix introuvable' });
    });
  });

  const yh = yhCharger_(aVerifier.map(a => a.tk), '5d', '1d');
  const lignes = aVerifier.map(a => {
    const d = yh[a.tk];
    let sugg = '', sym = yhSymbole_(a.tk), prix = '', pistes = '';
    if (d) {
      prix = d.prix;
      // Ticker connu de Yahoo : on propose le format Google « propre » s'il diffère
      let propre = yhVersGoogle_(sym, '');
      if (!propre) { // action américaine sans préfixe (ex. « PLTR ») : on demande la bourse à Yahoo
        const m = yhRechercher_(sym).find(x => x.symbol === sym);
        if (m) propre = yhVersGoogle_(m.symbol, m.exchange);
      }
      sugg = propre && propre !== a.tk.toUpperCase() ? propre : '';
      pistes = 'Yahoo reconnaît ce ticker : ses données servent de secours pour le RSI et les alertes.' +
        (sugg ? '' : ' Si Google Finance échoue toujours, la valeur n\'y est peut-être pas cotée.');
    } else {
      const q = yhRechercher_(a.nom || a.tk);
      if (q.length) {
        sym = q[0].symbol; sugg = yhVersGoogle_(q[0].symbol, q[0].exchange);
        pistes = q.slice(0, 4).map(x => (yhVersGoogle_(x.symbol, x.exchange) || x.symbol) + ' (' + (x.shortname || x.longname || '') + ', ' + (x.exchDisp || x.exchange) + ')').join(' · ');
      } else {
        sym = ''; pistes = 'Aucune correspondance trouvée : vérifie le nom ou le ticker.';
      }
    }
    return [a.onglet, a.ligne, a.tk, a.nom, a.pb, sugg, sym, prix, pistes, false];
  });

  const sh = ss.getSheetByName(RSI_CFG.ONGLET_DIAG) || ss.insertSheet(RSI_CFG.ONGLET_DIAG);
  sh.clear();
  sh.getRange(1, 1).setValue('🩺 DIAGNOSTIC DES TICKERS — ' + lignes.length + ' à vérifier').setFontSize(14).setFontWeight('bold');
  sh.getRange(2, 1).setValue('Coche « Appliquer » sur les suggestions correctes, puis menu 📊 RSI & Alertes > Appliquer les corrections cochées.').setFontColor('#666666');
  sh.getRange(4, 1, 1, 10).setValues([['Onglet', 'Ligne', 'Ticker actuel', 'Société', 'Problème', 'Suggestion (Google)', 'Symbole Yahoo', 'Prix Yahoo', 'Autres pistes', 'Appliquer']])
    .setFontWeight('bold').setBackground('#1f3864').setFontColor('#ffffff');
  if (lignes.length) {
    sh.getRange(5, 1, lignes.length, 10).setValues(lignes);
    sh.getRange(5, 10, lignes.length, 1).insertCheckboxes();
    sh.getRange(5, 6, lignes.length, 1).setBackground('#fff2cc').setFontWeight('bold');
  }
  sh.setFrozenRows(4);
  [110, 50, 120, 170, 120, 150, 110, 80, 520, 75].forEach((wd, i) => sh.setColumnWidth(i + 1, wd));
  sh.activate();
  ss.toast(lignes.length + ' ticker(s) à vérifier.', 'Diagnostic', 6);
}

/** Remplace les tickers cochés par la suggestion (modifiable à la main avant). */
function appliquerCorrectionsTickers() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(RSI_CFG.ONGLET_DIAG);
  if (!sh || sh.getLastRow() < 5) return;
  const v = sh.getRange(5, 1, sh.getLastRow() - 4, 10).getValues();
  let n = 0;
  v.forEach((r, i) => {
    if (r[9] !== true || !r[5]) return;
    const cible = ss.getSheetByName(r[0]);
    if (!cible) return;
    const col = r[0] === RSI_CFG.ONGLET_WATCHLIST ? rsiLireEntetes_(cible).col['Ticker'] : (r[0] === RSI_CFG.ONGLET_POSITIONS ? 2 : 1);
    if (String(cible.getRange(r[1], col).getValue()).trim() !== String(r[2]).trim()) return; // la ligne a bougé
    cible.getRange(r[1], col).setValue(r[5]);
    sh.getRange(5 + i, 10).setValue(false);
    sh.getRange(5 + i, 5).setValue('✅ Corrigé en ' + r[5]);
    n++;
  });
  ss.toast(n + ' ticker(s) corrigé(s).', 'Diagnostic', 6);
}

function yhRechercher_(texte) {
  try {
    const rep = UrlFetchApp.fetch('https://query2.finance.yahoo.com/v1/finance/search?quotesCount=6&newsCount=0&q=' + encodeURIComponent(texte),
      { muteHttpExceptions: true, headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (rep.getResponseCode() !== 200) return [];
    return (JSON.parse(rep.getContentText()).quotes || []).filter(q => q.quoteType === 'EQUITY' || q.quoteType === 'ETF');
  } catch (e) {
    return [];
  }
}

/* ========================== ZONES MENSUELLES v2 =========================== */

/**
 * Recalcule l'onglet « Zones » avec l'historique mensuel Yahoo (tout l'historique).
 * Zone = regroupement de sommets / creux mensuels suivis d'un retournement d'au
 * moins X % (paramètre), à moins de Y % les uns des autres (paramètre).
 */
function zonesMensuellesV2() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName('Zones');
  if (!sh) throw new Error('Onglet « Zones » introuvable.');
  const P = rsiLireParams_(ss);
  const v = sh.getDataRange().getValues();
  const iEnt = v.findIndex(r => /^Ticker/.test(String(r[0])));
  if (iEnt < 0) throw new Error('En-tête « Ticker » introuvable dans l\'onglet Zones.');
  const col = {};
  v[iEnt].forEach((h, k) => { if (h !== '') col[String(h).trim()] = k; });
  const lignes = v.slice(iEnt + 1).map((r, i) => ({ ligne: iEnt + 2 + i, tk: String(r[0] || '').trim(), r }));
  const aFaire = lignes.filter(x => x.tk);
  const yh = yhCharger_(aFaire.map(x => x.tk), 'max', '1mo');
  const tz = ss.getSpreadsheetTimeZone();
  const aujourdhui = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  const details = [];

  aFaire.forEach(x => {
    const d = yh[x.tk];
    const r = x.r.slice();
    const pose = (nom, val) => { if (nom in col) r[col[nom]] = val; };
    ['Prix', 'Zone actuelle', 'Résistance 2 haut', 'Résistance 2 bas', 'Résistance 1 haut', 'Résistance 1 bas', 'Support 1 haut',
      'Support 1 bas', 'Support 2 haut', 'Support 2 bas', 'Dist. support', 'Dist. résistance', 'Signal', 'Nb zones'].forEach(n => pose(n, ''));
    pose('Calculé le', aujourdhui);
    if (!d) { pose('Statut', 'Échec Yahoo Finance : ticker à vérifier (menu Diagnostic des tickers)'); sh.getRange(x.ligne, 1, 1, r.length).setValues([r]); return; }

    const zones = zmCalculer_(d, P.zmAmplitude, P.zmRegroupement);
    const px = d.prix;
    const dedans = zones.find(z => px >= z.lo && px <= z.hi);
    const sup = zones.filter(z => z.hi < px).sort((a, b) => b.hi - a.hi);
    const res = zones.filter(z => z.lo > px).sort((a, b) => a.lo - b.lo);
    const dS = sup[0] ? px / sup[0].hi - 1 : '';
    const dR = res[0] ? px / res[0].lo - 1 : '';
    if ('Société' in col && !r[col['Société']]) pose('Société', d.nom);
    pose('Prix', px);
    pose('Zone actuelle', dedans ? rsiNb_(dedans.lo) + ' – ' + rsiNb_(dedans.hi) : '');
    if (res[1]) { pose('Résistance 2 haut', res[1].hi); pose('Résistance 2 bas', res[1].lo); }
    if (res[0]) { pose('Résistance 1 haut', res[0].hi); pose('Résistance 1 bas', res[0].lo); }
    if (sup[0]) { pose('Support 1 haut', sup[0].hi); pose('Support 1 bas', sup[0].lo); }
    if (sup[1]) { pose('Support 2 haut', sup[1].hi); pose('Support 2 bas', sup[1].lo); }
    pose('Dist. support', dS);
    pose('Dist. résistance', dR);
    pose('Signal', dedans ? '🎯 Dans une zone mensuelle'
      : (dS !== '' && dS <= P.seuilProximite) ? '🟢 Proche support mensuel'
      : (dR !== '' && -dR <= P.seuilProximite) ? '🟠 Proche résistance mensuelle' : '');
    pose('Nb zones', zones.length);
    pose('Statut', 'OK (Yahoo, ' + d.c.length + ' mois)');
    sh.getRange(x.ligne, 1, 1, r.length).setValues([r]);

    zones.slice().sort((a, b) => b.hi - a.hi).forEach(z => details.push([
      x.tk, px > z.hi ? 'En dessous du prix (support)' : px < z.lo ? 'Au-dessus du prix (résistance)' : 'Contient le prix',
      z.lo, z.hi, z.hi / z.lo - 1, z.depuis, z.visites, z.ampMax >= 0.3 ? 'Oui (' + Math.round(z.ampMax * 100) + ' %)' : 'Non (' + Math.round(z.ampMax * 100) + ' %)',
    ]));
  });

  const det = ss.getSheetByName('Zones_détail');
  if (det) {
    if (det.getLastRow() > 1) det.getRange(2, 1, det.getLastRow() - 1, Math.max(8, det.getLastColumn())).clearContent();
    if (details.length) {
      det.getRange(2, 1, details.length, 8).setValues(details);
      det.getRange(2, 3, details.length, 2).setNumberFormat('#,##0.00');
      det.getRange(2, 5, details.length, 1).setNumberFormat('0.0%');
      det.getRange(2, 6, details.length, 1).setNumberFormat('mm/yyyy');
    }
  }
  ['Dist. support', 'Dist. résistance'].forEach(n => { if (n in col) sh.getRange(iEnt + 2, col[n] + 1, lignes.length, 1).setNumberFormat('+0.0%;-0.0%;0.0%'); });
  ss.toast('Zones mensuelles recalculées (' + aFaire.length + ' valeurs).', 'Zones mensuelles v2', 6);
}

function zmCalculer_(d, ampMin, tol) {
  const n = d.c.length, k = 2, piv = [];
  for (let i = k; i < n - k; i++) {
    const hs = d.h.slice(i - k, i + k + 1), ls = d.l.slice(i - k, i + k + 1);
    const apres = Math.min(n, i + 13);
    if (d.h[i] >= Math.max.apply(null, hs)) {
      const amp = (d.h[i] - Math.min.apply(null, d.l.slice(i + 1, apres))) / d.h[i];
      if (amp >= ampMin) piv.push({ prix: d.h[i], t: d.t[i], amp });
    }
    if (d.l[i] <= Math.min.apply(null, ls) && d.l[i] > 0) {
      const amp = (Math.max.apply(null, d.h.slice(i + 1, apres)) - d.l[i]) / d.l[i];
      if (amp >= ampMin) piv.push({ prix: d.l[i], t: d.t[i], amp });
    }
  }
  piv.sort((a, b) => a.prix - b.prix);
  const zones = [];
  piv.forEach(p => {
    const z = zones[zones.length - 1];
    if (z && p.prix <= z.lo * (1 + tol)) { z.hi = Math.max(z.hi, p.prix); z.piv.push(p); }
    else zones.push({ lo: p.prix, hi: p.prix, piv: [p] });
  });
  zones.forEach(z => {
    if (z.hi / z.lo - 1 < 0.01) { const m = (z.lo + z.hi) / 2; z.lo = Math.min(z.lo, m * 0.995); z.hi = Math.max(z.hi, m * 1.005); }
    z.depuis = new Date(Math.min.apply(null, z.piv.map(p => p.t.getTime())));
    z.ampMax = Math.max.apply(null, z.piv.map(p => p.amp));
    z.visites = d.h.filter((h, i) => h >= z.lo && d.l[i] <= z.hi).length;
  });
  return zones;
}
