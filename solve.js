// A fast drop-in replacement for csv-reader 1.0.0: run(input) returns exactly
// csv-reader's reading of {text, header} — {columns, rows, errors} — under its
// broken-row policy (BOM dropped, stray CRs, quote junk, unterminated quotes,
// short/long rows), but reads with delimiter searches (indexOf) and string
// slices instead of one character at a time.
//
// The three delimiter positions (comma, LF, CR) are cached and only ever move
// forward with the read position, so every search is amortised over the text:
// the whole file is scanned a constant number of times, never once per field.
// One scratch result object is reused for every field read.

const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;
const CR = 3;

export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const n = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0;
  let line = 1;
  if (text.charCodeAt(0) === 0xfeff) pos = 1;

  let recordLine = 1;
  let recordRow = null;

  // The scratch result of a field read: {value, ended, added}.
  const F = { value: '', ended: END, added: 0 };

  // Next index of each delimiter at or after the position it was found for;
  // Infinity means none is left in the text. A cached index is valid for any
  // later read position up to itself, so it is reused until the read
  // position passes it.
  let nComma = -1;
  let nLf = -1;
  let nCr = -1;

  function errHere(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  function finish(value, seg, parts) {
    if (parts !== null) return value + parts.join('');
    if (seg !== null) return value === '' ? seg : value + seg;
    return value;
  }

  // Reads unquoted characters onto `value` up to the next comma or line
  // break; a CR not followed by LF is dropped (stray_cr). Returns F: the
  // field, how it ended, and how many characters were kept (the caller that
  // reads quote junk needs that count).
  function readUnquoted(value) {
    let seg = null; // the single kept slice so far
    let parts = null; // slices once a stray CR splits the field
    let added = 0;
    let segStart = pos;
    for (;;) {
      if (nComma < pos) { nComma = text.indexOf(',', pos); if (nComma === -1) nComma = Infinity; }
      if (nLf < pos) { nLf = text.indexOf('\n', pos); if (nLf === -1) nLf = Infinity; }
      if (nCr < pos) { nCr = text.indexOf('\r', pos); if (nCr === -1) nCr = Infinity; }
      let m = nComma;
      let kind = COMMA;
      if (nLf < m) { m = nLf; kind = LINE_BREAK; }
      if (nCr < m) { m = nCr; kind = CR; }
      if (m === Infinity) {
        // No delimiter left: the field runs to the end of the text.
        if (segStart < n) {
          const s = text.slice(segStart, n);
          added += s.length;
          if (parts !== null) parts.push(s);
          else if (seg === null) seg = s;
          else parts = [seg, s];
        }
        pos = n;
        F.value = finish(value, seg, parts); F.ended = END; F.added = added;
        return F;
      }
      if (kind === CR) {
        // A CR: a line break when LF follows, else a dropped stray CR.
        if (m > segStart) {
          const s = text.slice(segStart, m);
          added += s.length;
          if (parts !== null) parts.push(s);
          else if (seg === null) seg = s;
          else parts = [seg, s];
        }
        if (text.charCodeAt(m + 1) === 10) {
          pos = m + 2;
          line += 1;
          F.value = finish(value, seg, parts); F.ended = LINE_BREAK; F.added = added;
          return F;
        }
        errHere('stray_cr');
        pos = m + 1;
        segStart = pos;
        continue;
      }
      // A comma or an LF ends the field.
      if (m > segStart) {
        const s = text.slice(segStart, m);
        added += s.length;
        if (parts !== null) parts.push(s);
        else if (seg === null) seg = s;
        else parts = [seg, s];
      }
      pos = m + 1;
      if (kind === LINE_BREAK) line += 1;
      F.value = finish(value, seg, parts); F.ended = kind; F.added = added;
      return F;
    }
  }

  // Reads a quoted field whose opening quote is at pos.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    let p = open + 1;
    let segStart = p;
    let seg = null;
    let parts = null;
    let lines = 0; // line breaks inside the field, committed only if it closes

    // Takes the raw text in [segStart, q) as the next piece of the field:
    // each CRLF or lone CR inside it becomes one LF, and its line breaks
    // count toward `lines` (in the normalised piece every break is one LF,
    // so counting its LFs counts the breaks).
    function takeSegment(q) {
      if (q <= segStart) return;
      // The shared delimiter caches serve here too: the read position only
      // moves forward through a quoted field.
      if (nCr < segStart) { nCr = text.indexOf('\r', segStart); if (nCr === -1) nCr = Infinity; }
      let s;
      if (nCr < q) {
        s = text.slice(segStart, q).replace(/\r\n?/g, '\n');
        let i = s.indexOf('\n');
        while (i !== -1) { lines += 1; i = s.indexOf('\n', i + 1); }
      } else {
        if (nLf < segStart) { nLf = text.indexOf('\n', segStart); if (nLf === -1) nLf = Infinity; }
        if (nLf < q) {
          s = text.slice(segStart, q);
          let i = s.indexOf('\n');
          while (i !== -1) { lines += 1; i = s.indexOf('\n', i + 1); }
        } else {
          s = text.slice(segStart, q);
        }
      }
      if (parts !== null) parts.push(s);
      else if (seg === null) seg = s;
      else parts = [seg, s];
    }

    for (;;) {
      const q = text.indexOf('"', p);
      if (q === -1) {
        // The quote never closes: it is a literal character, and the text
        // after it is read again as unquoted.
        pos = open + 1;
        line = openLine;
        // The read position moves backward here, past where the delimiter
        // caches may have been advanced to: force them to be found again.
        nCr = -1;
        nLf = -1;
        errHere('unterminated_quote');
        return readUnquoted('"');
      }
      if (text.charCodeAt(q + 1) === 34) {
        // A doubled quote: one literal quote in the field.
        takeSegment(q);
        if (parts !== null) parts.push('"');
        else if (seg === null) seg = '"';
        else parts = [seg, '"'];
        p = q + 2;
        segStart = p;
        continue;
      }
      takeSegment(q);
      line += lines;
      pos = q + 1;
      const value = parts !== null ? parts.join('') : (seg !== null ? seg : '');
      if (pos >= n) { F.value = value; F.ended = END; F.added = 0; return F; }
      const c = text.charCodeAt(pos);
      if (c === 44) { pos += 1; F.value = value; F.ended = COMMA; F.added = 0; return F; }
      if (c === 10) { pos += 1; line += 1; F.value = value; F.ended = LINE_BREAK; F.added = 0; return F; }
      if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
        F.value = value; F.ended = LINE_BREAK; F.added = 0; return F;
      }
      // What follows the closing quote is appended as it stands.
      const junk = readUnquoted(value);
      if (junk.added > 0) errHere('quote_junk');
      return junk;
    }
  }

  for (;;) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) { pos += 1; line += 1; }
      else if (c === 13 && text.charCodeAt(pos + 1) === 10) { pos += 2; line += 1; }
      else break;
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let ended;
    let quoted;
    do {
      quoted = text.charCodeAt(pos) === 34;
      const field = quoted ? readQuoted() : readUnquoted('');
      fields.push(field.value);
      ended = field.ended;
    } while (ended === COMMA);

    // A line that held only stray CRs is left with no characters: no record.
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
