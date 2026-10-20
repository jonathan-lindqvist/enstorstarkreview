import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parse } from 'yaml';

const { services } = parse(readFileSync(new URL('../docker-compose.yml', import.meta.url), 'utf8'));

for (const service of ['app', 'mongo']) {
	test(`production ${service} retains at most five compressed 20 MB log files`, () => {
		assert.deepEqual(services[service].logging, {
			driver: 'local',
			options: { 'max-size': '20m', 'max-file': '5', compress: 'true' }
		});
	});
}

test('production Mongo checks health once a minute with the authenticated ping', () => {
	const { healthcheck } = services.mongo;
	assert.equal(healthcheck.interval, '60s');
	assert.equal(healthcheck.timeout, '5s');
	assert.equal(healthcheck.retries, 5);
	assert.equal(healthcheck.test[0], 'CMD-SHELL');
	assert.match(healthcheck.test[1], /--username "\$\$MONGO_INITDB_ROOT_USERNAME"/);
	assert.match(healthcheck.test[1], /--password "\$\$MONGO_INITDB_ROOT_PASSWORD"/);
	assert.match(healthcheck.test[1], /--authenticationDatabase admin/);
	assert.match(healthcheck.test[1], /db\.adminCommand\(\{ ping: 1 \}\)\.ok/);
});
