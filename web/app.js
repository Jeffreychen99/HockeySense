const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clock = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
let state = {profiles:[], clips:[]}, selectedProfile = localStorage.getItem('hs-profile'), clip = null, reference = null, pendingReference = null, filter = 'all', active = -1, seen = new Set(), lastTime = 0, currentView = 'review', uploading = false;
const video = $('#video');
let editingSetup = false;
const recoveryLinks = {
  billing: ['Open API billing ↗', 'https://platform.openai.com/settings/organization/billing'],
  limits: ['View API limits ↗', 'https://platform.openai.com/settings/organization/limits'],
  projects: ['Open project settings ↗', 'https://platform.openai.com/settings/'],
  errors: ['Open troubleshooting guide ↗', 'https://developers.openai.com/api/docs/guides/error-codes'],
};
function recoveryHTML(recovery) {
  if (!recovery) return '';
  const links = (recovery.actions || []).filter(key => Object.hasOwn(recoveryLinks, key)).map(key => {
    const [label, url] = recoveryLinks[key];
    return `<a class="recovery-link" href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  }).join('');
  return `<div class="recovery-actions">${links}</div><p class="recovery-hint">Opens OpenAI in a new tab. Use the account and organization associated with this app’s API key. Your clip and player selection are saved here.</p>`;
}
function notice(message, error=false, recovery=null) {
  $('#notice').hidden = !message;
  $('#notice').innerHTML = `<span>${esc(message)}</span>${recoveryHTML(recovery)}`;
  $('#notice').classList.toggle('error', error);
}
async function api(path, body) {
  const response = await fetch(path, {...(body === undefined ? {} : {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)}), signal:AbortSignal.timeout(15000)});
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Something went wrong. Please retry.');
  return result;
}
function profile() { return state.profiles.find(p => p.id === selectedProfile); }
function reports() { return state.clips.filter(c => c.profile_id === selectedProfile && c.status === 'ready' && c.review_version === 6 && !c.review_disputed); }
function updateProfile() {
  const p = profile();
  $('#profile-label').textContent = p ? p.name : 'Create player profile';
  $('#avatar').textContent = p ? p.name.slice(0,2).toUpperCase() : 'P';
  $('#goals-strip').textContent = p ? `${p.position} · ${p.level}${p.play_like ? `  |  Play like: ${p.play_like}` : ''}${p.skate_like ? `  |  Skate like: ${p.skate_like}` : ''}` : 'Create a profile to personalize feedback and keep your progress together.';
  $('#practice-count').textContent = reports().reduce((n,c) => n + c.report.practice.length - (c.completed || []).length, 0);
  updateAnalyze();
}
function updateIdentity() {
  const color = $('#jersey-color').value.trim(), number = $('#jersey-number').value.trim();
  const identified = Boolean(reference || (color && number));
  $('#identity-banner').classList.toggle('identified', identified);
  $('#identity-title').textContent = reference ? `You are selected at ${clock(reference.time)}${color ? ` · ${color}` : ''}${number ? ` #${number}` : ''}` : color && number ? `Analyze only: ${color} #${number}` : 'First, tell us who you are on the ice.';
  $('#identity-subtitle').textContent = identified ? 'Only your play will be assessed. If the coach loses sight of you, it will withhold unsupported feedback.' : 'Pause on a clear frame and click Select myself, or enter your jersey color and number below.';
  $('#select-player').textContent = reference ? '⌖ Change selection' : '⌖ Select myself';
  $('#select-player').disabled = !clip; $('#mark').disabled = !clip;
  return identified;
}
function updateAnalyze() {
  const identified = updateIdentity();
  const busy = clip && ['queued','analyzing'].includes(clip.status);
  let action = 'analyze', label = clip?.status === 'ready' ? 'Analyze again ↗' : clip?.status === 'failed' ? 'Retry analysis ↗' : 'Analyze my shift ↗', message = 'Ready to review your selected player.', disabled = false;
  if (uploading) {
    action = 'wait'; label = 'Preparing your clip…'; message = 'Your video is uploading and being prepared for playback.'; disabled = true;
  } else if (busy) {
    action = 'wait'; label = 'Reviewing your shift…'; message = 'Your review is in progress. You can return to it from the clip library.'; disabled = true;
  } else if (!clip) {
    action = 'upload'; label = 'Upload a clip to continue'; message = 'Your jersey details identify you, but a video must be opened or uploaded before analysis.';
  } else if (!profile()) {
    action = 'profile'; label = 'Create player profile →'; message = 'Your player profile is still missing. Create one to keep your reviews and practice history together.';
  } else if (!identified) {
    action = 'identify'; label = 'Select myself →'; message = 'Click yourself in a frame, or enter both your jersey color and number.';
  } else if (!state.ffmpeg) {
    action = 'unavailable'; label = 'Video processing unavailable'; message = 'FFmpeg is missing on the server. Install it and restart HockeySense.'; disabled = true;
  } else if (!state.configured) {
    action = 'unavailable'; label = 'AI coaching needs setup'; message = 'The server needs OPENAI_API_KEY. Set it and restart HockeySense to enable analysis.'; disabled = true;
  } else {
    const start = Number($('#start').value), end = Number($('#end').value);
    if (!$('#start').value || !$('#end').value || !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end > clip.duration || end - start < 1) {
      action = 'interval'; label = 'Adjust the review interval'; message = 'Choose at least one second within the video’s duration. All selected sections run automatically.'; disabled = true;
    }
  }
  $('#analyze').disabled = disabled;
  $('#analyze').dataset.action = action;
  $('#analyze').textContent = label;
  $('#analysis-readiness').textContent = message;
}
async function refresh() {
  state = await api('/api/state');
  if (!profile() && state.profiles.length) selectedProfile = state.profiles[0].id;
  updateProfile();
  if (clip) {
    const latest = state.clips.find(c => c.id === clip.id);
    if (latest && (latest.status !== clip.status || JSON.stringify(latest.progress) !== JSON.stringify(clip.progress))) {
      clip = latest; renderReport(); updateAnalyze();
      if (clip.status === 'ready') notice('Your complete review is ready. All selected sections have been analyzed. Coaching pauses are optional.');
      if (clip.status === 'failed') notice(clip.error, true, clip.error_recovery);
    }
  }
  if (currentView === 'practice') renderPractice();
  if (currentView === 'history') renderHistory();
}
function showView(view) {
  currentView = view;
  const titles = {review:['Film room','Your game, sharper.','Turn your shifts into small changes that make a big difference.'],practice:['Practice plan','Make the next shift better.','Your recurring themes, focused drills, and a plan to bring onto the ice.'],history:['Clip library','Every shift builds on the last.','Revisit your clips and see the feedback behind your practice plan.']};
  $('#page-label').textContent = titles[view][0]; $('#heading').textContent = titles[view][1]; $('#subheading').textContent = titles[view][2];
  ['review','practice','history'].forEach(v => $(`#${v}-view`).hidden = v !== view);
  document.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('active',b.dataset.view === view));
  updateReviewLayout();
  if (view !== 'review') video.pause();
  if (view === 'practice') renderPractice();
  if (view === 'history') renderHistory();
}
document.querySelectorAll('[data-view]').forEach(b => b.onclick = () => showView(b.dataset.view));
function loadPlayback(c, preserveTime=false) {
  const filename = $('#quality').value === 'original' ? c.filename : c.playback_filename || c.filename;
  const src = `/media/${filename}`;
  if (video.getAttribute('src') === src) return; // Keep the existing buffer when reopening a clip.
  const time = preserveTime ? video.currentTime : 0;
  const resume = preserveTime && !video.paused;
  video.pause();
  video.preload = 'auto';
  video.src = src;
  video.onloadedmetadata = () => {
    if (time) video.currentTime = Math.min(time, video.duration);
    video.playbackRate = +$('#speed').value;
    updateReference();
    if (resume) video.play().catch(() => {});
  };
  video.load();
}
$('#quality').onchange = () => { if (clip) loadPlayback(clip, true); };
function selectClip(c) {
  editingSetup = false;
  localStorage.setItem('hs-clip', c.id);
  const sameClip = clip?.id === c.id;
  video.pause(); clip = c; reference = c.reference || null; active = -1; seen.clear(); lastTime = sameClip ? video.currentTime : 0;
  if (c.profile_id) {selectedProfile = c.profile_id; localStorage.setItem('hs-profile', selectedProfile); updateProfile();}
  loadPlayback(c); $('#video-empty').hidden = true;
  $('#clip-title').textContent = c.title;
  $('#description').value = c.description || '';
  $('#jersey-color').value = c.jersey_color || ''; $('#jersey-number').value = c.jersey_number || '';
  $('#start').value = c.start ?? 0; $('#end').value = c.end ?? c.duration;
  $('#end').max = c.duration; $('#start').max = c.duration;
  updateReference(); renderReport(); updateAnalyze(); showView('review');
}
function reportMatchesSelection() {
  return clip && selectedProfile === clip.profile_id && JSON.stringify(reference) === JSON.stringify(clip.reference || null) && $('#jersey-color').value.trim() === (clip.jersey_color || '') && $('#jersey-number').value.trim() === (clip.jersey_number || '') && $('#description').value.trim() === (clip.description || '') && +$('#start').value === clip.start && +$('#end').value === clip.end;
}
function selectionChanged() {
  seen.clear(); active = -1; updateAnalyze();
  if (clip?.report) renderReport();
}
$('#full-clip').onclick = () => {
  if (!clip) return notice('Upload or open a clip first.', true);
  $('#start').value = 0; $('#end').value = clip.duration; selectionChanged();
};
function renderProgress() {
  const busy = clip && ['queued','analyzing'].includes(clip.status);
  $('#analysis-progress').hidden = !busy;
  if (!busy) return;
  const p = clip.progress || {};
  const done = p.completed || 0, total = p.total || 0;
  $('#analysis-progress').innerHTML = `<h3>${total ? `Reviewing section ${Math.min(p.current || done+1,total)} of ${total}` : 'Preparing your full review'}</h3><progress max="${total || 1}" ${total ? `value="${done}"` : ''}></progress><p>${esc(p.message || 'Review queued.')}</p><small>${done} sections saved${total ? ` of ${total}` : ''}. You can leave this page and return later; keep HockeySense running.</small>`;
}
// Prioritize actual corrections by impact and evidence; never invent category flaws.
function priorityIssues(report) {
  const weight = {high:3, medium:2, low:1};
  const groups = new Map();
  (report.moments || []).forEach((m,index) => {
    if (m.assessment !== 'supported_correction' || !m.evidence || !m.game_situation || m.confidence === 'low') return;
    const key = m.title.trim().toLowerCase();
    if (!groups.has(key)) groups.set(key, {title:m.title, items:[], score:0});
    const group = groups.get(key);
    group.items.push({...m,index});
    group.score = Math.max(group.score, (weight[m.impact] || 1)*10+(weight[m.confidence] || 1));
  });
  return [...groups.values()].sort((a,b)=>b.score-a.score).slice(0,5);
}
function issueSummaryHTML(report) {
  const issues = priorityIssues(report);
  return `<div class="eyebrow">YOUR SHIFT, IN PERSPECTIVE</div><h2>What to work on</h2>${issues.length ? `<ol class="issue-list">${issues.map(issue => `<li><details class="issue"><summary><span>${esc(issue.title)}</span><span class="issue-count">${issue.items.length} ${issue.items.length === 1 ? 'moment' : 'moments'}</span></summary><ul>${[...issue.items].sort((a,b) => ({high:3,medium:2,low:1}[b.confidence] || 1)-({high:3,medium:2,low:1}[a.confidence] || 1)).slice(0,3).sort((a,b) => a.time-b.time).map(m => `<li><button class="time" data-issue-moment="${m.index}" aria-label="Watch coaching moment at ${clock(m.time)}">▶ ${clock(m.time)}</button><span>${esc(m.better_option)}${m.confidence === 'low' ? '<small>Limited confidence</small>' : ''}</span></li>`).join('')}</ul></details></li>`).join('')}</ol>` : '<p>No clear improvement areas were supported by this footage.</p>'}${report.strengths?.length ? `<details class="positive-feedback issue"><summary>✓ Keep doing this <span class="issue-count">Positive feedback</span></summary><ul>${report.strengths.slice(0,3).map(s => `<li>${esc(s)}</li>`).join('')}</ul></details>` : ''}`;
}
function updateReviewLayout() {
  const reviewing = !!clip && ['queued', 'analyzing', 'ready'].includes(clip.status);
  const focused = reviewing && !editingSetup && (clip.status !== 'ready' || (clip.review_version === 6 && !clip.review_disputed));
  $('#review-view').classList.toggle('focused-review', focused);
  $('#clip-setup').hidden = focused;
  $('#identity-banner').hidden = focused;
  $('#review-toolbar').hidden = !reviewing;
  $('#edit-setup').textContent = editingSetup ? 'Back to review' : 'Edit setup';
  $('#edit-setup').disabled = !!clip && ['queued', 'analyzing'].includes(clip.status);
  $('#review-player').textContent = clip ? [clip.profile_snapshot?.name, clip.jersey_color, clip.jersey_number ? `#${clip.jersey_number}` : ''].filter(Boolean).join(' · ') : '';
  $('#review-range').textContent = clip ? `${clock(clip.start || 0)}–${clock(clip.end || clip.duration)} · ${clip.status === 'ready' ? 'Review complete' : 'Review in progress'}` : '';
  if (currentView === 'review') {
    $('#heading').textContent = focused ? (clip.status === 'ready' ? 'Your shift, reviewed.' : 'Reviewing your shift…') : 'Your game, sharper.';
    $('#subheading').textContent = focused ? (clip.status === 'ready' ? 'Start with your priorities, then explore the moments behind them.' : 'We’ll review the entire selected sequence. You can step away and come back.') : 'Turn your shifts into small changes that make a big difference.';
  }
}
$('#edit-setup').onclick = () => {
  if (editingSetup) selectClip(clip); // Restore saved settings when leaving unsent edits.
  else {
    editingSetup = true;
    updateReviewLayout();
    $('#clip-setup').scrollIntoView({behavior: 'smooth', block: 'start'});
    $('#jersey-color').focus({preventScroll: true});
  }
};
function renderReport() {
  if (!clip) return;
  updateReviewLayout();
  renderProgress();
  $('#clip-status').textContent = clip.review_disputed ? 'REVIEW DISPUTED' : clip.status === 'ready' && clip.review_version !== 6 ? 'EARLIER REVIEW' : {uploaded:'CLIP READY',queued:'QUEUED',analyzing:'IN REVIEW',ready:'REVIEW COMPLETE',failed:'RETRY NEEDED'}[clip.status];
  const report = reportMatchesSelection() && clip.review_version === 6 && !clip.review_disputed ? clip.report : null;
  $('#moment-count').textContent = report?.moments.length || 0;
  $('#timeline').innerHTML = report ? report.moments.map((m,i) => `<button style="left:${100*m.time/clip.duration}%" data-moment="${i}" aria-label="${esc(m.title)} at ${clock(m.time)}" title="${esc(m.title)}"></button>`).join('') : '';
  $('#timeline').querySelectorAll('button').forEach(b => b.onclick = () => selectMoment(+b.dataset.moment));
  $('#report-summary').hidden = !report;
  if (report) {
    $('#report-summary').innerHTML = issueSummaryHTML(report);
    $('#report-summary').querySelectorAll('[data-issue-moment]').forEach(button => {
      button.onclick = () => {
        selectMoment(Number(button.dataset.issueMoment));
        video.scrollIntoView({behavior: 'smooth', block: 'center'});
      };
    });
    renderMoments();
  } else {
    const busy = ['queued','analyzing'].includes(clip.status);
    $('#moments').innerHTML = `<div class="empty-coaching"><span class="coach-symbol">${busy ? '◌' : '✧'}</span><h3>${busy ? 'Looking for your next improvement.' : clip.status === 'failed' ? esc(clip.error_recovery?.title || 'Let’s try that review again.') : clip.report ? (clip.review_disputed ? 'This review is unreliable.' : clip.review_version !== 6 ? 'This review needs updated evidence checks.' : 'Your selection has changed.') : 'Your clip is ready.'}</h3><p>${esc(busy ? 'The review continues automatically through every selected section. The complete report will appear here when all sections finish.' : clip.error || (clip.report ? (clip.review_disputed ? 'Your corrections revealed factual errors in this review. Its remaining findings are not verified and are excluded from coaching and practice priorities. The saved report and your corrections are preserved.' : 'Analyze again to apply the stricter evidence checks. This earlier report is preserved, but excluded from current coaching and practice priorities.') : 'Identify your player and choose a sequence. Your coach will connect key moments to clear, actionable feedback.'))}</p>${clip.status === 'failed' ? recoveryHTML(clip.error_recovery) : ''}</div>`;
  }
}
function renderMoments() {
  const moments = reportMatchesSelection() ? (clip.review_version === 6 && !clip.review_disputed ? clip.report?.moments : []) || [] : [];
  const visible = moments.map((m,i)=>({...m,i})).filter(m => filter === 'all' || (filter === 'tactics' ? m.category !== 'Skating' : m.category === filter));
  $('#moments').innerHTML = visible.length ? visible.map(m => `<article class="moment ${active===m.i?'active':''}" data-index="${m.i}"><div class="moment-top"><button class="time">▶ ${clock(m.time)}</button><span>${esc(m.category)}</span><span>${esc(m.confidence)} confidence</span></div><h3>${esc(m.title)}</h3><p>${esc(m.observation)}</p><div class="detail"><b>VISIBLE EVIDENCE</b><p>${esc(m.evidence)}</p><b>GAME SITUATION</b><p>${esc(m.game_situation)}</p><b>WHY IT MATTERS</b><p>${esc(m.why)}</p><b>TRY THIS INSTEAD</b><p>${esc(m.better_option)}</p><p class="cue">On-ice cue: ${esc(m.cue)}</p>${m.style_connection?`<p class="style-connection">${esc(m.style_connection)}</p>`:''}<button class="secondary resume">Continue watching →</button></div></article>`).join('') : '<div class="empty-coaching"><h3>No supported moments here yet.</h3><p>Try another category, or a closer angle with your player clearly identified.</p></div>';
  $('#moments').querySelectorAll('.moment').forEach(el => {el.onclick = e => {if(e.target.closest('.resume')) {video.play().catch(()=>{}); return;} selectMoment(+el.dataset.index);};});
}
function selectMoment(index, seek=true) {
  const m = clip?.report?.moments[index]; if (!m) return;
  active = index; seen.add(index); filter = 'all'; document.querySelectorAll('[data-filter]').forEach(b => b.classList.toggle('selected', b.dataset.filter === 'all')); video.pause(); if (seek) {lastTime=m.time; video.currentTime=m.time;}
  renderMoments();
}
document.querySelectorAll('[data-filter]').forEach(b => b.onclick = () => {filter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(t=>t.classList.toggle('selected',t===b));if(clip?.report)renderMoments();});
video.ontimeupdate = () => {
  const t = video.currentTime;
  $('#player-pin').hidden = !reference || Math.abs(t-reference.time)>.6;
  if ($('#auto-pause').checked && !video.paused && !video.seeking) {
    const moments=reportMatchesSelection() ? (clip.review_version === 6 && !clip.review_disputed ? clip.report?.moments : []) || [] : [];
    const i=moments.findIndex((m,i)=>!seen.has(i) && m.time>=lastTime-.05 && m.time<=t);
    if(i>=0) {selectMoment(i);return;}
  }
  lastTime=t;
};
video.onseeked = () => {lastTime=video.currentTime; (clip?.report?.moments || []).forEach((m,i)=>{if(m.time>video.currentTime+.1)seen.delete(i);});};
$('#speed').onchange = () => video.playbackRate=+$('#speed').value;
function openPlayerSelection() {
  if (!clip || video.readyState < 2) return notice('Wait for the video to load, then pause on a frame where you are visible.', true);
  video.pause();
  const canvas = $('#selection-canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  pendingReference = null; $('#selection-pin').hidden = true; $('#confirm-player').disabled = true;
  $('#selection-time').textContent = `Paused at ${clock(video.currentTime)} · Click yourself to continue`;
  $('#player-dialog').showModal();
}
$('#mark').onclick = openPlayerSelection; $('#select-player').onclick = openPlayerSelection;
$('#player-close').onclick = () => $('#player-dialog').close();
$('#selection-canvas').onclick = e => {
  const box=e.currentTarget.getBoundingClientRect();
  pendingReference={time:video.currentTime,x:Math.max(0,Math.min(1,(e.clientX-box.left)/box.width)),y:Math.max(0,Math.min(1,(e.clientY-box.top)/box.height))};
  $('#selection-pin').hidden=false; $('#selection-pin').style.left=`${pendingReference.x*100}%`; $('#selection-pin').style.top=`${pendingReference.y*100}%`;
  $('#selection-time').textContent=`Selected at ${clock(pendingReference.time)} · Confirm this is you`;
  $('#confirm-player').disabled=false;
};
$('#confirm-player').onclick = () => {
  if(!pendingReference)return;
  reference=pendingReference;$('#player-dialog').close();updateReference();selectionChanged();notice('You are selected. Add your jersey details if visible, then analyze your shift.');
};
for (const id of ['jersey-color','jersey-number','description','start','end']) $(`#${id}`).oninput=selectionChanged;
function updateReference() {
  $('#reference-label').textContent=reference?`Player marked at ${clock(reference.time)}. This identifies the reference frame; it is not automatic player tracking.`:'Review the entire clip or adjust the interval. All selected sections run automatically.';
  $('#player-pin').hidden=!reference;
  if(reference){const box=video.getBoundingClientRect();const ratio=video.videoWidth/video.videoHeight||16/9;const w=Math.min(box.width,box.height*ratio),h=w/ratio;$('#player-pin').style.left=`${(box.width-w)/2+reference.x*w}px`;$('#player-pin').style.top=`${(box.height-h)/2+reference.y*h}px`;}
}
video.onloadedmetadata=updateReference;window.addEventListener('resize',updateReference);
function uploadPicker(){if(!uploading)$('#file').click();}
$('#upload-open').onclick=uploadPicker;$('#empty-upload').onclick=uploadPicker;
$('#file').onchange=()=>uploadVideo($('#file').files[0]);
async function uploadVideo(file){
  if(!file)return;
  if(uploading)return notice('Please wait for the current upload to finish.',true);
  if(!file.type.startsWith('video/') && !/\.(mp4|mov|webm|mkv|avi|m4v|mpeg|mpg|mts|m2ts|ogv|3gp)$/i.test(file.name))return notice('Please drop a video file, such as MP4, MOV, or WebM.',true);
  if(!file.size)return notice('This file is empty. Please choose another video.',true);
  if(file.size>500*1024*1024)return notice('Please choose a video smaller than 500 MB.',true);
  uploading=true;$('#upload-open').disabled=true;updateAnalyze();notice('Uploading and preparing your video for smooth playback…');
  try{
    const response=await fetch('/api/upload',{method:'POST',headers:{'Content-Type':'application/octet-stream','X-Filename':encodeURIComponent(file.name)},body:file});
    const result=await response.json();if(!response.ok)throw new Error(result.error);
    await refresh();selectClip(result);notice('Clip ready. Describe your player, then analyze a sequence.');
  }catch(error){notice(error.message,true);}finally{uploading=false;$('#upload-open').disabled=false;$('#file').value='';updateAnalyze();}
};
// Handle file drops across the workspace without letting the browser navigate away.
let fileDragDepth = 0;
function isFileDrag(event) { return Array.from(event.dataTransfer?.types || []).includes('Files'); }
function clearDropTarget() { fileDragDepth = 0; $('#drop-overlay').hidden = true; }
window.addEventListener('dragenter', event => {
  if (!isFileDrag(event)) return;
  event.preventDefault(); fileDragDepth++;
  $('#drop-overlay').hidden = false;
  $('#drop-message').textContent = uploading ? 'An upload is already in progress' : 'Drop your video to upload';
});
window.addEventListener('dragover', event => {
  if (!isFileDrag(event)) return;
  event.preventDefault(); event.dataTransfer.dropEffect = uploading ? 'none' : 'copy';
});
window.addEventListener('dragleave', event => {
  if (!isFileDrag(event)) return;
  fileDragDepth = Math.max(0, fileDragDepth - 1);
  if (!fileDragDepth) clearDropTarget();
});
window.addEventListener('drop', event => {
  if (!isFileDrag(event)) return;
  event.preventDefault(); clearDropTarget();
  const files = Array.from(event.dataTransfer.files);
  if (files.length !== 1) return notice('Drop one video at a time.', true);
  uploadVideo(files[0]);
});
window.addEventListener('dragend', clearDropTarget);
window.addEventListener('blur', clearDropTarget);
$('#analyze').onclick=async()=>{
  updateAnalyze();
  if ($('#analyze').disabled) return;
  const action = $('#analyze').dataset.action;
  if (action === 'upload') return uploadPicker();
  if (action === 'profile') return $('#profile-open').click();
  if (action === 'identify') return openPlayerSelection();
  if (action !== 'analyze') return;
  $('#analyze').disabled=true;
  try{clip=await api('/api/analyze',{id:clip.id,profile_id:selectedProfile,description:$('#description').value,jersey_color:$('#jersey-color').value,jersey_number:$('#jersey-number').value,start:+$('#start').value,end:+$('#end').value,reference});editingSetup=false;seen.clear();active=-1;renderReport();$('#review-toolbar').scrollIntoView({behavior:'smooth',block:'start'});notice('Full review started. All selected sections will run automatically; you can leave and return when it is complete.');}
  catch(error){notice(error.message,true);}finally{updateAnalyze();}
};
function fillProfile(id){const p=state.profiles.find(p=>p.id===id);for(const name of ['name','position','level','play_like','skate_like']){const input=$(`#profile-form [name="${name}"]`);input.value=p?.[name] || (name==='position'?'Forward':name==='level'?'Recreational':'');}}
$('#profile-open').onclick=()=>{ $('#profile-select').innerHTML='<option value="">＋ Create a new player</option>'+state.profiles.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('');$('#profile-select').value=selectedProfile||'';fillProfile(selectedProfile);$('#profile-dialog').showModal();};
$('#profile-select').onchange=()=>fillProfile($('#profile-select').value);
$('#profile-close').onclick=()=>$('#profile-dialog').close();
$('#profile-form').onsubmit=async e=>{e.preventDefault();const submit=e.submitter;submit.disabled=true;try{const body=Object.fromEntries(new FormData(e.target));body.id=$('#profile-select').value||undefined;const p=await api('/api/profiles',body);selectedProfile=p.id;localStorage.setItem('hs-profile',p.id);await refresh();$('#profile-dialog').close();notice(`Profile saved for ${p.name}.`);}catch(error){notice(error.message,true);}finally{submit.disabled=false;}};
function renderPractice(){
  const clips=reports(), moments=clips.flatMap(c=>c.report.moments), drills=clips.flatMap(c=>c.report.practice.map((d,i)=>({...d,i,clip:c}))), counts={};
  clips.forEach(c=>new Set(c.report.moments.filter(m=>m.confidence!=='low').map(m=>m.category)).forEach(k=>counts[k]=(counts[k]||0)+1));
  $('#stats').innerHTML=[ [clips.length,'Clips reviewed'],[moments.length,'Teaching moments'],[drills.filter(d=>(d.clip.completed||[]).includes(d.i)).length,'Drills practiced'] ].map(([n,s])=>`<div class="stat"><strong>${n}</strong><span>${s}</span></div>`).join('');
  $('#priorities').innerHTML=`<div class="eyebrow">FOCUS FOR YOUR NEXT SESSION</div><h2>Patterns across your clips</h2>${Object.entries(counts).sort((a,b)=>b[1]-a[1]).map(([k,n])=>`<div class="priority"><span>${esc(k)}</span><span class="bar" style="width:${Math.round(150*n/Math.max(1,clips.length))}px"></span><span>Observed in ${n} ${n===1?'clip':'clips'}</span></div>`).join('') || '<p>After a review, supported coaching themes will collect here. A recurring theme is a practice priority, not a performance score.</p>'}`;
  $('#practice-list').innerHTML=drills.length?drills.map(d=>`<article class="panel drill ${(d.clip.completed||[]).includes(d.i)?'completed':''}"><div class="eyebrow">${esc(d.category)}</div><h3>${esc(d.title)}</h3><p>${esc(d.instructions)}</p><p><b>Session:</b> ${esc(d.dose)}</p><p><b>Look for:</b> ${esc(d.success_measure)}</p>${d.style_connection?`<p class="style-connection">${esc(d.style_connection)}</p>`:''}<small>From ${esc(d.clip.title)} · Addresses ${(d.moment_times || []).map(clock).join(', ')}</small><label><input type="checkbox" data-clip="${d.clip.id}" data-index="${d.i}" ${(d.clip.completed||[]).includes(d.i)?'checked':''}>Practiced this drill</label></article>`).join(''):'<div class="panel empty-section"><h2>A plan built from your play.</h2><p>Analyze a clip to get specific drills connected to your game and style goals.</p></div>';
  $('#practice-list').querySelectorAll('input').forEach(input=>input.onchange=async()=>{try{await api('/api/practice',{id:input.dataset.clip,index:+input.dataset.index,done:input.checked});await refresh();}catch(error){input.checked=!input.checked;notice(error.message,true);}});
}
function renderHistory(){
  const clips=state.clips.filter(c=>!c.profile_id||c.profile_id===selectedProfile);
  $('#history-list').innerHTML=clips.length?clips.map(c=>`<button class="panel clip-card" data-id="${c.id}"><div class="clip-art">▷</div><span class="tag">${esc(c.status)}</span><h3>${esc(c.title)}</h3><p>${clock(c.duration)} · ${new Date(c.created).toLocaleDateString()} · ${c.report?.moments.length||0} teaching moments</p><span class="style-connection">Open in film room →</span></button>`).join(''):'<div class="panel empty-section"><h2>Your film room starts here.</h2><p>Upload a clip to begin building your coaching history.</p></div>';
  $('#history-list').querySelectorAll('[data-id]').forEach(b=>b.onclick=()=>selectClip(state.clips.find(c=>c.id===b.dataset.id)));
}
refresh().then(()=>{const saved = state.clips.find(c => c.id === localStorage.getItem('hs-clip')); if(saved)selectClip(saved); if(!state.ffmpeg)notice('Install ffmpeg to enable video uploads and analysis.',true);else if(!state.configured)notice('The workspace is ready. Set OPENAI_API_KEY on the server and restart to enable AI coaching.');}).catch(error=>notice(error.message,true));
let polling = false;
setInterval(async()=>{if(polling)return; if(state.clips.some(c=>['queued','analyzing'].includes(c.status)) || ['queued','analyzing'].includes(clip?.status)){polling=true;try{await refresh();}catch{notice('Connection interrupted. The server may still be reviewing; reconnecting automatically.');}finally{polling=false;}}},3000);
