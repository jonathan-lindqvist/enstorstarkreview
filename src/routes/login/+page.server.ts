import { redirect } from '@sveltejs/kit';
import { Effect } from 'effect';
import { Sessions } from '$lib/server/auth';
import { BadRequest } from '$lib/server/errors';
import { loginWithPassword } from '$lib/server/login/login';
import { failWith, runWeb } from '$lib/server/web';
import type { Actions } from './$types';

export const actions: Actions = {
	login: async (event) => {
		const formData = await event.request.formData();

		const result = await runWeb(
			event,
			Effect.gen(function* () {
				const { session } = yield* loginWithPassword({
					username: formData.get('username'),
					password: formData.get('password'),
					channel: 'web'
				});
				return (yield* Sessions).sessionCookie(session.id);
			}).pipe(
				// Wrong credentials answer 400 on the web form, as before; quotas answer 429.
				Effect.catchTag('InvalidCredentials', (error) =>
					Effect.fail(new BadRequest({ message: error.message }))
				),
				failWith()
			)
		);
		if ('status' in result) return result;

		event.cookies.set(result.name, result.value, { path: '.', ...result.attributes });
		redirect(302, '/admin/reviews');
	}
};
