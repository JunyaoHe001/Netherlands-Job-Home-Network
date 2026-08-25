# Dutch Municipal Job–Home Spider Network Atlas

Interactive public atlas of Dutch municipality-level home-to-work networks for 2014–2024.

## Public release boundary

Within each year, the website publishes only the strongest 70% of positive intermunicipal edges. The weakest 30%, all self-loops, zero-value pairs, original municipality codes, raw Parquet files and the private audit tables are excluded. All displayed municipality metrics are recomputed from the retained public subnetwork.

## Publication

The validated static site is generated from the archive in `.release/` and published to the `gh-pages` branch by GitHub Actions.
