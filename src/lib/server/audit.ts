import { ObjectId } from 'mongodb';
import db from '$lib/db/db';

export type AuditOutcome = 'attempt' | 'success' | 'failure' | 'denied' | 'rate_limited';

interface AuditLogEntry {
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

const auditLogs = db.collection<AuditLogEntry>('audit_logs');

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

export const logAuditEvent = async (event: AuditEventInput): Promise<void> => {
	try {
		await auditLogs.insertOne({
			_id: new ObjectId(),
			eventType: event.eventType,
			outcome: event.outcome,
			username: normalizeText(event.username),
			ip: normalizeText(event.ip),
			targetSlug: normalizeText(event.targetSlug),
			targetId: normalizeText(event.targetId),
			reason: normalizeText(event.reason),
			details: event.details,
			createdAt: new Date()
		});
	} catch (error) {
		console.error('Audit log insert failed:', error);
	}
};
