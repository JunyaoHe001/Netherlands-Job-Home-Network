/* PDOK tiles use the same RD New projection as the published research SVG. */
(() => {
  'use strict';
  const svg=document.getElementById('mapSvg'),ns='http://www.w3.org/2000/svg';
  const layer=document.createElementNS(ns,'g');
  layer.id='atlas-basemap-layer';layer.setAttribute('pointer-events','none');layer.setAttribute('opacity','0.78');
  svg.insertBefore(layer,document.getElementById('regionLayer'));
  // Calibration against 15,694 matching vertices; residual <0.071 SVG units.
  const scale=0.0031807438322971984,offsetX=41.255664002228514,offsetY=2002.0299040853674;
  // PDOK NetherlandsRDNewQuad: top-left (-285401.92,903401.92), 3440.64 m/pixel at z=0.
  const world=880803.84*scale,originX=offsetX-285401.92*scale,originY=offsetY-903401.92*scale;
  const images=new Map();let visible=true,timer;
  const credit=document.createElement('div');
  credit.className='atlas-basemap-credit';
  credit.style.cssText='position:absolute;right:5px;bottom:3px;z-index:5;background:rgba(255,255,255,.94);padding:2px 4px;font:10px/1.4 Arial,sans-serif';
  const link=document.createElement('a');link.href='https://www.pdok.nl/introductie/-/article/basisregistratie-topografie-achtergrondkaarten-brt-a-';
  link.target='_blank';link.rel='noopener';link.textContent='Kadaster / PDOK';
  credit.append('Kaartgegevens \u00a9 ',link);svg.parentElement.appendChild(credit);
  const input=window.createAtlasBasemapToggle(value=>{
    visible=value;layer.style.display=value?'':'none';credit.hidden=!value;
    if(value)schedule();else{clearTimeout(timer);layer.replaceChildren();images.clear();}
  },'PDOK geographic background in the original Dutch coordinate system. Research layers stay visible when hidden.');
  const warning=document.createElement('p');warning.hidden=true;warning.setAttribute('role','status');
  warning.style.cssText='font-size:11px;color:#8a4b10;line-height:1.5';
  warning.textContent='Some background tiles could not load. Job-home network layers remain available.';
  input.closest('section').appendChild(warning);
  function schedule(){clearTimeout(timer);if(visible)timer=setTimeout(draw,180);}
  function draw(){
    if(!visible)return;
    const box=svg.getBoundingClientRect(),m=svg.getScreenCTM();if(!m||!box.width||!box.height)return;
    const inverse=m.inverse();
    const a=new DOMPoint(box.left,box.top).matrixTransform(inverse),b=new DOMPoint(box.right,box.bottom).matrixTransform(inverse);
    let z=Math.max(0,Math.min(12,Math.floor(Math.log2(world*Math.hypot(m.a,m.b)/256))));
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
      image.addEventListener('error',()=>{image.style.display='none';if(visible)warning.hidden=false;});
      image.addEventListener('load',()=>{image.dataset.loaded='true';});
      image.setAttribute('href','https://service.pdok.nl/kadaster/brt-achtergrondkaart/wmts/v2_0/grijs/EPSG:28992/'+key+'.png');
      layer.appendChild(image);images.set(key,image);
    }
    for(const [key,image] of images)if(!wanted.has(key)){image.remove();images.delete(key);}
  }
  new MutationObserver(schedule).observe(svg,{attributes:true,attributeFilter:['viewBox']});
  if(window.ResizeObserver)new ResizeObserver(schedule).observe(svg);
  window.__ATLAS_BASEMAP__={type:'pdok',input,layer,refresh:draw};schedule();
})();
