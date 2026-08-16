'use strict';

const AMO_BASE = 'https://ksocm66.amocrm.ru/leads/detail/';
const PACKAGE_VERSION = 'v8.2.10.0848';
const AMO_EXEC_URL_STORAGE_KEY = 'leadbridge.amocrm.execUrl';
const state = {
  maxRaw:null, amoRaw:null,
  maxRows:[], amoRows:[], groups:[], filtered:[],
  maxFileName:'', amoFileName:'',
  amoSourceMode:'offline', amoSourceKind:'none', amoOnlineController:null, amoCacheMeta:null, amoCacheLoading:false, amoLoadedAt:0, amoDeleteArmedUntil:0,
  imageFiles:new Map(), imageObjectUrls:new Map(), imageFolderName:'', imageKeyCounts:new Map(), activeView:'sources', expectedZipName:'MAX_CHAT_EXPORT_1201msg_1166att_23-06-26_01-11.zip', expectedZipPath:'C:\\LeadBridgeKSO\\exports\\MAX_CHAT_EXPORT_1201msg_1166att_23-06-26_01-11.zip',
  mobileRenderLimit: Infinity,
};

const $ = (id)=>document.getElementById(id);
const esc = LeadBridgeSecurity.escapeHtml;
const escAttr = (s)=>esc(s).replace(/'/g,'&#39;');
const clean = (s)=>String(s ?? '').replace(/^[\s'"`]+|[\s'"`]+$/g,'').trim();
const lowerKey = (s)=>String(s ?? '').toLowerCase().replace(/ё/g,'е').replace(/[^a-zа-я0-9]+/g,' ').trim();
const compactKey = (s)=>lowerKey(s).replace(/\s+/g,'');
const safeAmoUrl = (value)=>LeadBridgeSecurity.safeHttpsUrl(value, ['amocrm.ru']);
const MAX_LOG_LINES = 250;
const MAX_LOG_CHARS = 40000;

function logLine(text){
  const el = $('loader'); el.classList.remove('hidden');
  const time = new Date().toLocaleTimeString('ru-RU');
  el.textContent += `[${time}] ${text}\n`;
  el.textContent=LeadBridgeSecurity.boundedLogText(el.textContent,MAX_LOG_CHARS,MAX_LOG_LINES);
  el.scrollTop = el.scrollHeight;
}
function setNotice(text, bad=false){
  const notice = $('notice');
  notice.className = bad ? 'notice bad' : 'notice';
  const title = $('noticeTitle');
  const copy = $('noticeCopy');
  if(title && copy){
    title.textContent = bad ? 'Внимание' : 'Загрузки';
    copy.textContent = text;
  }else{
    notice.textContent = text;
  }
}
function repoAssetUrl(path){
  const value = String(path || '');
  if(!value) return '';
  if(/^(https?:|file:|data:)/i.test(value)) return value;
  const prefix = location.pathname.includes('/apps/leadbridge-web/') ? '../../' : '';
  return new URL(prefix + value.replace(/^\/+/, ''), location.href).href;
}
function detectPlatform(){
  const ua = navigator.userAgent || '';
  const platform = navigator.platform || '';
  if(/Win/i.test(platform) || /Windows/i.test(ua)) return 'windows';
  if(/Mac/i.test(platform) || /Mac OS X/i.test(ua)) return 'macos';
  return 'macos';
}
const MB = 1024 * 1024;
function isMobileConstrained(){
  return window.matchMedia('(max-width: 820px)').matches || (window.matchMedia('(pointer: coarse)').matches && window.matchMedia('(max-width: 960px)').matches);
}
function mobileInitialRenderLimit(){ return isMobileConstrained() ? 50 : Infinity; }
function formatBytes(bytes){
  const n = Number(bytes || 0);
  if(n >= 1024 * MB) return `${(n / (1024 * MB)).toFixed(1)} GB`;
  if(n >= MB) return `${(n / MB).toFixed(1)} MB`;
  if(n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}
function mobileBudget(kind){
  const lowMemory = Number(navigator.deviceMemory || 0) > 0 && Number(navigator.deviceMemory || 0) <= 4;
  const budgets = lowMemory
    ? {max:{soft:12*MB, hard:25*MB}, amo:{soft:10*MB, hard:20*MB}, zip:{soft:60*MB, hard:120*MB}}
    : {max:{soft:20*MB, hard:40*MB}, amo:{soft:15*MB, hard:30*MB}, zip:{soft:100*MB, hard:180*MB}};
  return budgets[kind] || budgets.max;
}
function mobileFileLabel(kind){
  if(kind === 'amo') return 'amoCRM CSV';
  if(kind === 'zip') return 'ZIP MAX';
  return 'MAX JSON/CSV';
}
function checkMobileFileBudget(kind, file){
  if(!isMobileConstrained() || !file) return true;
  const budget = mobileBudget(kind);
  const label = mobileFileLabel(kind);
  if(kind === 'amo' && file.size > budget.hard){
    const ok = window.confirm(`${label} весит ${formatBytes(file.size)}. Прочитаю CSV чанками внутри браузера, без загрузки на сервер. На смартфоне это может занять время. Продолжить?`);
    if(ok) setNotice(`${label} будет прочитан чанками: ${formatBytes(file.size)}. Не закрывай вкладку до завершения.`);
    return ok;
  }
  if(file.size > budget.hard){
    setNotice(`${label} слишком большой для смартфона: ${formatBytes(file.size)}. Чтобы не завис браузер, открой этот файл на компьютере или раздели выгрузку на части.`, true);
    return false;
  }
  if(file.size > budget.soft){
    if(kind === 'amo') return window.confirm(`${label} весит ${formatBytes(file.size)}. Прочитать CSV чанками внутри браузера?`);
    return window.confirm(`${label} весит ${formatBytes(file.size)}. На смартфоне браузер может закрыть вкладку при чтении такого файла. Продолжить?`);
  }
  return true;
}
function checkMobileFolderBudget(fileList){
  if(!isMobileConstrained()) return true;
  const files = [...fileList].filter(f=>/\.(png|jpe?g|webp|gif|bmp|tiff?)$/i.test(f.name || f.webkitRelativePath || ''));
  const total = files.reduce((sum,f)=>sum+(f.size||0),0);
  const lowMemory = Number(navigator.deviceMemory || 0) > 0 && Number(navigator.deviceMemory || 0) <= 4;
  const hardFiles = lowMemory ? 700 : 1200;
  const hardBytes = lowMemory ? 90 * MB : 180 * MB;
  const softFiles = lowMemory ? 350 : 650;
  const softBytes = lowMemory ? 45 * MB : 100 * MB;
  if(files.length > hardFiles || total > hardBytes){
    setNotice(`Папка attachments слишком тяжёлая для смартфона: ${files.length} картинок, ${formatBytes(total)}. Для превью и HTML-отчёта выбери меньший набор или работай с компьютера.`, true);
    return false;
  }
  if(files.length > softFiles || total > softBytes){
    return window.confirm(`В папке ${files.length} картинок на ${formatBytes(total)}. На смартфоне это может занять много памяти. Продолжить?`);
  }
  return true;
}
function setMobileMode(){
  document.body.classList.toggle('mobile-device', isMobileConstrained());
  syncFixedTop();
}
function renderReleaseHint(manifest){
  const box = $('releaseHint');
  if(!box || !manifest) return;
  const os = detectPlatform();
  const labels = {macos:'macOS', windows:'Windows'};
  const tools = manifest.downloads && manifest.downloads.tools && manifest.downloads.tools[os];
  const fullProject = manifest.downloads && manifest.downloads.full_project;
  const nativeDmg = os === 'macos' && manifest.downloads && manifest.downloads.native_apps && manifest.downloads.native_apps.macos_dmg;
  const nativeSetup = os === 'windows' && manifest.downloads && manifest.downloads.native_apps && manifest.downloads.native_apps.windows_setup;
  const hasNativeApp = (nativeDmg && nativeDmg.download_url) || (nativeSetup && nativeSetup.download_url);
  if((!tools || !tools.download_url) && (!fullProject || !fullProject.download_url) && !hasNativeApp) return;

  box.textContent = '';
  const row = document.createElement('div');
  row.className = 'release-row';
  const copy = document.createElement('div');
  copy.className = 'release-copy';
  const title = document.createElement('div');
  title.className = 'release-title';
  title.textContent = nativeSetup && nativeSetup.download_url
    ? `Дополнительное приложение LeadBridge KSO ${manifest.package_version || PACKAGE_VERSION} для Windows`
    : nativeDmg && nativeDmg.download_url
    ? `Дополнительное приложение LeadBridge KSO ${manifest.package_version || PACKAGE_VERSION} для macOS`
    : tools && tools.download_url
    ? `Пакет тулзов LeadBridge KSO ${manifest.package_version || PACKAGE_VERSION} для ${labels[os] || 'вашей ОС'}`
    : `LeadBridge KSO ${manifest.package_version || PACKAGE_VERSION}`;
  const details = document.createElement('div');
  details.className = 'small muted';
  details.textContent = nativeSetup && nativeSetup.download_url
    ? 'OCR уже работает прямо в расширении Chrome без установки. EXE нужен только для отдельной локальной программы и нативного ускорения.'
    : nativeDmg && nativeDmg.download_url
    ? 'OCR уже работает прямо в расширении Chrome без установки. DMG нужен только для отдельного окна LeadBridge; tools pack оставлен для ручной и профессиональной установки.'
    : tools && tools.download_url
    ? 'Для обычной работы достаточно расширения Chrome и LeadBridge. Tools pack нужен только для ручной установки дополнительных инструментов.'
    : 'Полный архив содержит Web/PWA, установщики, интеграцию, нативные исходники и актуальные пакеты.';
  copy.append(title, details);

  const actions = document.createElement('div');
  actions.className = 'release-actions';
  if(nativeSetup && nativeSetup.download_url){
    const setupDownload = document.createElement('a');
    setupDownload.className = 'btn primary';
    setupDownload.href = repoAssetUrl(nativeSetup.download_url);
    setupDownload.target = '_blank';
    setupDownload.rel = 'noopener';
    setupDownload.textContent = 'EXE (необязательно)';
    actions.append(setupDownload);
  }
  if(nativeDmg && nativeDmg.download_url){
    const dmgDownload = document.createElement('a');
    dmgDownload.className = 'btn primary';
    dmgDownload.href = repoAssetUrl(nativeDmg.download_url);
    dmgDownload.target = '_blank';
    dmgDownload.rel = 'noopener';
    dmgDownload.textContent = 'DMG (необязательно)';
    actions.append(dmgDownload);
  }
  if(tools && tools.download_url){
    const download = document.createElement('a');
    download.className = hasNativeApp ? 'btn' : 'btn primary';
    download.href = repoAssetUrl(tools.download_url);
    download.target = '_blank';
    download.rel = 'noopener';
    download.textContent = `Tools pack для ${labels[os] || 'ОС'}`;
    actions.append(download);
  }
  if(fullProject && fullProject.download_url){
    const fullDownload = document.createElement('a');
    fullDownload.className = 'btn cyan';
    fullDownload.href = repoAssetUrl(fullProject.download_url);
    fullDownload.target = '_blank';
    fullDownload.rel = 'noopener';
    fullDownload.textContent = 'Полный проект ZIP';
    actions.append(fullDownload);
  }

  row.append(copy, actions);
  box.append(row);
  box.classList.remove('hidden');
  syncFixedTop();
}
async function checkReleaseManifest(){
  if(!window.fetch) return;
  try{
    const res = await fetch(repoAssetUrl('releases/manifest.json'), {cache:'no-store'});
    if(!res.ok) return;
    const manifest = await res.json();
    renderReleaseHint(manifest);
    const buildMeta = $('buildMeta');
    if(buildMeta && manifest.git_commit) buildMeta.textContent = `Build commit: ${String(manifest.git_commit).slice(0, 12)}`;
  } catch (err) {
    console.info('LeadBridge release manifest is unavailable', err);
  }
}
function setAppView(view, {focus=false, scrollTop=false}={}){
  const next = view === 'results' ? 'results' : 'sources';
  state.activeView = next;
  document.body.dataset.activeView = next;
  ['sources','results'].forEach(name=>{
    const selected = name === next;
    const tab = $(`${name}Tab`);
    const panel = $(`${name}View`);
    if(tab){
      tab.classList.toggle('active', selected);
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    }
    if(panel){
      panel.setAttribute('aria-hidden', String(!selected));
      if('inert' in panel) panel.inert = !selected;
    }
  });
  if(focus) $(`${next}Tab`)?.focus({preventScroll:true});
  syncFixedTop();
  if(scrollTop) requestAnimationFrame(()=>window.scrollTo({top:0, left:0, behavior:'auto'}));
}
function handleAppTabKeydown(event){
  const tab = event.target.closest('[role="tab"][data-view]');
  if(!tab || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
  event.preventDefault();
  let next = tab.dataset.view;
  if(event.key === 'ArrowLeft' || event.key === 'Home') next = 'sources';
  if(event.key === 'ArrowRight' || event.key === 'End') next = 'results';
  setAppView(next, {focus:true});
}

function normalizePhone(raw){
  return LeadBridgeSecurity.normalizePhone(raw);
}

function extractPhonesFromText(text){
  return LeadBridgeSecurity.extractPhonesFromText(text);
}

function parseMaybeDate(raw){
  const s = clean(raw);
  if (!s || /не закрыта/i.test(s)) return null;
  let m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return new Date(+m[3], +m[2]-1, +m[1], +(m[4]||0), +(m[5]||0), +(m[6]||0));
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return new Date(+m[1], +m[2]-1, +m[3], +(m[4]||0), +(m[5]||0), +(m[6]||0));
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t) : null;
}
function dateKey(raw){ const d=parseMaybeDate(raw); return d ? d.getTime() : 0; }
function formatDate(raw){
  const d = parseMaybeDate(raw); if (!d) return clean(raw);
  return d.toLocaleString('ru-RU', {year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).replace(',', '');
}
function latestByCreated(rows){
  return rows.slice().sort((a,b)=>(b.createdAtMs||0)-(a.createdAtMs||0))[0] || null;
}
function latestByVisitThenCreated(rows){
  return rows.slice().sort((a,b)=>{
    const vd=(b.visitDateMs||0)-(a.visitDateMs||0);
    if(vd) return vd;
    return (b.createdAtMs||0)-(a.createdAtMs||0);
  })[0] || null;
}
function isDateInCurrentMonth(raw){
  const d = parseMaybeDate(raw);
  if(!d) return false;
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}
function visitDistanceDays(raw){
  const d = parseMaybeDate(raw);
  if(!d) return Number.POSITIVE_INFINITY;
  const now = new Date();
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.abs(Math.round((a-b)/86400000));
}
function bestCurrentMonthVisit(rows){
  return rows.filter(r=>isDateInCurrentMonth(r.visitDate)).slice().sort((a,b)=>{
    const dd = visitDistanceDays(a.visitDate) - visitDistanceDays(b.visitDate);
    if(dd) return dd;
    const vd = (b.visitDateMs||0) - (a.visitDateMs||0);
    if(vd) return vd;
    return (b.createdAtMs||0) - (a.createdAtMs||0);
  })[0] || null;
}
function dealIsClosed(r){
  const c = clean(r && r.closedAt);
  if(!c || /не\s*закрыта/i.test(c)) return false;
  return true;
}
function dealIsWorkCandidate(r){
  return r && !r.isExcludedCloseReason && !dealIsClosed(r);
}

function parseCsv(text){
  return LeadBridgeCsv.parseCsv(text, clean);
}
function headerIndexes(headers, names){
  const wanted = names.map(compactKey);
  const idx=[];
  headers.forEach((h,i)=>{ if(wanted.includes(compactKey(h))) idx.push(i); });
  return idx;
}
function safeCell(row, index){ return clean(row && row.__cells ? row.__cells[index] : ''); }
function rowGet(parsed, row, names, fallbackIndexes=[]){
  const idxs = [...headerIndexes(parsed.headers, Array.isArray(names)?names:[names]), ...fallbackIndexes];
  for(const i of idxs){ const v=clean(row.__cells?.[i]); if(v) return v; }
  return '';
}
function rowGetAllPhoneValues(parsed, row, fallbackIndexes=[]){
  const vals=[];
  parsed.headers.forEach((h,i)=>{
    const k=compactKey(h);
    if(k.includes('телефон') || k.includes('phone')) vals.push(clean(row.__cells?.[i]));
  });
  fallbackIndexes.forEach(i=> vals.push(clean(row.__cells?.[i])));
  return vals.filter(Boolean);
}

function findHeaderIndexExact(parsed, names, fallbackIndex=null){
  const wanted = (Array.isArray(names)?names:[names]).map(compactKey);
  const cacheKey = wanted.join('|') + '::' + String(fallbackIndex);
  if(!parsed.__exactIndexCache) parsed.__exactIndexCache = new Map();
  if(parsed.__exactIndexCache.has(cacheKey)) return parsed.__exactIndexCache.get(cacheKey);
  for(let i=0;i<(parsed.headers||[]).length;i++){
    if(wanted.includes(compactKey(parsed.headers[i]))){
      parsed.__exactIndexCache.set(cacheKey, i);
      return i;
    }
  }
  parsed.__exactIndexCache.set(cacheKey, fallbackIndex);
  return fallbackIndex;
}
function rowGetExact(parsed, row, names, fallbackIndex=null){
  const idx = findHeaderIndexExact(parsed, names, fallbackIndex);
  return idx === null || idx === undefined ? '' : safeCell(row, idx);
}
function debugColumnSample(parsed, rows, label, idx){
  const samples=[];
  if(idx !== null && idx !== undefined){
    for(const r of rows){ const v=safeCell(r,idx); if(v){ samples.push(v); if(samples.length>=5) break; } }
  }
  logLine(`${label}: col=${idx===null||idx===undefined?'not_found':idx}, header=${idx===null||idx===undefined?'':clean(parsed.headers[idx])}, samples=${samples.join(' | ')}`);
}

async function readFile(file){ return await file.text(); }
async function readBlobArrayBuffer(blob){
  if(blob.arrayBuffer) return await blob.arrayBuffer();
  return await new Promise((resolve,reject)=>{
    const reader = new FileReader();
    reader.onload = ()=>resolve(reader.result);
    reader.onerror = ()=>reject(reader.error || new Error('не удалось прочитать файл'));
    reader.readAsArrayBuffer(blob);
  });
}
async function readBlobText(blob){
  if(blob.text) return await blob.text();
  if(typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(await readBlobArrayBuffer(blob));
  return await new Promise((resolve,reject)=>{
    const reader = new FileReader();
    reader.onload = ()=>resolve(String(reader.result || ''));
    reader.onerror = ()=>reject(reader.error || new Error('не удалось прочитать текст'));
    reader.readAsText(blob);
  });
}
function csvStreamChunkSize(){
  return isMobileConstrained() ? 512 * 1024 : 2 * MB;
}
async function* fileTextChunks(file, chunkSize){
  const decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8') : null;
  let offset = 0;
  while(offset < file.size){
    const end = Math.min(file.size, offset + chunkSize);
    const blob = file.slice(offset, end);
    let text;
    if(decoder){
      text = decoder.decode(await readBlobArrayBuffer(blob), {stream:end < file.size});
    } else {
      text = await readBlobText(blob);
    }
    yield {text, loaded:end, total:file.size};
    offset = end;
    await sleep(0);
  }
  if(decoder){
    const tail = decoder.decode();
    if(tail) yield {text:tail, loaded:file.size, total:file.size};
  }
}
function shouldStreamAmoFile(file){
  if(!file) return false;
  const name = String(file.name || '').toLowerCase();
  return (name.endsWith('.csv') || name.endsWith('.txt')) && (isMobileConstrained() || file.size > 20 * MB);
}
async function normalizeAmoCsvFile(file){
  return await normalizeAmoCsvChunks(fileTextChunks(file, csvStreamChunkSize()), file.name, file.size);
}
async function normalizeAmoCsvChunks(chunks, sourceLabel, totalBytes=0){
  const parsed = {headers:[], delimiter:','};
  const rows = [];
  const debugRows = [];
  let seen = 0;
  let lastPct = -10;
  let lastLoggedBytes = 0;
  logLine(`amocrm_csv_stream: start ${escLog(sourceLabel)}, size=${totalBytes ? formatBytes(totalBytes) : 'unknown'}`);
  await LeadBridgeCsv.parseCsvChunks(chunks, {
    onHeaders(headers, delimiter){
      parsed.headers = headers;
      parsed.delimiter = delimiter;
      assertAmoSchema(parsed);
      logLine(`amocrm_csv_stream: delimiter=${JSON.stringify(delimiter)}, cols=${headers.length}`);
    },
    onRow(row, i){
      seen++;
      if(debugRows.length < 80) debugRows.push(row);
      const normalized = normalizeAmoRow(parsed, row, i, {keepRaw:false});
      if(normalized.id || normalized.phones.length || normalized.fullName) rows.push(normalized);
    },
    onProgress({loaded,total,rows:parsedRows}){
      const effectiveTotal = total || totalBytes;
      const pct = effectiveTotal ? Math.floor((loaded / effectiveTotal) * 100) : 0;
      if(effectiveTotal && (pct >= lastPct + 10 || (loaded >= effectiveTotal && lastPct < 100))){
        logLine(`amocrm_csv_stream: ${Math.min(100,pct)}%, rows=${parsedRows}`);
        lastPct = pct;
      } else if(!effectiveTotal && loaded - lastLoggedBytes >= 10 * MB){
        logLine(`amocrm_csv_stream: ${formatBytes(loaded)}, rows=${parsedRows}`);
        lastLoggedBytes = loaded;
      }
    }
  }, clean);
  logLine(`amocrm_csv: delimiter=${JSON.stringify(parsed.delimiter)}, rows=${seen}, kept=${rows.length}, cols=${parsed.headers.length}`);
  debugColumnSample(parsed, debugRows, 'amo_col Дата визита', findHeaderIndexExact(parsed, 'Дата визита'));
  debugColumnSample(parsed, debugRows, 'amo_col Дата создания сделки', findHeaderIndexExact(parsed, 'Дата создания сделки'));
  debugColumnSample(parsed, debugRows, 'amo_col Причина закрытия карточки', findHeaderIndexExact(parsed, 'Причина закрытия карточки'));
  return rows;
}
function escLog(value){ return String(value || '').replace(/[\r\n\0]+/g, ' ').slice(0, 160); }
function setAmoSourceMode(mode){
  const next = mode === 'online' ? 'online' : 'offline';
  state.amoSourceMode = next;
  $('amoOfflinePanel').classList.toggle('hidden', next !== 'offline');
  $('amoOnlinePanel').classList.toggle('hidden', next !== 'online');
  ['offline','online'].forEach(value=>{
    const button = $(value === 'offline' ? 'amoModeOffline' : 'amoModeOnline');
    const active = value === next;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  syncFixedTop();
  if(next === 'online' && state.amoCacheMeta && state.amoSourceKind !== 'online' && !state.amoCacheLoading){
    void restoreCachedAmoSnapshot();
  }
}
function storeAmoExecUrl(){
  const input = $('amoExecUrl');
  const parsed = LeadBridgeOnlineCsv.parseExecUrl(input.value);
  try{
    if(parsed) localStorage.setItem(AMO_EXEC_URL_STORAGE_KEY, parsed.href);
  }catch(_){ /* storage can be unavailable in private mode */ }
}
function formatAmoSnapshotTime(value){
  const date = new Date(Number(value || 0));
  if(!Number.isFinite(date.getTime())) return 'дата неизвестна';
  return date.toLocaleString('ru-RU', {
    day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit', hour12:false
  }).replace(',', '');
}
function updateAmoOnlineButton(){
  const button = $('btnAmoOnline');
  if(!button || state.amoOnlineController || state.amoCacheLoading) return;
  const activeOnline = state.amoSourceKind === 'online' && state.amoRows.length;
  button.classList.toggle('file-ok', !!activeOnline);
  button.innerHTML = activeOnline
    ? `${svgCheck()}Обновить`
    : (state.amoCacheMeta ? 'Обновить' : 'Загрузить слепок');
}
function renderAmoCacheStatus(meta, options={}){
  const bar = $('amoCacheBar');
  const copy = $('amoCacheMeta');
  const remove = $('btnDeleteAmoCache');
  if(!bar || !copy || !remove) return;
  bar.classList.toggle('ready', !!meta && !options.error);
  bar.classList.toggle('bad', !!options.error);
  remove.classList.toggle('hidden', !meta);
  if(!state.amoDeleteArmedUntil && !state.amoCacheLoading) remove.textContent = 'Удалить';
  if(options.error){
    copy.textContent = options.error;
  }else if(options.loading){
    copy.textContent = 'Открываю сохранённую копию...';
  }else if(meta){
    const rows = Number(meta.rowCount || 0).toLocaleString('ru-RU');
    const size = meta.sizeBytes ? ` · ${formatBytes(meta.sizeBytes)}` : '';
    copy.textContent = `Слепок от ${formatAmoSnapshotTime(meta.createdAt)} · ${rows} строк${size}`;
  }else if(LeadBridgeAmoSnapshotCache.isSupported()){
    copy.textContent = 'Сохранённой копии пока нет.';
  }else{
    copy.textContent = 'Постоянное хранилище недоступно в этом браузере.';
  }
  updateAmoOnlineButton();
  syncFixedTop();
}
function initAmoOnlineSource(){
  try{ $('amoExecUrl').value = localStorage.getItem(AMO_EXEC_URL_STORAGE_KEY) || ''; }catch(_){ /* no-op */ }
  const canSave = typeof window.showSaveFilePicker === 'function';
  const save = $('saveOnlineSnapshot');
  const label = $('saveOnlineSnapshotLabel');
  save.checked = canSave;
  save.disabled = !canSave;
  label.classList.toggle('unavailable', !canSave);
  if(!canSave) label.title = 'Браузер не поддерживает сохранение отдельного CSV-файла. Локальный слепок LeadBridge всё равно сохранится в браузере.';
  $('amoExecUrl').addEventListener('change', storeAmoExecUrl);
  $('amoExecToken').addEventListener('keydown', event=>{
    if(event.key === 'Enter'){
      event.preventDefault();
      void loadAmoOnlineSnapshot();
    }
  });
  setAmoSourceMode('offline');
  renderAmoCacheStatus(null, {loading:true});
  void restoreCachedAmoSnapshot();
}
function setAmoOnlineLoading(loading){
  const load = $('btnAmoOnline');
  const cancel = $('btnCancelAmoOnline');
  load.disabled = loading;
  $('amoExecUrl').disabled = loading;
  $('amoExecToken').disabled = loading;
  $('amoTokenVisibility').disabled = loading;
  $('saveOnlineSnapshot').disabled = loading || typeof window.showSaveFilePicker !== 'function';
  $('btnDeleteAmoCache').disabled = loading;
  $('amoModeOffline').disabled = loading;
  $('amoModeOnline').disabled = loading;
  cancel.classList.toggle('hidden', !loading || !state.amoOnlineController);
  if(loading){
    load.classList.remove('file-ok');
    load.textContent = 'Загрузка...';
  } else updateAmoOnlineButton();
}
function toggleAmoTokenVisibility(){
  const input = $('amoExecToken');
  const button = $('amoTokenVisibility');
  const visible = input.type === 'password';
  input.type = visible ? 'text' : 'password';
  button.setAttribute('aria-pressed', visible ? 'true' : 'false');
  button.setAttribute('aria-label', visible ? 'Скрыть токен' : 'Показать токен');
  button.title = visible ? 'Скрыть токен' : 'Показать токен';
  input.focus({preventScroll:true});
}
async function chooseSnapshotFileHandle(fileName){
  if(!$('saveOnlineSnapshot').checked || typeof window.showSaveFilePicker !== 'function') return null;
  try{
    return await window.showSaveFilePicker({
      suggestedName:fileName,
      types:[{description:'amoCRM CSV', accept:{'text/csv':['.csv']}}]
    });
  }catch(err){
    if(err && err.name === 'AbortError'){
      $('saveOnlineSnapshot').checked = false;
      return null;
    }
    throw err;
  }
}
function invalidateMatchingResults(){
  state.groups = [];
  state.filtered = [];
  state.mobileRenderLimit = mobileInitialRenderLimit();
  renderStartState();
  const actions = $('reportActions');
  if(actions) actions.classList.add('hidden');
  const board = $('stickyBoard');
  if(board){ board.classList.add('hidden'); board.innerHTML = ''; }
}
function activateOnlineAmoRows(rows, meta){
  invalidateMatchingResults();
  state.amoRaw = '';
  state.amoRows = rows;
  state.amoFileName = meta.fileName || 'amocrm_snapshot.csv';
  state.amoSourceKind = 'online';
  state.amoLoadedAt = Number(meta.createdAt || Date.now());
  setPickButtonState('btnAmoFile', false, 'Выбрать amoCRM');
  buildFilterOptions();
  updateMobileRunButton();
}
async function restoreCachedAmoSnapshot(){
  if(state.amoCacheLoading || state.amoOnlineController) return;
  if(!LeadBridgeAmoSnapshotCache.isSupported()){
    state.amoCacheMeta = null;
    renderAmoCacheStatus(null);
    return;
  }
  state.amoCacheLoading = true;
  renderAmoCacheStatus(state.amoCacheMeta, {loading:true});
  setAmoOnlineLoading(true);
  try{
    const storedMeta = await LeadBridgeAmoSnapshotCache.getLatestMeta();
    if(!storedMeta){
      state.amoCacheMeta = null;
      renderAmoCacheStatus(null);
      return;
    }
    state.amoCacheMeta = storedMeta;
    setAmoSourceMode('online');
    const cached = await LeadBridgeAmoSnapshotCache.loadLatest();
    state.amoCacheMeta = cached.meta;
    $('infoAmo').textContent = 'Открываю локальный слепок amoCRM...';
    await sleep(0);
    activateOnlineAmoRows(cached.rows, cached.meta);
    const phones = Number(cached.meta.phoneCount || countPhones(cached.rows));
    $('infoAmo').innerHTML = `OK: <span class="ok">локальный слепок от ${esc(formatAmoSnapshotTime(cached.meta.createdAt))}</span>; сделок/строк: <b>${cached.rows.length}</b>; телефонов: <b>${phones}</b>`;
    renderAmoCacheStatus(cached.meta);
    logLine(`amocrm_cache: restored rows=${cached.rows.length}, phones=${phones}`);
    setNotice(`Используется локальный слепок amoCRM от ${formatAmoSnapshotTime(cached.meta.createdAt)}. Для свежей версии нажми «Обновить».`);
  }catch(err){
    const message = LeadBridgeOnlineCsv.safeErrorMessage(err && err.message);
    renderAmoCacheStatus(state.amoCacheMeta, {error:`Не удалось открыть локальный слепок: ${message}`});
    $('infoAmo').textContent = `Локальный слепок не открыт: ${message}`;
  }finally{
    state.amoCacheLoading = false;
    setAmoOnlineLoading(false);
    updateMobileRunButton();
  }
}
async function deleteCachedAmoSnapshot(){
  if(!state.amoCacheMeta || state.amoCacheLoading || state.amoOnlineController) return;
  const remove = $('btnDeleteAmoCache');
  const now = Date.now();
  if(now > state.amoDeleteArmedUntil){
    state.amoDeleteArmedUntil = now + 5000;
    remove.textContent = 'Точно удалить?';
    setNotice('Повторно нажми «Точно удалить?» в течение 5 секунд, чтобы удалить локальный слепок amoCRM.');
    setTimeout(()=>{
      if(Date.now() >= state.amoDeleteArmedUntil){
        state.amoDeleteArmedUntil = 0;
        if(remove && !state.amoCacheLoading) remove.textContent = 'Удалить';
      }
    }, 5100);
    return;
  }
  state.amoDeleteArmedUntil = 0;
  remove.textContent = 'Удаление...';
  state.amoCacheLoading = true;
  setAmoOnlineLoading(true);
  try{
    await LeadBridgeAmoSnapshotCache.deleteLatest();
    state.amoCacheMeta = null;
    renderAmoCacheStatus(null);
    if(state.amoSourceKind === 'online'){
      state.amoRaw = null;
      state.amoRows = [];
      state.amoFileName = '';
      state.amoSourceKind = 'none';
      state.amoLoadedAt = 0;
      invalidateMatchingResults();
      buildFilterOptions();
      $('infoAmo').textContent = 'Локальный слепок удалён. Введи токен и загрузи свежую версию.';
      setAppView('sources');
    }
    setNotice('Локальный слепок amoCRM удалён с этого устройства.');
  }catch(err){
    const message = LeadBridgeOnlineCsv.safeErrorMessage(err && err.message);
    renderAmoCacheStatus(state.amoCacheMeta, {error:`Не удалось удалить слепок: ${message}`});
    setNotice(`Не удалось удалить локальный слепок: ${message}`, true);
  }finally{
    state.amoCacheLoading = false;
    remove.textContent = 'Удалить';
    setAmoOnlineLoading(false);
    updateMobileRunButton();
  }
}
async function onlineResponseError(response){
  let text = '';
  try{ text = await response.text(); }catch(_){ /* no-op */ }
  try{
    const payload = JSON.parse(text);
    const code = String(payload.error || '');
    const messages = {
      access_denied:'Токен не принят Apps Script.',
      unsupported_action:'Apps Script не поддерживает запрос LeadBridge.',
      snapshot_not_configured:'В Apps Script не настроены таблица и лист.',
      spreadsheet_access_denied:'Apps Script не получил доступ к Google Таблице. Владелец должен запустить testLeadBridgeSnapshot и подтвердить разрешения, затем опубликовать новую версию deployment.',
      sheet_not_found:'Настроенный лист Google Таблицы не найден.',
      sheet_is_empty:'Настроенный лист Google Таблицы пуст.',
      snapshot_limit_exceeded:'Apps Script не смог прочитать лист: превышен лимит размера, времени или памяти Google Apps Script.',
      snapshot_failed:'Apps Script не смог сформировать CSV-снимок.'
    };
    return messages[code] || `Apps Script вернул ошибку HTTP ${response.status}.`;
  }catch(_){
    return `Apps Script вернул ошибку HTTP ${response.status}.`;
  }
}
async function* onlineResponseTextChunks(response, writable, signal, transfer){
  const totalHeader = Number(response.headers.get('content-length') || 0);
  const total = Number.isFinite(totalHeader) && totalHeader > 0 ? totalHeader : 0;
  const decoder = new TextDecoder('utf-8');
  let loaded = 0;
  let lastUi = 0;
  if(!response.body || typeof response.body.getReader !== 'function'){
    const bytes = new Uint8Array(await response.arrayBuffer());
    if(bytes.byteLength > LeadBridgeOnlineCsv.MAX_SNAPSHOT_BYTES) throw new Error('CSV-снимок превышает допустимый размер 2 GB.');
    if(writable) await writable.write(bytes);
    if(transfer) transfer.loaded = bytes.byteLength;
    yield {text:decoder.decode(bytes), loaded:bytes.byteLength, total:bytes.byteLength};
    return;
  }
  const reader = response.body.getReader();
  try{
    while(true){
      if(signal.aborted) throw new DOMException('Загрузка отменена', 'AbortError');
      const part = await reader.read();
      if(part.done) break;
      loaded += part.value.byteLength;
      if(transfer) transfer.loaded = loaded;
      if(loaded > LeadBridgeOnlineCsv.MAX_SNAPSHOT_BYTES){
        await reader.cancel('snapshot size limit');
        throw new Error('CSV-снимок превышает допустимый размер 2 GB.');
      }
      if(writable) await writable.write(part.value);
      const now = Date.now();
      if(now - lastUi > 350){
        const progress = total ? ` (${Math.min(100, Math.floor(loaded / total * 100))}%)` : '';
        $('infoAmo').textContent = `Получаю CSV-снимок: ${formatBytes(loaded)}${progress}; строки разбираются локально...`;
        lastUi = now;
      }
      yield {text:decoder.decode(part.value, {stream:true}), loaded, total};
      await sleep(0);
    }
    const tail = decoder.decode();
    if(tail) yield {text:tail, loaded, total};
  }finally{
    reader.releaseLock();
  }
}
async function loadAmoOnlineSnapshot(){
  if(state.amoOnlineController || state.amoCacheLoading) return;
  let request;
  try{
    request = LeadBridgeOnlineCsv.createSnapshotRequest($('amoExecUrl').value, $('amoExecToken').value);
  }catch(err){
    setNotice(err.message, true);
    return;
  }
  storeAmoExecUrl();
  const fileName = LeadBridgeOnlineCsv.snapshotFileName();
  let fileHandle = null;
  let writable = null;
  let fileSaved = false;
  try{
    fileHandle = await chooseSnapshotFileHandle(fileName);
    const controller = new AbortController();
    state.amoOnlineController = controller;
    request.options.signal = controller.signal;
    setAmoOnlineLoading(true);
    $('infoAmo').textContent = 'Подключаюсь к защищённому /exec...';
    setNotice('Загружаю amoCRM CSV-снимок. Он обрабатывается потоком на этом устройстве.');
    logLine('amocrm_online: request started');
    const response = await fetch(request.url, request.options);
    if(!LeadBridgeOnlineCsv.isAllowedResponseUrl(response.url)) throw new Error('Apps Script перенаправил запрос на неразрешённый адрес.');
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    if(!response.ok || contentType.includes('application/json')) throw new Error(await onlineResponseError(response));
    const declaredSize = Number(response.headers.get('content-length') || 0);
    if(declaredSize > LeadBridgeOnlineCsv.MAX_SNAPSHOT_BYTES) throw new Error('CSV-снимок превышает допустимый размер 2 GB.');
    if(isMobileConstrained() && declaredSize > mobileBudget('amo').hard){
      const proceed = window.confirm(`Онлайн CSV весит ${formatBytes(declaredSize)}. Он будет скачан и разобран потоком, но строки результата всё равно займут память смартфона. Продолжить?`);
      if(!proceed){ controller.abort(); throw new DOMException('Загрузка отменена', 'AbortError'); }
    }
    if(fileHandle) writable = await fileHandle.createWritable();
    const transfer = {loaded:0};
    const rows = await normalizeAmoCsvChunks(onlineResponseTextChunks(response, writable, controller.signal, transfer), fileName, declaredSize);
    if(!rows.length) throw new Error('В полученном CSV не найдено строк amoCRM. Проверь лист и заголовки таблицы.');
    if(writable){ await writable.close(); writable = null; fileSaved = true; }
    const loadedAt = Date.now();
    const phoneCount = countPhones(rows);
    activateOnlineAmoRows(rows, {fileName, createdAt:loadedAt});
    let cacheMeta = null;
    let cacheError = '';
    renderAmoCacheStatus(state.amoCacheMeta, {loading:true});
    $('infoAmo').textContent = 'Сохраняю локальный слепок amoCRM...';
    try{
      cacheMeta = await LeadBridgeAmoSnapshotCache.saveLatest({
        rows,
        fileName,
        createdAt:loadedAt,
        sizeBytes:transfer.loaded || declaredSize,
        phoneCount
      });
      state.amoCacheMeta = cacheMeta;
      renderAmoCacheStatus(cacheMeta);
      void LeadBridgeAmoSnapshotCache.requestPersistence();
    }catch(cacheFailure){
      cacheError = LeadBridgeOnlineCsv.safeErrorMessage(cacheFailure && cacheFailure.message);
      renderAmoCacheStatus(state.amoCacheMeta, {error:`Слепок загружен, но не сохранён: ${cacheError}`});
    }
    $('amoExecToken').value = '';
    const cacheText = cacheMeta ? `; локальный слепок от <b>${esc(formatAmoSnapshotTime(loadedAt))}</b>` : '; хранится только в текущем сеансе';
    const fileText = fileSaved ? '; отдельный CSV сохранён на устройство' : '';
    $('infoAmo').innerHTML = `OK: <span class="ok">онлайн-снимок ${esc(fileName)}</span>; сделок/строк: <b>${rows.length}</b>; телефонов: <b>${phoneCount}</b>${cacheText}${fileText}`;
    updateAmoOnlineButton();
    logLine(`amocrm_online: success rows=${rows.length}, phones=${phoneCount}, cached=${!!cacheMeta}, file_saved=${fileSaved}`);
    setNotice(cacheMeta
      ? `Онлайн-снимок сохранён локально от ${formatAmoSnapshotTime(loadedAt)}. Для свежей версии используй «Обновить».`
      : `Онлайн-снимок загружен, но локальная копия не сохранена: ${cacheError}`,
      false);
  }catch(err){
    if(writable){ try{ await writable.abort(); }catch(_){ /* no-op */ } }
    if(err && err.name === 'AbortError'){
      $('infoAmo').textContent = 'Загрузка онлайн-снимка отменена. Ранее загруженная база не изменена.';
      setNotice('Загрузка amoCRM отменена.');
    }else{
      const safeMessage = LeadBridgeOnlineCsv.safeErrorMessage(err && err.message);
      console.info('LeadBridge online amoCRM snapshot failed');
      $('infoAmo').textContent = `Ошибка онлайн-загрузки: ${safeMessage}`;
      setNotice(`Не удалось загрузить amoCRM: ${safeMessage}`, true);
    }
  }finally{
    state.amoOnlineController = null;
    setAmoOnlineLoading(false);
    updateMobileRunButton();
  }
}
function cancelAmoOnlineSnapshot(){
  if(state.amoOnlineController) state.amoOnlineController.abort();
}
function sleep(ms){ return new Promise(resolve=>setTimeout(resolve,ms)); }
function svgCheck(){ return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6L9 17l-5-5"></path></svg>'; }
function setPickButtonState(id, ok, label){
  const btn = $(id);
  if(!btn) return;
  btn.classList.toggle('file-ok', !!ok);
  btn.innerHTML = ok ? `${svgCheck()}${esc(label)}` : esc(label);
}
function resetPickButtons(){
  setPickButtonState('btnMaxFile', false, 'Выбрать файл MAX');
  setPickButtonState('btnAmoFile', false, 'Выбрать amoCRM');
  setPickButtonState('btnAmoOnline', false, 'Загрузить слепок');
  setPickButtonState('btnZipFile', false, 'Выбрать ZIP MAX');
  setPickButtonState('btnImagesFolder', false, 'Выбрать папку');
}
function mobileRunReady(){
  return !!(state.maxRows.length && state.amoRows.length && state.imageFiles.size);
}
function updateMobileRunButton(){
  const wrap = $('mobileRunWrap');
  if(!wrap) return;
  const ready = mobileRunReady();
  wrap.classList.toggle('ready', ready);
  wrap.setAttribute('aria-hidden', ready ? 'false' : 'true');
}
function bindFileInput(kind){
  const input = kind==='max' ? $('fileMax') : $('fileAmo');
  const drop = kind==='max' ? $('dropMax') : $('dropAmo');
  input.addEventListener('change', async ()=>{ if(input.files[0]) await loadSource(kind, input.files[0]); });
  ['dragenter','dragover'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add('drag')}));
  ['dragleave','drop'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove('drag')}));
  drop.addEventListener('drop', async e=>{ const f=e.dataTransfer.files[0]; if(f) await loadSource(kind, f); });
}

function normalizeFsPath(p){ return String(p || '').split('\\').join('/').replace(/^\.\//,'').replace(/^\/+/, '').trim(); }
function basename(p){ return normalizeFsPath(p).split('/').filter(Boolean).pop() || ''; }
function imageKey(p){ return normalizeFsPath(p).toLowerCase(); }
function addImageKey(key, file){
  const k=imageKey(key); if(!k) return;
  if(state.imageFiles.has(k)){
    if(state.imageFiles.get(k) === file) return;
    state.imageKeyCounts.set(k,(state.imageKeyCounts.get(k)||1)+1);
    state.imageFiles.set(k,null);
    return;
  }
  const count=(state.imageKeyCounts.get(k)||0)+1;
  state.imageKeyCounts.set(k,count);
  if(count===1) state.imageFiles.set(k,file);
  else state.imageFiles.set(k,null); // коллизия: например много att_01.webp, по basename не ищем.
}
function addImageFileWithPath(file, relPath){
  const rel = normalizeFsPath(relPath || file.webkitRelativePath || file.name);
  if(!rel) return;
  addImageKey(rel,file);
  const lower = rel.toLowerCase();
  for(const marker of ['attachments/','images/']){
    const idx = lower.indexOf(marker);
    if(idx >= 0) addImageKey(rel.slice(idx),file);
  }
  if(/^msg_\d+\//i.test(rel)) addImageKey('attachments/'+rel,file);
  addImageKey(basename(rel),file);
}
function mapImageFile(file){ addImageFileWithPath(file, file.webkitRelativePath || file.name); }
function findImageFile(path){
  const norm = normalizeFsPath(path);
  if(!norm) return null;
  const keys = [norm];
  const lower = norm.toLowerCase();
  for(const marker of ['attachments/','images/']){
    const idx = lower.indexOf(marker);
    if(idx >= 0) keys.push(norm.slice(idx));
  }
  if(/^msg_\d+\//i.test(norm)) keys.push('attachments/'+norm);
  for(const k of keys){ const f=state.imageFiles.get(imageKey(k)); if(f) return f; }
  // Не используем поиск только по имени файла att_01.webp: в разных сообщениях такие имена повторяются и дают неверное превью.
  return null;
}
function clearImages(){
  state.imageFiles.clear();
  state.imageKeyCounts.clear();
  for(const url of state.imageObjectUrls.values()) URL.revokeObjectURL(url);
  state.imageObjectUrls.clear();
  updateMobileRunButton();
}
function bindImageFolder(){
  const input = $('fileImages');
  const zipInput = $('fileZip');
  const drop = $('dropImages');
  input.addEventListener('change', async ()=>{
    if(input.files && input.files.length){
      if(!checkMobileFolderBudget(input.files)){ input.value=''; return; }
      updateImageSourceStatus(true, 'Читаю выбранную папку с картинками...');
      await sleep(20);
      loadImageFiles(input.files);
    }
  });
  zipInput.addEventListener('change', async ()=>{
    if(zipInput.files && zipInput.files[0]) await loadZipImages(zipInput.files[0]);
  });
  ['dragenter','dragover'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add('drag')}));
  ['dragleave','drop'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove('drag')}));
  drop.addEventListener('drop', async e=>{
    e.preventDefault(); drop.classList.remove('drag');
    const files=[...e.dataTransfer.files];
    const zip=files.find(f=>/\.zip$/i.test(f.name));
    if(zip) await loadZipImages(zip);
    else if(checkMobileFolderBudget(files)) loadImageFiles(files);
  });
}
function updateImageSourceStatus(ok, text){
  $('infoImages').classList.toggle('warn-blink', !ok);
  $('dropImages').classList.toggle('needs-images', !ok);
  $('dropImages').classList.toggle('loaded', !!ok);
  $('infoImages').innerHTML = text;
}
function expectedZipMessage(){
  return `ZIP/папка не загружены. Ожидаемый стандартный путь: <code>${esc(state.expectedZipPath)}</code>. Браузер не может сам открыть файл по пути — выбери ZIP или папку вручную.`;
}
function loadImageFiles(fileList){
  clearImages();
  const all=[...fileList];
  const files = all.filter(f=>/\.(png|jpe?g|webp|gif|bmp|tiff?)$/i.test(f.name || f.webkitRelativePath || ''));
  files.forEach(mapImageFile);
  state.imageFolderName = files[0]?.webkitRelativePath ? normalizeFsPath(files[0].webkitRelativePath).split('/')[0] : 'selected_images';
  if(files.length){
    updateImageSourceStatus(true, `OK: <span class="ok">${esc(state.imageFolderName)}</span>; картинок: <b>${files.length}</b>; ключей поиска: <b>${state.imageFiles.size}</b>`);
    setPickButtonState('btnImagesFolder', true, 'Папка выбрана');
    setPickButtonState('btnZipFile', false, 'Выбрать ZIP MAX');
  } else {
    updateImageSourceStatus(false, `Папка выбрана, но картинки не найдены. Выбери распакованную папку <b>attachments</b> или исходный ZIP MAX.`);
    setPickButtonState('btnImagesFolder', false, 'Выбрать папку');
  }
  updateMobileRunButton();
}
function u16le(b,o){ return b[o] | (b[o+1]<<8); }
function u32le(b,o){ return (b[o] | (b[o+1]<<8) | (b[o+2]<<16) | (b[o+3]<<24)) >>> 0; }
function findEocd(bytes){
  const min = Math.max(0, bytes.length - 22 - 65535);
  for(let i=bytes.length-22; i>=min; i--){ if(u32le(bytes,i)===0x06054b50) return i; }
  return -1;
}
function decodeZipName(nameBytes, flags){
  try { return new TextDecoder(flags & 0x0800 ? 'utf-8' : 'utf-8').decode(nameBytes); }
  catch(e){ return Array.from(nameBytes).map(b=>String.fromCharCode(b)).join(''); }
}
async function inflateZipData(data, maxBytes){
  if(typeof DecompressionStream === 'undefined') throw new Error('DecompressionStream недоступен');
  const formats = ['deflate-raw','deflate'];
  let lastErr = null;
  for(const fmt of formats){
    try{
      const ds = new DecompressionStream(fmt);
      const stream = new Blob([data]).stream().pipeThrough(ds);
      return await LeadBridgeSecurity.readLimitedStream(stream, maxBytes, 'файл внутри ZIP превышает допустимый размер');
    }catch(e){ lastErr=e; }
  }
  throw lastErr || new Error('не удалось распаковать deflate');
}
async function loadZipImages(file){
  if(!checkMobileFileBudget('zip', file)) return;
  clearImages();
  updateImageSourceStatus(true, `Читаю ZIP: <span class="ok">${esc(file.name)}</span>...`);
  setPickButtonState('btnZipFile', true, 'ZIP выбран');
  await sleep(20);

  let added=0, skipped=0, failed=0;
  try{
    const bytes = new Uint8Array(await file.arrayBuffer());
    const eocd = findEocd(bytes);
    if(eocd < 0) throw new Error('не найдена центральная директория ZIP');
    if(u16le(bytes,eocd+4)!==0 || u16le(bytes,eocd+6)!==0) throw new Error('многотомные ZIP не поддерживаются');
    const total = u16le(bytes, eocd+10);
    const diskTotal = u16le(bytes,eocd+8);
    const cdSize = u32le(bytes,eocd+12);
    const initialCdOff = u32le(bytes, eocd+16);
    if(total===0xffff || cdSize===0xffffffff || initialCdOff===0xffffffff) throw new Error('ZIP64 не поддерживается');
    if(total!==diskTotal || initialCdOff+cdSize>eocd || initialCdOff+cdSize>bytes.length) throw new Error('повреждена центральная директория ZIP');
    if(total>LeadBridgeSecurity.DEFAULT_ZIP_POLICY.maxEntries) throw new Error('В ZIP слишком много файлов');
    let cdOff = initialCdOff;
    const entries=[];
    const totals={entries:0,uncompressedBytes:0};
    const names=new Set();
    for(let n=0; n<total; n++){
      if(cdOff+46>bytes.length || u32le(bytes,cdOff)!==0x02014b50) throw new Error('повреждена запись центральной директории ZIP');
      const versionMadeBy=u16le(bytes,cdOff+4);
      const flags=u16le(bytes,cdOff+8);
      const method=u16le(bytes,cdOff+10);
      const compSize=u32le(bytes,cdOff+20);
      const uncompSize=u32le(bytes,cdOff+24);
      const nameLen=u16le(bytes,cdOff+28);
      const extraLen=u16le(bytes,cdOff+30);
      const commentLen=u16le(bytes,cdOff+32);
      const externalAttributes=u32le(bytes,cdOff+38);
      const localOff=u32le(bytes,cdOff+42);
      if(cdOff+46+nameLen+extraLen+commentLen>bytes.length) throw new Error('повреждена длина записи ZIP');
      const name = decodeZipName(bytes.slice(cdOff+46, cdOff+46+nameLen), flags);
      cdOff += 46 + nameLen + extraLen + commentLen;
      const safeName=LeadBridgeSecurity.validateZipEntry({name,compressedBytes:compSize,uncompressedBytes:uncompSize,flags,versionMadeBy,externalAttributes},totals);
      const duplicateKey=safeName.toLowerCase();
      if(names.has(duplicateKey)) throw new Error('ZIP содержит повторяющийся путь');
      names.add(duplicateKey);
      entries.push({name:safeName,flags,method,compSize,uncompSize,localOff});
    }
    if(cdOff!==initialCdOff+cdSize) throw new Error('размер центральной директории ZIP не совпадает');
    for(const entry of entries){
      const {name,method,compSize,uncompSize,localOff}=entry;
      if(name.endsWith('/') || !/\.(png|jpe?g|webp|gif|bmp|tiff?)$/i.test(name)) continue;
      if(localOff+30>bytes.length || u32le(bytes,localOff)!==0x04034b50){ failed++; continue; }
      const ln=u16le(bytes,localOff+26), le=u16le(bytes,localOff+28);
      const dataStart=localOff+30+ln+le;
      const dataEnd=dataStart+compSize;
      if(dataEnd>bytes.length){ failed++; continue; }
      const compData=bytes.slice(dataStart,dataEnd);
      let data;
      if(method===0){
        data=compData;
      } else if(method===8){
        try{ data=await inflateZipData(compData, Math.min(uncompSize,LeadBridgeSecurity.DEFAULT_ZIP_POLICY.maxEntryUncompressedBytes)); }
        catch(e){ skipped++; continue; }
      } else { skipped++; continue; }
      if(data.byteLength!==uncompSize){ failed++; continue; }
      const mime = mimeFromName(name);
      const f = new File([data], basename(name), {type:mime});
      addImageFileWithPath(f, name);
      added++;
    }
    state.imageFolderName = file.name;
    if(added){
      updateImageSourceStatus(true, `OK: <span class="ok">${esc(file.name)}</span>; картинок из ZIP: <b>${added}</b>; ключей поиска: <b>${state.imageFiles.size}</b>${skipped?`; не распаковано: <b>${skipped}</b>`:''}${failed?`; ошибок: <b>${failed}</b>`:''}`);
      setPickButtonState('btnZipFile', true, 'ZIP выбран');
      setPickButtonState('btnImagesFolder', false, 'Выбрать папку');
    } else {
      updateImageSourceStatus(false, `ZIP выбран, но картинки не прочитались. Чаще всего это сжатие ZIP, которое браузер не смог распаковать. Распакуй <b>${esc(file.name)}</b> и выбери папку <b>attachments</b>.`);
      setPickButtonState('btnZipFile', false, 'Выбрать ZIP MAX');
    }
  }catch(err){
    console.error(err);
    updateImageSourceStatus(false, `ZIP выбран, но не прочитан: ${esc(err.message)}. Распакуй архив и выбери папку <b>attachments</b>.`);
    setPickButtonState('btnZipFile', false, 'Выбрать ZIP MAX');
  }
  updateMobileRunButton();
}
function mimeFromName(name){
  const n=String(name).toLowerCase();
  if(n.endsWith('.png')) return 'image/png'; if(n.endsWith('.jpg')||n.endsWith('.jpeg')) return 'image/jpeg'; if(n.endsWith('.webp')) return 'image/webp'; if(n.endsWith('.gif')) return 'image/gif'; if(n.endsWith('.bmp')) return 'image/bmp'; return 'application/octet-stream';
}
function objectUrlForImage(path){
  const file = findImageFile(path);
  if(!file) return '';
  const key = normalizeFsPath(path) + '|' + file.name + '|' + file.size;
  if(!state.imageObjectUrls.has(key)) state.imageObjectUrls.set(key, URL.createObjectURL(file));
  return state.imageObjectUrls.get(key);
}
function setPreviewZoomEnabled(enabled){
  const viewport = document.querySelector('meta[name="viewport"]');
  if(!viewport) return;
  viewport.setAttribute('content', enabled
    ? 'width=device-width, initial-scale=1, maximum-scale=5, user-scalable=yes, viewport-fit=cover'
    : 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover');
}
function openAnketaPreview(path){
  const file = findImageFile(path);
  const url = file ? objectUrlForImage(path) : normalizeFsPath(path);
  const title = basename(path) || 'anketa';
  $('previewTitle').textContent = `Анкета: ${title}`;
  $('previewPath').textContent = path || '';
  $('previewWarn').classList.toggle('hidden', !!file);
  $('previewWarn').textContent = file ? '' : 'Файл картинки не найден. Выбери исходный ZIP MAX или папку attachments, чтобы открыть точную OCR-картинку.';
  $('previewImg').src = url;
  setPreviewZoomEnabled(true);
  document.body.classList.add('preview-zoom-open');
  $('anketaPreviewModal').classList.remove('hidden');
}
function closeAnketaPreview(){
  $('anketaPreviewModal').classList.add('hidden');
  $('previewImg').removeAttribute('src');
  setPreviewZoomEnabled(false);
  document.body.classList.remove('preview-zoom-open');
}
function detectExpectedZipFromText(text){
  const m = String(text || '').match(/MAX_CHAT_EXPORT_[^"'\\/\s]+?(?:\.zip)?(?=["'\\/\s]|$)/);
  const name = m ? (m[0].endsWith('.zip') ? m[0] : m[0] + '.zip') : 'MAX_CHAT_EXPORT_1201msg_1166att_23-06-26_01-11.zip';
  state.expectedZipName = name;
  state.expectedZipPath = `C:\\LeadBridgeKSO\\exports\\${name}`;
  if(!state.imageFiles.size) updateImageSourceStatus(false, expectedZipMessage());
}

async function loadSource(kind, file){
  try{
    if(!checkMobileFileBudget(kind, file)) return;
    if(kind==='max'){
      logLine(`read_file: ${file.name}`);
      const text = await readFile(file);
      detectExpectedZipFromText(text);
      state.maxFileName = file.name;
      state.maxRaw = text;
      state.maxRows = normalizeMaxSource(file.name, text);
      $('infoMax').innerHTML = `OK: <span class="ok">${esc(file.name)}</span>; анкет/строк: <b>${state.maxRows.length}</b>; телефонов: <b>${countPhones(state.maxRows)}</b>`;
      setPickButtonState('btnMaxFile', true, 'MAX выбран');
      logLine(`max_schema: rows=${state.maxRows.length}, phones=${countPhones(state.maxRows)}`);
    } else {
      setAmoSourceMode('offline');
      const streamAmo = shouldStreamAmoFile(file);
      let amoRows;
      let amoRaw = '';
      if(streamAmo){
        $('infoAmo').innerHTML = `Читаю чанками: <span class="ok">${esc(file.name)}</span>; размер: <b>${formatBytes(file.size)}</b>`;
        logLine(`read_file_chunks: ${file.name}`);
        await sleep(20);
        amoRows = await normalizeAmoCsvFile(file);
      } else {
        logLine(`read_file: ${file.name}`);
        const text = await readFile(file);
        amoRaw = text;
        amoRows = normalizeAmoSource(file.name, text);
      }
      state.amoFileName = file.name;
      state.amoRaw = amoRaw;
      state.amoRows = amoRows;
      state.amoSourceKind = 'offline';
      state.amoLoadedAt = 0;
      $('infoAmo').innerHTML = `OK: <span class="ok">${esc(file.name)}</span>; сделок/строк: <b>${state.amoRows.length}</b>; телефонов: <b>${countPhones(state.amoRows)}</b>`;
      setPickButtonState('btnAmoFile', true, 'amoCRM выбран');
      updateAmoOnlineButton();
      logLine(`amocrm_schema: rows=${state.amoRows.length}, phones=${countPhones(state.amoRows)}`);
    }
    buildFilterOptions();
    setNotice('Файл загружен. Верхний запуск доступен после MAX и amoCRM; нижняя мобильная кнопка появится после ZIP/папки с анкетами.');
  }catch(err){
    console.error(err);
    if(kind==='max') setPickButtonState('btnMaxFile', false, 'Выбрать файл MAX');
    else setPickButtonState('btnAmoFile', false, 'Выбрать amoCRM');
    setNotice(`Ошибка чтения файла: ${err.message}`, true);
  }finally{
    updateMobileRunButton();
  }
}
function countPhones(rows){ return rows.reduce((n,r)=>n+(r.phones?.length||0),0); }

function normalizeMaxSource(fileName, text){
  const trimmed = text.trim();
  if(!trimmed) return [];
  if(fileName.toLowerCase().endsWith('.json') || trimmed[0]==='{' || trimmed[0]==='['){
    let data = JSON.parse(trimmed);
    let arr;
    if(Array.isArray(data)) arr = data;
    else if(Array.isArray(data.forms)) arr = data.forms;
    else if(Array.isArray(data.messages)) {
      arr = [];
      data.messages.forEach((m)=>{
        const ocr = Array.isArray(m.attachment_ocr) ? m.attachment_ocr : [];
        const ok = ocr.filter(a=>!a.status || String(a.status).toLowerCase()==='ok');
        if(ok.length){
          ok.forEach(a=>{
            const one = {...m};
            one.attachment_ocr = [a]; // критично: не тащим OCR других картинок из этого же сообщения
            one.attachment_path = a.original_path || a.attachment_path || a.path || a.source_path || '';
            one.form = a.structured || a.form || {};
            one.version_status = a.version_status || one.version_status || '';
            one.case_key = a.case_key || one.case_key || '';
            one._ocr_attachment = a;
            one._row_kind = 'ocr_attachment';
            arr.push(one);
          });
        }
        // Отдельная строка для телефонов, написанных обычным текстом в чате.
        // Она не получает attachment_path, чтобы ссылка «Анкета → открыть» не вела на случайную картинку из сообщения.
        const textOnly = {...m, attachment_ocr: [], attachment_path: '', form: {}, version_status: '', case_key: '', _row_kind: 'text_message'};
        const textForPhone = [m.bodyText,m.body_text,m.message_text,m.messageText,m.chat_message,m.text,m.comment,m.source_message,m.reply?.text].filter(Boolean).join(' ');
        if(uniquePhones([textForPhone]).length || !ok.length) arr.push(textOnly);
      });
    }
    else arr = data.items || data.records || data.data || [];
    if(!Array.isArray(arr)) arr=[];
    // Матчинг строится только по телефону. Строки без телефона не должны создавать ложные привязки и мусорную статистику.
    return arr.map((item, i)=>normalizeMaxItem(item, i)).filter(r=>r.phones.length);
  }
  const parsed = parseCsv(text);
  return parsed.rows.map((row,i)=>normalizeMaxCsvRow(parsed,row,i)).filter(r=>r.phones.length);
}
function deepPick(obj, paths){
  for(const path of paths){
    const parts=path.split('.'); let cur=obj;
    for(const p of parts){ if(cur && Object.prototype.hasOwnProperty.call(cur,p)) cur=cur[p]; else {cur=undefined;break;} }
    if(cur!==undefined && cur!==null && clean(Array.isArray(cur)?cur.join('; '):cur)) return cur;
  }
  return '';
}
function collectObjectPhones(obj){
  const vals=[];
  function walk(o, path=''){
    if(vals.length>80) return;
    if(o==null) return;
    if(typeof o==='string' || typeof o==='number'){
      const p=path.toLowerCase(); const s=String(o);
      if(p.includes('all_phones') || p.includes('all phones') || p.includes('phone_list') || p.includes('phone_numbers')) return;
      if(p.includes('phone') || p.includes('телефон') || p.includes('mobile') || p.includes('contact') || /^phone:\d+/.test(s)) vals.push(s);
      return;
    }
    if(Array.isArray(o)){ o.slice(0,30).forEach((v,idx)=>walk(v, path+' '+idx)); return; }
    if(typeof o==='object') Object.keys(o).slice(0,200).forEach(k=>walk(o[k], path+' '+k));
  }
  walk(obj); return vals;
}
function collectObjectIdentifiers(obj){
  const vals=[];
  function walk(o, path=''){
    if(vals.length>80 || o==null) return;
    if(typeof o==='string' || typeof o==='number'){
      const p=path.toLowerCase();
      if(!p.includes('phone') && /(passport|паспорт|inn|инн|snils|снилс|document|документ|series|серия)/i.test(p)) vals.push(String(o));
      return;
    }
    if(Array.isArray(o)){ o.slice(0,30).forEach((v,idx)=>walk(v, path+' '+idx)); return; }
    if(typeof o==='object') Object.keys(o).slice(0,200).forEach(k=>walk(o[k], path+' '+k));
  }
  walk(obj); return vals;
}
function ocrIdentifierValues(text){
  const lines=String(text||'').split(/\r?\n/), vals=[];
  const label=/(паспорт|серия|инн|снилс|номер\s+документа|код\s+подразделения)/i;
  const phoneLabel=/(телефон|мобил|сотов|контактн)/i;
  lines.forEach((line,index)=>{
    if(!label.test(line)) return;
    vals.push(line);
    const next=lines[index+1] || '';
    if(next && !phoneLabel.test(next)) vals.push(next);
  });
  return vals;
}
function normalizeMaxItem(item, i){
  const ocrAtt = item._ocr_attachment || {};
  const isOcrAttachment = item._row_kind === 'ocr_attachment' || !!item._ocr_attachment;
  const isTextMessage = item._row_kind === 'text_message';
  const fields = isOcrAttachment
    ? (item.form?.fields || ocrAtt.structured?.fields || ocrAtt.form?.fields || ocrAtt.fields || {})
    : (item.form?.fields || item.fields || {});
  const norm = isOcrAttachment
    ? (item.form?.normalized || ocrAtt.structured?.normalized || ocrAtt.form?.normalized || ocrAtt.normalized || {})
    : (item.form?.normalized || item.normalized || {});
  const matchKeys = isOcrAttachment
    ? (item.form?.match_keys || ocrAtt.structured?.match_keys || ocrAtt.form?.match_keys || ocrAtt.match_keys || [])
    : (item.form?.match_keys || item.match_keys || item.matchKeys || []);

  const phoneVals=[];
  ['mobile_phone_norm','phone_norm','borrower_phone_norm','contact_person_phone_norm','work_phone_norm','mobile_phone','phone','borrower_phone','contact_phone','contact_person_phone','work_phone'].forEach(k=>{
    if(norm[k]) phoneVals.push(norm[k]);
    if(fields[k]) phoneVals.push(fields[k]);
    if(!isOcrAttachment && item[k]) phoneVals.push(item[k]);
  });
  for(const mk of (Array.isArray(matchKeys)?matchKeys:[])){
    if(String(mk).startsWith('phone:')) phoneVals.push(String(mk).slice(6));
  }
  phoneVals.push(...collectObjectPhones(fields));

  if(isOcrAttachment){
    // Номера из структурированных телефонных полей остаются приоритетными.
    // Сырой OCR просматриваем только возле телефонных подписей: полный текст анкеты
    // содержит паспорт, ИНН и другие последовательности, похожие на номер телефона.
    phoneVals.push(...collectObjectPhones(norm));
    const ocrText = [ocrAtt.text, ocrAtt.ocr_text, ocrAtt.raw_text, ocrAtt.raw_ocr, ocrAtt.plain_text, fields.ocr_text, fields.raw_ocr].filter(Boolean).join('\n');
    phoneVals.push(...LeadBridgeSecurity.extractPhonesNearLabels(ocrText));
  } else if(isTextMessage){
    // Обычное текстовое сообщение MAX — отдельный источник без attachment_path.
    phoneVals.push([item.bodyText,item.body_text,item.message_text,item.messageText,item.chat_message,item.text,item.comment,item.source_message,item.reply?.text].filter(Boolean).join(' '));
  } else {
    phoneVals.push(...collectObjectPhones(item).slice(0,20));
  }

  let phones = uniquePhones(phoneVals);
  if(isOcrAttachment){
    const ocrText = [ocrAtt.text, ocrAtt.ocr_text, ocrAtt.raw_text, ocrAtt.raw_ocr, ocrAtt.plain_text, fields.ocr_text, fields.raw_ocr].filter(Boolean).join('\n');
    phones = LeadBridgeSecurity.excludeIdentifierPhones(phones, [
      ...collectObjectIdentifiers(fields),
      ...collectObjectIdentifiers(norm),
      ...ocrIdentifierValues(ocrText)
    ]);
  }
  if(!phones.length && !isOcrAttachment){
    const maybeText = [item.bodyText,item.message_text,item.text,item.ocr_text,item.raw_ocr,fields.ocr_text,fields.raw_ocr].filter(Boolean).join('\n');
    phones = uniquePhones([maybeText]);
  }

  const fullName = deriveMaxFullName(item, ocrAtt, fields, norm, phones);
  const phoneNames = buildMaxPhoneNames(item, ocrAtt, fields, norm, phones, fullName);
  const messageIndex = clean(deepPick(item,['message_index','messageIndex','number','msg_number','form.message_index','fields.message_index'])) || String(i+1);
  const messageDate = clean(deepPick(item,['message_date','messageDate','sent_at','sentAt','sent_time','sentTime','date','time','created_at','createdAt','timestamp','fields.message_date','form.message_date'])) ;
  const messageUrl = clean(deepPick(item,['message_url','messageUrl','max_message_link','maxMessageLink','link','url','permalink','fields.message_url']));
  const comment = clean(deepPick(item,['bodyText','body_text','message_text','messageText','chat_message','text','comment','source_message','fields.message_text','fields.comment'])) ;
  const reply = item.reply?.text ? clean(item.reply.text) : '';
  const attachmentPath = isOcrAttachment ? clean(deepPick(item,['_ocr_attachment.original_path','_ocr_attachment.attachment_path','_ocr_attachment.path','_ocr_attachment.source_path','attachment_path','attachmentPath','form.attachment_path','fields.attachment_path','original_path','ocr_attachment.original_path'])) : '';
  const versionStatus = clean(deepPick(item,['version_status','versionStatus','form.version_status','fields.version_status'])) ;
  const sourceKind = attachmentPath ? 'анкета' : 'сообщение';
  return {source:'max', sourceKind, raw:item, phones, phoneNames, fullName, messageIndex, messageDate, messageDateMs:dateKey(messageDate), messageUrl, comment, reply, attachmentPath, versionStatus};
}
function maxOcrTextBlob(item, ocrAtt, fields, norm){
  return [
    ocrAtt && (ocrAtt.ocr_text || ocrAtt.text || ocrAtt.raw_text || ocrAtt.raw_ocr || ocrAtt.plain_text),
    fields && (fields.ocr_text || fields.raw_ocr || fields.text),
    item && (item.bodyText || item.body_text || item.message_text || item.messageText || item.chat_message || item.text || item.comment || item.source_message),
    item && item.reply && item.reply.text
  ].filter(Boolean).join('\n');
}
function titleCaseRuName(s){
  return clean(s).replace(/[«»"'`]+/g,'').split(/\s+/).filter(Boolean).map(w=>{
    if(w === w.toUpperCase()) return w.charAt(0) + w.slice(1).toLowerCase();
    return w;
  }).join(' ');
}
function fioBadWord(w){
  const x = lowerKey(w);
  return /^(анкета|новая|мобильный|мобильного|телефон|тел|рабочий|контактных|контактные|фио|заемщик|заемщика|заёмщик|заёмщика|клиент|клиента|дата|рождения|девичья|девичьяфио|год|изменения|паспорт|паспортные|данные|полностью|выдан|орган|органа|код|место|адрес|прописке|фактического|проживания|родственники|родственник|знакомые|знакомый|супруга|супруги|супруг|кем|приходится|информация|месте|работы|образование|полное|название|организации|организация|работодателя|работодатель|доход|собственность|семейное|положение|иждивенцев|стоимость|авто|первоначальный|взнос|срок|кредита|желаемый|платеж|месяц|подпись|расшифровка|заполнения|настоящим|подтверждаю|достоверны|слов|записано|верно|высшее|холост|квартира|мвд|россии|рф|гу|ооо|оао|ао|ип|инн|администрация|администрации|омской|омская|омскаяобласть|обл|область|район|город|тюмень|кемерово|свердловская|баженовское)$/i.test(x);
}
function looksLikeRuFio(s){
  const raw = clean(s).replace(/[.,;:()\[\]{}<>|]+/g,' ').replace(/\s+/g,' ');
  if(!raw || /\d/.test(raw)) return false;
  const words = raw.split(/\s+/).filter(Boolean);
  if(words.length < 2 || words.length > 4) return false;
  if(words.some(w=>fioBadWord(w))) return false;
  let good = 0;
  for(const w of words){
    if(!/^[А-ЯЁа-яё-]+$/.test(w)) return false;
    if(w.length < 3) return false;
    if(/^[А-ЯЁ][а-яё-]+$/.test(w) || /^[А-ЯЁ]{3,}$/.test(w)) good++;
  }
  if(good < 2) return false;
  const joined = lowerKey(raw);
  if(/мвд|россии|области|край|республика|город|улица|ул|проспект|район|банк|магазин|агроторг|организац|работодатель|администрац|мобильн|анкета/.test(joined)) return false;
  return true;
}
function extractRuFioSequences(text){
  const src = String(text || '').replace(/[|]+/g,' ');
  const re = /(?:[А-ЯЁ][а-яё-]{2,}|[А-ЯЁ]{3,})(?:\s+(?:[А-ЯЁ][а-яё-]{2,}|[А-ЯЁ]{3,})){1,3}/g;
  const out = [];
  for(const m of src.matchAll(re)){
    const name = titleCaseRuName(m[0]);
    if(looksLikeRuFio(name)) out.push(name);
  }
  return [...new Set(out.map(x=>lowerKey(x)))].map(k=>out.find(x=>lowerKey(x)===k));
}
function stripFioLabels(s){
  return String(s || '')
    .replace(/ФИО\s*за[её]мщика/ig,' ')
    .replace(/ФИО\s*клиента/ig,' ')
    .replace(/дата\s*рождения/ig,' ')
    .replace(/за[её]мщика\s*полностью/ig,' ')
    .replace(/Девичья\s*ФИО\s*,?\s*год\s*изменения/ig,' ')
    .replace(/Мобильный\s*телефон/ig,' ')
    .replace(/Телефон/ig,' ')
    .replace(/ФИО/ig,' ');
}
function extractBorrowerFioFromOcrText(text){
  const lines = String(text || '').split(/\r?\n/).map(x=>clean(x.replace(/[|]+/g,' '))).filter(Boolean);
  for(let i=0;i<lines.length;i++){
    const lk = lowerKey(lines[i]);
    if((lk.includes('фио') && (lk.includes('заемщик') || lk.includes('заемщика'))) || lk.includes('фио заемщика') || lk.includes('фио заёмщика')){
      const window = stripFioLabels([lines[i], lines[i+1]||'', lines[i+2]||'', lines[i+3]||'', lines[i+4]||''].join(' '));
      const cands = extractRuFioSequences(window);
      if(cands.length) return cands[0];
    }
  }
  // частый OCR-разрыв: строка «ФИО заемщика, дата», следующая «рождения ... ФИО»
  const all = String(text || '').replace(/\r/g,'\n');
  const m = all.match(/ФИО\s*за[её]мщика[\s\S]{0,180}/i);
  if(m){
    const cands = extractRuFioSequences(stripFioLabels(m[0]));
    if(cands.length) return cands[0];
  }
  return '';
}
function extractMessageFio(text){
  const lines = String(text || '').split(/\r?\n/).map(x=>clean(x)).filter(Boolean);
  for(const line of lines.slice(0,8)){
    const cands = extractRuFioSequences(line);
    if(cands.length) return cands[0];
  }
  const cands = extractRuFioSequences(String(text || '').slice(0,600));
  return cands[0] || '';
}
function bestStructuredFioCandidate(item, ocrAtt, fields, norm){
  const raw = [
    deepPick(item,['form.fields.borrower_full_name','fields.borrower_full_name','borrower_full_name']),
    deepPick(item,['form.fields.full_name','fields.full_name','full_name','fio','client_name','name']),
    deepPick(item,['form.normalized.borrower_full_name_key','normalized.borrower_full_name_key']),
    deepPick(ocrAtt,['structured.fields.borrower_full_name','form.fields.borrower_full_name','fields.borrower_full_name','borrower_full_name']),
    deepPick(ocrAtt,['structured.fields.full_name','form.fields.full_name','fields.full_name','full_name'])
  ].map(clean).filter(Boolean);
  for(const x of raw){
    const seq = extractRuFioSequences(x);
    if(seq.length) return seq[0];
    const tc = titleCaseRuName(x);
    if(looksLikeRuFio(tc)) return tc;
  }
  return '';
}
function deriveMaxFullName(item, ocrAtt, fields, norm, phones){
  const textBlob = maxOcrTextBlob(item, ocrAtt, fields, norm);
  const isOcr = item && item._row_kind === 'ocr_attachment';
  const borrowerFromText = extractBorrowerFioFromOcrText(textBlob);
  if(borrowerFromText) return borrowerFromText;
  const structured = bestStructuredFioCandidate(item, ocrAtt, fields, norm);
  if(structured) return structured;
  if(!isOcr) return extractMessageFio(textBlob);
  return '';
}
function buildMaxPhoneNames(item, ocrAtt, fields, norm, phones, defaultName){
  // Не подменяем ФИО по номеру слабой эвристикой рядом с телефоном.
  // Иначе появляются «Мобильный», «Омской Обл», «Анкета Новая» и похожий мусор.
  // Для MAX-строки показываем только надёжно найденное ФИО заемщика/сообщения.
  return {};
}
function normalizeMaxCsvRow(parsed,row,i){
  const phoneVals = [];
  parsed.headers.forEach((h,idx)=>{ const k=compactKey(h); if(k.includes('phone')||k.includes('телефон')) phoneVals.push(row.__cells[idx]); });
  let phones = uniquePhones(phoneVals);
  if(!phones.length) phones = uniquePhones([row.__cells.join(' ')]);
  const fullName = rowGet(parsed,row,['borrower_full_name','ФИО заемщика','ФИО','full_name','client_name','name']);
  const messageIndex = rowGet(parsed,row,['message_index','messageIndex','number','Номер сообщения','Сообщение'],[]) || String(i+1);
  const messageDate = rowGet(parsed,row,['message_date','messageDate','Дата сообщения','sent_at','sentAt','date','Дата'],[]);
  const messageUrl = rowGet(parsed,row,['message_url','messageLink','max_message_link','Ссылка на сообщение','link','url'],[]);
  const comment = rowGet(parsed,row,['message_text','bodyText','body_text','Текст сообщения','Комментарий анкета','comment','text'],[]);
  const attachmentPath = rowGet(parsed,row,['attachment_path','attachmentPath','Вложение','path'],[]);
  const versionStatus = rowGet(parsed,row,['version_status','versionStatus','Статус версии'],[]);
  const sourceKind = attachmentPath ? 'анкета' : 'сообщение';
  return {source:'max', sourceKind, raw:row, phones, phoneNames:{}, fullName, messageIndex, messageDate, messageDateMs:dateKey(messageDate), messageUrl, comment, reply:'', attachmentPath, versionStatus};
}
function uniquePhones(vals){
  const set=new Set();
  for(const v of vals){ for(const p of extractPhonesFromText(v)) set.add(p); }
  return [...set].sort();
}

function normalizeAmoSource(fileName, text){
  const parsed = parseCsv(text);
  assertAmoSchema(parsed);
  logLine(`amocrm_csv: delimiter=${JSON.stringify(parsed.delimiter)}, rows=${parsed.rows.length}, cols=${parsed.headers.length}`);
  debugColumnSample(parsed, parsed.rows, 'amo_col Дата визита', findHeaderIndexExact(parsed, 'Дата визита'));
  debugColumnSample(parsed, parsed.rows, 'amo_col Дата создания сделки', findHeaderIndexExact(parsed, 'Дата создания сделки'));
  debugColumnSample(parsed, parsed.rows, 'amo_col Причина закрытия карточки', findHeaderIndexExact(parsed, 'Причина закрытия карточки'));
  return parsed.rows.map((row,i)=>normalizeAmoRow(parsed,row,i)).filter(r=>r.id || r.phones.length || r.fullName);
}
function assertAmoSchema(parsed){
  const columns = parsed.__amoColumns || (parsed.__amoColumns = LeadBridgeAmoSchema.resolve(parsed.headers));
  const missing = LeadBridgeAmoSchema.validate(columns);
  if(missing.length){
    throw new Error(`Не распознана структура amoCRM CSV. Не найдены колонки: ${missing.join(', ')}. Выгрузи таблицу с заголовками ID и Телефон.`);
  }
  return columns;
}
function normalizeAmoRow(parsed,row,i, opts={}){
  const columns = assertAmoSchema(parsed);
  const id = safeCell(row, columns.id);
  const responsible = safeCell(row, columns.responsible);
  const createdAt = safeCell(row, columns.createdAt);
  const closedAt = safeCell(row, columns.closedAt);
  const tags = safeCell(row, columns.tags);
  const stage = safeCell(row, columns.stage);
  const pipeline = safeCell(row, columns.pipeline);
  const fullName = safeCell(row, columns.fullName);
  const visitDate = safeCell(row, columns.visitDate);
  const city = safeCell(row, columns.city);
  const region = safeCell(row, columns.region);
  const closeReasonCard = safeCell(row, columns.closeReason);
  const closeReasonOld = safeCell(row, columns.closeReasonOld);
  const closeReason = closeReasonCard;
  const comment = safeCell(row, columns.comment);
  const closeReasonKey = lowerKey(closeReasonCard).replace(/[\s-]+/g,'_');
  const isExcludedCloseReason = /(^|_)1_?(хоз|дубль|дубл)(_|$)/.test(closeReasonKey);
  const duplicateHaystack = lowerKey([stage,pipeline,tags,closeReasonCard,closeReasonOld,comment].join(' '));
  const isDuplicate = isExcludedCloseReason || /(^|\s|_)1?\s*дубл|дубликат|duplicate/.test(duplicateHaystack);
  const phoneVals = columns.phones.map(col=>safeCell(row,col));
  const phones = uniquePhones(phoneVals);
  const dealUrl = id ? AMO_BASE + encodeURIComponent(id) : '';
  const result = {source:'amo', phones, id, dealUrl, otherLeadsUrl:dealUrl ? dealUrl + '?tab_id=amo_other_leads' : '', responsible, createdAt, createdAtMs:dateKey(createdAt), closedAt, fullName, visitDate, visitDateMs:dateKey(visitDate), city, region, stage, pipeline, tags, closeReason, closeReasonOld, isExcludedCloseReason, isDuplicate, comment};
  if(opts.keepRaw !== false) result.raw = row;
  return result;
}

function buildGroups(){
  // Важно: переключатель MAX CURRENT больше НЕ отсекает телефоны глобально.
  // Иначе можно потерять клиента, если по телефону нет CURRENT-версии, но есть полезная OCR/текстовая строка.
  // Фильтр применяется только на этапе выбора канонической MAX-строки внутри телефона.
  const maxRows = state.maxRows.slice();
  const amoRows = state.amoRows.slice();
  const map = LeadBridgeMatching.groupByExactPhone(maxRows, amoRows);
  const groups = [...map.values()].filter(g=>g.max.length && g.amoAll.length);
  groups.forEach(g=>{
    g.max=selectMaxForGroup(dedupBy(g.max,r=>r.messageIndex+'|'+r.attachmentPath+'|'+r.sourceKind), g.phone);
    g.amoAll=LeadBridgeMatching.mergeDealRows(g.amoAll);
    enrichGroupBase(g);
  });
  state.groups = groups;
}
function dedupBy(arr, keyFn){ const seen=new Set(), out=[]; for(const x of arr){ const k=keyFn(x); if(!seen.has(k)){seen.add(k);out.push(x);} } return out; }
function selectMaxForGroup(maxRows, phone){
  let rows = (maxRows || []).slice();
  if(rows.length <= 1) return rows;

  // ВАЖНО: version_status из OCR-процессора — это подсказка, а не истина.
  // SUPERSEDED может появиться ошибочно, если OCR частично прочитал номер или неверно сгруппировал анкеты.
  // Поэтому чекбокс MAX CURRENT НЕ фильтрует строки и НЕ скрывает анкеты.
  // Он только даёт небольшой приоритет CURRENT при выборе канонической строки, но анкета с точным совпавшим телефоном остаётся в матчинге.
  const preferCurrent = !!($('onlyCurrentMax') && $('onlyCurrentMax').checked);

  const score = (r)=>{
    let s = 0;
    const hasAttachment = !!clean(r.attachmentPath);
    const kind = String(r.sourceKind||'').toLowerCase();
    const vs = String(r.versionStatus||'').toUpperCase();

    // Строка попала в группу только если в ней найден ПОЛНЫЙ нормализованный телефон.
    // Поэтому точное совпадение телефона важнее старого version_status.
    if((r.phones || []).includes(phone)) s += 5000;

    // Реальная OCR-картинка анкеты лучше текстового сообщения MAX.
    if(hasAttachment) s += 1000;
    if(kind.includes('анкета')) s += 250;
    if(kind.includes('сообщение')) s += 50;

    // CURRENT/SUPERSEDED из OCR — только подсказка. Не даём CURRENT перебить точное совпадение
    // в другой анкете, потому что статус может быть построен по частично распознанному номеру.
    if(preferCurrent && vs === 'CURRENT') s += 15;
    if(preferCurrent && vs === 'SUPERSEDED') s -= 2;

    // Более информативная OCR-строка предпочтительнее.
    if(clean(r.fullName) && !/тел|кем|польз|понз|знаком|родствен/i.test(r.fullName)) s += 80;
    if(clean(r.comment)) s += 20;

    // Если несколько анкет по одному телефону — более позднее сообщение обычно является корректировкой/новой версией.
    const n = Number(String(r.messageIndex||'').replace(/\D+/g,'')) || 0;
    s += Math.min(n, 999999) / 1000000;
    if(r.messageDateMs) s += Math.min(r.messageDateMs, Date.now()) / 1e14;
    return s;
  };

  const sorted = rows.sort((a,b)=>score(b)-score(a));
  const chosen = sorted[0];
  if(chosen){
    chosen._leadbridgeOriginalVersionStatus = chosen.versionStatus || '';
    // Эффективный статус именно для этого телефона: выбранная строка по полному номеру считается CURRENT,
    // даже если внешний OCR-процессор пометил её SUPERSEDED из-за ошибочной группировки.
    if((chosen.phones || []).includes(phone) && clean(chosen.attachmentPath)) chosen._leadbridgePhoneStatus = 'CURRENT';
  }
  if(chosen && rows.length > 1){
    const statuses = rows.map(r=>`${r.messageIndex || '?'}:${r.versionStatus || 'no_status'}:${r.attachmentPath || 'text'}:phones=${(r.phones||[]).join('/')}`).join(' | ');
    logLine(`max_select phone=${phone}: выбран #${chosen.messageIndex || ''} ${chosen.attachmentPath || 'text'} из ${rows.length} MAX-строк; phone_status=${chosen._leadbridgePhoneStatus || chosen.versionStatus || 'no_status'}; status_debug=${statuses}`);
  }
  return chosen ? [chosen] : [];
}
function selectAmoForGroup(amoRows){
  // Приоритет выбора сделки внутри одного телефона, строго по текущему правилу:
  // 1) Сначала проверяем ВСЕ сделки, совпавшие по номеру, по полю «Дата визита».
  //    Если дата визита попадает в текущий месяц — выводим эту сделку.
  // 2) Если таких сделок несколько — выбираем ближайшую к текущей дате.
  //    При равной дистанции: более поздняя дата визита, затем более свежая дата создания.
  // 3) Если по всем сделкам нет даты визита текущего месяца — выбираем самую свежую по «Дата создания сделки»,
  //    исключая «Причина закрытия карточки» = 1_ХОЗ или 1_ДУБЛЬ.
  // 4) Если после исключения ничего не осталось — аварийный fallback на самую свежую из всех.
  const rows = (amoRows || []).slice();
  const normal = rows.filter(r => !r.isExcludedCloseReason);
  let selected = null;
  let reason = '';

  const currentMonthVisits = rows.filter(r => isDateInCurrentMonth(r.visitDate));
  if(currentMonthVisits.length){
    selected = currentMonthVisits.slice().sort((a,b)=>{
      const da = visitDistanceDays(a.visitDate);
      const db = visitDistanceDays(b.visitDate);
      if(da !== db) return da - db;
      const va = a.visitDateMs || 0;
      const vb = b.visitDateMs || 0;
      if(va !== vb) return vb - va;
      return (b.createdAtMs || 0) - (a.createdAtMs || 0);
    })[0];
    reason = 'visit_current_month_nearest';
  }

  if(!selected){
    selected = latestByCreated(normal);
    if(selected) reason = 'latest_created_not_hoz_not_double';
  }

  if(!selected){
    selected = latestByCreated(rows);
    if(selected) reason = 'fallback_only_hoz_double';
  }

  if(selected) selected._leadbridgeSelectReason = reason;
  return selected ? [selected] : [];
}
function enrichGroupBase(g){
  const amoForMeta = g.amoAll || g.amo || [];
  g.responsibles = [...new Set(amoForMeta.map(r=>r.responsible).filter(Boolean))];
  g.cities = [...new Set(amoForMeta.flatMap(r=>String(r.city||'').split('/').map(x=>x.trim()).filter(Boolean)))];
  g.regions = [...new Set(amoForMeta.map(r=>r.region).filter(Boolean))];
  g.maxDateMs = Math.min(...g.max.map(r=>r.messageDateMs||Infinity)); if(!Number.isFinite(g.maxDateMs)) g.maxDateMs=0;
  g.crmVisitDateMs = Math.min(...amoForMeta.map(r=>r.visitDateMs||Infinity)); if(!Number.isFinite(g.crmVisitDateMs)) g.crmVisitDateMs=0;
  g.crmCreatedDateMs = Math.max(...amoForMeta.map(r=>r.createdAtMs||0)); if(!Number.isFinite(g.crmCreatedDateMs)) g.crmCreatedDateMs=0;
  g.hasCrmVisit = amoForMeta.some(r=>clean(r.visitDate));
  g.hasEmptyCrmVisit = amoForMeta.some(r=>!clean(r.visitDate));
  g.names = [...new Set([...g.max.map(r=>r.fullName),...amoForMeta.map(r=>r.fullName)].filter(Boolean))];
}
function enrichFilteredGroup(g){
  g.responsibles = [...new Set(g.amo.map(r=>r.responsible).filter(Boolean))];
  g.cities = [...new Set(g.amo.flatMap(r=>String(r.city||'').split('/').map(x=>x.trim()).filter(Boolean)))];
  g.regions = [...new Set(g.amo.map(r=>r.region).filter(Boolean))];
  g.maxDateMs = Math.min(...g.max.map(r=>r.messageDateMs||Infinity)); if(!Number.isFinite(g.maxDateMs)) g.maxDateMs=0;
  g.crmVisitDateMs = Math.min(...g.amo.map(r=>r.visitDateMs||Infinity)); if(!Number.isFinite(g.crmVisitDateMs)) g.crmVisitDateMs=0;
  g.crmCreatedDateMs = Math.max(...g.amo.map(r=>r.createdAtMs||0)); if(!Number.isFinite(g.crmCreatedDateMs)) g.crmCreatedDateMs=0;
  g.hasCrmVisit = g.amo.some(r=>clean(r.visitDate));
  g.hasEmptyCrmVisit = g.amo.some(r=>!clean(r.visitDate));
  g.names = [...new Set([...g.max.map(r=>r.fullName),...g.amo.map(r=>r.fullName)].filter(Boolean))];
  return g;
}

function buildFilterOptions(){
  const resp = new Set(state.amoRows.map(r=>r.responsible).filter(Boolean));
  const cities = new Set();
  state.amoRows.forEach(r=>String(r.city||'').split('/').map(x=>x.trim()).filter(Boolean).forEach(x=>cities.add(x)));
  fillSelect($('filterResponsible'), [...resp].sort((a,b)=>a.localeCompare(b,'ru')));
  fillSelect($('filterCity'), [...cities].sort((a,b)=>a.localeCompare(b,'ru')));
}
function fillSelect(sel, vals){
  const cur = sel.value;
  sel.innerHTML = '<option value="">Все</option>' + vals.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');
  if(vals.includes(cur)) sel.value=cur;
}
function applyFilters(){
  let groups = state.groups.map(g=>({...g, amoAll:g.amoAll.slice(), max:g.max.slice(), amo:[]}));
  const resp = $('filterResponsible').value;
  const city = $('filterCity').value;
  const dateFrom = $('filterDateFrom').value ? new Date($('filterDateFrom').value+'T00:00:00').getTime() : 0;
  const dateTo = $('filterDateTo').value ? new Date($('filterDateTo').value+'T23:59:59').getTime() : 0;
  const q = lowerKey($('filterSearch').value);
  const hidePhonesWithCurrentMonthVisit = $('onlyNoCrmVisit').checked;
  groups = groups.map(g=>{
    // Главный рабочий фильтр проекта:
    // если по телефону/контакту среди ВСЕХ найденных amoCRM-сделок уже есть «Дата визита» текущего месяца,
    // блок скрывается целиком. Это нужно, чтобы искать анкеты/сообщения MAX, по которым визит в amoCRM НЕ отмечен.
    // Проверка делается ДО фильтров Ответственный/Город, чтобы дубль или другая сделка по тому же контакту
    // не пролезала в отчет, если визит уже стоит в любой сделке контакта.
    if(hidePhonesWithCurrentMonthVisit && g.amoAll.some(r=>isDateInCurrentMonth(r.visitDate))) return null;

    let amo = g.amoAll.slice();
    if(resp) amo = amo.filter(r=>r.responsible===resp);
    if(city) amo = amo.filter(r=>String(r.city||'').split('/').map(x=>x.trim()).includes(city));

    const amoSelected = selectAmoForGroup(amo);
    let max = g.max.slice();
    if(dateFrom) max = max.filter(r=>(r.messageDateMs||0) >= dateFrom);
    if(dateTo) max = max.filter(r=>(r.messageDateMs||0) <= dateTo);
    return enrichFilteredGroup({...g, amoAll:g.amoAll, amo:amoSelected, max, amoFilteredPool:amo});
  }).filter(g=>g && g.max.length && g.amo.length);
  groups = LeadBridgeMatching.mergeGroupsBySelectedDeal(groups).map(enrichFilteredGroup);
  if(q){
    groups = groups.filter(g=>lowerKey([
      ...LeadBridgeMatching.groupPhonePresentation(g).all,
      ...g.max.map(r=>[r.fullName,r.messageIndex,r.comment,r.messageUrl].join(' ')),
      ...g.amo.map(r=>[r.id,r.fullName,r.responsible,r.city,r.region,r.comment].join(' '))
    ].join(' ')).includes(q));
  }
  const sortBy=$('sortBy').value, dir=$('sortDir').value==='desc'?-1:1;
  groups.sort((a,b)=>{
    const val=(g)=>{
      if(sortBy==='phone') return g.phone;
      if(sortBy==='maxDate') return Math.min(...g.max.map(r=>r.messageDateMs||Infinity));
      if(sortBy==='responsible') return (g.amo[0]?.responsible||'');
      if(sortBy==='city') return (g.amo[0]?.city||'');
      if(sortBy==='crmVisitDate') return Math.min(...g.amo.map(r=>r.visitDateMs||Infinity));
      if(sortBy==='crmCreatedDate') return Math.max(...g.amo.map(r=>r.createdAtMs||0));
      if(sortBy==='amoCount') return g.amo.length;
      if(sortBy==='maxCount') return g.max.length;
      return '';
    };
    const av=val(a), bv=val(b);
    if(typeof av==='number' || typeof bv==='number') return ((av||0)-(bv||0))*dir;
    return String(av).localeCompare(String(bv),'ru')*dir;
  });
  state.filtered = groups;
  state.mobileRenderLimit = mobileInitialRenderLimit();
}

function run(){
  if(!state.maxRows.length || !state.amoRows.length){ setNotice('Нужно загрузить оба источника: OCR-анкеты MAX и CSV amoCRM.', true); return; }
  $('loader').textContent='';
  logLine('normalize_phone: +7/8/7xxxxxxxxxx/(xxx) -> 10 digits');
  buildGroups();
  logLine(`match_by_phone: groups=${state.groups.length}`);
  logLine('amocrm_select: 1) сделка с визитом текущего месяца; 2) если таких нет — свежая по созданию без 1_ХОЗ/1_ДУБЛЬ; фильтр-чип скрывает телефоны с визитом текущего месяца');
  applyFilters();
  render();
  setNotice('Матчинг готов. По amoCRM сначала выбирается сделка с визитом текущего месяца. Если таких нет — самая свежая по созданию, кроме 1_ХОЗ/1_ДУБЛЬ. Включённый фильтр «Без визита в CRM» скрывает телефоны, где хотя бы в одной сделке уже есть визит текущего месяца.');
  setAppView('results', {scrollTop:true});
}

function render(){
  renderStats();
  const actions = $('reportActions');
  if(actions) actions.classList.remove('hidden');
  syncFixedTop();
  const root = $('results');
  if(!state.filtered.length){ root.innerHTML='<div class="empty">Совпадений по телефону нет или всё отфильтровано.</div>'; return; }
  const limit = Number.isFinite(state.mobileRenderLimit) ? state.mobileRenderLimit : state.filtered.length;
  const visible = state.filtered.slice(0, limit);
  const hiddenCount = Math.max(0, state.filtered.length - visible.length);
  const mobileNote = hiddenCount
    ? `<div class="mobile-result-note"><strong>Смартфон-режим:</strong> показано ${visible.length} из ${state.filtered.length} блоков совпадений. Используй поиск/фильтры или подгрузи ещё одну порцию.</div>`
    : '';
  const more = hiddenCount
    ? `<div class="load-more-wrap"><button class="btn cyan" data-action="show-more">Показать ещё ${Math.min(50, hiddenCount)}</button></div>`
    : '';
  root.innerHTML = mobileNote + visible.map((g,idx)=>renderGroup(g,idx)).join('') + more;
  toggleCrmVisitColumn();
}
function showMoreResults(){
  if(!Number.isFinite(state.mobileRenderLimit)) return;
  state.mobileRenderLimit += 50;
  render();
}
function renderStartState(){
  const root = $('results');
  if(!root) return;
  root.innerHTML = '<div id="startState" class="start-state"><strong>Результатов пока нет.</strong>Добавь источники и запусти сопоставление.</div>';
}
function makeMatchedKeySet(groups, side){
  const matched = new Set();
  const sourceGroups = groups || [];
  if(side === 'max'){
    sourceGroups.forEach(g => (g.max||[]).forEach(r => matched.add((r.messageIndex||'')+'|'+(r.attachmentPath||'')+'|'+(r.comment||''))));
  } else {
    sourceGroups.forEach(g => (g.amoAll||[]).forEach(r => matched.add(String(r.id||'')+'|'+(r.phone||'')+'|'+(r.createdAt||''))));
  }
  return matched;
}
function renderStats(){
  const board = $('stickyBoard');
  if(!board) return;
  if(!state.maxRows.length && !state.amoRows.length){ board.classList.add('hidden'); board.innerHTML=''; syncFixedTop(); return; }
  const matchedPhones = new Set(state.groups.flatMap(g=>g.phones || [g.phone]).filter(Boolean)).size;
  const filteredPhones = state.filtered.length || 0;
  const maxInFiltered = state.filtered.reduce((sum,g)=>sum+(g.max?.length||0),0);
  const amoSelectedFiltered = state.filtered.reduce((sum,g)=>sum+(g.amo?.length||0),0);
  const matchedMax = new Set();
  state.groups.forEach(g => (g.max||[]).forEach(r => matchedMax.add((r.messageIndex||'')+'|'+(r.attachmentPath||'')+'|'+(r.comment||''))));
  const matchedAmo = new Set();
  state.groups.forEach(g => (g.amoAll||[]).forEach(r => matchedAmo.add(String(r.id||'')+'|'+(r.createdAt||'')+'|'+(r.fullName||''))));
  const maxWithout = state.maxRows.filter(r=>!matchedMax.has((r.messageIndex||'')+'|'+(r.attachmentPath||'')+'|'+(r.comment||''))).length;
  const amoWithout = state.amoRows.filter(r=>!matchedAmo.has(String(r.id||'')+'|'+(r.createdAt||'')+'|'+(r.fullName||''))).length;
  const items = [
    ['телефонов совпало', 'Тел.', matchedPhones],
    ['после фильтров', 'Фильтр', filteredPhones],
    ['MAX в совпадениях', 'MAX', maxInFiltered],
    ['amoCRM выбрано', 'amo', amoSelectedFiltered],
    ['MAX без совпадений', 'MAX-', maxWithout],
    ['amoCRM без совпадений', 'amo-', amoWithout]
  ];
  board.innerHTML = `<div class="stats">${items.map(([label,shortLabel,value])=>`<div class="stat" title="${escAttr(label)}"><span class="t">${esc(isMobileConstrained() ? shortLabel : label)}:</span><span class="n">${esc(value)}</span></div>`).join('')}</div>`;
  board.classList.remove('hidden');
  syncFixedTop();
}
function formatPhoneForCard(phone){
  const digits = String(phone || '').replace(/\D/g,'');
  if(digits.length !== 10) return String(phone || '');
  return `8 ${digits.slice(0,3)} ${digits.slice(3,6)}-${digits.slice(6,8)}-${digits.slice(8)}`;
}
function phoneCopyValue(phone){
  const normalized = normalizePhone(phone);
  return normalized ? `8${normalized}` : String(phone || '').replace(/\s+/g,' ').trim();
}
function legacyCopyText(text){
  const input = document.createElement('textarea');
  input.value = text;
  input.setAttribute('readonly','');
  input.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
  document.body.appendChild(input);
  input.select();
  const copied = document.execCommand('copy');
  input.remove();
  if(!copied) throw new Error('copy command failed');
}
async function copyCardPhone(phone, control){
  const value = phoneCopyValue(phone);
  if(!value) return;
  try{
    if(navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(value);
    else legacyCopyText(value);
    control.classList.add('copied');
    control.title = 'Скопировано';
    control.setAttribute('aria-label', `Номер ${formatPhoneForCard(phone)} скопирован`);
    setNotice(`Номер ${formatPhoneForCard(phone)} скопирован.`);
    setTimeout(()=>{
      if(!control.isConnected) return;
      control.classList.remove('copied');
      control.title = 'Скопировать номер';
      control.setAttribute('aria-label', `Скопировать номер ${formatPhoneForCard(phone)}`);
    }, 1400);
  }catch(_){
    setNotice('Не удалось скопировать номер. Проверь доступ браузера к буферу обмена.', true);
  }
}
function groupPhones(g){
  return LeadBridgeMatching.groupPhonePresentation(g).matched;
}
function groupAdditionalPhones(g){
  return LeadBridgeMatching.groupPhonePresentation(g).additional;
}
function groupPhonesRaw(g, separator='; '){
  return groupPhones(g).join(separator);
}
function groupPhonesFormatted(g, separator=' / '){
  return groupPhones(g).map(formatPhoneForCard).join(separator);
}
function rowPhonesInGroup(g, row){
  const groupSet = new Set(groupPhones(g));
  const matched = (row && row.phones || []).filter(phone=>groupSet.has(phone));
  return (matched.length ? matched : groupPhones(g)).join('; ');
}
function compactClientPresentation(g){
  const names = LeadBridgeMatching.clientNamePresentation(g.max || [], g.amoAll || g.amo || []);
  const maxRow = (g.max || [])[0] || null;
  const sourceStatus = String(maxRow && (maxRow._leadbridgeOriginalVersionStatus || maxRow.versionStatus) || '').toUpperCase();
  return {
    ...names,
    needsReview: names.hasMismatch || sourceStatus === 'SUPERSEDED',
    reviewLabel: names.hasMismatch ? 'ФИО отличаются' : 'нужна сверка'
  };
}
function renderCompactAnketa(r){
  const path = clean(r && r.attachmentPath || '');
  if(!path) return '<div class="compact-no-anketa">нет анкеты</div>';
  const file = findImageFile(path);
  if(!file) return `<div class="compact-no-anketa" title="${escAttr(path)}">фото не найдено</div>`;
  const url = objectUrlForImage(path);
  return `<button class="compact-anketa-button" type="button" data-action="open-preview" data-path="${escAttr(path)}" title="Открыть анкету крупнее"><img class="compact-anketa-thumb" src="${escAttr(url)}" alt="Анкета"><span>Анкета</span></button>`;
}
function renderPrimaryDealAction(deal){
  const url = deal && safeAmoUrl(deal.dealUrl);
  if(!url) return '<span class="compact-deal-primary disabled"><span>Сделка не найдена</span></span>';
  return `<a class="compact-deal-primary" href="${escAttr(url)}" target="_blank" rel="noopener" title="Открыть выбранную сделку amoCRM"><span>Открыть сделку <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 5h5v5M19 5l-9 9"/><path d="M19 13v6H5V5h6"/></svg></span><small>#${esc(deal.id || '—')}</small></a>`;
}
function dealSelectionReasonText(deal){
  if(!deal) return 'нет выбранной сделки';
  if(deal._leadbridgeSelectReason === 'visit_current_month_nearest') return 'ближайший визит текущего месяца';
  if(deal._leadbridgeSelectReason === 'latest_created_not_hoz_not_double') return 'самая свежая, кроме 1_ХОЗ/1_ДУБЛЬ';
  if(deal._leadbridgeSelectReason === 'fallback_only_hoz_double') return 'запасной выбор: все сделки 1_ХОЗ/1_ДУБЛЬ';
  return 'выбрана по текущему правилу';
}
function renderMatchingDetails(g){
  const maxRow = (g.max || [])[0] || null;
  const deal = (g.amo || [])[0] || null;
  const originalStatus = clean(maxRow && (maxRow._leadbridgeOriginalVersionStatus || maxRow.versionStatus) || 'нет');
  const city = deal ? [deal.city,deal.region].filter(Boolean).join(' / ') : '';
  const summary = [
    ['Ключи совпадения', groupPhonesFormatted(g, ' · ')],
    ['Метод', 'точные 10 цифр телефона'],
    ['Выбор сделки', dealSelectionReasonText(deal)],
    ['Статус MAX', originalStatus],
    ['Ответственный', deal && deal.responsible || '—'],
    ['Город / регион', city || '—']
  ];
  const rows = [...(g.max || []).map(r=>renderRow('max',rowPhonesInGroup(g,r),r)), ...(g.amo || []).map(r=>renderRow('amo',rowPhonesInGroup(g,r),r))].join('');
  return `<div class="match-details-summary">${summary.map(([label,value])=>`<div class="match-detail-item"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('')}</div>
    <div class="match-details-note">Ниже показаны выбранная строка MAX и одна сделка, которая попадает в отчёт. Остальные сделки по телефону доступны через «Все сделки».</div>
    <div class="match-details-table-wrap"><table class="match-details-table"><colgroup><col class="source-cell"><col class="id-cell"><col class="phone-cell"><col class="fio-cell"><col class="mop-cell"><col class="city-cell"><col class="date-cell"><col class="date-cell crm-visit-col"><col class="date-cell"><col class="link-cell"><col class="comment-cell"></colgroup><thead><tr><th>Источник</th><th>ID / сообщение</th><th>Телефон</th><th>ФИО клиента</th><th>МОП</th><th>Город</th><th>Визит анкеты</th><th class="crm-visit-col">Визит CRM</th><th>Создание CRM</th><th>Анкета</th><th>Комментарий</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
function openMatchDetails(phone){
  const g = state.filtered.find(group=>String(group.phone)===String(phone));
  if(!g) return;
  const names = compactClientPresentation(g);
  state.matchDetailsReturnFocus = document.activeElement;
  $('matchDetailsTitle').textContent = `${groupPhonesFormatted(g, ' · ')} · ${names.primaryName || 'ФИО не найдено'}`;
  $('matchDetailsBody').innerHTML = renderMatchingDetails(g);
  $('matchDetailsModal').classList.remove('hidden');
  document.body.classList.add('match-details-open');
  $('closeMatchDetailsBtn')?.focus();
}
function closeMatchDetails(){
  const modal = $('matchDetailsModal');
  if(!modal || modal.classList.contains('hidden')) return;
  modal.classList.add('hidden');
  $('matchDetailsBody').innerHTML = '';
  document.body.classList.remove('match-details-open');
  const target = state.matchDetailsReturnFocus;
  state.matchDetailsReturnFocus = null;
  if(target && document.contains(target)) target.focus();
}
function renderGroup(g, idx){
  const groupId = `deals_${idx}_${String(g.phone).replace(/\D/g, '')}`;
  const names = compactClientPresentation(g);
  const deal = (g.amo || [])[0] || null;
  const dealsBtn = renderDealsToggle(g, groupId);
  const dealsPanel = renderDealsPanel(g, groupId);
  const matchedPhones = groupPhones(g).map(phone=>`<button class="compact-phone compact-phone-matched phone-copy" type="button" data-action="copy-phone" data-phone="${escAttr(phone)}" title="Скопировать совпавший номер" aria-label="Скопировать номер ${escAttr(formatPhoneForCard(phone))}">${esc(formatPhoneForCard(phone))}</button>`).join('');
  const additionalPhones = groupAdditionalPhones(g).map(phone=>`<button class="compact-phone compact-phone-additional phone-copy" type="button" data-action="copy-phone" data-phone="${escAttr(phone)}" title="Скопировать другой номер из этой анкеты" aria-label="Скопировать номер ${escAttr(formatPhoneForCard(phone))}">${esc(formatPhoneForCard(phone))}</button>`).join('');
  return `<article class="match compact-match" data-phone="${esc(g.phone)}">
    <div class="compact-match-main">
      <div class="compact-phone-block"><span class="compact-phone-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M22 16.9v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.69 2.8a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.33 1.85.56 2.81.69A2 2 0 0 1 22 16.9z"/></svg></span><span class="compact-phone-list">${matchedPhones}${additionalPhones}</span></div>
      <div class="compact-identity">
        <div class="compact-identity-line"><span class="compact-client-name">${esc(names.primaryName || 'ФИО не найдено')}</span>${names.needsReview?`<span class="compact-review-label">${esc(names.reviewLabel)}</span>`:''}</div>
        ${names.amoLine?`<div class="compact-amo-name"><span>amoCRM:</span> ${esc(names.amoLine)}</div>`:''}
      </div>
      <div class="compact-anketa">${renderCompactAnketa((g.max || [])[0])}</div>
      <div class="compact-deal-actions">${renderPrimaryDealAction(deal)}${dealsBtn}</div>
      <button class="match-info-btn" type="button" data-action="open-match-details" data-phone="${escAttr(g.phone)}" title="Детали матчинга" aria-label="Показать детали матчинга"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg></button>
    </div>
    ${dealsPanel}
  </article>`;
}
function toggleDealsPanel(id){
  const panel = $(id);
  const btn = $('btn_' + id);
  if(!panel) return;
  const isHidden = panel.classList.toggle('hidden');
  if(btn){
    btn.classList.toggle('open', !isHidden);
    btn.setAttribute('aria-expanded', String(!isHidden));
  }
}
function renderDealsToggle(g, groupId){
  const deals = g.amoAll || g.amo || [];
  if(!deals.length) return '';
  return `<button id="btn_${escAttr(groupId)}" class="deals-toggle compact-deals-link" type="button" data-action="toggle-deals" data-group-id="${escAttr(groupId)}" title="Показать все сделки amoCRM, найденные по номеру" aria-expanded="false"><span>Все сделки · ${esc(deals.length)}</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></button>`;
}
function renderDealsPanel(g, groupId){
  const deals = (g.amoAll || g.amo || []).slice().sort((a,b)=>{
    const cm = Number(isDateInCurrentMonth(b.visitDate)) - Number(isDateInCurrentMonth(a.visitDate));
    if(cm) return cm;
    const vd=(b.visitDateMs||0)-(a.visitDateMs||0); if(vd) return vd;
    return (b.createdAtMs||0)-(a.createdAtMs||0);
  });
  if(!deals.length) return '';
  const selected = new Set((g.amo || []).map(r=>String(r.id || '')));
  const rows = deals.map(r=>{
    const isSelected = selected.has(String(r.id || ''));
    const selectedChip = isSelected ? '<span class="pill ok">выбрана</span>' : '';
    const visit = clean(r.visitDate) ? esc(formatDate(r.visitDate)) : '<span class="muted">пусто</span>';
    const created = clean(r.createdAt) ? esc(formatDate(r.createdAt)) : '<span class="muted">—</span>';
    const city = [r.city,r.region].filter(Boolean).join(' / ');
    const dup = r.isDuplicate ? '<span class="dup-chip">дубль</span>' : '';
    const id = r.id && safeAmoUrl(r.dealUrl) ? `<a href="${escAttr(safeAmoUrl(r.dealUrl))}" target="_blank" rel="noopener">${esc(r.id)}</a>` : '<span class="muted">—</span>';
    return `<tr class="${isSelected?'selected':''}"><td>${id}<div>${selectedChip}${dup}</div></td><td>${esc(r.fullName)}</td><td>${esc(r.responsible)}</td><td>${esc(city)}</td><td>${visit}</td><td>${created}</td><td>${esc(r.closeReason || '')}</td><td class="comment">${esc(r.comment || '')}</td></tr>`;
  }).join('');
  return `<div id="${escAttr(groupId)}" class="deals-panel hidden"><div class="deals-title">Все сделки amoCRM по телефонам ${esc(groupPhonesFormatted(g, ' · '))}</div><div class="deals-table-wrap"><table class="deals-table"><thead><tr><th>ID</th><th>ФИО</th><th>МОП</th><th>Город</th><th>Визит CRM</th><th>Создание CRM</th><th>Причина закрытия</th><th>Комментарий</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
}

function renderAnketaCell(r){
  const path = clean(r.attachmentPath || '');
  const isSuperseded = String(r._leadbridgeOriginalVersionStatus || r.versionStatus || '').toUpperCase() === 'SUPERSEDED';
  const reviewChips = isSuperseded ? '<div class="review-chips"><span class="review-chip manual">РУЧНАЯ СВЕРКА</span><span class="review-chip partial">СОВПАДЕНИЕ ЧАСТИЧНОЕ</span></div>' : '';
  if(!path) return '<span class="anketa-noimage">нет анкеты</span>';
  const file = findImageFile(path);
  if(!file){
    return `<div class="anketa-preview-stack"><span class="anketa-missing" title="${escAttr(path)}">картинка не найдена</span>${reviewChips}</div>`;
  }
  const url = objectUrlForImage(path);
  return `<div class="anketa-preview-cell"><div class="anketa-preview-stack"><img class="anketa-thumb" src="${escAttr(url)}" alt="Анкета" title="Открыть превью: ${escAttr(path)}" data-action="open-preview" data-path="${escAttr(path)}">${reviewChips}</div></div>`;
}

function renderRow(type, phone, r){
  if(type==='max'){
    const link = renderAnketaCell(r);
    const displayStatus = r._leadbridgePhoneStatus || r.versionStatus || '';
    const originalStatus = r._leadbridgeOriginalVersionStatus && r._leadbridgeOriginalVersionStatus !== displayStatus ? ` title="OCR status: ${escAttr(r._leadbridgeOriginalVersionStatus)}"` : '';
    const id = `#${esc(r.messageIndex||'')}${r.attachmentPath?`<div class="muted small">${esc(r.attachmentPath)}</div>`:''}${displayStatus?`<div class="pill ${String(displayStatus).toUpperCase()==='CURRENT'?'max':'warn'}"${originalStatus}>${esc(displayStatus)}</div>`:''}`;
    const comment = [r.comment, r.reply?`reply: ${r.reply}`:''].filter(Boolean).join('\n');
    return `<tr><td><span class="pill max">${esc(r.sourceKind || 'анкета')}</span></td><td>${id}</td><td class="nowrap">${esc(phone)}</td><td>${esc(r.fullName)}</td><td class="muted">—</td><td class="muted">—</td><td>${esc(formatDate(r.messageDate))}</td><td class="crm-visit-col muted">—</td><td class="muted">—</td><td>${link}</td><td class="comment">${esc(comment)}</td></tr>`;
  }
  let reasonLabel = '';
  if(r._leadbridgeSelectReason==='visit_current_month_nearest') reasonLabel = '<div><span class="pill ok">визит текущего месяца / ближайший</span></div>';
  else if(r._leadbridgeSelectReason==='visit_current_month') reasonLabel = '<div><span class="pill ok">визит текущего месяца</span></div>';
  else if(r._leadbridgeSelectReason==='latest_created_not_hoz_not_double') reasonLabel = '<div><span class="pill max">свежая, не 1_ХОЗ/1_ДУБЛЬ</span></div>';
  else if(r._leadbridgeSelectReason==='fallback_only_hoz_double') reasonLabel = '<div><span class="pill danger">только 1_ХОЗ/1_ДУБЛЬ</span></div>';
  const idLink = r.id && safeAmoUrl(r.dealUrl) ? `<a href="${escAttr(safeAmoUrl(r.dealUrl))}" target="_blank" rel="noopener">${esc(r.id)}</a>${safeAmoUrl(r.otherLeadsUrl)?`<div><a class="dup-chip" href="${escAttr(safeAmoUrl(r.otherLeadsUrl))}" target="_blank" rel="noopener">дубль</a></div>`:''}${reasonLabel}` : '<span class="muted">—</span>';
  const visit = clean(r.visitDate) ? esc(formatDate(r.visitDate)) : '<span class="muted">пусто</span>';
  const city = [r.city, r.region].filter(Boolean).join(' / ');
  return `<tr><td><span class="pill amo">amoCRM</span></td><td>${idLink}</td><td class="nowrap">${esc(phone)}</td><td>${esc(r.fullName)}</td><td>${esc(r.responsible)}</td><td>${esc(city)}</td><td class="muted">—</td><td class="crm-visit-col">${visit}</td><td>${esc(formatDate(r.createdAt))}</td><td class="muted">—</td><td class="comment">${esc(r.comment)}</td></tr>`;
}
function toggleCrmVisitColumn(){
  document.body.classList.toggle('hide-crm-visit', !$('showCrmVisitCol').checked);
}

function makeUnifiedRows(groups=state.filtered){
  const rows=[];
  groups.forEach(g=>{
    g.max.forEach(mx=>{
      g.amo.forEach(am=>{
        rows.push({
          phone:groupPhonesRaw(g),
          max_message_index:mx.messageIndex,
          max_message_date:formatDate(mx.messageDate),
          max_full_name:mx.fullName,
          max_message_link:mx.messageUrl,
          max_attachment_path:mx.attachmentPath,
          max_version_status:mx.versionStatus,
          max_comment:mx.comment,
          amo_lead_id:am.id,
          amo_lead_link:am.dealUrl,
          amo_full_name:am.fullName,
          amo_responsible:am.responsible,
          amo_city:am.city,
          amo_region:am.region,
          amo_visit_date:formatDate(am.visitDate),
          amo_created_date:formatDate(am.createdAt),
          amo_closed_date:formatDate(am.closedAt),
          amo_stage:am.stage,
          amo_pipeline:am.pipeline,
          amo_is_duplicate:am.isDuplicate ? 'yes' : '',
          amo_close_reason:am.closeReason || '',
          amo_selection_reason:am._leadbridgeSelectReason || '',
          amo_other_leads_link:am.otherLeadsUrl,
          amo_comment:am.comment,
        });
      });
    });
  });
  return rows;
}
function toCsv(rows){
  if(!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const q=LeadBridgeSecurity.csvCell;
  return '\uFEFF' + headers.map(q).join(',') + '\n' + rows.map(r=>headers.map(h=>q(r[h])).join(',')).join('\n');
}
function download(name, content, type='text/plain;charset=utf-8'){
  const blob = new Blob([content], {type});
  downloadBlob(name, blob);
}
function downloadBlob(name, blob){
  const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click(); setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},500);
}
function confirmMobileExport(label, rows=state.filtered.length, images=0){
  if(!isMobileConstrained()) return true;
  if(rows > 120 || images > 80){
    return window.confirm(`${label}: на смартфоне экспорт может занять много памяти (${rows} строк/блоков${images?`, картинок: ${images}`:''}). Продолжить?`);
  }
  return true;
}
function downloadUnifiedCsv(){
  const rows = makeUnifiedRows();
  if(!confirmMobileExport('CSV-отчёт', rows.length)) return;
  download('leadbridge_kso_matches.csv', toCsv(rows), 'text/csv;charset=utf-8');
}
function downloadMarkdown(){
  if(!confirmMobileExport('Markdown-отчёт', state.filtered.length)) return;
  const lines = [`# LeadBridge: поиск сделок по анкетам КСО`, ``, `Авторство и идея разработки: Бочаров Ю.С.`, ``, `MAX file: ${state.maxFileName}`, `amoCRM file: ${state.amoFileName}`, `Generated: ${new Date().toLocaleString('ru-RU')}`, ``];
  state.filtered.forEach(g=>{
    const phones = groupPhonesRaw(g);
    lines.push(`## ☎ ${phones}`, ``);
    lines.push(`Анкеты: ${g.max.length}; amoCRM: ${g.amo.length}; всего сделок по телефонам: ${g.amoAll?.length || g.amo.length}`, ``);
    lines.push(`| Источник | ID / сообщение | Телефон | ФИО | МОП | Город | Визит анкеты | Визит CRM | Создание CRM | Ссылка | Комментарий |`);
    lines.push(`|---|---:|---|---|---|---|---|---|---|---|---|`);
    g.max.forEach(r=>lines.push(`| анкета | #${md(r.messageIndex)} | ${md(rowPhonesInGroup(g,r))} | ${md(r.fullName)} |  |  | ${md(formatDate(r.messageDate))} |  |  | ${md(r.messageUrl)} | ${md(r.comment)} |`));
    g.amo.forEach(r=>lines.push(`| amoCRM | ${md(r.id)} | ${md(rowPhonesInGroup(g,r))} | ${md(r.fullName)} | ${md(r.responsible)} | ${md([r.city,r.region].filter(Boolean).join(' / '))} |  | ${md(formatDate(r.visitDate))} | ${md(formatDate(r.createdAt))} | ${md(r.dealUrl)} | ${md(r.comment)} |`));
    lines.push('');
  });
  download('leadbridge_kso_match_report.md', lines.join('\n'), 'text/markdown;charset=utf-8');
}
function md(s){ return String(s??'').replace(/\|/g,'\\|').replace(/\r?\n/g,'<br>'); }
async function downloadHtmlReport(){
  if(!state.filtered.length){ setNotice('Нет отфильтрованных совпадений для HTML-отчёта.', true); return; }
  const imageMap = buildReportImageMap(state.filtered);
  if(!confirmMobileExport('HTML ZIP-отчёт', state.filtered.length, imageMap.size)) return;
  const html = buildStandaloneReportHtml(imageMap);
  const files = [{name:'report.html', data:utf8(html)}];
  const missing = [];
  for(const item of imageMap.values()){
    if(item.file) files.push({name:item.reportPath, data:new Uint8Array(await item.file.arrayBuffer())});
    else missing.push(item.sourcePath);
  }
  if(missing.length) files.push({name:'missing_images.txt', data:utf8(missing.join('\n'))});
  const zipBlob = new Blob([createZip(files)], {type:'application/zip'});
  downloadBlob(`leadbridge_kso_html_report_${dateStampForFile()}.zip`, zipBlob);
}
function dateStampForFile(){
  const d=new Date(); const p=n=>String(n).padStart(2,'0');
  return `${p(d.getDate())}-${p(d.getMonth()+1)}-${String(d.getFullYear()).slice(-2)}_${p(d.getHours())}-${p(d.getMinutes())}`;
}
function safeReportImageName(path, i){
  const norm = normalizeFsPath(path);
  const low = norm.toLowerCase();
  const idx = low.indexOf('attachments/');
  const base = idx >= 0 ? norm.slice(idx + 'attachments/'.length) : (norm || `anketa_${i}.jpg`);
  return 'images/' + base.replace(/[\\/:*?"<>|]+/g,'__').replace(/\s+/g,'_');
}
function buildReportImageMap(groups){
  const map = new Map(); let i=1;
  groups.forEach(g=>g.max.forEach(r=>{
    if(!r.attachmentPath || map.has(r.attachmentPath)) return;
    map.set(r.attachmentPath, {sourcePath:r.attachmentPath, reportPath:safeReportImageName(r.attachmentPath, i++), file:findImageFile(r.attachmentPath)});
  }));
  return map;
}
function renderGroupForReport(g, imageMap){
  const mainName = g.names[0] || '';
  const mainCity = g.cities[0] || '';
  const mainRegion = g.regions[0] || '';
  const chips = [`<span class="pill max">анкеты: ${g.max.length}</span>`,`<span class="pill amo">amoCRM: ${g.amo.length}</span>`,...(g.amo||[]).slice(0,3).map(r=>r.responsible?`<span class="pill">${esc(r.responsible)}</span>`:''),mainCity?`<span class="pill">${esc(mainCity)}</span>`:'',mainRegion?`<span class="pill">${esc(mainRegion)}</span>`:''].filter(Boolean).join('');
  const rows = [...g.max.map(r=>renderRowForReport('max', rowPhonesInGroup(g,r), r, imageMap)), ...g.amo.map(r=>renderRowForReport('amo', rowPhonesInGroup(g,r), r, imageMap))].join('');
  return `<article class="match"><div class="match-head"><div class="head-main"><div class="head-line"><div class="phone">☎ ${esc(groupPhonesFormatted(g, ' · '))}</div><div class="head-title">${esc(mainName || 'ФИО не найдено')}</div></div><div class="head-sub"><span>нормализованные телефоны / один блок совпадения</span>${mainCity?`<span>${esc(mainCity)}</span>`:''}${mainRegion?`<span>${esc(mainRegion)}</span>`:''}</div></div><div class="head-meta">${chips}</div></div><div class="tablebox"><table><colgroup><col class="source-cell"><col class="id-cell"><col class="phone-cell"><col class="fio-cell"><col class="mop-cell"><col class="city-cell"><col class="date-cell"><col class="date-cell"><col class="date-cell"><col class="link-cell"><col class="comment-cell"></colgroup><thead><tr><th>Источник</th><th>ID / сообщение</th><th>Телефон</th><th>ФИО клиента</th><th>МОП</th><th>Город</th><th>Визит анкеты</th><th>Визит CRM</th><th>Создание CRM</th><th>Анкета</th><th>Комментарий</th></tr></thead><tbody>${rows}</tbody></table></div></article>`;
}
function renderRowForReport(type, phone, r, imageMap){
  if(type==='max'){
    const img = imageMap.get(r.attachmentPath);
    const link = img ? `<a href="${escAttr(img.reportPath)}" target="_blank" rel="noopener">открыть</a>` : '<span class="muted">нет</span>';
    const displayStatus = r._leadbridgePhoneStatus || r.versionStatus || '';
    const originalStatus = r._leadbridgeOriginalVersionStatus && r._leadbridgeOriginalVersionStatus !== displayStatus ? ` title="OCR status: ${escAttr(r._leadbridgeOriginalVersionStatus)}"` : '';
    const id = `#${esc(r.messageIndex||'')}${r.attachmentPath?`<div class="muted small">${esc(r.attachmentPath)}</div>`:''}${displayStatus?`<div class="pill ${String(displayStatus).toUpperCase()==='CURRENT'?'max':'warn'}"${originalStatus}>${esc(displayStatus)}</div>`:''}`;
    const comment = [r.comment, r.reply?`reply: ${r.reply}`:''].filter(Boolean).join('\n');
    return `<tr><td><span class="pill max">${esc(r.sourceKind || 'анкета')}</span></td><td>${id}</td><td class="nowrap">${esc(phone)}</td><td>${esc(r.fullName)}</td><td class="muted">—</td><td class="muted">—</td><td>${esc(formatDate(r.messageDate))}</td><td class="muted">—</td><td class="muted">—</td><td>${link}</td><td class="comment">${esc(comment)}</td></tr>`;
  }
  const idLink = r.id && safeAmoUrl(r.dealUrl) ? `<a href="${escAttr(safeAmoUrl(r.dealUrl))}" target="_blank" rel="noopener">${esc(r.id)}</a>${safeAmoUrl(r.otherLeadsUrl)?`<div><a class="dup-chip" href="${escAttr(safeAmoUrl(r.otherLeadsUrl))}" target="_blank" rel="noopener">дубль</a></div>`:''}` : '<span class="muted">—</span>';
  const visit = clean(r.visitDate) ? esc(formatDate(r.visitDate)) : '<span class="muted">пусто</span>';
  const city = [r.city, r.region].filter(Boolean).join(' / ');
  return `<tr><td><span class="pill amo">amoCRM</span></td><td>${idLink}</td><td class="nowrap">${esc(phone)}</td><td>${esc(r.fullName)}</td><td>${esc(r.responsible)}</td><td>${esc(city)}</td><td class="muted">—</td><td>${visit}</td><td>${esc(formatDate(r.createdAt))}</td><td class="muted">—</td><td class="comment">${esc(r.comment)}</td></tr>`;
}
function currentAppCss(){
  const chunks=[];
  for(const sheet of document.styleSheets){
    try{ chunks.push([...sheet.cssRules].map(rule=>rule.cssText).join('\n')); } catch(_){ /* same-origin CSS only */ }
  }
  return chunks.join('\n');
}
function buildStandaloneReportHtml(imageMap){
  const css = currentAppCss() + `\n.top,.source-files,.filter-panel,.sticky-board,.loader,.notice{display:none!important}.wrap{padding:14px!important;max-width:1760px!important}.match{break-inside:avoid}.report-meta{margin:4px 0 14px;color:var(--muted)}`;
  const missing = [...imageMap.values()].filter(x=>!x.file).length;
  const warning = missing ? `<div class="notice bad" style="display:block!important">Не найдены картинки для ${missing} анкет. Для полного архива выбери папку attachments перед скачиванием отчёта.</div>` : '';
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>LeadBridge report</title><style>${css}</style></head><body data-theme="${document.body.dataset.theme || 'dark'}"><main class="wrap"><h1>LeadBridge: поиск сделок по анкетам КСО</h1><div class="report-meta">Авторство и идея разработки: Бочаров Ю.С. · ${esc(new Date().toLocaleString('ru-RU'))}<br>MAX: ${esc(state.maxFileName)} · amoCRM: ${esc(state.amoFileName)} · изображений в архиве: ${[...imageMap.values()].filter(x=>x.file).length}</div>${warning}${state.filtered.map(g=>renderGroupForReport(g, imageMap)).join('')}</main></body></html>`;
}

function downloadUnmatchedCsv(kind){
  const matched = new Set();
  state.groups.forEach(g=>g[kind==='max'?'max':'amoAll'].forEach(r=>matched.add(kind==='max' ? r.messageIndex+'|'+r.attachmentPath : r.id)));
  let rows;
  if(kind==='max'){
    rows = state.maxRows.filter(r=>!matched.has(r.messageIndex+'|'+r.attachmentPath)).map(r=>({phones:r.phones.join(';'),message_index:r.messageIndex,message_date:formatDate(r.messageDate),full_name:r.fullName,link:r.messageUrl,attachment:r.attachmentPath,comment:r.comment}));
  } else {
    rows = state.amoRows.filter(r=>!matched.has(r.id)).map(r=>({phones:r.phones.join(';'),lead_id:r.id,lead_link:r.dealUrl,full_name:r.fullName,responsible:r.responsible,city:r.city,region:r.region,visit_date:formatDate(r.visitDate),created_date:formatDate(r.createdAt), close_reason:r.closeReason||'', selection_reason:r._leadbridgeSelectReason||''}));
  }
  if(!confirmMobileExport(kind==='max'?'MAX без совпадений CSV':'amoCRM без совпадений CSV', rows.length)) return;
  download(kind==='max'?'max_unmatched.csv':'amocrm_unmatched.csv', toCsv(rows), 'text/csv;charset=utf-8');
}



function utf8(s){ return new TextEncoder().encode(String(s ?? '')); }
const CRC_TABLE = (()=>{ const t=new Uint32Array(256); for(let n=0;n<256;n++){ let c=n; for(let k=0;k<8;k++) c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1); t[n]=c>>>0; } return t; })();
function crc32(data){ let c=0xffffffff; for(let i=0;i<data.length;i++) c=CRC_TABLE[(c^data[i])&255]^(c>>>8); return (c^0xffffffff)>>>0; }
function dosDateTime(d=new Date()){
  const time = ((d.getHours()&31)<<11)|((d.getMinutes()&63)<<5)|((Math.floor(d.getSeconds()/2))&31);
  const date = (((d.getFullYear()-1980)&127)<<9)|(((d.getMonth()+1)&15)<<5)|(d.getDate()&31);
  return {time,date};
}
function push16(arr,n){ arr.push(n&255,(n>>>8)&255); }
function push32(arr,n){ arr.push(n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255); }
function concatU8(parts){ const len=parts.reduce((s,p)=>s+p.length,0); const out=new Uint8Array(len); let off=0; for(const p of parts){ out.set(p,off); off+=p.length; } return out; }
function createZip(files){
  const localParts=[], centralParts=[]; let offset=0; const now=dosDateTime();
  for(const f of files){
    const nameBytes=utf8(f.name.replace(/^\/+/,'').replace(/\\/g,'/'));
    const data = f.data instanceof Uint8Array ? f.data : new Uint8Array(f.data);
    const crc=crc32(data), size=data.length;
    const local=[];
    push32(local,0x04034b50); push16(local,20); push16(local,0); push16(local,0); push16(local,now.time); push16(local,now.date); push32(local,crc); push32(local,size); push32(local,size); push16(local,nameBytes.length); push16(local,0);
    const localHeader=concatU8([new Uint8Array(local), nameBytes, data]);
    localParts.push(localHeader);
    const central=[];
    push32(central,0x02014b50); push16(central,20); push16(central,20); push16(central,0); push16(central,0); push16(central,now.time); push16(central,now.date); push32(central,crc); push32(central,size); push32(central,size); push16(central,nameBytes.length); push16(central,0); push16(central,0); push16(central,0); push16(central,0); push32(central,0); push32(central,offset);
    centralParts.push(concatU8([new Uint8Array(central), nameBytes]));
    offset += localHeader.length;
  }
  const centralDir=concatU8(centralParts);
  const end=[]; push32(end,0x06054b50); push16(end,0); push16(end,0); push16(end,files.length); push16(end,files.length); push32(end,centralDir.length); push32(end,offset); push16(end,0);
  return concatU8([...localParts, centralDir, new Uint8Array(end)]);
}

function syncFixedTop(){
  const top = document.querySelector('.top');
  if(!top) return;
  if(isMobileConstrained()){
    document.documentElement.style.setProperty('--top-max', 'none');
    document.documentElement.style.setProperty('--top-offset', '0px');
    return;
  }
  const maxH = Math.max(230, Math.floor(window.innerHeight * 0.58));
  document.documentElement.style.setProperty('--top-max', maxH + 'px');
  // top is fixed, so reserve exactly its visible height in normal document flow.
  // requestAnimationFrame prevents stale height reads after filters/stats/buttons change.
  requestAnimationFrame(()=>{
    const h = Math.ceil(top.getBoundingClientRect().height || 0);
    document.documentElement.style.setProperty('--top-offset', h + 'px');
  });
}
let topResizeObserver = null;
function initFixedTop(){
  syncFixedTop();
  window.addEventListener('resize', syncFixedTop, {passive:true});
  if('ResizeObserver' in window){
    topResizeObserver = new ResizeObserver(()=>syncFixedTop());
    topResizeObserver.observe(document.querySelector('.top'));
  }
  setTimeout(syncFixedTop, 80);
  setTimeout(syncFixedTop, 400);
}


function applyTheme(theme){
  const value = theme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = value;
  document.body.dataset.theme = value;
  try{ localStorage.setItem('leadbridge.theme', value); }catch(_){ /* storage can be unavailable in private/native contexts */ }
  const btn = $('themeToggleBtn');
  if(btn){
    btn.title = value === 'light' ? 'Светлая тема. Нажми для тёмной' : 'Тёмная тема. Нажми для светлой';
    btn.innerHTML = value === 'light'
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.6 6.6 0 0 0 9.8 9.8z"/></svg>';
  }
}
function toggleTheme(){
  applyTheme(document.body.dataset.theme === 'light' ? 'dark' : 'light');
  syncFixedTop();
}
function initTheme(){
  let saved='dark';
  try{ saved=localStorage.getItem('leadbridge.theme') || 'dark'; }catch(_){ /* use default */ }
  applyTheme(saved);
}

let deferredInstallPrompt = null;
function initPwaInstall(){
  const btn = $('pwaInstallBtn');
  window.addEventListener('beforeinstallprompt', (event)=>{
    event.preventDefault();
    deferredInstallPrompt = event;
    if(btn) btn.classList.remove('hidden');
    syncFixedTop();
  });
  window.addEventListener('appinstalled', ()=>{
    deferredInstallPrompt = null;
    if(btn) btn.classList.add('hidden');
    setNotice('LeadBridge установлен как PWA. Файлы по-прежнему выбираются и обрабатываются локально.');
    syncFixedTop();
  });
}
async function installPwa(){
  if(!deferredInstallPrompt){
    setNotice('Если кнопка установки недоступна, открой меню браузера и выбери установку приложения / добавление на экран. На iPhone это делается через «Поделиться» → «На экран Домой».');
    return;
  }
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice.catch(()=>null);
  deferredInstallPrompt = null;
  const btn = $('pwaInstallBtn');
  if(btn) btn.classList.add('hidden');
  syncFixedTop();
}
function registerServiceWorker(){
  if(!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
  let reloadingForSw = false;
  navigator.serviceWorker.addEventListener('controllerchange', ()=>{
    if(reloadingForSw) return;
    reloadingForSw = true;
    if(!state.maxRows.length && !state.amoRows.length && !state.imageFiles.size) location.reload();
    else setNotice('LeadBridge обновился. Когда закончишь текущую работу, закрой и снова открой PWA, чтобы применить новую версию.');
  });
  navigator.serviceWorker.register(repoAssetUrl('service-worker.js'), {updateViaCache:'none'}).then(reg=>{
    reg.addEventListener('updatefound', ()=>{
      const worker = reg.installing;
      if(!worker) return;
      worker.addEventListener('statechange', ()=>{
        if(worker.state === 'installed' && navigator.serviceWorker.controller){
          worker.postMessage({type:'SKIP_WAITING'});
        }
      });
    });
    reg.update().catch(()=>null);
  }).catch(err=>{
    console.info('LeadBridge service worker registration failed', err);
  });
}
function initMobileMode(){
  setMobileMode();
  window.addEventListener('resize', setMobileMode, {passive:true});
  window.addEventListener('orientationchange', ()=>setTimeout(setMobileMode, 250), {passive:true});
}

function initActions(){
  document.addEventListener('click', (event)=>{
    const control = event.target.closest('[data-action]');
    if(!control) return;
    const action = control.dataset.action;
    if((action === 'close-preview-backdrop' || action === 'close-match-details-backdrop') && event.target !== control) return;
    if(action === 'download-csv') downloadUnifiedCsv();
    else if(action === 'download-markdown') downloadMarkdown();
    else if(action === 'download-html') void downloadHtmlReport();
    else if(action === 'download-unmatched') downloadUnmatchedCsv(control.dataset.kind);
    else if(action === 'run') void run();
    else if(action === 'install-pwa') void installPwa();
    else if(action === 'reset') resetAll();
    else if(action === 'toggle-theme') toggleTheme();
    else if(action === 'switch-view') setAppView(control.dataset.view, {focus:true});
    else if(action === 'amo-source-mode') setAmoSourceMode(control.dataset.mode);
    else if(action === 'toggle-amo-token') toggleAmoTokenVisibility();
    else if(action === 'load-amo-online') void loadAmoOnlineSnapshot();
    else if(action === 'delete-amo-cache') void deleteCachedAmoSnapshot();
    else if(action === 'cancel-amo-online') cancelAmoOnlineSnapshot();
    else if(action === 'pick-file') $(control.dataset.target)?.click();
    else if(action === 'show-more') showMoreResults();
    else if(action === 'copy-phone') void copyCardPhone(control.dataset.phone || '', control);
    else if(action === 'toggle-deals') toggleDealsPanel(control.dataset.groupId);
    else if(action === 'open-match-details') openMatchDetails(control.dataset.phone || '');
    else if(action === 'open-preview') openAnketaPreview(control.dataset.path || '');
    else if(action === 'close-preview' || action === 'close-preview-backdrop') closeAnketaPreview();
    else if(action === 'close-match-details' || action === 'close-match-details-backdrop') closeMatchDetails();
  });
}

function resetAll(){
  cancelAmoOnlineSnapshot();
  state.maxRaw=state.amoRaw=null; state.maxRows=[]; state.amoRows=[]; state.groups=[]; state.filtered=[]; state.maxFileName=state.amoFileName=''; state.imageFiles.clear(); state.imageFolderName=''; clearImages(); resetPickButtons();
  state.amoSourceKind='none'; state.amoLoadedAt=0; state.amoDeleteArmedUntil=0;
  ['fileMax','fileAmo','fileZip','fileImages'].forEach(id=>{ const el=$(id); if(el) el.value=''; });
  $('amoExecToken').value=''; $('amoExecToken').type='password'; $('amoTokenVisibility').setAttribute('aria-pressed','false'); $('amoTokenVisibility').setAttribute('aria-label','Показать токен'); $('amoTokenVisibility').title='Показать токен'; setAmoSourceMode('offline');
  $('infoMax').textContent='файл не загружен'; $('infoAmo').textContent='файл не загружен'; updateAmoOnlineButton(); updateImageSourceStatus(false, expectedZipMessage()); renderStartState(); const actions=$('reportActions'); if(actions) actions.classList.add('hidden'); updateMobileRunButton(); setAppView('sources', {scrollTop:true}); $('loader').textContent=''; $('loader').classList.add('hidden'); setNotice('Сброшено. Локальный слепок amoCRM сохранён и будет доступен в режиме «Онлайн /exec».');
}
function refreshResultsFromControls(rebuild=false){
  if(!state.groups.length){ toggleCrmVisitColumn(); return; }
  if(rebuild) buildGroups();
  applyFilters();
  render();
}
let filterSearchTimer=0;
$('filterSearch').addEventListener('input', ()=>{
  window.clearTimeout(filterSearchTimer);
  filterSearchTimer=window.setTimeout(()=>refreshResultsFromControls(false),180);
});
$('filterSearch').addEventListener('change', ()=>{
  window.clearTimeout(filterSearchTimer);
  refreshResultsFromControls(false);
});
['filterResponsible','filterCity','filterDateFrom','filterDateTo','sortBy','sortDir','onlyNoCrmVisit','showCrmVisitCol'].forEach(id=>{
  $(id).addEventListener('change', ()=>refreshResultsFromControls(false));
});
$('onlyCurrentMax').addEventListener('change', ()=>refreshResultsFromControls(true));
bindFileInput('max'); bindFileInput('amo'); bindImageFolder(); initActions(); initAmoOnlineSource(); $('appTabs')?.addEventListener('keydown', handleAppTabKeydown); document.addEventListener('keydown', e=>{ if(e.key!=='Escape') return; if(!$('anketaPreviewModal').classList.contains('hidden')) closeAnketaPreview(); else closeMatchDetails(); }); setAppView('sources'); initTheme(); initMobileMode(); toggleCrmVisitColumn(); initFixedTop(); checkReleaseManifest(); initPwaInstall(); updateMobileRunButton(); registerServiceWorker();
