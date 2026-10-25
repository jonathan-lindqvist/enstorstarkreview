import { createHash } from 'crypto';

/** HTTP validators: weak matching for cache revalidation, strong matching for writes. */

export const contentETag = (serializedBody: string): string =>
	`"${createHash('sha256').update(serializedBody).digest('base64url').slice(0, 32)}"`;

const normalizeETag = (value: string) => value.trim().replace(/^W\//, '');

/** Weak comparison for GET cache validation; wildcards match an existing representation. */
export const ifNoneMatchMatches = (header: string | null, etag: string): boolean => {
	if (!header) return false;
	const target = normalizeETag(etag);
	return header.split(',').some((candidate) => {
		const value = normalizeETag(candidate);
		return value === '*' || value === target;
	});
};

/** Updates require an explicit current strong tag; wildcard updates are deliberately forbidden. */
export const ifMatchMatches = (header: string | null, etag: string): boolean => {
	if (!header || etag.startsWith('W/')) return false;
	const candidates = header.split(',').map((value) => value.trim());
	if (candidates.includes('*')) return false;
	return candidates.some((value) => value === etag);
};
