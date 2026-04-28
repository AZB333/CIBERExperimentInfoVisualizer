document.addEventListener('DOMContentLoaded', () => {

	let _pathFrames = [];
	let _mapImageLoaded = true;

	const fileInput = document.getElementById('fileInput');
	const loadSampleBtn = document.getElementById('loadSample');
	const pasteArea = document.getElementById('pasteArea');
	const statusMsg = document.getElementById('status-msg');
	const dashboard = document.getElementById('dashboard');
	const resetBtn = document.getElementById('resetBtn');
	const mapImage = document.getElementById('map-image');
	const mapPlaceholder = document.getElementById('map-placeholder');
	const _bounds = {
		minX: 57,
		maxX: 425,
		minZ: -5,
		maxZ: 359
		};

	mapPlaceholder.style.display = 'none';
	mapImage.classList.remove('hidden');

	fileInput.addEventListener('change', e => {
		const file = e.target.files[0]; if (!file) return;
		const reader = new FileReader();
		reader.onload = ev => parseAndRender(ev.target.result);
		reader.readAsText(file);
	});

	loadSampleBtn.addEventListener('click', () => { parseAndRender(JSON.stringify(generateSampleData())); });
	resetBtn.addEventListener('click', () => {
		dashboard.style.display = 'none';
		statusMsg.style.display = 'none'; statusMsg.className = '';
		fileInput.value = ''; _pathFrames = [];
	});

	function computeBounds(frames) {
		let minX = Infinity, maxX = -Infinity;
		let minZ = Infinity, maxZ = -Infinity;

		frames.forEach(f => {
			const x = f.position.x;
			const z = f.position.z;

			if (x < minX) minX = x;
			if (x > maxX) maxX = x;
			if (z < minZ) minZ = z;
			if (z > maxZ) maxZ = z;
		});

		// Add padding (5%)
		// const padX = (maxX - minX) * 0.05;
		// const padZ = (maxZ - minZ) * 0.05;
		const padX = 0;
		const padZ = 0;

		return {
			minX: minX - padX,
			maxX: maxX + padX,
			minZ: minZ - padZ,
			maxZ: maxZ + padZ
		};
	}

	mapImage.onload = () => {
		if (_pathFrames.length) drawPath(_pathFrames);
	};


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
		_pathFrames = frames;
		document.getElementById('s-name').textContent = data.sessionName || 'Unknown session';
		document.getElementById('s-date').textContent = data.recordingDate || '';

		const dur = typeof data.duration === 'number' ? data.duration : (frames[frames.length-1]?.timestamp || 0);
		document.getElementById('m-duration').textContent = formatTime(dur);


		//User Guesses
		const guesses = frames.filter(f =>
			typeof f.userWaterHeightGuess === "number" &&
			f.userWaterHeightGuess !== -1
		);

		document.getElementById('m-water').textContent = guesses.length;

		const waterList = document.getElementById('water-list');
		waterList.innerHTML = '';

		if (guesses.length === 0) {
			waterList.innerHTML = '';
		} else {
			waterList.innerHTML = '<div class="water-section-title">Water height guesses</div>';

			guesses.forEach((f, i) => {
				const err = Math.abs(f.userWaterHeightGuess - f.waterDepth);

				waterList.innerHTML += `
				<div class="water-rec">
					<div class="water-rec-header">
						<span class="water-rec-label">Guess ${i + 1}</span>
						<span class="water-rec-time">${formatTime(f.timestamp)}</span>
					</div>

					<div class="water-rec-row">
						<div class="water-rec-stat">
							<span class="water-rec-stat-label">True depth</span>
							<span>${f.waterDepth.toFixed(2)}m</span>
						</div>

						<div class="water-rec-stat">
							<span class="water-rec-stat-label">User guess</span>
							<span>${f.userWaterHeightGuess.toFixed(2)}m</span>
						</div>

						<div class="water-rec-stat">
							<span class="water-rec-stat-label">Error</span>
							<span>${err.toFixed(2)}m</span>
						</div>
					</div>
				</div>`;
			});
		}
 

		//waypoint Stuff

		// Collect first arrival time per waypoint
		const wpTimes = {};
		for (const f of frames) {
		const wp = f.waypointReached;
		if (wp != null && !(wp in wpTimes)) wpTimes[wp] = f.timestamp;
		}
	
		// Collect durationInWaypoint 
		const wpDurations = {};
		for (const f of frames) {
		const wp = f.waypointReached;
		if (wp != null && typeof f.durationInWaypoint === 'number' && f.durationInWaypoint !== -1 && !(wp in wpDurations)) {
			wpDurations[wp] = f.durationInWaypoint;
		}
		}
	
		const finished = 8 in wpTimes;
		document.getElementById('s-badge').innerHTML = finished
		? '<span class="badge badge-success">&#10003; Completed</span>'
		: '<span class="badge badge-danger">&#10005; Did not finish</span>';
	
		const wpList = document.getElementById('wp-list');
		wpList.innerHTML = '';
		for (let i = 1; i <= 8; i++) {
		const hit = i in wpTimes;
		const dur = wpDurations[i];
		const durStr = (hit && dur !== undefined) ? `<span class="wp-duration">${dur.toFixed(2)}s in zone</span>` : '';
		wpList.innerHTML += `<div class="wp-row"><div class="wp-row-left"><div class="wp-dot ${hit ? 'hit' : 'miss'}">${i}</div>${hit ? `<span class="wp-time">${formatTime(wpTimes[i])}</span>` : `<span class="wp-none">not reached</span>`}</div>${durStr}</div>`;
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

		// Hearts — detect drops in numHearts between consecutive frames
		const heartLosses = [];
		for (let i = 1; i < frames.length; i++) {
		const prev = frames[i-1].numHearts, curr = frames[i].numHearts;
		if (typeof prev === "number" && typeof curr === "number" && curr < prev) {
			for (let h = 0; h < (prev - curr); h++) heartLosses.push({ heart: prev - h, timestamp: frames[i].timestamp });
		}
		}
		const startHearts = typeof frames[0].numHearts === "number" ? frames[0].numHearts : 5;
		const finalHearts = typeof frames[frames.length-1].numHearts === "number" ? frames[frames.length-1].numHearts : startHearts;
		const heartsDisplay = document.getElementById("hearts-display");
		heartsDisplay.innerHTML = "";
		for (let i = 1; i <= startHearts; i++) {
		const lost = i > finalHearts;
		heartsDisplay.innerHTML += `<span class="heart-icon${lost ? " lost" : ""}">&#10084;</span>`;
		}
		const heartsList = document.getElementById("hearts-list");
		heartsList.innerHTML = "";
		if (heartLosses.length === 0) {
		heartsList.innerHTML = "<p class=\"heart-none\">No hearts lost</p>";
		} else {
		heartLosses.forEach((ev, i) => {
			heartsList.innerHTML += `<div class="heart-row"><div class="heart-num">&#10084;</div><span class="heart-time">Heart ${ev.heart} lost at ${formatTime(ev.timestamp)}</span></div>`;
		});
		}

			dashboard.style.display = 'block';
			_pathFrames = frames;
			setTimeout(() => drawPath(frames), 50);
	}

	// ── Path drawing ──────────────────────────────────────────────────────────

	function getMapBounds() {
		return _bounds;
	}

	// Convert world coords → canvas pixel coords.
	function worldToCanvas(x, z, canvas) {
		const b = getMapBounds();

		const nx = (x - b.minX) / (b.maxX - b.minX);
		const nz = (z - b.minZ) / (b.maxZ - b.minZ);

		return {
			x: nx * canvas.width,
			y: (1 - nz) * canvas.height
		};
	}

	function drawPath(frames) {
		const canvas = document.getElementById('path-canvas');

		// Size the canvas pixel buffer to match its CSS display size
		const rect = mapImage.getBoundingClientRect();
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

		const guessPoints = frames.filter(f =>
			typeof f.userWaterHeightGuess === "number" &&
			f.userWaterHeightGuess !== -1
		);

		// Water guess markers - blue
		guessPoints.forEach(f => {
		const p = worldToCanvas(f.position.x, f.position.z, canvas);

		ctx.beginPath();
		ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
		ctx.fillStyle = "rgba(74,180,240,0.25)";
		ctx.fill();

		ctx.beginPath();
		ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
		ctx.fillStyle = "#4ab4f0";
		ctx.fill();
		});

		 // Damage dots — red, drawn where numHearts drops
		for (let i = 1; i < frames.length; i++) {
		const prev = frames[i-1].numHearts, curr = frames[i].numHearts;
		if (typeof prev !== 'number' || typeof curr !== 'number' || curr >= prev) continue;
		const p = worldToCanvas(frames[i].position.x, frames[i].position.z, canvas);
		ctx.beginPath(); ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
		ctx.fillStyle = 'rgba(240,96,96,0.25)'; ctx.fill();
		ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
		ctx.fillStyle = '#f06060'; ctx.fill();
		}

		// waypoint markers
		const wpSeen = {};
		frames.forEach(f => { const wp = f.waypointReached; if (wp != null && !wpSeen[wp]) wpSeen[wp] = {x:f.position.x, z:f.position.z}; });
		Object.entries(wpSeen).forEach(([wp, pos]) => {
		const c = worldToCanvas(pos.x, pos.z, canvas);
		const isLast = parseInt(wp) === 8;
		ctx.beginPath(); ctx.arc(c.x, c.y, 13, 0, Math.PI*2);
		ctx.fillStyle = isLast ? 'rgba(240,64,168,0.3)' : 'rgba(74,240,168,0.15)'; ctx.fill();
		ctx.beginPath(); ctx.arc(c.x, c.y, 9, 0, Math.PI*2);
		ctx.fillStyle = isLast ? '#f040a8' : '#0d0f12'; ctx.fill();
		ctx.strokeStyle = isLast ? '#f040a8' : '#4af0a8'; ctx.lineWidth = 2; ctx.stroke();
		ctx.fillStyle = isLast ? '#fff' : '#4af0a8';
		ctx.font = '500 10px IBM Plex Mono, monospace';
		ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
		ctx.fillText(wp, c.x, c.y);
		});

		// Start dot
		const sp = worldToCanvas(frames[0].position.x, frames[0].position.z, canvas);
		ctx.beginPath(); ctx.arc(sp.x, sp.y, 6, 0, Math.PI*2);
		ctx.fillStyle = '#4af0a8'; ctx.fill();

		attachHover(canvas, frames);
	}

	function attachHover(canvas, frames) {
		const tooltip = document.getElementById('path-tooltip');

		// Precompute which timestamps have a heart drop
		const damageTimestamps = new Set();
		for (let i = 1; i < frames.length; i++) {
			const prev = frames[i-1].numHearts, curr = frames[i].numHearts;
			if (typeof prev === 'number' && typeof curr === 'number' && curr < prev) {
				damageTimestamps.add(frames[i].timestamp);
			}
		}

		canvas.onmousemove = null;
		canvas.onmouseleave = null;

		canvas.onmousemove = e => {
			const rect = mapImage.getBoundingClientRect();
			const mx = e.clientX - rect.left;
			const my = e.clientY - rect.top;

			let nearest = null, minDist = Infinity;
			frames.forEach(f => {
				const p = worldToCanvas(f.position.x, f.position.z, canvas);
				const d = Math.hypot(p.x - mx, p.y - my);
				if (d < minDist) { minDist = d; nearest = f; }
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
					(nearest.userWaterHeightGuess !== -1 ? `<br><span style="color:#4ab4f0">guess: ${nearest.userWaterHeightGuess.toFixed(2)}m</span>` : '') +
					(damageTimestamps.has(nearest.timestamp) ? `<br><span style="color:#f06060">■ took damage</span>` : '');

				tooltip.style.display = 'block';
				tooltip.style.left = (e.clientX + 14) + 'px';
				tooltip.style.top  = (e.clientY - 10) + 'px';
			} else {
				tooltip.style.display = 'none';
			}
		};

		canvas.onmouseleave = () => { tooltip.style.display = 'none'; };
	}

	// ── Sample data ───────────────────────────────────────────────────────────

	function generateSampleData() {

		const frames = [];
		let ts = 0;

		const waypoints = [
			{x:403,z:0},{x:322,z:137},{x:185,z:70},
			{x:116,z:137},{x:184,z:208},{x:324,z:277},
			{x:184,z:354},{x:52,z:352}
		];

		for (let i = 0; i < 320; i++) {

			ts += 0.5;

			const wp = Math.floor(i / 40);
			const t = (i % 40) / 40;

			const from = waypoints[wp];
			const to = waypoints[Math.min(wp + 1, 7)];

			frames.push({
				timestamp: ts,
				position: {
					x: from.x + (to.x - from.x) * t,
					y: 4,
					z: from.z + (to.z - from.z) * t
				},
				waterDepth: 8 + Math.random(),

				userWaterHeightGuess:
					Math.random() < 0.05 ? 7 + Math.random() * 2 : -1,

				isLookingAtPhone: Math.random() < 0.02,
				waypointReached: wp + 1
			});
		}

		return {
			sessionName: "sample",
			recordingDate: new Date().toISOString(),
			duration: ts,
			frames
		};
	}

});