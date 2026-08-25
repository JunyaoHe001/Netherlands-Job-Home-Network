from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path


if len(sys.argv) != 2:
    raise SystemExit("Usage: finalize_release.py <site-directory>")

root = Path(sys.argv[1]).resolve()
if not root.is_dir():
    raise SystemExit(f"Site directory not found: {root}")

old_title = "Dutch Municipal Job–Home Spider Network Atlas"
new_title = "Dutch Municipal Job–Home Network Atlas"

index_path = root / "index.html"
index = index_path.read_text(encoding="utf-8")
index = index.replace(old_title, new_title)
index = index.replace(
    "Interactive atlas of retained Dutch municipal job–home network flows, 2014–2024.",
    "Interactive atlas of Dutch municipal home-to-work networks, 2014–2024.",
)
index = index.replace(
    "<strong>Restricted public release.</strong> Within each year, only the strongest 70% of positive intermunicipal edges are included. The weakest 30% and all self-loops are omitted.",
    "<strong>Public preview.</strong> For each year, the map includes the strongest 70% of positive links between municipalities. The remaining 30% and all within-municipality links are withheld while the paper is under review.",
)
index = index.replace(
    "Direction: home municipality → work municipality. All displayed node measures are recomputed from the retained public edges only.",
    "Direction: home municipality → work municipality. All municipality measures on this page are calculated from the released links only.",
)
index_path.write_text(index, encoding="utf-8")

manifest_path = root / "data" / "manifest.json"
manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
manifest["title"] = new_title
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

(root / "README.md").write_text(
    """# Dutch Municipal Job–Home Network Atlas

This atlas shows annual home-to-work links between Dutch municipalities from 2014 to 2024.

## Public release

The paper is still under review, so the website does not publish the full network. For each year, it includes the strongest 70% of positive links between different municipalities. The remaining 30%, within-municipality links, zero-value pairs, original municipality codes, source files and private audit tables are not included. All municipality measures shown on the site are calculated from the released links only.

## Deployment

GitHub Actions checks the release archive, prepares the public files and publishes the site to the `gh-pages` branch.
""",
    encoding="utf-8",
)

(root / "DATA-NOTES.md").write_text(
    """# Data notes

- Direction: municipality of residence to municipality of work.
- Time coverage: 2014–2024.
- Municipalities shown: 342.
- Public edge set: the strongest 70% of positive links between different municipalities, selected separately for each year.
- Equal-weight links at the cut-off are ordered with a fixed release-specific hash.
- All municipality measures are calculated from the released links only.
- Published weights retain the source units used in the processed data.
""",
    encoding="utf-8",
)

(root / "SANITISATION.md").write_text(
    """# Public data boundary

## Included

- Municipality name
- Simplified map geometry and representative point
- Release-specific numeric municipality index
- Released source, target and edge weight
- Municipality measures calculated from the released links

## Not included

- Raw Parquet and Shapefile files
- Original municipality codes and source geometry attributes
- Distance values
- Zero-value pairs, within-municipality links and the withheld lower 30% of positive intermunicipal links
- Measures calculated from the full private network
- Private retention checks and the code-index crosswalk
- Local file paths and input hashes
""",
    encoding="utf-8",
)

(root / "docs" / "data-and-methods.html").write_text(
    """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Data and release notes</title>
  <style>body{font-family:system-ui,-apple-system,sans-serif;max-width:790px;margin:48px auto;padding:0 24px;color:#202838;line-height:1.65}h1{font-size:28px}h2{font-size:18px;margin-top:28px}code{background:#f1f3f6;padding:2px 5px;border-radius:4px}a{color:#315f91}</style>
</head>
<body>
  <h1>Data and release notes</h1>
  <p>This atlas shows annual home-to-work links between Dutch municipalities. Each arrow runs from the municipality of residence to the municipality of work.</p>

  <h2>Public edge set</h2>
  <p>The paper is still under review, so the public map does not include the full network. For each year, it keeps the strongest 70% of positive links between different municipalities and withholds the remaining 30%. Within-municipality links and zero-value pairs are not published. Equal-weight links at the cut-off are ordered with a fixed release-specific hash.</p>
  <p>Municipality colours, node sizes, degree counts, totals, selected-municipality summaries and trend lines are all calculated from the released links. They do not use totals from the full private network.</p>

  <h2>Published fields</h2>
  <p>The browser receives a numeric release-specific municipality index, municipality name, simplified map geometry, representative point, released edge endpoints and released edge weight. Original municipality codes, source shapefile attributes, distances, within-municipality links, zero-value pairs and withheld links are not included.</p>

  <h2>How to read the map</h2>
  <p>The map is intended for visual inspection. Because it contains only a subset of links, its density and network measures should not be treated as estimates for the full private network.</p>

  <p><a href="../">← Return to the atlas</a></p>
</body>
</html>
""",
    encoding="utf-8",
)

text_suffixes = {".html", ".md", ".json", ".js", ".css"}
for path in root.rglob("*"):
    if path.is_file() and path.suffix.lower() in text_suffixes:
        text = path.read_text(encoding="utf-8")
        if old_title in text or "Spider Network Atlas" in text:
            raise AssertionError(f"Old title remains in {path.relative_to(root)}")

rows = []
for path in sorted(p for p in root.rglob("*") if p.is_file()):
    rel = path.relative_to(root).as_posix()
    if rel == "FILE_MANIFEST.json":
        continue
    payload = path.read_bytes()
    rows.append(
        {
            "path": rel,
            "bytes": len(payload),
            "sha256": hashlib.sha256(payload).hexdigest(),
        }
    )

file_manifest = {
    "schema_version": "1.0",
    "self_excluded": True,
    "files": rows,
}
(root / "FILE_MANIFEST.json").write_text(
    json.dumps(file_manifest, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8",
)

print(f"Final public wording applied; {len(rows)} files recorded in FILE_MANIFEST.json.")
