const NS='http://www.w3.org/2000/svg';
const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
let DATA=null,WORLD=null,projection,path,mapRoot=null,activeScenario='asia',selectedPlan='balanced',appliedPlan=null,activeResult=null,hasRun=false,currentDay=0,runTimer=null,toastTimer;
const scenarioMeta={
  asia:{label:'Interrupción de abastecimiento en Asia',short:'SHOCK REGIONAL',description:'El shock interrumpe simultáneamente el abastecimiento desde las economías asiáticas identificadas. La extensión operativa es un supuesto del escenario.',affected:p=>p.region==='Asia'},
  malaysia_vietnam:{label:'Malasia + Vietnam fuera de servicio',short:'DOBLE INTERRUPCIÓN',description:'Malasia y Vietnam dejan de abastecer temporalmente. Su participación se calcula sobre el valor comercial reportado; las plantas y capacidades siguen siendo hipotéticas.',affected:p=>['Malasia','Vietnam'].includes(p.name)},
  demand:{label:'Pico de demanda +30%',short:'DEMANDA +30%',description:'La demanda simulada aumenta 30% durante el episodio. La red de proveedores permanece disponible; capacidad alternativa y costos son supuestos.',affected:()=>false}
};
const planMeta={lean:{label:'Contener costo',recovery:.22,surge:.12,costWeight:.55},balanced:{label:'Balanceado',recovery:.52,surge:.20,costWeight:1},continuity:{label:'Proteger servicio',recovery:.78,surge:.30,costWeight:1.8}};
const API_ENABLED=location.port==='8020'||new URLSearchParams(location.search).get('api')==='1';

async function init(){
  try{
    if(window.RIPPLE_BUNDLE){DATA=window.RIPPLE_BUNDLE.data;WORLD=window.RIPPLE_BUNDLE.world;}
    else {const [d,w]=await Promise.all([fetch('data.json').then(r=>{if(!r.ok)throw Error('data');return r.json()}),fetch('world.geojson').then(r=>{if(!r.ok)throw Error('world');return r.json()})]);DATA=d;WORLD=w;}
    drawMap();bindControls();updateControls();refreshPreview();
    $('#engine-state').textContent=API_ENABLED?'Motor Python · simulación local':'Motor determinista · navegador local';
  }catch(err){console.error(err);$('#engine-state').textContent='No se pudo cargar la base local';toast('No fue posible cargar los datos del prototipo.');}
}
function totalValue(year=2024){return DATA.totals_usd_millions[String(year)]||0}
function share(partner,year=2024){return partner.usd_millions[String(year)]/totalValue(year)}
function formatMoney(v){return v>=1000?'$'+(v/1000).toFixed(2)+' mil millones USD':'$'+v.toFixed(0)+' millones USD'}
function formatPct(v){return (v*100).toFixed(1)+'%'}
function affectedShare(id=activeScenario){const pred=scenarioMeta[id].affected;return Math.min(.95,DATA.partners.filter(p=>p.coordinates||p.aggregate).filter(pred).reduce((s,p)=>s+p.usd_millions['2024'],0)/totalValue());}
function scenarioSpec(id=activeScenario){
  if(id==='demand')return {share:.30,demandLift:.30};
  return {share:affectedShare(id),demandLift:0};
}
function simulateLocal(scenarioId=activeScenario,planId=selectedPlan,stockDays=+$('#stock-slider').value,disruptionDays=+$('#duration-slider').value,horizon=30){
  const spec=scenarioSpec(scenarioId),plan=planMeta[planId],demand=100*(1+spec.demandLift),start=5,end=Math.min(horizon,start+disruptionDays);
  let stock=stockDays*100,backlog=0,servedTotal=0,demandTotal=0,stockoutDays=0,expedite=0;const daily=[];
  for(let day=1;day<=horizon;day++){
    const shock=day>=start&&day<end,recoveryWindow=day>=end&&day<Math.min(horizon+1,end+9);let supply,extra=0;
    if(scenarioId==='demand'){supply=shock?100+(demand-100)*plan.recovery:100+(demand-100)*plan.surge;extra=Math.max(0,supply-100);}
    else if(shock){const lost=100*spec.share;extra=lost*plan.recovery;supply=100-lost+extra;}
    else if(recoveryWindow){supply=100*(1+plan.surge);extra=supply-100;}
    else{supply=100;}
    expedite+=extra;const available=stock+supply;const served=Math.min(demand+backlog,available);backlog=Math.max(0,backlog+demand-served);stock=Math.max(0,available-served);stock=Math.min(Math.max(stockDays*100,2400),stock);
    if(served<demand-.0001)stockoutDays++;servedTotal+=Math.min(demand,served);demandTotal+=demand;
    daily.push({day,stock_units:+stock.toFixed(1),backlog_units:+backlog.toFixed(1),cover_days:+(stock/demand).toFixed(2),supply_units:+supply.toFixed(1),demand_units:+demand.toFixed(1),shock,recovery:recoveryWindow});
  }
  const service=servedTotal/demandTotal*100,cost=100+expedite*plan.costWeight/horizon*.22;
  return {scenario_id:scenarioId,plan_id:planId,plan_label:plan.label,horizon_days:horizon,stock_days:stockDays,disruption_days:disruptionDays,affected_trade_value_share:+spec.share.toFixed(4),service_level_pct:+service.toFixed(1),stockout_days:stockoutDays,delayed_demand_index:+backlog.toFixed(1),ending_cover_days:+(stock/demand).toFixed(1),response_cost_index:+cost.toFixed(1),daily,assumptions:'Demanda, inventario, capacidades, lead times y costos son índices sintéticos. La participación de origen se basa en valor comercial UN Comtrade 2024, no en volumen ni capacidad disponible.'};
}
async function simulateRequest(scenarioId,planId){
  const payload={scenario_id:scenarioId,plan_id:planId,stock_days:+$('#stock-slider').value,disruption_days:+$('#duration-slider').value,horizon_days:30};
  if(API_ENABLED){
    try{const r=await fetch('/api/simulate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});if(r.ok){$('#engine-state').textContent='Motor Python · simulación local';return await r.json();}}catch(_){/* optional API/fallback */}
  }
  $('#engine-state').textContent='Motor determinista · navegador local';return simulateLocal(scenarioId,planId,payload.stock_days,payload.disruption_days,30);
}
function selectScenarioTab(btn,focus=false){
  activeScenario=btn.dataset.scenario;
  $$('.scenario-tab').forEach(b=>{const on=b===btn;b.classList.toggle('active',on);b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1;});
  if(focus)btn.focus();
  invalidateEpisode();updateControls();refreshPreview();
}
function bindControls(){
  $$('.scenario-tab').forEach(btn=>{btn.tabIndex=btn.classList.contains('active')?0:-1;btn.addEventListener('click',()=>selectScenarioTab(btn));});
  $('.scenario-tabs').addEventListener('keydown',event=>{if(!['ArrowRight','ArrowLeft','Home','End'].includes(event.key))return;const tabs=$$('.scenario-tab'),index=tabs.findIndex(tab=>tab.dataset.scenario===activeScenario);if(index<0)return;event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:event.key==='ArrowRight'?(index+1)%tabs.length:(index-1+tabs.length)%tabs.length;if(tabs[next])selectScenarioTab(tabs[next],true);});
  $('#duration-slider').addEventListener('input',()=>{updateControls();invalidateEpisode();refreshPreview();});
  $('#stock-slider').addEventListener('input',()=>{updateControls();invalidateEpisode();refreshPreview();});
  $$('.plan-option').forEach(btn=>btn.addEventListener('click',()=>{selectedPlan=btn.dataset.plan;$$('.plan-option').forEach(b=>{const on=b===btn;b.classList.toggle('active',on);b.setAttribute('aria-checked',String(on));});refreshPreview();}));
  $('#run-button').addEventListener('click',()=>runEpisode(selectedPlan));
  $('#decision-button').addEventListener('click',()=>runEpisode(selectedPlan,true));
  $('#reset-button').addEventListener('click',()=>{clearInterval(runTimer);hasRun=false;activeResult=null;appliedPlan=null;currentDay=0;$('#day-readout').textContent='00';$('#status-label').textContent='LISTA PARA INICIAR';$('#outcome-status').textContent='ESCENARIO BASE';$('#outcome-status').parentElement.classList.remove('active');$('#decision-button').disabled=true;updateControls();refreshPreview();toast('Episodio reiniciado.');});
  $('#about-button').addEventListener('click',openModal);$('#modal-close').addEventListener('click',closeModal);$('#modal-okay').addEventListener('click',closeModal);$('#about-modal').addEventListener('click',e=>{if(e.target.id==='about-modal')closeModal()});document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal()});
}
function updateControls(){
  $('#duration-label').textContent=$('#duration-slider').value+' días';$('#stock-label').textContent=$('#stock-slider').value+' días';
  $('#scenario-caption').textContent=scenarioMeta[activeScenario].description;
  $('#map-title').textContent=activeScenario==='demand'?'La demanda crece más rápido que la capacidad.':'El shock se propaga desde el Pacífico.';
  updateMapInsight();
  $('#day-readout').textContent=String(currentDay).padStart(2,'0');
  $('#decision-button').textContent='';const a=document.createElement('span');a.textContent=hasRun?(selectedPlan===appliedPlan?'Plan aplicado al episodio':'Aplicar este plan al episodio'):'Simula el episodio para decidir';const b=document.createElement('span');b.textContent='→';$('#decision-button').append(a,b);$('#decision-button').disabled=!hasRun||selectedPlan===appliedPlan;
}
function invalidateEpisode(){clearInterval(runTimer);hasRun=false;activeResult=null;appliedPlan=null;currentDay=0;$('#day-readout').textContent='00';$('#status-label').textContent='ESCENARIO PREPARADO';$('#status-dot').parentElement.className='map-status';$('#run-label').textContent='Simular 30 días';$('#run-button').disabled=false;$('#decision-button').disabled=true;$('#outcome-status').textContent='PREVIA · NO EJECUTADA';$('#outcome-status').parentElement.classList.remove('active');drawMap();}
function refreshPreview(){const runs=Object.keys(planMeta).map(id=>simulateLocal(activeScenario,id));const active=runs.find(r=>r.plan_id===selectedPlan);renderMetrics(active,false);renderTimeline(active,30);renderComparisons(runs);renderAgentMessages(active,runs);drawMap();updateControls();}
function renderAgentMessages(result,runs){
  const selected=planMeta[selectedPlan];const bestService=[...runs].sort((a,b)=>b.service_level_pct-a.service_level_pct)[0];const leastCost=[...runs].sort((a,b)=>a.response_cost_index-b.response_cost_index)[0];
  const risk=result.stockout_days>0?`${result.stockout_days} días con faltante en el horizonte.`:`cierra con ${result.ending_cover_days} días de inventario.`;
  $('#ops-message').textContent=`${risk} El buffer de ${$('#stock-slider').value} días define cuánto tiempo puede absorber el shock.`;
  $('#proc-message').textContent=`El plan “${selected.label.toLowerCase()}” reasigna capacidad equivalente a ${Math.round(selected.recovery*100)}% de la pérdida modelada.`;
  $('#finance-message').textContent=`${leastCost.plan_label} es el menor costo relativo; ${bestService.plan_label} obtiene el mayor servicio bajo estos supuestos.`;
  const verdict=selectedPlan==='continuity'?`Mayor servicio estimado (${result.service_level_pct.toFixed(1)}%) y el mayor costo relativo (${result.response_cost_index.toFixed(1)}).`:selectedPlan==='lean'?`Menor costo relativo (${result.response_cost_index.toFixed(1)}); acepta más exposición a faltantes.`:`Equilibra servicio (${result.service_level_pct.toFixed(1)}%) y costo relativo (${result.response_cost_index.toFixed(1)}).`;
  $('#agent-verdict').querySelector('span:last-child').textContent=verdict;
}
async function runEpisode(planId,replay=false){
  clearInterval(runTimer);const btn=$('#run-button');btn.disabled=true;$('#run-label').textContent='Calculando escenario…';
  const result=await simulateRequest(activeScenario,planId);activeResult=result;appliedPlan=planId;hasRun=true;currentDay=0;$('#status-label').textContent='EPISODIO EN CURSO';$('#status-dot').parentElement.className='map-status running';$('#outcome-status').textContent='SIMULACIÓN EN CURSO';$('#outcome-status').parentElement.classList.add('active');renderMetrics(result,true);renderTimeline(result,0);renderComparisons(Object.keys(planMeta).map(id=>simulateLocal(activeScenario,id)));renderAgentMessages(result,Object.keys(planMeta).map(id=>simulateLocal(activeScenario,id)));drawMap();updateControls();
  $('#run-label').textContent='Reproduciendo crisis…';let d=0;const step=Math.max(1,Math.ceil(result.horizon_days/55));runTimer=setInterval(()=>{d+=step;currentDay=Math.min(d,result.horizon_days);$('#day-readout').textContent=String(currentDay).padStart(2,'0');renderTimeline(result,currentDay);drawMap();if(currentDay>=result.horizon_days){clearInterval(runTimer);$('#status-label').textContent='EPISODIO COMPLETADO';$('#status-dot').parentElement.className='map-status complete';$('#outcome-status').textContent='EPISODIO COMPLETADO';$('#run-label').textContent='Volver a correr';btn.disabled=false;$('#decision-button').disabled=selectedPlan===appliedPlan;updateControls();toast(replay?'El plan se aplicó al gemelo digital.':'Episodio completado: la red simulada avanzó 30 días.');}},70);
}
function renderMetrics(r,executed){$('#service-value').innerHTML=`${r.service_level_pct.toFixed(1)}<span>%</span>`;$('#shortage-value').textContent=r.stockout_days;$('#backlog-value').textContent=Math.round(r.delayed_demand_index).toLocaleString('es-MX');$('#cost-value').textContent=r.response_cost_index.toFixed(1);$('#service-caption').textContent=executed?'resultado del plan aplicado':'vista previa del plan seleccionado';}
function renderComparisons(runs){
 const svg=d3.select('#compare-chart'),W=420,H=250,m={top:26,right:35,bottom:43,left:47};svg.selectAll('*').remove();
 const costs=runs.map(d=>d.response_cost_index),minCost=Math.min(92,...costs)-2,maxCost=Math.max(110,...costs)+2;
 const x=d3.scaleLinear().domain([minCost,maxCost]).range([m.left,W-m.right]);
 const y=d3.scaleLinear().domain([84,101]).range([H-m.bottom,m.top]);
 const colors={lean:'#9690d9',balanced:'#4b55ff',continuity:'#c98248'};
 svg.append('g').attr('class','chart-grid decision-grid').attr('transform',`translate(${m.left},0)`).call(d3.axisLeft(y).tickValues([85,90,95,100]).tickSize(-(W-m.left-m.right)).tickFormat(''));
 svg.append('g').attr('class','chart-axis').attr('transform',`translate(0,${H-m.bottom})`).call(d3.axisBottom(x).ticks(4).tickFormat(d=>d.toFixed(0)));
 svg.append('g').attr('class','chart-axis').attr('transform',`translate(${m.left},0)`).call(d3.axisLeft(y).tickValues([85,90,95,100]).tickFormat(d=>`${d}%`));
 svg.append('line').attr('class','decision-target').attr('x1',m.left).attr('x2',W-m.right).attr('y1',y(98)).attr('y2',y(98));
 svg.append('text').attr('class','decision-target-label').attr('x',W-m.right).attr('y',y(98)-5).attr('text-anchor','end').text('REFERENCIA 98%');
 svg.append('text').attr('class','decision-axis-title').attr('x',(m.left+W-m.right)/2).attr('y',H-7).attr('text-anchor','middle').text('ÍNDICE DE COSTO · MENOR ES MEJOR');
 const choosePoint=(event,d)=>{event.preventDefault();event.stopPropagation();$(`[data-plan="${d.plan_id}"]`).click();requestAnimationFrame(()=>{const point=document.querySelector(`.decision-point[data-plan="${d.plan_id}"]`);if(point)point.focus();});};
 const groups=svg.append('g').selectAll('g').data(runs).join('g').attr('class',d=>`decision-point ${d.plan_id===selectedPlan?'selected':''}`).attr('data-plan',d=>d.plan_id).attr('tabindex',0).attr('role','button').attr('aria-label',d=>`${d.plan_label}: servicio ${d.service_level_pct} por ciento, costo relativo ${d.response_cost_index}`).on('click',choosePoint).on('keydown',(event,d)=>{if(event.key==='Enter'||event.key===' '){choosePoint(event,d);}});
 groups.append('circle').attr('cx',d=>x(d.response_cost_index)).attr('cy',d=>y(d.service_level_pct)).attr('r',d=>d.plan_id===selectedPlan?8:6).attr('fill',d=>colors[d.plan_id]).attr('class','decision-dot');
 groups.append('text').attr('x',d=>x(d.response_cost_index)+10).attr('y',d=>y(d.service_level_pct)+(d.plan_id==='balanced'?-10:14)).attr('class','decision-point-label').text(d=>`${d.plan_id==='lean'?'Costo':d.plan_id==='balanced'?'Balance':'Servicio'} · ${d.service_level_pct.toFixed(1)}%`);
 groups.append('title').text(d=>`${d.plan_label} — Servicio: ${d.service_level_pct.toFixed(1)}% · Costo relativo: ${d.response_cost_index.toFixed(1)}`);
 svg.append('text').attr('class','decision-insight').attr('x',m.left).attr('y',14).text('Cada punto es una estrategia bajo el mismo choque');
}
function renderTimeline(result,dayCursor){
 const svg=d3.select('#timeline-chart'),W=920,H=264,m={top:20,right:42,bottom:27,left:54},gap=22,laneH=92;svg.selectAll('*').remove();const data=result.daily||[];if(!data.length)return;
 const x=d3.scaleLinear().domain([1,result.horizon_days]).range([m.left,W-m.right]);
 const maxCover=Math.max(8,d3.max(data,d=>d.cover_days)*1.12),maxBacklog=Math.max(100,d3.max(data,d=>d.backlog_units)*1.1);
 const lanes=[{key:'cover_days',label:'COBERTURA · DÍAS',color:'#4b55ff',top:m.top,height:laneH,max:maxCover,format:d=>d.toFixed(0),curve:d3.curveMonotoneX},{key:'backlog_units',label:'PENDIENTE · ÍNDICE',color:'#cb8042',top:m.top+laneH+gap,height:laneH,max:maxBacklog,format:d=>d3.format('~s')(d),curve:d3.curveStepAfter}];
 const shockStart=5,shockEnd=Math.min(result.horizon_days,shockStart+result.disruption_days);
 const xAxis=d3.axisBottom(x).ticks(7).tickFormat(d=>`D${d}`);
 lanes.forEach((lane,index)=>{
   const y=d3.scaleLinear().domain([0,lane.max]).nice().range([lane.top+lane.height,lane.top]);
   svg.append('rect').attr('class','chart-shock').attr('x',x(shockStart)).attr('y',lane.top).attr('width',Math.max(1,x(shockEnd)-x(shockStart))).attr('height',lane.height);
   svg.append('g').attr('class','chart-grid').attr('transform',`translate(${m.left},0)`).call(d3.axisLeft(y).ticks(3).tickSize(-(W-m.left-m.right)).tickFormat(''));
   svg.append('g').attr('class','chart-axis').attr('transform',`translate(${m.left},0)`).call(d3.axisLeft(y).ticks(3).tickFormat(lane.format));
   svg.append('text').attr('class','lane-label').attr('x',m.left+5).attr('y',lane.top+11).text(lane.label);
   if(index===0){svg.append('line').attr('class','chart-threshold').attr('x1',m.left).attr('x2',W-m.right).attr('y1',y(3)).attr('y2',y(3));svg.append('text').attr('class','chart-threshold-label').attr('x',W-m.right-3).attr('y',y(3)-4).attr('text-anchor','end').text('reserva crítica · 3 días');}
   const line=d3.line().x(d=>x(d.day)).y(d=>y(d[lane.key])).curve(lane.curve);
   const area=d3.area().x(d=>x(d.day)).y0(y(0)).y1(d=>y(d[lane.key])).curve(lane.curve);
   svg.append('path').datum(data).attr('class',`lane-area ${index===0?'cover-area':'backlog-area'}`).attr('d',area);
   svg.append('path').datum(data).attr('class',`lane-line ${index===0?'cover-line':'backlog-line-d3'}`).attr('d',line);
   if(dayCursor>0){const d=data[Math.max(0,Math.min(data.length-1,dayCursor-1))];svg.append('line').attr('class','day-cursor').attr('x1',x(dayCursor)).attr('x2',x(dayCursor)).attr('y1',lane.top).attr('y2',lane.top+lane.height);svg.append('circle').attr('cx',x(dayCursor)).attr('cy',y(d[lane.key])).attr('r',4).attr('class',`cursor-dot ${index===0?'cover-dot':'backlog-dot'}`).append('title').text(`Día ${d.day}: ${lane.label.toLowerCase()} ${lane.format(d[lane.key])}`);}
 });
 svg.append('g').attr('class','chart-axis').attr('transform',`translate(0,${H-m.bottom})`).call(xAxis);
 svg.append('text').attr('class','chart-phase').attr('x',x(shockStart)+4).attr('y',m.top+23).text(`INTERRUPCIÓN · ${result.disruption_days} DÍAS`);
}
function updateMapInsight(){
 const value=$('#map-insight-value'),note=$('#map-insight-note'),title=$('#map-insight-title');if(!value)return;
 if(activeScenario==='demand'){title.textContent='INTENSIDAD DEL CHOQUE';value.textContent='+30% demanda';note.textContent='Supuesto de simulación; los orígenes comerciales siguen intactos.';return;}
 title.textContent='VALOR DE ORIGEN EN ESCENARIO';value.textContent=`${(affectedShare()*100).toFixed(1)}%`;
 note.textContent='Participación comercial contextual; no equivale a volumen ni capacidad expuesta.';
}
function drawMap(){
 if(!DATA||!WORLD||!window.d3)return;
 const svg=d3.select('#world-map');svg.selectAll('*').remove();const W=1080,H=470;
 // Pacific-centered view keeps the reporting economies and Mexico in one readable frame.
 projection=d3.geoNaturalEarth1().rotate([-160,0]).scale(225).translate([540,238]);path=d3.geoPath(projection);const g=svg.append('g');mapRoot=g;
 const scenario=scenarioMeta[activeScenario],plan=planMeta[selectedPlan],mx=[-102,23.7];
 const countryNames={Malasia:'Malaysia',China:'China',Vietnam:'Vietnam','Corea del Sur':'South Korea','Estados Unidos':'United States of America','Costa Rica':'Costa Rica',Tailandia:'Thailand',Filipinas:'Philippines',Japón:'Japan',Singapur:'Singapore',Indonesia:'Indonesia','Hong Kong':'Hong Kong',India:'India'};
 const exposedCountries=new Set(DATA.partners.filter(scenario.affected).map(p=>countryNames[p.name]).filter(Boolean));
 const grat=d3.geoGraticule().step([20,15])();g.append('path').datum(grat).attr('class','map-graticule').attr('d',path);
 const countries=WORLD.features.filter(f=>f.properties.name!=='Antarctica');
 g.selectAll('.map-country').data(countries).join('path').attr('class',d=>`map-country${exposedCountries.has(d.properties.name)?' exposed':''}`).attr('d',path).append('title').text(d=>d.properties.name);
 const valueMax=d3.max(DATA.partners,p=>p.usd_millions['2024']),width=d3.scaleSqrt().domain([0,valueMax]).range([1,5.2]);
 const arcSamples=(from,to)=>{const interp=d3.geoInterpolate(from,to);return {type:'LineString',coordinates:d3.range(0,1.001,.018).map(t=>interp(t))}};
 const sources=DATA.partners.filter(p=>p.coordinates&&p.usd_millions['2024']>30);
 const routes=g.append('g').selectAll('path').data(sources).join('path').attr('class',d=>`map-route ${scenario.affected(d)?'affected':''}`).attr('d',d=>path(arcSamples(d.coordinates,mx))).attr('stroke-width',d=>width(d.usd_millions['2024'])).attr('opacity',d=>scenario.affected(d)?.82:.48);
 routes.append('title').text(d=>`${d.name}: ${formatMoney(d.usd_millions['2024'])} · vínculo comercial esquemático, no ruta observada`);
 const nodes=g.append('g').selectAll('g').data(sources).join('g').attr('transform',d=>`translate(${projection(d.coordinates)})`).attr('tabindex',0).attr('role','button').attr('aria-label',d=>`${d.name}: ${formatMoney(d.usd_millions['2024'])} en comercio agregado 2024`).on('pointerenter',(event,d)=>showTip(event,d)).on('pointermove',(event,d)=>showTip(event,d)).on('pointerleave',hideTip).on('focus',function(event,d){showTipFromNode(this,d)}).on('blur',hideTip).on('click',(event,d)=>{event.stopPropagation();showTipFromNode(event.currentTarget,d)});
 nodes.filter(d=>scenario.affected(d)).append('circle').attr('class','map-node-pulse').attr('r',d=>Math.max(6,Math.min(12,4+Math.sqrt(d.usd_millions['2024']/valueMax)*7)));
 nodes.append('circle').attr('r',d=>Math.max(3.5,Math.min(8,3+Math.sqrt(d.usd_millions['2024']/valueMax)*5))).attr('class',d=>`map-node origin ${scenario.affected(d)?'affected':''}`);
 const labelOffsets={'Malasia':[10,15],China:[10,-8],Vietnam:[10,2],'Corea del Sur':[10,-10],'Estados Unidos':[10,-8],'Costa Rica':[10,12],Japón:[10,-5],Tailandia:[10,-6],Filipinas:[10,12]};
 nodes.filter(d=>labelOffsets[d.name]).append('text').attr('class','map-node-label').attr('dx',d=>labelOffsets[d.name][0]).attr('dy',d=>labelOffsets[d.name][1]).text(d=>d.name==='Estados Unidos'?'EE.UU.':d.name==='Corea del Sur'?'Corea':d.name);
 const mxPt=projection(mx),plants=[{name:'Planta Bajío · modelo',coord:[-100.3,20.7]},{name:'Planta norte · modelo',coord:[-106.4,31.7]},{name:'Demanda EE.UU. · modelo',coord:[-98,37]}];
 const internal=g.append('g');plants.forEach(p=>{const pt=projection(p.coord);internal.append('path').attr('class','map-route alternate').attr('d',path({type:'LineString',coordinates:[mx,p.coord]})).attr('stroke-width',1.8).attr('opacity',.9);internal.append('circle').attr('class','map-node model').attr('cx',pt[0]).attr('cy',pt[1]).attr('r',4.4);internal.append('text').attr('class','map-node-label muted').attr('x',pt[0]+8).attr('y',pt[1]-7).text(p.name);});
 g.append('circle').attr('class','map-anchor').attr('cx',mxPt[0]).attr('cy',mxPt[1]).attr('r',17);g.append('circle').attr('class','map-node mx-hub').attr('cx',mxPt[0]).attr('cy',mxPt[1]).attr('r',6);g.append('text').attr('class','map-node-label hub-label').attr('x',mxPt[0]+10).attr('y',mxPt[1]+13).text('MÉXICO · HUB MODELO');
 if(hasRun&&activeResult&&selectedPlan!=='lean'){const alt=DATA.partners.filter(p=>['Estados Unidos','Costa Rica'].includes(p.name)&&p.coordinates);alt.forEach(p=>{g.append('path').attr('class','map-route alternate').attr('d',path(arcSamples(p.coordinates,mx))).attr('stroke-width',1.2+plan.recovery*2.7).attr('opacity',.95);});}
 const agg=DATA.partners.find(p=>p.aggregate);if(agg){svg.append('text').attr('x',20).attr('y',H-13).attr('class','map-node-label muted').text(`* ${agg.name}: ${formatMoney(agg.usd_millions['2024'])} · agregado sin punto geográfico`);}
 updateMapInsight();
}
function showTip(event,d){const tip=$('#map-tooltip'),frame=$('.map-frame').getBoundingClientRect();let x,y;if(event.clientX!==undefined){x=event.clientX-frame.left+10;y=event.clientY-frame.top+10;}else return;paintTip(tip,d,x,y);}
function showTipFromNode(node,d){const rect=node.getBoundingClientRect(),frame=$('.map-frame').getBoundingClientRect();paintTip($('#map-tooltip'),d,rect.left-frame.left+14,rect.top-frame.top+12);}
function paintTip(tip,d,x,y){const val=d.usd_millions['2024'],p=share(d);tip.innerHTML=`<b>${d.name}${d.aggregate?' · socio agregado':''}</b><span>Importaciones MX · HS 8542 · 2024</span><span><strong>${formatMoney(val)}</strong> · ${formatPct(p)} del total</span><span>Valor comercial; no es volumen físico ni proveedor identificado.</span>`;tip.hidden=false;const frame=$('.map-frame');const maxX=frame.clientWidth-225,maxY=frame.clientHeight-105;tip.style.left=Math.max(8,Math.min(maxX,x))+'px';tip.style.top=Math.max(8,Math.min(maxY,y))+'px';}
function hideTip(){$('#map-tooltip').hidden=true;}
function openModal(){$('#about-modal').hidden=false;$('#modal-close').focus()}function closeModal(){$('#about-modal').hidden=true;$('#about-button').focus()}
function toast(message){const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2600)}
init();
