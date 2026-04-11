document.addEventListener('DOMContentLoaded', () => {

	let _pathFrames = [];
	let _mapImageLoaded = false;

	const fileInput      = document.getElementById('fileInput');
	const loadPasteBtn   = document.getElementById('loadPaste');
	const loadSampleBtn  = document.getElementById('loadSample');
	const pasteArea      = document.getElementById('pasteArea');
	const statusMsg      = document.getElementById('status-msg');
	const dashboard      = document.getElementById('dashboard');
	const resetBtn       = document.getElementById('resetBtn');
	const mapImageInput  = document.getElementById('mapImageInput');
	const mapImage       = document.getElementById('map-image');
	const mapPlaceholder = document.getElementById('map-placeholder');
	const redrawBtn      = document.getElementById('redrawBtn');

	fileInput.addEventListener('change', e => {
		const file = e.target.files[0]; if (!file) return;
		const reader = new FileReader();
		reader.onload = ev => parseAndRender(ev.target.result);
		reader.readAsText(file);
	});
	loadPasteBtn.addEventListener('click', () => {
		const text = pasteArea.value.trim();
		if (!text) { showStatus('Paste area is empty.', 'error'); return; }
		parseAndRender(text);
	});
	loadSampleBtn.addEventListener('click', () => { parseAndRender(JSON.stringify(generateSampleData())); });
	resetBtn.addEventListener('click', () => {
		dashboard.style.display = 'none';
		statusMsg.style.display = 'none'; statusMsg.className = '';
		pasteArea.value = ''; fileInput.value = ''; _pathFrames = [];
	});

	mapImageInput.addEventListener('change', e => {
		const file = e.target.files[0]; if (!file) return;
		const reader = new FileReader();
		reader.onload = ev => {
		mapImage.src = ev.target.result;
		mapImage.onload = () => {
			mapImage.classList.remove('hidden');
			mapPlaceholder.style.display = 'none';
			_mapImageLoaded = true;
			if (_pathFrames.length) drawPath(_pathFrames);
		};
		};
		reader.readAsDataURL(file);
	});

	redrawBtn.addEventListener('click', () => { if (_pathFrames.length) drawPath(_pathFrames); });

	let _resizeTimer = null;
	window.addEventListener('resize', () => {
		clearTimeout(_resizeTimer);
		_resizeTimer = setTimeout(() => { if (_pathFrames.length) drawPath(_pathFrames); }, 100);
	});

	function showStatus(msg, type) { statusMsg.textContent = msg; statusMsg.className = type; }

	function formatTime(seconds) {
		const m = Math.floor(seconds / 60);
		const s = (seconds % 60).toFixed(2);
		return m > 0 ? `${m}m ${s}s` : `${s}s`;
	}

	function parseAndRender(text) {
		let data;
		try { data = JSON.parse(text); } catch { showStatus('Invalid JSON — could not parse the file.', 'error'); return; }
		if (Array.isArray(data)) data = data[0];
		if (!data || !Array.isArray(data.frames)) { showStatus('Unexpected format — expected an object with a "frames" array.', 'error'); return; }
		statusMsg.style.display = 'none';
		renderDashboard(data);
	}

	function renderDashboard(data) {
		const frames = data.frames;
		document.getElementById('s-name').textContent = data.sessionName || 'Unknown session';
		document.getElementById('s-date').textContent = data.recordingDate || '';

		const dur = typeof data.duration === 'number' ? data.duration : (frames[frames.length-1]?.timestamp || 0);
		document.getElementById('m-duration').textContent = formatTime(dur);

		let waterCount = 0, inWater = false;
		for (const f of frames) {
		if (f.recordingWater && !inWater)      { waterCount++; inWater = true; }
		else if (!f.recordingWater && inWater)  { inWater = false; }
		}
		document.getElementById('m-water').textContent = waterCount;

		const cpTimes = {};
		for (const f of frames) {
		const cp = f.waypointReached;
		if (cp != null && !(cp in cpTimes)) cpTimes[cp] = f.timestamp;
		}

		const finished = 8 in cpTimes;
		document.getElementById('s-badge').innerHTML = finished
		? '<span class="badge badge-success">&#10003; Completed</span>'
		: '<span class="badge badge-danger">&#10005; Did not finish</span>';

		const cpList = document.getElementById('cp-list');
		cpList.innerHTML = '';
		for (let i = 1; i <= 8; i++) {
		const hit = i in cpTimes;
		cpList.innerHTML += `<div class="cp-row"><div class="cp-dot ${hit ? 'hit' : 'miss'}">${i}</div>${hit ? `<span class="cp-time">${formatTime(cpTimes[i])}</span>` : `<span class="cp-none">not reached</span>`}</div>`;
		}

		const phoneEvents = [];
		let inPhone = false, startTs = null;
		for (const f of frames) {
		if (f.isLookingAtPhone && !inPhone)      { inPhone = true; startTs = f.timestamp; }
		else if (!f.isLookingAtPhone && inPhone)  { inPhone = false; phoneEvents.push({ dur: f.timestamp - startTs }); }
		}
		if (inPhone && startTs !== null) phoneEvents.push({ dur: frames[frames.length-1].timestamp - startTs });

		document.getElementById('m-phone-count').textContent = phoneEvents.length;
		const avg = phoneEvents.length > 0 ? phoneEvents.reduce((s, e) => s + e.dur, 0) / phoneEvents.length : 0;
		document.getElementById('m-phone-avg').textContent = avg.toFixed(2);

		const phoneList = document.getElementById('phone-list');
		phoneList.innerHTML = '';
		if (phoneEvents.length === 0) {
		phoneList.innerHTML = '<p style="font-size:12px;color:var(--text-dim);font-style:italic;margin:0;">No phone usage detected</p>';
		} else {
		phoneEvents.forEach((ev, i) => {
			const pct = Math.max(2, (ev.dur / dur) * 100).toFixed(1);
			phoneList.innerHTML += `<div class="phone-event"><span class="phone-event-label">Event ${i+1}</span><div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div><span class="bar-val">${ev.dur.toFixed(2)}s</span></div>`;
		});
		const total = phoneEvents.reduce((s, e) => s + e.dur, 0);
		phoneList.innerHTML += `<div class="phone-summary">Total: ${total.toFixed(2)}s &nbsp;·&nbsp; ${((total/dur)*100).toFixed(1)}% of session</div>`;
		}

		dashboard.style.display = 'block';
		_pathFrames = frames;
		// Use a short timeout so the dashboard is fully painted before we read canvas dimensions
		setTimeout(() => drawPath(frames), 50);
	}

	// ── Path drawing ──────────────────────────────────────────────────────────

	function getMapBounds() {
		return {
		minX: parseFloat(document.getElementById('cfg-minX').value) || -5,
		maxX: parseFloat(document.getElementById('cfg-maxX').value) || 420,
		minZ: parseFloat(document.getElementById('cfg-minZ').value) || -5,
		maxZ: parseFloat(document.getElementById('cfg-maxZ').value) || 365,
		};
	}

	// Convert world coords → canvas pixel coords.
	// Unity Z increases "forward" which is typically "up" on a top-down map, so we flip Z.
	function worldToCanvas(x, z, canvas) {
		const b = getMapBounds();
		const rect = canvas.getBoundingClientRect();
		return {
		x: ((x - b.minX) / (b.maxX - b.minX)) * rect.width,
		y: (1 - (z - b.minZ) / (b.maxZ - b.minZ)) * rect.height
		};
	}

	function drawPath(frames) {
		const canvas = document.getElementById('path-canvas');
		const container = document.getElementById('map-container');

		// Give container an explicit aspect ratio when no image is loaded
		if (!_mapImageLoaded) container.style.aspectRatio = '2/1';
		else container.style.aspectRatio = '';

		// Size the canvas pixel buffer to match its CSS display size
		const rect = canvas.getBoundingClientRect();
		canvas.width  = rect.width;
		canvas.height = rect.height;

		const ctx = canvas.getContext('2d');
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		if (frames.length < 2) return;

		// Dark background + grid when no map image
		if (!_mapImageLoaded) {
		ctx.fillStyle = '#0a0c0f';
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		ctx.strokeStyle = 'rgba(255,255,255,0.04)';
		ctx.lineWidth = 1;
		for (let i = 0; i <= 4; i++) {
			const gx = (i / 4) * canvas.width;
			const gy = (i / 4) * canvas.height;
			ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, canvas.height); ctx.stroke();
			ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(canvas.width, gy); ctx.stroke();
		}
		}

		ctx.lineJoin = 'round';
		ctx.lineCap  = 'round';

		// Main path — gradient green → magenta by progress
		ctx.lineWidth = 4;
		for (let i = 1; i < frames.length; i++) {
		const t = i / frames.length;
		ctx.strokeStyle = `rgb(${Math.round(74+(240-74)*t)},${Math.round(240+(64-240)*t)},168)`;
		const p1 = worldToCanvas(frames[i-1].position.x, frames[i-1].position.z, canvas);
		const p2 = worldToCanvas(frames[i].position.x,   frames[i].position.z,   canvas);
		ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
		}

		// Phone overlay — amber
		ctx.lineWidth = 6;
		ctx.strokeStyle = 'rgba(240,184,64,0.9)';
		for (let i = 1; i < frames.length; i++) {
		if (!frames[i].isLookingAtPhone) continue;
		const p1 = worldToCanvas(frames[i-1].position.x, frames[i-1].position.z, canvas);
		const p2 = worldToCanvas(frames[i].position.x,   frames[i].position.z,   canvas);
		ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
		}

		// Water overlay — blue
		ctx.lineWidth = 6;
		ctx.strokeStyle = 'rgba(74,180,240,0.9)';
		for (let i = 1; i < frames.length; i++) {
		if (!frames[i].recordingWater) continue;
		const p1 = worldToCanvas(frames[i-1].position.x, frames[i-1].position.z, canvas);
		const p2 = worldToCanvas(frames[i].position.x,   frames[i].position.z,   canvas);
		ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
		}

		// Checkpoint markers
		const cpSeen = {};
		frames.forEach(f => { const cp = f.waypointReached; if (cp != null && !cpSeen[cp]) cpSeen[cp] = {x:f.position.x, z:f.position.z}; });
		Object.entries(cpSeen).forEach(([cp, pos]) => {
		const c = worldToCanvas(pos.x, pos.z, canvas);
		const isLast = parseInt(cp) === 8;
		ctx.beginPath(); ctx.arc(c.x, c.y, 13, 0, Math.PI*2);
		ctx.fillStyle = isLast ? 'rgba(240,64,168,0.3)' : 'rgba(74,240,168,0.15)'; ctx.fill();
		ctx.beginPath(); ctx.arc(c.x, c.y, 9, 0, Math.PI*2);
		ctx.fillStyle = isLast ? '#f040a8' : '#0d0f12'; ctx.fill();
		ctx.strokeStyle = isLast ? '#f040a8' : '#4af0a8'; ctx.lineWidth = 2; ctx.stroke();
		ctx.fillStyle = isLast ? '#fff' : '#4af0a8';
		ctx.font = '500 10px IBM Plex Mono, monospace';
		ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
		ctx.fillText(cp, c.x, c.y);
		});

		// Start dot
		const sp = worldToCanvas(frames[0].position.x, frames[0].position.z, canvas);
		ctx.beginPath(); ctx.arc(sp.x, sp.y, 6, 0, Math.PI*2);
		ctx.fillStyle = '#4af0a8'; ctx.fill();

		attachHover(canvas, frames);
	}

	function attachHover(canvas, frames) {
	const tooltip = document.getElementById('path-tooltip');

	// Prevent stacking listeners (important)
	canvas.onmousemove = null;
	canvas.onmouseleave = null;

	canvas.onmousemove = e => {
		const rect = canvas.getBoundingClientRect();
		const mx = e.clientX - rect.left;
		const my = e.clientY - rect.top;

		let nearest = null, minDist = Infinity;

		frames.forEach(f => {
		const p = worldToCanvas(f.position.x, f.position.z, canvas);
		const d = Math.hypot(p.x - mx, p.y - my);
		if (d < minDist) {
			minDist = d;
			nearest = f;
		}
		});

		if (nearest && minDist < 20) {
		const t = nearest.timestamp;
		const m = Math.floor(t / 60);
		const s = (t % 60).toFixed(2);
		const ts = m > 0 ? `${m}m ${s}s` : `${s}s`;

		tooltip.innerHTML =
			`<span style="color:#4af0a8">t = ${ts}</span><br>` +
			`x: ${nearest.position.x.toFixed(1)} &nbsp; z: ${nearest.position.z.toFixed(1)}<br>` +
			`depth: ${nearest.waterDepth.toFixed(2)}m` +
			(nearest.isLookingAtPhone ? `<br><span style="color:#f0b840">■ phone</span>` : '') +
			(nearest.recordingWater   ? `<br><span style="color:#4ab4f0">■ water recording</span>` : '');

		tooltip.style.display = 'block';
		tooltip.style.left = (e.clientX + 14) + 'px';
		tooltip.style.top  = (e.clientY - 10) + 'px';
		} else {
		tooltip.style.display = 'none';
		}
	};

	canvas.onmouseleave = () => {
		tooltip.style.display = 'none';
	};
	}

	// ── Sample data ───────────────────────────────────────────────────────────

	function generateSampleData() {
		const frames = [];
		let ts = 0;
		const waypoints = [
		{x:403,z:0},{x:322,z:137},{x:185,z:70},{x:116,z:137},
		{x:184,z:208},{x:324,z:277},{x:184,z:354},{x:52,z:352}
		];
		const totalPts = 8 * 40;
		let phoneTimer = 0, inPhone = false, waterTimer = 0, inWaterSeg = false, waterBursts = 0;
		for (let i = 0; i < totalPts; i++) {
		ts += 0.5 + Math.random() * 0.08;
		const wpIdx = Math.min(Math.floor(i / 40), 7);
		const t = (i % 40) / 40;
		const from = waypoints[wpIdx], to = waypoints[Math.min(wpIdx+1, 7)];
		if (!inPhone && Math.random() < 0.015) { inPhone = true; phoneTimer = 0; }
		if (inPhone) { phoneTimer++; if (phoneTimer > 6) inPhone = false; }
		if (!inWaterSeg && waterBursts < 4 && Math.random() < 0.008) { inWaterSeg = true; waterTimer = 0; waterBursts++; }
		if (inWaterSeg) { waterTimer++; if (waterTimer > 10) inWaterSeg = false; }
		frames.push({
			timestamp: ts,
			position: { x: from.x+(to.x-from.x)*t+(Math.random()-0.5)*0.6, y: 4.25, z: from.z+(to.z-from.z)*t+(Math.random()-0.5)*0.6 },
			rotation: {x:-0.1,y:-0.26,z:-0.01,w:-0.96},
			gazeDirection: {x:0.51,y:-0.19,z:0.84},
			waterDepth: 8.1+Math.random(),
			recordingWater: inWaterSeg,
			waypointReached: wpIdx+1,
			isLookingAtPhone: inPhone
		});
		}
		return { sessionName:"sample-session-01", recordingDate: new Date().toISOString().replace('T',' ').slice(0,19), duration:ts, frameCount:frames.length, frames };
	}

});