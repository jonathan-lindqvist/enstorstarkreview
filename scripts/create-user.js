#!/usr/bin/env node

/**
 * Script to create users in the database
 *
 * Usage:
 *   node scripts/create-user.js username password
 *
 * Example:
 *   node scripts/create-user.js johan_2024 lösenord123
 *   node scripts/create-user.js erik-2024 hemligt456
 */

import { MongoClient } from 'mongodb';
import { hash } from 'argon2';
import { ObjectId } from 'mongodb';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';

const ARGON2_MEMORY_COST = 19456;
const ARGON2_TIME_COST = 2;
const ARGON2_HASH_LENGTH = 32;
const ARGON2_PARALLELISM = 1;

const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 31;
const PASSWORD_MIN_LENGTH = 6;
const PASSWORD_MAX_LENGTH = 255;

const validateUsername = (username) => {
	if (username.length < USERNAME_MIN_LENGTH || username.length > USERNAME_MAX_LENGTH) {
		return `Username must be between ${USERNAME_MIN_LENGTH} and ${USERNAME_MAX_LENGTH} characters`;
	}
	if (!/^[a-z0-9_-]+$/.test(username)) {
		return 'Username can only contain lowercase letters, numbers, hyphens, and underscores';
	}
	return null;
};

const validatePassword = (password) => {
	if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
		return `Password must be between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters`;
	}
	return null;
};

async function createUser(username, password) {
	// Validate input
	const usernameError = validateUsername(username);
	if (usernameError) {
		console.error('❌ Invalid username:', usernameError);
		process.exit(1);
	}

	const passwordError = validatePassword(password);
	if (passwordError) {
		console.error('❌ Invalid password:', passwordError);
		process.exit(1);
	}

	let client;
	try {
		client = new MongoClient(MONGO_URI);
		await client.connect();
		console.log('✓ Connected to MongoDB');

		const db = client.db('enstorstark');
		const usersCollection = db.collection('users');

		// Check if user already exists
		const existingUser = await usersCollection.findOne({ username: username.toLowerCase() });
		if (existingUser) {
			console.error('❌ User already exists:', username);
			process.exit(1);
		}

		// Hash password
		console.log('🔐 Hashing password...');
		const hashedPassword = await hash(password, {
			memoryCost: ARGON2_MEMORY_COST,
			timeCost: ARGON2_TIME_COST,
			hashLength: ARGON2_HASH_LENGTH,
			parallelism: ARGON2_PARALLELISM
		});

		// Create user
		const result = await usersCollection.insertOne({
			_id: new ObjectId(),
			username: username.toLowerCase(),
			password: hashedPassword
		});

		console.log('✓ User created successfully!');
		console.log('');
		console.log('User details:');
		console.log(`  Username: ${username.toLowerCase()}`);
		console.log(`  User ID: ${result.insertedId}`);
		console.log('');
		console.log('The user can now log in at /login');
	} catch (error) {
		console.error('❌ Error creating user:', error.message);
		process.exit(1);
	} finally {
		if (client) {
			await client.close();
			console.log('✓ Database connection closed');
		}
	}
}

// Get username and password from command line arguments
const args = process.argv.slice(2);

if (args.length < 2) {
	console.log('Usage: node scripts/create-user.js <username> <password>');
	console.log('');
	console.log('Examples:');
	console.log('  node scripts/create-user.js johan_2024 lösenord123');
	console.log('  node scripts/create-user.js erik-2024 hemligt456');
	console.log('');
	console.log('Username requirements:');
	console.log(`  - Length: ${USERNAME_MIN_LENGTH}-${USERNAME_MAX_LENGTH} characters`);
	console.log('  - Allowed characters: lowercase letters, numbers, hyphens (-), underscores (_)');
	console.log('');
	console.log('Password requirements:');
	console.log(`  - Length: ${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} characters`);
	process.exit(1);
}

const username = args[0];
const password = args[1];

console.log('Creating user...');
console.log('');
createUser(username, password);
