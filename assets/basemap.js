/* Display-only RD New -> Web Mercator transform. No network weights change.
   Inverse oblique stereographic + Bessel-to-WGS84 seven-parameter transform.
   CRS parameters: EPSG:28992; PROJ sterea and EPSG Amersfoort-to-WGS84 (4).
   The public SVG coordinates are rounded: this is map display, not surveying. */
(() => {
  'use strict';
  const RAD = Math.PI / 180, A = 6377397.155, F = 1 / 299.1528128;
  const E2 = F * (2 - F), E = Math.sqrt(E2);
  const LAT0 = 52.1561605555556 * RAD, LON0 = 5.38763888888889 * RAD;
  const SIN0 = Math.sin(LAT0), COS2 = Math.cos(LAT0) ** 2;
  const C = Math.sqrt(1 + E2 * COS2 ** 2 / (1 - E2));
  const CHI0 = Math.asin(SIN0 / C), RC = Math.sqrt(1 - E2) / (1 - E2 * SIN0 ** 2);
  const ratio = (s, p) => ((1 - s) / (1 + s)) ** p;
  const K = Math.tan(CHI0 / 2 + Math.PI / 4) /
    (Math.tan(LAT0 / 2 + Math.PI / 4) ** C * ratio(E * SIN0, C * E / 2));
  const RX = -0.398957388243134 * RAD / 3600;
  const RY = 0.343987817378283 * RAD / 3600;
  const RZ = -1.87740163998045 * RAD / 3600;
  const M = 1 + 4.0725e-6, WGS_E2 = (1 / 298.257223563) * (2 - 1 / 298.257223563);
  function rdToWgs84(easting, northing) {
    const x = (easting - 155000) / (A * 0.9999079);
    const y = (northing - 463000) / (A * 0.9999079);
    const rho = Math.hypot(x, y), angle = 2 * Math.atan2(rho, 2 * RC);
    const sc = Math.sin(angle), cc = Math.cos(angle);
    const chi = rho ? Math.asin(cc * Math.sin(CHI0) + y * sc * Math.cos(CHI0) / rho) : CHI0;
    const lon = LON0 + (rho ? Math.atan2(x * sc, rho * Math.cos(CHI0) * cc - y * Math.sin(CHI0) * sc) / C : 0);
    const num = (Math.tan(chi / 2 + Math.PI / 4) / K) ** (1 / C);
    let lat = chi;
    for (let i = 0; i < 20; i++) {
      const next = 2 * Math.atan(num * ratio(E * Math.sin(lat), -E / 2)) - Math.PI / 2;
      if (Math.abs(next - lat) < 1e-14) { lat = next; break; }
      lat = next;
    }
    const n = A / Math.sqrt(1 - E2 * Math.sin(lat) ** 2);
    const bx = n * Math.cos(lat) * Math.cos(lon), by = n * Math.cos(lat) * Math.sin(lon);
    const bz = n * (1 - E2) * Math.sin(lat);
    const wx = 565.4171 + M * (bx - RZ * by + RY * bz);
    const wy = 50.3319 + M * (RZ * bx + by - RX * bz);
    const wz = 465.5524 + M * (-RY * bx + RX * by + bz);
    const p = Math.hypot(wx, wy);
    let wlat = Math.atan2(wz, p * (1 - WGS_E2));
    for (let i = 0; i < 12; i++) {
      const wn = 6378137 / Math.sqrt(1 - WGS_E2 * Math.sin(wlat) ** 2);
      const next = Math.atan2(wz + WGS_E2 * wn * Math.sin(wlat), p);
      if (Math.abs(next - wlat) < 1e-14) { wlat = next; break; }
      wlat = next;
    }
    return [Math.atan2(wy, wx) / RAD, wlat / RAD];
  }
  window.prepareAtlasMercator = function (source) {
    if (!source || !Array.isArray(source.regions) || source.regions.length !== 342) {
      throw new Error('Unexpected public municipality geometry for RD New conversion.');
    }
    const rdScale = 0.0031807438322971984, ox = 41.255664002228514, oy = 2002.0299040853674;
    const project = (sx, sy) => {
      const [lon, lat] = rdToWgs84((sx - ox) / rdScale, (oy - sy) / rdScale);
      return [(lon + 180) / 360, (1 - Math.asinh(Math.tan(lat * RAD)) / Math.PI) / 2];
    };
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    const parsed = source.regions.map(row => {
      // The published geometry contains absolute M/L coordinate pairs and Z only.
      const tokens = row[2].match(/[MLZ]|-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi) || [];
      const parts = [];
      for (let i = 0; i < tokens.length;) {
        const command = tokens[i++];
        if (command === 'Z') { parts.push(['Z']); continue; }
        if (command !== 'M' && command !== 'L') throw new Error('Unsupported geometry path command.');
        const point = project(Number(tokens[i++]), Number(tokens[i++]));
        if (!point.every(Number.isFinite)) throw new Error('Non-finite geographic coordinate.');
        minU = Math.min(minU, point[0]); maxU = Math.max(maxU, point[0]);
        minV = Math.min(minV, point[1]); maxV = Math.max(maxV, point[1]);
        parts.push([command, ...point]);
      }
      return {row, parts, node: project(row[3], row[4])};
    });
    const width = 1000, height = 1050, padding = 38;
    const worldWidth = Math.min((width - 2 * padding) / (maxU - minU), (height - 2 * padding) / (maxV - minV));
    const originX = (width - (maxU - minU) * worldWidth) / 2 - minU * worldWidth;
    const originY = (height - (maxV - minV) * worldWidth) / 2 - minV * worldWidth;
    const px = u => originX + u * worldWidth, py = v => originY + v * worldWidth;
    const regions = parsed.map(({row, parts, node}) => [row[0], row[1],
      parts.map(part => part[0] === 'Z' ? 'Z' : `${part[0]}${px(part[1]).toFixed(3)},${py(part[2]).toFixed(3)}`).join(''),
      px(node[0]), py(node[1])]);
    const mapping = {worldWidth, originX, originY};
    window.__ATLAS_MERCATOR__ = mapping;
    window.dispatchEvent(new CustomEvent('atlas:mercator-ready', {detail: mapping}));
    return {...source, viewBox:[0,0,width,height], regions};
  };
  // Exposed only for numerical regression tests and projection diagnostics.
  window.AtlasRDProjection = {rdToWgs84};
})();

/* Standard OSM tiles in the same Web Mercator plane as the displayed geometry. */
(() => {
  'use strict';
  const svg=document.getElementById('mapSvg'),ns='http://www.w3.org/2000/svg';
  const layer=document.createElementNS(ns,'g');
  layer.id='atlas-basemap-layer';layer.setAttribute('pointer-events','none');layer.setAttribute('opacity','0.7');
  svg.insertBefore(layer,document.getElementById('regionLayer'));
  const images=new Map();let visible=true,timer,mapping=null;
  const credit=document.createElement('div');
  credit.className='atlas-basemap-credit';
  credit.style.cssText='position:absolute;right:5px;bottom:3px;z-index:5;background:rgba(255,255,255,.94);padding:2px 4px;font:10px/1.4 Arial,sans-serif';
  const link=document.createElement('a');link.href='https://www.openstreetmap.org/copyright';
  link.target='_blank';link.rel='noopener';link.textContent='OpenStreetMap';
  credit.append('\u00a9 ',link,' contributors');svg.parentElement.appendChild(credit);
  const input=window.createAtlasBasemapToggle(value=>{
    visible=value;layer.style.display=value?'':'none';credit.hidden=!value;
    if(value)schedule();else{clearTimeout(timer);layer.replaceChildren();images.clear();}
  },'OpenStreetMap. Hiding the basemap preserves all job-home network layers.');
  const warning=document.createElement('p');warning.hidden=true;warning.setAttribute('role','status');
  warning.style.cssText='font-size:11px;color:#8a4b10;line-height:1.5';
  warning.textContent='Some background tiles could not load. Job-home network layers remain available.';
  input.closest('section').appendChild(warning);
  function schedule(){clearTimeout(timer);if(visible&&mapping)timer=setTimeout(draw,180);}
  function draw(){
    if(!visible||!mapping)return;
    const {worldWidth:world,originX,originY}=mapping;
    const box=svg.getBoundingClientRect(),m=svg.getScreenCTM();if(!m||!box.width||!box.height)return;
    const inverse=m.inverse();
    const a=new DOMPoint(box.left,box.top).matrixTransform(inverse),b=new DOMPoint(box.right,box.bottom).matrixTransform(inverse);
    let z=Math.max(0,Math.min(19,Math.floor(Math.log2(world*Math.hypot(m.a,m.b)/256))));
    let n,span,x0,x1,y0,y1;
    do{
      n=2**z;span=world/n;
      x0=Math.max(0,Math.floor((a.x-originX)/span));x1=Math.min(n-1,Math.floor((b.x-originX)/span));
      y0=Math.max(0,Math.floor((a.y-originY)/span));y1=Math.min(n-1,Math.floor((b.y-originY)/span));
      if((x1-x0+1)*(y1-y0+1)<=64||z===0)break;z--;
    }while(z>=0);
    const wanted=new Set();
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
      const key=`${z}/${x}/${y}`;wanted.add(key);if(images.has(key))continue;
      const image=document.createElementNS(ns,'image');
      for(const [k,v] of Object.entries({x:originX+x*span,y:originY+y*span,width:span,height:span,preserveAspectRatio:'none'}))image.setAttribute(k,v);
      image.addEventListener('error',()=>{image.dataset.failed='true';image.style.display='none';if(visible)warning.hidden=false;});
      image.addEventListener('load',()=>{image.dataset.loaded='true';});
      image.setAttribute('href','https://tile.openstreetmap.org/'+key+'.png');
      layer.appendChild(image);images.set(key,image);
    }
    for(const [key,image] of images)if(!wanted.has(key)){image.remove();images.delete(key);}
    warning.hidden=![...images.values()].some(image=>image.dataset.failed==='true');
  }
  window.addEventListener('atlas:mercator-ready',event=>{mapping=event.detail;schedule();});
  new MutationObserver(schedule).observe(svg,{attributes:true,attributeFilter:['viewBox']});
  if(window.ResizeObserver)new ResizeObserver(schedule).observe(svg);
  window.__ATLAS_BASEMAP__={type:'osm',input,layer,refresh:draw};
})();
