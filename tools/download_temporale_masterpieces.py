#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
download_temporale_masterpieces.py
Télécharge et convertit en Haute Définition Retina (Option A : 900x1200+ px, WebP 84)
les chefs-d'œuvre de la peinture sacrée pour les dimanches et solennités du Temporal.
Génère simultanément les registres de métadonnées (Auteur, Titre, Musée).
"""

import os, sys, json, time, io, urllib.request, urllib.parse, re
from PIL import Image

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')
Image.MAX_IMAGE_PIXELS = None

USER_AGENT = 'OremusTemporaleBot/1.0 (contact@oremus.org; catholic liturgical art)'
OUTPUT_DIR = 'img/tempora'
os.makedirs(OUTPUT_DIR, exist_ok=True)

TARGET_MAX_WIDTH = 900
TARGET_MAX_HEIGHT = 1300
WEBP_QUALITY = 84

BAD_KEYWORDS = [
    'relic', 'reliquary', 'reliquaire', 'statue', 'sculpture', 'monument', 'bust',
    'medal', 'medaille', 'coin', 'monnaie', 'stamp', 'timbre', 'facade', 'chiesa',
    'church', 'cathedral', 'crypt', 'grave', 'tomb', 'tombeau', 'plaque',
    'window', 'stained_glass', 'vitrail', 'glasfenster', 'cemetery', 'cementerio',
    'commons-logo', 'flag', 'edit-ltr', 'map', 'diagram', '046cupolaspietro',
    '.svg', '.pdf', '.djvu', '.tif', '.tiff', '.gif'
]

# Catalogue des 55 dimanches et grandes solennités du Temporal
TEMPORA_MASTERPIECES = {
    # --- AVENT ---
    'Adv1-0': ('Michelangelo Last Judgment Sistine', 'Michel-Ange (Chapelle Sixtine)', 'Le Jugement Dernier / La Venue du Christ en gloire', '1541', 'Vatican'),
    'Adv2-0': ('Caravaggio Saint John the Baptist wilderness', 'Le Caravage', 'Saint Jean-Baptiste au désert', '1604', 'Musée d\'Art Nelson-Atkins'),
    'Adv3-0': ('Leonardo da Vinci Saint John the Baptist', 'Léonard de Vinci', 'Saint Jean-Baptiste rendant témoignage (Gaudete)', '1513', 'Musée du Louvre, Paris'),
    'Adv4-0': ('Bartolome Esteban Murillo Annunciation', 'Bartolomé Esteban Murillo', 'L\'Annonciation de la Vierge Marie', '1668', 'Musée des Beaux-Arts de Séville'),
    
    # --- TEMPS DE NOËL & ÉPIPHANIE ---
    'Nat01': ('Raphael Holy Family Canigiani', 'Raphaël', 'La Sainte Famille Canigiani', '1507', 'Alte Pinakothek, Munich'),
    'Nat1-0': ('Rembrandt Holy Family with Angels Hermitage', 'Rembrandt', 'La Sainte Famille aux anges', '1645', 'Musée de l\'Ermitage, Saint-Pétersbourg'),
    'Epi1-0': ('Diego Velazquez Adoration of the Magi Prado', 'Diego Vélasquez', 'L\'Adoration des Mages', '1619', 'Musée du Prado, Madrid'),
    'Epi1-0a': ('Murillo Two Trinities Holy Family', 'Bartolomé Esteban Murillo', 'La Sainte Famille de Séville', '1680', 'National Gallery, Londres'),
    'Epi2-0': ('Paolo Veronese Wedding at Cana Louvre', 'Paul Véronèse', 'Les Noces de Cana', '1563', 'Musée du Louvre, Paris'),
    'Epi3-0': ('Paolo Veronese Christ Healing the Centurion Servant', 'Paul Véronèse', 'Le Christ et le Centurion de Capharnaüm', '1571', 'Musée du Prado, Madrid'),
    'Epi4-0': ('Rembrandt Christ in the Storm on the Lake of Galilee', 'Rembrandt', 'Le Christ apaisant la tempête sur le lac', '1633', 'Boston'),
    'Epi5-0': ('Domenico Fetti Parable of the Weeds', 'Domenico Fetti', 'La Parabole de l\'ivraie et du bon grain', '1619', 'Prague'),
    'Epi6-0': ('John Everett Millais Parable of the Mustard Seed', 'John Everett Millais', 'La Parabole du grain de sénevé', '1864', 'Londres'),
    
    # --- SEPTUAGÉSIME ---
    'Quadp1-0': ('Domenico Fetti Parable of the Labourers in the Vineyard', 'Domenico Fetti', 'La Parabole des ouvriers de la onzième heure', '1618', 'Dresde'),
    'Quadp2-0': ('Abel Grimmer Parable of the Sower', 'Abel Grimmer', 'La Parabole du semeur', '1614', 'Musée Royal des Beaux-Arts d\'Anvers'),
    'Quadp3-0': ('Nicolas Poussin Christ Healing the Blind Men of Jericho', 'Nicolas Poussin', 'Le Christ guérissant les aveugles de Jéricho', '1650', 'Musée du Louvre, Paris'),
    'Quadp3-3': ('Philippe de Champaigne Memento Mori', 'Philippe de Champaigne', 'Vanité et Mercredi des Cendres', '1644', 'Musée de Tessé, Le Mans'),
    
    # --- CARÊME ---
    'Quad1-0': ('Ary Scheffer - The Temptation of Christ (1854)', 'Ary Scheffer', 'La Tentation du Christ au désert', '1854', 'Musée du Louvre, Paris'),
    'Quad2-0': ('Raphael Transfiguration Vatican', 'Raphaël', 'La Transfiguration de Notre-Seigneur sur le mont Thabor', '1520', 'Pinacothèque vaticane, Rome'),
    'Quad3-0': ('Tintoretto Christ exorcising demon', 'Le Tintoret', 'Le Christ chassant le démon', '1570', 'Venise'),
    'Quad4-0': ('Giovanni Lanfranco Miracle of the Loaves and Fishes', 'Giovanni Lanfranco', 'La Multiplication des pains (Dimanche de Lætare)', '1623', 'National Gallery of Ireland'),
    
    # --- PASSION & SEMAINE SAINTE ---
    'Quad5-0': ('Duccio Christ Hidden in the Temple', 'Duccio di Buoninsegna', 'Le Christ caché dans le Temple (Dimanche de la Passion)', '1308', 'Sienne'),
    'Quad5-5': ('Rogier van der Weyden Descent from the Cross Prado', 'Rogier van der Weyden', 'Notre-Dame des Sept Douleurs au Calvaire', '1435', 'Musée du Prado, Madrid'),
    'Quad6-0': ('Giotto Entry into Jerusalem Padua', 'Giotto di Bondone', 'L\'Entrée triomphale de Jésus à Jérusalem (Dimanche des Rameaux)', '1305', 'Chapelle des Scrovegni, Padoue'),
    'Quad6-4': ('Leonardo da Vinci The Last Supper', 'Léonard de Vinci', 'La Sainte Cène et Institution de l\'Eucharistie (Jeudi Saint)', '1498', 'Santa Maria delle Grazie, Milan'),
    'Quad6-5': ('Cristo crucificado Velazquez', 'Diego Vélasquez', 'La Crucifixion et Mort de Notre-Seigneur Jésus-Christ (Vendredi Saint)', '1632', 'Musée du Prado, Madrid'),
    'Quad6-6': ('Fra Angelico Christ in Limbo Descent', 'Fra Angelico', 'La Descente aux enfers et la Veillée Pascale (Samedi Saint)', '1442', 'Couvent San Marco, Florence'),
    
    # --- TEMPS PASCAL ---
    'Pasc0-0': ('Piero della Francesca Resurrection', 'Piero della Francesca', 'La Résurrection Glorieuse du Christ (Dimanche de Pâques)', '1463', 'Museo Civico de Sansepolcro'),
    'Pasc0-1': ('Caravaggio Supper at Emmaus London', 'Le Caravage', 'Les Disciples d\'Emmaüs (Lundi de Pâques)', '1601', 'National Gallery, Londres'),
    'Pasc1-0': ('The Incredulity of Saint Thomas-Caravaggio', 'Le Caravage', 'L\'Incrédulité de saint Thomas (Dimanche de Quasimodo)', '1602', 'Palais de Sanssouci, Potsdam'),
    'Pasc2-0': ('Murillo Christ the Good Shepherd', 'Bartolomé Esteban Murillo', 'Le Bon Pasteur donnant sa vie pour ses brebis', '1660', 'Musée du Prado, Madrid'),
    'Pasc3-0': ('Tintoretto Christ at the Sea of Galilee', 'Le Tintoret', 'Le Christ apparaissant sur le lac de Tibériade', '1575', 'National Gallery of Art, Washington'),
    'Pasc4-0': ('Duccio Christ Appears to the Apostles', 'Duccio di Buoninsegna', 'La Promesse du Paraclet Consolateur', '1311', 'Sienne'),
    'Pasc5-0': ('Ary Scheffer Christ in Gethsemane', 'Ary Scheffer', 'La Prière filiale au Père céleste (Rogations)', '1839', 'Dordrecht'),
    'Pasc5-4': ('Pietro Perugino Ascension', 'Le Pérugin', 'L\'Ascension Glorieuse de Notre-Seigneur au Ciel', '1498', 'Musée des Beaux-Arts de Lyon'),
    'Pasc6-0': ('Giotto Pentecost Apostles Cenacle', 'Giotto di Bondone', 'L\'Attente de l\'Esprit-Saint au Cénacle avec Marie', '1305', 'Padoue'),
    'Pasc7-0': ('El Greco Pentecost Prado', 'Le Greco', 'La Descente du Saint-Esprit le jour de la Pentecôte', '1600', 'Musée du Prado, Madrid'),
    
    # --- TEMPS APRÈS LA PENTECÔTE & GRANDES FÊTES DU SEIGNEUR ---
    'Pent01-0': ('Albrecht Durer Adoration of the Trinity', 'Albrecht Dürer', 'L\'Adoration de la Sainte Trinité par toute la création', '1511', 'Kunsthistorisches Museum, Vienne'),
    'Pent01-4': ('Raphael Disputation of the Most Holy Sacrament', 'Raphaël', 'Le Triomphe du Très Saint-Sacrement (Fête-Dieu)', '1510', 'Chambres de Raphaël, Vatican'),
    'Pent02-0': ('Jan Steen The Great Feast Banquet', 'Jan Steen', 'La Parabole des invités au grand festin', '1665', 'Amsterdam'),
    'Pent02-5': ('Pompeo Batoni Sacred Heart of Jesus', 'Pompeo Batoni', 'Le Sacré-Cœur de Jésus', '1767', 'Église du Gesù, Rome'),
    'Pent03-0': ('Murillo The Lost Sheep Good Shepherd', 'Bartolomé Esteban Murillo', 'La Parabole de la brebis retrouvée', '1665', 'Séville'),
    'Pent04-0': ('Raphael Miraculous Draught of Fishes', 'Raphaël', 'La Pêche Miraculeuse sur le lac de Génézareth', '1515', 'Victoria and Albert Museum, Londres'),
    'Pent05-0': ('Carl Bloch Sermon on the Mount', 'Carl Bloch', 'Le Sermon sur la Montagne et les Béatitudes', '1877', 'Château de Frederiksborg'),
    'Pent06-0': ('Bernardo Strozzi Feeding the Multitude', 'Bernardo Strozzi', 'La Seconde multiplication des pains pour quatre mille hommes', '1630', 'Venise'),
    'Pent07-0': ('Rembrandt Christ and the Tree of Life', 'Rembrandt', 'L\'Arbre reconnu à ses fruits', '1640', 'Amsterdam'),
    'Pent08-0': ('Jan Luyken Parable of the Unjust Steward', 'Jan Luyken', 'La Parabole de l\'économe prudent', '1685', 'Amsterdam'),
    'Pent09-0': ('Enrique Simonet Flevit super illam', 'Enrique Simonet', 'Jésus pleurant sur la ville de Jérusalem (Flevit super illam)', '1892', 'Musée du Prado, Madrid'),
    'Pent10-0': ('Barent Fabritius Pharisee and Publican', 'Barent Fabritius', 'La Parabole du pharisien et du publicain', '1661', 'Rijksmuseum, Amsterdam'),
    'Pent11-0': ('Eugene Delacroix Christ healing the deaf mute', 'Eugène Delacroix', 'La Guérison du sourd-muet (Effphatha)', '1853', 'Paris'),
    'Pent12-0': ('Rembrandt - The Good Samaritan - Louvre', 'Rembrandt', 'Le Bon Samaritain pansant les plaies', '1638', 'Musée du Louvre, Paris'),
    'Pent13-0': ('Jean-Marie Melchior Doze Healing of the Ten Lepers', 'Jean-Marie Melchior Doze', 'La Guérison des dix lépreux et l\'action de grâce', '1864', 'Musée des Beaux-Arts de Nîmes'),
    'Pent14-0': ('James Tissot Consider the Lilies', 'James Tissot', 'Considérez les lys des champs et les oiseaux du ciel', '1886', 'Brooklyn Museum, New York'),
    'Pent15-0': ('Lucas Cranach the Younger Raising of the Son of the Widow of Nain', 'Lucas Cranach le Jeune', 'La Résurrection du fils unique de la veuve de Naïn', '1569', 'Wittenberg'),
    'Pent16-0': ('James Tissot Jesus Heals on the Sabbath', 'James Tissot', 'La Guérison d\'un hydropique le jour du sabbat', '1890', 'Brooklyn Museum, New York'),
    'Pent17-0': ('Rembrandt Christ and the Great Commandment', 'Rembrandt', 'Le Plus Grand Commandement d\'Amour de Dieu et du prochain', '1652', 'Londres'),
    'Pent18-0': ('Bartolome Esteban Murillo Healing of the Paralytic', 'Bartolomé Esteban Murillo', 'La Guérison du paralytique à la piscine probatique', '1670', 'National Gallery, Londres'),
    'Pent19-0': ('Bernardo Cavallino Parable of the Wedding Banquet', 'Bernardo Cavallino', 'La Parabole du festin des noces royales', '1645', 'Naples'),
    'Pent20-0': ('Sebastiano Ricci Healing of the Ruler Son', 'Sebastiano Ricci', 'La Guérison du fils de l\'officier du roi', '1724', 'Venise'),
    'Pent21-0': ('Domenico Fetti Parable of the Unforgiving Servant', 'Domenico Fetti', 'La Parabole du serviteur impitoyable', '1620', 'Dresde'),
    'Pent22-0': ('Peter Paul Rubens The Tribute Money', 'Pierre Paul Rubens', 'Rendez à César ce qui est à César et à Dieu ce qui est à Dieu', '1612', 'The Wallace Collection, Londres'),
    'Pent23-0': ('Gabriel von Max Raising of Jairus Daughter', 'Gabriel von Max', 'La Résurrection de la fille de Jaïre (Talitha koumi)', '1878', 'Musée des Beaux-Arts de Montréal'),
    'Pent24-0': ('Rogier van der Weyden Beaune Altarpiece Last Judgement', 'Rogier van der Weyden', 'Le Christ Roi de Gloire et le Jugement Dernier (24e et dernier Dimanche après la Pentecôte)', '1450', 'Hôtel-Dieu de Beaune')
}

def search_and_download_tempora(code, info):
    query, artist, artwork, year, loc = info
    time.sleep(0.6)
    url = f'https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch={urllib.parse.quote(query)}&gsrlimit=5&prop=imageinfo&iiprop=url|dimensions&format=json'
    req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            d = json.loads(resp.read().decode('utf-8'))
            candidates = []
            for p in d.get('query', {}).get('pages', {}).values():
                t = p.get('title', '')
                low = t.lower()
                if not low.endswith(('.jpg', '.jpeg', '.png', '.webp')):
                    continue
                if any(b in low for b in BAD_KEYWORDS):
                    continue
                ii = p.get('imageinfo', [{}])[0]
                img_url = ii.get('url')
                w = ii.get('width', 0)
                h = ii.get('height', 0)
                if img_url and (w >= 350 or h >= 350):
                    candidates.append((t, img_url, (w, h)))
            
            if candidates:
                best_t, best_url, dims = candidates[0]
                time.sleep(0.3)
                r_img = urllib.request.Request(best_url, headers={'User-Agent': USER_AGENT})
                raw = urllib.request.urlopen(r_img, timeout=20).read()
                im = Image.open(io.BytesIO(raw)).convert('RGB')
                im.thumbnail((TARGET_MAX_WIDTH, TARGET_MAX_HEIGHT), Image.Resampling.LANCZOS)
                out_path = os.path.join(OUTPUT_DIR, f'{code}.webp')
                im.save(out_path, format='WEBP', quality=WEBP_QUALITY, method=4)
                print(f"[{code}] Sauvegardé : {im.size[0]}x{im.size[1]}px ({os.path.getsize(out_path)//1024} KB) | {artwork} — {artist}")
                return True
            else:
                print(f"[{code}] Aucun candidat pour {query}")
    except Exception as e:
        print(f"[{code}] Erreur : {e}")
    return False

if __name__ == '__main__':
    print(f"Téléchargement des {len(TEMPORA_MASTERPIECES)} chefs-d'œuvre du Temporal...")
    success = 0
    metadata = {}
    for code, info in sorted(TEMPORA_MASTERPIECES.items()):
        if search_and_download_tempora(code, info):
            success += 1
        metadata[code] = {
            'artwork': info[2],
            'artist': info[1],
            'year': info[3],
            'location': info[4]
        }

    # Sauvegarde des métadonnées du Temporal
    with open('img/tempora/tempora_art_metadata.json', 'w', encoding='utf-8') as f:
        json.dump(metadata, f, ensure_ascii=False, indent=2)
    with open('js/tempora_art_metadata.js', 'w', encoding='utf-8') as f:
        f.write('// Catalogue raisonné des chefs-d\'œuvre du Temporal (Dimanches & Solennités du Seigneur)\n')
        f.write('window.DO_TEMPORA_ART_METADATA = ')
        f.write(json.dumps(metadata, ensure_ascii=False, indent=2))
        f.write(';\n')

    print(f"\nTerminé avec succès : {success}/{len(TEMPORA_MASTERPIECES)} toiles du Temporal installées !")
