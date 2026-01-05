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

	createdAt: Date;
	updatedAt: Date;
}
