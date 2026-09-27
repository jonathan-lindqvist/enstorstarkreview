import type { BarReviewFormData, ReviewRatingValues } from './bar-review';

export type ReviewFailureStatus = 400 | 401 | 404 | 409 | 412;

/**
 * Machine-readable problem kind. The web form ignores it; the API maps it to an HTTP status.
 * A problem without a code is invalid user input.
 */
export type ReviewProblemCode =
	| 'duplicate_slug'
	| 'not_found'
	| 'storage_failed'
	| 'precondition_failed'
	| 'concurrent_update';

export interface ReviewFormProblem {
	status: ReviewFailureStatus;
	message: string;
	pointer: string;
	code?: ReviewProblemCode;
}

export type ReviewFormValidationResult =
	| { ok: true; formData: BarReviewFormData }
	| { ok: false; formData: BarReviewFormData; problem: ReviewFormProblem };

export interface ReviewFormValidationOptions {
	invalidRatingMessage?: string;
	ratingValidationPosition?: 'beforeDetails' | 'afterDetails';
}

export interface ReviewPersistenceFields extends ReviewAuthorshipFields, ReviewRatingValues {
	title: string;
	description: string;
	rating: number;
	location: string;
	slug: string;
	beerBrand: string;
	beerPriceKr: number;
	isHappyHourPrice: boolean;
	imageFocusX: number;
	imageFocusY: number;
}

export interface ReviewAuthorshipFields {
	author: string;
	coAuthors: string[];
}
