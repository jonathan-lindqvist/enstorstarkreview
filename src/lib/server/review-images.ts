import { mkdirSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { ObjectId } from 'mongodb';
import {
	ALLOWED_REVIEW_IMAGE_MIME_TYPES,
	MAX_REVIEW_IMAGE_SIZE_BYTES,
	REVIEW_IMAGE_ALLOWED_TYPES_LABEL,
	REVIEW_IMAGE_TOO_LARGE_MESSAGE
} from '$lib/constants';
import type { ReviewFormProblem } from '$lib/server/review-form';

const ALLOWED_IMAGE_MIME: Record<string, string> = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp'
};

export interface ReviewImageUploadResult {
	filename: string;
	path: string;
}

export type ReviewImageUploadPipelineResult =
	| { ok: true; upload: ReviewImageUploadResult | null }
	| { ok: false; problem: ReviewFormProblem };

export interface ReviewImageUploadOptions {
	required: boolean;
	writeFailureMessage: string;
}

const imageProblem = (message: string): ReviewFormProblem => ({
	status: 400,
	message,
	pointer: '/image'
});

const getReviewImageDirectory = () => {
	if (process.env.NODE_ENV === 'production') {
		return join(process.cwd(), 'build', 'client', 'images');
	}

	return join(process.cwd(), 'static', 'images');
};

export const getReviewImageUploadPath = (filename: string) => {
	const uploadDirectory = getReviewImageDirectory();
	mkdirSync(uploadDirectory, { recursive: true });
	return join(uploadDirectory, filename);
};

export const getImageExtension = (mimeType: string): string | undefined => {
	if (!(ALLOWED_REVIEW_IMAGE_MIME_TYPES as readonly string[]).includes(mimeType)) return undefined;
	return ALLOWED_IMAGE_MIME[mimeType];
};

export const sanitizeReviewImage = async (bytes: Uint8Array, mimeType: string): Promise<Buffer> => {
	const { default: sharp } = await import('sharp');
	const image = sharp(Buffer.from(bytes)).rotate();

	if (mimeType === 'image/jpeg') {
		return image.jpeg({ quality: 90 }).toBuffer();
	}

	if (mimeType === 'image/png') {
		return image.png().toBuffer();
	}

	if (mimeType === 'image/webp') {
		return image.webp({ quality: 90 }).toBuffer();
	}

	throw new Error(`Unsupported image type: ${mimeType}`);
};

export const matchesImageSignature = (bytes: Uint8Array, mimeType: string): boolean => {
	if (mimeType === 'image/jpeg') {
		return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
	}

	if (mimeType === 'image/png') {
		return (
			bytes.length >= 8 &&
			bytes[0] === 0x89 &&
			bytes[1] === 0x50 &&
			bytes[2] === 0x4e &&
			bytes[3] === 0x47 &&
			bytes[4] === 0x0d &&
			bytes[5] === 0x0a &&
			bytes[6] === 0x1a &&
			bytes[7] === 0x0a
		);
	}

	if (mimeType === 'image/webp') {
		return (
			bytes.length >= 12 &&
			String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
			String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
		);
	}

	return false;
};

export const uploadReviewImage = async (
	image: FormDataEntryValue | null,
	options: ReviewImageUploadOptions
): Promise<ReviewImageUploadPipelineResult> => {
	if (!(image instanceof File) || image.size === 0) {
		return options.required
			? { ok: false, problem: imageProblem('Ogiltig fil') }
			: { ok: true, upload: null };
	}

	if (image.size > MAX_REVIEW_IMAGE_SIZE_BYTES) {
		return { ok: false, problem: imageProblem(REVIEW_IMAGE_TOO_LARGE_MESSAGE) };
	}

	const fileExt = getImageExtension(image.type);
	if (!fileExt) {
		return {
			ok: false,
			problem: imageProblem(
				`Ogiltig filtyp. Endast ${REVIEW_IMAGE_ALLOWED_TYPES_LABEL} är tillåtna`
			)
		};
	}

	let bytes: Uint8Array;
	try {
		bytes = await image.bytes();
	} catch (err) {
		console.error('Image read failed:', err);
		return { ok: false, problem: imageProblem('Kunde inte läsa bilden') };
	}

	if (!matchesImageSignature(bytes, image.type)) {
		return { ok: false, problem: imageProblem('Bildens innehåll matchar inte filtypen') };
	}

	let sanitizedBytes: Buffer;
	try {
		sanitizedBytes = await sanitizeReviewImage(bytes, image.type);
	} catch (err) {
		console.error('Image processing failed:', err);
		return { ok: false, problem: imageProblem('Kunde inte bearbeta bilden') };
	}

	const filename = `${new ObjectId().toHexString()}.${fileExt}`;
	const path = getReviewImageUploadPath(filename);

	try {
		writeFileSync(path, sanitizedBytes);
	} catch (err) {
		console.error('Image upload failed:', err);
		return { ok: false, problem: imageProblem(options.writeFailureMessage) };
	}

	return {
		ok: true,
		upload: {
			filename,
			path
		}
	};
};

export const cleanupReviewImageUpload = (upload: ReviewImageUploadResult | null): void => {
	if (!upload) return;

	try {
		unlinkSync(upload.path);
	} catch (cleanupError) {
		console.error('Image cleanup failed:', cleanupError);
	}
};
