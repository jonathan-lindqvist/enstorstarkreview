import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { verify } from 'argon2';
import { ObjectId } from 'mongodb';
import { parse } from 'yaml';

const initialize = (scripts, initialUsers = []) => {
	const indexes = [];
	const users = [...initialUsers];
	const database = {
		getSiblingDB(name) {
			assert.equal(name, 'enstorstark');
			return database;
		},
		bars: {
			createIndex(key, options) {
				indexes.push({ collection: 'bars', key, options });
			}
		},
		map_geocodes: {
			createIndex(key, options) {
				indexes.push({ collection: 'map_geocodes', key, options });
			}
		},
		users: {
			insertMany(documents) {
				users.push(...documents);
			}
		}
	};
	const context = { db: database, ObjectId };
	for (const script of scripts) {
		runInNewContext(readFileSync(new URL(script, import.meta.url), 'utf8'), context);
	}
	return JSON.parse(JSON.stringify({ indexes, users }));
};

test('shared initialization creates indexes without inserting application users', () => {
	const { indexes, users } = initialize(['./init.js']);
	assert.deepEqual(users, []);
	assert.deepEqual(indexes, [
		{
			collection: 'bars',
			key: { slug: 1 },
			options: { unique: true, name: 'unique_bar_slug' }
		},
		{
			collection: 'bars',
			key: { image: 1 },
			options: { name: 'bar_image_lookup' }
		},
		{
			collection: 'map_geocodes',
			key: { addressKey: 1 },
			options: { unique: true, name: 'unique_map_geocode_address' }
		}
	]);
});

test('shared initialization preserves existing application users when repeated', () => {
	const existingUsers = [{ _id: 'existing-user', username: 'reviewer', password: 'existing-hash' }];
	const { users } = initialize(['./init.js', './init.js'], existingUsers);
	assert.deepEqual(users, existingUsers);
});

test('development initialization retains both demo logins', async () => {
	const { users } = initialize(['./init.js', './seed-dev-users.js']);
	assert.deepEqual(
		users.map((user) => user.username),
		['dj', 'test']
	);
	for (const [username, password] of [
		['dj', 'jaeger123'],
		['test', 'testpass123']
	]) {
		const user = users.find((user) => user.username === username);
		assert.ok(ObjectId.isValid(user._id));
		assert.equal(await verify(user.password, password), true, username);
	}
});

test('Compose selects user-free production and seeded development/CI database images', () => {
	for (const [filename, target] of [
		['docker-compose.yml', 'production'],
		['docker-compose.dev.yml', 'development'],
		['docker-compose.ci.yml', 'development']
	]) {
		const compose = parse(readFileSync(new URL(`../${filename}`, import.meta.url), 'utf8'));
		assert.equal(compose.services.mongo.build.context, './db', filename);
		assert.equal(compose.services.mongo.build.target, target, filename);
	}
});
