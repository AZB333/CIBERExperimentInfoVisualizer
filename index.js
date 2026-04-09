const fileInput   = document.getElementById('fileInput');
const loadPasteBtn = document.getElementById('loadPaste');
const pasteArea   = document.getElementById('pasteArea');
const statusMsg   = document.getElementById('status-msg');
const dashboard   = document.getElementById('dashboard');
const resetBtn    = document.getElementById('resetBtn');

fileInput.addEventListener('change', e => {
	const file = e.target.files[0];
	if (!file) return;
	const reader = new FileReader();
	reader.onload = ev => parseAndRender(ev.target.result);
	reader.readAsText(file);
});

loadPasteBtn.addEventListener('click', () => {
	const text = pasteArea.value.trim();
	if (!text) { showStatus('Paste area is empty.', 'error'); return; }
	parseAndRender(text);
});

resetBtn.addEventListener('click', () => {
	dashboard.style.display = 'none';
	statusMsg.style.display = 'none';
	statusMsg.className = '';
	pasteArea.value = '';
	fileInput.value = '';
});

function showStatus(msg, type) {
	statusMsg.textContent = msg;
	statusMsg.className = type;
}

function parseAndRender(text) {
	let data;
	try {
	data = JSON.parse(text);
	} catch {
	showStatus('Invalid JSON — could not parse the file.', 'error');
	return;
	}
	if (Array.isArray(data)) data = data[0];
	if (!data || !Array.isArray(data.frames)) {
	showStatus('Unexpected format — expected an object with a "frames" array.', 'error');
	return;
	}
	statusMsg.style.display = 'none';
	renderDashboard(data);
}

function renderDashboard(data) {
	const frames = data.frames;

	document.getElementById('s-name').textContent = data.sessionName || 'Unknown session';
	document.getElementById('s-date').textContent = data.recordingDate || '';

	const duration = typeof data.duration === 'number' ? data.duration.toFixed(2) : '—';
	document.getElementById('m-duration').textContent = duration;

	let waterCount = 0, inWater = false;
	for (const f of frames) {
	if (f.recordingWater && !inWater)       { waterCount++; inWater = true; }
	else if (!f.recordingWater && inWater)  { inWater = false; }
	}
	document.getElementById('m-water').textContent = waterCount;

	// Checkpoint first-reached times
	const checkpointTimes = {};
	for (const f of frames) {
	const checkpoint = f.waypointReached;
	if (checkpoint != null && !(checkpoint in checkpointTimes)) checkpointTimes[checkpoint] = f.timestamp;
	}

	const finished = 8 in checkpointTimes;
	const badge = document.getElementById('s-badge');
	badge.innerHTML = finished
	? '<span class="badge badge-success">&#10003; Completed</span>'
	: '<span class="badge badge-danger">&#10005; Did not finish</span>';

	const checkpointList = document.getElementById('checkpoint-list');
	checkpointList.innerHTML = '';
	checkpointList.innerHTML = `
		<div class="checkpoint-row">
		<div class="checkpoint-dot hit">1</div>
		<span class="checkpoint-time">0s (0.00m)</span>`;
	for (let i = 2; i <= 8; i++) {
		const hit = i in checkpointTimes;
		checkpointList.innerHTML += `
			<div class="checkpoint-row">
			<div class="checkpoint-dot ${hit ? 'hit' : 'miss'}">${i}</div>
			${hit
				? `<span class="checkpoint-time">${checkpointTimes[i].toFixed(2)}s (${(checkpointTimes[i] / 60).toFixed(2)}m)</span>`
				: `<span class="checkpoint-none">not reached</span>`}
			</div>`;
	}

	// Phone events (transition-based)
	const phoneEvents = [];
	let inPhone = false, startTs = null;
	for (const f of frames) {
	if (f.isLookingAtPhone && !inPhone)      { inPhone = true;  startTs = f.timestamp; }
	else if (!f.isLookingAtPhone && inPhone)  { inPhone = false; phoneEvents.push({ dur: f.timestamp - startTs }); }
	}
	if (inPhone && startTs !== null) phoneEvents.push({ dur: frames[frames.length - 1].timestamp - startTs });

	document.getElementById('m-phone-count').textContent = phoneEvents.length;
	const avg = phoneEvents.length > 0 ? phoneEvents.reduce((s, e) => s + e.dur, 0) / phoneEvents.length : 0;
	document.getElementById('m-phone-avg').textContent = avg.toFixed(2);

	const totalDur = typeof data.duration === 'number' ? data.duration : frames[frames.length - 1]?.timestamp || 1;
	const phoneList = document.getElementById('phone-list');
	phoneList.innerHTML = '';

	if (phoneEvents.length === 0) {
	phoneList.innerHTML = '<p style="font-size:12px;color:var(--text-dim);font-style:italic;margin:0;">No phone usage detected</p>';
	} else {
	phoneEvents.forEach((ev, i) => {
		const pct = Math.max(2, (ev.dur / totalDur) * 100).toFixed(1);
		phoneList.innerHTML += `
		<div class="phone-event">
			<span class="phone-event-label">Event ${i + 1}</span>
			<div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
			<span class="bar-val">${ev.dur.toFixed(2)}s</span>
		</div>`;
	});
	const total = phoneEvents.reduce((s, e) => s + e.dur, 0);
	phoneList.innerHTML += `
		<div class="phone-summary">
		Total: ${total.toFixed(2)}s &nbsp;·&nbsp; ${((total / totalDur) * 100).toFixed(1)}% of session
		</div>`;
	}

	dashboard.style.display = 'block';
}
