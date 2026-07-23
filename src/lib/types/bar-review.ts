import type { ObjectId } from 'mongodb';

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

export interface BarReview {
	_id: ObjectId;
	title: string;
	description: string;

	atmosphere: number;
	service: number;
	selection: number;
	quality: number;
	price: number;
	cleanliness: number;
	soundLevel: number;
	barhopPotential: number;

	// overall rating: 0–3
	rating: number;

	image: string;
	imageFocusX?: number;
	imageFocusY?: number;
	location: string;
	slug: string;
	beerPriceKr?: number;
	isHappyHourPrice?: boolean;

	author: string; // primary author; creating, editing, or publishing can transfer authorship
	coAuthors?: string[]; // array of usernames of other contributors
	// Missing on legacy reviews, which are treated as published.
	publicationStatus?: ReviewPublicationStatus;
	changeLog?: ReviewChangeLogEntry[];

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
export interface BarReviewFormData {
	barName: string;
	description: string;
	address: string;
	slug: string;
	beerPriceKr: number;
	isHappyHourPrice: boolean;
	coAuthors: string[];
	imageFocusX: number;
	imageFocusY: number;
	rating: number;
	atmosphere: number;
	service: number;
	selection: number;
	quality: number;
	price: number;
	cleanliness: number;
	soundLevel: number;
	barhopPotential: number;
}

export interface ReviewFormActionData extends Partial<BarReviewFormData> {
	pointer?: string;
	message?: string;
}

// Partial update type for editing
export type BarReviewUpdate = Partial<Omit<BarReview, '_id' | 'createdAt'>> & {
	updatedAt: Date;
};
