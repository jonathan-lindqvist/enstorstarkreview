import { MongoClient, type Collection, type Db, type ObjectId } from 'mongodb';
import { Context, Effect, Layer, Redacted, Schema } from 'effect';
import type { BarReview } from '$lib/types/bar-review';
import type { MapGeocode } from '$lib/types/map-geocode';
import type { User } from '$lib/types/user';
import { AppConfig } from './config';

export type AuditOutcome = 'attempt' | 'success' | 'failure' | 'denied' | 'rate_limited';

export interface AuditLogEntry {
	_id: ObjectId;
	eventType: string;
	outcome: AuditOutcome;
	username?: string;
	ip?: string;
	targetSlug?: string;
	targetId?: string;
	reason?: string;
	details?: Record<string, unknown>;
	createdAt: Date;
}

export interface SessionDocument {
	_id: string;
	expires_at: Date;
	user_id: string;
}

export interface LoginRateLimitRecord {
	_id: string;
	scope: 'ip' | 'username';
	key: string;
	windowStart: Date;
	attempts: number;
	blockedUntil: Date | null;
	createdAt: Date;
	updatedAt: Date;
}

export interface ReviewRequestRateLimitRecord {
	_id: string;
	scope: 'ip' | 'global';
	attempts: Date[];
	lastAllowed: boolean;
	createdAt: Date;
	updatedAt: Date;
}

export interface Collections {
	readonly bars: Collection<BarReview>;
	readonly users: Collection<User>;
	readonly mapGeocodes: Collection<MapGeocode>;
	readonly auditLogs: Collection<AuditLogEntry>;
	readonly sessions: Collection<SessionDocument>;
	readonly loginRateLimits: Collection<LoginRateLimitRecord>;
	readonly reviewRequestRateLimits: Collection<ReviewRequestRateLimitRecord>;
}

/** A failed MongoDB operation. Its cause is logged by the caller, never sent to a client. */
export class MongoError extends Schema.TaggedError<MongoError>()('MongoError', {
	cause: Schema.Unknown
}) {}

export const tryMongo = <A>(operation: () => Promise<A>): Effect.Effect<A, MongoError> =>
	Effect.tryPromise({ try: operation, catch: (cause) => new MongoError({ cause }) });

const DATABASE_NAME = 'enstorstark';

/** Creates the indexes that authorization, slugs, geocoding and TTL retention depend on. */
export const ensureIndexes = (database: Db) =>
	tryMongo(async () => {
		await database
			.collection('bars')
			.createIndex({ slug: 1 }, { unique: true, name: 'unique_bar_slug' });
		await database.collection('bars').createIndex({ image: 1 }, { name: 'bar_image_lookup' });
		await database
			.collection('map_geocodes')
			.createIndex({ addressKey: 1 }, { unique: true, name: 'unique_map_geocode_address' });
		await database
			.collection('audit_logs')
			.createIndex(
				{ createdAt: 1 },
				{ expireAfterSeconds: 60 * 60 * 24 * 90, name: 'audit_ttl_90d' }
			);
		await database
			.collection('audit_logs')
			.createIndex(
				{ eventType: 1, outcome: 1, createdAt: -1 },
				{ name: 'audit_event_outcome_createdAt' }
			);
		await database
			.collection('login_rate_limits')
			.createIndex(
				{ updatedAt: 1 },
				{ expireAfterSeconds: 60 * 60 * 24 * 30, name: 'login_rate_limit_ttl_30d' }
			);
		await database
			.collection('review_request_rate_limits')
			.createIndex(
				{ updatedAt: 1 },
				{ expireAfterSeconds: 60 * 60 * 48, name: 'review_request_rate_limit_ttl_48h' }
			);
	});

export const collectionsOf = (database: Db): Collections => ({
	bars: database.collection<BarReview>('bars'),
	users: database.collection<User>('users'),
	mapGeocodes: database.collection<MapGeocode>('map_geocodes'),
	auditLogs: database.collection<AuditLogEntry>('audit_logs'),
	sessions: database.collection<SessionDocument>('sessions'),
	loginRateLimits: database.collection<LoginRateLimitRecord>('login_rate_limits'),
	reviewRequestRateLimits: database.collection<ReviewRequestRateLimitRecord>(
		'review_request_rate_limits'
	)
});

/**
 * The MongoDB connection and its typed collections. The client connects lazily, like the driver
 * does on its first operation, so a database outage at boot does not poison the runtime; index
 * creation runs in the background and only logs failures.
 */
export class Mongo extends Context.Service<Mongo, { readonly collections: Collections }>()(
	'enstorstark/platform/Mongo'
) {
	static readonly layer = Layer.effect(
		Mongo,
		Effect.gen(function* () {
			const { mongoUri } = yield* AppConfig;
			const client = yield* Effect.acquireRelease(
				Effect.sync(() => new MongoClient(Redacted.value(mongoUri))),
				(client) => Effect.promise(() => client.close())
			);
			const database = client.db(DATABASE_NAME);
			yield* Effect.logInfo('Starting mongo...');
			yield* tryMongo(() => client.connect()).pipe(
				Effect.andThen(ensureIndexes(database)),
				Effect.andThen(Effect.logInfo('Mongo started')),
				Effect.catchTag('MongoError', (error) =>
					Effect.logError('Mongo startup failed', error.cause)
				),
				Effect.forkScoped
			);
			return Mongo.of({ collections: collectionsOf(database) });
		})
	);

	/**
	 * Test collections: supply only the operations a test needs. Calling anything else throws,
	 * which surfaces an unexpected database access instead of silently succeeding.
	 */
	static readonly layerTest = (collections: {
		[K in keyof Collections]?: Partial<Collections[K]>;
	}) =>
		Layer.succeed(
			Mongo,
			Mongo.of({
				collections: new Proxy({} as Collections, {
					get: (_, name: string) =>
						collections[name as keyof Collections] ??
						new Proxy(
							{},
							{
								get: (_, operation) => () => {
									throw new Error(`Unexpected ${name}.${String(operation)} call`);
								}
							}
						)
				})
			})
		);
}
