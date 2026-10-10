export interface Coordinates {
	latitude: number;
	longitude: number;
}

export interface UserLocation extends Coordinates {
	accuracy: number;
}

export interface UserLocationState {
	position: UserLocation | null;
	error: string | null;
}
