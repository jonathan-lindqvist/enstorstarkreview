import { ObjectId } from 'mongodb';
import { Clock, Context, Effect, Layer, Ref } from 'effect';
import { Mongo, tryMongo, type AuditOutcome } from '$lib/server/platform/mongo';

export type { AuditOutcome };

export interface AuditEventInput {
	eventType: string;
	outcome: AuditOutcome;
	username?: string | null;
	ip?: string | null;
	targetSlug?: string;
	targetId?: string;
	reason?: string;
	details?: Record<string, unknown>;
}

const normalizeText = (value: string | null | undefined): string | undefined => {
	if (typeof value !== 'string') return undefined;
	const normalized = value.trim();
	return normalized.length > 0 ? normalized : undefined;
};

/**
 * Records sensitive actions. `log` never fails: an audit storage error is logged and swallowed,
 * so auditing can never break the request it describes. Passwords, tokens and request text are
 * never part of an event.
 */
export class AuditLog extends Context.Service<
	AuditLog,
	{ log(event: AuditEventInput): Effect.Effect<void> }
>()('enstorstark/server/AuditLog') {
	static readonly layer = Layer.effect(
		AuditLog,
		Effect.gen(function* () {
			const { collections } = yield* Mongo;
			return AuditLog.of({
				log: (event) =>
					Clock.currentTimeMillis.pipe(
						Effect.flatMap((now) =>
							tryMongo(() =>
								collections.auditLogs.insertOne({
									_id: new ObjectId(),
									eventType: event.eventType,
									outcome: event.outcome,
									username: normalizeText(event.username),
									ip: normalizeText(event.ip),
									targetSlug: normalizeText(event.targetSlug),
									targetId: normalizeText(event.targetId),
									reason: normalizeText(event.reason),
									details: event.details,
									createdAt: new Date(now)
								})
							)
						),
						Effect.catchTag('MongoError', (error) =>
							Effect.sync(() => console.error('Audit log insert failed:', error.cause))
						),
						Effect.asVoid
					)
			});
		})
	);

	/** Collects events in memory; read them with `AuditLog.recorded`. */
	static readonly layerTest = Layer.effect(
		AuditLog,
		Effect.gen(function* () {
			const events = yield* Ref.make<AuditEventInput[]>([]);
			return Object.assign(
				AuditLog.of({ log: (event) => Ref.update(events, (all) => [...all, event]) }),
				{ events }
			);
		})
	);

	static readonly recorded = Effect.gen(function* () {
		const audit = (yield* AuditLog) as AuditLog['Service'] & { events?: Ref.Ref<AuditEventInput[]> };
		if (!audit.events) throw new Error('AuditLog.recorded needs AuditLog.layerTest');
		return yield* Ref.get(audit.events);
	});
}

export const audit = (event: AuditEventInput) => AuditLog.use((log) => log.log(event));
