// Art text is kept as supplied; only blank edges and the shared indent are trimmed.
export function artLines(text) {
  const lines = String(text).replace(/\r/g, '').replace(/\t/g, '    ').split('\n');
  const blank = (line) => /^\s*$/u.test(line);
  while (lines.length && blank(lines[0])) lines.shift();
  while (lines.length && blank(lines.at(-1))) lines.pop();
  if (!lines.length) return [];
  const indent = Math.min(
    ...lines.filter((line) => !blank(line)).map((line) => line.match(/^ */u)[0].length)
  );
  return lines.map((line) => line.slice(indent).replace(/ +$/u, ''));
}

export function layoutAsciiArt(text, measure = (line) => Array.from(line).length * 10.8) {
  const lines = artLines(text);
  const rows = lines.flatMap((line, index) =>
    line
      ? [
          {
            type: 'text',
            text: line,
            name: line,
            x: 0,
            y: index * 20,
            w: Math.max(30, measure(line) + 8),
            h: 30
          }
        ]
      : []
  );
  return {
    rows,
    width: Math.max(30, ...rows.map((row) => row.w)),
    height: Math.max(30, (lines.length - 1) * 20 + 30)
  };
}

export function placeAsciiArt(layout, canvas) {
  const x = Math.max(0, (canvas.w - layout.width) / 2);
  const y = Math.max(0, (canvas.h - layout.height) / 2);
  return layout.rows.map((row) => ({ ...row, x: row.x + x, y: row.y + y }));
}

// An art's rows as they go on the canvas: a text art's lines one under another (layoutAsciiArt), an art
// from the editor (scripts/art-document.mjs artRows) where its rows were. A one-glyph row is a symbol,
// as in an imported grid.
export function artLayout(art, measure = (line) => Array.from(line).length * 10.8) {
  if (!art?.rows?.length) return layoutAsciiArt(art?.text ?? '', measure);
  const rows = art.rows.map((row) => Array.from(row.text).length === 1
    ? { type: 'symbol', text: row.text, name: row.text, x: row.x, y: row.y, w: 30, h: 30 }
    : { type: 'text', text: row.text, name: row.text, x: row.x, y: row.y, w: Math.max(30, measure(row.text) + 8), h: 30 });
  return { rows, width: Math.max(30, ...rows.map((row) => row.x + row.w)), height: Math.max(30, ...rows.map((row) => row.y + row.h)) };
}
