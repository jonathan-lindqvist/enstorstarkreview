interface AsyncCacheOptions<T> {
	load(): Promise<T>;
	ttlMs: number;
	now?: () => number;
}

/** Shares reads within one generation; invalidation prevents stale work filling the cache. */
export const createAsyncCache = <T>({
	load,
	ttlMs,
	now = () => Date.now()
}: AsyncCacheOptions<T>) => {
	let cached: { value: T; expiresAt: number } | null = null;
	let version = 0;
	let pending: Promise<T> | null = null;

	return {
		invalidate(): void {
			cached = null;
			version += 1;
			pending = null;
		},
		async get(): Promise<T> {
			if (cached && cached.expiresAt > now()) return cached.value;
			if (!pending) {
				const generation = version;
				const promise = load()
					.then((value) => {
						if (version === generation) cached = { value, expiresAt: now() + ttlMs };
						return value;
					})
					.finally(() => {
						if (pending === promise) pending = null;
					});
				pending = promise;
			}
			return pending;
		}
	};
};
