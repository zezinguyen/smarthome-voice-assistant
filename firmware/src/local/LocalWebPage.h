#pragma once

// Trang điều khiển của bản thử (LocalWebServer). Dùng /api/*.
inline constexpr char kLocalWebPage[] = R"html(<!doctype html>
<html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SmartHome IR</title>
<style>
:root{--bg:#f3f5f8;--card:#fff;--text:#1b1f24;--muted:#5f6b7a;--line:#d9dfe7;--accent:#0b6bcb;--accent-fg:#fff;--soft:#e8f1fb;--ok:#1a7f37;--err:#c62828;--warn:#9a6700}
@media (prefers-color-scheme:dark){:root{--bg:#0f1217;--card:#191e25;--text:#e6e9ee;--muted:#9aa5b4;--line:#2b333e;--accent:#4c9bf0;--accent-fg:#0b1422;--soft:#1c2a3a;--ok:#4ac26b;--err:#ff6b6b;--warn:#e3b341}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:720px;margin:0 auto;padding:12px 16px 40px}
header{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:4px 12px;margin:6px 0 12px}
h1{font-size:20px;margin:0}h2{font-size:16px;margin:0 0 10px}h3{font-size:14px;margin:14px 0 6px;color:var(--muted);font-weight:600}
#bar{color:var(--muted);font-size:13px;display:flex;gap:12px;flex-wrap:wrap}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px;margin-bottom:12px}
.muted{color:var(--muted);font-size:13px;margin:4px 0}
button{font:inherit;border:1px solid var(--line);background:transparent;color:var(--text);border-radius:8px;padding:8px 12px;cursor:pointer;min-height:38px}
button:hover{border-color:var(--accent)}button:disabled{opacity:.5;cursor:default}
button.pri{background:var(--accent);border-color:var(--accent);color:var(--accent-fg);font-weight:600}
button.on{background:var(--soft);border-color:var(--accent);color:var(--accent);font-weight:600}
.row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.seg{display:flex;flex-wrap:wrap;gap:6px}
.temp{display:flex;align-items:center;gap:14px;margin:8px 0}
.temp b{font-size:40px;min-width:3ch;text-align:center;font-variant-numeric:tabular-nums}
.temp button{width:48px;height:48px;font-size:22px}
select,input{font:inherit;color:var(--text);background:var(--card);border:1px solid var(--line);border-radius:8px;padding:8px;min-height:38px;max-width:100%}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px}
.key{position:relative}.key button.main{width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.key .del{position:absolute;top:-6px;right:-6px;min-height:0;width:22px;height:22px;padding:0;border-radius:50%;background:var(--card);color:var(--err);font-size:13px;line-height:1;display:none}
.editing .key .del{display:block}
#toast{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);background:var(--text);color:var(--bg);padding:8px 14px;border-radius:8px;font-size:14px;opacity:0;transition:opacity .2s;pointer-events:none;max-width:calc(100% - 32px)}
#toast.show{opacity:1}
.st{font-weight:600}.ok{color:var(--ok)}.err{color:var(--err)}.warn{color:var(--warn)}
code{font-size:13px;background:var(--soft);padding:1px 5px;border-radius:4px;word-break:break-all}
ol{margin:6px 0;padding-left:20px}li{margin:2px 0}
</style></head><body><main>
<header><h1>SmartHome IR · bản thử</h1><div id="bar">Đang tải…</div></header>

<div id="acs"></div>

<section class="card">
<h2>Tìm giao thức cho điều hòa</h2>
<p class="muted">Funiki không có sẵn trong thư viện IR, mỗi dòng máy dùng lại giao thức của một hãng khác. Dùng một trong hai cách dưới đây, tìm được thì bấm "Dùng giao thức này".</p>
<h3>Cách 1 · Thử lần lượt (không cần remote)</h3>
<p class="muted">Hướng mạch vào điều hòa. Mỗi lần bấm "Gửi", mạch phát lệnh <b>Bật · Làm lạnh · 25°C</b> theo một giao thức. Máy kêu bíp hoặc bật lên là đúng.</p>
<div class="row"><select id="scanSel" aria-label="Giao thức thử"></select>
<button class="pri" id="scanSend">Gửi</button><button id="scanNext">Thử cái tiếp ›</button>
<button id="scanUse">Dùng giao thức này</button></div>
<p class="muted" id="scanMsg"></p>
<h3>Cách 2 · Dò bằng remote thật</h3>
<ol class="muted"><li>Bấm "Bắt đầu nghe" bên dưới (phần Học phím).</li><li>Chĩa remote Funiki vào mắt thu của mạch, bấm một nút bất kỳ.</li><li>Trang hiện tên giao thức nhận ra; nếu điều khiển được, nút "Dùng cho điều hòa" sẽ hiện.</li></ol>
</section>

<section class="card">
<h2>Học phím từ remote</h2>
<p class="muted">Mỗi phím bấm 2 lần, 2 lần phải ra cùng một mã. Remote điều hòa gửi cả trạng thái mỗi lần bấm, nên chọn nút không làm đổi trạng thái: VD để remote ở 16°C rồi bấm nút giảm nhiệt độ 2 lần.</p>
<div class="row"><button class="pri" id="learnBtn">Bắt đầu nghe</button><button id="learnCancel">Huỷ</button></div>
<p class="st" id="learnSt"></p>
<div id="learnRes" hidden>
<p class="muted" id="learnInfo"></p>
<div class="row"><input id="keyName" maxlength="32" placeholder="Tên phím, VD: Bật 16 độ" aria-label="Tên phím">
<select id="keyDev" aria-label="Lưu vào thiết bị"></select><button class="pri" id="keySave">Lưu phím</button></div>
</div>
<div class="row" id="detRow" hidden style="margin-top:8px"><span id="detText"></span><button id="detUse">Dùng cho điều hòa</button></div>
</section>

<div id="devs"></div>
<div id="toast" role="status"></div>
</main><script>
const $=id=>document.getElementById(id);
const MODES=[['cool','Lạnh'],['heat','Sưởi'],['dry','Khô'],['fan','Quạt'],['auto','Tự động']];
const FANS=[['auto','Tự động'],['low','Thấp'],['medium','Vừa'],['high','Cao']];
const STATUS={idle:'',waiting:'Đang nghe… chĩa remote vào mạch và bấm phím (15 giây)',first:'Đã thu lần 1, bấm lại đúng phím đó lần nữa',mismatch:'2 lần bấm không khớp, bấm lại từ đầu',ok:'Đã học xong',failed:'Học thất bại (lệch quá nhiều lần)',timeout:'Hết thời gian chờ'};
let profile={devices:{}},protos={candidates:[],all:[]},version=-1,learnActive=false,acState={};
function toast(t,bad){const e=$('toast');e.textContent=t;e.style.color=bad?'var(--err)':'';e.classList.add('show');clearTimeout(e._t);e._t=setTimeout(()=>e.classList.remove('show'),2200)}
async function api(path,body){
  try{const r=await fetch(path,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    return await r.json()}catch(e){return {ok:false,error:'Mất kết nối tới mạch'}}
}
const ERR={E_BUSY:'Mạch đang học lệnh',E_CMD_NOT_FOUND:'Không có lệnh này',E_IR_SEND_FAIL:'Phát IR lỗi',E_PROTOCOL:'Giao thức không hỗ trợ',E_SAVE_FAILED:'Không lưu được',E_BAD_REQUEST:'Dữ liệu không hợp lệ',E_NO_CAPTURE:'Chưa học được mã nào'};
const errText=e=>ERR[e]||e||'Lỗi';
function load(k,d){try{return JSON.parse(localStorage.getItem(k))||d}catch(e){return d}}
function store(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}
function el(tag,attrs,...kids){const e=document.createElement(tag);
  for(const [k,v] of Object.entries(attrs||{})){if(k==='dataset')Object.assign(e.dataset,v);else if(k==='style'||k.includes('-'))e.setAttribute(k,v);else e[k]=v}
  e.append(...kids);return e}

function protoOptions(sel,current){
  sel.innerHTML='';
  const g1=el('optgroup',{label:'Hay gặp ở máy OEM'}),g2=el('optgroup',{label:'Tất cả'});
  protos.candidates.forEach(p=>g1.append(el('option',{value:p,textContent:p})));
  protos.all.filter(p=>!protos.candidates.includes(p)).forEach(p=>g2.append(el('option',{value:p,textContent:p})));
  sel.append(g1,g2);if(current)sel.value=current;
}
function acDevices(){const entries=Object.entries(profile.devices||{}).filter(([,d])=>d.irac_protocol);
  return entries.length>1&&entries.some(([k])=>k==='ac_funiki')?entries.filter(([k])=>k!=='ac_living'):entries}
function keyDevices(){return Object.entries(profile.devices||{}).filter(([,d])=>!d.irac_protocol)}

function renderAc(){
  const box=$('acs');box.innerHTML='';
  acDevices().forEach(([id,d])=>{
    const s=acState[id]||(acState[id]=load('ac:'+id,{power:false,temp:24,mode:'cool',fan:'auto'}));
    const min=(d.limits&&d.limits.temp_min)||16,max=(d.limits&&d.limits.temp_max)||30;
    const sel=el('select',{'aria-label':'Giao thức'});protoOptions(sel,d.irac_protocol);
    sel.onchange=async()=>{const r=await api('/api/ac/protocol',{deviceId:id,protocol:sel.value});if(r.ok)d.irac_protocol=sel.value;toast(r.ok?'Đã đổi sang '+sel.value:errText(r.error),!r.ok)};
    const t=el('b',{textContent:s.temp});
    const send=async(power,act,extra={})=>{s.power=power;store('ac:'+id,s);paint();
      const r=await api('/api/command',{deviceId:id,action:act||(power?'SET':'POWER_OFF'),params:{power:s.power,temp:s.temp,mode:s.mode,fan:s.fan,...extra}});
      toast(r.ok?(act==='SYNC_POWER'?'Đã đồng bộ trạng thái '+(s.power?'Đang Bật':'Đã Tắt')+' (không phát IR)':(s.power?'Đã gửi: '+s.temp+'°C · '+label(MODES,s.mode)+' · quạt '+label(FANS,s.fan).toLowerCase():'Đã gửi: Tắt')):errText(r.error),!r.ok)};
    let timer;const later=()=>{const keep=Boolean(s.power);clearTimeout(timer);timer=setTimeout(()=>send(true,'SET',{keepPower:keep}),350)};
    const on=el('button',{textContent:'Bật',onclick:()=>send(true,'POWER_ON',{forceToggle:true})}),off=el('button',{textContent:'Tắt',onclick:()=>send(false,'POWER_OFF',{forceToggle:true})});
    const sync=el('button',{textContent:'⇄ Đồng bộ',title:'Khớp lại trạng thái Bật/Tắt khi vừa bấm remote vật lý (không phát IR)',onclick:()=>send(!s.power,'SYNC_POWER')});
    const down=el('button',{textContent:'−','aria-label':'Giảm nhiệt độ',onclick:()=>{if(s.temp>min){s.temp--;paint();later()}}});
    const up=el('button',{textContent:'+','aria-label':'Tăng nhiệt độ',onclick:()=>{if(s.temp<max){s.temp++;paint();later()}}});
    const segs=(list,key)=>{const w=el('div',{className:'seg'});list.forEach(([v,n])=>w.append(el('button',{textContent:n,onclick:()=>{s[key]=v;paint();later()},dataset:{v}})));w.dataset.key=key;return w};
    const modeSeg=segs(MODES,'mode'),fanSeg=segs(FANS,'fan');
    function paint(){t.textContent=s.temp;on.className=s.power?'on':'';off.className=s.power?'':'on';
      [modeSeg,fanSeg].forEach(w=>[...w.children].forEach(b=>b.className=b.dataset.v===s[w.dataset.key]?'on':''))}
    paint();
    box.append(el('section',{className:'card'},
      el('div',{className:'row',style:'justify-content:space-between'},el('h2',{textContent:d.name||id,style:'margin:0'}),sel),
      el('div',{className:'temp'},down,t,el('span',{textContent:'°C',className:'muted'}),up,el('div',{className:'row',style:'margin-left:auto'},on,off,sync)),
      el('h3',{textContent:'Chế độ'}),modeSeg,el('h3',{textContent:'Quạt'}),fanSeg,
      el('p',{className:'muted',textContent:'Hỗ trợ điều hòa âm trần Toggle nguồn (DAIKIN64 BRC52A62): đổi nhiệt độ/chế độ không làm tắt máy. Nếu vừa bấm remote thật, bấm "⇄ Đồng bộ".'})));
  });
}
const label=(list,v)=>(list.find(x=>x[0]===v)||[,v])[1];

function renderKeys(){
  const box=$('devs');box.innerHTML='';
  keyDevices().forEach(([id,d])=>{
    const grid=el('div',{className:'grid'});
    Object.keys(d.commands||{}).forEach(name=>{
      grid.append(el('div',{className:'key'},
        el('button',{className:'main',textContent:name,title:name,onclick:async()=>{const r=await api('/api/command',{deviceId:id,action:name});toast(r.ok?'Đã gửi '+name:errText(r.error),!r.ok)}}),
        el('button',{className:'del',textContent:'✕','aria-label':'Xoá '+name,onclick:async()=>{if(!confirm('Xoá phím "'+name+'"?'))return;const r=await api('/api/button/delete',{deviceId:id,name});toast(r.ok?'Đã xoá':errText(r.error),!r.ok);refresh(true)}})))});
    if(!grid.children.length)grid.append(el('p',{className:'muted',textContent:'Chưa có phím nào.'}));
    const card=el('section',{className:'card'});
    const edit=el('button',{textContent:'Sửa',onclick:()=>{card.classList.toggle('editing');edit.textContent=card.classList.contains('editing')?'Xong':'Sửa'}});
    card.append(el('div',{className:'row',style:'justify-content:space-between;margin-bottom:10px'},el('h2',{textContent:d.name||id,style:'margin:0'}),edit),grid);
    box.append(card)});
  const sel=$('keyDev'),cur=sel.value;sel.innerHTML='';
  const ids=keyDevices().map(([id])=>id);if(!ids.includes('remote_hoc'))ids.unshift('remote_hoc');
  ids.forEach(id=>sel.append(el('option',{value:id,textContent:(profile.devices[id]&&profile.devices[id].name)||'Phím đã học'})));
  if(ids.includes(cur))sel.value=cur;
}

// --- Thử lần lượt ---
function scanMsg(t,c){const m=$('scanMsg');m.textContent=t;m.className='muted '+(c||'')}
$('scanSend').onclick=async()=>{const p=$('scanSel').value;scanMsg('Đang gửi '+p+'…');
  const r=await api('/api/ac/try',{protocol:p,power:true,temp:25,mode:'cool',fan:'auto'});
  scanMsg(r.ok?'Đã gửi '+p+'. Máy có phản hồi không? Không thì bấm "Thử cái tiếp".':errText(r.error),r.ok?'':'err')};
$('scanNext').onclick=()=>{const s=$('scanSel');const opts=[...s.options];const i=opts.findIndex(o=>o.value===s.value);
  if(i+1<opts.length){s.value=opts[i+1].value;$('scanSend').onclick()}else scanMsg('Đã thử hết danh sách','warn')};
async function useProtocol(p){const ac=acDevices()[0];if(!ac){toast('Chưa có điều hòa trong profile',true);return}
  const r=await api('/api/ac/protocol',{deviceId:ac[0],protocol:p});toast(r.ok?'Điều hòa dùng '+p:errText(r.error),!r.ok);refresh(true)}
$('scanUse').onclick=()=>useProtocol($('scanSel').value);

// --- Học / dò ---
$('learnBtn').onclick=async()=>{const r=await api('/api/learn',{});if(!r.ok)toast(errText(r.error),true);poll()};
$('learnCancel').onclick=async()=>{await api('/api/learn/cancel',{});poll()};
$('keySave').onclick=async()=>{const name=$('keyName').value.trim();if(!name){toast('Nhập tên phím',true);return}
  const r=await api('/api/learn/save',{deviceId:$('keyDev').value,name});toast(r.ok?'Đã lưu phím '+name:errText(r.error),!r.ok);
  if(r.ok){$('keyName').value='';refresh(true)}};
$('detUse').onclick=()=>useProtocol($('detUse').dataset.p);

function renderLearn(l){
  learnActive=l.active;$('learnBtn').disabled=l.active;$('learnCancel').disabled=!l.active;
  const st=$('learnSt');st.textContent=STATUS[l.status]||'';st.className='st '+(l.status==='ok'?'ok':['failed','timeout','mismatch'].includes(l.status)?'err':'');
  const has=l.protocol!==undefined;$('learnRes').hidden=!has;
  if(has)$('learnInfo').textContent=l.protocol==='UNKNOWN'?'Mã dạng raw, '+l.rawLength+' xung':'Giao thức '+l.protocol+', mã '+l.code+' ('+l.bits+' bit)';
  const det=$('detRow');det.hidden=!l.detected;
  if(l.detected){$('detText').innerHTML='';$('detText').append('Remote dùng giao thức ',el('code',{textContent:l.detected}),l.acSupported?'':' (không điều khiển điều hòa trực tiếp được — hãy học từng phím)');
    $('detUse').hidden=!l.acSupported;$('detUse').dataset.p=l.detected}
}

async function refresh(force){
  let s;try{s=await (await fetch('/api/state')).json()}catch(e){$('bar').textContent='Mất kết nối tới mạch';return}
  $('bar').innerHTML='';
  $('bar').append(el('span',{textContent:'http://'+s.host+' · '+s.ip}),el('span',{textContent:'WiFi '+s.rssi+' dBm'}),
    el('span',{textContent:(s.usb?'🔌 ':'🔋 ')+s.battery+'% · '+(s.batteryMv/1000).toFixed(2)+'V'+(s.charging?' (đang sạc)':''),title:'Lần đo gần nhất (chưa lọc): '+s.batteryRawMv+' mV'}),el('span',{textContent:'v'+s.firmware}));
  renderLearn(s.learn);
  if(force||s.profileVersion!==version){version=s.profileVersion;profile=await api('/api/profile');if(!profile.devices)profile.devices={};renderAc();renderKeys()}
}
let pollTimer;function poll(){clearTimeout(pollTimer);refresh().finally(()=>pollTimer=setTimeout(poll,learnActive?800:4000))}
(async()=>{protos=await api('/api/protocols');if(!protos.all)protos={candidates:[],all:[]};
  protoOptions($('scanSel'),protos.candidates[0]);poll()})();
</script></body></html>)html";
