// Logica pura (senza interfaccia): lettura estratto BPER, categorizzazione, doppioni.
// Funziona sia nel browser (window.Core) sia in Node (per i test).
(function (root) {
  'use strict';

  const MESI = {
    gennaio: 1, febbraio: 2, marzo: 3, aprile: 4, maggio: 5, giugno: 6,
    luglio: 7, agosto: 8, settembre: 9, ottobre: 10, novembre: 11, dicembre: 12,
  };

  const CATEGORIE_DEFAULT = [
    { id: 'spesa', nome: 'Spesa', icona: '🛒', tipo: 'uscita' },
    { id: 'ristoranti', nome: 'Ristoranti e bar', icona: '🍕', tipo: 'uscita' },
    { id: 'auto', nome: 'Auto e carburante', icona: '⛽', tipo: 'uscita' },
    { id: 'trasporti', nome: 'Trasporti', icona: '🚆', tipo: 'uscita' },
    { id: 'casa', nome: 'Casa e bollette', icona: '🏠', tipo: 'uscita' },
    { id: 'abbonamenti', nome: 'Abbonamenti', icona: '📺', tipo: 'uscita' },
    { id: 'shopping', nome: 'Shopping', icona: '🛍️', tipo: 'uscita' },
    { id: 'salute', nome: 'Salute', icona: '💊', tipo: 'uscita' },
    { id: 'svago', nome: 'Svago', icona: '🎉', tipo: 'uscita' },
    { id: 'viaggi', nome: 'Viaggi', icona: '✈️', tipo: 'uscita' },
    { id: 'regali', nome: 'Regali', icona: '🎁', tipo: 'uscita' },
    { id: 'contanti', nome: 'Prelievi contanti', icona: '💶', tipo: 'uscita' },
    { id: 'banca', nome: 'Spese bancarie', icona: '🏦', tipo: 'uscita' },
    { id: 'altro', nome: 'Altro', icona: '📦', tipo: 'uscita' },
    { id: 'stipendio', nome: 'Stipendio', icona: '💼', tipo: 'entrata' },
    { id: 'extra', nome: 'Lavori extra', icona: '💻', tipo: 'entrata' },
    { id: 'rimborsi', nome: 'Rimborsi', icona: '↩️', tipo: 'entrata' },
    { id: 'altre-entrate', nome: 'Altre entrate', icona: '💰', tipo: 'entrata' },
  ];

  // Regole di partenza. "PAROLA" = parola intera, "PAROLA*" = parola che inizia così.
  const REGOLE_BASE = {
    spesa: ['ESSELUNGA', 'CONAD', 'COOP', 'LIDL', 'EUROSPIN', 'CARREFOUR', 'PAM', 'IPER', 'ALDI', 'PENNY',
      'DESPAR', 'SPAR', 'TIGROS', 'IPERAL', 'FAMILA', 'BENNET', 'UNES', 'MD', 'SUPERMERCATO', 'ALIMENTARI',
      'MACELLERIA', 'PANIFICIO', 'PANETTERIA', 'FRUTTA', 'EKOM', 'CRAI', 'SIGMA', 'IL GIGANTE', 'POLI'],
    ristoranti: ['MCDONALD*', 'BURGER KING', 'KFC', 'OLD WILD WEST', 'ROADHOUSE', 'AUTOGRILL', 'GELATERIA',
      'GELATO', 'PIZZERIA', 'PIZZA', 'RISTORANTE', 'TRATTORIA', 'OSTERIA', 'BAR', 'CAFFE', 'CAFE', 'PASTICCERIA',
      'JUST EAT', 'DELIVEROO', 'GLOVO', 'UBER EATS', 'SUSHI', 'PUB', 'BIRRERIA', 'PIADINERIA', 'KEBAB'],
    auto: ['ESSO', 'ENI', 'ENILIVE', 'AGIP', 'Q8', 'TAMOIL', 'IP', 'API', 'DISTRIBUTORE', 'CARBURANTI',
      'TOTALERG', 'SHELL', 'AUTOSTRAD*', 'TELEPASS', 'PARCHEGG*', 'EASYPARK', 'AUTOLAVAGGIO', 'GOMMISTA'],
    trasporti: ['TRENITALIA', 'ITALO', 'TRENORD', 'FLIXBUS', 'UBER', 'FREE NOW', 'RYANAIR', 'EASYJET'],
    abbonamenti: ['NETFLIX', 'SPOTIFY', 'DISNEY*', 'PRIME VIDEO', 'AMAZON PRIME', 'DAZN', 'APPLE COM', 'ICLOUD',
      'YOUTUBE*', 'GOOGLE ONE', 'NOW TV', 'SKY', 'OPENAI', 'AUDIBLE'],
    casa: ['ENEL', 'A2A', 'HERA', 'IREN', 'EDISON', 'TIM', 'VODAFONE', 'WINDTRE', 'ILIAD', 'FASTWEB',
      'CONDOMINIO', 'AFFITTO', 'IKEA', 'LEROY MERLIN', 'BRICO*', 'OBI', 'TECNOMAT'],
    shopping: ['AMAZON', 'ZALANDO', 'DECATHLON', 'ZARA', 'H&M', 'PRIMARK', 'MEDIAWORLD', 'UNIEURO', 'EURONICS',
      'SHEIN', 'TEMU', 'ALIEXPRESS', 'CALZATUR*', 'ABBIGLIAMENTO', 'OVS', 'PIAZZA ITALIA'],
    salute: ['FARMACIA', 'PARAFARMACIA', 'OTTICA', 'DENTIST*', 'POLIAMBULATORIO', 'STUDIO MEDICO'],
    svago: ['CINEMA', 'STEAM*', 'PLAYSTATION', 'NINTENDO', 'TICKETONE', 'PALESTRA', 'PISCINA'],
  };

  // Intermediari che non dicono dove hai speso davvero: mai regole automatiche.
  const AMBIGUI = ['PAYPAL', 'SATISPAY'];

  // Parole troppo generiche per riconoscere un esercente da sole.
  const GENERICHE = new Set(['IL', 'LA', 'LO', 'LE', 'I', 'GLI', 'L', 'DI', 'DA', 'DEL', 'DELLA', 'DEI', 'AL',
    'ALLA', 'E', 'NUOVA', 'NUOVO', 'NEW', 'THE', 'BAR', 'CAFFE', 'CAFE', 'RISTORANTE', 'PIZZERIA', 'TRATTORIA',
    'OSTERIA', 'GELATERIA', 'PASTICCERIA', 'SUPERMERCATO', 'MARKET', 'DISTRIBUTORE', 'FARMACIA', 'TABACCHI',
    'TABACCHERIA', 'EDICOLA', 'SAN', 'SANTA', 'SANTO', 'STAZIONE', 'SERVIZIO', 'AREA', 'SOCIETA', 'SOC']);

  const INDIRIZZO = new Set(['VIA', 'VIALE', 'VLE', 'PZA', 'PIAZZA', 'PIAZZALE', 'CORSO', 'CSO', 'LOC',
    'LOCALITA', 'STRADA', 'STR', 'LARGO', 'VICOLO', 'ITA', 'ITALY', 'IT', 'CON', 'PRESSO', 'CO']);

  const BPER_FISSE = { PRELIEVO: 'contanti', COMMISSIONE: 'banca', COMMISSIONI: 'banca', SPESE: 'banca' };

  function normalizza(s) {
    return String(s == null ? '' : s).toUpperCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/['’`]/g, '')
      .replace(/[^A-Z0-9&]+/g, ' ')
      .trim();
  }

  function pad(n) { return String(n).padStart(2, '0'); }

  // Restituisce 'YYYY-MM-DD' oppure null.
  function parseData(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date && !isNaN(v)) return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
    if (typeof v === 'number' && v > 20000 && v < 80000) {
      // Data seriale Excel (giorni dal 30/12/1899)
      const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
      return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    }
    const s = String(v).trim().toLowerCase();
    let m = s.match(/^(\d{1,2})\s+([a-z]+)\s+(\d{4})/);
    if (m && MESI[m[2]]) return `${m[3]}-${pad(MESI[m[2]])}-${pad(m[1])}`;
    m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
    if (m) {
      const anno = m[3].length === 2 ? '20' + m[3] : m[3];
      return `${anno}-${pad(m[2])}-${pad(m[1])}`;
    }
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    return null;
  }

  // Restituisce centesimi (intero, sempre positivo) oppure 0.
  function parseImporto(v) {
    if (v == null || v === '') return 0;
    if (typeof v === 'number') return Math.abs(Math.round(v * 100));
    let s = String(v).replace(/[€\s]/g, '');
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    const n = parseFloat(s);
    return isNaN(n) ? 0 : Math.abs(Math.round(n * 100));
  }

  function giorniTra(a, b) {
    return Math.abs((Date.parse(a) - Date.parse(b)) / 86400000);
  }

  // Dalla descrizione della banca ricava: esercente leggibile, chiave per le regole, testo su cui cercarle.
  function analizza(descrizione) {
    const grezzo = String(descrizione || '').toUpperCase().replace(/\s+/g, ' ');
    const norm = normalizza(grezzo);

    for (const a of AMBIGUI) {
      if ((' ' + norm + ' ').includes(' ' + a + ' ')) return { esercente: a === 'PAYPAL' ? 'PayPal' : 'Satispay', chiave: a, testo: norm, ambiguo: true };
    }

    if (/^COMMISSION/.test(norm)) return { esercente: 'Commissioni bancarie', chiave: 'COMMISSIONI', testo: norm, ambiguo: false };

    if (/BONIFICO/.test(norm)) {
      const fine = '(?=\\s+(?:DATA|RIF|RIFERIMENTO|CAUSALE|COMMISSIONI|IBAN|BIC|PER|CRO|TRN|ID)\\b|:|$)';
      let m = grezzo.match(new RegExp('A FAVORE DI\\s+(.+?)' + fine));
      let verso = 'A';
      if (!m) { m = grezzo.match(new RegExp('(?:ORDINANTE|DA)\\s+(.+?)' + fine)); verso = 'DA'; }
      const nome = m ? normalizza(m[1]).split(' ').slice(0, 3).join(' ') : '';
      const chiave = nome ? `BONIFICO ${verso} ${nome}` : 'BONIFICO';
      return { esercente: nome ? `Bonifico ${verso === 'A' ? 'a' : 'da'} ${titolo(nome)}` : 'Bonifico', chiave, testo: chiave, ambiguo: !nome };
    }

    if (/^PRELIEVO|\bPRELIEVO ATM\b/.test(norm)) return { esercente: 'Prelievo contanti', chiave: 'PRELIEVO', testo: norm, ambiguo: false };

    // Pagamenti con carta: tutto ciò che viene prima di "Operazione carta" è l'esercente con l'indirizzo.
    const prima = grezzo.split(/\bOPERAZIONE CARTA\b|\bCARTA\s*\*|\bDEL \d{2}[./]\d{2}/)[0];
    const testo = normalizza(prima);
    const tok = testo.split(' ').filter(Boolean);
    const nome = [];
    for (let i = 0; i < tok.length; i++) {
      const t = tok[i];
      if (i > 0 && (INDIRIZZO.has(t) || /\d/.test(t) || (t === 'V' && tok[i + 1] === 'LE') || (t === 'P' && tok[i + 1] === 'ZA'))) break;
      if (/^\d+$/.test(t)) continue;
      nome.push(t);
    }
    // La chiave: la prima parola "vera", più quelle generiche che la precedono (es. NUOVA IDEA, GELATERIA CONSUELO).
    const chiaveTok = [];
    for (const t of nome) {
      chiaveTok.push(t);
      if (!GENERICHE.has(t) || chiaveTok.length >= 3) break;
    }
    const chiave = chiaveTok.join(' ') || testo.split(' ').slice(0, 2).join(' ');
    return { esercente: titolo(nome.join(' ') || testo), chiave, testo: testo || norm, ambiguo: false };
  }

  function titolo(s) {
    return String(s).toLowerCase().replace(/\b([a-zà-ù])/g, (c) => c.toUpperCase());
  }

  function corrisponde(testo, pattern) {
    const t = ' ' + testo + ' ';
    if (pattern.endsWith('*')) return t.includes(' ' + pattern.slice(0, -1));
    return t.includes(' ' + pattern + ' ');
  }

  function cercaRegola(testo, regole) {
    let migliore = null;
    for (const r of regole) {
      if (corrisponde(testo, r.pattern) && (!migliore || r.pattern.length > migliore.pattern.length)) migliore = r;
    }
    return migliore;
  }

  const REGOLE_BASE_LISTA = Object.entries(REGOLE_BASE).flatMap(([categoria, ps]) =>
    ps.map((p) => ({ pattern: p.endsWith('*') ? normalizza(p) + '*' : normalizza(p), categoria })));

  // Restituisce { categoria, motivo } oppure { categoria: null }.
  function categorizza(mov, regoleUtente) {
    const info = mov.chiave ? mov : Object.assign({}, mov, analizza(mov.descrizione));
    const bper = normalizza(mov.categoriaBanca);
    if (info.ambiguo) {
      if (BPER_FISSE[bper]) return { categoria: BPER_FISSE[bper], motivo: 'banca' };
      return { categoria: null, motivo: 'ambiguo' };
    }
    const testo = info.testo || normalizza(info.descrizione);
    const ru = cercaRegola(testo, regoleUtente || []);
    if (ru) return { categoria: ru.categoria, motivo: 'regola' };
    if (BPER_FISSE[bper]) return { categoria: BPER_FISSE[bper], motivo: 'banca' };
    // Le regole di partenza valgono solo per le uscite.
    if (mov.importo < 0) {
      const rb = cercaRegola(testo, REGOLE_BASE_LISTA);
      if (rb) return { categoria: rb.categoria, motivo: 'base' };
    }
    return { categoria: null, motivo: 'sconosciuto' };
  }

  // Legge le righe di un foglio (array di array) esportato da BPER.
  function leggiEstratto(righe) {
    let h = -1;
    for (let i = 0; i < Math.min(righe.length, 60); i++) {
      if ((righe[i] || []).some((c) => normalizza(c) === 'DATA OPERAZIONE')) { h = i; break; }
    }
    if (h < 0) throw new Error('Non trovo la riga "Data operazione": il file non sembra un estratto BPER.');
    const intest = righe[h].map(normalizza);
    const col = (...nomi) => intest.findIndex((c) => nomi.includes(c));
    const c = {
      data: col('DATA OPERAZIONE'), valuta: col('DATA VALUTA'), descr: col('DESCRIZIONE'),
      entrate: col('ENTRATE'), uscite: col('USCITE'), categoria: col('CATEGORIA', 'CATEGORIE'), stato: col('STATO', 'NOTE'),
    };
    if (c.descr < 0 || (c.entrate < 0 && c.uscite < 0)) throw new Error('Mancano le colonne Descrizione / Entrate / Uscite.');

    const out = [];
    for (let i = h + 1; i < righe.length; i++) {
      const r = righe[i] || [];
      const data = parseData(r[c.data]);
      if (!data) continue;
      const entrata = c.entrate >= 0 ? parseImporto(r[c.entrate]) : 0;
      const uscita = c.uscite >= 0 ? parseImporto(r[c.uscite]) : 0;
      const importo = entrata ? entrata : -uscita;
      if (!importo) continue;
      out.push({
        data,
        importo,
        descrizione: String(r[c.descr] || '').replace(/\s+/g, ' ').trim(),
        categoriaBanca: c.categoria >= 0 ? String(r[c.categoria] || '').trim() : '',
        provvisorio: c.stato >= 0 && /DA CONTABILIZZARE/i.test(String(r[c.stato] || '')),
      });
    }
    return out;
  }

  function hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36);
  }

  // Confronta le righe importate con i movimenti già salvati.
  // Restituisce un piano: cosa è nuovo, cosa è già presente, cosa aggiorna o unisce un movimento esistente.
  function pianificaImport(righe, movimenti, regole) {
    const noti = new Set();
    for (const m of movimenti) { noti.add(m.id); (m.ids || []).forEach((x) => noti.add(x)); }
    const usati = new Set();
    const contatori = {};
    const piano = { nuovi: [], presenti: 0, aggiornati: [], uniti: [] };

    for (const r of righe) {
      const base = hash(`${r.data}|${r.importo}|${normalizza(r.descrizione)}`);
      contatori[base] = (contatori[base] || 0) + 1;
      const id = `b:${base}:${contatori[base]}`;
      const info = analizza(r.descrizione);

      if (noti.has(id)) {
        // Già importato: se prima era provvisorio e ora è contabilizzato, va solo aggiornato lo stato.
        const esist = movimenti.find((m) => m.id === id || (m.ids || []).includes(id));
        if (esist && esist.provvisorio && !r.provvisorio) piano.aggiornati.push({ mov: esist, riga: r, id });
        else piano.presenti++;
        continue;
      }

      // Era "da contabilizzare" in un import precedente e ora riappare con data o testo diversi?
      const provv = vicino(movimenti, usati, r, 7, (m) => m.origine === 'banca' && m.provvisorio && m.chiave === info.chiave);
      if (provv) { usati.add(provv.id); piano.aggiornati.push({ mov: provv, riga: r, id }); continue; }

      // L'avevi già segnato a mano?
      const manuale = vicino(movimenti, usati, r, 4, (m) => m.origine === 'manuale' && !m.collegato);
      if (manuale) { usati.add(manuale.id); piano.uniti.push({ mov: manuale, riga: r, id, info }); continue; }

      const cat = categorizza(Object.assign({}, r, info), regole);
      piano.nuovi.push({
        id, ids: [], data: r.data, importo: r.importo, descrizione: r.descrizione, categoriaBanca: r.categoriaBanca,
        provvisorio: r.provvisorio, origine: 'banca', esercente: info.esercente, chiave: info.chiave, testo: info.testo,
        ambiguo: info.ambiguo, categoria: cat.categoria, motivo: cat.motivo,
      });
    }
    return piano;
  }

  function vicino(movimenti, usati, r, maxGiorni, filtro) {
    let best = null; let bestD = Infinity;
    for (const m of movimenti) {
      if (usati.has(m.id) || m.importo !== r.importo || !filtro(m)) continue;
      const d = giorniTra(m.data, r.data);
      if (d <= maxGiorni && d < bestD) { best = m; bestD = d; }
    }
    return best;
  }

  const Core = {
    CATEGORIE_DEFAULT, normalizza, parseData, parseImporto, analizza, categorizza,
    leggiEstratto, pianificaImport, corrisponde, titolo,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Core;
  else root.Core = Core;
})(typeof window !== 'undefined' ? window : globalThis);
