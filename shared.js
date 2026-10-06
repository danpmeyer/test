/* ════════════════════════════════════════════════════════════════════════
   DSS Stockroom Toolbox — shared.js
   Loaded by every authenticated page via <script type="text/babel" src="shared.js">.
   Contains: constants, utilities, print architecture, data arrays, inventory /
   staff-catalog loading, auth + theme state, the persistent shell (top bar,
   sidebar, status bar), the Quick Launch overlay, and mountPage().

   NOTE: Because every script on a page shares one global scope, nothing in
   this file or in a page script may re-declare these top-level names.
════════════════════════════════════════════════════════════════════════ */
const { useState, useEffect, useRef, useCallback, useMemo } = React;

/* ── Keys / constants ──────────────────────────────────────────────────── */
const AUTH_KEY      = 'stockroom_auth';
const THEME_KEY     = 'stockroom_theme';
const RECENT_KEY    = 'stockroom_recent_tools';
const PINNED_KEY    = 'stockroom_pinned_tools';
const SIDEBAR_KEY   = 'stockroom_sidebar_collapsed';
const CORRECT       = 'enzyme';
const PITT_SEAL_URL = 'https://upload.wikimedia.org/wikipedia/en/thumb/f/fb/University_of_Pittsburgh_seal.svg/960px-University_of_Pittsburgh_seal.svg.png';

    /* ── Print utility — renders into a hidden iframe so only the target
          document is printed, never the surrounding app UI ──────────── */
    function printDocument(htmlContent) {
        // Remove any existing print frame
        const existing = document.getElementById('__printFrame');
        if (existing) existing.remove();
        const iframe = document.createElement('iframe');
        iframe.id = '__printFrame';
        iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:0;height:0;border:none;';
        document.body.appendChild(iframe);
        const doc = iframe.contentWindow.document;
        doc.open();
        doc.write(htmlContent);
        doc.close();
        iframe.contentWindow.focus();
        setTimeout(() => {
            iframe.contentWindow.print();
            setTimeout(() => iframe.remove(), 1000);
        }, 300);
    }

    function escHtml(str) {
        return String(str??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    const normalizeSKU = s => s.replace(/-/g,'').toUpperCase();

    const parseLocation = (loc) => {
        const u = loc.toUpperCase();
        const excl = ['HALLWAY','WASTEROOM','DOCKCAGE','THOMAS'];
        for (const k of excl) if (u.includes(k)) return { section: null, rack: 999, shelf: 999 };
        if (u === 'NEW' || u === 'NEW-' || u === 'NEW--') return { section: null, rack: 999, shelf: 999 };
        const n = loc.replace(/\s+/g,'').replace(/-+/g,'-');
        let m = n.match(/(?:DISC|NEW)\s*([A-Za-z])-?(\d+)-?(\d+)/i);
        if (m) return { section: m[1].toUpperCase(), rack: parseInt(m[2]), shelf: parseInt(m[3]) };
        m = n.match(/^([A-Za-z])-?(\d+)-?([A-Za-z]?\d+[A-Za-z]?)/);
        if (m) return { section: m[1].toUpperCase(), rack: parseInt(m[2]), shelf: parseInt(m[3].replace(/[A-Za-z]/g,'')) || 0 };
        return { section: 'Z', rack: 999, shelf: 999 };
    };

    const sortByLocation = items => [...items].sort((a, b) => {
        const la = parseLocation(a.location), lb = parseLocation(b.location);
        if (la.section !== lb.section) return (la.section||'Z').localeCompare(lb.section||'Z');
        if (la.rack !== lb.rack) return la.rack - lb.rack;
        return la.shelf - lb.shelf;
    });

    const SortIcon = ({ sortConfig, columnKey }) =>
        sortConfig.key !== columnKey
            ? <span style={{color:'#aaa', marginLeft:'3px', fontSize:'11px'}}>⇅</span>
            : sortConfig.direction === 'asc'
                ? <span style={{marginLeft:'3px', fontSize:'11px'}}>↑</span>
                : <span style={{marginLeft:'3px', fontSize:'11px'}}>↓</span>;

    /* ── Print HTML builders ──────────────────────────────────────────── */
    /* ── Shared print head: Pitt fonts + base CSS injected into every iframe doc ── */
    const PRINT_HEAD = `<meta charset='UTF-8'><link rel="stylesheet" href="https://use.typekit.net/myu6uxh.css"><link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Roboto:wght@300;400;500;700&family=Roboto+Mono:wght@400;500&display=swap" rel="stylesheet">
    <style>
        /* Pitt brand typography */
        :root {
            --royal:  #003594;
            --navy:   #00205B;
            --gold:   #FFB81C;
            --sky:    #DBEEFF;
            --green:  #00AD6E;
            --red:    #FF5B45;
            --dark-red: #770538;
            --gothic: 'alternate-gothic-no-3-d', 'Arial Narrow', sans-serif;
            --serif:  'Instrument Serif', Georgia, serif;
            --sans:   'Roboto', Arial, sans-serif;
            --mono:   'Roboto Mono', 'Courier New', monospace;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: var(--sans);
            font-size: 11px;
            font-weight: 400;
            color: #111;
            padding: 24px;
            background: white;
        }
        h1 {
            font-family: var(--serif);
            font-weight: 400;
            font-size: 22px;
            color: var(--royal);
            text-align: center;
            border-bottom: 3px solid var(--gold);
            padding-bottom: 10px;
            margin-bottom: 18px;
        }
        h2 {
            font-family: var(--serif);
            font-weight: 400;
            font-size: 15px;
            color: var(--navy);
            margin: 18px 0 8px;
        }
        .label {
            font-family: var(--gothic);
            font-size: 9px;
            font-weight: 700;
            letter-spacing: 0.1em;
            text-transform: uppercase;
            color: var(--navy);
        }
        .section-badge {
            font-family: var(--gothic);
            font-size: 8.5px;
            font-weight: 700;
            letter-spacing: 0.12em;
            text-transform: uppercase;
            color: var(--gold);
            background: var(--royal);
            padding: 3px 8px;
            border-radius: 3px;
            display: inline-block;
            margin-bottom: 10px;
        }
        p { margin: 3px 0; font-size: 11px; line-height: 1.5; }
        strong { font-weight: 600; }
        table { width: 100%; border-collapse: collapse; margin-top: 4px; }
        th {
            font-family: var(--gothic);
            font-size: 9px;
            font-weight: 700;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            background: var(--sky);
            color: var(--navy);
            padding: 6px 7px;
            border: 1px solid #c5d8ee;
            text-align: left;
        }
        td { padding: 5px 7px; border: 1px solid #ddd; font-size: 11px; vertical-align: top; }
        tbody tr:nth-child(even) { background: #fafbfd; }
        .mono { font-family: var(--mono); }
        .bold { font-weight: 600; }
        .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 18px; padding: 12px 14px; background: var(--sky); border-left: 4px solid var(--royal); border-radius: 0 6px 6px 0; }
        .not-found { margin-top: 14px; padding: 10px 12px; border-left: 4px solid var(--red); background: #fff0ed; border-radius: 0 6px 6px 0; }
        .not-found .label { color: var(--dark-red); }
        .not-found ul { margin: 6px 0 0 18px; color: var(--dark-red); }
        .not-found li { font-family: var(--mono); font-size: 11px; }
        .notes-box { margin-top: 14px; padding: 10px 12px; border-left: 4px solid var(--gold); background: #fffbe6; border-radius: 0 6px 6px 0; }
        .variance-row { background: #fff0ed !important; }
        .missing-row  { background: #fff0ed !important; }
        .summary-box { margin-top: 18px; padding: 10px 14px; border: 1.5px solid var(--navy); border-radius: 6px; font-family: var(--gothic); font-size: 10px; letter-spacing: 0.06em; color: var(--navy); }
        .parties-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 14px; }
        .party-box { padding: 10px 12px; border: 1px solid #ccc; border-radius: 6px; }
        .logistics-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 14px; padding: 10px 12px; border: 1px solid #ccc; border-radius: 6px; }
        .sig-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 28px; padding-top: 14px; border-top: 1px solid #ccc; }
        .sig-line { border-bottom: 1px solid #333; margin: 28px 0 4px; }
        .sig-caption { font-family: var(--gothic); font-size: 8.5px; letter-spacing: 0.08em; text-transform: uppercase; color: #666; }
        @keyframes shake {
            0%, 100% { transform: translateX(0); }
            20%       { transform: translateX(-8px); }
            40%       { transform: translateX(8px); }
            60%       { transform: translateX(-6px); }
            80%       { transform: translateX(6px); }
        }
        @media print {
            body { padding: 14px; }
            @page { margin: 1.2cm; }
        }
    </style>`;

    // ── Hazmat chemical database (from DOT Guide + shipping sheets) ────────
    const HAZMAT_DB = [
        { un:'UN1090', name:'Acetone',                              hazClass:'3',       pg:'II',  labels:'Flammable Liquid', ltdQty:'1 L',   density:0.791 },
        { un:'UN1114', name:'Benzene',                              hazClass:'3',       pg:'II',  labels:'Flammable Liquid', ltdQty:'1 L',   density:0.879 },
        { un:'UN1155', name:'Diethyl Ether',                        hazClass:'3',       pg:'I',   labels:'Flammable Liquid', ltdQty:'500 mL',density:0.713 },
        { un:'UN1161', name:'Dimethyl Carbonate',                   hazClass:'3',       pg:'II',  labels:'Flammable Liquid', ltdQty:'1 L',   density:1.069 },
        { un:'UN1165', name:'1,4-Dioxane',                          hazClass:'3',       pg:'II',  labels:'Flammable Liquid', ltdQty:'1 L',   density:1.033 },
        { un:'UN1170', name:'Ethanol Solution',                     hazClass:'3',       pg:'II',  labels:'Flammable Liquid', ltdQty:'1 L',   density:0.789 },
        { un:'UN1173', name:'Ethyl Acetate',                        hazClass:'3',       pg:'II',  labels:'Flammable Liquid', ltdQty:'1 L',   density:0.902 },
        { un:'UN1198', name:'Formaldehyde Solution, Flammable',     hazClass:'3 (8)',   pg:'III', labels:'Flammable Liquid; Corrosive', ltdQty:'5 L',   density:1.090 },
        { un:'UN1208', name:'Hexanes',                              hazClass:'3',       pg:'II',  labels:'Flammable Liquid', ltdQty:'1 L',   density:0.659 },
        { un:'UN1219', name:'Isopropanol',                          hazClass:'3',       pg:'II',  labels:'Flammable Liquid', ltdQty:'1 L',   density:0.786 },
        { un:'UN1223', name:'Kerosene',                             hazClass:'3',       pg:'III', labels:'Flammable Liquid', ltdQty:'5 L',   density:0.800 },
        { un:'UN1230', name:'Methanol',                             hazClass:'3',       pg:'II',  labels:'Flammable Liquid', ltdQty:'1 L',   density:0.791 },
        { un:'UN1263', name:'Paint',                                hazClass:'3',       pg:'II',  labels:'Flammable Liquid', ltdQty:'1 L',   density:1.000 },
        { un:'UN1265', name:'Pentanes',                             hazClass:'3',       pg:'I',   labels:'Flammable Liquid', ltdQty:'500 mL',density:0.626 },
        { un:'UN1282', name:'Pyridine',                             hazClass:'3',       pg:'II',  labels:'Flammable Liquid', ltdQty:null,    density:0.982 },
        { un:'UN1294', name:'Toluene',                              hazClass:'3',       pg:'II',  labels:'Flammable Liquid', ltdQty:'1 L',   density:0.867 },
        { un:'UN1296', name:'Triethylamine',                        hazClass:'3 (8)',   pg:'II',  labels:'Flammable Liquid; Corrosive', ltdQty:'1 L',   density:0.726 },
        { un:'UN1298', name:'Trimethylchlorosilane',                hazClass:'3 (8)',   pg:'II',  labels:'Flammable Liquid; Corrosive', ltdQty:null,    density:0.856 },
        { un:'UN1307', name:'Xylenes',                              hazClass:'3',       pg:'II',  labels:'Flammable Liquid', ltdQty:'1 L',   density:0.864 },
        { un:'UN1404', name:'Calcium Hydride',                      hazClass:'4.3',     pg:'I',   labels:'Dangerous When Wet', ltdQty:null,    density:1.700 },
        { un:'UN1410', name:'Lithium Aluminium Hydride',            hazClass:'4.3',     pg:'I',   labels:'Dangerous When Wet', ltdQty:null,    density:0.917 },
        { un:'UN1415', name:'Lithium',                              hazClass:'4.3',     pg:'I',   labels:'Dangerous When Wet', ltdQty:null,    density:0.534 },
        { un:'UN1426', name:'Sodium Borohydride',                   hazClass:'4.3',     pg:'I',   labels:'Dangerous When Wet', ltdQty:null,    density:1.074 },
        { un:'UN1564', name:'Barium Compound, N.O.S.',              hazClass:'6.1',     pg:'II',  labels:'Toxic', ltdQty:'500 g', density:3.856 },
        { un:'UN1593', name:'Dichloromethane',                      hazClass:'6.1',     pg:'III', labels:'Toxic', ltdQty:'4 L',   density:1.325 },
        { un:'UN1648', name:'Acetonitrile',                         hazClass:'3',       pg:'II',  labels:'Flammable Liquid', ltdQty:'1 L',   density:0.786 },
        { un:'UN1717', name:'Acetyl Chloride',                      hazClass:'3 (8)',   pg:'II',  labels:'Flammable Liquid; Corrosive', ltdQty:'1 L',   density:1.104 },
        { un:'UN1727', name:'Ammonium Hydrogendifluoride, Solid',   hazClass:'8',       pg:'II',  labels:'Corrosive', ltdQty:'1 kg',  density:1.500 },
        { un:'UN1760', name:'Corrosive Liquid, N.O.S.',             hazClass:'8',       pg:'II',  labels:'Corrosive', ltdQty:'1 L',   density:1.000 },
        { un:'UN1773', name:'Ferric Chloride, Anhydrous',           hazClass:'8',       pg:'III', labels:'Corrosive', ltdQty:'5 kg',  density:2.898 },
        { un:'UN1789', name:'Hydrochloric Acid',                    hazClass:'8',       pg:'II',  labels:'Corrosive', ltdQty:'1 L',   density:1.190 },
        { un:'UN1790', name:'Hydrofluoric Acid',                    hazClass:'8 (6.1)', pg:'I',   labels:'Corrosive; Toxic', ltdQty:'100 mL',density:1.150 },
        { un:'UN1805', name:'Phosphoric Acid Solution',             hazClass:'8',       pg:'III', labels:'Corrosive', ltdQty:'5 L',   density:1.685 },
        { un:'UN1813', name:'Potassium Hydroxide, Solid',           hazClass:'8',       pg:'II',  labels:'Corrosive', ltdQty:'1 kg',  density:2.044 },
        { un:'UN1823', name:'Sodium Hydroxide, Solid',              hazClass:'8',       pg:'II',  labels:'Corrosive', ltdQty:'1 kg',  density:2.130 },
        { un:'UN1830', name:'Sulfuric Acid',                        hazClass:'8',       pg:'II',  labels:'Corrosive', ltdQty:'1 L',   density:1.840 },
        { un:'UN1888', name:'Chloroform',                           hazClass:'6.1',     pg:'III', labels:'Toxic', ltdQty:'5 L',   density:1.489 },
        { un:'UN1992', name:'Flammable Liquid, Toxic, N.O.S.',      hazClass:'3 (6.1)', pg:'II',  labels:'Flammable Liquid; Toxic', ltdQty:'100 mL',density:1.000 },
        { un:'UN1993', name:'Flammable Liquid, N.O.S.',             hazClass:'3',       pg:'II',  labels:'Flammable Liquid', ltdQty:'1 L',   density:1.000 },
        { un:'UN2014', name:'Hydrogen Peroxide, Aqueous Solution',  hazClass:'5.1 (8)', pg:'II',  labels:'Oxidizer; Corrosive', ltdQty:null,    density:1.110 },
        { un:'UN2031', name:'Nitric Acid',                          hazClass:'5.1 (8)', pg:'II',  labels:'Oxidizer; Corrosive', ltdQty:null,    density:1.413 },
        { un:'UN2056', name:'Tetrahydrofuran',                      hazClass:'3',       pg:'II',  labels:'Flammable Liquid', ltdQty:'1 L',   density:0.889 },
        { un:'UN2074', name:'Acrylamide Solution',                  hazClass:'6.1',     pg:'III', labels:'Toxic', ltdQty:'4 L',   density:1.010 },
        { un:'UN2252', name:'1,2-Dimethoxyethane',                  hazClass:'3',       pg:'II',  labels:'Flammable Liquid', ltdQty:'1 L',   density:0.863 },
        { un:'UN2583', name:'Alkylsulfonic Acids, Solid',           hazClass:'8',       pg:'II',  labels:'Corrosive', ltdQty:'1 kg',  density:1.240 },
        { un:'UN2584', name:'Alkylsulfonic Acids, Liquid',          hazClass:'8',       pg:'II',  labels:'Corrosive', ltdQty:'1 L',   density:1.240 },
        { un:'UN2604', name:'Boron Trifluoride Diethyl Etherate',   hazClass:'8 (3)',   pg:'I',   labels:'Corrosive; Flammable Liquid', ltdQty:null,    density:1.125 },
        { un:'UN2672', name:'Ammonia Solution',                     hazClass:'8',       pg:'III', labels:'Corrosive', ltdQty:'5 L',   density:0.900 },
        { un:'UN2693', name:'Bisulfites, Aqueous Solution',         hazClass:'8',       pg:'III', labels:'Corrosive', ltdQty:'5 L',   density:1.000 },
        { un:'UN2699', name:'Trifluoroacetic Acid',                 hazClass:'8',       pg:'I',   labels:'Corrosive', ltdQty:null,    density:1.489 },
        { un:'UN2733', name:'Amines, Flammable, Corrosive, N.O.S.', hazClass:'3 (8)',   pg:'II',  labels:'Flammable Liquid; Corrosive', ltdQty:'1 L',   density:0.776 },
        { un:'UN2789', name:'Acetic Acid, Glacial',                 hazClass:'8 (3)',   pg:'II',  labels:'Corrosive; Flammable Liquid', ltdQty:'1 L',   density:1.049 },
        { un:'UN2790', name:'Acetic Acid Solution',                 hazClass:'8',       pg:'II',  labels:'Corrosive', ltdQty:'1 L',   density:1.040 },
        { un:'UN2803', name:'Gallium',                              hazClass:'8',       pg:'III', labels:'Corrosive', ltdQty:null,    density:5.910 },
        { un:'UN2809', name:'Mercury',                              hazClass:'8',       pg:'III', labels:'Corrosive', ltdQty:null,    density:13.534 },
        { un:'UN2810', name:'Toxic Liquid, Organic, N.O.S.',        hazClass:'6.1',     pg:'II',  labels:'Toxic', ltdQty:'100 mL',density:1.000 },
        { un:'UN2924', name:'Flammable Liquid, Corrosive, N.O.S.',  hazClass:'3 (8)',   pg:'II',  labels:'Flammable Liquid; Corrosive', ltdQty:'1 L',   density:1.000 },
        { un:'UN3077', name:'Environmentally Hazardous Substance, Solid, N.O.S.', hazClass:'9', pg:'III', labels:'Miscellaneous', ltdQty:'5 kg',  density:1.000 },
        { un:'UN3082', name:'Environmentally Hazardous Substance, Liquid, N.O.S.',hazClass:'9', pg:'III', labels:'Miscellaneous', ltdQty:'5 L',   density:1.000 },
        { un:'UN3249', name:'Medicine, Solid, Toxic, N.O.S. (PG II)', hazClass:'6.1',  pg:'II',  labels:'Toxic', ltdQty:'500 g', density:1.000 },
        { un:'UN3249', name:'Medicine, Solid, Toxic, N.O.S. (PG III)',hazClass:'6.1',  pg:'III', labels:'Toxic', ltdQty:'5 kg',  density:1.000 },
        { un:'UN3263', name:'Corrosive Solid, Basic, Organic, N.O.S.',hazClass:'8',     pg:'II',  labels:'Corrosive', ltdQty:'500 g', density:1.000 },
        { un:'UN3373', name:'Biological Substance, Category B',     hazClass:'6.2',     pg:null,  ltdQty:null,    density:1.000 },
        { un:'UN3393', name:'Organometallic Substance, Solid, Pyrophoric, Water-Reactive', hazClass:'4.2 (4.3)', pg:'I', labels:'Spontaneously Combustible; Dangerous When Wet', ltdQty:null, density:1.000 },
        { un:'UN3394', name:'Organometallic Substance, Liquid, Pyrophoric, Water-Reactive',hazClass:'4.2 (4.3)', pg:'I', labels:'Spontaneously Combustible; Dangerous When Wet', ltdQty:null, density:1.000 },
        { un:'UN3398', name:'Organometallic Substance, Liquid, Water-Reactive, Flammable', hazClass:'4.3 (3)',   pg:'I', labels:'Flammable Liquid; Dangerous When Wet', ltdQty:null, density:1.000 },
    ];

    // ── Pitt address list (abbreviated — full list loaded from xlsx at runtime) ──
    // The component also loads Pitt_Address.xlsx but we embed the most common ones as fallback
    const PITT_ADDRESSES_FALLBACK = [
        { code:'CHVRN', name:'Chevron Science Center',          address:'219 Parkman Avenue, Pittsburgh, PA 15260' },
        { code:'EBERL', name:'Eberly Hall',                     address:'4200 Fifth Ave, Pittsburgh, PA 15260' },
        { code:'BENDM', name:'Benedum Hall',                    address:'3700 O\'Hara St, Pittsburgh, PA 15261' },
        { code:'BST3',  name:'Biomedical Science Tower 3',      address:'3501 Fifth Avenue, Pittsburgh, PA 15260' },
        { code:'BSTWR', name:'Biomedical Science Tower',        address:'200 Lothrop Street, Pittsburgh, PA 15213' },
        { code:'CL',    name:'Cathedral of Learning',           address:'4200 Fifth Ave, Pittsburgh, PA 15260' },
        { code:'LANGY', name:'Langley Hall',                    address:'4249 Fifth Avenue, Pittsburgh, PA 15260' },
        { code:'OEH',   name:'Old Engineering Hall',            address:'3700 O\'Hara St, Pittsburgh, PA 15261' },
        { code:'SRCC',  name:'Sennott Square',                  address:'210 S Bouquet St, Pittsburgh, PA 15260' },
        { code:'PUBHL', name:'Public Health',                   address:'130 DeSoto Street, Pittsburgh, PA 15261' },
        { code:'SCAIF', name:'Scaife Hall',                     address:'3550 Terrace St, Pittsburgh, PA 15261' },
        { code:'SALK',  name:'Salk Hall',                       address:'3501 Terrace St, Pittsburgh, PA 15261' },
        { code:'ALLEN', name:'Allen Hall',                      address:'3941 O\'Hara St, Pittsburgh, PA 15260' },
        { code:'MAGEE', name:'Magee-Womens Research Institute', address:'204 Craft Avenue, Pittsburgh, PA 15213' },
    ];

/* ══════════════════════════════════════════════════════════════════════
   NAVIGATION / TOOL REGISTRY
══════════════════════════════════════════════════════════════════════ */
const TOOLS = [
    { id:'forms',       name:'Forms',        href:'forms.html',       icon:'clipboard', section:'toolkit', desc:'Packing slips, commercial hazmat BOLs, product requests, and form history',      keywords:'packing slip bill of lading product request history' },
    { id:'hazmat-bol',  name:'Hazmat BOL',   href:'hazmat-bol.html',  icon:'hazard',    section:'toolkit', desc:'DOT hazmat transportation log for internal deliveries (not in commerce)',        keywords:'dot internal delivery bill of lading un chemical transport' },
    { id:'emails',      name:'Emails',       href:'emails.html',      icon:'mail',      section:'toolkit', desc:'Order status email templates and a branded custom composer',                      keywords:'template outlook mailto notification reminder' },
    { id:'phonebook',   name:'Phonebook',    href:'phonebook.html',   icon:'phone',     section:'toolkit', desc:'Contact directory across Chemistry, Biology, SRSS, Pitt offices, and vendors',    keywords:'contacts directory email phone vendor' },
    { id:'cycle-count', name:'Cycle Count',  href:'cycle-count.html', icon:'box',       section:'toolkit', desc:'Scan-based inventory verification by section and rack',                          keywords:'inventory scan variance count audit' },
    { id:'labels',      name:'Label Maker',  href:'labels.html',      icon:'tag',       section:'toolkit', desc:'Avery 5162 / 5160 barcode shelf labels',                                        keywords:'avery barcode shelf label print pdf' },
    { id:'metrics',     name:'Metrics',      href:'metrics.html',     icon:'chart',     section:'toolkit', desc:'Order history, revenue, top items, top customers, and quarterly review dashboards', keywords:'orders revenue sales customers quarterly dashboard report', newTab:true },
];
const INFO_TOOL = { id:'information', name:'Information', href:'information.html', icon:'book', section:'information', desc:'Ordering guides, SOPs, vendor guides, and regulatory references', keywords:'wiki guide help' };
const ALL_TOOLS = [...TOOLS, INFO_TOOL];

/* ── Information section: categories and articles ──────────────────────
   Add an article by adding an entry to a category's `articles` array.
     id       — url-safe slug (information.html?cat=ordering&article=decon)
     title    — card / heading text
     summary  — one-line description
     body     — optional array of paragraph strings for simple text articles
   Articles that need custom UI also register a renderer in
   ARTICLE_RENDERERS inside information.html (keyed by the same id).        */
const INFO_CATEGORIES = [
    { id:'ordering',      name:'Ordering',      icon:'cart',  desc:'Step-by-step vendor ordering procedures',
      articles:[
        { id:'decon', title:'Decon Laboratories', summary:'Ethanol ordering through PLCB and PantherExpress, with live inventory and the External Notes block' },
      ] },
    { id:'sops',          name:'SOPs',          icon:'file',  desc:'Standard operating procedures',        articles:[] },
    { id:'vendor-guides', name:'Vendor Guides', icon:'truck', desc:'Vendor contacts, catalogs, and quirks', articles:[] },
    { id:'regulatory',    name:'Regulatory',    icon:'scale', desc:'DOT, EH&S, and compliance references',  articles:[] },
];

const USEFUL_LINKS = [
    { label:'DSSS Public Website',           url:'https://www.researchservices.pitt.edu/facilities/dietrich-school-scientific-stockroom' },
    { label:'myPitt',                        url:'https://my.pitt.edu/' },
    { label:'WTS',                           url:'https://wts.neopost.com/' },
    { label:'SciShield',                     url:'https://pitt.scishield.com/' },
    { label:'Email List',                    url:'https://list.pitt.edu/mailman/admin/dsscustomers' },
    { label:'Pitt People Lookup',            url:'https://find.pitt.edu/' },
    { label:'D.A.S.H.',                      url:'https://dash.as.pitt.edu/' },
    { label:'PLCB',                          url:'https://www.apps.lcb.pa.gov/webapp/Licensing/BulkPurchase/bulkpo.asp' },
    { label:'Product Request Form',          url:'https://pitt.co1.qualtrics.com/jfe/form/SV_6Q0XFOmvhbcJSiG' },
    { label:'Return Request Form',           url:'https://pitt.co1.qualtrics.com/jfe/form/SV_bK3b6Tif3i8QTCC' },
    { label:'Transportation Request Form',   url:'https://pitt.co1.qualtrics.com/jfe/form/SV_eD2qQiMIShO50bk' },
    { label:'DOT Hazardous Materials Table', url:'https://www.ecfr.gov/current/title-49/subtitle-B/chapter-I/subchapter-C/part-172/subpart-B/section-172.101' },
    { label:'PubChem',                       url:'https://pubchem.ncbi.nlm.nih.gov/' },
    { label:'Facebook',                      url:'https://www.facebook.com/DSSStockroom/' },
    { label:'Instagram',                     url:'https://www.instagram.com/dssstockroom' },
    { label:'X / Twitter',                   url:'https://x.com/dssstockroom' },
];

/* ══════════════════════════════════════════════════════════════════════
   ICONS — one stroke-based set so every page shares a visual language
══════════════════════════════════════════════════════════════════════ */
const ICON_PATHS = {
    search:    '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    menu:      '<path d="M4 6h16M4 12h16M4 18h16"/>',
    sun:       '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon:      '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 13h6M9 17h4"/>',
    hazard:    '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    mail:      '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
    phone:     '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
    box:       '<path d="M21 8 12 3 3 8v8l9 5 9-5V8z"/><path d="m3.3 7.5 8.7 5 8.7-5M12 22V12.5"/>',
    tag:       '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z"/><circle cx="7" cy="7" r="1.2"/>',
    book:      '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
    cart:      '<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h3l2.7 12.4a2 2 0 0 0 2 1.6h8.1a2 2 0 0 0 2-1.5L21.5 7H6"/>',
    file:      '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h6"/>',
    truck:     '<path d="M1 3h15v13H1zM16 8h4l3 3v5h-7"/><circle cx="5.5" cy="18.5" r="2"/><circle cx="18.5" cy="18.5" r="2"/>',
    scale:     '<path d="M12 3v18M5 21h14M5 7h14"/><path d="M5 7 2 14a3 3 0 0 0 6 0L5 7zM19 7l-3 7a3 3 0 0 0 6 0l-3-7z"/>',
    link:      '<path d="M10 13a5 5 0 0 0 7.1 0l3-3a5 5 0 0 0-7.1-7.1l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.1 0l-3 3a5 5 0 0 0 7.1 7.1l1.7-1.7"/>',
    pin:       '<path d="M12 17v5M9 3h6l-1 7 3 3v2H7v-2l3-3-1-7z"/>',
    chevL:     '<path d="m15 18-6-6 6-6"/>',
    chevR:     '<path d="m9 18 6-6-6-6"/>',
    chevD:     '<path d="m6 9 6 6 6-6"/>',
    external:  '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3"/>',
    home:      '<path d="m3 10 9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
    user:      '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    copy:      '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    x:         '<path d="M18 6 6 18M6 6l12 12"/>',
    chart:     '<path d="M3 3v18h18"/><path d="M7 15v3M12 10v8M17 6v12"/>',
    corner:    '<path d="M9 10 4 15l5 5"/><path d="M20 4v7a4 4 0 0 1-4 4H4"/>',
};
function Icon({ name, size = 18, className = '', style }) {
    return (
        <svg className={`icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none"
             stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
             aria-hidden="true" style={style}
             dangerouslySetInnerHTML={{ __html: ICON_PATHS[name] || '' }} />
    );
}

/* ══════════════════════════════════════════════════════════════════════
   THEME + AUTH + RECENT / PINNED TOOLS
══════════════════════════════════════════════════════════════════════ */
function getTheme() { try { return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light'; } catch(e) { return 'light'; } }
function applyTheme(t) { document.documentElement.setAttribute('data-theme', t); }
function useTheme() {
    const [theme, setThemeState] = useState(getTheme);
    const setTheme = (t) => { try { localStorage.setItem(THEME_KEY, t); } catch(e) {} applyTheme(t); setThemeState(t); };
    useEffect(() => { applyTheme(theme); }, []);
    return [theme, () => setTheme(theme === 'dark' ? 'light' : 'dark')];
}
function isAuthed() { try { return localStorage.getItem(AUTH_KEY) === '1'; } catch(e) { return false; } }

function readList(key) { try { const v = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(v) ? v : []; } catch(e) { return []; } }
function recordToolVisit(id) {
    if (!ALL_TOOLS.some(t => t.id === id)) return;
    const next = [id, ...readList(RECENT_KEY).filter(x => x !== id)].slice(0, 8);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch(e) {}
}
function togglePinnedTool(id) {
    const cur = readList(PINNED_KEY);
    const next = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id];
    try { localStorage.setItem(PINNED_KEY, JSON.stringify(next)); } catch(e) {}
    return next;
}

/* ══════════════════════════════════════════════════════════════════════
   DATA LAYER — inventory-status-report.xlsx + staff-catalog.xlsx
   One module-level store so the shell, status bar, Quick Launch and the page
   itself share a single fetch.
══════════════════════════════════════════════════════════════════════ */
const DataStore = {
    inventory: [], staffNames: {}, dbStatus: 'loading', lastModified: null,
    version: 0, started: false, listeners: new Set(),
};
function dsNotify() { DataStore.version++; DataStore.listeners.forEach(fn => fn(DataStore.version)); }

function startDataLoad() {
    if (DataStore.started) return;
    DataStore.started = true;

    // Inventory (parsing identical to the previous single-page app)
    fetch('inventory-status-report.xlsx')
        .then(r => {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            const lm = r.headers.get('Last-Modified');
            if (lm) DataStore.lastModified = new Date(lm);
            return r.arrayBuffer();
        })
        .then(ab => {
            try {
                const wb = XLSX.read(ab, { type:'array', cellDates:true });
                const ws = wb.Sheets[wb.SheetNames[0]];
                if (wb.Props?.ModifiedDate) DataStore.lastModified = new Date(wb.Props.ModifiedDate);
                const json = XLSX.utils.sheet_to_json(ws, { header:1, raw:false, defval:'' });
                if (json.length < 2) { DataStore.dbStatus = 'error'; dsNotify(); return; }
                const data = [];
                for (let i = 1; i < json.length; i++) {
                    const r = json[i];
                    if (r.length >= 15 && r[4]) {
                        const item = {
                            location: String(r[2]||'').trim(),
                            internalSKU: String(r[4]||'').trim(),
                            manufacturerSKUs: [r[5],r[6],r[7],r[8]].map(x=>String(x||'').trim()).filter(s=>s),
                            itemName: String(r[13]||'').trim(),
                            uom: String(r[14]||'').trim(),
                            altUom: String(r[15]||'').trim(),
                            convFactor: String(r[16]||'').trim(),
                            childPartNbr: String(r[17]||'').trim(),
                            childConvFactor: String(r[18]||'').trim(),
                            vendor: String(r[12]||'').trim(),
                            externalPrice: String(r[26]||'').trim(),
                            ourPrice: String(r[27]||'').trim(),
                            onHand:      String(r[23]||'').trim(),
                            maxStock:    String(r[19]||'').trim(),
                            reorderPoint:String(r[20]||'').trim()
                        };
                        if (item.internalSKU && item.location) data.push(item);
                    }
                }
                DataStore.inventory = data;
                DataStore.dbStatus = 'ok';
                dsNotify();
            } catch(e) { DataStore.dbStatus = 'error'; dsNotify(); }
        })
        .catch(() => {
            try {
                const saved = localStorage.getItem('stockroom_inventory');
                if (saved) { DataStore.inventory = JSON.parse(saved); DataStore.dbStatus = 'ok'; }
                else DataStore.dbStatus = 'error';
            } catch(e) { DataStore.dbStatus = 'error'; }
            dsNotify();
        });

    // Staff catalog: part number → full item name (silent fallback to inventory names)
    fetch('staff-catalog.xlsx')
        .then(r => r.arrayBuffer())
        .then(ab => {
            const wb = XLSX.read(ab, { type:'array', raw:false });
            const ws = wb.Sheets[wb.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(ws, { header:1, defval:'' });
            const map = {};
            for (let i = 1; i < rows.length; i++) {
                const partNum = String(rows[i][0]||'').trim();
                const name    = String(rows[i][1]||'').trim();
                if (partNum && name) map[partNum.toUpperCase()] = name;
            }
            DataStore.staffNames = map;
            dsNotify();
        })
        .catch(() => {});
}

function useStockroomData() {
    const [, setV] = useState(DataStore.version);
    useEffect(() => {
        DataStore.listeners.add(setV);
        startDataLoad();
        setV(DataStore.version);
        return () => { DataStore.listeners.delete(setV); };
    }, []);
    return {
        inventory: DataStore.inventory, staffNames: DataStore.staffNames,
        dbStatus: DataStore.dbStatus, lastModified: DataStore.lastModified,
    };
}

/* Full-name lookup: staff-catalog name if any SKU matches, else inventory name */
function fullNameFor(item, staffNames) {
    return [item.internalSKU, ...item.manufacturerSKUs].map(s => staffNames[s.toUpperCase()]).find(n => n) || '';
}
function displayNameFor(item, staffNames) { return fullNameFor(item, staffNames) || item.itemName; }

/* Catalog rules for the main-site search (separate from the public catalog-search.html widget, which is untouched) */
function isCatalogVisible(item) { return !item.internalSKU.toUpperCase().startsWith('Y'); }
function isStrategicStockout(item) {
    return (item.location || '').trim().toUpperCase().startsWith('SS');
}

/* Catalog search — matching logic carried over from the previous homepage search */
function searchCatalog(inventory, staffNames, rawQuery) {
    const query = (rawQuery || '').trim().toLowerCase();
    if (!query) return [];
    const words = query.split(/\s+/);
    const nq = normalizeSKU(query);
    return inventory.filter(item => {
        if (!isCatalogVisible(item)) return false;
        const ni = normalizeSKU(item.internalSKU);
        const nm = item.manufacturerSKUs.map(normalizeSKU);
        const fullName = fullNameFor(item, staffNames);
        if (ni.includes(nq) || nq.includes(ni)) return true;
        if (nm.some(m => m.includes(nq) || nq.includes(m))) return true;
        if (words.every(w => item.itemName.toLowerCase().includes(w))) return true;
        if (fullName && words.every(w => fullName.toLowerCase().includes(w))) return true;
        if (item.vendor && words.every(w => item.vendor.toLowerCase().includes(w))) return true;
        if (item.location && item.location.toLowerCase().includes(query)) return true;
        return false;
    });
}

/* On-hand badge — colour-coded by % of max stock (thresholds unchanged) */
function OnHandBadge({ item }) {
    if (isStrategicStockout(item)) return <span className="pill pill-ss">Strategic Stockout</span>;
    const n = parseFloat(item.onHand);
    const max = parseFloat(item.maxStock);
    if (isNaN(n) || item.onHand === '') return <span style={{color:'var(--muted)'}}>—</span>;
    if (n <= 0) return <span className="pill pill-out">Out</span>;
    if (!isNaN(max) && max > 0) {
        const ratio = n / max;
        if (ratio <= 0.25) return <span className="pill pill-out">{n}</span>;
        if (ratio <= 0.50) return <span className="pill pill-low">{n}</span>;
        return <span className="pill pill-in">{n}</span>;
    }
    return n <= 3 ? <span className="pill pill-low">{n}</span> : <span className="pill pill-in">{n}</span>;
}

/* Timestamp formatting (uppercase AM/PM) */
function formatStamp(d) {
    if (!d || isNaN(d)) return '';
    return d.toLocaleDateString('en-US') + ' ' + d.toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' });
}

/* ── Phonebook (lazy; used by Quick Launch only — PhonebookPage keeps its own loader) ── */
let __phonebookPromise = null;
function loadPhonebookContacts() {
    if (__phonebookPromise) return __phonebookPromise;
    __phonebookPromise = fetch('phonebook.xlsx')
        .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); })
        .then(ab => {
            const wb = XLSX.read(ab, { type:'array', raw:false });
            if (!wb.SheetNames.includes('Master List')) return [];
            const rows = XLSX.utils.sheet_to_json(wb.Sheets['Master List'], { defval: '' });
            const seen = new Map();
            rows.forEach(r => {
                const last  = String(r['Last Name'] || '').trim();
                const first = String(r['First Name (Preferd Name)'] || r['First Name'] || '').trim();
                if (!last && !first) return;
                const email = String(r['Email'] || '').trim();
                const key = email ? 'email::' + email.toLowerCase() : 'name::' + (last + ',' + first).toLowerCase().replace(/\s+/g,'');
                const c = {
                    lastName: last, firstName: first,
                    title: String(r['Job Title'] || '').trim(),
                    department: String(r['Department'] || '').trim(),
                    group: String(r['Group'] || '').trim(),
                    phone: String(r['Phone 1'] || '').trim(),
                    phone2: String(r['Phone 2'] || '').trim(),
                    cell: String(r['Phone 3'] || '').trim(),
                    email,
                };
                if (seen.has(key)) {
                    const ex = seen.get(key);
                    ['phone','phone2','cell','email','title','department'].forEach(f => { if (!ex[f] && c[f]) ex[f] = c[f]; });
                } else seen.set(key, c);
            });
            return Array.from(seen.values());
        })
        .catch(() => { __phonebookPromise = null; return []; });
    return __phonebookPromise;
}

/* ══════════════════════════════════════════════════════════════════════
   SHELL — slim top bar, collapsible sidebar, persistent status bar
══════════════════════════════════════════════════════════════════════ */
function TopBar({ onToggleSidebar, onQuickLaunch, theme, onToggleTheme }) {
    const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
    return (
        <header className="topbar">
            <button className="icon-btn" onClick={onToggleSidebar} aria-label="Toggle sidebar" title="Toggle sidebar">
                <Icon name="menu" />
            </button>
            <a className="topbar-brand" href="index.html" aria-label="DSS Stockroom Toolbox home">
                <img src={PITT_SEAL_URL} alt="University of Pittsburgh seal" />
                <span>DSS Stockroom Toolbox</span>
            </a>
            <div className="topbar-spacer" />
            <button className="topbar-launch" onClick={onQuickLaunch} aria-label="Quick Launch (search everything)" title="Quick Launch">
                <Icon name="search" size={17} />
                <span className="topbar-launch-label">Quick Launch</span>
                <kbd>{isMac ? '⌘K' : 'Ctrl K'}</kbd>
            </button>
            <button className="icon-btn" onClick={onToggleTheme} aria-label="Toggle dark mode" title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
                <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
            </button>
        </header>
    );
}

function Sidebar({ page, collapsed, onToggleCollapsed, mobileOpen, onCloseMobile }) {
    const [q, setQ] = useState('');
    const [linksOpen, setLinksOpen] = useState(false);
    const searchRef = useRef(null);
    const params = new URLSearchParams(window.location.search);
    const activeCat = page === 'information' ? params.get('cat') : null;

    const submit = (e) => {
        e.preventDefault();
        if (!q.trim()) return;
        window.location.href = 'search.html?q=' + encodeURIComponent(q.trim());
    };
    const expandAndFocus = () => {
        onToggleCollapsed();
        setTimeout(() => searchRef.current && searchRef.current.focus(), 260);
    };

    return (
        <aside className={`sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`} aria-label="Primary navigation">
            <a className="sidebar-logo" href="index.html" title="Dashboard">
                <img src="DSSS-Logo_Gold-White.svg" alt="Dietrich School Scientific Stockroom" />
            </a>

            {!collapsed ? (
                <form className="sidebar-search" onSubmit={submit} role="search">
                    <label htmlFor="sb-search" className="sidebar-search-label">Catalog search</label>
                    <div className="sidebar-search-wrap">
                        <Icon name="search" size={17} />
                        <input id="sb-search" ref={searchRef} type="search" autoComplete="off" value={q}
                               onChange={e => setQ(e.target.value)} placeholder="SKU, item name, vendor…" />
                        <button type="submit" aria-label="Search catalog">Go</button>
                    </div>
                </form>
            ) : (
                <button className="sidebar-search-icon" onClick={expandAndFocus} title="Catalog search" aria-label="Catalog search">
                    <Icon name="search" size={19} />
                </button>
            )}

            <nav className="sidebar-nav">
                <div className="nav-section">
                    <div className="nav-section-title">Toolkit</div>
                    {TOOLS.map(t => (
                        <a key={t.id} href={t.href} className={`nav-item ${page === t.id ? 'active' : ''}`} title={collapsed ? t.name : undefined}
                           {...(t.newTab ? { target:'_blank', rel:'noopener noreferrer' } : {})}>
                            <Icon name={t.icon} /><span className="nav-label">{t.name}</span>
                        </a>
                    ))}
                </div>
                <div className="nav-section">
                    <div className="nav-section-title">Information</div>
                    {INFO_CATEGORIES.map(c => (
                        <a key={c.id} href={`information.html?cat=${c.id}`}
                           className={`nav-item ${activeCat === c.id ? 'active' : ''}`} title={collapsed ? c.name : undefined}>
                            <Icon name={c.icon} /><span className="nav-label">{c.name}</span>
                        </a>
                    ))}
                </div>
                <div className="nav-section">
                    <button className="nav-section-title nav-section-toggle" onClick={() => collapsed ? expandAndFocus() : setLinksOpen(o => !o)}
                            aria-expanded={linksOpen} title={collapsed ? 'Useful Links' : undefined}>
                        <Icon name="link" className="nav-section-icon" />
                        <span className="nav-label">Useful Links</span>
                        <Icon name="chevD" size={14} className={`nav-chev ${linksOpen ? 'open' : ''}`} />
                    </button>
                    {!collapsed && linksOpen && (
                        <div className="nav-links-compact">
                            {USEFUL_LINKS.map(l => (
                                <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer">{l.label}</a>
                            ))}
                        </div>
                    )}
                </div>
            </nav>

            <button className="sidebar-collapse" onClick={onToggleCollapsed} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
                <Icon name={collapsed ? 'chevR' : 'chevL'} size={17} />
                <span className="nav-label">Collapse</span>
            </button>
            <button className="sidebar-close-mobile" onClick={onCloseMobile} aria-label="Close menu"><Icon name="x" /></button>
        </aside>
    );
}

function StatusBar({ data }) {
    const { inventory, dbStatus, lastModified } = data;
    return (
        <footer className="statusbar" role="status" aria-live="polite">
            <div className="statusbar-left">
                <span className={`status-dot ${dbStatus}`} />
                {dbStatus === 'loading' && <><span>Loading inventory</span><span className="skeleton" style={{width:90, height:10}} /></>}
                {dbStatus === 'ok'      && <span><strong>{inventory.length.toLocaleString()}</strong> items loaded</span>}
                {dbStatus === 'error'   && <span>Inventory unavailable — inventory-status-report.xlsx could not be read</span>}
            </div>
            <div className="statusbar-right">
                {dbStatus === 'loading' && <span className="skeleton" style={{width:150, height:10}} />}
                {dbStatus !== 'loading' && (lastModified ? <>Last updated {formatStamp(lastModified)}</> : 'Last updated: unknown')}
            </div>
        </footer>
    );
}

/* ══════════════════════════════════════════════════════════════════════
   QUICK LAUNCH — one overlay for tools, phonebook contacts, catalog items
══════════════════════════════════════════════════════════════════════ */
function QuickLaunch({ open, onClose, data }) {
    const [q, setQ] = useState('');
    const [contacts, setContacts] = useState(null);
    const [active, setActive] = useState(0);
    const [copied, setCopied] = useState('');
    const inputRef = useRef(null);
    const listRef = useRef(null);

    useEffect(() => {
        if (!open) return;
        setQ(''); setActive(0); setCopied('');
        setTimeout(() => inputRef.current && inputRef.current.focus(), 30);
        if (contacts === null) loadPhonebookContacts().then(setContacts);
    }, [open]);

    const results = useMemo(() => {
        const query = q.trim().toLowerCase();
        const words = query.split(/\s+/).filter(Boolean);

        // Tools & information categories
        const toolPool = [
            ...ALL_TOOLS.map(t => ({ kind:'tool', key:'t-' + t.id, icon:t.icon, title:t.name, sub:t.desc, href:t.href, newTab:!!t.newTab, hay:(t.name + ' ' + t.keywords).toLowerCase() })),
            ...INFO_CATEGORIES.map(c => ({ kind:'tool', key:'c-' + c.id, icon:c.icon, title:c.name, sub:'Information — ' + c.desc, href:'information.html?cat=' + c.id, hay:('information ' + c.name + ' ' + c.desc).toLowerCase() })),
            ...INFO_CATEGORIES.flatMap(c => c.articles.map(a => ({ kind:'tool', key:'a-' + a.id, icon:'book', title:a.title, sub:'Information — ' + c.name, href:`information.html?cat=${c.id}&article=${a.id}`, hay:(a.title + ' ' + a.summary + ' ' + c.name).toLowerCase() }))),
        ];
        const tools = (words.length ? toolPool.filter(t => words.every(w => t.hay.includes(w))) : toolPool.filter(t => t.key.startsWith('t-'))).slice(0, words.length ? 6 : 7);

        let people = [], items = [];
        if (query.length >= 2) {
            if (contacts) {
                people = contacts.filter(c => {
                    const hay = [c.lastName, c.firstName, c.title, c.email, c.phone, c.phone2, c.cell, c.group, c.department].join(' ').toLowerCase();
                    return words.every(w => hay.includes(w));
                }).sort((a, b) => {
                    const sa = (a.lastName.toLowerCase() === query ? 2 : 0) + ((a.lastName + ' ' + a.firstName).toLowerCase().includes(query) ? 1 : 0);
                    const sb = (b.lastName.toLowerCase() === query ? 2 : 0) + ((b.lastName + ' ' + b.firstName).toLowerCase().includes(query) ? 1 : 0);
                    return sb - sa || a.lastName.localeCompare(b.lastName);
                }).slice(0, 5).map((c, i) => ({ kind:'contact', key:'p-' + i + c.email + c.lastName, contact:c }));
            }
            const nq = normalizeSKU(query);
            items = searchCatalog(data.inventory, data.staffNames, query)
                .map(it => ({ it, rank: normalizeSKU(it.internalSKU) === nq ? 0 : normalizeSKU(it.internalSKU).startsWith(nq) ? 1 : 2 }))
                .sort((a, b) => a.rank - b.rank).slice(0, 6)
                .map((x, i) => ({ kind:'item', key:'i-' + i + x.it.internalSKU + x.it.location, item:x.it }));
        }
        return { tools, people, items, flat: [...tools, ...people, ...items], query };
    }, [q, contacts, data.inventory, data.staffNames]);

    useEffect(() => { setActive(0); }, [q]);
    useEffect(() => {
        const el = listRef.current && listRef.current.querySelector('[data-active="true"]');
        if (el && el.scrollIntoView) el.scrollIntoView({ block:'nearest' });
    }, [active]);

    if (!open) return null;

    const go = (r) => {
        if (!r) return;
        if (r.kind === 'tool') { if (r.newTab) { window.open(r.href, '_blank', 'noopener'); onClose(); } else window.location.href = r.href; }
        else if (r.kind === 'item') window.location.href = 'search.html?q=' + encodeURIComponent(r.item.internalSKU);
        else if (r.kind === 'contact') {
            if (r.contact.email) window.location.href = 'mailto:' + r.contact.email;
            else copyText(r.contact.phone || r.contact.cell || r.contact.phone2 || '', r.key);
        }
    };
    const copyText = (txt, key) => {
        if (!txt) return;
        const done = () => { setCopied(key); setTimeout(() => setCopied(''), 1600); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, done);
        else { const ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); done(); }
    };
    const onKey = (e) => {
        if (e.key === 'Escape') { onClose(); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, results.flat.length - 1)); }
        else if (e.key === 'ArrowUp')   { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
        else if (e.key === 'Enter') {
            e.preventDefault();
            if (results.flat[active]) go(results.flat[active]);
            else if (q.trim()) window.location.href = 'search.html?q=' + encodeURIComponent(q.trim());
        }
    };

    let idx = -1;
    const row = (r, body) => { idx++; const i = idx; return (
        <div key={r.key} role="option" aria-selected={i === active} data-active={i === active}
             className={`ql-row ${i === active ? 'active' : ''}`} onMouseMove={() => setActive(i)} onClick={() => go(r)}>{body}</div>
    ); };

    const loadingData = data.dbStatus === 'loading';
    return (
        <div className="ql-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="ql-modal" role="dialog" aria-modal="true" aria-label="Quick Launch">
                <div className="ql-input-row">
                    <Icon name="search" size={20} />
                    <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} onKeyDown={onKey}
                           placeholder="Search tools, contacts, and catalog items…" aria-label="Quick Launch search" autoComplete="off" spellCheck="false" />
                    <kbd>Esc</kbd>
                </div>
                <div className="ql-results" ref={listRef} role="listbox">
                    {results.tools.length > 0 && <div className="ql-group-title">{results.query ? 'Tools & guides' : 'Go to'}</div>}
                    {results.tools.map(r => row(r, <>
                        <span className="ql-ico"><Icon name={r.icon} size={17} /></span>
                        <span className="ql-main"><span className="ql-title">{r.title}</span><span className="ql-sub">{r.sub}</span></span>
                        <span className="ql-hint"><Icon name="corner" size={14} /></span>
                    </>))}

                    {results.people.length > 0 && <div className="ql-group-title">Phonebook</div>}
                    {results.people.map(r => { const c = r.contact; return row(r, <>
                        <span className="ql-ico"><Icon name="user" size={17} /></span>
                        <span className="ql-main">
                            <span className="ql-title">{c.firstName} {c.lastName}{c.title ? <span className="ql-title-note"> · {c.title}</span> : null}</span>
                            <span className="ql-sub">
                                {[c.phone || c.cell || c.phone2, c.email].filter(Boolean).join('  ·  ') || 'No phone or email on file'}
                            </span>
                        </span>
                        {c.email && (
                            <button className="ql-copy" onClick={e => { e.stopPropagation(); copyText(c.email, r.key); }} title="Copy email address">
                                {copied === r.key ? 'Copied' : <Icon name="copy" size={14} />}
                            </button>
                        )}
                    </>); })}

                    {results.items.length > 0 && <div className="ql-group-title">Catalog</div>}
                    {results.items.map(r => { const it = r.item; return row(r, <>
                        <span className="ql-ico"><Icon name="box" size={17} /></span>
                        <span className="ql-main">
                            <span className="ql-title">{displayNameFor(it, data.staffNames)}</span>
                            <span className="ql-sub"><span className="mono">{it.internalSKU}</span>  ·  Bin <span className="mono">{it.location}</span></span>
                        </span>
                        <span className="ql-hint"><OnHandBadge item={it} /></span>
                    </>); })}

                    {results.query.length >= 2 && results.flat.length === 0 && (
                        <div className="ql-empty">
                            {loadingData ? 'Catalog is still loading…' : <>No matches for “{results.query}”. Press Enter to search the full catalog.</>}
                        </div>
                    )}
                    {results.query.length >= 2 && loadingData && results.items.length === 0 && results.flat.length > 0 && (
                        <div className="ql-group-title">Catalog is still loading…</div>
                    )}
                </div>
                <div className="ql-foot">
                    <span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>Enter</kbd> open</span><span><kbd>Esc</kbd> close</span>
                </div>
            </div>
        </div>
    );
}

/* ══════════════════════════════════════════════════════════════════════
   SHELL + mountPage
══════════════════════════════════════════════════════════════════════ */
function Shell({ page, title, desc, children, data }) {
    const [theme, toggleTheme] = useTheme();
    const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem(SIDEBAR_KEY) === '1'; } catch(e) { return false; } });
    const [mobileOpen, setMobileOpen] = useState(false);
    const [qlOpen, setQlOpen] = useState(false);

    const toggleCollapsed = () => setCollapsed(c => { const n = !c; try { localStorage.setItem(SIDEBAR_KEY, n ? '1' : '0'); } catch(e) {} return n; });
    const toggleSidebar = () => {
        if (window.matchMedia('(max-width: 900px)').matches) setMobileOpen(o => !o);
        else toggleCollapsed();
    };

    // Record tool visit
    useEffect(() => { recordToolVisit(page); }, [page]);

    // Ctrl+K / Cmd+K
    useEffect(() => {
        const onKey = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setQlOpen(o => !o); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    // Page fade-out on internal navigation
    useEffect(() => {
        const onClick = (e) => {
            if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            const a = e.target.closest && e.target.closest('a[href]');
            if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
            const href = a.getAttribute('href');
            if (!href || href.startsWith('#') || /^(mailto:|tel:|https?:)/i.test(href)) return;
            if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
            e.preventDefault();
            document.body.classList.add('page-leaving');
            setTimeout(() => { window.location.href = a.href; }, 130);
        };
        const onShow = () => document.body.classList.remove('page-leaving');
        document.addEventListener('click', onClick);
        window.addEventListener('pageshow', onShow);
        return () => { document.removeEventListener('click', onClick); window.removeEventListener('pageshow', onShow); };
    }, []);

    return (
        <div className={`app ${collapsed ? 'sb-collapsed' : ''}`}>
            <TopBar onToggleSidebar={toggleSidebar} onQuickLaunch={() => setQlOpen(true)} theme={theme} onToggleTheme={toggleTheme} />
            <Sidebar page={page} collapsed={collapsed} onToggleCollapsed={toggleCollapsed} mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />
            {mobileOpen && <div className="sidebar-scrim" onClick={() => setMobileOpen(false)} />}
            <main className="main" id="main">
                <div className="main-inner">
                    {title && (
                        <div className="page-head">
                            <h1>{title}</h1>
                            {desc && <p>{desc}</p>}
                        </div>
                    )}
                    {children}
                </div>
            </main>
            <StatusBar data={data} />
            <QuickLaunch open={qlOpen} onClose={() => setQlOpen(false)} data={data} />
        </div>
    );
}

function PageRoot({ page, title, desc, render }) {
    const data = useStockroomData();
    return <Shell page={page} title={title} desc={desc} data={data}>{render(data)}</Shell>;
}

/* Every authenticated page calls this once: mountPage({ page, title, desc, render }) */
function mountPage(cfg) {
    if (!isAuthed()) { window.location.replace('landing.html'); return; }
    applyTheme(getTheme());
    ReactDOM.createRoot(document.getElementById('root')).render(<PageRoot {...cfg} />);
}
