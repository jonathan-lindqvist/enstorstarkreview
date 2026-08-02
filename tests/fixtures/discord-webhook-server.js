import { createServer } from 'node:http';

const port = 4174;
const server = createServer((request, response) => {
	if (request.method === 'POST' && request.url === '/webhook') {
		request.resume();
		request.on('end', () => {
			setTimeout(() => {
				response.writeHead(204);
				response.end();
			}, 750);
		});
		return;
	}

	response.writeHead(200, { 'content-type': 'text/plain' });
	response.end('ready');
});

server.listen(port, '127.0.0.1');

const closeServer = () => {
	server.close(() => process.exit(0));
};

process.on('SIGINT', closeServer);
process.on('SIGTERM', closeServer);
