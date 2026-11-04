"""Rebuild the atlas display paths from CBS 2024 land records.

Usage: python rebuild_land_geometry.py <CBS-GeoJSON> <site-directory>
Requires shapely and pyproj. Network data and release indices are preserved.
"""
from __future__ import annotations

import hashlib
import json
import re
import sys
import unicodedata
from collections import Counter
from pathlib import Path

from pyproj import Transformer
from shapely import make_valid, symmetric_difference_all, union_all, transform
from shapely.geometry import Point, Polygon, shape

RD_SCALE = 0.0031807438322971984
OX = 41.255664002228514
OY = 2002.0299040853674
TOLERANCE_METRES = 50
SOURCE_URL = (
    "https://api.pdok.nl/cbs/wijken-en-buurten-2024/ogc/v1/"
    "collections/gemeenten/items?f=json&limit=1000"
)


def normalise(name):
    return unicodedata.normalize("NFC", name).strip().casefold()


def polygons(geometry):
    if geometry.geom_type == "Polygon":
        return [geometry]
    if geometry.geom_type == "MultiPolygon":
        return list(geometry.geoms)
    if geometry.geom_type != "GeometryCollection":
        return []
    return [p for g in geometry.geoms for p in polygons(g)
            if p.geom_type == "Polygon"]


def svg_point(x, y):
    return (OX + x * RD_SCALE, OY - y * RD_SCALE)


def rd_point(x, y):
    return ((x - OX) / RD_SCALE, (OY - y) / RD_SCALE)


def path_geometry(path):
    rings = []
    for ring in path.split("Z"):
        points = re.findall(r"[ML](-?[\d.]+),(-?[\d.]+)", ring)
        if len(points) >= 3:
            rings.append(make_valid(Polygon([rd_point(float(x), float(y)) for x, y in points])))
    return symmetric_difference_all(rings)


def svg_path(geometry):
    parts = []
    for polygon in polygons(geometry):
        for ring in [polygon.exterior, *polygon.interiors]:
            points = [svg_point(x, y) for x, y in list(ring.coords)[:-1]]
            parts.append("M" + "L".join(f"{x:.3f},{y:.3f}" for x, y in points) + "Z")
    return "".join(parts)


def rebuild(source_path, root):
    payload = source_path.read_bytes()
    source = json.loads(payload)
    if any(link["rel"] == "next" for link in source.get("links", [])):
        raise ValueError("The CBS source is incomplete: fetch every page before rebuilding.")
    features = source["features"]
    land_rows = [f for f in features if str(f["properties"].get("water", "")).upper() == "NEE"]
    assert len(land_rows) == 342, f"Expected 342 water=NEE records, got {len(land_rows)}"
    to_rd = Transformer.from_crs(4326, 28992, always_xy=True).transform
    by_name = {}
    for feature in land_rows:
        name = normalise(feature["properties"]["gemeentenaam"])
        assert name not in by_name, f"Duplicate municipality land record: {name}"
        geom = transform(shape(feature["geometry"]), to_rd, interleaved=False)
        assert geom.is_valid and not geom.is_empty
        by_name[name] = geom

    map_path = root / "data/map.json"
    old_bytes = map_path.read_bytes()
    atlas = json.loads(old_bytes)
    assert len(atlas["regions"]) == 342
    assert set(by_name) == {normalise(row[1]) for row in atlas["regions"]}
    original_rows = [row.copy() for row in atlas["regions"]]
    old_area = sum(path_geometry(row[2]).area for row in original_rows)
    adjusted_nodes = []
    result_geometries = []
    for row in atlas["regions"]:
        land = by_name[normalise(row[1])]
        simplified = land.simplify(TOLERANCE_METRES, preserve_topology=True)
        row[2] = svg_path(simplified)
        displayed = path_geometry(row[2])
        assert displayed.is_valid and not displayed.is_empty, f"Invalid path for {row[1]}"
        anchor = Point(*rd_point(row[3], row[4]))
        if not displayed.contains(anchor):
            # Use the main land component, with an interior anchor suitable for a node.
            main_land = max(polygons(displayed.intersection(land)), key=lambda p: p.area)
            interior = main_land.buffer(-200)
            interior_parts = polygons(interior) if not interior.is_empty else []
            if interior_parts:
                main_land = max(interior_parts, key=lambda p: p.area)
            point = main_land.representative_point()
            row[3], row[4] = [round(x, 3) for x in svg_point(point.x, point.y)]
            adjusted_nodes.append(row[0])
        assert displayed.contains(Point(*rd_point(row[3], row[4])))
        result_geometries.append(displayed)

    assert [(r[0], r[1]) for r in atlas["regions"]] == [(r[0], r[1]) for r in original_rows]
    assert atlas["viewBox"] == [0, 0, 1000, 1050]
    union = union_all(result_geometries)
    water_checks = {
        "IJsselmeer": [5.4, 52.85],
        "Markermeer": [5.2, 52.53],
        "Waddenzee": [5.5, 53.35],
        "North Sea": [4.3, 52.6],
        "Oosterschelde": [3.95, 51.6],
        "Haringvliet": [4.2, 51.8],
        "Grevelingen": [3.98, 51.75],
    }
    land_checks = {
        "Amsterdam": [4.9, 52.37],
        "Utrecht": [5.12, 52.09],
        "Groningen": [6.57, 53.22],
        "Texel": [4.8, 53.05],
        "Schiermonnikoog": [6.16, 53.48],
        "Terschelling": [5.35, 53.4],
        "Ameland": [5.77, 53.45],
    }
    water_results = {name: not union.covers(Point(*to_rd(*xy))) for name, xy in water_checks.items()}
    land_results = {name: union.covers(Point(*to_rd(*xy))) for name, xy in land_checks.items()}
    assert all(water_results.values()), water_results
    assert all(land_results.values()), land_results
    atlas["geometry"] = {
        "boundary_year": 2024,
        "coverage": "land_only",
        "source": "CBS Wijk- en Buurtkaart 2024 via PDOK",
        "source_filter": "water = NEE",
        "simplification_metres": TOLERANCE_METRES,
        "display_crs": "EPSG:28992 encoded in the existing SVG coordinate plane",
    }
    map_path.write_text(json.dumps(atlas, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    report = {
        "status": "pass",
        "date": "2026-11-04",
        "source_url": SOURCE_URL,
        "source_sha256": hashlib.sha256(payload).hexdigest(),
        "source_water_counts": dict(Counter(f["properties"].get("water") for f in features)),
        "land_records": len(land_rows),
        "municipalities": len(atlas["regions"]),
        "valid_display_geometries": len(result_geometries),
        "representative_points_on_land": len(result_geometries),
        "repositioned_display_node_indices": adjusted_nodes,
        "old_mapped_area_km2": round(old_area / 1e6, 3),
        "new_mapped_area_km2": round(sum(g.area for g in result_geometries) / 1e6, 3),
        "water_points_excluded": water_results,
        "land_and_island_points_retained": land_results,
        "municipality_index_and_name_order_preserved": True,
        "network_data_changed": False,
        "map_sha256": hashlib.sha256(map_path.read_bytes()).hexdigest(),
    }
    (root / "docs/land-geometry-validation-20261104.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    rebuild(Path(sys.argv[1]), Path(sys.argv[2]))
