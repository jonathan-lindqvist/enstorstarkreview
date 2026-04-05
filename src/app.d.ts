// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
	namespace App {
		interface AuthUser {
			id: string;
			username: string;
		}

		interface Locals {
			user: AuthUser | null;
			session: import('lucia').Session | null;
		}
	}
}

export {};
