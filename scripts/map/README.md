# Карта Кыргызстана (assets/map)

Генерируется один раз; повторять только если нужно изменить вид карты.

- `relief.webp` — рельеф (теневая отмывка) из высот SRTM, тайлы Terrarium с AWS Open Data (`elevation-tiles-prod`).
- `kg-geo.js` — границы страны и областей, озёра, реки (Natural Earth 1:10m, общественное достояние) и крупные города
  в той же сетке пикселей (Web Mercator, zoom 9).
- `kg-map.js`, `kg-map.css` — компонент карты (сайт и админка), пишутся вручную.

Сборка (нужны Python 3, numpy, pillow), из пустой рабочей папки:

```sh
mkdir -p geo/dem
for f in ne_10m_admin_0_countries ne_10m_admin_1_states_provinces ne_10m_lakes ne_10m_rivers_lake_centerlines; do
  curl -sfL -o geo/$f.geojson https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/$f.geojson
done
python download_dem.py            # тайлы высот → geo/dem
python build_map.py <проект>/assets/map
```

Схема каркаса в разделе «Несущий каркас — всегда металл» генерируется `scripts/frame_schematic.py frame.svg`
и вставляется в `index-stone.html` вместо `<svg class="frame-svg" …>`.
