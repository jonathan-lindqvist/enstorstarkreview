import { describe, expect, it, vi } from 'vitest';
import { verifyLoginCredentials } from './credentials';
import { ARGON2_OPTIONS } from './policy.js';

const dependencies = () => ({
	findUser: vi.fn(),
	hash: vi.fn(),
	verify: vi.fn()
});
const user = { _id: 'id', username: 'editor', password: 'stored-hash' };

describe('login credentials', () => {
	it.each([
		['Editor', 'password', 'invalid_username_format'],
		['editor', 'short', 'invalid_password_format'],
		[null, 'password', 'invalid_username_format']
	])('rejects invalid input before lookup: %s', async (username, password, reason) => {
		const deps = dependencies();
		expect(await verifyLoginCredentials(username, password, deps)).toEqual({
			ok: false,
			reason,
			message: 'Ogiltigt användarnamn eller lösenord'
		});
		expect(deps.findUser).not.toHaveBeenCalled();
	});
	it('hashes unknown-user passwords with the same policy as user creation', async () => {
		const deps = dependencies();
		deps.findUser.mockResolvedValue(null);
		expect(await verifyLoginCredentials('editor', 'password', deps)).toMatchObject({
			ok: false,
			reason: 'unknown_username',
			message: 'Fel användarnamn eller lösenord'
		});
		expect(deps.hash).toHaveBeenCalledWith('password', ARGON2_OPTIONS);
		expect(deps.verify).not.toHaveBeenCalled();
	});
	it.each([false, true])('uses verification for existing users: %s', async (valid) => {
		const deps = dependencies();
		deps.findUser.mockResolvedValue(user);
		deps.verify.mockResolvedValue(valid);
		const result = await verifyLoginCredentials('editor', 'password', deps);
		expect(result).toEqual(
			valid
				? { ok: true, user }
				: { ok: false, reason: 'password_mismatch', message: 'Fel användarnamn eller lösenord' }
		);
		expect(deps.verify).toHaveBeenCalledWith('stored-hash', 'password');
		expect(deps.hash).not.toHaveBeenCalled();
	});
	it('propagates infrastructure failures without misreporting invalid credentials', async () => {
		const deps = dependencies();
		deps.findUser.mockRejectedValue(new Error('database unavailable'));
		await expect(verifyLoginCredentials('editor', 'password', deps)).rejects.toThrow(
			'database unavailable'
		);
	});
});
