#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
extract_crampon_bible.py
Extrait la Sainte Bible (Chanoine Augustin Crampon, édition 1923) depuis l'EPUB
et génère les 73 fichiers au format Oremus (<chapitre>\t<verset>\t<texte>),
en appliquant rigoureusement les règles typographiques françaises de AELF Scraper.py.
"""

import os
import re
import sys
import zipfile

# Mapping des 73 fichiers EPUB vers les noms latins de la Vulgate
EPUB_TO_VULGATE = [
    ('01-genese.html', 'Genesis.txt'),
    ('02-exode.html', 'Exodus.txt'),
    ('03-levitique.html', 'Leviticus.txt'),
    ('04-nombres.html', 'Numeri.txt'),
    ('05-deuteronome.html', 'Deuteronomium.txt'),
    ('06-josue.html', 'Josue.txt'),
    ('07-juges.html', 'Judicum.txt'),
    ('08-ruth.html', 'Ruth.txt'),
    ('09-1_samuel.html', 'Regum 1.txt'),
    ('10-2_samuel.html', 'Regum 2.txt'),
    ('11-1_rois.html', 'Regum 3.txt'),
    ('12-2_rois.html', 'Regum 4.txt'),
    ('13-1_chr.html', 'Paralipomenon 1.txt'),
    ('14-2_chr.html', 'Paralipomenon 2.txt'),
    ('15-esdras.html', 'Esdræ.txt'),
    ('16-nehemie.html', 'Nehemiæ.txt'),
    ('17-tobie.html', 'Tobiæ.txt'),
    ('18-judith.html', 'Judith.txt'),
    ('19-esther.html', 'Esther.txt'),
    ('20-job.html', 'Job.txt'),
    ('21-psaumes.html', 'Psalmi.txt'),
    ('22-proverbes.html', 'Proverbia.txt'),
    ('23-eccl.html', 'Ecclesiastes.txt'),
    ('24-ct.html', 'Canticum Canticorum.txt'),
    ('25-sg.html', 'Sapientia.txt'),
    ('26-si.html', 'Ecclesiasticus.txt'),
    ('27-isaie.html', 'Isaias.txt'),
    ('28-jr.html', 'Jeremias.txt'),
    ('29-lm.html', 'Lamentationes.txt'),
    ('30-ba.html', 'Baruch.txt'),
    ('31-ez.html', 'Ezechiel.txt'),
    ('32-dn.html', 'Daniel.txt'),
    ('33-os.html', 'Osee.txt'),
    ('34-jl.html', 'Joel.txt'),
    ('35-am.html', 'Amos.txt'),
    ('36-ab.html', 'Abdias.txt'),
    ('37-jon.html', 'Jonas.txt'),
    ('38-mi.html', 'Michæa.txt'),
    ('39-na.html', 'Nahum.txt'),
    ('40-ha.html', 'Habacuc.txt'),
    ('41-so.html', 'Sophonias.txt'),
    ('42-ag.html', 'Aggæus.txt'),
    ('43-za.html', 'Zacharias.txt'),
    ('44-ml.html', 'Malachias.txt'),
    ('45-1_macc.html', 'Machabæorum 1.txt'),
    ('46-2_macc.html', 'Machabæorum 2.txt'),
    ('47-mt.html', 'Matthæus.txt'),
    ('48-mc.html', 'Marcus.txt'),
    ('49-lc.html', 'Lucas.txt'),
    ('50-jn.html', 'Joannes.txt'),
    ('51-ac.html', 'Actus Apostolorum.txt'),
    ('52-rm.html', 'Ad Romanos.txt'),
    ('53-1co.html', 'Ad Corinthios 1.txt'),
    ('54-2co.html', 'Ad Corinthios 2.txt'),
    ('55-ga.html', 'Ad Galatas.txt'),
    ('56-ep.html', 'Ad Ephesios.txt'),
    ('57-ph.html', 'Ad Philippenses.txt'),
    ('58-col.html', 'Ad Colossenses.txt'),
    ('59-1th.html', 'Ad Thessalonicenses 1.txt'),
    ('60-2th.html', 'Ad Thessalonicenses 2.txt'),
    ('61-1tm.html', 'Ad Timotheum 1.txt'),
    ('62-2tm.html', 'Ad Timotheum 2.txt'),
    ('63-tt.html', 'Ad Titum.txt'),
    ('64-phm.html', 'Ad Philemonem.txt'),
    ('65-he.html', 'Ad Hebræos.txt'),
    ('66-jc.html', 'Jacobi.txt'),
    ('67-1p.html', 'Petri 1.txt'),
    ('68-2p.html', 'Petri 2.txt'),
    ('69-1jn.html', 'Joannis 1.txt'),
    ('70-2jn.html', 'Joannis 2.txt'),
    ('71-3jn.html', 'Joannis 3.txt'),
    ('72-jude.html', 'Judæ.txt'),
    ('73-ap.html', 'Apocalypsis.txt')
]

def format_french_typography(text):
    """
    Règles typographiques françaises standard (reprises de French AELF translation/AELF Scraper.py) :
    - Remplacement des retours chariot par des espaces
    - Nettoyage des espaces multiples
    - Remplacement des espaces normales par des espaces insécables avant ? ! ; : » — - et après — - «
    """
    if not text:
        return ""
    text = text.replace("\n", " ")
    text = re.sub(r'\s+', ' ', text).strip()
    # Remplacement des espaces normales par des espaces insécables avant ? ! ; : » — - et après — - «
    text = re.sub(r' (?=[?!;:»—-])', '\u00A0', text)
    text = re.sub(r'(?<=[—«-]) ', '\u00A0', text)
    return text.strip()

def clean_html_text(raw_snippet):
    """Nettoie le fragment HTML entre deux balises pour n'en garder que le texte pur du verset."""
    # Retirer les indications acrostiches (ALEPH, BETH...)
    s = re.sub(r'<div class=[\'"]indication[\'"]>.*?</div>', '', raw_snippet, flags=re.I | re.DOTALL)
    # Retirer les liens et les mini-sommaires
    s = re.sub(r'<ul class=[\'"]mini-toc[\'"]>.*?</ul>', '', s, flags=re.I | re.DOTALL)
    # Supprimer toutes les balises HTML restantes
    s = re.sub(r'<[^>]+>', ' ', s)
    return format_french_typography(s)

def parse_html_book(raw_html, is_psalms=False):
    """
    Parse le document HTML par découpage séquentiel des balises h4.caput et span.vn.
    """
    token_pattern = re.compile(
        r'(<h4[^>]*class=[\'"]caput[\'"][^>]*cp=[\'"](\d+)[\'"][^>]*>|'
        r'<span[^>]*class=[\'"]vn[\'"][^>]*vn=[\'"](\d+)[\'"][^>]*>)',
        re.I
    )

    tokens = list(token_pattern.finditer(raw_html))
    chapters = {}

    has_caput = any('caput' in t.group(0) for t in tokens)
    curr_ch = 1 if not has_caput else None
    if curr_ch == 1:
        chapters[1] = {}

    for i, tok in enumerate(tokens):
        tag = tok.group(0)
        start_content = tok.end()
        end_content = tokens[i + 1].start() if (i + 1 < len(tokens)) else len(raw_html)
        content = raw_html[start_content:end_content]

        if 'caput' in tag:
            cp_m = re.search(r'cp=[\'"](\d+)[\'"]', tag)
            if cp_m:
                curr_ch = int(cp_m.group(1))
                if curr_ch not in chapters:
                    chapters[curr_ch] = {}
        elif 'vn' in tag:
            vn_m = re.search(r'vn=[\'"](\d+)[\'"]', tag)
            if vn_m and (curr_ch is not None):
                vn = int(vn_m.group(1))
                txt = clean_html_text(content)
                chapters[curr_ch][vn] = txt

    # Post-traitement des rares versets imbriqués dans les citations
    for ch in chapters:
        additions = {}
        for vn, txt in list(chapters[ch].items()):
            next_v = vn + 1
            m = re.search(r'^(.*?)\s*(\b' + str(next_v) + r')\s*[»"]\s*([A-ZÀ-Ÿ].*)$', txt)
            if m:
                chapters[ch][vn] = format_french_typography(m.group(1).strip())
                additions[next_v] = format_french_typography(m.group(3).strip())
        chapters[ch].update(additions)

    return chapters

def map_psalms_to_vulgate(crampon_heb_psalms):
    """
    Réaligne les 150 Psaumes hébreux de Crampon sur la numérotation Vulgate (1-150),
    exactement comme dans vulgate/Psalmi.txt, douay-rheims et matos-soares.
    """
    vulg_ps = {}

    # Psaumes 1 à 8 : identiques
    for p in range(1, 9):
        vulg_ps[p] = crampon_heb_psalms.get(p, {})

    # Vulgate 9 = Crampon Hébreu 9 (v 1-21) + Hébreu 10 (v 1-18 numérotés 22-39)
    ps9 = {}
    heb9 = crampon_heb_psalms.get(9, {})
    for v in sorted(heb9.keys()):
        ps9[v] = heb9[v]
    offset = len(heb9)  # 21
    heb10 = crampon_heb_psalms.get(10, {})
    for v in sorted(heb10.keys()):
        ps9[offset + v] = heb10[v]
    vulg_ps[9] = ps9

    # Vulgate 10 à 112 = Crampon Hébreu 11 à 113 (décalage -1)
    for v_num in range(10, 113):
        h_num = v_num + 1
        vulg_ps[v_num] = crampon_heb_psalms.get(h_num, {})

    # Vulgate 113 = Crampon Hébreu 114 (v 1-8) + Hébreu 115 (v 1-18 numérotés 9-26)
    ps113 = {}
    heb114 = crampon_heb_psalms.get(114, {})
    for v in sorted(heb114.keys()):
        ps113[v] = heb114[v]
    offset113 = len(heb114)  # 8
    heb115 = crampon_heb_psalms.get(115, {})
    for v in sorted(heb115.keys()):
        ps113[offset113 + v] = heb115[v]
    vulg_ps[113] = ps113

    # Vulgate 114 et 115 = Crampon Hébreu 116 (19 versets)
    heb116 = crampon_heb_psalms.get(116, {})
    ps114 = {}
    ps115 = {}
    for v in sorted(heb116.keys()):
        if v <= 9:
            ps114[v] = heb116[v]
        else:
            ps115[v - 9] = heb116[v]
    vulg_ps[114] = ps114
    vulg_ps[115] = ps115

    # Vulgate 116 à 145 = Crampon Hébreu 117 à 146 (décalage -1)
    for v_num in range(116, 146):
        h_num = v_num + 1
        vulg_ps[v_num] = crampon_heb_psalms.get(h_num, {})

    # Vulgate 146 et 147 = Crampon Hébreu 147 (20 versets)
    heb147 = crampon_heb_psalms.get(147, {})
    ps146 = {}
    ps147 = {}
    for v in sorted(heb147.keys()):
        if v <= 11:
            ps146[v] = heb147[v]
        else:
            ps147[v - 11] = heb147[v]
    vulg_ps[146] = ps146
    vulg_ps[147] = ps147

    # Vulgate 148 à 150 = Crampon Hébreu 148 à 150
    for p in range(148, 151):
        vulg_ps[p] = crampon_heb_psalms.get(p, {})

    return vulg_ps

def export_to_oremus_txt(book_data, output_path):
    """
    Écrit le dictionnaire {chapitre: {verset: texte}} au format Oremus :
    <chapitre>\t<verset>\t<texte>
    """
    with open(output_path, 'w', encoding='utf-8', newline='\n') as f:
        for ch in sorted(book_data.keys()):
            vdict = book_data[ch]
            for vn in sorted(vdict.keys()):
                txt = vdict[vn]
                f.write(f"{ch}\t{vn}\t{txt}\n")

def main():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    epub_path = os.path.join(base_dir, 'La-Sainte-Bible-Chanoine-Augustin-Crampon.epub')
    out_dir_crampon = os.path.join(base_dir, 'crampon')
    out_dir_aelf = os.path.join(base_dir, 'aelf')
    os.makedirs(out_dir_crampon, exist_ok=True)
    os.makedirs(out_dir_aelf, exist_ok=True)

    if not os.path.exists(epub_path):
        print(f"Erreur : fichier introuvable {epub_path}")
        sys.exit(1)

    print(f"Extraction de la Bible Crampon 1923 avec typographie française soignée...")

    with zipfile.ZipFile(epub_path, 'r') as z:
        total_verses = 0
        for epub_file, vulg_file in EPUB_TO_VULGATE:
            if epub_file not in z.namelist():
                print(f"Attention : {epub_file} absent de l'EPUB !")
                continue

            raw_html = z.read(epub_file).decode('utf-8')
            is_psalms = (vulg_file == 'Psalmi.txt')
            book_data = parse_html_book(raw_html, is_psalms=is_psalms)

            if is_psalms:
                book_data = map_psalms_to_vulgate(book_data)

            # Écriture dans crampon/ et aelf/
            out_crampon = os.path.join(out_dir_crampon, vulg_file)
            out_aelf = os.path.join(out_dir_aelf, vulg_file)
            export_to_oremus_txt(book_data, out_crampon)
            export_to_oremus_txt(book_data, out_aelf)

            cnt = sum(len(v) for v in book_data.values())
            total_verses += cnt
            chs = len(book_data)
            print(f"  -> {vulg_file:<22} : {chs:>3} chapitres, {cnt:>5} versets")

    print(f"\nExtraction réussie avec succès !")
    print(f"Total : 73 livres canoniques, {total_verses} versets générés dans crampon/ et synchronisés dans aelf/")

if __name__ == '__main__':
    main()
