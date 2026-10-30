import react from './react/index.html';

const root = new URL('..', import.meta.url).pathname;

Bun.serve({
  port: 4173,
  // No hot reload: re-running main.tsx on edit would mount React twice.
  development: false,
  routes: { '/react': react },
  async fetch(request) {
    const path = new URL(request.url).pathname;
    const file = Bun.file(root + (path === '/' ? 'fixtures/index.html' : path.slice(1)));
    return (await file.exists()) ? new Response(file) : new Response('Not found', { status: 404 });
  },
});
