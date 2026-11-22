import type {
	ExpressionSpecification,
	FillExtrusionLayerSpecification,
	Map,
	StyleSpecification
} from 'maplibre-gl';

function addDarkBuildings(style: StyleSpecification, color: string): StyleSpecification {
	const buildingsIndex = style.layers.findIndex(
		(layer) =>
			layer.type === 'fill' && (layer['source-layer'] === 'building' || layer.id === 'building')
	);
	const buildings = style.layers[buildingsIndex];
	if (
		buildings?.type !== 'fill' ||
		style.layers.some(
			(layer) =>
				layer.id === 'building-3d' ||
				(layer.type === 'fill-extrusion' &&
					layer.source === buildings.source &&
					layer['source-layer'] === buildings['source-layer'])
		)
	) {
		return style;
	}

	const height: ExpressionSpecification = ['number', ['get', 'render_height'], 0];
	const raisedBuildings: FillExtrusionLayerSpecification = {
		id: 'building-3d',
		type: 'fill-extrusion',
		source: buildings.source,
		...(buildings['source-layer'] ? { 'source-layer': buildings['source-layer'] } : {}),
		minzoom: 14,
		filter: ['all', ['!', ['has', 'hide_3d']], ['>', height, 0]],
		paint: {
			'fill-extrusion-color': color,
			'fill-extrusion-base': ['number', ['get', 'render_min_height'], 0],
			'fill-extrusion-height': height
		}
	};
	const layers = [...style.layers];
	layers.splice(buildingsIndex + 1, 0, raisedBuildings);
	return { ...style, layers };
}

export function setReviewMapStyle(map: Map, dark: boolean): void {
	const url = `https://tiles.openfreemap.org/styles/${dark ? 'dark' : 'liberty'}`;
	if (!dark) {
		map.setStyle(url);
		return;
	}
	const color = getComputedStyle(map.getContainer())
		.getPropertyValue('--color-map-building')
		.trim();
	map.setStyle(url, { transformStyle: (_previous, next) => addDarkBuildings(next, color) });
}
