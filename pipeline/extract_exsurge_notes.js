const fs = require('fs');
const path = require('path');

global.window = global;
const fakeElement = {
  setAttribute: () => {},
  appendChild: () => {},
  cloneNode: () => fakeElement,
  getContext: () => ({
    measureText: () => ({ width: 10, actualBoundingBoxAscent: 10, actualBoundingBoxDescent: 2 })
  })
};

global.document = {
  createElement: () => fakeElement,
  createElementNS: () => fakeElement,
  getElementById: () => fakeElement,
  querySelector: () => fakeElement,
  querySelectorAll: () => []
};

const exsurge = require('d:/Documents/jgabc/exsurge.min.js');
const ctxt = new exsurge.ChantContext();

function getNoteDurationWeight(note, nextNote) {
  let dur = 1.0;
  try {
    if (note.morae && note.morae.length) {
      dur = (note.morae.length > 1) ? 2.4 : 1.9;
    } else if (nextNote && nextNote.morae && nextNote.morae.length) {
      dur = 1.8;
    } else if (note.episemata && note.episemata.length) {
      dur = 1.25;
    } else if (note.shape && exsurge && note.shape === exsurge.NoteShape.Quilisma) {
      dur = 0.9;
    }
  } catch(e) {}
  return dur;
}

function cleanLatinWord(w) {
  if (!w) return '';
  let s = w.toLowerCase()
    .replace(/æ/g, 'ae').replace(/œ/g, 'oe')
    .replace(/á/g, 'a').replace(/é/g, 'e').replace(/í/g, 'i')
    .replace(/ó/g, 'o').replace(/ú/g, 'u').replace(/ý/g, 'y')
    .replace(/[^a-z]/g, '');
  return s;
}

const pieces = ['5', '11', '13', '14', '15'];
const outDir = 'd:/Documents/jgabc/pipeline/exsurge_parsed';
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

for (const pid of pieces) {
  let gabcPath = `d:/Documents/jgabc/gabc/${pid}.gabc`;
  let gabcSrc = fs.readFileSync(gabcPath, 'utf8');
  let mappings = exsurge.Gabc.createMappingsFromSource(ctxt, gabcSrc);
  let score = new exsurge.ChantScore(ctxt, mappings, true);
  
  let words = [];
  let currentWord = { word: '', raw_lyrics: '', notes: [] };
  let noteGlobalIdx = 0;
  
  score.notations.forEach((notat, ni) => {
    let isDivider = notat.isDivider || /Bar$/.test(String(notat.constructor && notat.constructor.name || ''));
    let notes = (notat.notes || []).filter(n => !n.isAccidental);
    
    let lyrText = '';
    let isWordEnd = false;
    if (notat.lyrics && notat.lyrics.length) {
      notat.lyrics.forEach(l => {
        let t = l.text || '';
        lyrText += t;
        if (l.lyricType === 0 || l.lyricType === 3 || l.trailingSpace || /\s$/.test(t)) {
          isWordEnd = true;
        }
      });
    }
    
    // Notes on this notation
    if (notes.length > 0) {
      notes.forEach((n, idx) => {
        let nname = n.constructor ? n.constructor.name : 'Note';
        currentWord.notes.push({
          note_index: noteGlobalIdx++,
          pitch: n.staffPosition,
          shape: nname,
          duration_weight: getNoteDurationWeight(n, notes[idx + 1])
        });
      });
    }
    
    if (lyrText) {
      currentWord.raw_lyrics += lyrText;
      let cleanPiece = lyrText.replace(/<[^>]*>/g, '').replace(/[^\p{L}]/gu, '');
      currentWord.word += cleanPiece;
    }
    
    if (isWordEnd || isDivider) {
      if (currentWord.notes.length > 0) {
        let cleanLat = cleanLatinWord(currentWord.word);
        words.push({
          word_index: words.length,
          word: currentWord.word || (currentWord.raw_lyrics.trim() || 'Melisma'),
          raw_lyrics: currentWord.raw_lyrics,
          clean_latin: cleanLat,
          is_melisma: cleanLat.length === 0,
          total_weight: currentWord.notes.reduce((sum, n) => sum + n.duration_weight, 0),
          notes: currentWord.notes
        });
        currentWord = { word: '', raw_lyrics: '', notes: [] };
      }
    }
  });
  
  if (currentWord.notes.length > 0) {
    let cleanLat = cleanLatinWord(currentWord.word);
    words.push({
      word_index: words.length,
      word: currentWord.word || (currentWord.raw_lyrics.trim() || 'Melisma'),
      raw_lyrics: currentWord.raw_lyrics,
      clean_latin: cleanLat,
      is_melisma: cleanLat.length === 0,
      total_weight: currentWord.notes.reduce((sum, n) => sum + n.duration_weight, 0),
      notes: currentWord.notes
    });
  }
  
  let totalNotes = words.reduce((acc, w) => acc + w.notes.length, 0);
  let ctcWords = words.filter(w => !w.is_melisma);
  let melismaWords = words.filter(w => w.is_melisma);
  console.log(`Piece ${pid}: ${words.length} words (${ctcWords.length} text, ${melismaWords.length} melismas), ${totalNotes} notes`);
  
  fs.writeFileSync(path.join(outDir, `${pid}_gabc_data.json`), JSON.stringify(words, null, 2), 'utf8');
}
