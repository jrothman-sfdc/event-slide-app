const BASE = window.location.origin;

async function loadShows() {
  const list = document.getElementById('show-list');
  try {
    const res = await fetch('/api/shows');
    const shows = await res.json();
    if (!shows.length) {
      list.innerHTML = '<li class="empty-state">No shows yet. Add one above.</li>';
      return;
    }
    list.innerHTML = shows.map(show => {
      const url = `${BASE}/show/${show.slug}`;
      const date = new Date(show.created_at).toLocaleDateString();
      return `
        <li id="show-${show.slug}">
          <div class="show-info">
            <div class="show-title">${escHtml(show.title)}</div>
            <a class="show-url" href="${url}" target="_blank">${url}</a>
            <div class="show-meta">Default duration: ${show.default_duration / 1000}s &nbsp;·&nbsp; Added ${date}</div>
          </div>
          <div class="show-actions">
            <button class="btn-secondary" onclick="refreshShow('${show.slug}')">Refresh</button>
            <button class="btn-danger" onclick="deleteShow('${show.slug}')">Delete</button>
          </div>
        </li>`;
    }).join('');
  } catch (e) {
    list.innerHTML = `<li class="empty-state">Failed to load shows: ${e.message}</li>`;
  }
}

async function addShow() {
  const urlInput = document.getElementById('slides-url');
  const durationInput = document.getElementById('default-duration');
  const btn = document.getElementById('add-btn');
  const errEl = document.getElementById('form-error');
  const okEl = document.getElementById('form-success');

  errEl.style.display = 'none';
  okEl.style.display = 'none';

  const url = urlInput.value.trim();
  if (!url) { showError('Please enter a Google Slides URL.'); return; }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Loading…';

  try {
    const res = await fetch('/api/shows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, defaultDuration: parseInt(durationInput.value) * 1000 })
    });
    const data = await res.json();
    if (!res.ok) { showError(data.error || 'Unknown error'); return; }

    const showUrl = `${BASE}/show/${data.slug}`;
    okEl.innerHTML = `Show created! <a href="${showUrl}" target="_blank" style="color:#50e080">${showUrl}</a>`;
    okEl.style.display = 'block';
    urlInput.value = '';
    await loadShows();
  } catch (e) {
    showError(e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Load Presentation';
  }
}

async function deleteShow(slug) {
  if (!confirm('Delete this show? This cannot be undone.')) return;
  try {
    const res = await fetch(`/api/shows/${slug}`, { method: 'DELETE' });
    if (!res.ok) { const d = await res.json(); alert(d.error); return; }
    document.getElementById(`show-${slug}`)?.remove();
    if (!document.querySelector('#show-list li:not(.empty-state)')) {
      document.getElementById('show-list').innerHTML = '<li class="empty-state">No shows yet. Add one above.</li>';
    }
  } catch (e) {
    alert(e.message);
  }
}

async function refreshShow(slug) {
  const btn = event.target;
  btn.disabled = true;
  btn.textContent = 'Refreshing…';
  try {
    const res = await fetch(`/api/shows/${slug}/refresh`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) { alert(data.error || 'Refresh failed'); return; }
    alert(`Refreshed: "${data.title}" — ${data.slideCount} slides`);
    await loadShows();
  } catch (e) {
    alert(e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Refresh';
  }
}

function showError(msg) {
  const el = document.getElementById('form-error');
  el.textContent = msg;
  el.style.display = 'block';
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Allow pressing Enter in the URL field to submit
document.getElementById('slides-url').addEventListener('keydown', e => {
  if (e.key === 'Enter') addShow();
});

loadShows();
