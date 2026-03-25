import type { ObjectId } from 'mongodb';

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

	// overall rating: 0–3 (derived)
	rating: number;

	image: string;
	location: string;
	slug: string;

	author: string; // username of the person who published
	coAuthors?: string[]; // array of usernames of other contributors

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
	coAuthors: string[];
	atmosphere: number;
	service: number;
	selection: number;
	quality: number;
	price: number;
	cleanliness: number;
	soundLevel: number;
}

// Partial update type for editing
export type BarReviewUpdate = Partial<Omit<BarReview, '_id' | 'createdAt'>> & {
	updatedAt: Date;
};
