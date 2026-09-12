(() => {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const $ = id => document.getElementById(id);
  const fmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
  const state = { manifest:null, map:null, year:null, data:null, cache:new Map(), selected:null, metric:'net', flowMode:'all', limit:500, minWeight:0, nodeSize:'total', shade:true, routes:true, labels:false, playing:false, timer:null, view:[0,0,1000,1050] };
  const metricIndex = { incoming:0, outgoing:1, net:2, total:3, in_degree:4, out_degree:5 };
  const metricLabel = { incoming:'Incoming job flow', outgoing:'Outgoing job flow', net:'Net job-flow balance', total:'Total external flow', in_degree:'Incoming partners', out_degree:'Outgoing partners' };
  const svg=$('mapSvg'), regionLayer=$('regionLayer'), edgeLayer=$('edgeLayer'), nodeLayer=$('nodeLayer'), labelLayer=$('labelLayer'), tooltip=$('tooltip');
  const regionEls=new Map(), regionById=new Map();
  function el(tag, attrs={}) { const x=document.createElementNS(NS,tag); for(const [k,v] of Object.entries(attrs)) x.setAttribute(k,v); return x; }
  async function getJSON(url){ const r=await fetch(url,{cache:'no-store'}); if(!r.ok) throw new Error(`${url}: HTTP ${r.status}`); return r.json(); }
  function publicMetric(node,key){ if(key==='uniform') return 1; return Number(node?.[metricIndex[key]]||0); }
  function mix(a,b,t){ return a.map((v,i)=>Math.round(v+(b[i]-v)*t)); }
  function rgb(v){ return `rgb(${v[0]},${v[1]},${v[2]})`; }
  function seqColor(v,max){ if(!max||v<=0) return '#E9E4DB'; const t=Math.min(1,Math.sqrt(v/max)); return rgb(mix([244,241,235],[47,111,126],t)); }
  function divColor(v,maxAbs){ if(!maxAbs||v===0) return '#E9E4DB'; const t=Math.min(1,Math.sqrt(Math.abs(v)/maxAbs)); return rgb(v<0?mix([233,228,219],[47,111,126],t):mix([233,228,219],[196,122,58],t)); }
  function nodeRadius(v,max){ return max ? 1.5+5.1*Math.sqrt(Math.max(0,v)/max) : 2; }
  function edgeWidth(v,max){ return max ? .55+3.25*Math.sqrt(v/max) : .7; }
  function arc(a,b){ const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy)||1,mx=(a.x+b.x)/2,my=(a.y+b.y)/2,bend=Math.min(42,d*.15),nx=-dy/d,ny=dx/d; return `M${a.x},${a.y}Q${mx+nx*bend},${my+ny*bend} ${b.x},${b.y}`; }
  function escapeHTML(s){ return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  async function loadYear(year){
    state.year=year; let obj=state.cache.get(year);
    if(!obj){ obj=await getJSON(`data/${state.manifest.year_files[String(year)]}?v=20260826`); state.cache.set(year,obj); }
    state.data=obj; $('yearSlider').value=year; $('yearValue').textContent=year; $('toolbarYear').textContent=year;
    const maxW=Math.max(0,...obj.edges.map(e=>e[2])); $('minWeight').max=Math.ceil(maxW*10)/10;
    if(state.minWeight>maxW){state.minWeight=0;$('minWeight').value=0;$('minWeightValue').textContent='0';}
    render();
  }
  function visibleEdges(){
    if(!state.data||!state.routes) return [];
    let arr=state.data.edges.filter(e=>e[2]>=state.minWeight);
    if(state.selected!==null && state.flowMode!=='all'){
      const id=state.selected;
      if(state.flowMode==='incident') arr=arr.filter(e=>e[0]===id||e[1]===id);
      if(state.flowMode==='outgoing') arr=arr.filter(e=>e[0]===id);
      if(state.flowMode==='incoming') arr=arr.filter(e=>e[1]===id);
    }
    if(state.limit!=='all') arr=arr.slice(0,Number(state.limit));
    return arr;
  }
  function render(){
    if(!state.data||!state.map) return;
    const nodes=state.data.nodes, values=nodes.map(n=>publicMetric(n,state.metric));
    const max=Math.max(0,...values), maxAbs=Math.max(0,...values.map(Math.abs));
    const sizeVals=nodes.map(n=>publicMetric(n,state.nodeSize)), maxSize=Math.max(0,...sizeVals);
    for(const [id,p] of regionEls){ const v=values[id]||0; p.style.fill=state.shade?(state.metric==='net'?divColor(v,maxAbs):seqColor(v,max)):'#E9E4DB'; p.classList.toggle('focused',state.selected===id); p.style.opacity=state.selected!==null&&state.selected!==id?'.62':'1'; }
    edgeLayer.replaceChildren(); const edges=visibleEdges(); const maxEdge=Math.max(0,...edges.map(e=>e[2]));
    for(const e of edges){ const a=regionById.get(e[0]),b=regionById.get(e[1]); if(!a||!b)continue; const focused=state.selected!==null&&(e[0]===state.selected||e[1]===state.selected); const dim=state.selected!==null&&!focused; const p=el('path',{d:arc(a,b),class:`edge-path${focused?' focused':''}`}); p.style.strokeWidth=edgeWidth(e[2],maxEdge); p.style.opacity=dim?'.035':String(.10+.42*Math.sqrt(e[2]/Math.max(maxEdge,1))); edgeLayer.appendChild(p); }
    nodeLayer.replaceChildren();
    nodes.forEach((n,id)=>{ if(n[3]<=0)return; const r=regionById.get(id); const c=el('circle',{cx:r.x,cy:r.y,r:nodeRadius(publicMetric(n,state.nodeSize),maxSize),'data-base-radius':nodeRadius(publicMetric(n,state.nodeSize),maxSize),class:'node'}); const focused=state.selected===id; const connected=state.selected!==null&&state.data.edges.some(e=>(e[0]===state.selected&&e[1]===id)||(e[1]===state.selected&&e[0]===id)); if(focused)c.classList.add('focused'); else if(state.selected!==null&&!connected)c.classList.add('dimmed'); c.addEventListener('mousemove',ev=>showTooltip(ev,id)); c.addEventListener('mouseleave',hideTooltip); c.addEventListener('click',ev=>{ev.stopPropagation();selectMunicipality(id);}); nodeLayer.appendChild(c); });
    labelLayer.replaceChildren(); if(state.labels){ const top=nodes.map((n,id)=>({id,v:n[3]})).sort((a,b)=>b.v-a.v).slice(0,14); top.forEach(x=>addLabel(x.id)); } if(state.selected!==null&&!state.labels)addLabel(state.selected);
    $('statRegions').textContent=fmt.format(state.manifest.geography_count); $('statLinks').textContent=fmt.format(edges.length); $('statRetained').textContent=fmt.format(state.data.summary.retained_edges); $('statWeight').textContent=fmt.format(state.data.summary.published_weight_sum);
    $('legendTitle').textContent=metricLabel[state.metric]; $('legendScale').className=`legend-scale ${state.metric==='net'?'diverging':'sequential'}`; $('legendLow').textContent=state.metric==='net'?'More outgoing':'0'; $('legendMid').textContent=state.metric==='net'?'0':''; $('legendHigh').textContent=state.metric==='net'?'More incoming':'Higher';
    $('toolbarNote').textContent=`${state.limit==='all'?'All':`Top ${fmt.format(state.limit)}`} retained links · weakest 30% omitted`;
    updateScreenScaledSymbols(); updateSelected(); window.__ATLAS_READY__=true; window.__ATLAS_STATE__={year:state.year,visibleEdges:edges.length,selected:state.selected};
  }
  function addLabel(id){ const r=regionById.get(id); if(!r)return; const t=el('text',{x:r.x+6,y:r.y-5,class:'node-label','data-index':id}); t.textContent=r.name; labelLayer.appendChild(t); }
  function showTooltip(ev,id){ const r=regionById.get(id),n=state.data.nodes[id]; tooltip.innerHTML=`<strong>${escapeHTML(r.name)}</strong><br>Incoming: ${fmt.format(n[0])}<br>Outgoing: ${fmt.format(n[1])}<br>Net: ${fmt.format(n[2])}<br>Partners: ${fmt.format(n[4]+n[5])}`; tooltip.hidden=false; const box=svg.parentElement.getBoundingClientRect(); tooltip.style.left=`${Math.min(box.width-235,ev.clientX-box.left+14)}px`; tooltip.style.top=`${Math.min(box.height-115,ev.clientY-box.top+14)}px`; }
  function hideTooltip(){tooltip.hidden=true;}
  function selectMunicipality(id){ state.selected=id; render(); renderTrend(id); }
  function updateSelected(){ const card=$('selectedCard'); if(state.selected===null){card.hidden=true;return;} card.hidden=false; const id=state.selected,r=regionById.get(id),n=state.data.nodes[id]; $('selectedName').textContent=r.name; $('selIncoming').textContent=fmt.format(n[0]); $('selOutgoing').textContent=fmt.format(n[1]); $('selNet').textContent=fmt.format(n[2]); $('selTotal').textContent=fmt.format(n[3]); const out=state.data.edges.filter(e=>e[0]===id).sort((a,b)=>b[2]-a[2]).slice(0,5), inc=state.data.edges.filter(e=>e[1]===id).sort((a,b)=>b[2]-a[2]).slice(0,5); fillList($('destinationList'),out,e=>e[1]); fillList($('originList'),inc,e=>e[0]); }
  function fillList(list,edges,partner){ list.replaceChildren(); if(!edges.length){const li=document.createElement('li');li.textContent='No retained links';list.appendChild(li);return;} edges.forEach(e=>{const li=document.createElement('li');li.textContent=`${regionById.get(partner(e)).name} · ${fmt.format(e[2])}`;list.appendChild(li);}); }
  async function renderTrend(id){ const token=id; const rows=await Promise.all(state.manifest.years.map(async y=>{let d=state.cache.get(y);if(!d){d=await getJSON(`data/${state.manifest.year_files[String(y)]}?v=20260826`);state.cache.set(y,d);}return [y,d.nodes[id][3]];})); if(state.selected!==token)return; const chart=$('trendChart'); chart.replaceChildren(); const W=280,H=80,pad=11,max=Math.max(1,...rows.map(r=>r[1])); const points=rows.map((r,i)=>[pad+i*(W-2*pad)/(rows.length-1),H-pad-r[1]/max*(H-2*pad)]); const axis=el('path',{d:`M${pad},${H-pad}H${W-pad}`,stroke:'#BFC7CF','stroke-width':'1',fill:'none'}); const line=el('path',{d:'M'+points.map(p=>p.join(',')).join('L'),stroke:'#2F6F7E','stroke-width':'2',fill:'none'}); chart.append(axis,line); points.forEach((p,i)=>{const c=el('circle',{cx:p[0],cy:p[1],r:'2.2',fill:'#2F6F7E'});const title=el('title');title.textContent=`${rows[i][0]}: ${fmt.format(rows[i][1])}`;c.appendChild(title);chart.appendChild(c);}); }
  function search(){ const q=$('searchInput').value.trim().toLowerCase(); if(!q)return; const hit=[...regionById.values()].find(r=>r.name.toLowerCase()===q)||[...regionById.values()].find(r=>r.name.toLowerCase().includes(q)); if(!hit)return; selectMunicipality(hit.id); setView([hit.x-85,hit.y-85,170,170]); }
  function updateScreenScaledSymbols() {
    const matrix=svg.getScreenCTM(); if(!matrix)return;
    const factor=1/Math.max(1e-9,Math.hypot(matrix.a,matrix.b));
    nodeLayer.querySelectorAll('.node').forEach(c=>c.setAttribute('r',String(Number(c.dataset.baseRadius||3)*factor)));
    labelLayer.querySelectorAll('.node-label').forEach(t=>{
      const r=regionById.get(Number(t.dataset.index));if(!r)return;
      t.setAttribute('x',String(r.x+6*factor));t.setAttribute('y',String(r.y-5*factor));
      t.style.fontSize=`${10*factor}px`;t.style.strokeWidth=String(2.4*factor);
    });
  }
  function setView(v) {
    if (!Array.isArray(v) || v.length !== 4 || !v.every(Number.isFinite) || v[2] <= 0 || v[3] <= 0) return;
    const [x,y,w,h] = v, box = svg.getBoundingClientRect();
    const aspect = box.width > 0 && box.height > 0 ? box.width / box.height : w / h;
    const width = Math.max(w, h * aspect), height = width / aspect;
    state.view = [x+w/2-width/2,y+h/2-height/2,width,height];
    svg.setAttribute('viewBox',state.view.join(' '));
    updateScreenScaledSymbols();
  }
  function fit(){setView(state.map.viewBox.slice());}
  function togglePlay(){state.playing=!state.playing;$('playYear').textContent=state.playing?'❚❚':'▶';if(state.playing){state.timer=setInterval(()=>{const i=state.manifest.years.indexOf(state.year);loadYear(state.manifest.years[(i+1)%state.manifest.years.length]);},1300);}else{clearInterval(state.timer);state.timer=null;}}
  function bindPanZoom() {
    // Use SVG's actual screen transform, including preserveAspectRatio letterboxing.
    const pointers = new Map();
    let last = null, moved = false, suppressClickUntil = 0;
    let lastSize = null;
    const maxWidth = () => window.__ATLAS_MERCATOR__?.worldWidth || state.map.viewBox[2] * 128;
    const minWidth = () => state.map.viewBox[2] / 128;
    function clientPoint(x, y) {
      const matrix = svg.getScreenCTM();
      return matrix ? new DOMPoint(x, y).matrixTransform(matrix.inverse()) : null;
    }
    function zoomAt(factor, x, y) {
      const anchor = clientPoint(x, y);
      if (!anchor) return;
      const [vx, vy, vw, vh] = state.view;
      const nextWidth = Math.max(minWidth(), Math.min(maxWidth(), vw * factor));
      const f = nextWidth / vw;
      setView([anchor.x + (vx - anchor.x) * f, anchor.y + (vy - anchor.y) * f, nextWidth, vh * f]);
    }
    function panPixels(dx, dy) {
      const matrix = svg.getScreenCTM();
      if (!matrix) return;
      const inv = matrix.inverse(), a = new DOMPoint(0, 0).matrixTransform(inv);
      const b = new DOMPoint(dx, dy).matrixTransform(inv);
      const [x, y, w, h] = state.view;
      setView([x - (b.x - a.x), y - (b.y - a.y), w, h]);
    }
    function centreZoom(factor) {
      const box = svg.getBoundingClientRect();
      zoomAt(factor, box.left + box.width / 2, box.top + box.height / 2);
    }
    function gesture() {
      const p = [...pointers.values()].slice(0, 2);
      return p.length === 2
        ? {x:(p[0].x+p[1].x)/2, y:(p[0].y+p[1].y)/2, distance:Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y), count:2}
        : p.length ? {...p[0], distance:0, count:1} : null;
    }
    svg.style.touchAction = 'none';
    svg.setAttribute('tabindex', '0');
    svg.addEventListener('pointerdown', event => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      if (!pointers.size) { moved = false; suppressClickUntil = 0; }
      pointers.set(event.pointerId, {x:event.clientX, y:event.clientY});
      last = gesture();
      if (pointers.size > 1) moved = true;
      // Delay pointer capture until dragging: a simple click must still reach the node.
      svg.focus({preventScroll:true});
    });
    window.addEventListener('pointermove', event => {
      if (!pointers.has(event.pointerId)) return;
      pointers.set(event.pointerId, {x:event.clientX, y:event.clientY});
      const next = gesture();
      if (!last || next.count !== last.count) { last = next; return; }
      const dx = next.x - last.x, dy = next.y - last.y;
      if (!moved && Math.hypot(dx, dy) < 4) return;
      moved = true;
      svg.classList.add('dragging');
      if (!svg.hasPointerCapture(event.pointerId)) {
        try { svg.setPointerCapture(event.pointerId); } catch (_) {}
      }
      if (next.count === 2 && next.distance > 0 && last.distance > 0) {
        zoomAt(last.distance / next.distance, last.x, last.y);
      }
      panPixels(dx, dy);
      last = next;
      if (event.cancelable) event.preventDefault();
    }, {passive:false});
    const stop = event => {
      if (!pointers.has(event.pointerId)) return;
      pointers.delete(event.pointerId);
      if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
      if (moved) suppressClickUntil = performance.now() + 400;
      last = gesture();
      if (!pointers.size) svg.classList.remove('dragging');
    };
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    svg.addEventListener('lostpointercapture', stop);
    window.addEventListener('blur', () => { pointers.clear(); last = null; svg.classList.remove('dragging'); });
    svg.addEventListener('click', event => {
      if (performance.now() < suppressClickUntil) { event.preventDefault(); event.stopImmediatePropagation(); }
    }, true);
    svg.addEventListener('wheel', event => {
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? svg.clientHeight : 1;
      const delta = Math.max(-600, Math.min(600, event.deltaY * unit));
      zoomAt(Math.exp(delta * 0.0015), event.clientX, event.clientY);
    }, {passive:false});
    svg.addEventListener('keydown', event => {
      if (event.target !== svg) return;
      const actions = {
        '+':()=>centreZoom(1/1.5), '=':()=>centreZoom(1/1.5), '-':()=>centreZoom(1.5),
        '0':()=>setView(state.map.viewBox.slice()), 'Home':()=>setView(state.map.viewBox.slice()),
        'ArrowLeft':()=>panPixels(70,0), 'ArrowRight':()=>panPixels(-70,0),
        'ArrowUp':()=>panPixels(0,70), 'ArrowDown':()=>panPixels(0,-70),
      };
      if (actions[event.key]) { event.preventDefault(); actions[event.key](); }
    });
    const controls = document.createElement('div');
    controls.setAttribute('role', 'group'); controls.setAttribute('aria-label', 'Map navigation');
    controls.className = 'atlas-navigation';
    controls.style.cssText = 'position:absolute;right:14px;top:85px;z-index:8;display:flex;flex-direction:column;gap:4px';
    for (const [id, text, title, action] of [
      ['atlas-zoom-in','+','Zoom in',()=>centreZoom(1/1.5)],
      ['atlas-zoom-out','−','Zoom out',()=>centreZoom(1.5)],
      ['atlas-fit-map','Fit','Fit study area',()=>setView(state.map.viewBox.slice())],
    ]) {
      const button = document.createElement('button');
      button.id = id; button.type = 'button'; button.textContent = text; button.title = title;
      button.setAttribute('aria-label', title);
      button.style.cssText = 'min-width:36px;min-height:36px;border:1px solid #bac4ce;border-radius:6px;background:#fff;color:#344054;font:600 16px/1 Arial,sans-serif;cursor:pointer;box-shadow:0 1px 5px #0002';
      button.addEventListener('click', action); controls.appendChild(button);
    }
    svg.parentElement.appendChild(controls);
    // Keep the geographic centre and screen scale when resizing the browser.
    const resized = () => {
      const box = svg.getBoundingClientRect();
      if (!box.width || !box.height) return;
      if (lastSize) {
        const [x,y,w,h] = state.view;
        const units = Math.max(w / lastSize[0], h / lastSize[1]);
        const nw = units * box.width, nh = units * box.height;
        setView([x+w/2-nw/2,y+h/2-nh/2,nw,nh]);
      }
      lastSize = [box.width,box.height];
    };
    if (window.ResizeObserver) new ResizeObserver(resized).observe(svg);
    else window.addEventListener('resize', resized);
    resized();
    window.__ATLAS_NAVIGATION__ = {zoomAt,panPixels,fit:()=>setView(state.map.viewBox.slice()),getView:()=>state.view.slice()};
  }
  function bind(){ $('yearSlider').addEventListener('input',e=>loadYear(Number(e.target.value))); $('prevYear').addEventListener('click',()=>{const i=state.manifest.years.indexOf(state.year);loadYear(state.manifest.years[Math.max(0,i-1)]);}); $('nextYear').addEventListener('click',()=>{const i=state.manifest.years.indexOf(state.year);loadYear(state.manifest.years[Math.min(state.manifest.years.length-1,i+1)]);}); $('playYear').addEventListener('click',togglePlay); $('metricSelect').addEventListener('change',e=>{state.metric=e.target.value;render();}); $('flowMode').addEventListener('change',e=>{state.flowMode=e.target.value;render();}); $('edgeLimit').addEventListener('change',e=>{state.limit=e.target.value==='all'?'all':Number(e.target.value);render();}); $('minWeight').addEventListener('input',e=>{state.minWeight=Number(e.target.value);$('minWeightValue').textContent=String(state.minWeight);render();}); $('nodeSize').addEventListener('change',e=>{state.nodeSize=e.target.value;render();}); $('shadeToggle').addEventListener('change',e=>{state.shade=e.target.checked;render();}); $('routeToggle').addEventListener('change',e=>{state.routes=e.target.checked;render();}); $('labelToggle').addEventListener('change',e=>{state.labels=e.target.checked;render();}); $('searchButton').addEventListener('click',search); $('searchInput').addEventListener('keydown',e=>{if(e.key==='Enter')search();}); $('fitButton').addEventListener('click',fit); $('clearButton').addEventListener('click',()=>{state.selected=null;state.flowMode='all';$('flowMode').value='all';render();}); svg.addEventListener('click',()=>{state.selected=null;render();}); bindPanZoom(); }
  async function init(){ try{ state.manifest=await getJSON('data/manifest.json?v=20260826'); state.map=window.prepareAtlasMercator(await getJSON(`data/${state.manifest.map_file}?v=20260826`)); state.view=state.map.viewBox.slice(); svg.setAttribute('viewBox',state.view.join(' ')); for(const row of state.map.regions){const r={id:row[0],name:row[1],path:row[2],x:row[3],y:row[4]};regionById.set(r.id,r);const p=el('path',{d:r.path,class:'region-shape','data-id':r.id,'fill-rule':'evenodd'});p.addEventListener('mousemove',ev=>showTooltip(ev,r.id));p.addEventListener('mouseleave',hideTooltip);p.addEventListener('click',ev=>{ev.stopPropagation();selectMunicipality(r.id);});regionLayer.appendChild(p);regionEls.set(r.id,p);const o=document.createElement('option');o.value=r.name;$('municipalityOptions').appendChild(o);} $('yearSlider').min=Math.min(...state.manifest.years);$('yearSlider').max=Math.max(...state.manifest.years);$('edgeLimit').value=String(state.manifest.default_visible_edges||500);state.limit=Number($('edgeLimit').value);bind();fit();await loadYear(state.manifest.default_year); }catch(err){console.error(err);$('toolbarNote').textContent=`Data load failed: ${err.message||err}`;window.__ATLAS_ERROR__=String(err.message||err);} }
  init();
})();
