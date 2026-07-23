import { spawnSync } from 'child_process';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

describe('seed-bars script', () => {
	it('refuses to run in production before connecting to MongoDB', () => {
		const result = spawnSync(
			process.execPath,
			[resolve(process.cwd(), 'scripts/seed-bars.js'), '1'],
			{
				cwd: process.cwd(),
				encoding: 'utf8',
				env: {
					...process.env,
					NODE_ENV: 'production',
					MONGO_URI: 'mongodb://127.0.0.1:1/enstorstark?serverSelectionTimeoutMS=100'
				},
				timeout: 5000
			}
		);

		expect(result.status).toBe(1);
		expect(result.signal).toBeNull();
		expect(result.stderr).toContain('Demo bar seeding is disabled when NODE_ENV=production.');
	});
});
