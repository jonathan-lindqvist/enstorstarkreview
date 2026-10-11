export const MAX_REVIEW_IMAGE_SIZE_MB = 25;
export const MAX_REVIEW_IMAGE_SIZE_BYTES = MAX_REVIEW_IMAGE_SIZE_MB * 1024 * 1024;
export const ALLOWED_REVIEW_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const REVIEW_IMAGE_ACCEPT = ALLOWED_REVIEW_IMAGE_MIME_TYPES.join(',');
export const REVIEW_IMAGE_ALLOWED_TYPES_LABEL = 'JPEG, PNG och WebP';
export const REVIEW_IMAGE_TOO_LARGE_MESSAGE = `Bilden är för stor (max ${MAX_REVIEW_IMAGE_SIZE_MB} MB)`;
