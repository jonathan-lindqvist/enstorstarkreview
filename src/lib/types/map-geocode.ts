import type { ObjectId } from 'mongodb';

export type MapGeocodeStatus = 'resolved' | 'not_found' | 'failed' | 'pending';

export interface MapGeocode {
	_id?: ObjectId;
	addressKey: string;
	address: string;
	status: MapGeocodeStatus;
	strategyVersion?: number;
	latitude?: number;
	longitude?: number;
	retryAt?: Date;
	updatedAt: Date;
}
