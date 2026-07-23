import { readFile } from 'fs/promises';
import { error, type RequestHandler } from '@sveltejs/kit';
import {
	getReviewImageMimeType,
	getReviewImagePath,
	isReviewImageFilename
} from '$lib/server/review-images';
import { bars } from '$lib/db/bars';
import { getReviewImageCacheControl, withReviewVisibility } from '$lib/server/review-publication';

const isNotFoundError = (err: unknown): boolean =>
	typeof err === 'object' &&
	err !== null &&
	'code' in err &&
	(err as { code?: unknown }).code === 'ENOENT';

export const GET: RequestHandler = async ({ params, locals }) => {
	const { filename } = params;

	if (!filename || !isReviewImageFilename(filename)) {
		throw error(404);
	}

	const contentType = getReviewImageMimeType(filename);
	if (!contentType) {
		throw error(404);
	}

	let review;
	try {
		review = await bars.findOne(withReviewVisibility({ image: filename }, Boolean(locals.user)));
	} catch (err) {
		console.error('Image authorization failed:', err);
		throw error(500, 'Kunde inte läsa bilden');
	}

	if (!review) {
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
			'cache-control': getReviewImageCacheControl(review),
			'content-type': contentType
		}
	});
};
