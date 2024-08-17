import type { ObjectId } from 'mongodb';

export interface BarReview {
	_id: ObjectId;
	title: string;
	description: string;
	rating: number;
	image: string;
	location: string;
	slug: string;
	createdAt: Date;
	updatedAt: Date;
}
