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
			/** Dependencies of the oRPC procedures that both the web and the API call. */
			deps: import('$lib/server/rpc/context').RpcDependencies;
		}
	}
}

export {};
