// Interfaccia dell'app. La logica di import/categorie sta in core.js.
(function () {
  'use strict';

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const fmtEuro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
  const euro = (c) => fmtEuro.format(c / 100);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const NOMI_MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  const GIORNI = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];

  // ---------- Archivio sul dispositivo (IndexedDB) ----------
  let dbPromessa;
  function db() {
    return dbPromessa || (dbPromessa = new Promise((ok, ko) => {
      const r = indexedDB.open('bilancio', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => ok(r.result);
      r.onerror = () => ko(r.error);
    }));
  }
  async function leggi(chiave) {
    const d = await db();
    return new Promise((ok, ko) => {
      const r = d.transaction('kv').objectStore('kv').get(chiave);
      r.onsuccess = () => ok(r.result);
      r.onerror = () => ko(r.error);
    });
  }
  async function scrivi(chiave, valore) {
    const d = await db();
    return new Promise((ok, ko) => {
      const t = d.transaction('kv', 'readwrite');
      t.objectStore('kv').put(valore, chiave);
      t.oncomplete = () => ok();
      t.onerror = () => ko(t.error);
    });
  }

  // ---------- Stato ----------
  const statoVuoto = () => ({
    versione: 1, movimenti: [], regole: [],
    categorie: Core.CATEGORIE_DEFAULT.map((c) => Object.assign({}, c)),
    ultimoBackup: null, ultimoImport: null,
  });
  let S = statoVuoto();
  const ui = { vista: 'movimenti', mese: oggi().slice(0, 7) };

  async function salva() {
    try { await scrivi('stato', S); } catch (e) { toast('Errore nel salvataggio: ' + e.message); }
  }

  function oggi() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function etichettaMese(m) { const [a, n] = m.split('-'); return `${cap(NOMI_MESI[+n - 1])} ${a}`; }
  function etichettaGiorno(d) {
    const dt = new Date(d + 'T12:00:00');
    if (d === oggi()) return 'Oggi';
    return `${cap(GIORNI[dt.getDay()])} ${dt.getDate()} ${NOMI_MESI[dt.getMonth()]}`;
  }
  function dataBreve(d) { const [a, m, g] = d.split('-'); return `${+g} ${NOMI_MESI[+m - 1].slice(0, 3)} ${a}`; }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function spostaMese(m, delta) {
    const [a, n] = m.split('-').map(Number);
    const d = new Date(a, n - 1 + delta, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  function uid() { return 'm:' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  const SENZA_CAT = { id: null, nome: 'Da categorizzare', icona: '❓', tipo: 'uscita' };
  function categoria(id) { return S.categorie.find((c) => c.id === id) || SENZA_CAT; }
  function titoloMov(m) {
    if (m.origine === 'manuale') return m.descrizione || categoria(m.categoria).nome;
    return m.esercente || m.descrizione;
  }
  function daCategorizzare() { return S.movimenti.filter((m) => !m.categoria); }

  // Categorie ordinate per quante volte le hai usate (le più frequenti prima).
  function categoriePer(tipo) {
    const uso = {};
    for (const m of S.movimenti) if (m.categoria) uso[m.categoria] = (uso[m.categoria] || 0) + 1;
    return S.categorie.filter((c) => c.tipo === tipo).sort((a, b) => (uso[b.id] || 0) - (uso[a.id] || 0));
  }

  // ---------- Navigazione ----------
  function vai(vista) {
    ui.vista = vista;
    $$('#tabbar button').forEach((b) => b.classList.toggle('on', b.dataset.vista === vista || (vista === 'rivedi' && b.dataset.vista === 'movimenti')));
    render();
    window.scrollTo(0, 0);
  }
  function render() {
    const v = { movimenti: vistaMovimenti, riepilogo: vistaRiepilogo, importa: vistaImporta, altro: vistaAltro, rivedi: vistaRivedi }[ui.vista];
    v($('#vista'));
  }

  function selettoreMese() {
    const futuro = spostaMese(ui.mese, 1) > oggi().slice(0, 7);
    return `<div class="mese">
      <button data-mese="-1" aria-label="Mese precedente">‹</button>
      <strong>${etichettaMese(ui.mese)}</strong>
      <button data-mese="1" aria-label="Mese successivo" ${futuro ? 'disabled' : ''}>›</button>
    </div>`;
  }
  function collegaMese(el) {
    $$('[data-mese]', el).forEach((b) => b.onclick = () => { ui.mese = spostaMese(ui.mese, +b.dataset.mese); render(); });
  }

  // ---------- Vista: Movimenti ----------
  function vistaMovimenti(el) {
    const delMese = S.movimenti.filter((m) => m.data.startsWith(ui.mese)).sort((a, b) => b.data.localeCompare(a.data));
    const entrate = delMese.filter((m) => m.importo > 0).reduce((s, m) => s + m.importo, 0);
    const uscite = delMese.filter((m) => m.importo < 0).reduce((s, m) => s - m.importo, 0);
    const senza = daCategorizzare().length;

    let html = selettoreMese();
    html += `<div class="card totali">
      <div><span>Entrate</span><b class="num pos">${euro(entrate)}</b></div>
      <div><span>Uscite</span><b class="num">${euro(uscite)}</b></div>
      <div><span>Saldo</span><b class="num ${entrate - uscite >= 0 ? 'pos' : ''}">${euro(entrate - uscite)}</b></div>
    </div>`;
    if (senza) {
      html += `<button class="avviso" id="vai-rivedi"><span>🏷️</span><span><b>${senza} ${senza === 1 ? 'movimento' : 'movimenti'} da categorizzare</b>Ci vuole un minuto, poi li riconosco da solo.</span><span class="freccia">›</span></button>`;
    }
    if (serveBackup()) {
      html += `<button class="avviso info" id="vai-backup"><span>💾</span><span><b>Fai un backup</b>I dati sono solo su questo telefono: salvane una copia in File.</span><span class="freccia">›</span></button>`;
    }

    if (!delMese.length) {
      html += `<div class="vuoto"><div class="big">🌱</div>
        <p><b>Nessun movimento a ${NOMI_MESI[+ui.mese.slice(5) - 1]}.</b></p>
        <p>Tocca <b>+</b> per segnare una spesa, oppure importa l'estratto conto dalla scheda <b>Importa</b>.</p></div>`;
    } else {
      let giorno = null;
      for (const m of delMese) {
        if (m.data !== giorno) {
          if (giorno) html += '</div>';
          giorno = m.data;
          html += `<div class="giorno">${etichettaGiorno(giorno)}</div><div class="lista">`;
        }
        html += rigaMov(m);
      }
      html += '</div>';
    }
    html += '<button class="fab" id="aggiungi" aria-label="Aggiungi movimento">+</button>';
    el.innerHTML = html;

    collegaMese(el);
    $$('.riga[data-id]', el).forEach((b) => b.onclick = () => apriMovimento(S.movimenti.find((m) => m.id === b.dataset.id)));
    $('#aggiungi', el).onclick = () => apriMovimento(null);
    if ($('#vai-rivedi', el)) $('#vai-rivedi', el).onclick = () => vai('rivedi');
    if ($('#vai-backup', el)) $('#vai-backup', el).onclick = () => vai('altro');
  }

  function rigaMov(m) {
    const c = categoria(m.categoria);
    const sotto = [c.nome];
    if (m.origine === 'manuale' && m.collegato) sotto.push('trovato in banca ✓');
    return `<button class="riga" data-id="${esc(m.id)}">
      <span class="ico ${m.categoria ? '' : 'nuovo'}">${c.icona}</span>
      <span class="txt"><b>${esc(titoloMov(m))}</b><span>${esc(sotto.join(' · '))}${m.provvisorio ? '<em class="tag">in attesa</em>' : ''}</span></span>
      <span class="imp ${m.importo > 0 ? 'pos' : ''}">${m.importo > 0 ? '+' : '−'}${euro(Math.abs(m.importo))}</span>
    </button>`;
  }

  // ---------- Finestra: aggiungi / modifica movimento ----------
  function apriMovimento(m) {
    const nuovo = !m;
    const daBanca = m && m.origine === 'banca';
    const f = {
      tipo: m ? (m.importo > 0 ? 'entrata' : 'uscita') : 'uscita',
      importo: m ? (Math.abs(m.importo) / 100).toFixed(2).replace('.', ',') : '',
      categoria: m ? m.categoria : null,
      descrizione: m && m.origine === 'manuale' ? (m.descrizione || '') : '',
      data: m ? m.data : oggi(),
      ricorda: true,
    };

    function disegna() {
      const cats = categoriePer(f.tipo);
      const puoRicordare = daBanca && !m.ambiguo && m.chiave;
      apriSheet(`
        <h3>${nuovo ? 'Nuovo movimento' : esc(titoloMov(m))}</h3>
        ${daBanca ? '' : `<div class="seg">
          <button data-tipo="uscita" class="${f.tipo === 'uscita' ? 'on' : ''}">Uscita</button>
          <button data-tipo="entrata" class="${f.tipo === 'entrata' ? 'on' : ''}">Entrata</button>
        </div>`}
        ${daBanca
          ? `<div class="importo num ${m.importo > 0 ? 'pos' : ''}">${m.importo > 0 ? '+' : '−'}${euro(Math.abs(m.importo))}</div>
             <div class="dett">${etichettaGiorno(m.data)}${m.provvisorio ? ' · in attesa di contabilizzazione' : ''}<br>${esc(m.descrizione)}</div>`
          : `<input class="importo" id="f-importo" inputmode="decimal" placeholder="0,00" value="${esc(f.importo)}" autocomplete="off">`}
        <div class="chips">${cats.map((c) => `<button class="chip ${c.id === f.categoria ? 'on' : ''}" data-cat="${c.id}">${c.icona} ${esc(c.nome)}</button>`).join('')}</div>
        ${puoRicordare ? `<label class="check"><input type="checkbox" id="f-ricorda" ${f.ricorda ? 'checked' : ''}>
          <span>Ricorda per il futuro: <b>${esc(m.chiave)}</b> va sempre in questa categoria</span></label>` : ''}
        ${daBanca ? '' : `
          <label class="campo"><span>Descrizione (facoltativa)</span><input id="f-descr" value="${esc(f.descrizione)}" placeholder="Es. pizza con amici" autocomplete="off"></label>
          <label class="campo"><span>Data</span><input type="date" id="f-data" value="${esc(f.data)}" max="${oggi()}"></label>`}
        ${m && m.collegato ? `<div class="dett">Trovato nell'estratto conto:<br>${esc(m.descrBanca)}</div>` : ''}
        <button class="btn" id="f-salva">Salva</button>
        ${nuovo ? '' : '<button class="btn danger" id="f-elimina">Elimina</button>'}
      `);
      const sh = $('#sheet');
      const leggiCampi = () => {
        if ($('#f-importo', sh)) f.importo = $('#f-importo', sh).value;
        if ($('#f-descr', sh)) f.descrizione = $('#f-descr', sh).value;
        if ($('#f-data', sh)) f.data = $('#f-data', sh).value;
        if ($('#f-ricorda', sh)) f.ricorda = $('#f-ricorda', sh).checked;
      };
      $$('[data-tipo]', sh).forEach((b) => b.onclick = () => { leggiCampi(); f.tipo = b.dataset.tipo; f.categoria = null; disegna(); });
      $$('[data-cat]', sh).forEach((b) => b.onclick = () => {
        leggiCampi(); f.categoria = b.dataset.cat;
        $$('[data-cat]', sh).forEach((x) => x.classList.toggle('on', x === b));
      });
      $('#f-salva', sh).onclick = async () => {
        leggiCampi();
        if (daBanca) {
          if (!f.categoria) return toast('Scegli una categoria');
          if (f.ricorda && m.chiave && !m.ambiguo) {
            impara(m.chiave, f.categoria);
            m.catManuale = false;
          } else {
            m.catManuale = true;
          }
          m.categoria = f.categoria;
        } else {
          const cent = Math.round(parseFloat(String(f.importo).replace(/\./g, '').replace(',', '.')) * 100);
          if (!cent || cent <= 0) return toast("Inserisci un importo");
          if (!f.categoria) return toast('Scegli una categoria');
          if (!f.data) return toast('Inserisci una data');
          const valori = { importo: f.tipo === 'entrata' ? cent : -cent, categoria: f.categoria, descrizione: f.descrizione.trim(), data: f.data };
          if (nuovo) S.movimenti.push(Object.assign({ id: uid(), ids: [], origine: 'manuale' }, valori));
          else Object.assign(m, valori);
          ui.mese = f.data.slice(0, 7);
        }
        await salva();
        chiudiSheet();
        render();
        toast(nuovo ? 'Movimento aggiunto' : 'Salvato');
      };
      if ($('#f-elimina', sh)) $('#f-elimina', sh).onclick = async () => {
        if (!confermaInline($('#f-elimina', sh), 'Tocca di nuovo per eliminare')) return;
        S.movimenti = S.movimenti.filter((x) => x !== m);
        await salva();
        chiudiSheet();
        render();
        toast('Movimento eliminato');
      };
      if (nuovo && $('#f-importo', sh)) setTimeout(() => $('#f-importo', sh).focus(), 250);
    }
    disegna();
  }

  // Conferma "tocca due volte" al posto delle finestre di sistema.
  function confermaInline(btn, testo) {
    if (btn.dataset.armato) return true;
    btn.dataset.armato = '1';
    const orig = btn.textContent;
    btn.textContent = testo;
    setTimeout(() => { delete btn.dataset.armato; btn.textContent = orig; }, 3000);
    return false;
  }

  // Salva una regola e la applica ai movimenti con la stessa chiave non scelti a mano.
  function impara(chiave, cat) {
    const pattern = Core.normalizza(chiave);
    const esist = S.regole.find((r) => r.pattern === pattern);
    if (esist) esist.categoria = cat;
    else S.regole.push({ pattern, categoria: cat, creata: oggi() });
    let n = 0;
    for (const x of S.movimenti) {
      if (x.origine === 'banca' && !x.ambiguo && !x.catManuale && x.chiave === chiave && x.categoria !== cat) {
        x.categoria = cat; n++;
      }
    }
    return n;
  }

  // ---------- Vista: Da categorizzare ----------
  function vistaRivedi(el) {
    const lista = daCategorizzare();
    // Raggruppa per esercente, tranne i casi ambigui (PayPal, ...) che vanno visti uno per uno.
    const gruppi = [];
    const perChiave = {};
    for (const m of lista.sort((a, b) => b.data.localeCompare(a.data))) {
      if (m.ambiguo || !m.chiave) { gruppi.push({ chiave: null, mov: [m] }); continue; }
      if (!perChiave[m.chiave]) { perChiave[m.chiave] = { chiave: m.chiave, mov: [] }; gruppi.push(perChiave[m.chiave]); }
      perChiave[m.chiave].mov.push(m);
    }
    gruppi.sort((a, b) => b.mov.length - a.mov.length);

    let html = `<div class="mese"><button id="indietro" aria-label="Indietro">‹</button><strong>Da categorizzare</strong><span style="width:40px"></span></div>`;
    if (!gruppi.length) {
      html += `<div class="vuoto"><div class="big">✅</div><p><b>Tutto categorizzato.</b></p><p>Dal prossimo import riconoscerò da solo questi esercenti.</p>
        <button class="btn sec" id="fine">Torna ai movimenti</button></div>`;
    } else {
      html += `<p class="muted small" style="margin:0 4px 12px">Scegli la categoria una volta: dalla prossima volta la riconosco da solo.</p>`;
      gruppi.forEach((g, i) => {
        const m0 = g.mov[0];
        const tot = g.mov.reduce((s, m) => s + m.importo, 0);
        const tipo = tot > 0 ? 'entrata' : 'uscita';
        html += `<div class="gruppo" data-g="${i}">
          <header><b>${esc(titoloMov(m0))}</b><span class="num ${tot > 0 ? 'pos' : ''}">${tot > 0 ? '+' : '−'}${euro(Math.abs(tot))}</span></header>
          <div class="muted small">${g.mov.length > 1 ? `${g.mov.length} movimenti · ultimo ` : ''}${etichettaGiorno(m0.data)}${g.chiave ? '' : ' · tramite ' + esc(m0.esercente)}</div>
          <div class="dett">${esc(m0.descrizione.slice(0, 140))}</div>
          <div class="chips">${categoriePer(tipo).map((c) => `<button class="chip" data-cat="${c.id}">${c.icona} ${esc(c.nome)}</button>`).join('')}</div>
        </div>`;
      });
    }
    el.innerHTML = html;
    $('#indietro', el).onclick = () => vai('movimenti');
    if ($('#fine', el)) $('#fine', el).onclick = () => vai('movimenti');

    $$('.gruppo', el).forEach((box) => {
      const g = gruppi[+box.dataset.g];
      $$('[data-cat]', box).forEach((b) => b.onclick = async () => {
        const cat = b.dataset.cat;
        if (g.chiave) impara(g.chiave, cat);
        else g.mov.forEach((m) => { m.categoria = cat; m.catManuale = true; });
        await salva();
        box.classList.add('via');
        setTimeout(() => render(), 250);
      });
    });
  }

  // ---------- Vista: Riepilogo ----------
  function vistaRiepilogo(el) {
    const delMese = S.movimenti.filter((m) => m.data.startsWith(ui.mese));
    const entrate = delMese.filter((m) => m.importo > 0).reduce((s, m) => s + m.importo, 0);
    const uscite = delMese.filter((m) => m.importo < 0).reduce((s, m) => s - m.importo, 0);
    const risparmio = entrate - uscite;

    // Media degli ultimi 3 mesi precedenti, per confronto.
    const prec = [1, 2, 3].map((k) => spostaMese(ui.mese, -k));
    const mesiConDati = prec.filter((p) => S.movimenti.some((m) => m.data.startsWith(p)));
    const mediaCat = {};
    for (const m of S.movimenti) {
      if (m.importo < 0 && mesiConDati.some((p) => m.data.startsWith(p))) mediaCat[m.categoria] = (mediaCat[m.categoria] || 0) - m.importo;
    }

    const perCat = {};
    for (const m of delMese) if (m.importo < 0) perCat[m.categoria] = (perCat[m.categoria] || 0) - m.importo;
    const voci = Object.entries(perCat).sort((a, b) => b[1] - a[1]);
    const max = voci.length ? voci[0][1] : 1;

    let html = selettoreMese();
    if (!delMese.length) {
      html += `<div class="vuoto"><div class="big">📊</div><p>Nessun dato per questo mese.</p></div>`;
      el.innerHTML = html; collegaMese(el); return;
    }
    const perc = entrate ? Math.round((risparmio / entrate) * 100) : null;
    html += `<div class="card risparmio">
      <div class="muted small">${risparmio >= 0 ? 'Messo da parte questo mese' : 'Hai speso più di quanto è entrato'}</div>
      <div class="grande num ${risparmio >= 0 ? 'pos' : ''}">${euro(risparmio)}</div>
      ${perc != null ? `<div class="muted small">${perc}% delle entrate · entrate ${euro(entrate)} · uscite ${euro(uscite)}</div>` : ''}
    </div>`;

    html += `<h2>Dove sono andati i soldi</h2><div class="card barre">`;
    for (const [id, tot] of voci) {
      const c = categoria(id === 'null' ? null : id);
      const media = mesiConDati.length ? (mediaCat[id] || 0) / mesiConDati.length : null;
      let conf = '';
      if (media != null && media > 0) {
        const diff = Math.round(((tot - media) / media) * 100);
        conf = Math.abs(diff) < 5 ? 'in linea con la media' : `${diff > 0 ? '+' : ''}${diff}% rispetto alla media degli ultimi mesi`;
      }
      html += `<div>
        <div class="barra-top"><span>${c.icona} ${esc(c.nome)}</span><span class="num">${euro(tot)}</span></div>
        <div class="barra"><i style="width:${Math.max(2, (tot / max) * 100)}%"></i></div>
        ${conf ? `<div class="barra-sub">${conf}</div>` : ''}
      </div>`;
    }
    html += '</div>';

    const ent = {};
    for (const m of delMese) if (m.importo > 0) ent[m.categoria] = (ent[m.categoria] || 0) + m.importo;
    if (Object.keys(ent).length) {
      html += `<h2>Entrate</h2><div class="lista">`;
      for (const [id, tot] of Object.entries(ent).sort((a, b) => b[1] - a[1])) {
        const c = categoria(id === 'null' ? null : id);
        html += `<div class="voce"><span>${c.icona} ${esc(c.nome)}</span><span class="num pos">${euro(tot)}</span></div>`;
      }
      html += '</div>';
    }
    el.innerHTML = html;
    collegaMese(el);
  }

  // ---------- Vista: Importa ----------
  function vistaImporta(el) {
    el.innerHTML = `<h1>Importa estratto conto</h1>
      <div class="card">
        <ol class="passi">
          <li>Nell'app o nel sito <b>BPER</b> apri la lista movimenti del conto.</li>
          <li>Esporta in <b>Excel</b> e salva il file in <b>File</b> (iCloud o sul telefono).</li>
          <li>Torna qui e tocca il pulsante sotto.</li>
        </ol>
      </div>
      <button class="btn" id="scegli">Scegli il file Excel</button>
      <p class="muted small" style="margin:14px 4px">Il file viene letto <b>solo su questo telefono</b>: niente viene inviato da nessuna parte.
      Puoi importare anche periodi che si sovrappongono: i movimenti già presenti vengono riconosciuti e saltati.</p>
      ${S.ultimoImport ? `<p class="muted small" style="margin:0 4px">Ultimo import: ${etichettaGiorno(S.ultimoImport)}</p>` : ''}`;
    $('#scegli', el).onclick = () => $('#file-estratto').click();
  }

  let xlsxPromessa;
  function caricaXLSX() {
    return xlsxPromessa || (xlsxPromessa = new Promise((ok, ko) => {
      const s = document.createElement('script');
      s.src = 'vendor/xlsx.full.min.js';
      s.onload = () => ok(window.XLSX);
      s.onerror = () => { xlsxPromessa = null; ko(new Error('Impossibile caricare il lettore Excel')); };
      document.head.appendChild(s);
    }));
  }

  async function importaFile(file) {
    try {
      toast('Leggo il file…');
      const XLSX = await caricaXLSX();
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const righe = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' });
      const lette = Core.leggiEstratto(righe);
      if (!lette.length) throw new Error('Nel file non ho trovato movimenti.');
      const piano = Core.pianificaImport(lette, S.movimenti, S.regole);
      nascondiToast();
      mostraPiano(piano, lette.length);
    } catch (e) {
      toast(e.message || 'Non riesco a leggere il file');
    }
  }

  function mostraPiano(piano, totale) {
    const auto = piano.nuovi.filter((n) => n.categoria).length;
    const daFare = piano.nuovi.length - auto;
    const date = piano.nuovi.map((n) => n.data).sort();
    apriSheet(`
      <h3>Pronto a importare</h3>
      <div class="lista" style="margin-bottom:14px">
        <div class="voce"><span>Movimenti nel file</span><b class="num">${totale}</b></div>
        <div class="voce"><span>Nuovi</span><b class="num">${piano.nuovi.length}</b></div>
        ${piano.nuovi.length ? `<div class="voce"><span class="muted">· categorizzati in automatico</span><span class="num">${auto}</span></div>
        <div class="voce"><span class="muted">· da categorizzare</span><span class="num">${daFare}</span></div>` : ''}
        ${piano.uniti.length ? `<div class="voce"><span>Già segnati a mano (li unisco)</span><b class="num">${piano.uniti.length}</b></div>` : ''}
        ${piano.aggiornati.length ? `<div class="voce"><span>Erano in attesa, ora confermati</span><b class="num">${piano.aggiornati.length}</b></div>` : ''}
        <div class="voce"><span>Già presenti (saltati)</span><b class="num">${piano.presenti}</b></div>
      </div>
      ${date.length ? `<p class="muted small" style="margin:0 4px 14px">Periodo: ${dataBreve(date[0])} – ${dataBreve(date[date.length - 1])}</p>` : ''}
      <button class="btn" id="conferma" ${piano.nuovi.length + piano.uniti.length + piano.aggiornati.length ? '' : 'disabled'}>Importa</button>
      <button class="btn sec" id="annulla">Annulla</button>
    `);
    $('#annulla').onclick = chiudiSheet;
    $('#conferma').onclick = async () => {
      for (const n of piano.nuovi) {
        delete n.motivo;
        S.movimenti.push(n);
      }
      for (const a of piano.aggiornati) {
        const m = a.mov;
        m.data = a.riga.data;
        m.descrizione = a.riga.descrizione;
        m.provvisorio = a.riga.provvisorio;
        if (!m.ids.includes(a.id) && m.id !== a.id) m.ids.push(a.id);
      }
      for (const u of piano.uniti) {
        const m = u.mov;
        m.collegato = true;
        m.ids = m.ids || [];
        m.ids.push(u.id);
        m.descrBanca = u.riga.descrizione;
        m.chiave = u.info.chiave;
        m.provvisorio = u.riga.provvisorio;
      }
      S.ultimoImport = oggi();
      await salva();
      chiudiSheet();
      const n = piano.nuovi.length + piano.uniti.length + piano.aggiornati.length;
      toast(`${n} ${n === 1 ? 'movimento importato' : 'movimenti importati'}`);
      if (piano.nuovi.length) {
        const ultimo = piano.nuovi.map((x) => x.data).sort().pop();
        ui.mese = ultimo.slice(0, 7);
      }
      vai(daCategorizzare().length ? 'rivedi' : 'movimenti');
    };
  }

  // ---------- Vista: Altro (backup, categorie, regole) ----------
  function serveBackup() {
    if (!S.movimenti.length) return false;
    if (!S.ultimoBackup) return S.movimenti.length >= 10;
    return (Date.parse(oggi()) - Date.parse(S.ultimoBackup)) / 86400000 > 30;
  }

  function vistaAltro(el) {
    const regole = S.regole.slice().sort((a, b) => a.pattern.localeCompare(b.pattern));
    el.innerHTML = `<h1>Altro</h1>
      <h2>Backup</h2>
      <div class="card">
        <p class="small">I dati vivono <b>solo su questo telefono</b>. Se cancelli l'app li perdi: salva ogni tanto una copia in File / iCloud.</p>
        <p class="muted small">${S.ultimoBackup ? 'Ultimo backup: ' + etichettaGiorno(S.ultimoBackup).toLowerCase() : 'Nessun backup ancora.'} · ${S.movimenti.length} movimenti</p>
        <button class="btn" id="esporta">Salva backup</button>
        <button class="btn sec" id="ripristina">Ripristina da backup</button>
      </div>

      <h2>Cose che ho imparato (${regole.length})</h2>
      ${regole.length ? `<div class="lista">${regole.map((r) => {
        const c = categoria(r.categoria);
        return `<div class="voce"><span class="txt"><b>${esc(r.pattern)}</b><span class="muted small">${c.icona} ${esc(c.nome)}</span></span>
          <button class="x" data-regola="${esc(r.pattern)}">Dimentica</button></div>`;
      }).join('')}</div>` : '<p class="muted small" style="margin:0 4px">Ancora niente: quando categorizzi un movimento importato, me lo ricordo qui.</p>'}

      <h2>Categorie</h2>
      <div class="lista">${S.categorie.map((c) => `<div class="voce"><span>${c.icona} ${esc(c.nome)}</span><span class="muted small">${c.tipo}</span></div>`).join('')}</div>
      <button class="link" id="nuova-cat" style="margin:6px 4px">+ Nuova categoria</button>

      <h2>Zona pericolosa</h2>
      <button class="btn danger" id="azzera">Cancella tutti i dati</button>
      <p class="muted small" style="margin:24px 4px; text-align:center">Bilancio · i tuoi dati non lasciano mai questo dispositivo</p>`;

    $('#esporta', el).onclick = esportaBackup;
    $('#ripristina', el).onclick = () => $('#file-backup').click();
    $('#nuova-cat', el).onclick = nuovaCategoria;
    $$('[data-regola]', el).forEach((b) => b.onclick = async () => {
      S.regole = S.regole.filter((r) => r.pattern !== b.dataset.regola);
      await salva(); render(); toast('Regola dimenticata');
    });
    $('#azzera', el).onclick = async (e) => {
      if (!confermaInline(e.currentTarget, 'Sicuro? Tocca di nuovo per cancellare tutto')) return;
      S = statoVuoto(); await salva(); render(); toast('Dati cancellati');
    };
  }

  function nuovaCategoria() {
    let tipo = 'uscita';
    apriSheet(`<h3>Nuova categoria</h3>
      <div class="seg"><button data-tipo="uscita" class="on">Uscita</button><button data-tipo="entrata">Entrata</button></div>
      <label class="campo"><span>Nome</span><input id="c-nome" placeholder="Es. Animali" autocomplete="off"></label>
      <label class="campo"><span>Emoji</span><input id="c-icona" placeholder="🐶" maxlength="4" autocomplete="off"></label>
      <button class="btn" id="c-salva">Crea</button>`);
    const sh = $('#sheet');
    $$('[data-tipo]', sh).forEach((b) => b.onclick = () => { tipo = b.dataset.tipo; $$('[data-tipo]', sh).forEach((x) => x.classList.toggle('on', x === b)); });
    $('#c-salva', sh).onclick = async () => {
      const nome = $('#c-nome', sh).value.trim();
      if (!nome) return toast('Dai un nome alla categoria');
      const id = Core.normalizza(nome).toLowerCase().replace(/\s+/g, '-') + '-' + Date.now().toString(36).slice(-3);
      S.categorie.push({ id, nome, icona: $('#c-icona', sh).value.trim() || '🏷️', tipo });
      await salva(); chiudiSheet(); render(); toast('Categoria creata');
    };
  }

  async function esportaBackup() {
    const nome = `bilancio-backup-${oggi()}.json`;
    const file = new File([JSON.stringify(S)], nome, { type: 'application/json' });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Backup Bilancio' });
      } else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(file);
        a.download = nome;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      }
      S.ultimoBackup = oggi();
      await salva();
      render();
      toast('Backup creato');
    } catch (e) {
      if (e.name !== 'AbortError') toast('Backup non riuscito: ' + e.message);
    }
  }

  async function ripristinaBackup(file) {
    try {
      const dati = JSON.parse(await file.text());
      if (!dati || !Array.isArray(dati.movimenti) || !Array.isArray(dati.categorie)) throw new Error('Il file non è un backup di Bilancio');
      apriSheet(`<h3>Ripristinare il backup?</h3>
        <p>Il backup contiene <b>${dati.movimenti.length} movimenti</b> e <b>${(dati.regole || []).length} regole</b>.</p>
        <p class="muted small">I dati attuali (${S.movimenti.length} movimenti) verranno sostituiti.</p>
        <button class="btn" id="r-ok">Ripristina</button><button class="btn sec" id="r-no">Annulla</button>`);
      $('#r-no').onclick = chiudiSheet;
      $('#r-ok').onclick = async () => {
        S = Object.assign(statoVuoto(), dati);
        await salva(); chiudiSheet(); vai('movimenti'); toast('Backup ripristinato');
      };
    } catch (e) {
      toast(e.message || 'File non valido');
    }
  }

  // ---------- Sheet e toast ----------
  function apriSheet(html) {
    const sh = $('#sheet');
    const eraAperto = !sh.hidden;
    sh.innerHTML = html;
    sh.hidden = false;
    $('#velo').hidden = false;
    if (eraAperto) sh.style.animation = 'none';
    else sh.style.animation = '';
    document.body.style.overflow = 'hidden';
  }
  function chiudiSheet() {
    $('#sheet').hidden = true;
    $('#velo').hidden = true;
    $('#sheet').innerHTML = '';
    document.body.style.overflow = '';
  }
  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
  }
  function nascondiToast() { $('#toast').hidden = true; }

  // ---------- Avvio ----------
  async function avvio() {
    try {
      const salvato = await leggi('stato');
      if (salvato) S = Object.assign(statoVuoto(), salvato);
    } catch (e) {
      toast('Non riesco ad aprire l\'archivio: ' + e.message);
    }
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

    $$('#tabbar button').forEach((b) => b.onclick = () => vai(b.dataset.vista));
    $('#velo').onclick = chiudiSheet;
    $('#file-estratto').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) importaFile(f); };
    $('#file-backup').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) ripristinaBackup(f); };
    vai('movimenti');

    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }
  avvio();
})();
