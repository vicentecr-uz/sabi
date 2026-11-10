import react from './react/index.html';

const root = new URL('..', import.meta.url).pathname;

Bun.serve({
  port: Number(process.env.SABI_FIXTURE_PORT ?? 4173),
  // Rebuild /react on each load so it never serves a stale library, but no hot
  // reload: re-running main.tsx on edit would mount React twice.
  development: { hmr: false },
  routes: { '/react': react },
  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (request.method === 'POST' && path === '/submitted') {
      return Response.json([...await request.formData()]);
    }
    const file = Bun.file(root + (path === '/' ? 'fixtures/index.html' : path.slice(1)));
    if (await file.exists()) return new Response(file);
    // demo.html frames the live hero at /hero; anything not on disk is proxied
    // to the docs site so the frame is same-origin and its assets resolve.
    const live = await fetch(`https://sabi.vicentecr.uz${path === '/hero' ? '/' : path}${new URL(request.url).search}`);
    if (!live.ok) return new Response('Not found', { status: 404 });
    return new Response(await live.arrayBuffer(), { headers: { 'content-type': live.headers.get('content-type') ?? '' } });
  },
});
