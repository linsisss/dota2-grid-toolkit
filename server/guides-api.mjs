import { catalogText } from '../scripts/catalog-document.mjs';
import { GUIDE_CATEGORIES } from '../scripts/guide-document.mjs';
import { fail } from './catalog-store.mjs';
import { UPLOAD_PART } from './guides.mjs';

// The routes of «Гайды» under /api/catalog (server/guides.mjs holds the rules). Reading is open to
// everyone; writing, uploads, likes, comments and reports need a Telegram sign-in. Returns true when
// the request was one of them.
const PAGE_LIMIT = 1000;
const page = (url) => Math.max(0, Math.min(PAGE_LIMIT, Number(url.searchParams.get('page')) || 0)) | 0;
// An upload's file as the browser should take it: pictures and video inline, everything else saved,
// never run as a page (sandboxed, no scripts) whatever it contains.
function fileHeaders(response, file) {
  response.setHeader('Content-Security-Policy', "default-src 'none'; media-src 'self'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
  if (file.kind === 'file') response.setHeader('Content-Disposition', `attachment; filename="${file.name.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '')}"; filename*=UTF-8''${encodeURIComponent(file.name)}`);
}

export async function guideRoutes({ request, response, url, path, method, send, user, requireUser, isAdmin, identity, guides, readJSON, readBytes, sendFile, actor }) {
  const admin = isAdmin(user);
  if (path === '/guides' && method === 'GET') {
    return send(200, guides().list({ category: url.searchParams.get('category') || '', query: url.searchParams.get('q') || '',
      sort: url.searchParams.get('sort') === 'popular' ? 'popular' : 'new', page: page(url) })), true;
  }
  if (path === '/guides/config' && method === 'GET') return send(200, { categories: GUIDE_CATEGORIES, part: UPLOAD_PART }), true;
  if (path === '/guides/mine' && method === 'GET') return send(200, guides().mine(requireUser().id)), true;
  if (path === '/guides' && method === 'POST') {
    const member = requireUser(), body = await readJSON(request, 1_500_000);
    return send(200, guides().save(member.id, body, { admin: isAdmin(member) })), true;
  }
  // Uploads: start, parts, finish.
  if (path === '/guides/uploads' && method === 'POST') {
    const member = requireUser(), body = await readJSON(request);
    return send(201, guides().startUpload(member.id, body)), true;
  }
  const upload = /^\/guides\/uploads\/([A-Za-z0-9_-]{20})(\/done)?$/.exec(path);
  if (upload && method === 'PUT' && !upload[2]) {
    const member = requireUser();
    const bytes = await readBytes(request, UPLOAD_PART + 1024);
    return send(200, guides().appendUpload(member.id, upload[1], url.searchParams.get('offset'), bytes)), true;
  }
  if (upload && method === 'POST' && upload[2]) {
    const member = requireUser();
    return send(200, await guides().finishUpload(member.id, upload[1])), true;
  }
  const media = /^\/guides\/media\/([A-Za-z0-9_-]{20}\.[a-z0-9]{1,8})$/.exec(path);
  if (media && ['GET', 'HEAD'].includes(method)) {
    const file = guides().media(media[1], { account: user?.id || null, admin, review: url.searchParams.get('review') || '' });
    fileHeaders(response, file);
    return sendFile(request, response, file, file.type, file.public ? 'public, max-age=31536000, immutable' : 'private, no-store'), true;
  }
  const person = /^\/guides\/people\/([A-Za-z0-9_-]{20})\.jpg$/.exec(path);
  if (person && method === 'GET') {
    const image = guides().avatar(person[1]);
    response.writeHead(200, { 'Content-Type': image.type, 'Cache-Control': 'public, max-age=3600' });
    return response.end(image.body), true;
  }
  const comment = /^\/guides\/comments\/([1-9]\d{0,12})$/.exec(path);
  if (comment && method === 'DELETE') {
    const member = requireUser();
    return send(200, guides().removeComment(Number(comment[1]), member.id, { admin: isAdmin(member), actor: admin ? actor(member) : null })), true;
  }
  const item = /^\/guides\/([A-Za-z0-9_-]{12})(?:\/(edit|submit|publish|like|comments|report))?$/.exec(path);
  if (!item) return false;
  const [, id, action] = item;
  if (!action && method === 'GET') return send(200, guides().view(id, { account: user?.id || null, admin, review: url.searchParams.get('review') || '' })), true;
  if (!action && method === 'DELETE') { const member = requireUser(); return send(200, guides().remove(member.id, id, { admin: isAdmin(member) && url.searchParams.has('admin') })), true; }
  if (action === 'edit' && method === 'GET') { const member = requireUser(); return send(200, guides().editable(member.id, id, { admin: isAdmin(member) })), true; }
  if (action === 'publish' && method === 'POST') {
    const member = requireUser();
    if (!isAdmin(member)) fail(403, 'Публиковать без проверки могут только администраторы.');
    return send(200, guides().publish(id, actor(member))), true;
  }
  if (action === 'submit' && method === 'POST') return send(200, guides().submit(requireUser().id, id, identity)), true;
  if (action === 'like' && method === 'PUT') {
    const member = requireUser(), body = await readJSON(request);
    if (typeof body.liked !== 'boolean') fail(400, 'Неверный лайк.');
    return send(200, guides().like(id, member.id, body.liked)), true;
  }
  if (action === 'comments' && method === 'GET') return send(200, guides().comments(id, { account: user?.id || null, admin, offset: url.searchParams.get('offset') })), true;
  if (action === 'comments' && method === 'POST') {
    const member = requireUser(), body = await readJSON(request, 20_000);
    return send(201, guides().comment(id, member.id, body)), true;
  }
  if (action === 'report' && method === 'POST') {
    const member = requireUser(), body = await readJSON(request, 20_000);
    return send(200, guides().report(member.id, { guide: id, comment: body.comment || null, reason: body.reason })), true;
  }
  return false;
}

// /admin/guides: the queue, and a decision on a version.
export async function guideAdminRoutes({ request, url, path, method, send, guides, readJSON, actor, search }) {
  if (path === '/admin/guides' && method === 'GET') return send(200, guides().moderation(url.searchParams.get('filter'), page(url), search)), true;
  const mark = /^\/admin\/guides\/([A-Za-z0-9_-]{12})\/modding$/.exec(path);
  if (mark && method === 'POST') {
    const body = await readJSON(request);
    if (typeof body.modding !== 'boolean') fail(400, 'Неверная пометка.');
    return send(200, guides().setModding(mark[1], body.modding, actor)), true;
  }
  const review = /^\/admin\/guides\/([1-9]\d{0,12})$/.exec(path);
  if (review && method === 'POST') {
    const body = await readJSON(request);
    const reason = catalogText(body.reason ?? '', 500, 'Причина');
    return send(200, { reviewed: true, ...guides().moderate(Number(review[1]), { action: body.action, reason }, { actor }) }), true;
  }
  return false;
}
