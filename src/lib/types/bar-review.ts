import type { ReviewPersistenceFields } from './review-form';
import type { ObjectId } from 'mongodb';
import type { BarAttributeKey } from './bar-attributes';

export type ReviewRatingKey =
	| 'atmosphere'
	| 'service'
	| 'selection'
	| 'quality'
	| 'price'
	| 'cleanliness'
	| 'soundLevel'
	| 'barhopPotential';

export type ReviewRatingValues = Record<ReviewRatingKey, number>;

export type ReviewPublicationStatus = 'draft' | 'published';

export interface ReviewFieldChange {
	field: string;
	label: string;
	before: string;
	after: string;
}

export interface ReviewChangeLogEntry {
	updatedAt: Date;
	updatedBy: string;
	changes: ReviewFieldChange[];
}

export interface BarReview extends ReviewRatingValues {
	_id: ObjectId;
	title: string;
	description: string;

	// overall rating: 0–3
	rating: number;

	image: string;
	imageFocusX?: number;
	imageFocusY?: number;
	location: string;
	slug: string;
	beerBrand?: string;
	beerPriceKr?: number;
	isHappyHourPrice?: boolean;
	attributes?: BarAttributeKey[];

	author: string; // primary author chosen from the form's selected authors
	coAuthors?: string[]; // array of usernames of other contributors
	// Missing on legacy reviews, which are treated as published.
	publicationStatus?: ReviewPublicationStatus;
	changeLog?: ReviewChangeLogEntry[];
	// Set when a signed-in user deletes the review; the document stays but is hidden everywhere.
	deletedAt?: Date;
	deletedBy?: string;

	createdAt: Date;
	updatedAt: Date;
}

// Serialized version with _id as string (for client-side)
export interface SerializedBarReview extends Omit<BarReview, '_id' | 'createdAt' | 'updatedAt'> {
	_id: string;
	createdAt: Date | string;
	updatedAt: Date | string;
}

// Form data structure for validation errors
export interface BarReviewFormData extends ReviewRatingValues {
	barName: string;
	description: string;
	address: string;
	slug: string;
	beerBrandSelection: string;
	customBeerBrand: string;
	beerPriceKr: number;
	isHappyHourPrice: boolean;
	attributes: BarAttributeKey[];
	authors: string[];
	imageFocusX: number;
	imageFocusY: number;
	rating: number;
}

export interface ReviewFormActionData extends Partial<BarReviewFormData> {
	pointer?: string;
	message?: string;
}

// Form-editable fields only; publication and history have separate write contracts.
export type BarReviewUpdate = ReviewPersistenceFields &
	Pick<Partial<BarReview>, 'image'> & {
		updatedAt: Date;
	};
