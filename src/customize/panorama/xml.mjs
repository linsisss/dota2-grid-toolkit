// Valve's Panorama layouts (.xml as Source 2 Viewer writes them) as plain trees, for the HUD preview
// (2026-10-16). Panorama's XML is simple: elements, attributes in double quotes, comments, no text that
// matters (a Label's text is its `text` attribute), so a small parser is enough and works in Node too.
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
export const decodeEntities = (text) => text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, name) =>
  name[0] === '#' ? String.fromCodePoint(name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : Number(name.slice(1))) : ENTITIES[name.toLowerCase()] ?? all);

// { type, attrs, children } for every element; the document's own <root> is returned.
export function parseXML(text) {
  const root = { type: '#document', attrs: {}, children: [] }, stack = [root];
  const tag = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<(\/?)([A-Za-z_][\w.:-]*)((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'))?)*)\s*(\/?)>/g;
  let match;
  while ((match = tag.exec(text))) {
    const [, closing, type, rawAttrs, selfClosing] = match;
    if (!type) continue;
    if (closing) {
      // Close up to the matching element; a stray end tag is ignored.
      const at = stack.map((node) => node.type).lastIndexOf(type);
      if (at > 0) stack.length = at;
      continue;
    }
    const attrs = {}, attr = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g;
    let pair;
    while ((pair = attr.exec(rawAttrs))) attrs[pair[1]] = decodeEntities(pair[2] ?? pair[3] ?? '');
    const node = { type, attrs, children: [] };
    stack.at(-1).children.push(node);
    if (!selfClosing) stack.push(node);
  }
  return root.children.find((node) => node.type === 'root') || root;
}

// A layout file's parts: the stylesheets it includes (s2r paths without _c), its snippets and its panel.
export function readLayout(text) {
  const root = parseXML(text), part = (type) => root.children.find((node) => node.type === type);
  const styles = (part('styles')?.children || []).filter((node) => node.type === 'include').map((node) => sourcePath(node.attrs.src));
  const snippets = Object.fromEntries((part('snippets')?.children || []).map((node) => [node.attrs.name, node.children[0]]));
  const panel = root.children.find((node) => !['styles', 'scripts', 'snippets'].includes(node.type));
  return { styles, snippets, panel };
}

// «s2r://panorama/styles/hud/x.vcss» or «file://{resources}/styles/hud/x.css» → «panorama/styles/hud/x.css».
export function sourcePath(src = '') {
  return src.replace(/^s2r:\/\//, '').replace(/^file:\/\/\{resources\}\//, 'panorama/')
    .replace(/\.vcss(_c)?$/, '.css').replace(/\.vxml(_c)?$/, '.xml');
}
