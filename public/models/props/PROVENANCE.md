# Prop asset provenance

## Canonical Quaternius Character 1

- Local package: `Cyberpunk Game Kit - Quaternius-20260716T040550Z-1-001`
- Geometry source: `Cyberpunk Game Kit - Quaternius/Character/Character.obj`
- `Character.obj` SHA-256: `c774a055e3dfa81ee61861f8d6caa7853ee2554d916f48327671d5023ded16e5`
- Material source: `Cyberpunk Game Kit - Quaternius/Character/Character.mtl`
- `Character.mtl` SHA-256: `b2a69fbaf95a9a0bd1a86ff72be8a737a1848755cbd65a13f219b70cdea80038`
- Bundled license: `Cyberpunk Game Kit - Quaternius/License.txt`
- `License.txt` SHA-256: `de990ef6fc68cffd7fd1ae342c4d0c823b541b8848d8f76bca5d3339f4de6f6e`
- License: **CC0 1.0 Universal (CC0 1.0), Public Domain Dedication**
- License URL: https://creativecommons.org/publicdomain/zero/1.0/
- Checked-in license text: `LICENSE-CC0.txt`

The package folder is named `Cyberpunk Game Kit - Quaternius`; its bundled
`License.txt` header identifies `Ultimate Platformer Pack`. The exact local
source path and checksums above are recorded without renaming that provenance.

The source has seven color-only material regions and no image textures. The
pipeline preserves the one canonical geometry, welds/deduplicates it, and
DRACO-compresses the GLB. The runtime per-instance PBR colors apply
deterministic skin, hair, jacket/shirt, pants, and accent palettes without
claiming texture maps exist or creating duplicate GLBs or material buckets.

- `ped_char.glb` bytes: 37912
- `ped_char.glb` SHA-256: `af61f5a28b6fe0a7e501a38a38fbe2f851dad8e233270c6e5a6e304849cb1d69`
- Geometry SHA-256: `88576111472042f70167d31e47ea588ec3652d09b52b425e73ca99a9395d03a3`
- Triangles: 7520
- Mesh primitives: 10
