(() => {
  'use strict';

  const GPX_NS = 'http://www.topografix.com/GPX/1/1';
  const state = { items: [] };

  const els = {
    fileInput: document.querySelector('#fileInput'),
    dropZone: document.querySelector('#dropZone'),
    fileStatus: document.querySelector('#fileStatus'),
    fileList: document.querySelector('#fileList'),
    fileItemTemplate: document.querySelector('#fileItemTemplate'),
    sortByTime: document.querySelector('#sortByTime'),
    trackName: document.querySelector('#trackName'),
    segmentMode: document.querySelector('#segmentMode'),
    timeMode: document.querySelector('#timeMode'),
    gapField: document.querySelector('#gapField'),
    gapSeconds: document.querySelector('#gapSeconds'),
    summary: document.querySelector('#summary'),
    preview: document.querySelector('#preview'),
    previewEmpty: document.querySelector('#previewEmpty'),
    download: document.querySelector('#download'),
    clear: document.querySelector('#clear')
  };

  els.fileInput.addEventListener('change', () => addFiles(els.fileInput.files));
  els.dropZone.addEventListener('dragover', event => {
    event.preventDefault();
    els.dropZone.classList.add('dragover');
  });
  els.dropZone.addEventListener('dragleave', () => els.dropZone.classList.remove('dragover'));
  els.dropZone.addEventListener('drop', event => {
    event.preventDefault();
    els.dropZone.classList.remove('dragover');
    addFiles(event.dataTransfer.files);
  });

  els.sortByTime.addEventListener('click', () => {
    state.items.sort((a, b) => {
      if (a.startTime && b.startTime) return a.startTime - b.startTime;
      if (a.startTime) return -1;
      if (b.startTime) return 1;
      return a.name.localeCompare(b.name);
    });
    render();
  });

  els.timeMode.addEventListener('change', () => {
    els.gapField.hidden = els.timeMode.value !== 'continuous';
    renderSummary();
  });
  els.segmentMode.addEventListener('change', () => {
    renderSummary();
    renderPreview();
  });
  els.gapSeconds.addEventListener('input', renderSummary);
  els.clear.addEventListener('click', () => {
    state.items = [];
    els.fileInput.value = '';
    render();
  });
  els.download.addEventListener('click', downloadMergedGpx);

  async function addFiles(fileList) {
    const files = [...fileList].filter(file => file.name.toLowerCase().endsWith('.gpx'));
    if (!files.length) {
      setStatus('Please choose one or more .gpx files.', true);
      return;
    }

    let added = 0;
    const errors = [];

    for (const file of files) {
      try {
        const text = await file.text();
        const parsed = parseGpx(text, file.name);
        state.items.push({ id: crypto.randomUUID(), file, ...parsed });
        added += 1;
      } catch (error) {
        errors.push(`${file.name}: ${error.message}`);
      }
    }

    if (errors.length) {
      setStatus(`${added} file${added === 1 ? '' : 's'} added. ${errors.join(' ')}`, true);
    } else {
      setStatus(`${added} file${added === 1 ? '' : 's'} added.`);
    }

    els.fileInput.value = '';
    render();
  }

  function parseGpx(text, filename) {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    const parserError = doc.querySelector('parsererror');
    if (parserError) throw new Error('Invalid XML.');

    const root = doc.documentElement;
    if (!root || root.localName !== 'gpx') throw new Error('Not a GPX document.');

    const segments = [...root.getElementsByTagNameNS('*', 'trkseg')]
      .map(segment => [...segment.children].filter(node => node.localName === 'trkpt'))
      .filter(points => points.length > 0);

    if (!segments.length) throw new Error('No track points found.');

    const points = segments.flat();
    const timedPoints = points
      .map(point => getDirectChild(point, 'time'))
      .filter(Boolean)
      .map(node => new Date(node.textContent.trim()))
      .filter(date => !Number.isNaN(date.getTime()));

    const startTime = timedPoints.length
      ? new Date(timedPoints.reduce((min, date) => Math.min(min, date.getTime()), Infinity))
      : null;
    const endTime = timedPoints.length
      ? new Date(timedPoints.reduce((max, date) => Math.max(max, date.getTime()), -Infinity))
      : null;
    const distanceKm = segments.reduce((sum, segment) => sum + calculateDistance(segment), 0) / 1000;

    return {
      name: filename,
      doc,
      root,
      segments,
      points,
      startTime,
      endTime,
      distanceKm
    };
  }

  function render() {
    renderFileList();
    renderSummary();
    renderPreview();

    const hasItems = state.items.length > 0;
    els.sortByTime.disabled = state.items.length < 2;
    els.download.disabled = !hasItems;
    els.clear.disabled = !hasItems;

    if (!hasItems) setStatus('No files selected.');
  }

  function renderFileList() {
    els.fileList.replaceChildren();

    state.items.forEach((item, index) => {
      const fragment = els.fileItemTemplate.content.cloneNode(true);
      const li = fragment.querySelector('.file-item');
      const name = fragment.querySelector('.file-name');
      const meta = fragment.querySelector('.file-meta');
      const up = fragment.querySelector('.move-up');
      const down = fragment.querySelector('.move-down');
      const remove = fragment.querySelector('.remove');

      name.textContent = item.name;
      meta.textContent = `${item.points.length.toLocaleString()} points · ${item.segments.length} segment${item.segments.length === 1 ? '' : 's'} · ${formatDistance(item.distanceKm)}${item.startTime ? ` · ${formatDate(item.startTime)}` : ''}`;

      up.disabled = index === 0;
      down.disabled = index === state.items.length - 1;
      up.addEventListener('click', () => moveItem(index, index - 1));
      down.addEventListener('click', () => moveItem(index, index + 1));
      remove.addEventListener('click', () => {
        state.items.splice(index, 1);
        render();
      });

      li.dataset.id = item.id;
      els.fileList.append(fragment);
    });
  }

  function moveItem(from, to) {
    const [item] = state.items.splice(from, 1);
    state.items.splice(to, 0, item);
    render();
  }

  function renderSummary() {
    if (!state.items.length) {
      els.summary.textContent = 'Add at least one valid GPX file to see a summary.';
      return;
    }

    const pointCount = state.items.reduce((sum, item) => sum + item.points.length, 0);
    const segmentCount = state.items.reduce((sum, item) => sum + item.segments.length, 0);
    const distanceKm = state.items.reduce((sum, item) => sum + item.distanceKm, 0);
    const outputSegments = els.segmentMode.value === 'single' ? 1 : segmentCount;
    const timeDescription = {
      preserve: 'timestamps preserved',
      continuous: `timestamps shifted with ${Math.max(0, Number(els.gapSeconds.value) || 0)} s gaps`,
      remove: 'timestamps removed'
    }[els.timeMode.value];

    els.summary.textContent = `${state.items.length} file${state.items.length === 1 ? '' : 's'} · ${pointCount.toLocaleString()} points · ${outputSegments} output segment${outputSegments === 1 ? '' : 's'} · approx. ${formatDistance(distanceKm)} · ${timeDescription}.`;
  }

  function renderPreview() {
    els.preview.replaceChildren();

    const sourceSegments = els.segmentMode.value === 'single'
      ? [state.items.flatMap(item => item.points)]
      : state.items.flatMap(item => item.segments);

    const coordinateSegments = sourceSegments
      .map(segment => segment.map(toLatLon).filter(Boolean))
      .filter(segment => segment.length > 0);

    const totalPoints = coordinateSegments.reduce((sum, segment) => sum + segment.length, 0);
    if (!totalPoints) {
      els.preview.hidden = true;
      els.previewEmpty.hidden = false;
      return;
    }

    els.preview.hidden = false;
    els.previewEmpty.hidden = true;

    const ratio = Math.max(1, totalPoints / 5000);
    const sampledSegments = coordinateSegments.map(segment => {
      if (ratio === 1) return segment;
      const sampled = [];
      for (let index = 0; index < segment.length; index += ratio) {
        sampled.push(segment[Math.floor(index)]);
      }
      const last = segment[segment.length - 1];
      if (sampled[sampled.length - 1] !== last) sampled.push(last);
      return sampled;
    });

    const sampled = sampledSegments.flat();
    const meanLat = sampled.reduce((sum, point) => sum + point.lat, 0) / sampled.length;
    const lonScale = Math.cos(meanLat * Math.PI / 180) || 1;
    const projectedSegments = sampledSegments.map(segment =>
      segment.map(point => ({ x: point.lon * lonScale, y: -point.lat }))
    );
    const projected = projectedSegments.flat();

    let minX = Math.min(...projected.map(point => point.x));
    let maxX = Math.max(...projected.map(point => point.x));
    let minY = Math.min(...projected.map(point => point.y));
    let maxY = Math.max(...projected.map(point => point.y));
    if (minX === maxX) { minX -= 0.5; maxX += 0.5; }
    if (minY === maxY) { minY -= 0.5; maxY += 0.5; }

    const width = 1000;
    const height = 500;
    const pad = 30;
    const scale = Math.min((width - pad * 2) / (maxX - minX), (height - pad * 2) / (maxY - minY));
    const offsetX = (width - (maxX - minX) * scale) / 2;
    const offsetY = (height - (maxY - minY) * scale) / 2;

    for (const segment of projectedSegments) {
      const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      polyline.setAttribute('points', segment.map(point => {
        const x = offsetX + (point.x - minX) * scale;
        const y = offsetY + (point.y - minY) * scale;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(' '));
      els.preview.append(polyline);
    }
  }

  function downloadMergedGpx() {
    if (!state.items.length) return;

    const output = document.implementation.createDocument(GPX_NS, 'gpx');
    const root = output.documentElement;
    root.setAttribute('version', '1.1');
    root.setAttribute('creator', 'tools.malaber.de/gpx');
    root.setAttributeNS('http://www.w3.org/2000/xmlns/', 'xmlns:xsi', 'http://www.w3.org/2001/XMLSchema-instance');
    root.setAttributeNS('http://www.w3.org/2001/XMLSchema-instance', 'xsi:schemaLocation', `${GPX_NS} http://www.topografix.com/GPX/1/1/gpx.xsd`);

    appendMetadata(output, root);
    appendWaypoints(output, root);

    const track = output.createElementNS(GPX_NS, 'trk');
    const name = output.createElementNS(GPX_NS, 'name');
    name.textContent = els.trackName.value.trim() || 'Merged GPX track';
    track.append(name);
    root.append(track);

    const timeMode = els.timeMode.value;
    const segmentMode = els.segmentMode.value;
    const gapMs = Math.max(0, Number(els.gapSeconds.value) || 0) * 1000;
    let previousEnd = null;
    let sharedSegment = null;

    if (segmentMode === 'single') {
      sharedSegment = output.createElementNS(GPX_NS, 'trkseg');
      track.append(sharedSegment);
    }

    for (const item of state.items) {
      let shiftMs = 0;
      if (timeMode === 'continuous' && previousEnd && item.startTime) {
        shiftMs = previousEnd.getTime() + gapMs - item.startTime.getTime();
      }

      let shiftedItemEnd = null;
      for (const sourceSegment of item.segments) {
        const targetSegment = sharedSegment || output.createElementNS(GPX_NS, 'trkseg');
        if (!sharedSegment) track.append(targetSegment);

        for (const sourcePoint of sourceSegment) {
          const point = output.importNode(sourcePoint, true);
          const time = getDirectChild(point, 'time');

          if (timeMode === 'remove' && time) {
            point.removeChild(time);
          } else if (timeMode === 'continuous' && time) {
            const original = new Date(time.textContent.trim());
            if (!Number.isNaN(original.getTime())) {
              const shifted = new Date(original.getTime() + shiftMs);
              time.textContent = shifted.toISOString();
              if (!shiftedItemEnd || shifted > shiftedItemEnd) shiftedItemEnd = shifted;
            }
          }

          targetSegment.append(point);
        }
      }

      if (timeMode === 'continuous') {
        if (shiftedItemEnd) previousEnd = shiftedItemEnd;
        else if (item.endTime) previousEnd = new Date(item.endTime.getTime() + shiftMs);
      }
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(output)}\n`;
    const blob = new Blob([xml], { type: 'application/gpx+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = makeFilename(els.trackName.value.trim() || 'merged-cycling-activity');
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function appendMetadata(output, root) {
    const metadata = output.createElementNS(GPX_NS, 'metadata');
    const name = output.createElementNS(GPX_NS, 'name');
    name.textContent = els.trackName.value.trim() || 'Merged GPX track';
    const time = output.createElementNS(GPX_NS, 'time');
    time.textContent = new Date().toISOString();
    metadata.append(name, time);
    root.append(metadata);
  }

  function appendWaypoints(output, root) {
    for (const item of state.items) {
      const waypoints = [...item.root.children].filter(node => node.localName === 'wpt');
      for (const waypoint of waypoints) root.append(output.importNode(waypoint, true));
    }
  }

  function getDirectChild(parent, localName) {
    return [...parent.children].find(child => child.localName === localName) || null;
  }

  function toLatLon(point) {
    const lat = Number(point.getAttribute('lat'));
    const lon = Number(point.getAttribute('lon'));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { lat, lon };
  }

  function calculateDistance(points) {
    let total = 0;
    let previous = null;
    for (const point of points) {
      const current = toLatLon(point);
      if (!current) continue;
      if (previous) total += haversine(previous, current);
      previous = current;
    }
    return total;
  }

  function haversine(a, b) {
    const R = 6371000;
    const toRad = degrees => degrees * Math.PI / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lon - a.lon);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function formatDistance(km) {
    return `${km.toLocaleString(undefined, { maximumFractionDigits: km < 10 ? 2 : 1 })} km`;
  }

  function formatDate(date) {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  }

  function makeFilename(name) {
    const safe = name.toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'merged-gpx';
    return `${safe}.gpx`;
  }

  function setStatus(message, isError = false) {
    els.fileStatus.textContent = message;
    els.fileStatus.classList.toggle('error', isError);
  }

  render();
})();
