import WebServer from '@blockless/sdk-ts/dist/lib/web';

const server = new WebServer();

// Serve static files (HTML, JS, CSS)
server.statics('public', '/');

// GET /api/greet
server.get('/api/greet', async (req) => {
  const name = req?.query?.name || 'Guest';
  return new Response(`Hello, ${name}!`, { status: 200 });
});

// POST /api/data
server.post('/api/data', async (req) => {
  try {
    const body = JSON.parse(req?.body || '{}');
    return new Response(JSON.stringify({ received: body }), { status: 200 });
  } catch (e) {
    return new Response('Invalid JSON!', { status: 400 });
  }
});

// Register the handler
server.start();
