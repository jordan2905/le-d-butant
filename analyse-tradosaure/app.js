/* Interface : saisie, graphique annoté (canvas), liste des détections, lecture d'image. */
(function () {
  'use strict';
  const T = window.Tradosaure;
  const $ = (id) => document.getElementById(id);
  const fmt = T.fmt;
  const MOD = Object.fromEntries(T.MODULES.map((m) => [m.id, m]));

  let R = null;          // résultat d'analyse
  let barres = null;
  let sel = null;        // signal sélectionné
  const vue = { deb: 0, nb: 150 };

  // ------------------------------------------------------------ couleurs (tokens CSS)
  let K = {};
  function lireCouleurs() {
    const cs = getComputedStyle(document.documentElement);
    for (const k of ['bg', 'surface', 'sunk', 'ink', 'muted', 'line', 'accent', 'accent-soft', 'hausse', 'baisse', 'neutre', 'grid', 'hausse-soft', 'baisse-soft', 'neutre-soft'])
      K[k] = cs.getPropertyValue('--' + k).trim();
    K.mono = cs.getPropertyValue('--mono').trim();
  }
  const couleurRole = (r) => ({ haussier: K.hausse, baissier: K.baisse, neutre: K.neutre, accent: K.accent }[r] || K.muted);
  function alpha(hex, a) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return hex;
    const v = parseInt(m[1], 16);
    return `rgba(${v >> 16},${(v >> 8) & 255},${v & 255},${a})`;
  }

  // ------------------------------------------------------------ onglets
  document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('.tabs button').forEach((x) => { x.setAttribute('aria-selected', x === b); $(x.dataset.p).hidden = x !== b; });
  }));

  // ------------------------------------------------------------ saisie
  const erreur = (m) => { $('erreur').textContent = m || ''; $('erreur').hidden = !m; };
  function versTexte(b) {
    return 'Date;Ouverture;Plus haut;Plus bas;Clôture;Volume\n' + b.map((x) => [x.t ?? '', ...[x.o, x.h, x.l, x.c, Number.isFinite(x.v) ? x.v : ''].map((v) => String(v).replace('.', ','))].join(';')).join('\n');
  }
  function charger(b, source) {
    barres = b;
    $('source').textContent = source + ' · ' + b.length + ' barres';
    analyser();
    vue.nb = Math.min(b.length, 160); vue.deb = Math.max(0, b.length - vue.nb + 8);
    dessiner();
  }
  function analyser() {
    if (!barres) return;
    const opts = { fenetreFigure: Math.max(20, +$('fen').value || 80) };
    if ($('sens').value) opts.pivotK = +$('sens').value;
    try {
      R = T.analyser(barres, opts);
      erreur(R.erreurs.length ? 'Certaines analyses ont échoué : ' + R.erreurs[0].split('\n')[0] : '');
    } catch (e) { erreur(e.message); return; }
    sel = null;
    remplirFiltres(); synthese(); liste(); fiche(); dessiner(); infoSel();
  }
  $('go').addEventListener('click', () => {
    try {
      const b = T.lireDonnees($('txt').value);
      try { localStorage.setItem('tradosaure-donnees', $('txt').value.slice(0, 400000)); } catch (e) { /* stockage indisponible */ }
      charger(b, 'Données saisies');
    } catch (e) { erreur(e.message); }
  });
  $('ex').addEventListener('click', () => { const b = T.exemple(); $('txt').value = versTexte(b); charger(b, 'Exemple (cours fictifs)'); });
  $('vider').addEventListener('click', () => { $('txt').value = ''; $('txt').focus(); });
  $('reanalyser').addEventListener('click', analyser);

  // fichier CSV
  const lireFichierTexte = (f) => {
    const r = new FileReader();
    r.onload = () => {
      let s = String(r.result);
      if (s.includes(String.fromCharCode(0xFFFD))) { const r2 = new FileReader(); r2.onload = () => fin(String(r2.result)); r2.readAsText(f, 'windows-1252'); return; }
      fin(s);
    };
    const fin = (s) => { $('txt').value = s; try { charger(T.lireDonnees(s), f.name); erreur(''); } catch (e) { erreur(f.name + ' : ' + e.message); } };
    r.readAsText(f, 'utf-8');
  };
  zoneDepot($('dropcsv'), $('filecsv'), lireFichierTexte);
  $('txt').addEventListener('dragover', (e) => e.preventDefault());
  $('txt').addEventListener('drop', (e) => { const f = e.dataTransfer.files[0]; if (f) { e.preventDefault(); if (/^image\//.test(f.type)) ouvrirImage(f); else lireFichierTexte(f); } });

  function zoneDepot(zone, input, cb) {
    zone.addEventListener('click', () => input.click());
    zone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
    input.addEventListener('change', () => { if (input.files[0]) cb(input.files[0]); input.value = ''; });
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('on'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('on'));
    zone.addEventListener('drop', (e) => { e.preventDefault(); zone.classList.remove('on'); const f = e.dataTransfer.files[0]; if (f) cb(f); });
  }

  // ------------------------------------------------------------ synthèse
  function synthese() {
    const s = R.synthese, I = R.I, n = I.n - 1, b = barres[n];
    const var1 = n ? (b.c / barres[n - 1].c - 1) * 100 : 0;
    const coul = s.score > 15 ? 'var(--hausse)' : s.score < -15 ? 'var(--baisse)' : 'var(--neutre)';
    const tend = s.tendance > 0 ? 'Haussière' : s.tendance < 0 ? 'Baissière' : 'Sans direction';
    $('synth').innerHTML = `
      <div><span class="label">Verdict sur les ${s.fen} dernières barres</span>
        <span class="verdict" style="color:${coul}">${s.verdict}</span>
        <div class="gauge" title="Score ${s.score}"><i style="left:${50 + s.score / 2}%"></i></div>
        <div class="gauge-l"><span>baissier</span><span>score ${s.score > 0 ? '+' : ''}${s.score}</span><span>haussier</span></div></div>
      <div><span class="label">Dernier cours</span><span class="v">${fmt(b.c)}</span><span class="meta" style="color:${var1 >= 0 ? 'var(--hausse)' : 'var(--baisse)'};font:12px var(--mono)">${var1 >= 0 ? '+' : ''}${var1.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %</span></div>
      <div><span class="label">Tendance (MM)</span><span class="v">${tend}</span></div>
      <div><span class="label">RSI 14</span><span class="v">${fmt(s.rsi)}</span><span style="font:12px var(--mono);color:var(--muted)">${s.rsi > 70 ? 'surachat' : s.rsi < 30 ? 'survente' : 'zone neutre'}</span></div>
      <div><span class="label">Signaux récents</span><span class="v">${s.nbRecents}</span><span style="font:12px var(--mono);color:var(--muted)">${R.signaux.length} au total</span></div>`;
  }

  // ------------------------------------------------------------ filtres + liste
  function remplirFiltres() {
    const f = $('fMod'), v = f.value;
    const cpt = {}; R.signaux.forEach((s) => (cpt[s.module] = (cpt[s.module] || 0) + 1));
    f.innerHTML = '<option value="">Tous les modules</option>' + T.MODULES.map((m) => `<option value="${m.id}">${m.titre} (${cpt[m.id] || 0})</option>`).join('');
    f.value = v;
  }
  ['fMod', 'fDir', 'fForce', 'fPer'].forEach((id) => $(id).addEventListener('change', () => { liste(); dessiner(); }));
  function filtres(s) {
    const mod = $('fMod').value, dir = $('fDir').value, fo = +$('fForce').value, per = +$('fPer').value;
    if (mod && s.module !== mod) return false;
    if (dir && s.dir !== dir) return false;
    if (s.force < fo && !(mod && s.enCours)) return false;
    if (per && s.i < R.I.n - per) return false;
    return true;
  }
  const dots = (f) => '●'.repeat(f) + '○'.repeat(3 - f);
  const dateDe = (i) => (barres[i] && barres[i].t) || (i < barres.length ? 'barre ' + (i + 1) : 'à venir');
  function liste() {
    const L = R.signaux.filter(filtres).slice().reverse();
    $('compte').textContent = `${L.length} affichée(s) sur ${R.signaux.length}`;
    if (!L.length) { $('list').innerHTML = '<div class="empty">Aucune configuration avec ces filtres. Élargissez la période ou baissez la force minimale.</div>'; return; }
    $('list').innerHTML = L.slice(0, 400).map((s) => `
      <button class="det ${s.dir} ${sel && sel.id === s.id ? 'sel' : ''}" data-id="${s.id}">
        <span class="bar"></span>
        <span>
          <span class="top"><span class="nom">${s.nom}</span><span class="dots" title="force ${s.force}/3">${dots(s.force)}</span></span>
          <span class="top" style="margin-top:3px"><span class="chip ${s.dir}">${s.dir}</span><span class="chip mod">${MOD[s.module] ? MOD[s.module].titre : s.module}</span><span class="meta">${dateDe(s.i)}${s.enCours ? ' · en cours' : ''}</span></span>
          <p>${s.texte}</p>
          ${niveaux(s)}
        </span>
      </button>`).join('');
  }
  const niveaux = (s) => {
    const parts = [];
    if (Number.isFinite(s.entree)) parts.push(`<span>entrée</span> ${fmt(s.entree)}`);
    if (Number.isFinite(s.stop)) parts.push(`<span>stop</span> ${fmt(s.stop)}`);
    if (Number.isFinite(s.objectif)) parts.push(`<span>objectif</span> ${fmt(s.objectif)}`);
    if (Number.isFinite(s.entree) && Number.isFinite(s.stop) && Number.isFinite(s.objectif) && s.entree !== s.stop) parts.push(`<span>R/R</span> 1:${fmt(Math.abs(s.objectif - s.entree) / Math.abs(s.entree - s.stop))}`);
    return parts.length ? `<span class="niveaux">${parts.map((p) => `<b style="font-weight:500">${p}</b>`).join('')}</span>` : '';
  };
  $('list').addEventListener('click', (e) => {
    const b = e.target.closest('.det'); if (!b) return;
    choisir(R.signaux[+b.dataset.id], true);
  });
  function choisir(s, centrer) {
    sel = s && sel && sel.id === s.id ? null : s;
    if (sel && centrer) {
      const larg = Math.max(40, (sel.i - sel.debut) + 30);
      vue.nb = Math.min(barres.length + 10, Math.max(vue.nb, larg));
      if (sel.debut < vue.deb || sel.i > vue.deb + vue.nb - 3) vue.deb = Math.round(Math.max(0, (sel.debut + sel.i) / 2 - vue.nb / 2));
      borner();
      $('chartbox').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
    }
    document.querySelectorAll('.det').forEach((x) => x.classList.toggle('sel', !!sel && +x.dataset.id === sel.id));
    infoSel(); dessiner();
  }
  function infoSel() {
    const box = $('selinfo');
    if (!sel) { box.hidden = true; return; }
    box.hidden = false;
    box.innerHTML = `<div class="top row"><b style="font:600 15px var(--display)">${sel.nom}</b><span class="chip ${sel.dir}">${sel.dir}</span><span class="dots">${dots(sel.force)}</span><span class="meta" style="font:12px var(--mono);color:var(--muted)">${dateDe(sel.debut)} → ${dateDe(sel.i)}</span></div><div>${sel.texte}</div>${niveaux(sel)}<div class="hint">Règle du module « ${MOD[sel.module].titre} » : ${MOD[sel.module].regles}</div>`;
  }

  // ------------------------------------------------------------ fiche des modules
  function fiche() {
    const cpt = {}, rec = {};
    R.signaux.forEach((s) => { cpt[s.module] = (cpt[s.module] || 0) + 1; if (s.i >= R.I.n - 30) rec[s.module] = (rec[s.module] || 0) + 1; });
    $('fiche').querySelector('tbody').innerHTML = T.MODULES.map((m) => `
      <tr class="clic" data-m="${m.id}"><td class="n">${m.niveau ? ['', 'I', 'II', 'III'][m.niveau] : '+'}</td>
      <td><div class="t">${m.titre}</div><div class="r">${m.regles}</div></td>
      <td class="n">${cpt[m.id] || 0}<br><span style="color:var(--muted)">${rec[m.id] || 0} récentes</span></td></tr>`).join('');
  }
  $('fiche').addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-m]'); if (!tr) return;
    $('fMod').value = tr.dataset.m; $('fForce').value = '1'; $('fPer').value = '0';
    liste(); dessiner();
    $('list').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  // ------------------------------------------------------------ graphique
  const cv = $('cv'), ctx = cv.getContext('2d');
  let geo = null;
  function borner() {
    const n = barres ? barres.length : 0;
    vue.nb = Math.max(15, Math.min(n + 30, vue.nb));
    vue.deb = Math.max(-5, Math.min(n - 5, vue.deb));
  }
  function dessiner() {
    if (!R) return;
    const dpr = window.devicePixelRatio || 1;
    const W = cv.clientWidth, H = cv.clientHeight;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const I = R.I, n = I.n;
    const sub = $('sub').value;
    const axeD = 64, padT = 10;
    const hSub = sub ? Math.round(H * 0.22) : 0;
    const hMain = H - hSub - 22 - (sub ? 10 : 0);
    const larg = W - axeD;
    const pas = larg / vue.nb;
    const x = (i) => (i - vue.deb + 0.5) * pas;
    const i0 = Math.max(0, Math.floor(vue.deb)), i1 = Math.min(n - 1, Math.ceil(vue.deb + vue.nb));
    // échelle prix
    let lo = Infinity, hi = -Infinity;
    for (let i = i0; i <= i1; i++) { lo = Math.min(lo, I.L[i]); hi = Math.max(hi, I.H[i]); }
    if ($('o-bb').checked) for (let i = i0; i <= i1; i++) if (Number.isFinite(I.bbB[i])) { lo = Math.min(lo, I.bbB[i]); hi = Math.max(hi, I.bbH[i]); }
    if (sel) for (const l of sel.lignes) { if (l.i2 >= vue.deb && l.i1 <= vue.deb + vue.nb) { lo = Math.min(lo, l.p1, l.p2); hi = Math.max(hi, l.p1, l.p2); } }
    if (sel) for (const v of [sel.stop, sel.objectif]) if (Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    if (!Number.isFinite(lo)) { lo = 0; hi = 1; }
    const m = (hi - lo) * 0.06 || 1; lo -= m; hi += m;
    const y = (p) => padT + (hi - p) / (hi - lo) * (hMain - padT);
    geo = { x, y, pas, hMain, W, H, axeD, i0, i1, lo, hi, hSub };

    ctx.font = `11px ${K.mono}`;
    // grille + axe
    const ticks = niceTicks(lo, hi, Math.max(3, Math.round(hMain / 60)));
    ctx.strokeStyle = K.grid; ctx.lineWidth = 1; ctx.fillStyle = K.muted; ctx.textBaseline = 'middle';
    for (const t of ticks) { const yy = Math.round(y(t)) + 0.5; ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(larg, yy); ctx.stroke(); ctx.fillText(fmt(t), larg + 6, yy); }
    // dates
    ctx.textBaseline = 'top'; ctx.textAlign = 'center';
    const tous = Math.max(1, Math.ceil(90 / pas));
    for (let i = i0; i <= i1; i++) if (i % tous === 0) { ctx.fillText(String(dateDe(i)).slice(0, 10), Math.max(34, Math.min(larg - 34, x(i))), H - 16); ctx.strokeStyle = K.grid; ctx.beginPath(); ctx.moveTo(Math.round(x(i)) + .5, padT); ctx.lineTo(Math.round(x(i)) + .5, hMain); ctx.stroke(); }
    ctx.textAlign = 'left';

    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, larg, hMain); ctx.clip();
    // zone sélectionnée
    if (sel) { ctx.fillStyle = alpha(couleurRole(sel.dir), 0.08); ctx.fillRect(x(sel.debut) - pas / 2, padT, x(sel.i) - x(sel.debut) + pas, hMain - padT); }
    // Ichimoku
    if ($('o-ichi').checked) {
      for (let i = Math.max(1, i0); i <= Math.min(n + 25, i1 + 26); i++) {
        const a0 = I.ssa[i - 1], b0 = I.ssb[i - 1], a1 = I.ssa[i], b1 = I.ssb[i];
        if (![a0, b0, a1, b1].every(Number.isFinite)) continue;
        ctx.fillStyle = alpha(a1 >= b1 ? K.hausse : K.baisse, 0.13);
        ctx.beginPath(); ctx.moveTo(x(i - 1), y(a0)); ctx.lineTo(x(i), y(a1)); ctx.lineTo(x(i), y(b1)); ctx.lineTo(x(i - 1), y(b0)); ctx.closePath(); ctx.fill();
      }
      courbe(I.tenkan, K.baisse, 1); courbe(I.kijun, K.accent, 1.3);
    }
    if ($('o-bb').checked) { courbe(I.bbH, K.muted, 1, [4, 3]); courbe(I.bbM, K.muted, 1); courbe(I.bbB, K.muted, 1, [4, 3]); }
    if ($('o-mm').checked) { const cs = [K.accent, K.neutre, K.ink]; R.params.mm.forEach((k, j) => courbe(I.mm[k], cs[j], 1.4)); }
    // bougies
    const cw = Math.max(1, Math.min(14, pas * 0.68));
    for (let i = i0; i <= i1; i++) {
      const b = barres[i], up = b.c >= b.o, col = up ? K.hausse : K.baisse;
      const xx = Math.round(x(i)) + 0.5;
      ctx.strokeStyle = col; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(xx, y(b.h)); ctx.lineTo(xx, y(b.l)); ctx.stroke();
      const yt = y(Math.max(b.o, b.c)), yb = y(Math.min(b.o, b.c));
      ctx.fillStyle = col;
      if (pas < 3) continue;
      ctx.fillRect(Math.round(x(i) - cw / 2), Math.round(yt), Math.round(cw), Math.max(1, Math.round(yb - yt)));
    }
    if ($('o-sar').checked) { ctx.fillStyle = K.ink; for (let i = i0; i <= i1; i++) if (Number.isFinite(I.sar.sar[i])) { ctx.beginPath(); ctx.arc(x(i), y(I.sar.sar[i]), 1.6, 0, 7); ctx.fill(); } }
    if ($('o-zz').checked) {
      ctx.strokeStyle = alpha(K.accent, 0.7); ctx.lineWidth = 1.2; ctx.setLineDash([]); ctx.beginPath();
      I.zz.forEach((q, j) => (j ? ctx.lineTo(x(q.i), y(q.p)) : ctx.moveTo(x(q.i), y(q.p)))); ctx.stroke();
    }
    // repères
    geo.reperes = [];
    if ($('o-mk').checked) {
      const parBarre = {};
      for (const s of R.signaux) {
        if (!filtres(s) || s.i < i0 || s.i > i1) continue;
        const k = s.i + (s.dir === 'baissier' ? 'b' : 'h');
        const rang = (parBarre[k] = (parBarre[k] || 0) + 1) - 1;
        const b = barres[s.i];
        const sz = Math.max(4, Math.min(7, pas * 0.45));
        const xx = x(s.i);
        let yy;
        if (s.dir === 'baissier') yy = y(b.h) - 8 - rang * (sz * 2 + 2);
        else yy = y(b.l) + 8 + rang * (sz * 2 + 2);
        const c = couleurRole(s.dir);
        ctx.fillStyle = c; ctx.strokeStyle = K.surface; ctx.lineWidth = 1;
        ctx.beginPath();
        if (s.dir === 'haussier') { ctx.moveTo(xx, yy - sz); ctx.lineTo(xx + sz, yy + sz * 0.8); ctx.lineTo(xx - sz, yy + sz * 0.8); }
        else if (s.dir === 'baissier') { ctx.moveTo(xx, yy + sz); ctx.lineTo(xx + sz, yy - sz * 0.8); ctx.lineTo(xx - sz, yy - sz * 0.8); }
        else ctx.arc(xx, yy, sz * 0.75, 0, 7);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        if (sel && sel.id === s.id) { ctx.strokeStyle = K.ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(xx, yy, sz + 4, 0, 7); ctx.stroke(); }
        geo.reperes.push({ x: xx, y: yy, s });
      }
    }
    // tracés du signal choisi
    if (sel) {
      for (const l of sel.lignes) {
        ctx.strokeStyle = couleurRole(l.coul); ctx.lineWidth = 1.8; ctx.setLineDash(l.tiret ? [6, 4] : []);
        ctx.beginPath(); ctx.moveTo(x(l.i1), y(l.p1)); ctx.lineTo(x(l.i2), y(l.p2)); ctx.stroke();
        if (l.etiquette) { ctx.setLineDash([]); ctx.fillStyle = couleurRole(l.coul); ctx.textBaseline = 'bottom'; ctx.fillText(l.etiquette, x(l.i1) + 3, y(l.p1) - 2); }
      }
      ctx.setLineDash([]);
      for (const q of sel.points) {
        ctx.fillStyle = K.ink; ctx.beginPath(); ctx.arc(x(q.i), y(q.p), 3.5, 0, 7); ctx.fill();
        if (q.t) { ctx.font = `600 12px ${K.mono}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'center'; const haut = barres[q.i] && q.p >= barres[q.i].h - 1e-9; const yy = y(q.p) + (haut ? -13 : 13); ctx.fillStyle = K.surface; ctx.fillRect(x(q.i) - 9, yy - 8, 18, 16); ctx.fillStyle = K.ink; ctx.fillText(q.t, x(q.i), yy); ctx.textAlign = 'left'; ctx.font = `11px ${K.mono}`; }
      }
      const niv = [['entrée', sel.entree, K.ink], ['stop', sel.stop, K.baisse], ['objectif', sel.objectif, K.hausse]];
      ctx.textBaseline = 'bottom';
      for (const [lib, v, c] of niv) {
        if (!Number.isFinite(v)) continue;
        ctx.strokeStyle = c; ctx.setLineDash([2, 3]); ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(x(sel.i), y(v)); ctx.lineTo(Math.min(larg, x(sel.i) + Math.max(80, 12 * pas)), y(v)); ctx.stroke();
        ctx.fillStyle = c; ctx.fillText(lib, x(sel.i) + 4, y(v) - 1);
      }
      ctx.setLineDash([]);
    }
    ctx.restore();
    // dernier cours sur l'axe
    const der = I.C[n - 1];
    if (der >= lo && der <= hi) { ctx.fillStyle = K.accent; ctx.fillRect(larg + 1, y(der) - 9, axeD - 2, 18); ctx.fillStyle = K.surface; ctx.textBaseline = 'middle'; ctx.fillText(fmt(der), larg + 6, y(der)); }

    // sous-graphique
    if (sub) {
      const top = hMain + 10, bas = top + hSub - 6;
      ctx.strokeStyle = K.line; ctx.beginPath(); ctx.moveTo(0, top - 5 + .5); ctx.lineTo(W, top - 5 + .5); ctx.stroke();
      let series = [], zones = [], lo2 = Infinity, hi2 = -Infinity, barresSub = null, nom = '';
      if (sub === 'rsi') { series = [[I.rsi, K.accent]]; zones = [30, 50, 70]; lo2 = 0; hi2 = 100; nom = 'RSI 14'; }
      if (sub === 'sto') { series = [[I.stoK, K.accent], [I.stoD, K.neutre]]; zones = [20, 80]; lo2 = 0; hi2 = 100; nom = 'Stochastique 14-3-3'; }
      if (sub === 'cci') { series = [[I.cci, K.accent]]; zones = [-100, 0, 100]; nom = 'CCI 20'; }
      if (sub === 'macd') { series = [[I.macd, K.accent], [I.macdSig, K.neutre]]; barresSub = I.macdHist; zones = [0]; nom = 'MACD 12-26-9'; }
      if (sub === 'vol') { barresSub = I.V.map((v) => (Number.isFinite(v) ? v : 0)); lo2 = 0; nom = I.aVolume ? 'Volume' : 'Volume (absent des données)'; }
      if (!Number.isFinite(hi2)) {
        for (let i = i0; i <= i1; i++) { for (const [s] of series) if (Number.isFinite(s[i])) { lo2 = Math.min(lo2, s[i]); hi2 = Math.max(hi2, s[i]); } if (barresSub && Number.isFinite(barresSub[i])) { lo2 = Math.min(lo2, barresSub[i], sub === 'vol' ? 0 : barresSub[i]); hi2 = Math.max(hi2, barresSub[i]); } }
        for (const z of zones) { lo2 = Math.min(lo2, z); hi2 = Math.max(hi2, z); }
        if (!Number.isFinite(lo2)) { lo2 = 0; hi2 = 1; }
        if (hi2 === lo2) hi2 = lo2 + 1;
      }
      const y2 = (v) => bas - (v - lo2) / (hi2 - lo2) * (bas - top);
      ctx.save(); ctx.beginPath(); ctx.rect(0, top - 4, larg, hSub); ctx.clip();
      ctx.setLineDash([3, 3]); ctx.strokeStyle = K.line;
      for (const z of zones) { ctx.beginPath(); ctx.moveTo(0, y2(z)); ctx.lineTo(larg, y2(z)); ctx.stroke(); }
      ctx.setLineDash([]);
      if (barresSub) for (let i = i0; i <= i1; i++) { const v = barresSub[i]; if (!Number.isFinite(v)) continue; const b = barres[i]; ctx.fillStyle = alpha(sub === 'vol' ? (b.c >= b.o ? K.hausse : K.baisse) : (v >= 0 ? K.hausse : K.baisse), 0.55); const z0 = y2(sub === 'vol' ? 0 : 0); ctx.fillRect(x(i) - cw / 2, Math.min(z0, y2(v)), cw, Math.abs(y2(v) - z0)); }
      for (const [s, c] of series) { ctx.strokeStyle = c; ctx.lineWidth = 1.3; ctx.beginPath(); let st = false; for (let i = i0; i <= i1; i++) { if (!Number.isFinite(s[i])) { st = false; continue; } if (!st) { ctx.moveTo(x(i), y2(s[i])); st = true; } else ctx.lineTo(x(i), y2(s[i])); } ctx.stroke(); }
      if (sel && sel.ind && ((sel.ind.serie === 'RSI' && sub === 'rsi') || (sel.ind.serie === 'MACD' && sub === 'macd') || (sel.ind.serie === 'CCI' && sub === 'cci') || (sel.ind.serie === 'stochastique' && sub === 'sto'))) {
        ctx.strokeStyle = couleurRole(sel.dir); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x(sel.ind.a[0]), y2(sel.ind.a[1])); ctx.lineTo(x(sel.ind.c[0]), y2(sel.ind.c[1])); ctx.stroke();
      }
      ctx.restore();
      ctx.fillStyle = K.muted; ctx.textBaseline = 'top'; ctx.fillText(nom, 4, top - 2);
      ctx.textBaseline = 'middle';
      for (const z of (zones.length ? zones : [hi2])) ctx.fillText(fmt(z), larg + 6, y2(z));
    }
    function courbe(s, c, w, dash) {
      ctx.strokeStyle = c; ctx.lineWidth = w; ctx.setLineDash(dash || []); ctx.beginPath(); let st = false;
      for (let i = i0; i <= i1; i++) { if (!Number.isFinite(s[i])) { st = false; continue; } if (!st) { ctx.moveTo(x(i), y(s[i])); st = true; } else ctx.lineTo(x(i), y(s[i])); }
      ctx.stroke(); ctx.setLineDash([]);
    }
  }
  function niceTicks(lo, hi, n) {
    const brut = (hi - lo) / n, p = Math.pow(10, Math.floor(Math.log10(brut))), r = brut / p;
    const st = (r < 1.5 ? 1 : r < 3 ? 2 : r < 7 ? 5 : 10) * p;
    const t = []; for (let v = Math.ceil(lo / st) * st; v <= hi; v += st) t.push(+v.toFixed(10));
    return t;
  }

  // interactions graphe
  const pointeurs = new Map();
  let glisse = null, pince = null;
  cv.addEventListener('pointerdown', (e) => {
    cv.setPointerCapture(e.pointerId);
    pointeurs.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    if (pointeurs.size === 1) glisse = { x0: e.offsetX, deb0: vue.deb, bouge: false };
    if (pointeurs.size === 2) { const [a, b] = [...pointeurs.values()]; pince = { d0: Math.abs(a.x - b.x) || 1, nb0: vue.nb }; glisse = null; }
  });
  cv.addEventListener('pointermove', (e) => {
    if (!geo) return;
    if (pointeurs.has(e.pointerId)) pointeurs.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    if (pince && pointeurs.size === 2) {
      const [a, b] = [...pointeurs.values()]; const d = Math.abs(a.x - b.x) || 1;
      zoomer(pince.nb0 * pince.d0 / d / vue.nb, (a.x + b.x) / 2); return;
    }
    if (glisse && pointeurs.size === 1) {
      const dx = e.offsetX - glisse.x0;
      if (Math.abs(dx) > 3) glisse.bouge = true;
      if (glisse.bouge) { vue.deb = glisse.deb0 - dx / geo.pas; borner(); dessiner(); $('tip').hidden = true; return; }
    }
    survol(e.offsetX, e.offsetY);
  });
  const fin = (e) => {
    pointeurs.delete(e.pointerId);
    if (glisse && !glisse.bouge && e.type === 'pointerup') clic(e.offsetX, e.offsetY);
    if (pointeurs.size < 2) pince = null;
    if (!pointeurs.size) glisse = null;
  };
  cv.addEventListener('pointerup', fin); cv.addEventListener('pointercancel', fin);
  cv.addEventListener('pointerleave', () => { $('tip').hidden = true; });
  cv.addEventListener('wheel', (e) => { e.preventDefault(); zoomer(Math.exp(e.deltaY * 0.0015), e.offsetX); }, { passive: false });
  function zoomer(f, px) {
    const i = vue.deb + px / geo.pas;
    vue.nb = vue.nb * f; borner();
    vue.deb = i - px / ((geo.W - geo.axeD) / vue.nb); borner();
    dessiner();
  }
  function reperePres(px, py) {
    let best = null, d = 14;
    for (const r of geo.reperes || []) { const dd = Math.hypot(r.x - px, r.y - py); if (dd < d) { d = dd; best = r; } }
    return best;
  }
  function clic(px, py) {
    const r = reperePres(px, py);
    if (r) { choisir(r.s, false); const el = document.querySelector(`.det[data-id="${r.s.id}"]`); if (el) el.scrollIntoView({ block: 'nearest' }); return; }
    // clic sur une barre : choisir le signal le plus fort de la barre
    const i = Math.round(vue.deb + px / geo.pas - 0.5);
    const s = R.signaux.filter((q) => q.i === i && filtres(q)).sort((a, b) => b.force - a.force)[0];
    if (s) choisir(s, false);
  }
  function survol(px, py) {
    const tip = $('tip');
    const i = Math.round(vue.deb + px / geo.pas - 0.5);
    if (i < 0 || i >= barres.length || px > geo.W - geo.axeD) { tip.hidden = true; return; }
    const b = barres[i];
    const sx = R.signaux.filter((q) => q.i === i && filtres(q));
    tip.innerHTML = `<b>${dateDe(i)}</b><br>O ${fmt(b.o)} · H ${fmt(b.h)}<br>B ${fmt(b.l)} · C ${fmt(b.c)}${Number.isFinite(b.v) ? '<br>Vol ' + fmt(b.v) : ''}` + (sx.length ? '<hr style="border:0;border-top:1px solid var(--line);margin:5px 0">' + sx.slice(0, 5).map((s) => `<span style="color:${couleurRole(s.dir)}">${s.dir === 'haussier' ? '▲' : s.dir === 'baissier' ? '▼' : '●'}</span> ${s.nom}`).join('<br>') : '');
    tip.hidden = false;
    const bw = tip.offsetWidth, bh = tip.offsetHeight;
    tip.style.left = (px + 14 + bw > geo.W ? px - bw - 14 : px + 14) + 'px';
    tip.style.top = Math.max(4, Math.min(geo.H - bh - 4, py - bh / 2)) + 'px';
  }
  $('zoomTout').addEventListener('click', () => { vue.nb = barres.length + 6; vue.deb = -2; borner(); dessiner(); });
  $('zoomFin').addEventListener('click', () => { vue.nb = Math.min(barres.length, 120); vue.deb = barres.length - vue.nb + 6; borner(); dessiner(); });
  ['o-mm', 'o-bb', 'o-ichi', 'o-sar', 'o-zz', 'o-mk', 'sub'].forEach((id) => $(id).addEventListener('change', dessiner));
  new ResizeObserver(() => dessiner()).observe($('chartbox'));
  const majTheme = () => { lireCouleurs(); dessiner(); dessinerImage(); };
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', majTheme);
  new MutationObserver(majTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });

  // ------------------------------------------------------------ lecture d'image
  const icv = $('imgcv'), ictx = icv.getContext('2d');
  let img = null, cadre = null, extraites = null, traceExtrait = [];
  zoneDepot($('dropimg'), $('fileimg'), ouvrirImage);
  document.addEventListener('paste', (e) => {
    const it = [...(e.clipboardData ? e.clipboardData.items : [])].find((x) => /^image\//.test(x.type));
    if (it) { e.preventDefault(); document.getElementById('tab-img').click(); ouvrirImage(it.getAsFile()); }
  });
  function ouvrirImage(f) {
    const url = URL.createObjectURL(f);
    const im = new Image();
    im.onload = () => {
      img = im; extraites = null; traceExtrait = [];
      // cadre par défaut : on retire la marge droite (axe des prix) et le bas (dates)
      cadre = { x: 0.01 * im.width, y: 0.03 * im.height, w: 0.9 * im.width, h: 0.88 * im.height };
      $('imgzone').hidden = false; $('analyserImg').disabled = true; $('imgInfo').textContent = `${im.width} × ${im.height} px. Ajustez le cadre puis cliquez « Extraire ».`;
      document.getElementById('tab-img').click();
      dessinerImage();
    };
    im.onerror = () => erreur('Image illisible.');
    im.src = url;
  }
  function dessinerImage() {
    if (!img) return;
    icv.width = img.width; icv.height = img.height;
    ictx.drawImage(img, 0, 0);
    if (cadre) {
      ictx.fillStyle = 'rgba(0,0,0,0.35)';
      ictx.fillRect(0, 0, img.width, cadre.y); ictx.fillRect(0, cadre.y + cadre.h, img.width, img.height - cadre.y - cadre.h);
      ictx.fillRect(0, cadre.y, cadre.x, cadre.h); ictx.fillRect(cadre.x + cadre.w, cadre.y, img.width - cadre.x - cadre.w, cadre.h);
      ictx.strokeStyle = K.accent || '#2f4fb8'; ictx.lineWidth = Math.max(2, img.width / 400); ictx.setLineDash([8, 5]);
      ictx.strokeRect(cadre.x, cadre.y, cadre.w, cadre.h); ictx.setLineDash([]);
    }
    if (traceExtrait.length) {
      ictx.lineWidth = Math.max(1, img.width / 900);
      for (const t of traceExtrait) { ictx.strokeStyle = t.c; ictx.strokeRect(t.x, t.y, Math.max(1, t.w), Math.max(1, t.h)); }
    }
  }
  let selImg = null;
  const posImg = (e) => { const r = icv.getBoundingClientRect(); return { x: (e.clientX - r.left) * img.width / r.width, y: (e.clientY - r.top) * img.height / r.height }; };
  icv.addEventListener('pointerdown', (e) => { if (!img) return; icv.setPointerCapture(e.pointerId); const p = posImg(e); selImg = p; });
  icv.addEventListener('pointermove', (e) => {
    if (!selImg) return; const p = posImg(e);
    cadre = { x: Math.max(0, Math.min(selImg.x, p.x)), y: Math.max(0, Math.min(selImg.y, p.y)), w: Math.abs(p.x - selImg.x), h: Math.abs(p.y - selImg.y) };
    traceExtrait = []; dessinerImage();
  });
  icv.addEventListener('pointerup', () => { selImg = null; if (cadre && (cadre.w < 10 || cadre.h < 10)) cadre = { x: 0, y: 0, w: img.width, h: img.height }; dessinerImage(); });

  $('extraire').addEventListener('click', () => {
    if (!img || !cadre) return;
    try {
      const r = extraire($('imgMode').value);
      extraites = r.barres;
      $('imgInfo').textContent = r.info;
      $('analyserImg').disabled = !(extraites && extraites.length >= 10);
      dessinerImage();
    } catch (e) { $('imgInfo').textContent = e.message; }
  });
  $('analyserImg').addEventListener('click', () => {
    if (!extraites) return;
    $('txt').value = versTexte(extraites);
    charger(extraites, 'Image');
  });

  function extraire(mode) {
    const cx = Math.round(cadre.x), cy = Math.round(cadre.y), w = Math.round(cadre.w), h = Math.round(cadre.h);
    const tmp = document.createElement('canvas'); tmp.width = img.width; tmp.height = img.height;
    const tc = tmp.getContext('2d', { willReadFrequently: true }); tc.drawImage(img, 0, 0);
    const d = tc.getImageData(cx, cy, w, h).data;
    // couleur de fond = teinte la plus fréquente
    const hist = new Map();
    for (let k = 0; k < d.length; k += 16) { const key = (d[k] >> 3) << 10 | (d[k + 1] >> 3) << 5 | (d[k + 2] >> 3); hist.set(key, (hist.get(key) || 0) + 1); }
    let fond = 0, max = 0; for (const [k, v] of hist) if (v > max) { max = v; fond = k; }
    const fr = ((fond >> 10) & 31) * 8 + 4, fg = ((fond >> 5) & 31) * 8 + 4, fb = (fond & 31) * 8 + 4;
    // classes de pixel : 0 rien, 1 haussier, 2 baissier, 3 autre encre colorée
    const cls = new Uint8Array(w * h), teinte = new Float32Array(w * h);
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
      const k = (yy * w + xx) * 4, r = d[k], g = d[k + 1], b = d[k + 2];
      const dist = Math.abs(r - fr) + Math.abs(g - fg) + Math.abs(b - fb);
      if (dist < 70) continue;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), sat = mx ? (mx - mn) / mx : 0;
      if (sat < 0.22 || mx - mn < 35) continue;
      let hu;
      if (mx === r) hu = 60 * (((g - b) / (mx - mn)) % 6); else if (mx === g) hu = 60 * ((b - r) / (mx - mn) + 2); else hu = 60 * ((r - g) / (mx - mn) + 4);
      if (hu < 0) hu += 360;
      teinte[yy * w + xx] = hu;
      cls[yy * w + xx] = hu >= 70 && hu < 260 ? 1 : (hu < 45 || hu >= 300) ? 2 : 3;
    }
    // supprimer les lignes horizontales colorées (grilles, lignes de prix)
    for (let yy = 0; yy < h; yy++) { let c = 0; for (let xx = 0; xx < w; xx++) if (cls[yy * w + xx]) c++; if (c > 0.5 * w) for (let xx = 0; xx < w; xx++) cls[yy * w + xx] = 0; }
    const versPrix = prixDepuisY(h);
    traceExtrait = [];
    if (mode === 'courbe') return extraireCourbe(cls, teinte, w, h, cx, cy, versPrix);

    // profil par colonne
    const col = [];
    for (let xx = 0; xx < w; xx++) {
      let n1 = 0, n2 = 0, mn = h, mxY = -1;
      for (let yy = 0; yy < h; yy++) { const c = cls[yy * w + xx]; if (c === 1) n1++; else if (c === 2) n2++; else continue; if (yy < mn) mn = yy; if (yy > mxY) mxY = yy; }
      col.push({ n: n1 + n2, n1, n2, mn, mx: mxY, c: n1 + n2 ? (n1 >= n2 ? 1 : 2) : 0 });
    }
    if (col.filter((c) => c.n > 0).length > 0.97 * w) throw new Error('Trop de pixels colorés : le cadre contient sans doute une zone de couleur (volume, nuage…). Resserrez le cadre sur les bougies.');
    // séquences de colonnes contiguës de même couleur
    let runs = [];
    for (let xx = 0; xx < w; xx++) {
      const c = col[xx]; if (!c.n) continue;
      const der = runs[runs.length - 1];
      if (der && der.x1 === xx - 1 && der.c === c.c) der.x1 = xx; else runs.push({ x0: xx, x1: xx, c: c.c });
    }
    runs = runs.filter((r) => { let n = 0; for (let xx = r.x0; xx <= r.x1; xx++) n += col[xx].n; return n >= 3; });
    if (runs.length < 10) throw new Error(`Seulement ${runs.length} bougie(s) trouvée(s). Vérifiez le cadre et que les bougies sont colorées (vert/rouge ou bleu/rouge).`);
    const largs = runs.map((r) => r.x1 - r.x0 + 1).sort((a, b) => a - b);
    const med = largs[Math.floor(largs.length / 2)];
    const ec = [];
    for (let k = 1; k < runs.length; k++) ec.push(runs[k].x0 - runs[k - 1].x1);
    // découpe des séquences trop larges (bougies collées de même couleur)
    const fin = [];
    for (const r of runs) {
      const L = r.x1 - r.x0 + 1;
      const nb = L > med * 1.7 && med >= 2 ? Math.round(L / med) : 1;
      for (let j = 0; j < nb; j++) fin.push({ x0: r.x0 + Math.round(j * L / nb), x1: r.x0 + Math.round((j + 1) * L / nb) - 1, c: r.c });
    }
    const b = [];
    for (const r of fin) {
      let top = h, bot = -1;
      for (let xx = r.x0; xx <= r.x1; xx++) if (col[xx].n) { top = Math.min(top, col[xx].mn); bot = Math.max(bot, col[xx].mx); }
      const L = r.x1 - r.x0 + 1;
      let bt = -1, bb = -1;
      if (L >= 3) {
        const seuil = Math.max(2, Math.ceil(0.6 * L));
        for (let yy = top; yy <= bot; yy++) {
          let c = 0; for (let xx = r.x0; xx <= r.x1; xx++) if (cls[yy * w + xx] === r.c) c++;
          if (c >= seuil) { if (bt < 0) bt = yy; bb = yy; }
        }
      }
      if (bt < 0) { bt = top; bb = bot; if (L >= 3) { const m = (top + bot) / 2; bt = bb = Math.round(m); } }
      const haut = versPrix(top), bas = versPrix(bot), ph = versPrix(bt), pb = versPrix(bb);
      const hausse = r.c === 1;
      b.push({ t: null, o: hausse ? pb : ph, h: haut, l: bas, c: hausse ? ph : pb, v: NaN });
      traceExtrait.push({ x: cx + r.x0, y: cy + top, w: L, h: bot - top + 1, c: hausse ? '#00b4ff' : '#ff00c8' });
    }
    return { barres: T.completer(b), info: `${b.length} bougies extraites (largeur ≈ ${med} px). Les rectangles bleus = haussières, roses = baissières. Si le compte ne colle pas, resserrez le cadre.` };
  }
  function prixDepuisY(h) {
    const ph = parseFloat(String($('pxHaut').value).replace(/\s/g, '').replace(',', '.'));
    const pb = parseFloat(String($('pxBas').value).replace(/\s/g, '').replace(',', '.'));
    const haut = Number.isFinite(ph) ? ph : 100, bas = Number.isFinite(pb) ? pb : 0;
    return (yy) => +(haut + (yy / Math.max(1, h - 1)) * (bas - haut)).toFixed(4);
  }
  function extraireCourbe(cls, teinte, w, h, cx, cy, versPrix) {
    // teinte dominante de l'encre colorée
    const bins = new Array(36).fill(0);
    for (let k = 0; k < cls.length; k++) if (cls[k]) bins[Math.floor(teinte[k] / 10) % 36]++;
    const bMax = bins.indexOf(Math.max(...bins));
    if (!bins[bMax]) throw new Error('Aucune courbe colorée trouvée dans le cadre.');
    const proche = (hu) => { const dd = Math.abs(hu - (bMax * 10 + 5)); return Math.min(dd, 360 - dd) <= 20; };
    const ys = new Array(w).fill(NaN);
    for (let xx = 0; xx < w; xx++) {
      const v = []; for (let yy = 0; yy < h; yy++) { const k = yy * w + xx; if (cls[k] && proche(teinte[k])) v.push(yy); }
      if (v.length) ys[xx] = v[Math.floor(v.length / 2)];
    }
    // interpolation des trous
    let der = -1;
    for (let xx = 0; xx < w; xx++) if (Number.isFinite(ys[xx])) { if (der >= 0 && xx - der > 1) for (let j = der + 1; j < xx; j++) ys[j] = ys[der] + (ys[xx] - ys[der]) * (j - der) / (xx - der); der = xx; }
    const valides = ys.map((v, j) => (Number.isFinite(v) ? j : -1)).filter((j) => j >= 0);
    if (valides.length < 20) throw new Error('Courbe trop courte dans le cadre.');
    const a = valides[0], z = valides[valides.length - 1];
    const N = Math.max(20, Math.min(600, +$('imgN').value || 120));
    const cl = [];
    for (let k = 0; k < N; k++) {
      const x0 = Math.round(a + (z - a) * k / N), x1 = Math.max(x0, Math.round(a + (z - a) * (k + 1) / N) - 1);
      let hi = Infinity, lo = -Infinity; for (let xx = x0; xx <= x1; xx++) if (Number.isFinite(ys[xx])) { hi = Math.min(hi, ys[xx]); lo = Math.max(lo, ys[xx]); }
      cl.push({ o: NaN, h: versPrix(hi), l: versPrix(lo), c: versPrix(ys[x1]), t: null, v: NaN });
      traceExtrait.push({ x: cx + x0, y: cy + hi, w: x1 - x0 + 1, h: lo - hi + 1, c: '#00b4ff' });
    }
    return { barres: T.completer(cl), info: `${N} points extraits de la courbe (teinte ≈ ${bMax * 10}°). Pour une courbe, l’ouverture de chaque barre = clôture précédente.` };
  }

  // ------------------------------------------------------------ démarrage
  lireCouleurs();
  let depart = null;
  try { depart = localStorage.getItem('tradosaure-donnees'); } catch (e) { /* stockage indisponible */ }
  if (depart) {
    try { $('txt').value = depart; charger(T.lireDonnees(depart), 'Dernières données saisies'); } catch (e) { depart = null; }
  }
  if (!depart) { const b = T.exemple(); $('txt').value = versTexte(b); charger(b, 'Exemple (cours fictifs)'); }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { lireCouleurs(); dessiner(); });
})();
