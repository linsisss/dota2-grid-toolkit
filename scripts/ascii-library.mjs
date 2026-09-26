// Keep the supplied Unicode art intact: Braille is artwork, not an alphabet to replace.
export function artLines(text) {
  const lines = String(text).replace(/\r/g, '').replace(/\t/g, '    ').split('\n');
  const blank = (line) => /^[\s\u2800]*$/u.test(line);
  while (lines.length && blank(lines[0])) lines.shift();
  while (lines.length && blank(lines.at(-1))) lines.pop();
  if (!lines.length) return [];
  const indent = Math.min(
    ...lines.filter((line) => !blank(line)).map((line) => line.match(/^[ \u2800]*/u)[0].length)
  );
  return lines.map((line) => line.slice(indent).replace(/[ \u2800]+$/u, ''));
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
