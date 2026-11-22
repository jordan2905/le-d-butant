/* Moteur d'analyse : indicateurs + détecteurs des configurations des 20 modules
 * de la Formation intégrale à l'analyse technique de Tradosaure.
 * Aucun accès réseau, aucune dépendance. Fonctionne dans le navigateur et sous Node.
 *
 * Une barre = { t: date (texte ou null), o, h, l, c, v (ou null) }.
 * Un signal = { module, nom, i (barre du signal), debut, dir: 'haussier'|'baissier'|'neutre',
 *               force: 1..3, texte, entree, stop, objectif, lignes: [...], points: [...] }
 */
(function (root) {
  'use strict';

  // ---------------------------------------------------------------- outils
  const nz = (x) => (Number.isFinite(x) ? x : NaN);
  const fmt = (x) => {
    if (!Number.isFinite(x)) return '—';
    const a = Math.abs(x);
    const d = a >= 1000 ? 0 : a >= 100 ? 1 : a >= 1 ? 2 : 4;
    return x.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
  };

  const pct = (f) => (Math.round(f * 1000) / 10).toLocaleString('fr-FR') + ' %';

  // ---------------------------------------------------------------- indicateurs
  function sma(a, n) {
    const r = new Array(a.length).fill(NaN);
    let s = 0, k = 0;
    for (let i = 0; i < a.length; i++) {
      s += a[i]; k++;
      if (k > n) { s -= a[i - n]; k--; }
      if (k === n) r[i] = s / n;
    }
    return r;
  }
  function ema(a, n) {
    const r = new Array(a.length).fill(NaN);
    const al = 2 / (n + 1);
    let prev = NaN, start = -1;
    for (let i = 0; i < a.length; i++) {
      if (!Number.isFinite(a[i])) continue;
      if (start < 0) start = i;
      if (i - start + 1 < n) continue;
      if (!Number.isFinite(prev)) {
        let s = 0; for (let j = i - n + 1; j <= i; j++) s += a[j];
        prev = s / n;
      } else prev = a[i] * al + prev * (1 - al);
      r[i] = prev;
    }
    return r;
  }
  function wilder(a, n) { // moyenne de Wilder (RSI, ATR)
    const r = new Array(a.length).fill(NaN);
    let prev = NaN, cnt = 0, s = 0;
    for (let i = 0; i < a.length; i++) {
      if (!Number.isFinite(a[i])) continue;
      if (!Number.isFinite(prev)) {
        s += a[i]; cnt++;
        if (cnt === n) { prev = s / n; r[i] = prev; }
      } else { prev = (prev * (n - 1) + a[i]) / n; r[i] = prev; }
    }
    return r;
  }
  function stdev(a, n) {
    const m = sma(a, n), r = new Array(a.length).fill(NaN);
    for (let i = n - 1; i < a.length; i++) {
      let s = 0; for (let j = i - n + 1; j <= i; j++) s += (a[j] - m[i]) ** 2;
      r[i] = Math.sqrt(s / n);
    }
    return r;
  }
  function highest(a, n, i) { let m = -Infinity; for (let j = Math.max(0, i - n + 1); j <= i; j++) m = Math.max(m, a[j]); return m; }
  function lowest(a, n, i) { let m = Infinity; for (let j = Math.max(0, i - n + 1); j <= i; j++) m = Math.min(m, a[j]); return m; }

  function calculer(b, p) {
    const n = b.length;
    const O = b.map((x) => x.o), H = b.map((x) => x.h), L = b.map((x) => x.l), C = b.map((x) => x.c);
    const V = b.map((x) => (Number.isFinite(x.v) ? x.v : NaN));
    const I = { O, H, L, C, V, n };
    // Moyennes mobiles
    I.mm = {};
    for (const k of p.mm) I.mm[k] = sma(C, k);
    I.mmCourte = sma(C, p.mm[0]);
    // Bollinger
    const bm = sma(C, p.bbN), bs = stdev(C, p.bbN);
    I.bbM = bm; I.bbH = bm.map((m, i) => m + p.bbK * bs[i]); I.bbB = bm.map((m, i) => m - p.bbK * bs[i]);
    I.bbLarg = bm.map((m, i) => (I.bbH[i] - I.bbB[i]) / m);
    // ATR
    const tr = C.map((c, i) => i === 0 ? H[i] - L[i] : Math.max(H[i] - L[i], Math.abs(H[i] - C[i - 1]), Math.abs(L[i] - C[i - 1])));
    I.atr = wilder(tr, 14);
    for (let i = 0; i < n; i++) if (!Number.isFinite(I.atr[i])) I.atr[i] = (H[i] - L[i]) || Math.abs(C[i]) * 0.01 || 1;
    // RSI
    const up = C.map((c, i) => i ? Math.max(0, c - C[i - 1]) : NaN), dn = C.map((c, i) => i ? Math.max(0, C[i - 1] - c) : NaN);
    const au = wilder(up, p.rsiN), ad = wilder(dn, p.rsiN);
    I.rsi = au.map((u, i) => ad[i] === 0 ? 100 : 100 - 100 / (1 + u / ad[i]));
    // MACD
    const e1 = ema(C, 12), e2 = ema(C, 26);
    I.macd = e1.map((x, i) => x - e2[i]);
    I.macdSig = ema(I.macd, 9);
    I.macdHist = I.macd.map((x, i) => x - I.macdSig[i]);
    // Stochastique lente 14,3,3
    const kRaw = C.map((c, i) => {
      if (i < p.stoN - 1) return NaN;
      const hh = highest(H, p.stoN, i), ll = lowest(L, p.stoN, i);
      return hh === ll ? 50 : (100 * (c - ll)) / (hh - ll);
    });
    I.stoK = sma(kRaw.map(nz), 3);
    I.stoD = sma(I.stoK, 3);
    // CCI 20
    const tp = C.map((c, i) => (H[i] + L[i] + c) / 3), tpm = sma(tp, 20);
    I.cci = tp.map((x, i) => {
      if (i < 19) return NaN;
      let md = 0; for (let j = i - 19; j <= i; j++) md += Math.abs(tp[j] - tpm[i]);
      md /= 20; return md === 0 ? 0 : (x - tpm[i]) / (0.015 * md);
    });
    // Momentum 10
    I.mom = C.map((c, i) => (i >= 10 ? c - C[i - 10] : NaN));
    // Ichimoku 9/26/52 (les nuages sont stockés à l'indice où ils s'affichent : +26)
    const mid = (k, i) => (i >= k - 1 ? (highest(H, k, i) + lowest(L, k, i)) / 2 : NaN);
    I.tenkan = C.map((_, i) => mid(9, i));
    I.kijun = C.map((_, i) => mid(26, i));
    I.ssa = new Array(n + 26).fill(NaN); I.ssb = new Array(n + 26).fill(NaN);
    for (let i = 0; i < n; i++) {
      I.ssa[i + 26] = (I.tenkan[i] + I.kijun[i]) / 2;
      I.ssb[i + 26] = mid(52, i);
    }
    // Volume moyen
    I.vMoy = sma(V.map((v) => (Number.isFinite(v) ? v : 0)), 20);
    I.aVolume = V.some((v) => Number.isFinite(v) && v > 0);
    // SAR parabolique
    I.sar = sarParabolique(H, L);
    // Points pivots (sommets / creux) et zigzag alterné
    I.pivots = pivots(H, L, p.pivotK);
    I.zz = zigzag(I.pivots);
    return I;
  }

  function sarParabolique(H, L, pas = 0.02, max = 0.2) {
    const n = H.length, sar = new Array(n).fill(NaN), sens = new Array(n).fill(0);
    if (n < 3) return { sar, sens };
    let hausse = H[1] > H[0], af = pas, ep = hausse ? H[1] : L[1], s = hausse ? L[0] : H[0];
    for (let i = 1; i < n; i++) {
      s = s + af * (ep - s);
      if (hausse) {
        s = Math.min(s, L[i - 1], i > 1 ? L[i - 2] : L[i - 1]);
        if (L[i] < s) { hausse = false; s = ep; ep = L[i]; af = pas; }
        else if (H[i] > ep) { ep = H[i]; af = Math.min(max, af + pas); }
      } else {
        s = Math.max(s, H[i - 1], i > 1 ? H[i - 2] : H[i - 1]);
        if (H[i] > s) { hausse = true; s = ep; ep = H[i]; af = pas; }
        else if (L[i] < ep) { ep = L[i]; af = Math.min(max, af + pas); }
      }
      sar[i] = s; sens[i] = hausse ? 1 : -1;
    }
    return { sar, sens };
  }

  // Pivots « fractals » : un sommet est plus haut que les k barres de chaque côté.
  function pivots(H, L, k) {
    const r = [];
    for (let i = k; i < H.length - k; i++) {
      let sh = true, sl = true;
      for (let j = i - k; j <= i + k; j++) {
        if (j === i) continue;
        if (H[j] > H[i] || (j > i && H[j] === H[i])) sh = false;
        if (L[j] < L[i] || (j > i && L[j] === L[i])) sl = false;
      }
      if (sh) r.push({ i, p: H[i], type: 'H', conf: i + k });
      if (sl) r.push({ i, p: L[i], type: 'B', conf: i + k });
    }
    return r.sort((a, b) => a.i - b.i || (a.type === 'H' ? -1 : 1));
  }
  // Zigzag : alternance stricte sommet / creux en gardant l'extrême.
  function zigzag(pv) {
    const z = [];
    for (const q of pv) {
      const d = z[z.length - 1];
      if (d && d.type === q.type) {
        if ((q.type === 'H' && q.p >= d.p) || (q.type === 'B' && q.p <= d.p)) z[z.length - 1] = q;
      } else if (d && d.i === q.i) {
        continue;
      } else z.push(q);
    }
    return z;
  }

  // Régression linéaire sur des points {i,p}
  function droite(pts) {
    const n = pts.length;
    if (n < 2) return null;
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (const q of pts) { sx += q.i; sy += q.p; sxx += q.i * q.i; sxy += q.i * q.p; }
    const d = n * sxx - sx * sx;
    if (d === 0) return null;
    const a = (n * sxy - sx * sy) / d, b = (sy - a * sx) / n;
    let err = 0; for (const q of pts) err = Math.max(err, Math.abs(q.p - (a * q.i + b)));
    return { a, b, err, at: (x) => a * x + b };
  }
  const ligne = (i1, p1, i2, p2, coul, tiret) => ({ i1, p1, i2, p2, coul: coul || 'accent', tiret: !!tiret });

  // ---------------------------------------------------------------- contexte de tendance
  function tendance(I, i, n = 10) {
    // -1 baisse, 1 hausse, 0 indécis : position / pente de la moyenne courte
    const m = I.mmCourte;
    if (i < n || !Number.isFinite(m[i]) || !Number.isFinite(m[i - 5])) {
      if (i < 3) return 0;
      const d = I.C[i] - I.C[Math.max(0, i - n)];
      return Math.abs(d) < I.atr[i] * 0.5 ? 0 : Math.sign(d);
    }
    const pente = m[i] - m[i - 5];
    const prix = I.C[i - 1] ?? I.C[i];
    if (pente > 0 && prix > m[i]) return 1;
    if (pente < 0 && prix < m[i]) return -1;
    const d = I.C[i] - I.C[i - n];
    return Math.abs(d) < I.atr[i] ? 0 : Math.sign(d);
  }
  // tendance AVANT la figure (barre i-1 et précédentes)
  const tendAvant = (I, i) => tendance(I, Math.max(0, i - 1));

  function cibles(I, i, dir, stop) {
    const e = I.C[i];
    const s = stop ?? (dir === 'haussier' ? e - 2 * I.atr[i] : e + 2 * I.atr[i]);
    const r = Math.abs(e - s) || I.atr[i];
    return { entree: e, stop: s, objectif: dir === 'haussier' ? e + 2 * r : e - 2 * r };
  }

  // ---------------------------------------------------------------- catalogue des modules
  const MODULES = [
    { id: 'bollinger', niveau: 1, titre: 'Les Bandes de Bollinger', regles: 'Bandes 20 périodes ± 2 écarts-types. Squeeze = largeur des bandes au plus bas des 120 dernières barres (compression avant explosion). Sortie de squeeze = clôture hors d’une bande juste après une compression. Réintégration = clôture hors bande puis retour à l’intérieur (rebond / retournement). Marche sur la bande = 3 clôtures consécutives sur ou hors de la bande (tendance forte). W de Bollinger = 1er creux sous la bande basse, 2e creux plus haut mais dans les bandes.' },
    { id: 'mm', niveau: 1, titre: 'Les Moyennes Mobiles', regles: 'MM 20, 50 et 200 (arithmétiques). Croisement doré (MM 50 passe au-dessus de la MM 200) / croisement de la mort. Croisement MM 20 / MM 50 pour le court terme. Cassure de la MM 20 par la clôture dans le sens de sa pente. Rebond sur une moyenne mobile montante (le plus bas touche la MM, la clôture reste au-dessus). Alignement prix > MM20 > MM50 > MM200 = tendance haussière installée.' },
    { id: 'ichimoku', niveau: 1, titre: 'Ichimoku Kinko Hyo', regles: 'Tenkan 9, Kijun 26, nuage SSA/SSB décalé de 26, Chikou = clôture décalée de 26. Croisement Tenkan/Kijun (fort au-dessus du nuage, faible dans ou sous le nuage). Sortie du nuage par la clôture. Signal complet = prix au-dessus du nuage + Tenkan > Kijun + Chikou au-dessus des prix d’il y a 26 barres. Twist du Kumo = croisement SSA/SSB.' },
    { id: 'canaux', niveau: 1, titre: 'Les Canaux', regles: 'Au moins 2 sommets et 2 creux reliés par deux droites parallèles (pentes proches), 90 % des clôtures contenues. Canal haussier, baissier ou horizontal (rectangle). Cassure du canal par la clôture = signal ; objectif = hauteur du canal reportée.' },
    { id: 'triangles', niveau: 1, titre: 'Les Triangles', regles: 'Deux droites qui convergent. Triangle ascendant : résistance horizontale + support montant (haussier). Triangle descendant : support horizontal + résistance descendante (baissier). Triangle symétrique : résistance descendante + support montant (continuation de la tendance précédente). Signal à la cassure ; objectif = plus grande hauteur du triangle reportée au point de cassure.' },
    { id: 'biseaux', niveau: 1, titre: 'Les Biseaux', regles: 'Deux droites convergentes de même sens. Biseau ascendant (les deux montent, le support plus vite) = figure baissière, cassure par le bas. Biseau descendant = figure haussière, cassure par le haut. Objectif = retour au point de départ du biseau.' },
    { id: 'chandeliers1', niveau: 1, titre: 'Les Chandeliers japonais – Vol. I', regles: 'Marteau / pendu (mèche basse ≥ 2× le corps, petite mèche haute), marteau inversé / étoile filante, doji, avalement haussier / baissier, harami, pénétrante / couverture en nuage noir, étoile du matin / du soir, trois soldats blancs / trois corbeaux noirs. Toujours lus selon la tendance qui précède.' },
    { id: 'chandeliers2', niveau: 2, titre: 'Les Chandeliers japonais – Vol. II', regles: 'Doji libellule / pierre tombale, toupie, marubozu, pinces (tweezers) haut et bas, trois intérieurs (harami confirmé), trois extérieurs (avalement confirmé), coup de pied (kicker), trois méthodes ascendantes / descendantes, gap Tasuki, bébé abandonné.' },
    { id: 'stomacd', niveau: 2, titre: 'Stochastique et MACD', regles: 'Stochastique lente 14-3-3 : croisement %K/%D sous 20 (achat) ou au-dessus de 80 (vente). MACD 12-26-9 : croisement de la ligne de signal (plus fort s’il a lieu du bon côté de zéro), passage de la ligne zéro. Divergences haussières / baissières entre prix et MACD ou stochastique.' },
    { id: 'elargissement', niveau: 2, titre: 'Les Figures d’élargissement', regles: 'Sommets de plus en plus hauts ET creux de plus en plus bas (droites divergentes) : marché instable, souvent en fin de tendance haussière. Variante à angle droit (un côté horizontal). Signal à la sortie de la figure.' },
    { id: 'eteepaule', niveau: 2, titre: 'L’Épaule-Tête-Épaule', regles: 'ETE : trois sommets, celui du milieu (tête) le plus haut, épaules d’altitude proche ; ligne de cou par les deux creux. Cassure de la ligne de cou = vente, objectif = hauteur tête–ligne de cou reportée. ETE inversée = même chose en creux (achat).' },
    { id: 'andrews', niveau: 2, titre: 'La Fourchette d’Andrews', regles: 'Trois pivots alternés A, B, C. Ligne médiane de A au milieu de [B, C], parallèles passant par B et C. Le prix rejoint la médiane dans la majorité des cas ; sortie de la fourchette par une parallèle = changement de rythme.' },
    { id: 'gaps', niveau: 2, titre: 'Les Gaps', regles: 'Gap = plus bas du jour au-dessus du plus haut de la veille (ou l’inverse). Gap de rupture : sortie d’une zone de congestion (souvent avec volume). Gap de continuation : au milieu d’une tendance. Gap d’épuisement : après une longue tendance, vite comblé. Île de retournement : gap dans un sens puis gap dans l’autre qui isole des barres.' },
    { id: 'oscillateurs', niveau: 3, titre: 'Momentum, RSI et CCI', regles: 'RSI 14 : sortie de survente (repasse au-dessus de 30) / de surachat (repasse sous 70), divergences. CCI 20 : franchissement de −100 à la hausse / de +100 à la baisse. Momentum 10 : passage de la ligne zéro.' },
    { id: 'fibonacci', niveau: 3, titre: 'Les Ratios de Fibonacci', regles: 'Retracements 23,6 / 38,2 / 50 / 61,8 / 78,6 % du dernier mouvement. Une correction qui s’arrête (pivot) sur 38,2–61,8 % confirme la tendance. Objectifs par extension 127,2 % et 161,8 %.' },
    { id: 'turtlesoup', niveau: 3, titre: 'Le Système Turtle Soup revisité', regles: 'Nouveau plus bas 20 barres, alors que le précédent plus bas 20 barres date d’au moins 4 barres ; la clôture revient au-dessus de l’ancien plus bas = faux cassement → achat (stop sous le nouveau plus bas). Turtle Soup +1 : la réintégration se fait la barre suivante. Version vente symétrique.' },
    { id: 'wolfe', niveau: 3, titre: 'La Vague de Wolfe', regles: 'Cinq pivots alternés 1-2-3-4-5. Haussière : 3 sous 1, 4 sous 2 mais au-dessus de 1, 5 sous 3 et sur ou sous la droite 1-3 prolongée. Entrée au point 5, objectif sur la droite 1-4 prolongée. Baissière symétrique.' },
    { id: 'dow123', niveau: 3, titre: 'Le Système 1-2-3… Dow', regles: 'Théorie de Dow : tendance haussière = sommets et creux ascendants. 1-2-3 de retournement haussier : (1) creux final d’une baisse, (2) rebond qui casse l’oblique de résistance et forme un pic, (3) creux plus haut que (1) ; le signal est la cassure du pic (2). Stop sous (3), objectif = hauteur (2)−(1) reportée. Renforcé par une divergence sur RSI au point (1). Symétrique en baisse.' },
    { id: 'sorties', niveau: 3, titre: 'Optimiser les sorties', regles: 'Stop suiveur ATR (plus haut 22 barres − 3 ATR, « chandelier exit »), SAR parabolique (0,02 / 0,2) : retournement du SAR = sortie / renversement. Risque/rendement minimal de 1:2 pour les objectifs proposés.' },
    { id: 'pivots', niveau: 3, titre: 'Les Points Pivots', regles: 'Pivot classique P = (H + B + C) / 3 de la période précédente ; R1 = 2P − B, S1 = 2P − H, R2 = P + (H − B), S2 = P − (H − B), R3, S3. Périodes semaine et mois (selon les dates, sinon blocs de 5 et 20 barres). Signal quand le prix franchit P, R1 ou S1.' },
    { id: 'chartisme', niveau: 0, titre: 'Bonus – Doubles sommets / creux, supports et Dow', regles: 'Double creux / double sommet (deux extrêmes à moins de 3 % l’un de l’autre, cassure de la ligne intermédiaire). Structure de Dow : succession de sommets et creux ascendants ou descendants.' },
  ];

  // ---------------------------------------------------------------- détecteurs
  function sig(module, nom, i, dir, force, texte, extra) {
    return Object.assign({ module, nom, i, debut: i, dir, force: Math.max(1, Math.min(3, force)), texte, lignes: [], points: [] }, extra || {});
  }

  // ------------------------------- chandeliers
  function chandeliers(b, I, out) {
    const n = b.length;
    const corps = b.map((x) => Math.abs(x.c - x.o));
    const moyCorps = sma(corps, 10);
    const mc = (i) => (Number.isFinite(moyCorps[i]) ? moyCorps[i] : corps.slice(0, i + 1).reduce((s, x) => s + x, 0) / (i + 1)) || 1e-9;
    const f = (i) => {
      const x = b[i]; const r = x.h - x.l || 1e-9; const cp = Math.abs(x.c - x.o);
      return { x, r, cp, hautC: Math.max(x.o, x.c), basC: Math.min(x.o, x.c), mh: x.h - Math.max(x.o, x.c), mb: Math.min(x.o, x.c) - x.l, vert: x.c > x.o, rouge: x.c < x.o, long: cp > mc(i) * 1.2, petit: cp < mc(i) * 0.6 };
    };
    const add1 = (i, nom, dir, force, texte, nb) => {
      const s = sig('chandeliers1', nom, i, dir, force, texte); s.debut = i - (nb || 1) + 1; Object.assign(s, cibles(I, i, dir, dir === 'haussier' ? lowest(I.L, nb || 1, i) - 0.1 * I.atr[i] : highest(I.H, nb || 1, i) + 0.1 * I.atr[i])); out.push(s);
    };
    const add2 = (i, nom, dir, force, texte, nb) => { add1(i, nom, dir, force, texte, nb); out[out.length - 1].module = 'chandeliers2'; };
    for (let i = 1; i < n; i++) {
      const a = f(i), p = f(i - 1), t = tendAvant(I, i);
      const t2 = tendance(I, Math.max(0, i - 2));
      // Doji
      if (a.cp <= 0.1 * a.r && a.r > 0.3 * I.atr[i]) {
        if (a.mh <= 0.1 * a.r && a.mb >= 0.6 * a.r) add2(i, 'Doji libellule', t < 0 ? 'haussier' : 'neutre', t < 0 ? 2 : 1, 'Ouverture = clôture au plus haut, longue mèche basse : les vendeurs ont été rejetés.');
        else if (a.mb <= 0.1 * a.r && a.mh >= 0.6 * a.r) add2(i, 'Doji pierre tombale', t > 0 ? 'baissier' : 'neutre', t > 0 ? 2 : 1, 'Ouverture = clôture au plus bas, longue mèche haute : les acheteurs ont été rejetés.');
        else if (t !== 0) add1(i, 'Doji', 'neutre', 1, `Indécision après une ${t > 0 ? 'hausse' : 'baisse'} : possible essoufflement, attendre la confirmation.`);
      }
      // Marteau / pendu
      if (a.cp > 0.05 * a.r && a.mb >= 2 * a.cp && a.mh <= Math.max(0.3 * a.cp, 0.1 * a.r)) {
        if (t < 0) add1(i, 'Marteau', 'haussier', 2 + (a.vert ? 1 : 0) - 1, 'Longue mèche basse après une baisse : rejet des plus bas, retournement haussier possible (confirmer à la barre suivante).');
        else if (t > 0) add1(i, 'Pendu', 'baissier', 1 + (a.rouge ? 1 : 0), 'Même forme que le marteau mais en haut de tendance : alerte de retournement baissier.');
      }
      // Marteau inversé / étoile filante
      if (a.cp > 0.05 * a.r && a.mh >= 2 * a.cp && a.mb <= Math.max(0.3 * a.cp, 0.1 * a.r)) {
        if (t > 0) add1(i, 'Étoile filante', 'baissier', 2, 'Longue mèche haute en haut de tendance : les acheteurs ont échoué, retournement baissier probable.');
        else if (t < 0) add1(i, 'Marteau inversé', 'haussier', 1, 'Longue mèche haute après une baisse : tentative de reprise, à confirmer.');
      }
      // Avalement
      if (p.rouge && a.vert && a.x.o <= p.x.c && a.x.c >= p.x.o && a.cp > p.cp && t <= 0)
        add1(i, 'Avalement haussier', 'haussier', t < 0 ? 3 : 2, 'Le corps blanc englobe entièrement le corps noir précédent : prise de contrôle des acheteurs.', 2);
      if (p.vert && a.rouge && a.x.o >= p.x.c && a.x.c <= p.x.o && a.cp > p.cp && t >= 0)
        add1(i, 'Avalement baissier', 'baissier', t > 0 ? 3 : 2, 'Le corps noir englobe entièrement le corps blanc précédent : prise de contrôle des vendeurs.', 2);
      // Harami
      if (p.long && a.cp < p.cp * 0.5 && a.hautC <= p.hautC && a.basC >= p.basC) {
        const croix = a.cp <= 0.1 * a.r;
        if (p.rouge && t <= 0 && t2 < 0) add1(i, croix ? 'Harami cross haussier' : 'Harami haussier', 'haussier', croix ? 2 : 1, 'Petit corps contenu dans le grand corps noir précédent : la baisse marque une pause.', 2);
        if (p.vert && t >= 0 && t2 > 0) add1(i, croix ? 'Harami cross baissier' : 'Harami baissier', 'baissier', croix ? 2 : 1, 'Petit corps contenu dans le grand corps blanc précédent : la hausse marque une pause.', 2);
      }
      // Pénétrante / nuage noir
      const milieuP = (p.x.o + p.x.c) / 2;
      if (p.rouge && p.long && a.vert && a.x.o < p.x.c && a.x.c > milieuP && a.x.c < p.x.o && t < 0)
        add1(i, 'Ligne pénétrante', 'haussier', 2, 'Ouverture sous la clôture précédente puis clôture au-delà de la moitié du corps noir.', 2);
      if (p.vert && p.long && a.rouge && a.x.o > p.x.c && a.x.c < milieuP && a.x.c > p.x.o && t > 0)
        add1(i, 'Couverture en nuage noir', 'baissier', 2, 'Ouverture au-dessus de la clôture précédente puis clôture sous la moitié du corps blanc.', 2);
      // Pinces
      if (t > 0 && Math.abs(a.x.h - p.x.h) <= 0.05 * I.atr[i] && p.vert && a.rouge && a.x.h >= highest(I.H, 10, i))
        add2(i, 'Pinces hautes (tweezer top)', 'baissier', 2, 'Deux plus hauts identiques en haut de tendance : résistance nette.', 2);
      if (t < 0 && Math.abs(a.x.l - p.x.l) <= 0.05 * I.atr[i] && p.rouge && a.vert && a.x.l <= lowest(I.L, 10, i))
        add2(i, 'Pinces basses (tweezer bottom)', 'haussier', 2, 'Deux plus bas identiques en bas de tendance : support net.', 2);
      // Marubozu
      if (a.cp >= 0.95 * a.r && a.cp > mc(i) * 1.5)
        add2(i, a.vert ? 'Marubozu blanc' : 'Marubozu noir', a.vert ? 'haussier' : 'baissier', 1, a.vert ? 'Grand corps sans mèche : domination totale des acheteurs.' : 'Grand corps sans mèche : domination totale des vendeurs.');
      // Toupie
      if (a.cp > 0.1 * a.r && a.cp <= 0.3 * a.r && a.mh > a.cp && a.mb > a.cp && t !== 0 && a.r > 0.5 * I.atr[i])
        add2(i, 'Toupie', 'neutre', 1, 'Petit corps et mèches des deux côtés : indécision.');
      // Kicker
      if (p.rouge && p.long && a.vert && a.long && a.x.o > p.x.o) add2(i, 'Coup de pied haussier (kicker)', 'haussier', 3, 'Ouverture au-dessus de l’ouverture de la bougie noire précédente : retournement brutal.', 2);
      if (p.vert && p.long && a.rouge && a.long && a.x.o < p.x.o) add2(i, 'Coup de pied baissier (kicker)', 'baissier', 3, 'Ouverture sous l’ouverture de la bougie blanche précédente : retournement brutal.', 2);

      if (i < 2) continue;
      const q = f(i - 2); // première des trois
      const t3 = tendance(I, Math.max(0, i - 3));
      // Étoile du matin / du soir (+ bébé abandonné)
      if (q.rouge && q.long && p.cp < q.cp * 0.4 && p.hautC < q.basC + 0.1 * q.cp && a.vert && a.x.c > (q.x.o + q.x.c) / 2 && t3 < 0) {
        const bebe = p.x.h < q.x.l && p.x.h < a.x.l;
        add1(i, bebe ? 'Bébé abandonné haussier' : (p.cp <= 0.1 * p.r ? 'Étoile du matin (doji)' : 'Étoile du matin'), 'haussier', 3, 'Grande bougie noire, petite étoile en bas, puis grande bougie blanche qui remonte dans le premier corps.', 3);
        if (bebe) out[out.length - 1].module = 'chandeliers2';
      }
      if (q.vert && q.long && p.cp < q.cp * 0.4 && p.basC > q.hautC - 0.1 * q.cp && a.rouge && a.x.c < (q.x.o + q.x.c) / 2 && t3 > 0) {
        const bebe = p.x.l > q.x.h && p.x.l > a.x.h;
        add1(i, bebe ? 'Bébé abandonné baissier' : (p.cp <= 0.1 * p.r ? 'Étoile du soir (doji)' : 'Étoile du soir'), 'baissier', 3, 'Grande bougie blanche, petite étoile en haut, puis grande bougie noire qui redescend dans le premier corps.', 3);
        if (bebe) out[out.length - 1].module = 'chandeliers2';
      }
      // Trois soldats / corbeaux
      const tri = [q, p, a];
      if (tri.every((z) => z.vert && z.cp > 0.5 * z.r) && p.x.c > q.x.c && a.x.c > p.x.c && p.x.o >= q.basC && p.x.o <= q.hautC && a.x.o >= p.basC && a.x.o <= p.hautC && t3 <= 0)
        add1(i, 'Trois soldats blancs', 'haussier', 3, 'Trois bougies blanches successives, chacune ouvrant dans le corps précédent et clôturant plus haut.', 3);
      if (tri.every((z) => z.rouge && z.cp > 0.5 * z.r) && p.x.c < q.x.c && a.x.c < p.x.c && p.x.o >= q.basC && p.x.o <= q.hautC && a.x.o >= p.basC && a.x.o <= p.hautC && t3 >= 0)
        add1(i, 'Trois corbeaux noirs', 'baissier', 3, 'Trois bougies noires successives, chacune ouvrant dans le corps précédent et clôturant plus bas.', 3);
      // Trois intérieurs / extérieurs
      const harH = q.rouge && q.long && p.cp < q.cp * 0.5 && p.hautC <= q.hautC && p.basC >= q.basC;
      const harB = q.vert && q.long && p.cp < q.cp * 0.5 && p.hautC <= q.hautC && p.basC >= q.basC;
      if (harH && a.vert && a.x.c > q.x.o && t3 < 0) add2(i, 'Trois intérieurs haussiers', 'haussier', 2, 'Harami haussier confirmé par une clôture au-dessus de l’ouverture de la grande bougie noire.', 3);
      if (harB && a.rouge && a.x.c < q.x.o && t3 > 0) add2(i, 'Trois intérieurs baissiers', 'baissier', 2, 'Harami baissier confirmé par une clôture sous l’ouverture de la grande bougie blanche.', 3);
      if (q.rouge && p.vert && p.x.o <= q.x.c && p.x.c >= q.x.o && p.cp > q.cp && a.vert && a.x.c > p.x.c && t3 < 0) add2(i, 'Trois extérieurs haussiers', 'haussier', 3, 'Avalement haussier confirmé par une nouvelle clôture plus haute.', 3);
      if (q.vert && p.rouge && p.x.o >= q.x.c && p.x.c <= q.x.o && p.cp > q.cp && a.rouge && a.x.c < p.x.c && t3 > 0) add2(i, 'Trois extérieurs baissiers', 'baissier', 3, 'Avalement baissier confirmé par une nouvelle clôture plus basse.', 3);
      // Gap Tasuki
      if (q.vert && p.vert && p.x.l > q.x.h && a.rouge && a.x.o > p.basC && a.x.o < p.hautC && a.x.c < p.x.o && a.x.c > q.x.h)
        add2(i, 'Gap Tasuki haussier', 'haussier', 2, 'Gap haussier non comblé malgré la bougie noire : continuation de la hausse.', 3);
      if (q.rouge && p.rouge && p.x.h < q.x.l && a.vert && a.x.o < p.hautC && a.x.o > p.basC && a.x.c > p.x.o && a.x.c < q.x.l)
        add2(i, 'Gap Tasuki baissier', 'baissier', 2, 'Gap baissier non comblé malgré la bougie blanche : continuation de la baisse.', 3);

      // Trois méthodes ascendantes / descendantes (5 barres)
      if (i >= 4) {
        const z0 = f(i - 4), mids = [f(i - 3), f(i - 2), f(i - 1)];
        const dedans = mids.every((z) => z.x.h <= z0.x.h + 0.1 * z0.cp && z.x.l >= z0.x.l - 0.1 * z0.cp && z.cp < z0.cp * 0.6);
        if (dedans && z0.vert && z0.long && a.vert && a.long && a.x.c > z0.x.c && mids.filter((z) => z.rouge).length >= 2)
          add2(i, 'Trois méthodes ascendantes', 'haussier', 3, 'Grande bougie blanche, petite consolidation contenue, puis nouvelle grande bougie blanche plus haute : continuation.', 5);
        if (dedans && z0.rouge && z0.long && a.rouge && a.long && a.x.c < z0.x.c && mids.filter((z) => z.vert).length >= 2)
          add2(i, 'Trois méthodes descendantes', 'baissier', 3, 'Grande bougie noire, petite consolidation contenue, puis nouvelle grande bougie noire plus basse : continuation.', 5);
      }
    }
  }

  // ------------------------------- Bollinger
  function bollinger(b, I, p, out) {
    const n = b.length;
    let dernierSqueeze = -999;
    for (let i = p.bbN; i < n; i++) {
      const lg = I.bbLarg[i];
      if (!Number.isFinite(lg)) continue;
      let min = Infinity; for (let j = Math.max(p.bbN - 1, i - 120); j < i; j++) if (Number.isFinite(I.bbLarg[j])) min = Math.min(min, I.bbLarg[j]);
      if (i - p.bbN > 30 && lg <= min && i - dernierSqueeze > 10) {
        out.push(sig('bollinger', 'Squeeze de Bollinger', i, 'neutre', 2, `Largeur des bandes au plus bas depuis ${Math.min(120, i - p.bbN)} barres : compression de volatilité, un mouvement fort se prépare. Jouer la sortie des bandes.`));
        dernierSqueeze = i;
      }
      const c = I.C[i], cp = I.C[i - 1];
      if (i - dernierSqueeze <= 8 && i - dernierSqueeze > 0) {
        if (c > I.bbH[i] && cp <= I.bbH[i - 1]) { const s = sig('bollinger', 'Sortie de squeeze par le haut', i, 'haussier', 3, 'Clôture au-dessus de la bande haute juste après une compression : début probable d’une tendance haussière.', cibles(I, i, 'haussier', I.bbM[i])); s.debut = dernierSqueeze; out.push(s); }
        if (c < I.bbB[i] && cp >= I.bbB[i - 1]) { const s = sig('bollinger', 'Sortie de squeeze par le bas', i, 'baissier', 3, 'Clôture sous la bande basse juste après une compression : début probable d’une tendance baissière.', cibles(I, i, 'baissier', I.bbM[i])); s.debut = dernierSqueeze; out.push(s); }
      }
      if (cp < I.bbB[i - 1] && c > I.bbB[i]) out.push(sig('bollinger', 'Réintégration de la bande basse', i, 'haussier', 2, 'Le cours était sorti sous la bande basse et y revient : excès de baisse corrigé, objectif la moyenne centrale.', { entree: c, stop: Math.min(I.L[i], I.L[i - 1]) - 0.2 * I.atr[i], objectif: I.bbM[i] }));
      if (cp > I.bbH[i - 1] && c < I.bbH[i]) out.push(sig('bollinger', 'Réintégration de la bande haute', i, 'baissier', 2, 'Le cours était sorti au-dessus de la bande haute et y revient : excès de hausse corrigé, objectif la moyenne centrale.', { entree: c, stop: Math.max(I.H[i], I.H[i - 1]) + 0.2 * I.atr[i], objectif: I.bbM[i] }));
      if (i >= 3) {
        const hautes = [0, 1, 2].every((k) => I.C[i - k] >= I.bbH[i - k] * 0.998) && !(I.C[i - 3] >= I.bbH[i - 3] * 0.998);
        const basses = [0, 1, 2].every((k) => I.C[i - k] <= I.bbB[i - k] * 1.002) && !(I.C[i - 3] <= I.bbB[i - 3] * 1.002);
        if (hautes) { const s = sig('bollinger', 'Marche sur la bande haute', i, 'haussier', 2, '3 clôtures de suite collées à la bande haute : tendance haussière puissante, ne pas vendre à découvert.'); s.debut = i - 2; out.push(s); }
        if (basses) { const s = sig('bollinger', 'Marche sur la bande basse', i, 'baissier', 2, '3 clôtures de suite collées à la bande basse : tendance baissière puissante, ne pas acheter trop tôt.'); s.debut = i - 2; out.push(s); }
      }
    }
    // W et M de Bollinger sur les pivots
    const z = I.zz;
    for (let k = 2; k < z.length; k++) {
      const a = z[k - 2], m = z[k - 1], c = z[k];
      if (a.type === 'B' && c.type === 'B' && m.type === 'H' && c.i - a.i <= 40) {
        if (I.L[a.i] < I.bbB[a.i] && c.p > I.bbB[c.i] && c.p >= a.p * 0.97) {
          const i = premiereCassure(I, m.p, c.i + 1, 1, c.i + 25);
          if (i >= 0) { const s = sig('bollinger', 'W de Bollinger', i, 'haussier', 3, '1er creux hors de la bande basse, 2e creux dans les bandes : la pression vendeuse s’épuise. Cassure du sommet intermédiaire.', cibles(I, i, 'haussier', c.p)); s.debut = a.i; s.points = [{ i: a.i, p: a.p, t: 'W1' }, { i: m.i, p: m.p, t: '' }, { i: c.i, p: c.p, t: 'W2' }]; s.lignes = [ligne(m.i, m.p, i, m.p, 'haussier', true)]; s.objectif = m.p + (m.p - Math.min(a.p, c.p)); out.push(s); }
        }
      }
      if (a.type === 'H' && c.type === 'H' && m.type === 'B' && c.i - a.i <= 40) {
        if (I.H[a.i] > I.bbH[a.i] && c.p < I.bbH[c.i] && c.p <= a.p * 1.03) {
          const i = premiereCassure(I, m.p, c.i + 1, -1, c.i + 25);
          if (i >= 0) { const s = sig('bollinger', 'M de Bollinger', i, 'baissier', 3, '1er sommet hors de la bande haute, 2e sommet dans les bandes : la pression acheteuse s’épuise. Cassure du creux intermédiaire.', cibles(I, i, 'baissier', c.p)); s.debut = a.i; s.points = [{ i: a.i, p: a.p, t: 'M1' }, { i: m.i, p: m.p, t: '' }, { i: c.i, p: c.p, t: 'M2' }]; s.lignes = [ligne(m.i, m.p, i, m.p, 'baissier', true)]; s.objectif = m.p - (Math.max(a.p, c.p) - m.p); out.push(s); }
        }
      }
    }
  }
  // première clôture qui franchit un niveau (sens 1 au-dessus, -1 en dessous)
  function premiereCassure(I, niveau, de, sens, jusqua) {
    for (let i = de; i < Math.min(I.n, jusqua ?? I.n); i++) {
      if (sens > 0 && I.C[i] > niveau) return i;
      if (sens < 0 && I.C[i] < niveau) return i;
    }
    return -1;
  }
  function cassureDroite(I, d, de, sens, jusqua, tol = 0) {
    for (let i = de; i < Math.min(I.n, jusqua ?? I.n); i++) {
      const v = d.at(i);
      if (sens > 0 && I.C[i] > v + tol) return i;
      if (sens < 0 && I.C[i] < v - tol) return i;
    }
    return -1;
  }

  // ------------------------------- moyennes mobiles
  function moyennes(b, I, p, out) {
    const [m1, m2, m3] = p.mm;
    const A = I.mm[m1], B = I.mm[m2], Cc = I.mm[m3];
    const croise = (x, y, i) => (x[i - 1] <= y[i - 1] && x[i] > y[i] ? 1 : x[i - 1] >= y[i - 1] && x[i] < y[i] ? -1 : 0);
    for (let i = 1; i < I.n; i++) {
      if (Number.isFinite(Cc[i - 1]) && Number.isFinite(B[i - 1])) {
        const k = croise(B, Cc, i);
        if (k > 0) out.push(sig('mm', `Croisement doré (MM${m2} > MM${m3})`, i, 'haussier', 3, `La MM${m2} passe au-dessus de la MM${m3} : signal haussier de long terme.`, cibles(I, i, 'haussier', Cc[i])));
        if (k < 0) out.push(sig('mm', `Croisement de la mort (MM${m2} < MM${m3})`, i, 'baissier', 3, `La MM${m2} passe sous la MM${m3} : signal baissier de long terme.`, cibles(I, i, 'baissier', Cc[i])));
      }
      if (Number.isFinite(B[i - 1]) && Number.isFinite(A[i - 1])) {
        const k = croise(A, B, i);
        if (k > 0) out.push(sig('mm', `Croisement MM${m1} / MM${m2} haussier`, i, 'haussier', 2, `La MM${m1} croise la MM${m2} à la hausse : signal de moyen terme.`, cibles(I, i, 'haussier', B[i] - I.atr[i])));
        if (k < 0) out.push(sig('mm', `Croisement MM${m1} / MM${m2} baissier`, i, 'baissier', 2, `La MM${m1} croise la MM${m2} à la baisse : signal de moyen terme.`, cibles(I, i, 'baissier', B[i] + I.atr[i])));
      }
      if (i > 5 && Number.isFinite(A[i - 5])) {
        const pente = A[i] - A[i - 5];
        if (I.C[i - 1] <= A[i - 1] && I.C[i] > A[i] && pente > 0) out.push(sig('mm', `Cassure de la MM${m1} montante`, i, 'haussier', 1, `Clôture au-dessus de la MM${m1}, qui monte : reprise de la tendance.`, cibles(I, i, 'haussier', Math.min(I.L[i], A[i]) - 0.5 * I.atr[i])));
        if (I.C[i - 1] >= A[i - 1] && I.C[i] < A[i] && pente < 0) out.push(sig('mm', `Cassure de la MM${m1} descendante`, i, 'baissier', 1, `Clôture sous la MM${m1}, qui baisse : reprise de la baisse.`, cibles(I, i, 'baissier', Math.max(I.H[i], A[i]) + 0.5 * I.atr[i])));
        // rebond
        if (Number.isFinite(B[i]) && B[i] > B[i - 5] && A[i] > B[i]) {
          for (const [M, nom] of [[A, m1], [B, m2]]) {
            if (I.L[i] <= M[i] * 1.003 && I.C[i] > M[i] && I.C[i] > I.O[i] && I.L[i - 1] > M[i - 1]) { out.push(sig('mm', `Rebond sur la MM${nom}`, i, 'haussier', 2, `Le plus bas touche la MM${nom} montante et la clôture repart au-dessus : achat sur repli dans la tendance.`, cibles(I, i, 'haussier', M[i] - 0.7 * I.atr[i]))); break; }
          }
        }
        if (Number.isFinite(B[i]) && B[i] < B[i - 5] && A[i] < B[i]) {
          for (const [M, nom] of [[A, m1], [B, m2]]) {
            if (I.H[i] >= M[i] * 0.997 && I.C[i] < M[i] && I.C[i] < I.O[i] && I.H[i - 1] < M[i - 1]) { out.push(sig('mm', `Rejet sous la MM${nom}`, i, 'baissier', 2, `Le plus haut touche la MM${nom} descendante et la clôture repart en dessous : vente sur rebond dans la tendance.`, cibles(I, i, 'baissier', M[i] + 0.7 * I.atr[i]))); break; }
          }
        }
      }
    }
    const i = I.n - 1;
    if (Number.isFinite(Cc[i])) {
      if (I.C[i] > A[i] && A[i] > B[i] && B[i] > Cc[i]) out.push(sig('mm', 'Alignement haussier des moyennes', i, 'haussier', 2, `Prix > MM${m1} > MM${m2} > MM${m3} : tendance haussière installée sur tous les horizons.`));
      if (I.C[i] < A[i] && A[i] < B[i] && B[i] < Cc[i]) out.push(sig('mm', 'Alignement baissier des moyennes', i, 'baissier', 2, `Prix < MM${m1} < MM${m2} < MM${m3} : tendance baissière installée sur tous les horizons.`));
    }
  }

  // ------------------------------- Ichimoku
  function ichimoku(b, I, out) {
    const nuageH = (i) => Math.max(I.ssa[i], I.ssb[i]), nuageB = (i) => Math.min(I.ssa[i], I.ssb[i]);
    for (let i = 53; i < I.n; i++) {
      if (!Number.isFinite(I.ssb[i])) continue;
      const c = I.C[i], tk = I.tenkan, kj = I.kijun;
      const pos = c > nuageH(i) ? 1 : c < nuageB(i) ? -1 : 0;
      if (tk[i - 1] <= kj[i - 1] && tk[i] > kj[i]) out.push(sig('ichimoku', 'Croisement Tenkan/Kijun haussier', i, 'haussier', pos > 0 ? 3 : pos === 0 ? 2 : 1, `Tenkan passe au-dessus de la Kijun, ${pos > 0 ? 'au-dessus du nuage : signal fort' : pos === 0 ? 'dans le nuage : signal moyen' : 'sous le nuage : signal faible'}.`, cibles(I, i, 'haussier', Math.min(kj[i], nuageB(i)) - 0.3 * I.atr[i])));
      if (tk[i - 1] >= kj[i - 1] && tk[i] < kj[i]) out.push(sig('ichimoku', 'Croisement Tenkan/Kijun baissier', i, 'baissier', pos < 0 ? 3 : pos === 0 ? 2 : 1, `Tenkan passe sous la Kijun, ${pos < 0 ? 'sous le nuage : signal fort' : pos === 0 ? 'dans le nuage : signal moyen' : 'au-dessus du nuage : signal faible'}.`, cibles(I, i, 'baissier', Math.max(kj[i], nuageH(i)) + 0.3 * I.atr[i])));
      const cp = I.C[i - 1];
      if (cp <= nuageH(i - 1) && c > nuageH(i)) out.push(sig('ichimoku', 'Sortie du nuage par le haut', i, 'haussier', 2, 'La clôture passe au-dessus du Kumo : le nuage devient support.', cibles(I, i, 'haussier', nuageB(i))));
      if (cp >= nuageB(i - 1) && c < nuageB(i)) out.push(sig('ichimoku', 'Sortie du nuage par le bas', i, 'baissier', 2, 'La clôture passe sous le Kumo : le nuage devient résistance.', cibles(I, i, 'baissier', nuageH(i))));
      // signal complet (première barre où les 3 conditions sont réunies)
      const complet = (j, s) => {
        if (j < 27 || !Number.isFinite(I.ssb[j])) return false;
        const p2 = I.C[j] > nuageH(j) ? 1 : I.C[j] < nuageB(j) ? -1 : 0;
        return s > 0 ? p2 > 0 && tk[j] > kj[j] && I.C[j] > I.H[j - 26] : p2 < 0 && tk[j] < kj[j] && I.C[j] < I.L[j - 26];
      };
      if (complet(i, 1) && !complet(i - 1, 1)) out.push(sig('ichimoku', 'Signal Ichimoku complet haussier', i, 'haussier', 3, 'Prix au-dessus du nuage, Tenkan > Kijun et Chikou au-dessus des prix passés : les trois feux sont au vert.', cibles(I, i, 'haussier', kj[i] - 0.3 * I.atr[i])));
      if (complet(i, -1) && !complet(i - 1, -1)) out.push(sig('ichimoku', 'Signal Ichimoku complet baissier', i, 'baissier', 3, 'Prix sous le nuage, Tenkan < Kijun et Chikou sous les prix passés : les trois feux sont au rouge.', cibles(I, i, 'baissier', kj[i] + 0.3 * I.atr[i])));
    }
    // Twist du nuage futur (sur les 26 barres projetées)
    const fin = I.n - 1;
    for (let j = fin + 1; j < fin + 27; j++) {
      if (!Number.isFinite(I.ssa[j - 1]) || !Number.isFinite(I.ssb[j - 1])) continue;
      if (I.ssa[j - 1] <= I.ssb[j - 1] && I.ssa[j] > I.ssb[j]) { out.push(sig('ichimoku', 'Twist du Kumo haussier à venir', fin, 'haussier', 1, `SSA repasse au-dessus de SSB dans ${j - fin} barres : le nuage futur devient haussier.`)); break; }
      if (I.ssa[j - 1] >= I.ssb[j - 1] && I.ssa[j] < I.ssb[j]) { out.push(sig('ichimoku', 'Twist du Kumo baissier à venir', fin, 'baissier', 1, `SSA repasse sous SSB dans ${j - fin} barres : le nuage futur devient baissier.`)); break; }
    }
  }

  // ------------------------------- figures à deux droites (canaux, triangles, biseaux, élargissements)
  function figuresDroites(b, I, p, out) {
    const pv = I.pivots;
    const trouvees = [];
    const fenetre = p.fenetreFigure;
    for (let e = 0; e < pv.length; e++) {
      const fin = pv[e].i;
      const dans = pv.filter((q) => q.i <= fin && q.i >= fin - fenetre && q.conf < I.n);
      const hs = dans.filter((q) => q.type === 'H').slice(-3), ls = dans.filter((q) => q.type === 'B').slice(-3);
      for (const nh of [3, 2]) for (const nl of [3, 2]) {
        if (hs.length < nh || ls.length < nl || nh + nl < 5) continue;
        const H = hs.slice(-nh), Lw = ls.slice(-nl);
        const r = classer(I, H, Lw, p);
        if (r) trouvees.push(r);
      }
    }
    // dédoublonnage : même type qui se chevauchent → on garde la plus longue
    trouvees.sort((a, b) => (b.fin - b.deb) - (a.fin - a.deb));
    const gardees = [];
    for (const f of trouvees) {
      if (gardees.some((g) => g.type === f.type && chevauche(g, f) > 0.4)) continue;
      gardees.push(f);
    }
    for (const f of gardees) out.push(f.signal);
  }
  const chevauche = (a, b) => { const x = Math.max(0, Math.min(a.fin, b.fin) - Math.max(a.deb, b.deb)); return x / Math.max(1, Math.min(a.fin - a.deb, b.fin - b.deb)); };

  function classer(I, H, Lw, p) {
    const dH = droite(H), dL = droite(Lw);
    if (!dH || !dL) return null;
    const deb = Math.min(H[0].i, Lw[0].i), fin = Math.max(H[H.length - 1].i, Lw[Lw.length - 1].i);
    if (fin - deb < 10) return null;
    const atr = I.atr[fin];
    if (dH.err > 0.6 * atr || dL.err > 0.6 * atr) return null;
    const lgD = dH.at(deb) - dL.at(deb), lgF = dH.at(fin) - dL.at(fin);
    if (lgD <= 0.5 * atr || lgF <= 0.3 * atr) return null;
    // contenance des clôtures
    let dedans = 0;
    for (let i = deb; i <= fin; i++) if (I.C[i] <= dH.at(i) + 0.3 * atr && I.C[i] >= dL.at(i) - 0.3 * atr) dedans++;
    if (dedans / (fin - deb + 1) < 0.9) return null;
    const plat = 0.04 * atr; // pente « horizontale » en prix par barre
    const sH = dH.a, sL = dL.a;
    const ratio = lgF / lgD;
    let type, module, dir, nom, texte;
    const tAv = tendance(I, Math.max(0, deb - 1), 15);
    if (ratio > 0.8 && ratio < 1.25 && Math.abs(sH - sL) < 0.05 * atr + 0.25 * Math.max(Math.abs(sH), Math.abs(sL))) {
      module = 'canaux';
      const s = (sH + sL) / 2;
      if (Math.abs(s) <= plat) { type = 'rectangle'; nom = 'Rectangle (canal horizontal)'; dir = 'neutre'; texte = 'Le prix oscille entre un support et une résistance horizontaux : jouer les rebonds ou la cassure.'; }
      else if (s > 0) { type = 'canalH'; nom = 'Canal haussier'; dir = 'haussier'; texte = 'Sommets et creux ascendants alignés sur deux parallèles : acheter près du bas du canal, vendre près du haut.'; }
      else { type = 'canalB'; nom = 'Canal baissier'; dir = 'baissier'; texte = 'Sommets et creux descendants alignés sur deux parallèles : vendre près du haut du canal.'; }
    } else if (ratio <= 0.8) {
      if (Math.abs(sH) <= plat && sL > plat) { module = 'triangles'; type = 'triA'; nom = 'Triangle ascendant'; dir = 'haussier'; texte = 'Résistance horizontale et creux de plus en plus hauts : la pression acheteuse monte, cassure haussière attendue.'; }
      else if (Math.abs(sL) <= plat && sH < -plat) { module = 'triangles'; type = 'triD'; nom = 'Triangle descendant'; dir = 'baissier'; texte = 'Support horizontal et sommets de plus en plus bas : la pression vendeuse monte, cassure baissière attendue.'; }
      else if (sH < -plat && sL > plat) { module = 'triangles'; type = 'triS'; nom = 'Triangle symétrique'; dir = tAv > 0 ? 'haussier' : tAv < 0 ? 'baissier' : 'neutre'; texte = `Sommets descendants et creux montants : figure de continuation${tAv ? ` (tendance précédente ${tAv > 0 ? 'haussière' : 'baissière'})` : ''}, jouer la cassure.`; }
      else if (sH > plat && sL > sH) { module = 'biseaux'; type = 'bisA'; nom = 'Biseau ascendant'; dir = 'baissier'; texte = 'Deux droites montantes qui se resserrent : la hausse s’essouffle, cassure par le bas attendue.'; }
      else if (sL < -plat && sH < sL) { module = 'biseaux'; type = 'bisD'; nom = 'Biseau descendant'; dir = 'haussier'; texte = 'Deux droites descendantes qui se resserrent : la baisse s’essouffle, cassure par le haut attendue.'; }
      else return null;
    } else if (ratio >= 1.25) {
      if (sH > plat && sL < -plat) { module = 'elargissement'; type = 'elar'; nom = 'Figure d’élargissement'; dir = tAv > 0 ? 'baissier' : 'neutre'; texte = 'Sommets de plus en plus hauts et creux de plus en plus bas : marché nerveux, souvent signe de fin de hausse.'; }
      else if (Math.abs(sL) <= plat && sH > plat) { module = 'elargissement'; type = 'elarH'; nom = 'Élargissement à base horizontale'; dir = 'haussier'; texte = 'Creux alignés à l’horizontale, sommets de plus en plus hauts : cassure du dernier sommet = signal haussier.'; }
      else if (Math.abs(sH) <= plat && sL < -plat) { module = 'elargissement'; type = 'elarB'; nom = 'Élargissement à sommet horizontal'; dir = 'baissier'; texte = 'Sommets alignés à l’horizontale, creux de plus en plus bas : cassure du dernier creux = signal baissier.'; }
      else return null;
    } else return null;

    // cassure après la figure
    const conf = Math.max(H[H.length - 1].conf, Lw[Lw.length - 1].conf);
    const limite = fin + Math.max(20, Math.round((fin - deb) * 0.7));
    const ch = cassureDroite(I, dH, conf, 1, limite, 0.2 * atr), cb = cassureDroite(I, dL, conf, -1, limite, 0.2 * atr);
    let i = Math.min(I.n - 1, conf), cass = 0;
    if (ch >= 0 && (cb < 0 || ch < cb)) { i = ch; cass = 1; } else if (cb >= 0) { i = cb; cass = -1; }
    const hauteur = Math.max(lgD, lgF);
    let force = 1;
    const s = sig(module, nom, i, dir, force, texte);
    s.debut = deb;
    const finTrace = cass ? i : Math.min(I.n - 1, fin + 10);
    s.lignes = [ligne(deb, dH.at(deb), finTrace, dH.at(finTrace), 'baissier'), ligne(deb, dL.at(deb), finTrace, dL.at(finTrace), 'haussier')];
    s.points = H.map((q) => ({ i: q.i, p: q.p, t: '' })).concat(Lw.map((q) => ({ i: q.i, p: q.p, t: '' })));
    if (cass) {
      const sensOK = (cass > 0 && dir !== 'baissier') || (cass < 0 && dir !== 'haussier');
      s.dir = cass > 0 ? 'haussier' : 'baissier';
      s.nom += cass > 0 ? ' – cassure haussière' : ' – cassure baissière';
      s.force = sensOK ? 3 : 2;
      if (I.aVolume && I.V[i] > 1.5 * I.vMoy[i]) { s.force = 3; s.texte += ' Cassure validée par un volume élevé.'; }
      if (!sensOK) s.texte += ' Attention : cassure dans le sens opposé à l’attendu (signal contraire souvent puissant).';
      const e = I.C[i];
      s.entree = e;
      if (type === 'bisA' || type === 'bisD') { s.objectif = cass > 0 ? Math.max(...H.map((q) => q.p), dH.at(deb)) : Math.min(...Lw.map((q) => q.p), dL.at(deb)); }
      else s.objectif = cass > 0 ? e + hauteur : e - hauteur;
      s.stop = cass > 0 ? dL.at(i) : dH.at(i);
    } else {
      s.texte += ' Figure en cours, pas encore de cassure.';
      s.force = 1;
      s.enCours = true;
    }
    return { type, deb, fin: finTrace, signal: s };
  }

  // ------------------------------- ETE / ETE inversée et doubles sommets/creux
  function eteEtDoubles(b, I, out) {
    const z = I.zz;
    for (let k = 4; k < z.length; k++) {
      const [p1, p2, p3, p4, p5] = z.slice(k - 4, k + 1);
      if (p5.conf >= I.n) continue;
      // ETE (sommets)
      if (p1.type === 'H') {
        const cou = droite([p2, p4]);
        const hT = p3.p - cou.at(p3.i);
        if (p3.p > p1.p && p3.p > p5.p && hT > 0 && Math.abs(p1.p - p5.p) < 0.5 * hT && p1.p > cou.at(p1.i) + 0.3 * hT && p5.p > cou.at(p5.i) + 0.3 * hT && Math.abs(cou.a) * (p5.i - p1.i) < hT && tendance(I, Math.max(0, p1.i - 1), 15) >= 0) {
          const i = cassureDroite(I, cou, p5.i + 1, -1, p5.i + 2 * (p5.i - p1.i));
          const s = sig('eteepaule', i >= 0 ? 'Épaule-Tête-Épaule – cassure de la ligne de cou' : 'Épaule-Tête-Épaule en formation', i >= 0 ? i : Math.min(I.n - 1, p5.conf), 'baissier', i >= 0 ? 3 : 1, `Trois sommets, la tête dépasse les épaules. ${i >= 0 ? 'La clôture casse la ligne de cou : figure de retournement baissier validée.' : 'Signal à la cassure de la ligne de cou.'}`);
          s.debut = p1.i; s.enCours = i < 0;
          s.points = [{ i: p1.i, p: p1.p, t: 'É' }, { i: p3.i, p: p3.p, t: 'T' }, { i: p5.i, p: p5.p, t: 'É' }];
          const fx = i >= 0 ? i : Math.min(I.n - 1, p5.i + 10);
          s.lignes = [ligne(p1.i, cou.at(p1.i), fx, cou.at(fx), 'baissier', true)];
          if (i >= 0) { s.entree = I.C[i]; s.stop = p5.p; s.objectif = cou.at(i) - hT; }
          out.push(s);
        }
      }
      // ETE inversée (creux)
      if (p1.type === 'B') {
        const cou = droite([p2, p4]);
        const hT = cou.at(p3.i) - p3.p;
        if (p3.p < p1.p && p3.p < p5.p && hT > 0 && Math.abs(p1.p - p5.p) < 0.5 * hT && p1.p < cou.at(p1.i) - 0.3 * hT && p5.p < cou.at(p5.i) - 0.3 * hT && Math.abs(cou.a) * (p5.i - p1.i) < hT && tendance(I, Math.max(0, p1.i - 1), 15) <= 0) {
          const i = cassureDroite(I, cou, p5.i + 1, 1, p5.i + 2 * (p5.i - p1.i));
          const s = sig('eteepaule', i >= 0 ? 'ETE inversée – cassure de la ligne de cou' : 'ETE inversée en formation', i >= 0 ? i : Math.min(I.n - 1, p5.conf), 'haussier', i >= 0 ? 3 : 1, `Trois creux, la tête plus basse que les épaules. ${i >= 0 ? 'La clôture casse la ligne de cou : figure de retournement haussier validée.' : 'Signal à la cassure de la ligne de cou.'}`);
          s.debut = p1.i; s.enCours = i < 0;
          s.points = [{ i: p1.i, p: p1.p, t: 'É' }, { i: p3.i, p: p3.p, t: 'T' }, { i: p5.i, p: p5.p, t: 'É' }];
          const fx = i >= 0 ? i : Math.min(I.n - 1, p5.i + 10);
          s.lignes = [ligne(p1.i, cou.at(p1.i), fx, cou.at(fx), 'haussier', true)];
          if (i >= 0) { s.entree = I.C[i]; s.stop = p5.p; s.objectif = cou.at(i) + hT; }
          out.push(s);
        }
      }
    }
    // doubles sommets / creux
    for (let k = 2; k < z.length; k++) {
      const [a, m, c] = z.slice(k - 2, k + 1);
      if (c.conf >= I.n || c.i - a.i < 8) continue;
      const tol = Math.max(0.03 * Math.abs(a.p) * 0.5, 0.5 * I.atr[c.i]);
      if (a.type === 'H' && Math.abs(a.p - c.p) <= tol && (Math.max(a.p, c.p) - m.p) > 1.5 * I.atr[c.i] && tendance(I, Math.max(0, a.i - 1), 15) > 0) {
        const i = premiereCassure(I, m.p, c.i + 1, -1, c.i + (c.i - a.i));
        if (i >= 0) { const s = sig('chartisme', 'Double sommet', i, 'baissier', 3, 'Deux sommets au même niveau puis cassure du creux intermédiaire : retournement baissier.', { entree: I.C[i], stop: Math.max(a.p, c.p), objectif: m.p - (Math.max(a.p, c.p) - m.p) }); s.debut = a.i; s.points = [{ i: a.i, p: a.p, t: '1' }, { i: c.i, p: c.p, t: '2' }]; s.lignes = [ligne(a.i, m.p, i, m.p, 'baissier', true)]; out.push(s); }
      }
      if (a.type === 'B' && Math.abs(a.p - c.p) <= tol && (m.p - Math.min(a.p, c.p)) > 1.5 * I.atr[c.i] && tendance(I, Math.max(0, a.i - 1), 15) < 0) {
        const i = premiereCassure(I, m.p, c.i + 1, 1, c.i + (c.i - a.i));
        if (i >= 0) { const s = sig('chartisme', 'Double creux', i, 'haussier', 3, 'Deux creux au même niveau puis cassure du sommet intermédiaire : retournement haussier.', { entree: I.C[i], stop: Math.min(a.p, c.p), objectif: m.p + (m.p - Math.min(a.p, c.p)) }); s.debut = a.i; s.points = [{ i: a.i, p: a.p, t: '1' }, { i: c.i, p: c.p, t: '2' }]; s.lignes = [ligne(a.i, m.p, i, m.p, 'haussier', true)]; out.push(s); }
      }
    }
    // structure de Dow à la dernière barre
    const hs = z.filter((q) => q.type === 'H' && q.conf < I.n).slice(-2), ls = z.filter((q) => q.type === 'B' && q.conf < I.n).slice(-2);
    if (hs.length === 2 && ls.length === 2) {
      const fin = I.n - 1;
      if (hs[1].p > hs[0].p && ls[1].p > ls[0].p) { const s = sig('chartisme', 'Tendance de Dow haussière', fin, 'haussier', 1, 'Les deux derniers sommets et les deux derniers creux sont ascendants.'); s.points = [...hs, ...ls].map((q) => ({ i: q.i, p: q.p, t: q.type === 'H' ? 'SH' : 'CH' })); s.debut = Math.min(hs[0].i, ls[0].i); out.push(s); }
      if (hs[1].p < hs[0].p && ls[1].p < ls[0].p) { const s = sig('chartisme', 'Tendance de Dow baissière', fin, 'baissier', 1, 'Les deux derniers sommets et les deux derniers creux sont descendants.'); s.points = [...hs, ...ls].map((q) => ({ i: q.i, p: q.p, t: q.type === 'H' ? 'SB' : 'CB' })); s.debut = Math.min(hs[0].i, ls[0].i); out.push(s); }
    }
  }

  // ------------------------------- fourchette d'Andrews (sur les 3 derniers pivots alternés)
  function andrews(b, I, out) {
    const z = I.zz.filter((q) => q.conf < I.n);
    for (let k = Math.max(2, z.length - 4); k < z.length; k++) {
      const [A, B, C] = z.slice(k - 2, k + 1);
      const mx = (B.i + C.i) / 2, my = (B.p + C.p) / 2;
      if (mx - A.i < 3) continue;
      const pente = (my - A.p) / (mx - A.i);
      const med = (x) => A.p + pente * (x - A.i);
      const parB = (x) => B.p + pente * (x - B.i), parC = (x) => C.p + pente * (x - C.i);
      const haut = (x) => Math.max(parB(x), parC(x)), bas = (x) => Math.min(parB(x), parC(x));
      const finFourche = Math.min(I.n - 1, C.i + 3 * (C.i - A.i));
      let touche = -1, sortie = -1, sens = 0;
      for (let i = C.i + 1; i <= finFourche; i++) {
        if (touche < 0 && I.L[i] <= med(i) && I.H[i] >= med(i)) touche = i;
        if (sortie < 0 && I.C[i] > haut(i) + 0.2 * I.atr[i]) { sortie = i; sens = 1; }
        if (sortie < 0 && I.C[i] < bas(i) - 0.2 * I.atr[i]) { sortie = i; sens = -1; }
        if (touche >= 0 && sortie >= 0) break;
      }
      const dirF = pente > 0 ? 'haussier' : 'baissier';
      const dernier = k === z.length - 1;
      let s;
      if (sortie >= 0) s = sig('andrews', `Sortie de la fourchette d’Andrews par le ${sens > 0 ? 'haut' : 'bas'}`, sortie, sens > 0 ? 'haussier' : 'baissier', 2, `Le prix quitte la fourchette ${pente > 0 ? 'montante' : 'descendante'} : ${(sens > 0) === (pente > 0) ? 'accélération de la tendance' : 'changement de rythme, la tendance de la fourchette est remise en cause'}.`, cibles(I, sortie, sens > 0 ? 'haussier' : 'baissier', sens > 0 ? med(sortie) : med(sortie)));
      else if (touche >= 0) s = sig('andrews', 'Ligne médiane d’Andrews atteinte', touche, 'neutre', 1, 'Le prix a rejoint la ligne médiane (cas le plus fréquent selon Andrews) : zone de réaction, prendre des bénéfices ou attendre un rejet.');
      else if (dernier) {
        const i = I.n - 1;
        s = sig('andrews', 'Fourchette d’Andrews active', i, I.C[i] < med(i) === (C.type === 'B') ? dirF : 'neutre', 1, `Fourchette tracée sur les trois derniers pivots. Le prix est ${I.C[i] > med(i) ? 'au-dessus' : 'en dessous'} de la médiane : objectif probable la médiane (${fmt(med(i))}).`, { objectif: med(i) });
        s.enCours = true;
      }
      if (!s) continue;
      s.debut = A.i;
      const fx = Math.min(I.n - 1 + 15, Math.max(s.i, C.i) + 15);
      s.lignes = [ligne(A.i, A.p, fx, med(fx), 'accent'), ligne(B.i, B.p, fx, parB(fx), 'neutre', true), ligne(C.i, C.p, fx, parC(fx), 'neutre', true)];
      s.points = [{ i: A.i, p: A.p, t: 'A' }, { i: B.i, p: B.p, t: 'B' }, { i: C.i, p: C.p, t: 'C' }];
      out.push(s);
    }
  }

  // ------------------------------- gaps
  function gaps(b, I, out) {
    const liste = [];
    for (let i = 1; i < I.n; i++) {
      const hausse = I.L[i] > I.H[i - 1], baisse = I.H[i] < I.L[i - 1];
      if (!hausse && !baisse) continue;
      const taille = hausse ? I.L[i] - I.H[i - 1] : I.L[i - 1] - I.H[i];
      if (taille < 0.1 * I.atr[i]) continue;
      liste.push({ i, hausse, bas: hausse ? I.H[i - 1] : I.H[i], haut: hausse ? I.L[i] : I.L[i - 1] });
    }
    for (const g of liste) {
      const i = g.i;
      // comblement
      let comble = -1;
      for (let j = i + 1; j < I.n; j++) if ((g.hausse && I.L[j] <= g.bas) || (!g.hausse && I.H[j] >= g.haut)) { comble = j; break; }
      // congestion avant ?
      const w = 15, deb = Math.max(0, i - w);
      const hh = highest(I.H, w, i - 1), ll = lowest(I.L, w, i - 1);
      const congestion = i > w && (hh - ll) < 4 * I.atr[i - 1];
      const mvt = i >= 20 ? (I.C[i - 1] - I.C[i - 20]) / I.atr[i - 1] : 0;
      const volFort = I.aVolume && I.V[i] > 1.5 * I.vMoy[i];
      let nom, dir = g.hausse ? 'haussier' : 'baissier', force = 2, texte;
      const rsi = I.rsi[i];
      if (congestion && ((g.hausse && I.C[i] > hh) || (!g.hausse && I.C[i] < ll))) { nom = 'Gap de rupture'; force = volFort ? 3 : 2; texte = `Gap qui fait sortir le cours d’une zone de congestion${volFort ? ', avec un fort volume' : ''} : début d’un nouveau mouvement, rarement comblé rapidement.`; }
      else if ((g.hausse && mvt > 6 && rsi > 70) || (!g.hausse && mvt < -6 && rsi < 30)) { nom = 'Gap d’épuisement (possible)'; dir = g.hausse ? 'baissier' : 'haussier'; force = comble >= 0 && comble - i <= 5 ? 3 : 1; texte = `Gap après une longue ${g.hausse ? 'hausse' : 'baisse'} en zone de ${g.hausse ? 'surachat' : 'survente'}${comble >= 0 && comble - i <= 5 ? ', comblé en quelques barres : épuisement confirmé' : ''}.`; }
      else if ((g.hausse && mvt > 2) || (!g.hausse && mvt < -2)) { nom = 'Gap de continuation'; texte = 'Gap au milieu d’une tendance établie : la tendance accélère. On peut reporter le chemin parcouru avant le gap pour estimer l’objectif.'; }
      else { nom = 'Gap commun'; force = 1; texte = 'Gap sans contexte particulier : souvent comblé.'; }
      nom += g.hausse ? ' haussier' : ' baissier';
      if (comble >= 0) texte += ` Comblé ${comble - i} barre(s) plus tard.`; else texte += ' Non comblé à ce jour : la zone du gap sert de ' + (g.hausse ? 'support.' : 'résistance.');
      const s = sig('gaps', nom, i, dir, force, texte, cibles(I, i, dir, dir === 'haussier' ? g.bas - 0.2 * I.atr[i] : g.haut + 0.2 * I.atr[i]));
      s.debut = i - 1;
      s.lignes = [ligne(i - 1, g.bas, comble >= 0 ? comble : I.n - 1, g.bas, 'neutre', true), ligne(i - 1, g.haut, comble >= 0 ? comble : I.n - 1, g.haut, 'neutre', true)];
      out.push(s);
    }
    // île de retournement
    for (let a = 0; a < liste.length; a++) for (let c = a + 1; c < liste.length; c++) {
      const g1 = liste[a], g2 = liste[c];
      if (g2.i - g1.i > 15) break;
      if (g1.hausse === g2.hausse) continue;
      let isole = true;
      for (let j = g1.i; j < g2.i; j++) if ((g1.hausse && I.L[j] <= g1.bas) || (!g1.hausse && I.H[j] >= g1.haut)) isole = false;
      if (!isole) continue;
      const dir = g1.hausse ? 'baissier' : 'haussier';
      const s = sig('gaps', g1.hausse ? 'Île de retournement baissière' : 'Île de retournement haussière', g2.i, dir, 3, `Un gap ${g1.hausse ? 'haussier' : 'baissier'} puis un gap ${g1.hausse ? 'baissier' : 'haussier'} isolent ${g2.i - g1.i} barre(s) : retournement fort.`, cibles(I, g2.i, dir, dir === 'haussier' ? lowest(I.L, g2.i - g1.i, g2.i - 1) : highest(I.H, g2.i - g1.i, g2.i - 1)));
      s.debut = g1.i - 1;
      out.push(s);
      break;
    }
  }

  // ------------------------------- divergences (générique)
  function divergences(I, serie, nomInd, module, out) {
    const pv = I.pivots.filter((q) => q.conf < I.n);
    const ls = pv.filter((q) => q.type === 'B'), hs = pv.filter((q) => q.type === 'H');
    const cherche = (L, sens) => {
      for (let k = 1; k < L.length; k++) {
        const a = L[k - 1], c = L[k];
        if (c.i - a.i < 5 || c.i - a.i > 60) continue;
        const ia = serie[a.i], ic = serie[c.i];
        if (!Number.isFinite(ia) || !Number.isFinite(ic)) continue;
        if (sens > 0 && c.p < a.p && ic > ia) {
          const s = sig(module, `Divergence haussière ${nomInd}`, Math.min(I.n - 1, c.conf), 'haussier', 2, `Le prix fait un plus bas plus bas mais le ${nomInd} un plus bas plus haut : la baisse perd de sa force.`, cibles(I, Math.min(I.n - 1, c.conf), 'haussier', c.p - 0.3 * I.atr[c.i]));
          s.debut = a.i; s.lignes = [ligne(a.i, a.p, c.i, c.p, 'haussier')]; s.points = [{ i: a.i, p: a.p, t: '' }, { i: c.i, p: c.p, t: '' }]; s.ind = { serie: nomInd, a: [a.i, ia], c: [c.i, ic] };
          out.push(s);
        }
        if (sens < 0 && c.p > a.p && ic < ia) {
          const s = sig(module, `Divergence baissière ${nomInd}`, Math.min(I.n - 1, c.conf), 'baissier', 2, `Le prix fait un plus haut plus haut mais le ${nomInd} un plus haut plus bas : la hausse perd de sa force.`, cibles(I, Math.min(I.n - 1, c.conf), 'baissier', c.p + 0.3 * I.atr[c.i]));
          s.debut = a.i; s.lignes = [ligne(a.i, a.p, c.i, c.p, 'baissier')]; s.points = [{ i: a.i, p: a.p, t: '' }, { i: c.i, p: c.p, t: '' }]; s.ind = { serie: nomInd, a: [a.i, ia], c: [c.i, ic] };
          out.push(s);
        }
      }
    };
    cherche(ls, 1); cherche(hs, -1);
  }

  // ------------------------------- stochastique + MACD
  function stoMacd(b, I, out) {
    for (let i = 1; i < I.n; i++) {
      const k = I.stoK, d = I.stoD;
      if (Number.isFinite(d[i - 1])) {
        if (k[i - 1] <= d[i - 1] && k[i] > d[i] && Math.min(k[i - 1], d[i]) < 20) out.push(sig('stomacd', 'Stochastique : croisement en survente', i, 'haussier', 2, `%K croise %D à la hausse sous 20 (%K = ${fmt(k[i])}) : rebond probable.`, cibles(I, i, 'haussier', lowest(I.L, 5, i) - 0.2 * I.atr[i])));
        if (k[i - 1] >= d[i - 1] && k[i] < d[i] && Math.max(k[i - 1], d[i]) > 80) out.push(sig('stomacd', 'Stochastique : croisement en surachat', i, 'baissier', 2, `%K croise %D à la baisse au-dessus de 80 (%K = ${fmt(k[i])}) : repli probable.`, cibles(I, i, 'baissier', highest(I.H, 5, i) + 0.2 * I.atr[i])));
      }
      const m = I.macd, s = I.macdSig;
      if (Number.isFinite(s[i - 1])) {
        if (m[i - 1] <= s[i - 1] && m[i] > s[i]) out.push(sig('stomacd', 'MACD : croisement haussier du signal', i, 'haussier', m[i] < 0 ? 2 : 1, `Le MACD passe au-dessus de sa ligne de signal ${m[i] < 0 ? 'sous zéro (achat sur creux, plus fiable)' : 'au-dessus de zéro'}.`, cibles(I, i, 'haussier')));
        if (m[i - 1] >= s[i - 1] && m[i] < s[i]) out.push(sig('stomacd', 'MACD : croisement baissier du signal', i, 'baissier', m[i] > 0 ? 2 : 1, `Le MACD passe sous sa ligne de signal ${m[i] > 0 ? 'au-dessus de zéro (vente sur sommet, plus fiable)' : 'sous zéro'}.`, cibles(I, i, 'baissier')));
      }
      if (Number.isFinite(m[i - 1])) {
        if (m[i - 1] <= 0 && m[i] > 0) out.push(sig('stomacd', 'MACD passe au-dessus de zéro', i, 'haussier', 2, 'La MME 12 repasse au-dessus de la MME 26 : la tendance de fond devient haussière.', cibles(I, i, 'haussier')));
        if (m[i - 1] >= 0 && m[i] < 0) out.push(sig('stomacd', 'MACD passe sous zéro', i, 'baissier', 2, 'La MME 12 repasse sous la MME 26 : la tendance de fond devient baissière.', cibles(I, i, 'baissier')));
      }
    }
    divergences(I, I.macd, 'MACD', 'stomacd', out);
    divergences(I, I.stoK, 'stochastique', 'stomacd', out);
  }

  // ------------------------------- RSI, CCI, momentum
  function oscillateurs(b, I, out) {
    for (let i = 1; i < I.n; i++) {
      const r = I.rsi;
      if (Number.isFinite(r[i - 1])) {
        if (r[i - 1] < 30 && r[i] >= 30) out.push(sig('oscillateurs', 'RSI : sortie de survente', i, 'haussier', 2, `Le RSI repasse au-dessus de 30 (${fmt(r[i])}) : fin de l’excès de baisse.`, cibles(I, i, 'haussier', lowest(I.L, 5, i) - 0.2 * I.atr[i])));
        if (r[i - 1] > 70 && r[i] <= 70) out.push(sig('oscillateurs', 'RSI : sortie de surachat', i, 'baissier', 2, `Le RSI repasse sous 70 (${fmt(r[i])}) : fin de l’excès de hausse.`, cibles(I, i, 'baissier', highest(I.H, 5, i) + 0.2 * I.atr[i])));
        if (r[i - 1] <= 50 && r[i] > 50 && tendance(I, i) > 0) out.push(sig('oscillateurs', 'RSI repasse au-dessus de 50', i, 'haussier', 1, 'Le RSI retrouve sa zone haussière dans une tendance montante.', cibles(I, i, 'haussier')));
        if (r[i - 1] >= 50 && r[i] < 50 && tendance(I, i) < 0) out.push(sig('oscillateurs', 'RSI repasse sous 50', i, 'baissier', 1, 'Le RSI retombe dans sa zone baissière dans une tendance descendante.', cibles(I, i, 'baissier')));
      }
      const c = I.cci;
      if (Number.isFinite(c[i - 1])) {
        if (c[i - 1] < -100 && c[i] >= -100) out.push(sig('oscillateurs', 'CCI : remontée au-dessus de −100', i, 'haussier', 2, `Le CCI sort de sa zone extrême basse (${fmt(c[i])}) : achat.`, cibles(I, i, 'haussier', lowest(I.L, 5, i) - 0.2 * I.atr[i])));
        if (c[i - 1] > 100 && c[i] <= 100) out.push(sig('oscillateurs', 'CCI : retombée sous +100', i, 'baissier', 2, `Le CCI sort de sa zone extrême haute (${fmt(c[i])}) : vente.`, cibles(I, i, 'baissier', highest(I.H, 5, i) + 0.2 * I.atr[i])));
      }
      const m = I.mom;
      if (Number.isFinite(m[i - 1])) {
        if (m[i - 1] <= 0 && m[i] > 0) out.push(sig('oscillateurs', 'Momentum : passage au-dessus de zéro', i, 'haussier', 1, 'La clôture dépasse celle d’il y a 10 barres : la vitesse redevient haussière.', cibles(I, i, 'haussier')));
        if (m[i - 1] >= 0 && m[i] < 0) out.push(sig('oscillateurs', 'Momentum : passage sous zéro', i, 'baissier', 1, 'La clôture passe sous celle d’il y a 10 barres : la vitesse redevient baissière.', cibles(I, i, 'baissier')));
      }
    }
    divergences(I, I.rsi, 'RSI', 'oscillateurs', out);
    divergences(I, I.cci, 'CCI', 'oscillateurs', out);
  }

  // ------------------------------- Fibonacci
  const FIB = [0.236, 0.382, 0.5, 0.618, 0.786];
  function fibonacci(b, I, out) {
    const z = I.zz.filter((q) => q.conf < I.n);
    for (let k = 2; k < z.length; k++) {
      const [A, B, C] = z.slice(k - 2, k + 1);
      const amp = B.p - A.p; // >0 impulsion haussière
      if (Math.abs(amp) < 3 * I.atr[B.i]) continue;
      const ret = (B.p - C.p) / amp;
      if (ret < 0.3 || ret > 0.82) continue;
      let niv = FIB.reduce((m, f) => (Math.abs(f - ret) < Math.abs(m - ret) ? f : m), FIB[0]);
      if (Math.abs(niv - ret) > 0.05) continue;
      const dir = amp > 0 ? 'haussier' : 'baissier';
      const i = Math.min(I.n - 1, C.conf);
      const s = sig('fibonacci', `Correction stoppée sur ${pct(niv)} de Fibonacci`, i, dir, niv >= 0.382 && niv <= 0.618 ? 2 : 1, `Le repli s’est arrêté à ${pct(ret)} du mouvement précédent (niveau ${pct(niv)}) : la tendance ${amp > 0 ? 'haussière' : 'baissière'} reste valide. Objectifs : 100 % (${fmt(B.p)}) puis extension 161,8 % (${fmt(A.p + 1.618 * amp)}).`, { entree: I.C[i], stop: amp > 0 ? A.p + amp * (1 - 0.786) - 0.1 * I.atr[i] : A.p + amp * (1 - 0.786) + 0.1 * I.atr[i], objectif: A.p + 1.272 * amp });
      if ((dir === 'haussier' && I.C[i] < C.p) || (dir === 'baissier' && I.C[i] > C.p)) continue;
      s.debut = A.i;
      const fx = Math.min(I.n - 1, C.i + 20);
      s.lignes = [0, ...FIB, 1].map((f) => ligne(A.i, B.p - f * amp, fx, B.p - f * amp, f === niv ? 'accent' : 'neutre', f !== niv));
      s.lignes.forEach((l, j) => { l.etiquette = pct([0, ...FIB, 1][j]); });
      s.points = [{ i: A.i, p: A.p, t: '0' }, { i: B.i, p: B.p, t: '100' }, { i: C.i, p: C.p, t: '' }];
      out.push(s);
    }
    // état actuel : où en est le prix dans le dernier mouvement
    if (z.length >= 2) {
      const A = z[z.length - 2], B = z[z.length - 1];
      const amp = B.p - A.p, i = I.n - 1;
      if (Math.abs(amp) > 3 * I.atr[i]) {
        const ret = (B.p - I.C[i]) / amp;
        if (ret > 0.2 && ret < 0.85) {
          const niv = FIB.reduce((m, f) => (Math.abs(f - ret) < Math.abs(m - ret) ? f : m), FIB[0]);
          const s = sig('fibonacci', `Prix dans la zone de retracement (${pct(ret)})`, i, 'neutre', 1, `Le cours corrige ${pct(ret)} du dernier mouvement ${amp > 0 ? 'haussier' : 'baissier'}. Niveau le plus proche : ${pct(niv)} à ${fmt(B.p - niv * amp)}. Une réaction sur 38,2–61,8 % relancerait la tendance.`);
          s.debut = A.i; s.enCours = true;
          s.lignes = [0, ...FIB, 1].map((f) => Object.assign(ligne(A.i, B.p - f * amp, i + 10, B.p - f * amp, 'neutre', true), { etiquette: pct(f) }));
          out.push(s);
        }
      }
    }
  }

  // ------------------------------- Turtle Soup
  function turtleSoup(b, I, out) {
    const N = 20;
    for (let i = N + 1; i < I.n; i++) {
      // achat
      const basPrec = lowest(I.L, N, i - 1); // plus bas des 20 barres avant i
      let idx = -1; for (let j = i - 1; j >= i - N; j--) if (I.L[j] === basPrec) { idx = j; break; }
      if (I.L[i] < basPrec && i - idx >= 4) {
        if (I.C[i] > basPrec) push('Turtle Soup achat', i, 'haussier', idx, basPrec, I.L[i], 'Nouveau plus bas 20 barres mais clôture revenue au-dessus de l’ancien plus bas : faux cassement, piège à vendeurs.');
        else if (i + 1 < I.n && I.C[i + 1] > basPrec && I.L[i + 1] >= I.L[i] - 0.5 * I.atr[i]) push('Turtle Soup +1 achat', i + 1, 'haussier', idx, basPrec, Math.min(I.L[i], I.L[i + 1]), 'Clôture sous l’ancien plus bas 20 barres puis réintégration la barre suivante : faux cassement.');
      }
      const hautPrec = highest(I.H, N, i - 1);
      let jdx = -1; for (let j = i - 1; j >= i - N; j--) if (I.H[j] === hautPrec) { jdx = j; break; }
      if (I.H[i] > hautPrec && i - jdx >= 4) {
        if (I.C[i] < hautPrec) push('Turtle Soup vente', i, 'baissier', jdx, hautPrec, I.H[i], 'Nouveau plus haut 20 barres mais clôture revenue sous l’ancien plus haut : faux cassement, piège à acheteurs.');
        else if (i + 1 < I.n && I.C[i + 1] < hautPrec && I.H[i + 1] <= I.H[i] + 0.5 * I.atr[i]) push('Turtle Soup +1 vente', i + 1, 'baissier', jdx, hautPrec, Math.max(I.H[i], I.H[i + 1]), 'Clôture au-dessus de l’ancien plus haut 20 barres puis réintégration la barre suivante : faux cassement.');
      }
    }
    function push(nom, i, dir, idx, niveau, extreme, texte) {
      const stop = dir === 'haussier' ? extreme - 0.1 * I.atr[i] : extreme + 0.1 * I.atr[i];
      const s = sig('turtlesoup', nom, i, dir, 2 + (I.rsi[i] < 35 && dir === 'haussier' || I.rsi[i] > 65 && dir === 'baissier' ? 1 : 0), texte + ' Stop au-delà de l’extrême, sortie rapide (2 à 4 barres) ou stop suiveur.', cibles(I, i, dir, stop));
      s.debut = idx; s.lignes = [ligne(idx, niveau, i, niveau, dir, true)];
      out.push(s);
    }
  }

  // ------------------------------- Vague de Wolfe
  function wolfe(b, I, out) {
    const z = I.zz.filter((q) => q.conf < I.n);
    for (let k = 4; k < z.length; k++) {
      const [p1, p2, p3, p4, p5] = z.slice(k - 4, k + 1);
      const haus = p1.type === 'B';
      const d13 = droite([p1, p3]), d24 = droite([p2, p4]), d14 = droite([p1, p4]);
      const tol = 0.5 * I.atr[p5.i];
      let ok;
      if (haus) ok = p3.p < p1.p && p4.p < p2.p && p4.p > p1.p && p5.p < p3.p && p5.p <= d13.at(p5.i) + tol && d14.a > d13.a;
      else ok = p3.p > p1.p && p4.p > p2.p && p4.p < p1.p && p5.p > p3.p && p5.p >= d13.at(p5.i) - tol && d14.a < d13.a;
      if (!ok) continue;
      // convergence 1-3 / 2-4
      const lgD = Math.abs(d24.at(p1.i) - d13.at(p1.i)), lgF = Math.abs(d24.at(p5.i) - d13.at(p5.i));
      if (lgF >= lgD) continue;
      const i = Math.min(I.n - 1, p5.conf);
      const dir = haus ? 'haussier' : 'baissier';
      const cible = d14.at(Math.min(I.n - 1 + 20, p5.i + (p5.i - p1.i)));
      const s = sig('wolfe', `Vague de Wolfe ${haus ? 'haussière' : 'baissière'}`, i, dir, 3, `Cinq vagues : le point 5 dépasse la droite 1-3. Entrée sur le point 5, objectif sur la droite 1-4 prolongée (≈ ${fmt(cible)}).`, { entree: I.C[i], stop: haus ? p5.p - 0.5 * I.atr[i] : p5.p + 0.5 * I.atr[i], objectif: cible });
      s.debut = p1.i;
      const fx = Math.min(I.n - 1 + 20, p5.i + Math.round((p5.i - p1.i) * 0.6));
      s.lignes = [ligne(p1.i, p1.p, fx, d13.at(fx), 'neutre'), ligne(p2.i, p2.p, p4.i, p4.p, 'neutre'), ligne(p1.i, p1.p, fx, d14.at(fx), 'accent', true)];
      s.points = [p1, p2, p3, p4, p5].map((q, j) => ({ i: q.i, p: q.p, t: String(j + 1) }));
      out.push(s);
    }
  }

  // ------------------------------- 1-2-3 Dow
  function dow123(b, I, out) {
    const z = I.zz.filter((q) => q.conf < I.n);
    for (let k = 2; k < z.length; k++) {
      const [P1, P2, P3] = z.slice(k - 2, k + 1);
      // retournement haussier : P1 creux, P2 pic, P3 creux plus haut
      if (P1.type === 'B' && P3.p > P1.p && P2.p - P1.p > 1.5 * I.atr[P2.i]) {
        // il faut une baisse avant P1 : au moins deux sommets descendants
        const hAv = z.filter((q) => q.type === 'H' && q.i < P1.i).slice(-2);
        if (hAv.length < 2 || !(hAv[1].p < hAv[0].p)) continue;
        const oblique = droite(hAv);
        const casseOblique = P2.p > oblique.at(P2.i);
        const i = premiereCassure(I, P2.p, P3.i + 1, 1, P3.i + 3 * (P3.i - P1.i) + 5);
        if (i < 0) {
          if (k === z.length - 1) { const s = base(i, true); out.push(s); }
          continue;
        }
        const s = base(i, false); out.push(s);
        function base(ii, enCours) {
          const div = rsiDiv(P1, 'B');
          const s = sig('dow123', enCours ? '1-2-3 haussier en formation' : '1-2-3 Dow : retournement haussier', enCours ? I.n - 1 : ii, enCours ? 'neutre' : 'haussier', enCours ? 1 : 1 + (casseOblique ? 1 : 0) + (div ? 1 : 0),
            `${casseOblique ? 'L’oblique de résistance de la baisse est cassée. ' : ''}(1) creux à ${fmt(P1.p)}, (2) pic à ${fmt(P2.p)}, (3) creux plus haut à ${fmt(P3.p)}. ${enCours ? `Signal d’achat si clôture au-dessus de ${fmt(P2.p)}.` : 'La cassure du pic (2) valide le retournement selon Dow.'}${div ? ' Divergence haussière du RSI au point (1).' : ''}`);
          s.debut = hAv[0].i; s.enCours = enCours;
          s.points = [{ i: P1.i, p: P1.p, t: '1' }, { i: P2.i, p: P2.p, t: '2' }, { i: P3.i, p: P3.p, t: '3' }];
          const fx = enCours ? I.n - 1 : ii;
          s.lignes = [ligne(hAv[0].i, hAv[0].p, P2.i, oblique.at(P2.i), 'baissier'), ligne(P2.i, P2.p, fx, P2.p, 'haussier', true)];
          if (!enCours) { s.entree = I.C[ii]; s.stop = P3.p - 0.2 * I.atr[ii]; s.objectif = P2.p + (P2.p - P1.p); }
          return s;
        }
      }
      if (P1.type === 'H' && P3.p < P1.p && P1.p - P2.p > 1.5 * I.atr[P2.i]) {
        const bAv = z.filter((q) => q.type === 'B' && q.i < P1.i).slice(-2);
        if (bAv.length < 2 || !(bAv[1].p > bAv[0].p)) continue;
        const oblique = droite(bAv);
        const casseOblique = P2.p < oblique.at(P2.i);
        const i = premiereCassure(I, P2.p, P3.i + 1, -1, P3.i + 3 * (P3.i - P1.i) + 5);
        const enCours = i < 0;
        if (enCours && k !== z.length - 1) continue;
        const div = rsiDiv(P1, 'H');
        const s = sig('dow123', enCours ? '1-2-3 baissier en formation' : '1-2-3 Dow : retournement baissier', enCours ? I.n - 1 : i, enCours ? 'neutre' : 'baissier', enCours ? 1 : 1 + (casseOblique ? 1 : 0) + (div ? 1 : 0),
          `${casseOblique ? 'L’oblique de support de la hausse est cassée. ' : ''}(1) sommet à ${fmt(P1.p)}, (2) creux à ${fmt(P2.p)}, (3) sommet plus bas à ${fmt(P3.p)}. ${enCours ? `Signal de vente si clôture sous ${fmt(P2.p)}.` : 'La cassure du creux (2) valide le retournement selon Dow.'}${div ? ' Divergence baissière du RSI au point (1).' : ''}`);
        s.debut = bAv[0].i; s.enCours = enCours;
        s.points = [{ i: P1.i, p: P1.p, t: '1' }, { i: P2.i, p: P2.p, t: '2' }, { i: P3.i, p: P3.p, t: '3' }];
        const fx = enCours ? I.n - 1 : i;
        s.lignes = [ligne(bAv[0].i, bAv[0].p, P2.i, oblique.at(P2.i), 'haussier'), ligne(P2.i, P2.p, fx, P2.p, 'baissier', true)];
        if (!enCours) { s.entree = I.C[i]; s.stop = P3.p + 0.2 * I.atr[i]; s.objectif = P2.p - (P1.p - P2.p); }
        out.push(s);
      }
    }
    function rsiDiv(P, type) {
      const prec = I.pivots.filter((q) => q.type === type && q.i < P.i && P.i - q.i <= 60).slice(-1)[0];
      if (!prec || !Number.isFinite(I.rsi[prec.i]) || !Number.isFinite(I.rsi[P.i])) return false;
      return type === 'B' ? P.p < prec.p && I.rsi[P.i] > I.rsi[prec.i] : P.p > prec.p && I.rsi[P.i] < I.rsi[prec.i];
    }
  }

  // ------------------------------- sorties : SAR + stop suiveur ATR
  function sorties(b, I, out) {
    const { sar, sens } = I.sar;
    for (let i = 2; i < I.n; i++) {
      if (sens[i] !== sens[i - 1] && sens[i - 1] !== 0) {
        const dir = sens[i] > 0 ? 'haussier' : 'baissier';
        out.push(sig('sorties', `SAR parabolique : retournement ${sens[i] > 0 ? 'haussier' : 'baissier'}`, i, dir, 1, `Le SAR passe ${sens[i] > 0 ? 'sous' : 'au-dessus'} des prix : sortie des positions ${sens[i] > 0 ? 'vendeuses' : 'acheteuses'}${sens[i] > 0 ? ', éventuel achat' : ', éventuelle vente'}. Stop suiveur à ${fmt(sar[i])}.`, { stop: sar[i], entree: I.C[i] }));
      }
    }
    const i = I.n - 1;
    if (i >= 22) {
      const ceL = highest(I.H, 22, i) - 3 * I.atr[i], ceC = lowest(I.L, 22, i) + 3 * I.atr[i];
      const s = sig('sorties', 'Stops suiveurs du moment', i, 'neutre', 1, `Position acheteuse : stop suiveur ATR (chandelier exit) à ${fmt(ceL)}, SAR à ${fmt(sens[i] > 0 ? sar[i] : NaN)}. Position vendeuse : stop ATR à ${fmt(ceC)}${sens[i] < 0 ? `, SAR à ${fmt(sar[i])}` : ''}. ATR 14 = ${fmt(I.atr[i])}.`);
      s.lignes = [ligne(i - 22, ceL, i + 5, ceL, 'haussier', true), ligne(i - 22, ceC, i + 5, ceC, 'baissier', true)];
      s.lignes[0].etiquette = 'stop long'; s.lignes[1].etiquette = 'stop court';
      s.enCours = true; s.debut = i - 22;
      out.push(s);
      // un franchissement récent du chandelier exit
      for (let j = Math.max(23, i - 10); j <= i; j++) {
        const cl = highest(I.H, 22, j - 1) - 3 * I.atr[j - 1], cc = lowest(I.L, 22, j - 1) + 3 * I.atr[j - 1];
        if (I.C[j] < cl && I.C[j - 1] >= cl) out.push(sig('sorties', 'Clôture sous le stop suiveur ATR', j, 'baissier', 2, 'La clôture passe sous le chandelier exit (plus haut 22 − 3 ATR) : sortir des positions acheteuses.', { stop: cl }));
        if (I.C[j] > cc && I.C[j - 1] <= cc) out.push(sig('sorties', 'Clôture au-dessus du stop suiveur ATR', j, 'haussier', 2, 'La clôture passe au-dessus du chandelier exit (plus bas 22 + 3 ATR) : sortir des positions vendeuses.', { stop: cc }));
      }
    }
  }

  // ------------------------------- points pivots
  function periodes(b, type) {
    // renvoie un identifiant de période par barre
    const dates = b.map((x) => parseDate(x.t));
    const okDates = dates.filter(Boolean).length > b.length * 0.8;
    return b.map((x, i) => {
      if (!okDates || !dates[i]) return Math.floor(i / (type === 'S' ? 5 : 20));
      const d = dates[i];
      if (type === 'M') return d.getFullYear() * 12 + d.getMonth();
      const j = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
      const jour = (j.getUTCDay() + 6) % 7; j.setUTCDate(j.getUTCDate() - jour);
      return Math.floor(j.getTime() / 864e5);
    });
  }
  function niveauxPivots(b, I, type) {
    const per = periodes(b, type);
    const res = new Array(b.length).fill(null);
    let cur = per[0], h = -Infinity, l = Infinity, c = NaN, prec = null;
    for (let i = 0; i < b.length; i++) {
      if (per[i] !== cur) {
        const P = (h + l + c) / 3;
        prec = { P, R1: 2 * P - l, S1: 2 * P - h, R2: P + (h - l), S2: P - (h - l), R3: h + 2 * (P - l), S3: l - 2 * (h - P) };
        cur = per[i]; h = -Infinity; l = Infinity;
      }
      res[i] = prec;
      h = Math.max(h, I.H[i]); l = Math.min(l, I.L[i]); c = I.C[i];
    }
    return res;
  }
  function pointsPivots(b, I, out) {
    for (const [type, lib] of [['S', 'hebdomadaire'], ['M', 'mensuel']]) {
      const nv = niveauxPivots(b, I, type);
      for (let i = 1; i < I.n; i++) {
        const v = nv[i];
        if (!v || nv[i - 1] !== v) continue; // même période seulement
        for (const [cle, dirH] of [['R1', 'haussier'], ['P', 'haussier'], ['S1', 'haussier']]) {
          if (type === 'S' && cle === 'P') continue;
          const x = v[cle];
          if (I.C[i - 1] <= x && I.C[i] > x && !(type === 'S' && cle === 'S1')) out.push(sig('pivots', `Franchissement du ${cle} ${lib}`, i, dirH, cle === 'R1' ? 2 : 1, `Clôture au-dessus du ${cle === 'P' ? 'pivot' : cle} ${lib} (${fmt(x)}). Prochain niveau : ${fmt(cle === 'S1' ? v.P : cle === 'P' ? v.R1 : v.R2)}.`, { entree: I.C[i], stop: cle === 'S1' ? v.S2 : cle === 'P' ? v.S1 : v.P, objectif: cle === 'S1' ? v.P : cle === 'P' ? v.R1 : v.R2 }));
          if (I.C[i - 1] >= x && I.C[i] < x && !(type === 'S' && cle === 'R1')) out.push(sig('pivots', `Cassure du ${cle} ${lib}`, i, 'baissier', cle === 'S1' ? 2 : 1, `Clôture sous le ${cle === 'P' ? 'pivot' : cle} ${lib} (${fmt(x)}). Prochain niveau : ${fmt(cle === 'R1' ? v.P : cle === 'P' ? v.S1 : v.S2)}.`, { entree: I.C[i], stop: cle === 'R1' ? v.R2 : cle === 'P' ? v.R1 : v.P, objectif: cle === 'R1' ? v.P : cle === 'P' ? v.S1 : v.S2 }));
        }
      }
      // niveaux pour la prochaine période (en cours)
      const i = I.n - 1, v = nv[i];
      if (v) {
        const s = sig('pivots', `Points pivots ${lib}s en vigueur`, i, I.C[i] > v.P ? 'haussier' : 'baissier', 1, `P ${fmt(v.P)} · R1 ${fmt(v.R1)} · R2 ${fmt(v.R2)} · R3 ${fmt(v.R3)} · S1 ${fmt(v.S1)} · S2 ${fmt(v.S2)} · S3 ${fmt(v.S3)}. Le prix est ${I.C[i] > v.P ? 'au-dessus' : 'en dessous'} du pivot : biais ${I.C[i] > v.P ? 'haussier' : 'baissier'}.`);
        let deb = i; while (deb > 0 && nv[deb - 1] === v) deb--;
        s.debut = deb; s.enCours = true; s.niveaux = v;
        s.lignes = ['R3', 'R2', 'R1', 'P', 'S1', 'S2', 'S3'].map((k) => Object.assign(ligne(deb, v[k], i + 5, v[k], k === 'P' ? 'accent' : k[0] === 'R' ? 'baissier' : 'haussier', true), { etiquette: k }));
        out.push(s);
      }
    }
  }

  // ---------------------------------------------------------------- dates
  function parseDate(t) {
    if (!t) return null;
    if (t instanceof Date) return t;
    const s = String(t).trim();
    let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
    if (m) { let y = +m[3]; if (y < 100) y += 2000; return new Date(y, +m[2] - 1, +m[1]); }
    return null;
  }

  // ---------------------------------------------------------------- lecture des données
  const ALIAS = {
    t: ['date', 'time', 'datetime', 'jour', 'heure', 'timestamp', 'période', 'periode'],
    o: ['open', 'ouverture', 'ouv', 'o', 'premier'],
    h: ['high', 'haut', 'plus haut', '+haut', 'max', 'h', 'plushaut'],
    l: ['low', 'bas', 'plus bas', '+bas', 'min', 'l', 'b', 'plusbas'],
    c: ['close', 'clôture', 'cloture', 'clot', 'dernier', 'c', 'adj close', 'prix', 'cours', 'last', 'price', 'valeur'],
    v: ['volume', 'vol', 'v', 'volumes', 'quantité', 'qté'],
  };
  function nombre(s, decVirgule) {
    if (s == null) return NaN;
    let x = String(s).trim().replace(/[\s €$%]/g, '');
    if (!x) return NaN;
    if (decVirgule) x = x.replace(/\./g, '').replace(',', '.');
    else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(x)) x = x.replace(/,/g, '');
    else x = x.replace(',', '.');
    const m = x.match(/^([-+]?\d*\.?\d+(e[-+]?\d+)?)([kKmM])?$/);
    if (!m) return NaN;
    let v = parseFloat(m[1]);
    if (m[3]) v *= /k/i.test(m[3]) ? 1e3 : 1e6;
    return v;
  }
  function lireDonnees(texte) {
    const brut = String(texte || '').replace(/\r/g, '').trim();
    if (!brut) throw new Error('Aucune donnée.');
    let lignes = brut.split('\n').map((l) => l.trim()).filter(Boolean);
    // une seule ligne de nombres → liste de clôtures
    if (lignes.length === 1 || lignes.length === 2) {
      const toks = brut.split(/[\s;|]+/).filter(Boolean);
      if (toks.length >= 10 && toks.every((t) => Number.isFinite(nombre(t, /,\d{1,}$/.test(t) && !/\./.test(t))))) {
        return depuisClotures(toks.map((t) => nombre(t, /,/.test(t) && !/\./.test(t))));
      }
    }
    if (lignes.every((l) => /^[-+]?\d[\d\s\u00a0.]*(,\d+)?$/.test(l)) && lignes.some((l) => /,/.test(l))) {
      return depuisClotures(lignes.map((l) => nombre(l, true)));
    }
    const sep = ['\t', ';', ',', '|'].map((s) => [s, lignes.slice(0, 10).reduce((n, l) => n + (l.split(s).length - 1), 0)]).sort((a, b) => b[1] - a[1])[0];
    let delim = sep[1] > 0 ? sep[0] : /\s+/;
    const decVirgule = delim === ';' || delim === '\t' || (delim instanceof RegExp) ? /\d,\d/.test(brut) && !/\d\.\d/.test(brut.replace(/\d{1,2}\.\d{1,2}\.\d{2,4}/g, '')) : false;
    const split = (l) => (delim instanceof RegExp ? l.split(delim) : l.split(delim)).map((x) => x.trim().replace(/^"|"$/g, ''));
    let rows = lignes.map(split);
    // en-tête ?
    let col = null;
    const tete = rows[0].map((x) => x.toLowerCase().replace(/[._*]/g, ' ').trim());
    const numTete = rows[0].filter((x) => Number.isFinite(nombre(x, decVirgule))).length;
    if (numTete < rows[0].length / 2) {
      col = {};
      for (const k of Object.keys(ALIAS)) {
        let idx = tete.findIndex((h) => ALIAS[k].includes(h));
        if (idx < 0) idx = tete.findIndex((h) => ALIAS[k].some((a) => a.length > 2 && h.includes(a)));
        if (idx >= 0 && !Object.values(col).includes(idx)) col[k] = idx;
      }
      rows = rows.slice(1);
      if (col.c == null) {
        const nums = tete.map((_, j) => j).filter((j) => rows.slice(0, 5).every((r) => Number.isFinite(nombre(r[j], decVirgule))));
        if (!nums.length) throw new Error('Impossible de trouver la colonne des clôtures.');
        col.c = nums[nums.length - 1];
      }
    } else {
      const r0 = rows[0];
      const numIdx = r0.map((x, j) => (Number.isFinite(nombre(x, decVirgule)) && !parseDate(x) ? j : -1)).filter((j) => j >= 0);
      const dateIdx = r0.findIndex((x) => parseDate(x) || (!Number.isFinite(nombre(x, decVirgule)) && x));
      col = {};
      if (dateIdx >= 0) col.t = dateIdx;
      const nm = numIdx.filter((j) => j !== dateIdx);
      if (nm.length === 1) col.c = nm[0];
      else if (nm.length === 2) { col.c = nm[0]; col.v = nm[1]; }
      else if (nm.length >= 4) { [col.o, col.h, col.l, col.c] = nm; if (nm.length >= 5) col.v = nm[4]; }
      else col.c = nm[nm.length - 1];
    }
    const b = [];
    for (const r of rows) {
      const g = (k) => (col[k] == null ? NaN : nombre(r[col[k]], decVirgule));
      const c = g('c');
      if (!Number.isFinite(c)) continue;
      b.push({ t: col.t != null ? r[col.t] : null, o: g('o'), h: g('h'), l: g('l'), c, v: g('v') });
    }
    if (b.length < 5) throw new Error('Pas assez de lignes valides (au moins 5).');
    // ordre chronologique
    const d0 = parseDate(b[0].t), d1 = parseDate(b[b.length - 1].t);
    if (d0 && d1 && d0 > d1) b.reverse();
    return completer(b);
  }
  function depuisClotures(cl) {
    return completer(cl.map((c) => ({ t: null, o: NaN, h: NaN, l: NaN, c, v: NaN })));
  }
  function completer(b) {
    for (let i = 0; i < b.length; i++) {
      const x = b[i];
      if (!Number.isFinite(x.o)) x.o = i ? b[i - 1].c : x.c;
      if (!Number.isFinite(x.h)) x.h = Math.max(x.o, x.c);
      if (!Number.isFinite(x.l)) x.l = Math.min(x.o, x.c);
      x.h = Math.max(x.h, x.o, x.c); x.l = Math.min(x.l, x.o, x.c);
    }
    return b;
  }

  // ---------------------------------------------------------------- analyse complète
  const PARAMS = { mm: [20, 50, 200], bbN: 20, bbK: 2, rsiN: 14, stoN: 14, pivotK: 3, fenetreFigure: 80 };
  function analyser(barres, opts) {
    const p = Object.assign({}, PARAMS, opts || {});
    const n = barres.length;
    if (n < 10) throw new Error('Il faut au moins 10 barres.');
    if (!opts || opts.pivotK == null) p.pivotK = n < 60 ? 2 : n < 400 ? 3 : 5;
    // moyennes adaptées à la longueur
    if (n < 220) p.mm = n < 60 ? [5, 10, 20] : n < 120 ? [10, 20, 50] : [20, 50, 100];
    const I = calculer(barres, p);
    const out = [];
    const etapes = [
      () => chandeliers(barres, I, out), () => bollinger(barres, I, p, out), () => moyennes(barres, I, p, out), () => ichimoku(barres, I, out),
      () => figuresDroites(barres, I, p, out), () => eteEtDoubles(barres, I, out), () => andrews(barres, I, out), () => gaps(barres, I, out),
      () => stoMacd(barres, I, out), () => oscillateurs(barres, I, out), () => fibonacci(barres, I, out), () => turtleSoup(barres, I, out),
      () => wolfe(barres, I, out), () => dow123(barres, I, out), () => sorties(barres, I, out), () => pointsPivots(barres, I, out),
    ];
    const erreurs = [];
    for (const f of etapes) { try { f(); } catch (e) { erreurs.push(String(e && e.stack || e)); } }
    out.forEach((s) => { if (!Number.isFinite(s.debut)) s.debut = s.i; s.debut = Math.max(0, Math.min(s.debut, s.i)); });
    out.sort((a, b) => a.i - b.i || b.force - a.force);
    out.forEach((s, k) => (s.id = k));
    return { barres, I, signaux: out, params: p, synthese: synthese(I, out), erreurs };
  }

  function synthese(I, sx) {
    const fin = I.n - 1, fen = Math.max(5, Math.min(15, Math.round(I.n / 20)));
    let haus = 0, bais = 0;
    const recents = sx.filter((s) => s.i >= fin - fen && s.dir !== 'neutre');
    for (const s of recents) {
      const poids = s.force * (1 - (fin - s.i) / (fen + 1) * 0.6);
      if (s.dir === 'haussier') haus += poids; else bais += poids;
    }
    const tot = haus + bais;
    const score = tot ? Math.round((100 * (haus - bais)) / tot) : 0;
    const t = tendance(I, fin, 20);
    let verdict;
    if (!tot) verdict = 'Aucune configuration directionnelle récente';
    else if (score > 50) verdict = 'Configurations nettement haussières';
    else if (score > 15) verdict = 'Biais haussier';
    else if (score < -50) verdict = 'Configurations nettement baissières';
    else if (score < -15) verdict = 'Biais baissier';
    else verdict = 'Signaux contradictoires';
    return { score, haus, bais, fen, verdict, tendance: t, nbRecents: recents.length, rsi: I.rsi[fin], atr: I.atr[fin] };
  }

  // ---------------------------------------------------------------- données d'exemple
  function exemple(n = 320, graine = 7) {
    let s = graine;
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const gauss = () => { let u = 0; for (let k = 0; k < 6; k++) u += rnd(); return u - 3; };
    const b = []; let c = 100;
    const regimes = [[60, 0.25], [40, -0.35], [30, 0.02], [50, 0.4], [35, -0.05], [45, -0.3], [60, 0.3]];
    let d = new Date(2025, 0, 2);
    let r = 0, reste = regimes[0][0];
    for (let i = 0; i < n; i++) {
      if (reste-- <= 0) { r = (r + 1) % regimes.length; reste = regimes[r][0]; }
      const drift = regimes[r][1] * 0.01 * c * 0.3;
      const vol = c * 0.012 * (r === 2 ? 0.5 : 1);
      const o = c + gauss() * vol * 0.3 + (rnd() < 0.03 ? gauss() * vol * 3 : 0);
      const cl = o + drift + gauss() * vol;
      const h = Math.max(o, cl) + Math.abs(gauss()) * vol * 0.6;
      const l = Math.min(o, cl) - Math.abs(gauss()) * vol * 0.6;
      while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
      const t = d.toISOString().slice(0, 10);
      b.push({ t, o: +o.toFixed(2), h: +h.toFixed(2), l: +l.toFixed(2), c: +cl.toFixed(2), v: Math.round(1e5 * (1 + rnd() + Math.abs(cl - o) / vol)) });
      d.setDate(d.getDate() + 1);
      c = cl;
    }
    return b;
  }

  root.Tradosaure = { MODULES, analyser, lireDonnees, depuisClotures, completer, exemple, fmt, parseDate, PARAMS, niveauxPivots };
})(typeof window !== 'undefined' ? window : globalThis);
