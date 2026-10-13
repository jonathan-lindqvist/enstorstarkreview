import { sanitizePlainText } from './review-text';

/** Shared saved-coordinate key; safe for both server loaders and browser form helpers. */
export const normalizeMapAddress = (address: string): string =>
	sanitizePlainText(address).toLocaleLowerCase('sv-SE');
