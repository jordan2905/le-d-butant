/**
 * ============================================================================
 *  RSI & ALERTES v2 — module à ajouter au classeur « watchlist_auto »
 * ============================================================================
 *  Fonctionne avec le fichier Yahoo_Zones.gs (à coller aussi, voir README.md).
 *
 *  - Watchlist : RSI journalier (formule live), zone RSI, seuils perso,
 *    RSI hebdomadaire et croisements MM50/MM200 (mis à jour chaque soir).
 *  - Zones_PRT : tes zones ProRealTime + alerte d'approche, ⭐ confluence,
 *    taille de position et stop calculés selon ton capital et ton risque.
 *  - Mes_positions : tes lignes CTO / PEA, plus-value, alertes stop / objectif.
 *  - Contrôle chaque soir : e-mail + Telegram, journal des alertes.
 *
 *  Pas de fonction onOpen ici : ton menu « Zones mensuelles » existant reste.
 * ============================================================================
 */

const RSI_CFG = {
  ONGLET_WATCHLIST: 'Watchlist',
  ONGLET_PARAMS: 'Paramètres',
  ONGLET_ZONES: 'Zones_PRT',
  ONGLET_POSITIONS: 'Mes_positions',
  ONGLET_JOURNAL: 'Journal_alertes',
  ONGLET_DIAG: 'Diagnostic_tickers',
  ONGLET_ETAT: '_etat_alertes',
  ENTETE_RSI: 'RSI (J)',
  ENTETE_ZONE_RSI: 'Zone RSI',
  ENTETE_BAS: 'Seuil RSI bas (perso)',
  ENTETE_HAUT: 'Seuil RSI haut (perso)',
  ENTETE_RSI_H: 'RSI (H)',
  ENTETE_CROIS: 'MM50 / MM200',
  NB_LIGNES: 150,
  JOURS_HISTORIQUE: 300,
};

// [nom, valeur par défaut, explication, format]
const RSI_PARAMS = [
  ['RSI - Période', 14, 'Nombre de séances du RSI (14 = standard, identique à ProRealTime)', '0'],
  ['RSI - Seuil bas (survente)', 30, 'Alerte quand le RSI descend à ce niveau ou en dessous. Remplaçable valeur par valeur dans la Watchlist', '0'],
  ['RSI - Seuil haut (surachat)', 70, 'Alerte quand le RSI monte à ce niveau ou au-dessus. Remplaçable valeur par valeur dans la Watchlist', '0'],
  ['Zones PRT - Seuil d\'approche', 0.03, 'Alerte quand le prix est à moins de ce % d\'une zone ProRealTime (remplaçable zone par zone)', '0.0%'],
  ['Confluence - RSI maximum', 40, '⭐ Confluence = zone d\'achat PRT atteinte ou proche + RSI journalier ≤ ce niveau + prix au-dessus de la MM200', '0'],
  ['Alerte - Sorties de survente / surachat', 'Oui', 'Alerte le jour où le RSI repasse au-dessus du seuil bas (ou sous le seuil haut)', '@'],
  ['Alerte - RSI hebdomadaire', 'Oui', 'Alerte quand le RSI hebdo passe en survente / surachat (mêmes seuils)', '@'],
  ['Alerte - Croisements MM50 / MM200', 'Oui', 'Golden cross (MM50 passe au-dessus de la MM200) et death cross (en dessous)', '@'],
  ['Alerte - Zones mensuelles', 'Oui', 'Alerte quand l\'onglet Zones signale un prix proche ou dans une zone mensuelle', '@'],
  ['Position - Capital (€)', 10000, 'Capital servant au calcul de la taille de position dans Zones_PRT', '#,##0'],
  ['Position - Risque par trade', 0.01, 'Perte maximale acceptée si le stop est touché, en % du capital', '0.0%'],
  ['Position - Marge du stop sous la zone', 0.01, 'Le stop est placé ce % sous le bas de la zone d\'achat', '0.0%'],
  ['Portefeuille - Seuil stop / objectif', 0.03, 'Alerte quand une position est à moins de ce % de son stop ou de son objectif', '0.0%'],
  ['Zones mensuelles - Amplitude min.', 0.2, 'Un sommet / creux mensuel compte s\'il est suivi d\'un mouvement d\'au moins ce % en 12 mois', '0%'],
  ['Zones mensuelles - Regroupement', 0.04, 'Les sommets / creux à moins de ce % les uns des autres forment une même zone', '0.0%'],
  ['Alerte - Heure du contrôle', 18, 'Heure (0 à 23) du contrôle quotidien. 18 h = après la clôture de Paris (17 h 30). Après modification : menu > Activer l\'alerte quotidienne', '0'],
  ['Alerte - E-mail', '', 'Vide = ton adresse Google. Plusieurs adresses : séparées par des virgules', '@'],
  ['Alerte - E-mail même sans nouveauté', 'Non', 'Oui = récap envoyé chaque soir. Non = e-mail seulement s\'il y a une NOUVELLE alerte', '@'],
  ['Alerte - Contrôle le week-end', 'Non', 'Oui = contrôle aussi le samedi et le dimanche', '@'],
];

const RSI_GROUPES = [
  ['conf', '⭐ Confluences (zone d\'achat + RSI bas + tendance de fond haussière)'],
  ['pos', '💼 Mes positions'],
  ['prt', '🎯 Zones ProRealTime'],
  ['zm', '🗓️ Zones mensuelles'],
  ['crois', '✂️ Croisements (RSI et moyennes mobiles)'],
  ['rsi', '📈 RSI journalier'],
  ['rsih', '📅 RSI hebdomadaire'],
];

/* ============================== INSTALLATION ============================== */

/** À exécuter UNE fois depuis l'éditeur Apps Script. Ré-exécutable sans risque. */
function installerRsiAlertes() {
  const ss = SpreadsheetApp.getActive();
  rsiAssurerParams_(ss);
  rsiInstallerColonnes();
  rsiCreerOngletZones();
  rsiCreerOngletPositions();
  rsiOnglet_(ss, RSI_CFG.ONGLET_JOURNAL, ['Date', 'Type', 'Ticker', 'Société', 'Détail', 'Valeur']);
  rsiActiverAlerte();
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'rsiAjouterMenu')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('rsiAjouterMenu').forSpreadsheet(ss).onOpen().create();
  rsiAjouterMenu();
  ss.toast('Installation terminée ✅ Prochaine étape : menu 📊 RSI & Alertes', 'RSI & Alertes', 8);
}

function rsiAjouterMenu() {
  SpreadsheetApp.getUi().createMenu('📊 RSI & Alertes')
    .addItem('🔔 Contrôler maintenant (et envoyer les alertes)', 'rsiControleMaintenant')
    .addSeparator()
    .addItem('🩺 Diagnostic des tickers en erreur', 'diagnostiquerTickers')
    .addItem('✅ Appliquer les corrections cochées', 'appliquerCorrectionsTickers')
    .addItem('🗓️ Recalculer les zones mensuelles (v2, Yahoo)', 'zonesMensuellesV2')
    .addSeparator()
    .addItem('📱 Configurer Telegram', 'rsiConfigurerTelegram')
    .addItem('📱 Désactiver Telegram', 'rsiDesactiverTelegram')
    .addItem('⏰ Activer l\'alerte quotidienne', 'rsiActiverAlerte')
    .addItem('🔕 Désactiver l\'alerte quotidienne', 'rsiDesactiverAlerte')
    .addSeparator()
    .addItem('Mettre à jour les colonnes RSI (après ajout de valeurs)', 'rsiInstallerColonnes')
    .addItem('Créer / réparer l\'onglet Zones_PRT', 'rsiCreerOngletZones')
    .addItem('Créer / réparer l\'onglet Mes_positions', 'rsiCreerOngletPositions')
    .addItem('Remettre à zéro l\'historique des alertes', 'rsiRazEtat')
    .addToUi();
}

/** Colonnes RSI à droite de la Watchlist (ré-exécutable). */
function rsiInstallerColonnes() {
  const ss = SpreadsheetApp.getActive();
  const p = rsiAssurerParams_(ss);
  const sh = ss.getSheetByName(RSI_CFG.ONGLET_WATCHLIST);
  if (!sh) throw new Error('Onglet « ' + RSI_CFG.ONGLET_WATCHLIST + ' » introuvable.');
  let w = rsiLireEntetes_(sh);
  const ajouter = noms => {
    const c = sh.getLastColumn() + 1;
    if (sh.getMaxColumns() < c + noms.length - 1) sh.insertColumnsAfter(sh.getMaxColumns(), c + noms.length - 1 - sh.getMaxColumns());
    sh.getRange(w.ligne, c, 1, noms.length).setValues([noms]);
    sh.getRange(w.ligne, w.col['Ticker']).copyTo(sh.getRange(w.ligne, c, 1, noms.length), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
    w = rsiLireEntetes_(sh);
  };
  if (!w.col[RSI_CFG.ENTETE_RSI]) {
    ajouter([RSI_CFG.ENTETE_RSI, RSI_CFG.ENTETE_ZONE_RSI, RSI_CFG.ENTETE_BAS, RSI_CFG.ENTETE_HAUT]);
    sh.getRange(w.ligne, w.col[RSI_CFG.ENTETE_BAS], 1, 2).setNote('Laisse vide pour utiliser les seuils de l\'onglet Paramètres.');
  }
  if (!w.col[RSI_CFG.ENTETE_RSI_H]) {
    ajouter([RSI_CFG.ENTETE_RSI_H, RSI_CFG.ENTETE_CROIS]);
    sh.getRange(w.ligne, w.col[RSI_CFG.ENTETE_RSI_H], 1, 2).setNote('Mis à jour chaque soir par le contrôle quotidien (données Yahoo Finance).');
  }

  const cRsi = w.col[RSI_CFG.ENTETE_RSI];
  const premiere = w.ligne + 1;
  const nb = Math.max(sh.getMaxRows() - w.ligne, 1);
  const rParam = n => rsiRefParam_(p, n);

  sh.getRange(premiere, cRsi, nb, 1)
    .setFormulaR1C1(rsiFormuleRsi_('RC' + w.col['Ticker'], rParam('RSI - Période')))
    .setNumberFormat('0.0').setHorizontalAlignment('center');
  sh.getRange(premiere, cRsi + 1, nb, 1).setFormulaR1C1(
    '=IF(NOT(ISNUMBER(RC[-1])),"",' +
    'IF(RC[-1]<=IF(ISNUMBER(RC[1]),RC[1],' + rParam('RSI - Seuil bas (survente)') + '),"🟢 Survente",' +
    'IF(RC[-1]>=IF(ISNUMBER(RC[2]),RC[2],' + rParam('RSI - Seuil haut (surachat)') + '),"🔴 Surachat","")))'
  ).setHorizontalAlignment('center');
  sh.getRange(premiere, w.col[RSI_CFG.ENTETE_RSI_H], nb, 2).setHorizontalAlignment('center');
  sh.getRange(premiere, w.col[RSI_CFG.ENTETE_RSI_H], nb, 1).setNumberFormat('0.0');

  const zoneRsi = sh.getRange(premiere, cRsi + 1, nb, 1);
  const crois = sh.getRange(premiere, w.col[RSI_CFG.ENTETE_CROIS], nb, 1);
  const nosCols = [cRsi + 1, w.col[RSI_CFG.ENTETE_CROIS]];
  const regles = sh.getConditionalFormatRules().filter(r => !r.getRanges().some(rg => nosCols.indexOf(rg.getColumn()) >= 0));
  const regle = (plage, txt, fond, texte) => SpreadsheetApp.newConditionalFormatRule()
    .whenTextContains(txt).setBackground(fond).setFontColor(texte).setRanges([plage]).build();
  regles.push(
    regle(zoneRsi, 'Survente', '#d9ead3', '#274e13'), regle(zoneRsi, 'Surachat', '#f4cccc', '#660000'),
    regle(crois, 'Golden', '#d9ead3', '#274e13'), regle(crois, 'Death', '#f4cccc', '#660000'));
  sh.setConditionalFormatRules(regles);
  SpreadsheetApp.flush();
  ss.toast('Colonnes RSI à jour.', 'RSI & Alertes', 5);
}

/** Onglet Zones_PRT. Ne touche pas aux zones déjà saisies (colonnes A, C-F, K, L, N). */
function rsiCreerOngletZones() {
  const ss = SpreadsheetApp.getActive();
  const p = rsiAssurerParams_(ss);
  let sh = ss.getSheetByName(RSI_CFG.ONGLET_ZONES);
  const nouveau = !sh;
  if (nouveau) sh = ss.insertSheet(RSI_CFG.ONGLET_ZONES);
  const d = 5, n = RSI_CFG.NB_LIGNES;
  if (sh.getMaxRows() < d + n) sh.insertRowsAfter(sh.getMaxRows(), d + n - sh.getMaxRows());
  if (sh.getMaxColumns() < 20) sh.insertColumnsAfter(sh.getMaxColumns(), 20 - sh.getMaxColumns());

  sh.getRange('A1').setValue('🎯 MES ZONES PROREALTIME — alerte d\'approche, confluence et taille de position').setFontSize(14).setFontWeight('bold');
  sh.getRange('A2:T2').merge().setValue(
    'À saisir (cases jaunes) : Ticker (format Google Finance, ex. EPA:MC), Sens (Achat = zone sous le prix, Vente = zone au-dessus), ' +
    'Zone basse / Zone haute (une seule valeur = une ligne de prix), Objectif (facultatif, pour le ratio gain/risque). ' +
    'Seuil perso vide = seuil des Paramètres. « Pause » coupe l\'alerte. Entrée = haut de la zone, Stop = bas de la zone moins la marge : ' +
    'tu peux écraser ces deux cases par tes propres niveaux.'
  ).setWrap(true).setFontColor('#666666');
  sh.setRowHeight(2, 60);

  sh.getRange(4, 1, 1, 20).setValues([[
    'Ticker', 'Société', 'Sens', 'Zone basse', 'Zone haute', 'Seuil perso', 'Prix', 'Distance', 'Statut', 'RSI (J)',
    'Pause 🔕', 'Commentaire', '⭐', 'Objectif', 'Entrée', 'Stop', 'Taux €', 'Quantité', 'Montant €', 'Gain / risque',
  ]]).setFontWeight('bold').setBackground('#1f3864').setFontColor('#ffffff').setHorizontalAlignment('center').setWrap(true);
  sh.setFrozenRows(4);
  [1, 3, 4, 5, 6, 14].forEach(c => sh.getRange(d, c, n, 1).setBackground('#fffbea'));

  const R = nom => rsiRefParam_(p, nom);
  const f = (c, formule) => sh.getRange(d, c, n, 1).setFormulaR1C1(formule);
  f(2, '=IF(RC1="","",IFERROR(GOOGLEFINANCE(RC1,"name"),""))');
  f(7, '=IF(RC1="","",IFERROR(GOOGLEFINANCE(RC1,"price"),"n/d"))');
  // Distance : > 0 = prix au-dessus de la zone, 0 = dans la zone, < 0 = prix en dessous
  f(8, '=IF(OR(NOT(ISNUMBER(RC7)),NOT(ISNUMBER(RC4))),"",LET(px,RC7,' +
    'lo,MIN(RC4,IF(ISNUMBER(RC5),RC5,RC4)),hi,MAX(RC4,IF(ISNUMBER(RC5),RC5,RC4)),' +
    'IF(px>hi,px/hi-1,IF(px>=lo,0,px/lo-1))))');
  f(9, '=IF(NOT(ISNUMBER(RC8)),"",LET(dd,RC8,seu,IF(ISNUMBER(RC6),RC6,' + R("Zones PRT - Seuil d'approche") + '),' +
    'IF(dd=0,"🎯 Dans la zone",IF(RC3="Vente",' +
    'IF(dd<0,IF(-dd<=seu,"🔔 Approche","—"),"🚀 Zone dépassée"),' +
    'IF(dd>0,IF(dd<=seu,"🔔 Approche","—"),"⚠️ Zone cassée")))))');

  const wl = ss.getSheetByName(RSI_CFG.ONGLET_WATCHLIST);
  const w = wl ? rsiLireEntetes_(wl) : null;
  const refWl = nom => w && w.col[nom] ? "'" + RSI_CFG.ONGLET_WATCHLIST + "'!C" + w.col[nom] : null;
  if (refWl('Ticker') && refWl(RSI_CFG.ENTETE_RSI)) {
    f(10, '=IF(RC1="","",IFERROR(XLOOKUP(RC1,' + refWl('Ticker') + ',' + refWl(RSI_CFG.ENTETE_RSI) + '),""))');
  }
  const mm200 = refWl('MM200') ? 'IFERROR(RC7>XLOOKUP(RC1,' + refWl('Ticker') + ',' + refWl('MM200') + '),TRUE)' : 'TRUE';
  f(13, '=IF(AND(RC3<>"Vente",ISNUMBER(RC8),ISNUMBER(RC10),RC11<>TRUE),' +
    'IF(AND(OR(RC8=0,REGEXMATCH(RC9&"","Approche")),RC10<=' + R('Confluence - RSI maximum') + ',' + mm200 + '),"⭐",""),"")');
  f(15, '=IF(OR(RC3="Vente",NOT(ISNUMBER(RC4))),"",MAX(RC4,N(RC5)))');
  f(16, '=IF(NOT(ISNUMBER(RC15)),"",MIN(RC4,IF(ISNUMBER(RC5),RC5,RC4))*(1-' + R('Position - Marge du stop sous la zone') + '))');
  f(17, '=IF(RC1="","",' + rsiFormuleTaux_('IFERROR(GOOGLEFINANCE(RC1,"currency"),"EUR")') + ')');
  f(18, '=IF(OR(NOT(ISNUMBER(RC15)),NOT(ISNUMBER(RC16)),NOT(ISNUMBER(RC17)),RC15<=RC16),"",' +
    'MAX(0,MIN(INT(' + R('Position - Capital (€)') + '*' + R('Position - Risque par trade') + '/((RC15-RC16)*RC17)),' +
    'INT(' + R('Position - Capital (€)') + '/(RC15*RC17)))))');
  f(19, '=IF(NOT(ISNUMBER(RC18)),"",RC18*RC15*RC17)');
  f(20, '=IF(OR(NOT(ISNUMBER(RC14)),NOT(ISNUMBER(RC15)),NOT(ISNUMBER(RC16)),RC15<=RC16),"",ROUND((RC14-RC15)/(RC15-RC16),1))');

  sh.getRange(d, 3, n, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(['Achat', 'Vente'], true).setAllowInvalid(false).build());
  [[4, 2, '#,##0.00'], [6, 1, '0.0%'], [7, 1, '#,##0.00'], [8, 1, '+0.0%;-0.0%;0.0%'], [10, 1, '0.0'],
    [14, 3, '#,##0.00'], [17, 1, '0.0000'], [18, 1, '0'], [19, 1, '#,##0 €'], [20, 1, '0.0']]
    .forEach(([c, k, fmt]) => sh.getRange(d, c, n, k).setNumberFormat(fmt));
  if (nouveau) sh.getRange(d, 11, n, 1).insertCheckboxes();
  sh.getRange(d, 3, n, 18).setHorizontalAlignment('center');

  const statut = sh.getRange(d, 9, n, 1), etoile = sh.getRange(d, 13, n, 1);
  const regle = (plage, txt, fond, texte) => SpreadsheetApp.newConditionalFormatRule()
    .whenTextContains(txt).setBackground(fond).setFontColor(texte).setRanges([plage]).build();
  sh.setConditionalFormatRules([
    regle(statut, 'Dans la zone', '#b6d7a8', '#274e13'), regle(statut, 'Approche', '#fff2cc', '#7f6000'),
    regle(statut, 'cassée', '#f4cccc', '#660000'), regle(statut, 'dépassée', '#cfe2f3', '#073763'),
    regle(etoile, '⭐', '#ffe599', '#7f6000'),
  ]);
  [110, 170, 70, 90, 90, 75, 85, 75, 130, 60, 60, 220, 40, 85, 85, 85, 65, 75, 90, 70].forEach((wd, i) => sh.setColumnWidth(i + 1, wd));
  sh.hideColumns(17);
  if (nouveau) sh.getRange(d, 1, 1, 5).setValues([['EPA:MC', '', 'Achat', 480, 500]]); // exemple à remplacer
  ss.toast('Onglet Zones_PRT prêt.', 'RSI & Alertes', 5);
}

/** Onglet Mes_positions : tes lignes CTO / PEA. Ne touche pas aux saisies. */
function rsiCreerOngletPositions() {
  const ss = SpreadsheetApp.getActive();
  const p = rsiAssurerParams_(ss);
  let sh = ss.getSheetByName(RSI_CFG.ONGLET_POSITIONS);
  const nouveau = !sh;
  if (nouveau) sh = ss.insertSheet(RSI_CFG.ONGLET_POSITIONS);
  const d = 5, n = RSI_CFG.NB_LIGNES;
  if (sh.getMaxRows() < d + n) sh.insertRowsAfter(sh.getMaxRows(), d + n - sh.getMaxRows());
  if (sh.getMaxColumns() < 19) sh.insertColumnsAfter(sh.getMaxColumns(), 19 - sh.getMaxColumns());

  sh.getRange('A1').setValue('💼 MES POSITIONS — CTO Trade Republic & PEA Bourse Direct').setFontSize(14).setFontWeight('bold');
  sh.getRange('A2:S2').merge().setValue(
    'À saisir (cases jaunes) : Compte, Ticker (format Google Finance), Quantité, PRU (dans la devise de l\'action), et si tu veux ' +
    'Date d\'achat, Stop et Objectif. Le reste se calcule seul, en euros. Alertes : stop touché ou proche, objectif atteint ou proche, RSI en surachat.'
  ).setWrap(true).setFontColor('#666666');
  sh.setRowHeight(2, 45);
  const L = 'ROUND(SUMIF(A' + d + ':A,"CTO",L' + d + ':L),0)', M = 'ROUND(SUMIF(A' + d + ':A,"CTO",M' + d + ':M),0)';
  sh.getRange('A3').setFormula(
    '="💼 CTO : "&' + L + '&" € ("&' + M + '&" €)   ·   💰 PEA : "&' + L.replace('"CTO"', '"PEA"') + '&" € ("&' + M.replace('"CTO"', '"PEA"') +
    '&" €)   ·   📊 Total : "&ROUND(SUM(L' + d + ':L),0)&" € ("&ROUND(SUM(M' + d + ':M),0)&" €)"').setFontWeight('bold');

  sh.getRange(4, 1, 1, 19).setValues([[
    'Compte', 'Ticker', 'Société', 'Quantité', 'PRU', 'Date d\'achat', 'Stop', 'Objectif', 'Prix', 'Devise', 'Taux €',
    'Valeur €', '+/- value €', '+/- value %', 'Dist. stop', 'Dist. objectif', 'RSI (J)', 'Statut', 'Commentaire',
  ]]).setFontWeight('bold').setBackground('#1f3864').setFontColor('#ffffff').setHorizontalAlignment('center').setWrap(true);
  sh.setFrozenRows(4);
  [1, 2, 4, 5, 6, 7, 8].forEach(c => sh.getRange(d, c, n, 1).setBackground('#fffbea'));

  const R = nom => rsiRefParam_(p, nom);
  const f = (c, formule) => sh.getRange(d, c, n, 1).setFormulaR1C1(formule);
  const num = (...cs) => 'OR(' + cs.map(c => 'NOT(ISNUMBER(RC' + c + '))').join(',') + ')';
  f(3, '=IF(RC2="","",IFERROR(GOOGLEFINANCE(RC2,"name"),""))');
  f(9, '=IF(RC2="","",IFERROR(GOOGLEFINANCE(RC2,"price"),"n/d"))');
  f(10, '=IF(RC2="","",IFERROR(GOOGLEFINANCE(RC2,"currency"),"EUR"))');
  f(11, '=IF(RC2="","",' + rsiFormuleTaux_('RC10') + ')');
  f(12, '=IF(' + num(4, 9, 11) + ',"",RC4*RC9*RC11)');
  f(13, '=IF(' + num(4, 5, 9, 11) + ',"",RC4*(RC9-RC5)*RC11)');
  f(14, '=IF(' + num(5, 9) + ',"",RC9/RC5-1)');
  f(15, '=IF(' + num(7, 9) + ',"",RC9/RC7-1)');
  f(16, '=IF(' + num(8, 9) + ',"",RC9/RC8-1)');
  const wl = ss.getSheetByName(RSI_CFG.ONGLET_WATCHLIST);
  const w = wl ? rsiLireEntetes_(wl) : null;
  if (w && w.col[RSI_CFG.ENTETE_RSI]) {
    const ref = c => "'" + RSI_CFG.ONGLET_WATCHLIST + "'!C" + c;
    f(17, '=IF(RC2="","",IFERROR(XLOOKUP(RC2,' + ref(w.col['Ticker']) + ',' + ref(w.col[RSI_CFG.ENTETE_RSI]) + '),""))');
  }
  f(18, '=IF(NOT(ISNUMBER(RC9)),"",LET(seu,' + R('Portefeuille - Seuil stop / objectif') + ',haut,' + R('RSI - Seuil haut (surachat)') + ',' +
    'IF(AND(ISNUMBER(RC7),RC9<=N(RC7)),"🛑 Stop touché",' +
    'IF(AND(ISNUMBER(RC15),N(RC15)<=seu),"⚠️ Proche du stop",' +
    'IF(AND(ISNUMBER(RC8),RC9>=N(RC8)),"🎯 Objectif atteint",' +
    'IF(AND(ISNUMBER(RC16),-N(RC16)<=seu),"🔔 Proche objectif",' +
    'IF(AND(ISNUMBER(RC17),N(RC17)>=haut),"🔴 RSI surachat","")))))))');

  sh.getRange(d, 1, n, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['CTO', 'PEA'], true).build());
  [[4, 1, '0.####'], [5, 1, '#,##0.00'], [6, 1, 'dd/mm/yyyy'], [7, 3, '#,##0.00'], [11, 1, '0.0000'], [12, 2, '#,##0 €'],
    [14, 3, '+0.0%;-0.0%;0.0%'], [17, 1, '0.0']].forEach(([c, k, fmt]) => sh.getRange(d, c, n, k).setNumberFormat(fmt));
  sh.getRange(d, 1, n, 18).setHorizontalAlignment('center');
  const statut = sh.getRange(d, 18, n, 1), pv = sh.getRange(d, 13, n, 2);
  const regle = (plage, txt, fond, texte) => SpreadsheetApp.newConditionalFormatRule()
    .whenTextContains(txt).setBackground(fond).setFontColor(texte).setRanges([plage]).build();
  sh.setConditionalFormatRules([
    regle(statut, 'Stop', '#ea9999', '#660000'), regle(statut, 'Proche du stop', '#f4cccc', '#660000'),
    regle(statut, 'Objectif', '#b6d7a8', '#274e13'), regle(statut, 'surachat', '#fce5cd', '#783f04'),
    SpreadsheetApp.newConditionalFormatRule().whenNumberGreaterThan(0).setFontColor('#38761d').setRanges([pv]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenNumberLessThan(0).setFontColor('#cc0000').setRanges([pv]).build(),
  ]);
  [70, 110, 170, 75, 80, 90, 80, 80, 80, 55, 65, 90, 90, 80, 75, 85, 60, 140, 220].forEach((wd, i) => sh.setColumnWidth(i + 1, wd));
  sh.hideColumns(11);
  ss.toast('Onglet Mes_positions prêt.', 'RSI & Alertes', 5);
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
  SpreadsheetApp.getActive().toast('Les alertes en cours seront de nouveau signalées comme nouvelles.', 'RSI & Alertes', 5);
}

/* ================================ TELEGRAM ================================ */

function rsiConfigurerTelegram() {
  const ui = SpreadsheetApp.getUi();
  const r1 = ui.prompt('Telegram (1/2)',
    'Dans Telegram, ouvre la conversation @BotFather, envoie /newbot et suis les étapes (nom du robot). ' +
    'BotFather te donne un jeton (token) du type 123456:ABC-xyz… Colle-le ici :', ui.ButtonSet.OK_CANCEL);
  if (r1.getSelectedButton() !== ui.Button.OK) return;
  const token = r1.getResponseText().trim();
  ui.alert('Telegram (2/2)', 'Ouvre maintenant la conversation avec TON nouveau robot dans Telegram, appuie sur Démarrer ' +
    'et envoie-lui un message (par exemple « bonjour »). Clique ensuite sur OK.', ui.ButtonSet.OK);
  let j;
  try {
    j = JSON.parse(UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/getUpdates', { muteHttpExceptions: true }).getContentText());
  } catch (e) {
    ui.alert('Impossible de joindre Telegram : ' + e.message); return;
  }
  if (!j.ok) { ui.alert('Jeton refusé par Telegram (' + (j.description || 'erreur') + '). Recommence en copiant tout le jeton.'); return; }
  const msgs = (j.result || []).filter(u => u.message && u.message.chat);
  if (!msgs.length) { ui.alert('Le robot n\'a reçu aucun message. Envoie-lui un message puis recommence.'); return; }
  PropertiesService.getScriptProperties().setProperties({
    RSI_TG_TOKEN: token, RSI_TG_CHAT: String(msgs[msgs.length - 1].message.chat.id),
  });
  const ok = rsiTelegram_('✅ <b>Alertes de ta watchlist activées.</b>\nTu recevras ici les nouvelles alertes chaque soir.');
  ui.alert(ok ? 'Telegram configuré ✅ Un message de test vient de t\'être envoyé.' : 'Configuration enregistrée, mais l\'envoi du message de test a échoué.');
}

function rsiDesactiverTelegram() {
  PropertiesService.getScriptProperties().deleteProperty('RSI_TG_TOKEN');
  PropertiesService.getScriptProperties().deleteProperty('RSI_TG_CHAT');
  SpreadsheetApp.getActive().toast('Telegram désactivé.', 'RSI & Alertes', 5);
}

/** Envoie un message Telegram (découpé si trop long). Renvoie false si non configuré. */
function rsiTelegram_(texte) {
  const pr = PropertiesService.getScriptProperties();
  const token = pr.getProperty('RSI_TG_TOKEN'), chat = pr.getProperty('RSI_TG_CHAT');
  if (!token || !chat) return false;
  const morceaux = [];
  let cur = '';
  texte.split('\n').forEach(l => { if ((cur + l).length > 3800) { morceaux.push(cur); cur = ''; } cur += l + '\n'; });
  if (cur.trim()) morceaux.push(cur);
  let ok = true;
  morceaux.forEach(m => {
    const rep = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'post', muteHttpExceptions: true,
      payload: { chat_id: chat, text: m, parse_mode: 'HTML', disable_web_page_preview: 'true' },
    });
    ok = ok && rep.getResponseCode() === 200;
  });
  return ok;
}

/* ================================ CONTRÔLE ================================ */

function rsiControleQuotidien() {
  rsiExecuter_(false);
}

function rsiControleMaintenant() {
  const r = rsiExecuter_(true);
  SpreadsheetApp.getUi().alert('RSI & Alertes',
    r.alertes.length + ' alerte(s) en cours, dont ' + r.nouvelles.length + ' nouvelle(s).\n' +
    (r.envoye ? 'E-mail envoyé à ' + r.destinataire + '.' : 'Aucun e-mail envoyé.') +
    (r.telegram ? '\nMessage Telegram envoyé.' : '') +
    '\nDonnées Yahoo reçues pour ' + r.nbYahoo + ' valeur(s) sur ' + r.nbTickers + '.' +
    (r.nd ? '\n' + r.nd + ' valeur(s) sans RSI : lance le Diagnostic des tickers.' : ''),
    SpreadsheetApp.getUi().ButtonSet.OK);
}

function rsiExecuter_(manuel) {
  const ss = SpreadsheetApp.getActive();
  const tz = ss.getSpreadsheetTimeZone();
  const P = rsiLireParams_(ss);
  const jour = Number(Utilities.formatDate(new Date(), tz, 'u'));
  if (!manuel && jour >= 6 && !P.weekend) return { alertes: [], nouvelles: [] };

  const num = x => typeof x === 'number' && !isNaN(x);
  const wl = ss.getSheetByName(RSI_CFG.ONGLET_WATCHLIST);
  const w = rsiLireEntetes_(wl);
  const zs = ss.getSheetByName(RSI_CFG.ONGLET_ZONES);
  const ps = ss.getSheetByName(RSI_CFG.ONGLET_POSITIONS);
  const cRsi = w.col[RSI_CFG.ENTETE_RSI];
  const lignesW = rsiLireCalcule_(wl, w.ligne + 1, cRsi || w.col['Prix']);
  const lignesZ = zs ? rsiLireCalcule_(zs, 5, 7) : [];
  const lignesP = ps ? rsiLireCalcule_(ps, 5, 9) : [];
  const tkW = r => String(r[w.col['Ticker'] - 1] || '').trim();

  // 1) Données Yahoo : RSI hebdo, croisements, RSI et MM200 de secours
  const tous = lignesW.map(tkW).concat(lignesZ.map(r => String(r[0] || '').trim()), lignesP.map(r => String(r[1] || '').trim())).filter(Boolean);
  let yh = {};
  try { yh = yhIndicateursPour_(tous, P.periode); } catch (e) { console.warn('Yahoo indisponible : ' + e.message); }
  rsiEcrireColonnesYahoo_(wl, w, lignesW, yh, tz);

  // 2) Alertes
  const alertes = new Map();
  const ajouter = a => { if (!alertes.has(a.cle)) alertes.set(a.cle, a); };
  let nd = 0;
  const vus = new Set();
  const fmt = x => num(x) ? x.toFixed(1) : '?';

  lignesW.forEach(r => {
    const ticker = tkW(r);
    if (!ticker || vus.has(ticker)) return;
    vus.add(ticker);
    const ind = yh[ticker] || {};
    const rsi = cRsi && num(r[cRsi - 1]) ? r[cRsi - 1] : ind.rsiJ;
    const bas = cRsi && num(r[cRsi + 1]) ? r[cRsi + 1] : P.bas;
    const haut = cRsi && num(r[cRsi + 2]) ? r[cRsi + 2] : P.haut;
    const base = { ticker, societe: r[w.col['Société'] - 1] || ind.nom || '', prix: num(r[w.col['Prix'] - 1]) ? r[w.col['Prix'] - 1] : ind.prix };
    const hebdo = num(ind.rsiH) ? ' · RSI hebdo ' + fmt(ind.rsiH) : '';
    if (!num(rsi)) nd++;
    else if (rsi <= bas) ajouter(Object.assign({}, base, { groupe: 'rsi', cle: 'RSI_BAS|' + ticker, type: '🟢 Survente', detail: 'RSI ' + fmt(rsi) + ' ≤ ' + bas + hebdo, valeur: rsi }));
    else if (rsi >= haut) ajouter(Object.assign({}, base, { groupe: 'rsi', cle: 'RSI_HAUT|' + ticker, type: '🔴 Surachat', detail: 'RSI ' + fmt(rsi) + ' ≥ ' + haut + hebdo, valeur: rsi }));

    if (P.sorties && num(ind.rsiJ) && num(ind.rsiJ1)) {
      if (ind.rsiJ1 < bas && ind.rsiJ >= bas) ajouter(Object.assign({}, base, { groupe: 'crois', cle: 'RSI_SORT_BAS|' + ticker, type: '↗️ Sortie de survente', detail: 'RSI ' + fmt(ind.rsiJ1) + ' → ' + fmt(ind.rsiJ) + hebdo, valeur: ind.rsiJ }));
      if (ind.rsiJ1 > haut && ind.rsiJ <= haut) ajouter(Object.assign({}, base, { groupe: 'crois', cle: 'RSI_SORT_HAUT|' + ticker, type: '↘️ Sortie de surachat', detail: 'RSI ' + fmt(ind.rsiJ1) + ' → ' + fmt(ind.rsiJ) + hebdo, valeur: ind.rsiJ }));
    }
    if (P.hebdo && num(ind.rsiH)) {
      if (ind.rsiH <= P.bas) ajouter(Object.assign({}, base, { groupe: 'rsih', cle: 'RSIH_BAS|' + ticker, type: '🟢 Survente hebdo', detail: 'RSI hebdo ' + fmt(ind.rsiH) + ' ≤ ' + P.bas, valeur: ind.rsiH }));
      else if (ind.rsiH >= P.haut) ajouter(Object.assign({}, base, { groupe: 'rsih', cle: 'RSIH_HAUT|' + ticker, type: '🔴 Surachat hebdo', detail: 'RSI hebdo ' + fmt(ind.rsiH) + ' ≥ ' + P.haut, valeur: ind.rsiH }));
    }
    if (P.croisMM && ind.croisement && ind.croisement.seances <= 3) {
      const c = ind.croisement, golden = c.type === 'golden';
      ajouter(Object.assign({}, base, {
        groupe: 'crois', cle: 'MM_' + c.type + '|' + ticker + '|' + Utilities.formatDate(c.date, tz, 'yyyyMMdd'),
        type: golden ? '✨ Golden cross' : '☠️ Death cross',
        detail: 'MM50 ' + (golden ? 'au-dessus' : 'en dessous') + ' de la MM200 depuis le ' + Utilities.formatDate(c.date, tz, 'dd/MM'), valeur: '',
      }));
    }
  });

  lignesZ.forEach(r => {
    const [ticker, societe, sens, lo, hi, , prix, dist, statut, rsi, pause, , etoile] = r;
    if (!ticker || pause === true || !statut || statut === '—') return;
    const zone = hi !== '' && hi !== lo ? rsiNb_(Math.min(lo, hi)) + ' – ' + rsiNb_(Math.max(lo, hi)) : rsiNb_(lo);
    const ind = yh[String(ticker).trim()] || {};
    const rsiTxt = num(rsi) ? ' · RSI ' + fmt(rsi) : num(ind.rsiJ) ? ' · RSI ' + fmt(ind.rsiJ) : '';
    const detail = 'Zone ' + zone + ' · distance ' + (num(dist) ? (dist * 100).toFixed(1) + ' %' : '?') + rsiTxt;
    const type = statut.indexOf('Approche') >= 0 ? 'APPROCHE' : statut.indexOf('Dans') >= 0 ? 'DANS' : 'SORTIE';
    ajouter({ groupe: 'prt', cle: 'ZONE_' + type + '|' + ticker + '|' + lo + '|' + hi, type: statut + ' (' + (sens || 'Achat') + ')', ticker, societe, prix, valeur: dist, detail });
    if (etoile === '⭐') ajouter({ groupe: 'conf', cle: 'CONF|' + ticker + '|' + lo + '|' + hi, type: '⭐ Confluence', ticker, societe, prix, valeur: dist, detail: detail + ' · au-dessus de la MM200' });
  });

  const zm = P.zonesMensuelles ? ss.getSheetByName('Zones') : null;
  if (zm) {
    const v = zm.getDataRange().getValues();
    const iEnt = v.findIndex(r => /^Ticker/.test(String(r[0])));
    if (iEnt >= 0) {
      const c = {};
      v[iEnt].forEach((h, k) => { c[String(h).trim()] = k; });
      v.slice(iEnt + 1).forEach(r => {
        const sig = 'Signal' in c ? String(r[c['Signal']] || '') : '';
        if (!r[0] || !sig) return;
        const detail = [['Zone actuelle', 'Dans'], ['Support 1 haut', 'Support'], ['Résistance 1 bas', 'Résistance']]
          .filter(([h]) => h in c && r[c[h]] !== '').map(([h, lib]) => lib + ' ' + (num(r[c[h]]) ? rsiNb_(r[c[h]]) : r[c[h]])).join(' · ');
        ajouter({ groupe: 'zm', cle: 'ZM|' + sig + '|' + r[0], type: sig, ticker: r[0], societe: 'Société' in c ? r[c['Société']] : '', prix: 'Prix' in c ? r[c['Prix']] : '', valeur: '', detail });
      });
    }
  }

  lignesP.forEach(r => {
    const [compte, ticker, societe, , pru, , stop, objectif, prix, , , , pv, pvPct, , , , statut] = r;
    if (!ticker || !statut) return;
    ajouter({
      groupe: 'pos', cle: 'POS|' + statut + '|' + ticker + '|' + compte, type: statut + ' (' + (compte || '?') + ')', ticker, societe, prix, valeur: pv,
      detail: 'PRU ' + rsiNb_(pru) + (num(stop) ? ' · stop ' + rsiNb_(stop) : '') + (num(objectif) ? ' · objectif ' + rsiNb_(objectif) : '') +
        (num(pvPct) ? ' · ' + (pvPct >= 0 ? '+' : '') + (pvPct * 100).toFixed(1) + ' %' : '') + (num(pv) ? ' (' + Math.round(pv) + ' €)' : ''),
    });
  });

  // 3) Nouveautés (comparaison avec le contrôle précédent)
  const liste = Array.from(alertes.values());
  const etat = rsiOnglet_(ss, RSI_CFG.ONGLET_ETAT, null);
  etat.hideSheet();
  const avant = new Set(etat.getLastRow() ? etat.getRange(1, 1, etat.getLastRow(), 1).getValues().map(x => x[0]) : []);
  liste.forEach(a => { a.nouveau = !avant.has(a.cle); });
  const nouvelles = liste.filter(a => a.nouveau);
  etat.clearContents();
  if (liste.length) etat.getRange(1, 1, liste.length, 1).setValues(liste.map(a => [a.cle]));

  if (nouvelles.length) {
    const j = rsiOnglet_(ss, RSI_CFG.ONGLET_JOURNAL, ['Date', 'Type', 'Ticker', 'Société', 'Détail', 'Valeur']);
    const now = new Date();
    j.getRange(j.getLastRow() + 1, 1, nouvelles.length, 6).setValues(nouvelles.map(a => [now, a.type, a.ticker, a.societe, a.detail, a.valeur]));
  }

  // 4) Notifications
  const destinataire = P.email || Session.getEffectiveUser().getEmail();
  const envoyer = nouvelles.length > 0 || (P.toujours && !manuel) || (manuel && liste.length > 0);
  if (envoyer && destinataire) {
    MailApp.sendEmail({
      to: destinataire,
      subject: '📊 Watchlist — ' + nouvelles.length + ' nouvelle(s) alerte(s)' +
        (nouvelles.some(a => a.groupe === 'conf') ? ' dont ⭐ confluence' : '') + ' · ' + Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy'),
      htmlBody: rsiEmail_(ss, liste, nouvelles.length, nd, tz),
    });
  }
  let telegram = false;
  if (nouvelles.length || (P.toujours && !manuel)) telegram = rsiTelegram_(rsiTexteTelegram_(ss, nouvelles, liste.length, tz));

  return { alertes: liste, nouvelles, envoye: !!(envoyer && destinataire), destinataire, telegram, nd, nbYahoo: Object.keys(yh).length, nbTickers: new Set(tous).size };
}

/** Écrit RSI (H) et l'état MM50/MM200 dans la Watchlist. */
function rsiEcrireColonnesYahoo_(sh, w, lignes, yh, tz) {
  const cH = w.col[RSI_CFG.ENTETE_RSI_H], cX = w.col[RSI_CFG.ENTETE_CROIS];
  if (!cH || !cX || !lignes.length) return;
  const vals = lignes.map(r => {
    const ind = yh[String(r[w.col['Ticker'] - 1] || '').trim()];
    if (!ind) return [r[w.col['Ticker'] - 1] ? 'n/d' : '', ''];
    let etat = '';
    if (ind.croisement) {
      etat = (ind.croisement.type === 'golden' ? '✨ Golden cross ' : '☠️ Death cross ') + Utilities.formatDate(ind.croisement.date, tz, 'dd/MM');
    } else if (!isNaN(ind.mm50) && !isNaN(ind.mm200)) {
      etat = ind.mm50 > ind.mm200 ? 'MM50 > MM200' : 'MM50 < MM200';
    }
    return [isNaN(ind.rsiH) ? 'n/d' : Math.round(ind.rsiH * 10) / 10, etat];
  });
  sh.getRange(w.ligne + 1, cH, vals.length, 1).setValues(vals.map(v => [v[0]]));
  sh.getRange(w.ligne + 1, cX, vals.length, 1).setValues(vals.map(v => [v[1]]));
}

/* ================================= OUTILS ================================= */

/**
 * RSI de Wilder en une formule (anglais / virgules : Apps Script l'adapte à ta langue).
 * Noms sans « R » ni « C » seuls (ils seraient lus comme des références R1C1).
 */
function rsiFormuleRsi_(refTicker, refPeriode) {
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

/** Taux de conversion vers l'euro (GBX = pence). */
function rsiFormuleTaux_(refDevise) {
  return 'LET(dev,' + refDevise + ',IF(dev="EUR",1,IF(dev="GBX",IFERROR(GOOGLEFINANCE("CURRENCY:GBPEUR"),1)/100,' +
    'IFERROR(GOOGLEFINANCE("CURRENCY:"&dev&"EUR"),1))))';
}

function rsiRefParam_(p, nom) {
  if (!p[nom]) throw new Error('Paramètre manquant : ' + nom);
  return "'" + RSI_CFG.ONGLET_PARAMS + "'!R" + p[nom].ligne + 'C2';
}

/** Lit un onglet en attendant que GOOGLEFINANCE ait fini de charger (colonne témoin). */
function rsiLireCalcule_(sh, premiere, colTemoin) {
  const nb = sh.getLastRow() - premiere + 1;
  if (nb < 1) return [];
  let v = [];
  for (let essai = 0; essai < 6; essai++) {
    SpreadsheetApp.flush();
    v = sh.getRange(premiere, 1, nb, sh.getLastColumn()).getValues();
    if (!v.some(r => /loading|chargement/i.test(String(r[colTemoin - 1])))) break;
    Utilities.sleep(15000);
  }
  return v;
}

function rsiLireEntetes_(sh) {
  const v = sh.getRange(1, 1, Math.min(15, Math.max(1, sh.getLastRow())), Math.max(1, sh.getLastColumn())).getValues();
  for (let i = 0; i < v.length; i++) {
    if (v[i].indexOf('Ticker') >= 0) {
      const col = {};
      v[i].forEach((h, k) => { if (h !== '') col[String(h).trim()] = k + 1; });
      return { ligne: i + 1, col };
    }
  }
  throw new Error('En-tête « Ticker » introuvable dans l\'onglet ' + sh.getName());
}

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
      if (p[1] === 'Oui' || p[1] === 'Non') sh.getRange(ligne, 2).setDataValidation(
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
  const oui = n => String(v(n, 'Non')).trim().toLowerCase() === 'oui';
  return {
    periode: Number(v('RSI - Période', 14)),
    bas: Number(v('RSI - Seuil bas (survente)', 30)),
    haut: Number(v('RSI - Seuil haut (surachat)', 70)),
    seuilProximite: Number(v('Seuil de proximité', 0.03)),
    zmAmplitude: Number(v('Zones mensuelles - Amplitude min.', 0.2)),
    zmRegroupement: Number(v('Zones mensuelles - Regroupement', 0.04)),
    heure: Math.min(23, Math.max(0, Math.floor(Number(v('Alerte - Heure du contrôle', 18))))),
    email: String(v('Alerte - E-mail', '')).trim(),
    toujours: oui('Alerte - E-mail même sans nouveauté'),
    weekend: oui('Alerte - Contrôle le week-end'),
    sorties: oui('Alerte - Sorties de survente / surachat'),
    hebdo: oui('Alerte - RSI hebdomadaire'),
    croisMM: oui('Alerte - Croisements MM50 / MM200'),
    zonesMensuelles: oui('Alerte - Zones mensuelles'),
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

function rsiEsc_(s) {
  return String(s === undefined || s === null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

function rsiEmail_(ss, alertes, nbNouvelles, nd, tz) {
  const esc = rsiEsc_;
  const tableau = (titre, liste) => !liste.length ? '' :
    '<h3 style="margin:18px 0 6px">' + titre + ' (' + liste.length + ')</h3>' +
    '<table cellpadding="6" style="border-collapse:collapse;font:13px Arial">' +
    '<tr style="background:#1f3864;color:#fff"><th></th><th align="left">Valeur</th><th>Prix</th><th align="left">Signal</th><th align="left">Détail</th></tr>' +
    liste.sort((a, b) => b.nouveau - a.nouveau).map(a =>
      '<tr style="border-bottom:1px solid #ddd;' + (a.nouveau ? 'background:#fff8e1;font-weight:bold' : '') + '">' +
      '<td>' + (a.nouveau ? '🆕' : '') + '</td>' +
      '<td>' + esc(a.societe) + '<br><span style="color:#888;font-weight:normal">' + esc(a.ticker) + '</span></td>' +
      '<td align="right">' + (typeof a.prix === 'number' ? rsiNb_(a.prix) : '') + '</td>' +
      '<td>' + esc(a.type) + '</td><td>' + esc(a.detail) + '</td></tr>').join('') +
    '</table>';
  return '<div style="font:14px Arial;color:#222">' +
    '<p><b>' + nbNouvelles + '</b> nouvelle(s) alerte(s) — ' + alertes.length + ' en cours au total (' +
    Utilities.formatDate(new Date(), tz, "dd/MM/yyyy 'à' HH:mm") + ').</p>' +
    RSI_GROUPES.map(([g, titre]) => tableau(titre, alertes.filter(a => a.groupe === g))).join('') +
    (alertes.length ? '' : '<p>Rien à signaler aujourd\'hui.</p>') +
    (nd ? '<p style="color:#a00">' + nd + ' valeur(s) sans RSI : menu 📊 RSI & Alertes > Diagnostic des tickers.</p>' : '') +
    '<p><a href="' + ss.getUrl() + '">Ouvrir le classeur</a></p>' +
    '<p style="color:#888;font-size:11px">Données GOOGLEFINANCE et Yahoo Finance (différées). Outil d\'aide à la décision, pas un conseil en investissement.</p></div>';
}

function rsiTexteTelegram_(ss, nouvelles, total, tz) {
  const lignes = ['📊 <b>Watchlist · ' + Utilities.formatDate(new Date(), tz, 'dd/MM HH:mm') + '</b>',
    nouvelles.length + ' nouvelle(s) alerte(s), ' + total + ' en cours.'];
  RSI_GROUPES.forEach(([g, titre]) => {
    const l = nouvelles.filter(a => a.groupe === g);
    if (!l.length) return;
    lignes.push('', '<b>' + rsiEsc_(titre) + '</b>');
    l.forEach(a => lignes.push('• <b>' + rsiEsc_(a.societe || a.ticker) + '</b> ' + rsiEsc_(a.type) +
      (typeof a.prix === 'number' ? ' · ' + rsiNb_(a.prix) : '') + '\n   ' + rsiEsc_(a.detail)));
  });
  lignes.push('', '<a href="' + ss.getUrl() + '">Ouvrir le classeur</a>');
  return lignes.join('\n');
}

function rsiNb_(x) {
  return typeof x === 'number' ? x.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(x);
}
