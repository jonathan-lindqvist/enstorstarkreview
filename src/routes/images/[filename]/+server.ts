import { readFile } from 'fs/promises';
import { error, type RequestHandler } from '@sveltejs/kit';
import {
	getReviewImageMimeType,
	getReviewImagePath,
	isReviewImageFilename
} from '$lib/server/review-images';

const isNotFoundError = (err: unknown): boolean =>
	typeof err === 'object' &&
	err !== null &&
	'code' in err &&
	(err as { code?: unknown }).code === 'ENOENT';

export const GET: RequestHandler = async ({ params }) => {
	const { filename } = params;

	if (!filename || !isReviewImageFilename(filename)) {
		throw error(404);
	}

	const contentType = getReviewImageMimeType(filename);
	if (!contentType) {
		throw error(404);
	}

	let bytes: Uint8Array;
	try {
		bytes = new Uint8Array(await readFile(getReviewImagePath(filename)));
	} catch (err) {
		if (isNotFoundError(err)) {
			throw error(404);
		}

		console.error('Image read failed:', err);
		throw error(500, 'Kunde inte läsa bilden');
	}

	const body = new ArrayBuffer(bytes.byteLength);
	new Uint8Array(body).set(bytes);

	return new Response(body, {
		headers: {
			'cache-control': 'public, max-age=31536000, immutable',
			'content-type': contentType
		}
	});
};
