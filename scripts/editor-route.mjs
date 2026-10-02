// Match the production clean URL in Vite dev and preview as well.
export function editorRoute(request, response, next) {
  const url = request.url || '/';
  const queryIndex = url.indexOf('?');
  const pathname = queryIndex < 0 ? url : url.slice(0, queryIndex);
  const query = queryIndex < 0 ? '' : url.slice(queryIndex);
  if (pathname === '/editor/') {
    response.writeHead(308, { Location: `/editor${query}` });
    response.end();
    return;
  }
  if (pathname === '/editor') request.url = `/editor.html${query}`;
  // The workshop was the catalog until 1.5; old links keep their query, the browser keeps the #hash.
  if (pathname === '/catalog' || pathname === '/catalog/') {
    response.writeHead(301, { Location: `/workshop${query}` }); response.end(); return;
  }
  if (pathname === '/workshop/') {
    response.writeHead(308, { Location: `/workshop${query}` }); response.end(); return;
  }
  if (pathname === '/workshop') request.url = `/catalog.html${query}`;
  // The menu background builder was /customize until 1.6.3; old links keep their query.
  if (pathname === '/customize' || pathname === '/customize/') {
    response.writeHead(301, { Location: `/background${query}` }); response.end(); return;
  }
  if (pathname === '/background/') {
    response.writeHead(308, { Location: `/background${query}` }); response.end(); return;
  }
  if (pathname === '/background') request.url = `/customize.html${query}`;
  // «Гайды» (src/guides/).
  if (pathname === '/guides/') {
    response.writeHead(308, { Location: `/guides${query}` }); response.end(); return;
  }
  if (pathname === '/guides') request.url = `/guides.html${query}`;
  next();
}
