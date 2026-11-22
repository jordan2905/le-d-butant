/**
 * ============================================================================
 *  RSI & ALERTES — module à ajouter au classeur « watchlist_auto »
 * ============================================================================
 *  Ce que fait ce fichier :
 *   1. Ajoute à l'onglet Watchlist une colonne « RSI (J) » (RSI journalier de
 *      Wilder, 14 séances par défaut, même calcul que ProRealTime), une colonne
 *      « Zone RSI » et deux colonnes de seuils personnalisés par valeur.
 *   2. Crée l'onglet « Zones_PRT » où tu recopies tes zones d'achat / de vente
 *      ProRealTime. Le prix, la distance et le statut se calculent tout seuls.
 *   3. Chaque soir (18 h par défaut, réglable), contrôle le RSI et les zones,
 *      t'envoie un e-mail récapitulatif et note tout dans « Journal_alertes ».
 *
 *  Installation : voir README.md (coller ce fichier dans Extensions > Apps
 *  Script, puis exécuter une seule fois la fonction installerRsiAlertes).
 *  Ce fichier ne remplace rien : il n'a pas de fonction onOpen, donc ton menu
 *  « Zones mensuelles » existant continue de fonctionner.
 * ============================================================================
 */

const RSI_CFG = {
  ONGLET_WATCHLIST: 'Watchlist',
  ONGLET_PARAMS: 'Paramètres',
  ONGLET_ZONES: 'Zones_PRT',
  ONGLET_JOURNAL: 'Journal_alertes',
  ONGLET_ETAT: '_etat_alertes',
  ENTETE_RSI: 'RSI (J)',
  ENTETE_ZONE_RSI: 'Zone RSI',
  ENTETE_BAS: 'Seuil RSI bas (perso)',
  ENTETE_HAUT: 'Seuil RSI haut (perso)',
  ZONES_LIGNE_ENTETE: 4,
  ZONES_NB_LIGNES: 150,
  JOURS_HISTORIQUE: 300, // jours calendaires téléchargés pour le RSI (~200 séances)
};

// [nom du paramètre, valeur par défaut, explication, format]
const RSI_PARAMS = [
  ['RSI - Période', 14, 'Nombre de séances du RSI (14 = standard, identique à ProRealTime)', '0'],
  ['RSI - Seuil bas (survente)', 30, 'Alerte quand le RSI descend à ce niveau ou en dessous. Remplaçable valeur par valeur dans la Watchlist', '0'],
  ['RSI - Seuil haut (surachat)', 70, 'Alerte quand le RSI monte à ce niveau ou au-dessus. Remplaçable valeur par valeur dans la Watchlist', '0'],
  ['Zones PRT - Seuil d\'approche', 0.03, 'Alerte quand le prix est à moins de ce % d\'une zone ProRealTime (remplaçable zone par zone)', '0.0%'],
  ['Alerte - Heure du contrôle', 18, 'Heure (0 à 23) du contrôle quotidien. 18 h = après la clôture de Paris (17 h 30). Après modification : menu RSI & Alertes > Activer l\'alerte quotidienne', '0'],
  ['Alerte - E-mail', '', 'Vide = ton adresse Google. Plusieurs adresses : séparées par des virgules', '@'],
  ['Alerte - E-mail même sans nouveauté', 'Non', 'Oui = récap envoyé chaque soir. Non = e-mail seulement s\'il y a une NOUVELLE alerte', '@'],
  ['Alerte - Contrôle le week-end', 'Non', 'Oui = contrôle aussi le samedi et le dimanche', '@'],
];

/* ============================== INSTALLATION ============================== */

/** À exécuter UNE fois depuis l'éditeur Apps Script. Ré-exécutable sans risque. */
function installerRsiAlertes() {
  const ss = SpreadsheetApp.getActive();
  rsiAssurerParams_(ss);
  rsiInstallerColonnes();
  rsiCreerOngletZones();
  rsiOnglet_(ss, RSI_CFG.ONGLET_JOURNAL, ['Date', 'Type', 'Ticker', 'Société', 'Détail', 'Valeur']);
  rsiActiverAlerte();
  // Menu à chaque ouverture, sans toucher à ton onOpen existant
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'rsiAjouterMenu')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('rsiAjouterMenu').forSpreadsheet(ss).onOpen().create();
  rsiAjouterMenu();
  ss.toast('RSI, zones ProRealTime et alerte quotidienne installés ✅', 'RSI & Alertes', 8);
}

/** Menu « 📊 RSI & Alertes » (déclenché à l'ouverture du classeur). */
function rsiAjouterMenu() {
  SpreadsheetApp.getUi().createMenu('📊 RSI & Alertes')
    .addItem('🔔 Contrôler maintenant (et envoyer l\'e-mail)', 'rsiControleMaintenant')
    .addSeparator()
    .addItem('Mettre à jour les colonnes RSI (après ajout de valeurs)', 'rsiInstallerColonnes')
    .addItem('Créer / réparer l\'onglet Zones_PRT', 'rsiCreerOngletZones')
    .addSeparator()
    .addItem('⏰ Activer l\'alerte quotidienne', 'rsiActiverAlerte')
    .addItem('🔕 Désactiver l\'alerte quotidienne', 'rsiDesactiverAlerte')
    .addItem('Remettre à zéro l\'historique des alertes', 'rsiRazEtat')
    .addToUi();
}

/** Ajoute (ou met à jour) les 4 colonnes RSI à droite de la Watchlist. */
function rsiInstallerColonnes() {
  const ss = SpreadsheetApp.getActive();
  const p = rsiAssurerParams_(ss);
  const sh = ss.getSheetByName(RSI_CFG.ONGLET_WATCHLIST);
  if (!sh) throw new Error('Onglet « ' + RSI_CFG.ONGLET_WATCHLIST + ' » introuvable.');
  const w = rsiLireEntetes_(sh);

  let cRsi = w.col[RSI_CFG.ENTETE_RSI];
  if (!cRsi) {
    cRsi = sh.getLastColumn() + 1;
    if (sh.getMaxColumns() < cRsi + 3) sh.insertColumnsAfter(sh.getMaxColumns(), cRsi + 3 - sh.getMaxColumns());
    sh.getRange(w.ligne, cRsi, 1, 4)
      .setValues([[RSI_CFG.ENTETE_RSI, RSI_CFG.ENTETE_ZONE_RSI, RSI_CFG.ENTETE_BAS, RSI_CFG.ENTETE_HAUT]]);
    sh.getRange(w.ligne, w.col['Ticker']).copyTo(sh.getRange(w.ligne, cRsi, 1, 4), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
    sh.getRange(w.ligne, cRsi + 2, 1, 2).setNote('Laisse vide pour utiliser les seuils de l\'onglet Paramètres.');
  }

  const premiere = w.ligne + 1;
  const nb = Math.max(sh.getMaxRows() - w.ligne, 1);
  const rParam = n => "'" + RSI_CFG.ONGLET_PARAMS + "'!R" + p[n].ligne + 'C2';

  sh.getRange(premiere, cRsi, nb, 1)
    .setFormulaR1C1(rsiFormuleRsi_('RC' + w.col['Ticker'], rParam('RSI - Période')))
    .setNumberFormat('0.0')
    .setHorizontalAlignment('center');

  // Zone RSI : utilise le seuil perso de la ligne s'il existe, sinon celui des Paramètres
  sh.getRange(premiere, cRsi + 1, nb, 1).setFormulaR1C1(
    '=IF(NOT(ISNUMBER(RC[-1])),"",' +
    'IF(RC[-1]<=IF(ISNUMBER(RC[1]),RC[1],' + rParam('RSI - Seuil bas (survente)') + '),"🟢 Survente",' +
    'IF(RC[-1]>=IF(ISNUMBER(RC[2]),RC[2],' + rParam('RSI - Seuil haut (surachat)') + '),"🔴 Surachat","")))'
  ).setHorizontalAlignment('center');

  // Couleurs de la colonne Zone RSI
  const plage = sh.getRange(premiere, cRsi + 1, nb, 1);
  const regles = sh.getConditionalFormatRules().filter(r =>
    !r.getRanges().some(rg => rg.getColumn() === cRsi + 1));
  regles.push(
    SpreadsheetApp.newConditionalFormatRule().whenTextContains('Survente')
      .setBackground('#d9ead3').setFontColor('#274e13').setRanges([plage]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextContains('Surachat')
      .setBackground('#f4cccc').setFontColor('#660000').setRanges([plage]).build()
  );
  sh.setConditionalFormatRules(regles);
  SpreadsheetApp.flush();
  ss.toast('Colonnes RSI à jour (colonne ' + rsiLettre_(cRsi) + ').', 'RSI & Alertes', 5);
}

/** Crée l'onglet Zones_PRT (tes zones ProRealTime). Ne touche pas aux zones déjà saisies. */
function rsiCreerOngletZones() {
  const ss = SpreadsheetApp.getActive();
  const p = rsiAssurerParams_(ss);
  let sh = ss.getSheetByName(RSI_CFG.ONGLET_ZONES);
  const nouveau = !sh;
  if (nouveau) sh = ss.insertSheet(RSI_CFG.ONGLET_ZONES);

  const L = RSI_CFG.ZONES_LIGNE_ENTETE, d = L + 1, n = RSI_CFG.ZONES_NB_LIGNES;
  if (sh.getMaxRows() < L + n) sh.insertRowsAfter(sh.getMaxRows(), L + n - sh.getMaxRows());

  sh.getRange('A1').setValue('🎯 MES ZONES PROREALTIME — alerte quand le prix approche').setFontSize(14).setFontWeight('bold');
  sh.getRange('A2').setValue(
    'Saisis : Ticker (format Google Finance, ex. EPA:MC), Sens (Achat = zone sous le prix, Vente = zone au-dessus), ' +
    'Zone basse et Zone haute (une seule valeur = une ligne de prix). Le reste se calcule seul. ' +
    'Seuil perso vide = seuil de l\'onglet Paramètres. Coche « Pause » pour couper l\'alerte d\'une zone.'
  ).setWrap(true).setFontColor('#666666');
  sh.getRange('A2:L2').merge();
  sh.setRowHeight(2, 48);

  sh.getRange(L, 1, 1, 12).setValues([[
    'Ticker', 'Société', 'Sens', 'Zone basse', 'Zone haute', 'Seuil perso',
    'Prix', 'Distance', 'Statut', 'RSI (J)', 'Pause 🔕', 'Commentaire'
  ]]).setFontWeight('bold').setBackground('#1f3864').setFontColor('#ffffff').setHorizontalAlignment('center');
  sh.setFrozenRows(L);

  const seuil = "'" + RSI_CFG.ONGLET_PARAMS + "'!R" + p["Zones PRT - Seuil d'approche"].ligne + 'C2';
  sh.getRange(d, 2, n, 1).setFormulaR1C1('=IF(RC1="","",IFERROR(GOOGLEFINANCE(RC1,"name"),""))');
  sh.getRange(d, 7, n, 1).setFormulaR1C1('=IF(RC1="","",IFERROR(GOOGLEFINANCE(RC1,"price"),"n/d"))');
  // Distance : > 0 = prix au-dessus de la zone, 0 = dans la zone, < 0 = prix en dessous
  sh.getRange(d, 8, n, 1).setFormulaR1C1(
    '=IF(OR(NOT(ISNUMBER(RC7)),NOT(ISNUMBER(RC4))),"",LET(px,RC7,' +
    'lo,MIN(RC4,IF(ISNUMBER(RC5),RC5,RC4)),hi,MAX(RC4,IF(ISNUMBER(RC5),RC5,RC4)),' +
    'IF(px>hi,px/hi-1,IF(px>=lo,0,px/lo-1))))');
  sh.getRange(d, 9, n, 1).setFormulaR1C1(
    '=IF(NOT(ISNUMBER(RC8)),"",LET(dd,RC8,seu,IF(ISNUMBER(RC6),RC6,' + seuil + '),' +
    'IF(dd=0,"🎯 Dans la zone",IF(RC3="Vente",' +
    'IF(dd<0,IF(-dd<=seu,"🔔 Approche","—"),"🚀 Zone dépassée"),' +
    'IF(dd>0,IF(dd<=seu,"🔔 Approche","—"),"⚠️ Zone cassée")))))');

  // RSI repris de la Watchlist (si la valeur y est suivie)
  const wl = ss.getSheetByName(RSI_CFG.ONGLET_WATCHLIST);
  if (wl) {
    const w = rsiLireEntetes_(wl);
    if (w.col[RSI_CFG.ENTETE_RSI]) {
      const ref = c => "'" + RSI_CFG.ONGLET_WATCHLIST + "'!C" + c;
      sh.getRange(d, 10, n, 1).setFormulaR1C1(
        '=IF(RC1="","",IFERROR(XLOOKUP(RC1,' + ref(w.col['Ticker']) + ',' + ref(w.col[RSI_CFG.ENTETE_RSI]) + '),""))');
    }
  }

  sh.getRange(d, 3, n, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(['Achat', 'Vente'], true).setAllowInvalid(false).build());
  sh.getRange(d, 4, n, 2).setNumberFormat('#,##0.00');
  sh.getRange(d, 6, n, 1).setNumberFormat('0.0%');
  sh.getRange(d, 7, n, 1).setNumberFormat('#,##0.00');
  sh.getRange(d, 8, n, 1).setNumberFormat('+0.0%;-0.0%;0.0%');
  sh.getRange(d, 10, n, 1).setNumberFormat('0.0');
  if (nouveau) sh.getRange(d, 11, n, 1).insertCheckboxes();
  sh.getRange(d, 3, n, 9).setHorizontalAlignment('center');

  const statut = sh.getRange(d, 9, n, 1);
  const regle = (txt, fond, texte) => SpreadsheetApp.newConditionalFormatRule()
    .whenTextContains(txt).setBackground(fond).setFontColor(texte).setRanges([statut]).build();
  sh.setConditionalFormatRules([
    regle('Dans la zone', '#b6d7a8', '#274e13'),
    regle('Approche', '#fff2cc', '#7f6000'),
    regle('cassée', '#f4cccc', '#660000'),
    regle('dépassée', '#cfe2f3', '#073763'),
  ]);

  [110, 170, 70, 95, 95, 85, 90, 80, 140, 70, 70, 260].forEach((wd, i) => sh.setColumnWidth(i + 1, wd));
  if (nouveau) sh.getRange(d, 1, 1, 5).setValues([['EPA:MC', '', 'Achat', 480, 500]]); // exemple à remplacer
  ss.toast('Onglet Zones_PRT prêt. Recopie tes zones ProRealTime.', 'RSI & Alertes', 6);
}

function rsiActiverAlerte() {
  const ss = SpreadsheetApp.getActive();
  const P = rsiLireParams_(ss);
  rsiDesactiverAlerte(true);
  ScriptApp.newTrigger('rsiControleQuotidien').timeBased()
    .everyDays(1).atHour(P.heure).nearMinute(5).inTimezone(ss.getSpreadsheetTimeZone()).create();
  ss.toast('Contrôle chaque jour vers ' + P.heure + ' h (' + ss.getSpreadsheetTimeZone() + ').', 'RSI & Alertes', 6);
}

function rsiDesactiverAlerte(silencieux) {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'rsiControleQuotidien')
    .forEach(t => ScriptApp.deleteTrigger(t));
  if (silencieux !== true) SpreadsheetApp.getActive().toast('Alerte quotidienne désactivée.', 'RSI & Alertes', 5);
}

function rsiRazEtat() {
  const sh = SpreadsheetApp.getActive().getSheetByName(RSI_CFG.ONGLET_ETAT);
  if (sh) sh.clearContents();
  SpreadsheetApp.getActive().toast('Toutes les alertes en cours seront de nouveau signalées comme nouvelles.', 'RSI & Alertes', 5);
}

/* ================================ CONTRÔLE ================================ */

/** Appelée par le déclencheur horaire. */
function rsiControleQuotidien() {
  rsiExecuter_(false);
}

/** Menu : contrôle immédiat. */
function rsiControleMaintenant() {
  const r = rsiExecuter_(true);
  SpreadsheetApp.getUi().alert('RSI & Alertes',
    r.alertes.length + ' alerte(s) en cours, dont ' + r.nouvelles.length + ' nouvelle(s).\n' +
    (r.envoye ? 'E-mail envoyé à ' + r.destinataire + '.' : 'Aucun e-mail envoyé.') +
    (r.nd ? '\n' + r.nd + ' valeur(s) sans RSI (ticker à vérifier).' : ''),
    SpreadsheetApp.getUi().ButtonSet.OK);
}

function rsiExecuter_(manuel) {
  const ss = SpreadsheetApp.getActive();
  const tz = ss.getSpreadsheetTimeZone();
  const P = rsiLireParams_(ss);
  const jour = Number(Utilities.formatDate(new Date(), tz, 'u')); // 1 = lundi … 7 = dimanche
  if (!manuel && jour >= 6 && !P.weekend) return { alertes: [], nouvelles: [], envoye: false, nd: 0 };

  const alertes = [];
  let nd = 0;

  // --- RSI de la Watchlist ---
  const wl = ss.getSheetByName(RSI_CFG.ONGLET_WATCHLIST);
  const w = rsiLireEntetes_(wl);
  const cRsi = w.col[RSI_CFG.ENTETE_RSI];
  if (cRsi) {
    const lignes = rsiLireCalcule_(wl, w.ligne + 1, cRsi);
    lignes.forEach(r => {
      const ticker = String(r[w.col['Ticker'] - 1] || '').trim();
      if (!ticker) return;
      const rsi = r[cRsi - 1];
      if (typeof rsi !== 'number') { nd++; return; }
      const bas = typeof r[cRsi + 1] === 'number' ? r[cRsi + 1] : P.bas;
      const haut = typeof r[cRsi + 2] === 'number' ? r[cRsi + 2] : P.haut;
      const base = { ticker, societe: r[w.col['Société'] - 1] || '', prix: r[w.col['Prix'] - 1], valeur: rsi };
      if (rsi <= bas) alertes.push(Object.assign(base, { cle: 'RSI_BAS|' + ticker, type: '🟢 RSI survente', detail: 'RSI ' + rsi.toFixed(1) + ' ≤ ' + bas }));
      else if (rsi >= haut) alertes.push(Object.assign(base, { cle: 'RSI_HAUT|' + ticker, type: '🔴 RSI surachat', detail: 'RSI ' + rsi.toFixed(1) + ' ≥ ' + haut }));
    });
  }

  // --- Zones ProRealTime ---
  const zs = ss.getSheetByName(RSI_CFG.ONGLET_ZONES);
  if (zs) {
    rsiLireCalcule_(zs, RSI_CFG.ZONES_LIGNE_ENTETE + 1, 7).forEach(r => {
      const [ticker, societe, sens, lo, hi, , prix, dist, statut, rsi, pause] = r;
      if (!ticker || pause === true || !statut || statut === '—') return;
      const zone = hi !== '' && hi !== lo ? rsiNb_(Math.min(lo, hi)) + ' – ' + rsiNb_(Math.max(lo, hi)) : rsiNb_(lo);
      const type = statut.indexOf('Approche') >= 0 ? 'APPROCHE' : statut.indexOf('Dans') >= 0 ? 'DANS' : 'SORTIE';
      alertes.push({
        cle: 'ZONE_' + type + '|' + ticker + '|' + lo + '|' + hi,
        type: statut + ' (' + (sens || 'Achat') + ')',
        ticker, societe, prix, valeur: dist,
        detail: 'Zone ' + zone + ' — distance ' + (typeof dist === 'number' ? (dist * 100).toFixed(1) + ' %' : '?') +
          (typeof rsi === 'number' ? ' — RSI ' + rsi.toFixed(1) : ''),
      });
    });
  }

  // --- Nouveautés (comparaison avec la veille) ---
  const etat = rsiOnglet_(ss, RSI_CFG.ONGLET_ETAT, null);
  etat.hideSheet();
  const avant = new Set(etat.getLastRow() ? etat.getRange(1, 1, etat.getLastRow(), 1).getValues().map(x => x[0]) : []);
  const nouvelles = alertes.filter(a => !avant.has(a.cle));
  alertes.forEach(a => { a.nouveau = !avant.has(a.cle); });
  etat.clearContents();
  if (alertes.length) etat.getRange(1, 1, alertes.length, 1).setValues(alertes.map(a => [a.cle]));

  // --- Journal ---
  if (nouvelles.length) {
    const j = rsiOnglet_(ss, RSI_CFG.ONGLET_JOURNAL, ['Date', 'Type', 'Ticker', 'Société', 'Détail', 'Valeur']);
    const now = new Date();
    j.getRange(j.getLastRow() + 1, 1, nouvelles.length, 6)
      .setValues(nouvelles.map(a => [now, a.type, a.ticker, a.societe, a.detail, a.valeur]));
  }

  // --- E-mail ---
  const destinataire = P.email || Session.getEffectiveUser().getEmail();
  const envoyer = nouvelles.length > 0 || (P.toujours && !manuel) || (manuel && alertes.length > 0);
  if (envoyer && destinataire) {
    MailApp.sendEmail({
      to: destinataire,
      subject: '📊 Watchlist — ' + nouvelles.length + ' nouvelle(s) alerte(s) · ' + Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy'),
      htmlBody: rsiEmail_(ss, alertes, nouvelles.length, nd, tz),
    });
  }
  return { alertes, nouvelles, envoye: !!(envoyer && destinataire), destinataire, nd };
}

/* ================================= OUTILS ================================= */

/**
 * RSI de Wilder en une formule (anglais / virgules : Apps Script l'adapte à ta langue).
 * Clôtures journalières GOOGLEFINANCE + cours actuel en dernier point (s'il a bougé),
 * moyenne simple sur p séances puis lissage de Wilder : moy = (moy × (p−1) + x) / p.
 */
function rsiFormuleRsi_(refTicker, refPeriode) {
  // Noms courts sans « R » ni « C » seuls (ils seraient lus comme des références R1C1).
  return '=IF(' + refTicker + '="","",IFERROR(LET(' +
    'tk,' + refTicker + ',per,' + refPeriode + ',' +
    'hist,GOOGLEFINANCE(tk,"close",TODAY()-' + RSI_CFG.JOURS_HISTORIQUE + ',TODAY()),' +
    'clo,FILTER(INDEX(hist,,2),ISNUMBER(INDEX(hist,,2)),IFERROR(INT(INDEX(hist,,1))<TODAY(),FALSE)),' +
    'px,GOOGLEFINANCE(tk,"price"),' +
    'aj,AND(WEEKDAY(TODAY(),2)<6,ISNUMBER(px),px<>INDEX(clo,ROWS(clo))),' +
    'ser,CHOOSEROWS(VSTACK(clo,IFERROR(px,0)),SEQUENCE(ROWS(clo)+aj)),' +
    'nb,ROWS(ser)-1,' +
    'ecart,MAP(CHOOSEROWS(ser,SEQUENCE(nb,1,2)),CHOOSEROWS(ser,SEQUENCE(nb)),LAMBDA(x,y,x-y)),' +
    'hausse,MAP(ecart,LAMBDA(x,MAX(x,0))),' +
    'baisse,MAP(ecart,LAMBDA(x,MAX(-x,0))),' +
    'moyh,REDUCE(AVERAGE(CHOOSEROWS(hausse,SEQUENCE(per))),CHOOSEROWS(hausse,SEQUENCE(nb-per,1,per+1)),LAMBDA(acc,x,(acc*(per-1)+x)/per)),' +
    'moyb,REDUCE(AVERAGE(CHOOSEROWS(baisse,SEQUENCE(per))),CHOOSEROWS(baisse,SEQUENCE(nb-per,1,per+1)),LAMBDA(acc,x,(acc*(per-1)+x)/per)),' +
    'IF(moyb=0,100,ROUND(100-100/(1+moyh/moyb),1))),"n/d"))';
}

/** Lit un onglet en attendant que GOOGLEFINANCE ait fini de charger (colonne témoin). */
function rsiLireCalcule_(sh, premiere, colTemoin) {
  const nb = sh.getLastRow() - premiere + 1;
  if (nb < 1) return [];
  let v = [];
  for (let essai = 0; essai < 6; essai++) {
    SpreadsheetApp.flush();
    v = sh.getRange(premiere, 1, nb, sh.getLastColumn()).getValues();
    const enCours = v.filter(r => /loading|chargement/i.test(String(r[colTemoin - 1]))).length;
    if (!enCours) break;
    Utilities.sleep(15000);
  }
  return v;
}

/** Trouve la ligne d'en-tête (celle qui contient « Ticker ») et l'index de chaque colonne. */
function rsiLireEntetes_(sh) {
  const v = sh.getRange(1, 1, Math.min(15, sh.getLastRow()), sh.getLastColumn()).getValues();
  for (let i = 0; i < v.length; i++) {
    const j = v[i].indexOf('Ticker');
    if (j >= 0) {
      const col = {};
      v[i].forEach((h, k) => { if (h !== '') col[String(h).trim()] = k + 1; });
      return { ligne: i + 1, col };
    }
  }
  throw new Error('En-tête « Ticker » introuvable dans l\'onglet ' + sh.getName());
}

/** Ajoute les paramètres manquants à l'onglet Paramètres et renvoie {nom: {ligne, valeur}}. */
function rsiAssurerParams_(ss) {
  const sh = ss.getSheetByName(RSI_CFG.ONGLET_PARAMS) || rsiOnglet_(ss, RSI_CFG.ONGLET_PARAMS, ['Paramètre', 'Valeur', 'Explication']);
  const lire = () => {
    const m = {};
    const n = sh.getLastRow();
    if (n) sh.getRange(1, 1, n, 2).getValues().forEach((r, i) => { if (r[0] !== '') m[String(r[0]).trim()] = { ligne: i + 1, valeur: r[1] }; });
    return m;
  };
  let m = lire();
  const manquants = RSI_PARAMS.filter(p => !m[p[0]]);
  if (manquants.length) {
    let ligne = sh.getLastRow() + 2;
    if (!m['— RSI & ALERTES —']) sh.getRange(ligne - 1, 1).setValue('— RSI & ALERTES —').setFontWeight('bold');
    manquants.forEach(p => {
      sh.getRange(ligne, 1, 1, 3).setValues([[p[0], p[1], p[2]]]);
      sh.getRange(ligne, 2).setNumberFormat(p[3]).setBackground('#fff2cc');
      if (p[1] === 'Non') sh.getRange(ligne, 2).setDataValidation(
        SpreadsheetApp.newDataValidation().requireValueInList(['Oui', 'Non'], true).build());
      ligne++;
    });
    m = lire();
  }
  return m;
}

function rsiLireParams_(ss) {
  const m = rsiAssurerParams_(ss);
  const v = (n, def) => (m[n] && m[n].valeur !== '' ? m[n].valeur : def);
  const oui = x => String(x).trim().toLowerCase() === 'oui';
  return {
    bas: Number(v('RSI - Seuil bas (survente)', 30)),
    haut: Number(v('RSI - Seuil haut (surachat)', 70)),
    heure: Math.min(23, Math.max(0, Math.floor(Number(v('Alerte - Heure du contrôle', 18))))),
    email: String(v('Alerte - E-mail', '')).trim(),
    toujours: oui(v('Alerte - E-mail même sans nouveauté', 'Non')),
    weekend: oui(v('Alerte - Contrôle le week-end', 'Non')),
  };
}

function rsiOnglet_(ss, nom, entetes) {
  let sh = ss.getSheetByName(nom);
  if (!sh) {
    sh = ss.insertSheet(nom);
    if (entetes) {
      sh.getRange(1, 1, 1, entetes.length).setValues([entetes]).setFontWeight('bold').setBackground('#1f3864').setFontColor('#ffffff');
      sh.setFrozenRows(1);
    }
  }
  return sh;
}

function rsiEmail_(ss, alertes, nbNouvelles, nd, tz) {
  const esc = s => String(s === undefined || s === null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const tableau = (titre, liste) => !liste.length ? '' :
    '<h3 style="margin:18px 0 6px">' + titre + '</h3>' +
    '<table cellpadding="6" style="border-collapse:collapse;font:13px Arial">' +
    '<tr style="background:#1f3864;color:#fff"><th></th><th align="left">Valeur</th><th>Prix</th><th align="left">Signal</th><th align="left">Détail</th></tr>' +
    liste.sort((a, b) => b.nouveau - a.nouveau).map(a =>
      '<tr style="border-bottom:1px solid #ddd;' + (a.nouveau ? 'background:#fff8e1;font-weight:bold' : '') + '">' +
      '<td>' + (a.nouveau ? '🆕' : '') + '</td>' +
      '<td>' + esc(a.societe) + '<br><span style="color:#888;font-weight:normal">' + esc(a.ticker) + '</span></td>' +
      '<td align="right">' + (typeof a.prix === 'number' ? rsiNb_(a.prix) : '') + '</td>' +
      '<td>' + esc(a.type) + '</td><td>' + esc(a.detail) + '</td></tr>').join('') +
    '</table>';
  const zones = alertes.filter(a => a.cle.indexOf('ZONE_') === 0);
  const rsi = alertes.filter(a => a.cle.indexOf('RSI_') === 0);
  return '<div style="font:14px Arial;color:#222">' +
    '<p><b>' + nbNouvelles + '</b> nouvelle(s) alerte(s) — ' + alertes.length + ' en cours au total (' +
    Utilities.formatDate(new Date(), tz, "dd/MM/yyyy 'à' HH:mm") + ').</p>' +
    tableau('🎯 Zones ProRealTime', zones) +
    tableau('📈 RSI journalier', rsi) +
    (alertes.length ? '' : '<p>Rien à signaler aujourd\'hui.</p>') +
    (nd ? '<p style="color:#a00">' + nd + ' valeur(s) sans RSI : ticker à vérifier dans la Watchlist.</p>' : '') +
    '<p><a href="' + ss.getUrl() + '">Ouvrir le classeur</a></p>' +
    '<p style="color:#888;font-size:11px">Données GOOGLEFINANCE (différées d\'environ 20 min). Outil d\'aide à la décision, pas un conseil en investissement.</p></div>';
}

function rsiNb_(x) {
  return typeof x === 'number' ? x.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(x);
}

function rsiLettre_(c) {
  let s = '';
  while (c > 0) { const r = (c - 1) % 26; s = String.fromCharCode(65 + r) + s; c = Math.floor((c - 1) / 26); }
  return s;
}
