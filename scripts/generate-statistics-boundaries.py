"""Build the private statistics boundary snapshot from SCB's RegSO 2025 GeoPackage."""

import json
import sqlite3
import sys
from pathlib import Path

from pyproj import Transformer
from shapely import from_wkb, normalize, set_precision, union_all
from shapely.geometry import MultiPolygon, mapping
from shapely.ops import transform


GOTHENBURG_MUNICIPALITIES = {
    "1384", "1401", "1402", "1407", "1415", "1419", "1440",
    "1441", "1462", "1480", "1481", "1482", "1489",
}
SOURCE_CRS = 3006


def read_geometry(blob):
    # GeoPackage puts an optional bounding box between the header and the WKB.
    envelope_type = (blob[3] >> 1) & 7
    envelope_size = (0, 32, 48, 48, 64)[envelope_type]
    return from_wkb(blob[8 + envelope_size:])


def build_feature(region, geometries):
    reproject = Transformer.from_crs(SOURCE_CRS, 4326, always_xy=True).transform
    merged = union_all(geometries, grid_size=0.01)
    rounded = normalize(set_precision(transform(reproject, merged), 0.000001))
    if rounded.is_empty or not rounded.is_valid or rounded.geom_type not in {"Polygon", "MultiPolygon"}:
        raise ValueError(f"Invalid boundary for {region}")
    polygons = rounded if rounded.geom_type == "MultiPolygon" else MultiPolygon([rounded])
    return {"type": "Feature", "id": region, "properties": {}, "geometry": mapping(polygons)}


def main():
    source = Path(sys.argv[1]).resolve()
    with sqlite3.connect(f"{source.as_uri()}?mode=ro", uri=True) as gpkg:
        rows = gpkg.execute(
            "SELECT kommunkod, sp_geometry FROM RegSO_2025 ORDER BY regsokod"
        ).fetchall()
    municipality_codes = {code for code, _ in rows}
    if len(rows) != 3363 or len(municipality_codes) != 290 or not GOTHENBURG_MUNICIPALITIES <= municipality_codes:
        raise ValueError("Expected the complete RegSO 2025 dataset")

    geometries = [(code, read_geometry(blob)) for code, blob in rows]
    features = [
        build_feature("goteborg", [shape for code, shape in geometries if code in GOTHENBURG_MUNICIPALITIES]),
        build_feature("sverige", [shape for _, shape in geometries]),
    ]
    output = Path(__file__).resolve().parents[1] / "src/lib/server/data/statistics-boundaries.geojson"
    output.parent.mkdir(exist_ok=True)
    output.write_text(
        '{"type":"FeatureCollection","features":[\n'
        + ",\n".join(json.dumps(feature, separators=(",", ":")) for feature in features)
        + "\n]}\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
