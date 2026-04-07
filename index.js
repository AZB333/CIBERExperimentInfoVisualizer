function safeParse(text) {
	try {
		return JSON.parse(text);
	} catch (e) {
		return null;
	}
}

function normalizeData(parsed) {
	if (!parsed) return null;
	if (Array.isArray(parsed)) return parsed;
	if (typeof parsed === 'object') return [parsed];
	return null;
}

function flattenObject(obj, prefix = '') {
	const out = {};
	for (const k in obj) {
		if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
		const v = obj[k];
		const key = prefix ? `${prefix}.${k}` : k;
		if (v && typeof v === 'object' && !Array.isArray(v)) {
			const nested = flattenObject(v, key);
			Object.assign(out, nested);
		} else {
			out[key] = v;
		}
	}
	return out;
}

function prettyJSON(el, data) {
	el.textContent = JSON.stringify(data, null, 2);
}

function renderTable(container, data) {
	container.innerHTML = '';
	if (!data || data.length === 0) {
		container.textContent = 'No data';
		return;
	}
	const keys = Array.from(new Set(data.flatMap(d => Object.keys(d))))
	const table = document.createElement('table');
	const thead = document.createElement('thead');
	const tr = document.createElement('tr');
	keys.forEach(k => { const th = document.createElement('th'); th.textContent = k; tr.appendChild(th); });
	thead.appendChild(tr);
	table.appendChild(thead);
	const tbody = document.createElement('tbody');
	data.forEach(row => {
		const tr = document.createElement('tr');
		keys.forEach(k => {
			const td = document.createElement('td');
			const v = row[k];
			td.textContent = (v === undefined) ? '' : v;
			tr.appendChild(td);
		});
		tbody.appendChild(tr);
	});
	table.appendChild(tbody);
	container.appendChild(table);
}

function summarize(container, data, header) {
	container.innerHTML = '';
	if (!data || data.length === 0) {
		container.textContent = 'No data.';
		return;
	}

	const info = document.createElement('div');
	const count = document.createElement('div');
	count.textContent = `Records: ${data.length}`;
	info.appendChild(count);

	if (header && typeof header === 'object') {
		const hdr = document.createElement('div');
		hdr.className = 'header-summary';
		const rows = [];
		if (header.sessionName) rows.push(`Session: ${header.sessionName}`);
		if (header.recordingDate) rows.push(`Date: ${header.recordingDate}`);
		if (header.duration) rows.push(`Duration: ${header.duration}`);
		if (header.frameCount) rows.push(`Frame count: ${header.frameCount}`);
		hdr.textContent = rows.join(' • ');
		info.appendChild(hdr);
	}

	// numeric fields summary
	const keys = Array.from(new Set(data.flatMap(d => Object.keys(d))))
	const numericKeys = keys.filter(k => data.some(d => typeof d[k] === 'number'))
	if (numericKeys.length === 0) {
		const none = document.createElement('div');
		none.textContent = 'No numeric fields detected for charts.';
		info.appendChild(none);
	} else {
		const list = document.createElement('table');
		const h = document.createElement('thead');
		h.innerHTML = '<tr><th>Field</th><th>Min</th><th>Max</th><th>Mean</th></tr>';
		list.appendChild(h);
		const body = document.createElement('tbody');
		numericKeys.forEach(k => {
			const values = data.map(d => d[k]).filter(v => typeof v === 'number');
			const min = Math.min(...values);
			const max = Math.max(...values);
			const mean = (values.reduce((a,b)=>a+b,0))/values.length;
			const r = document.createElement('tr');
			r.innerHTML = `<td>${k}</td><td>${min}</td><td>${max}</td><td>${mean.toFixed(3)}</td>`;
			body.appendChild(r);
		});
		list.appendChild(body);
		info.appendChild(list);
	}

	// boolean summaries (e.g., isLookingAtPhone, recordingWater)
	const boolKeys = keys.filter(k => data.some(d => typeof d[k] === 'boolean'))
	if (boolKeys.length) {
		const bwrap = document.createElement('div');
		bwrap.className = 'bool-summary';
		boolKeys.forEach(k => {
			const vals = data.map(d => d[k]).filter(v => typeof v === 'boolean');
			const trues = vals.filter(v => v).length;
			const percent = (trues / vals.length) * 100;
			const el = document.createElement('div');
			el.textContent = `${k}: ${trues}/${vals.length} (${percent.toFixed(1)}%)`;
			bwrap.appendChild(el);
		});
		info.appendChild(bwrap);
	}

	container.appendChild(info);
}

function renderCharts(container, data) {
	container.innerHTML = '';
	if (!data || data.length === 0) {
		container.textContent = 'No data.';
		return;
	}
	const keys = Array.from(new Set(data.flatMap(d => Object.keys(d))))
	const numericKeys = keys.filter(k => data.some(d => typeof d[k] === 'number'))
	if (numericKeys.length === 0) return;

	// If timestamp exists, use it for x-axis labels
	const hasTimestamp = data.some(d => typeof d.timestamp === 'number');
	const labels = data.map((d,i) => hasTimestamp ? (d.timestamp).toString() : (i+1).toString());

	// Prefer plotting waterDepth first if present
	const preferred = ['waterDepth'];
	const ordered = Array.from(new Set([...preferred.filter(p=>numericKeys.includes(p)), ...numericKeys]));

	ordered.forEach(k => {
		const canvasWrap = document.createElement('div');
		canvasWrap.className = 'chart-wrap';
		const title = document.createElement('h3');
		title.textContent = k;
		const canvas = document.createElement('canvas');
		canvasWrap.appendChild(title);
		canvasWrap.appendChild(canvas);
		container.appendChild(canvasWrap);

		const values = data.map(d => (typeof d[k] === 'number' ? d[k] : null));
		const ctx = canvas.getContext('2d');
		new Chart(ctx, {
			type: 'line',
			data: {
				labels,
				datasets: [{
					label: k,
					data: values,
					borderColor: 'rgba(54,162,235,1)',
					backgroundColor: 'rgba(54,162,235,0.2)',
					spanGaps: true,
				}]
			},
			options: { responsive: true, maintainAspectRatio: false }
		});
	});
}

function handleData(parsed) {
	const jsonPre = document.getElementById('jsonPre');
	const tableContainer = document.getElementById('tableContainer');
	const chartsContainer = document.getElementById('chartsContainer');
	const summaryContent = document.getElementById('summaryContent');

	if (!parsed) {
		jsonPre.textContent = 'Could not parse JSON.';
		tableContainer.textContent = 'No data.';
		chartsContainer.textContent = 'No data.';
		summaryContent.textContent = 'No data.';
		return;
	}

	// If top-level contains a frames array, treat that as the data and keep header
	let header = null;
	let frames = null;
	if (parsed && typeof parsed === 'object' && Array.isArray(parsed.frames)) {
		header = Object.assign({}, parsed);
		frames = parsed.frames;
	} else {
		const n = normalizeData(parsed);
		frames = n;
	}

	// flatten nested fields for table/charting (e.g., position.x)
	const flat = frames ? frames.map(f => flattenObject(f)) : [];

	prettyJSON(jsonPre, parsed);
	renderTable(tableContainer, flat);
	summarize(summaryContent, flat, header);
	renderCharts(chartsContainer, flat);
}

document.getElementById('fileInput').addEventListener('change', (e) => {
	const f = e.target.files[0];
	if (!f) return;
	const reader = new FileReader();
	reader.onload = () => {
		const parsed = safeParse(reader.result);
		handleData(parsed);
	};
	reader.readAsText(f);
});

document.getElementById('loadPaste').addEventListener('click', () => {
	const txt = document.getElementById('pasteArea').value.trim();
	if (!txt) return alert('Paste some JSON first.');
	const parsed = safeParse(txt);
	handleData(parsed);
});

document.getElementById('loadSample').addEventListener('click', () => {
	const sample = [
		{ "trial": 1, "score": 12.3, "time": 5.2, "player": "A" },
		{ "trial": 2, "score": 15.1, "time": 4.8, "player": "A" },
		{ "trial": 3, "score": 9.6, "time": 6.1, "player": "B" }
	];
	document.getElementById('pasteArea').value = JSON.stringify(sample, null, 2);
	handleData(sample);
});

// On load, try to render sample for a first look
document.addEventListener('DOMContentLoaded', () => {
	// leave empty by default
});
