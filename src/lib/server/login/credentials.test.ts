import { Effect, Layer } from 'effect';
import { describe, expect, it, vi } from 'vitest';
import { MongoError } from '$lib/server/platform/mongo';
import { UserStore } from '$lib/server/users';
import { PasswordHasher, verifyLoginCredentials } from './credentials';

const user = { _id: 'id', username: 'editor', password: 'stored-hash' };

const dependencies = () => ({
	findUser: vi.fn<(username: string) => Effect.Effect<typeof user | null, MongoError>>(),
	hash: vi.fn((_password: string) => Effect.void),
	verify: vi.fn((_hash: string, _password: string) => Effect.succeed(false))
});

const verify = (username: unknown, password: unknown, deps: ReturnType<typeof dependencies>) =>
	Effect.runPromise(
		verifyLoginCredentials(username, password).pipe(
			Effect.provide(
				Layer.mergeAll(
					Layer.succeed(
						UserStore,
						UserStore.of({
							findByUsername: deps.findUser,
							existingUsernames: () => Effect.succeed([]),
							listUsernames: () => Effect.succeed([]),
							listAuthorOptions: () => Effect.succeed([])
						})
					),
					Layer.succeed(PasswordHasher, PasswordHasher.of({ hash: deps.hash, verify: deps.verify }))
				)
			)
		)
	);

describe('login credentials', () => {
	it.each([
		['Editor', 'password', 'invalid_username_format'],
		['editor', 'short', 'invalid_password_format'],
		[null, 'password', 'invalid_username_format']
	])('rejects invalid input before lookup: %s', async (username, password, reason) => {
		const deps = dependencies();
		expect(await verify(username, password, deps)).toEqual({
			ok: false,
			reason,
			message: 'Ogiltigt användarnamn eller lösenord'
		});
		expect(deps.findUser).not.toHaveBeenCalled();
	});

	it('hashes unknown-user passwords so timing does not reveal accounts', async () => {
		const deps = dependencies();
		deps.findUser.mockReturnValue(Effect.succeed(null));
		expect(await verify('editor', 'password', deps)).toMatchObject({
			ok: false,
			reason: 'unknown_username',
			message: 'Fel användarnamn eller lösenord'
		});
		expect(deps.hash).toHaveBeenCalledWith('password');
		expect(deps.verify).not.toHaveBeenCalled();
	});

	it.each([false, true])('uses verification for existing users: %s', async (valid) => {
		const deps = dependencies();
		deps.findUser.mockReturnValue(Effect.succeed(user));
		deps.verify.mockReturnValue(Effect.succeed(valid));
		expect(await verify('editor', 'password', deps)).toEqual(
			valid
				? { ok: true, user }
				: { ok: false, reason: 'password_mismatch', message: 'Fel användarnamn eller lösenord' }
		);
		expect(deps.verify).toHaveBeenCalledWith('stored-hash', 'password');
		expect(deps.hash).not.toHaveBeenCalled();
	});

	it('propagates infrastructure failures without misreporting invalid credentials', async () => {
		const deps = dependencies();
		deps.findUser.mockReturnValue(
			Effect.fail(new MongoError({ cause: new Error('database unavailable') }))
		);
		await expect(verify('editor', 'password', deps)).rejects.toMatchObject({
			_tag: 'MongoError'
		});
	});
});
