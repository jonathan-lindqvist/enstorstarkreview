import { users } from '$lib/db/users';
import { apiHandler, jsonResponse, requireUser } from '$lib/server/api/http';
import type { ApiSchemas } from '$lib/server/api/openapi';

export const GET = apiHandler(async (event) => {
	const user = requireUser(event);
	if (user instanceof Response) return user;

	const usernames = (await users.find({}, { projection: { username: 1 } }).toArray())
		.map((entry) => entry.username)
		.toSorted((first, second) => first.localeCompare(second, 'sv'));

	const body: ApiSchemas['UserList'] = { users: usernames.map((username) => ({ username })) };
	return jsonResponse(body);
});
