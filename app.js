/* ================= Boshlang'ich ma'lumotlar ================= */
const DEFAULT_TRACKS = [
    {
        id: 'm1',
        title: 'Fairy tale',
        artist: "Noma'lum",
        category: 'Pop',
        src: 'images/Fairy_tale.mp3',
        cover: '',
        date: '2026-10-01',
        views: 1240,
        duration: 0
    },
    {
        id: 'm2',
        title: 'Royalty',
        artist: "Noma'lum",
        category: 'Rock',
        src: 'images/Royalty.mp3',
        cover: '',
        date: '2026-09-12',
        views: 860,
        duration: 0
    },
    {
        id: 'm3',
        title: 'Thunder',
        artist: "Noma'lum",
        category: 'Jazz',
        src: 'images/Thunder.mp3',
        cover: '',
        date: '2026-08-03',
        views: 2310,
        duration: 0
    }
];

const SPEEDS = [1, 1.25, 1.5, 2, 0.75];

/* ================= Yordamchilar ================= */
const $ = (selector) => document.querySelector(selector);
const audio = $('#audio');
const seek = $('#seek');
const listEl = $('#trackList');
const searchInput = $('#searchInput');
const filterSelect = $('#filterSelect');
const sortSelect = $('#sortSelect');
const allBtn = $('#allBtn');
const dialog = $('#trackDialog');
const form = $('#trackForm');

const load = (key, fallback = {}) => {
    try {
        const value = JSON.parse(localStorage.getItem(key));
        return value ?? fallback;
    } catch {
        return fallback;
    }
};
const store = (key, value) => {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch { }
};

const esc = (text) =>
    String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ================= Holat (state) ================= */
const loadTracks = () => {
    const raw = load('tracks', null);
    if (!Array.isArray(raw)) return DEFAULT_TRACKS.map((track) => ({ ...track }));
    return raw
        .filter((track) => track && track.id && track.title && track.src)
        .map((track) => ({
            id: String(track.id),
            title: String(track.title),
            artist: String(track.artist || "Noma'lum"),
            category: String(track.category || 'Boshqa'),
            src: String(track.src),
            cover: String(track.cover || ''),
            date: String(track.date || today()),
            views: Number(track.views) || 0,
            duration: Number(track.duration) || 0
        }));
};

function today() {
    return new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

let tracks = loadTracks();
const saved = load('settings');
const plays = load('plays');
const state = {
    query: String(saved.query || ''),
    filter: '',
    sort: ''
};
let speed = SPEEDS[saved.speed] ? saved.speed : 0;
let currentId, counted, seeking, pendingTime = 0, lastSave = 0, editingId = null, toastTimer;
let groups = {};
let tests = {};

const saveTracks = () => store('tracks', tracks);
const byId = (id) => tracks.find((track) => track.id === id);
const views = (track) => track.views + (plays[track.id] || 0);
const fmtTime = (s) => `${Math.floor(s / 60) || 0}:${String(Math.floor(s % 60) || 0).padStart(2, '0')}`;
const fmtDate = (date) => String(date).split('-').reverse().join('.');
const fmtViews = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const cover = (track) => {
    const hue = [...track.artist + track.title].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) % 360, 0);
    const gradient = `linear-gradient(135deg, hsl(${hue} 70% 46%), hsl(${(hue + 55) % 360} 72% 34%))`;
    const url = track.cover.replace(/['\r\n]/g, (c) => (c === "'" ? '%27' : ''));
    return track.cover ? `center / cover no-repeat url('${url}'), ${gradient}` : gradient;
};

const toast = (message) => {
    const el = $('#toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
};

/* ================= Saralash va filter ================= */
const SORTERS = {
    az: (a, b) => a.title.localeCompare(b.title),
    za: (a, b) => b.title.localeCompare(a.title),
    views: (a, b) => views(b) - views(a),
    new: (a, b) => b.date.localeCompare(a.date),
    old: (a, b) => a.date.localeCompare(b.date)
};

// Filter ro'yxati musiqalar o'zgarganda qayta quriladi
const buildFilter = () => {
    const categories = [...new Set(tracks.map((track) => track.category))];
    groups = {
        Kategoriya: categories.map((name) => [`category:${name}`, name, (track) => track.category === name]),
        Davomiyligi: [
            ['short', '3 daqiqagacha', (track) => track.duration > 0 && track.duration < 180],
            ['medium', '3–5 daqiqa', (track) => track.duration >= 180 && track.duration <= 300],
            ['long', '5 daqiqadan uzun', (track) => track.duration > 300]
        ],
        "Ko'rishlar": [
            ['popular', "1000+ ko'rish", (track) => views(track) >= 1000],
            ['fewer', "1000 dan kam ko'rish", (track) => views(track) < 1000]
        ]
    };
    tests = Object.fromEntries(Object.values(groups).flat().map(([value, , test]) => [value, test]));

    filterSelect.length = 1;
    filterSelect.insertAdjacentHTML('beforeend', Object.entries(groups).map(([label, items]) =>
        `<optgroup label="${esc(label)}">${items.map(([value, text]) =>
            `<option value="${esc(value)}">${esc(text)}</option>`).join('')}</optgroup>`
    ).join(''));

    if (state.filter && !tests[state.filter]) state.filter = '';
    filterSelect.value = state.filter;

    $('#categoryList').innerHTML = categories.map((name) => `<option value="${esc(name)}"></option>`).join('');
};

const searchText = (track) => [
    track.title,
    track.artist,
    track.category,
    fmtDate(track.date),
    track.date,
    views(track),
    fmtViews(views(track)),
    "ko'rish",
    track.duration ? fmtTime(track.duration) : '',
    track.src
].join(' ').toLowerCase();

const visible = () => {
    const terms = state.query.toLowerCase().split(/\s+/).filter(Boolean);
    const list = tracks.filter((track) =>
        (!tests[state.filter] || tests[state.filter](track)) && terms.every((term) => searchText(track).includes(term))
    );
    return SORTERS[state.sort] ? list.sort(SORTERS[state.sort]) : list;
};

/* ================= Saqlash ================= */
const saveSettings = () => {
    store('settings', {
        ...state,
        speed,
        track: currentId,
        time: pendingTime || audio.currentTime || 0
    });
    lastSave = Date.now();
};

/* ================= Render ================= */
const ICON_EDIT = '<svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>';
const ICON_DELETE = '<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>';

const render = () => {
    const list = visible();
    listEl.innerHTML = list.map((track) => `
        <li class="track${track.id === currentId ? ' active' : ''}" data-id="${esc(track.id)}" tabindex="0">
            <div class="cover" style="background:${esc(cover(track))}">
                <div class="eq">
                    <i></i>
                    <i></i>
                    <i></i>
                </div>
            </div>
            <div class="track__meta">
                <div class="track__title">${esc(track.title)}</div>
                <div class="track__sub">${esc(track.artist)}</div>
                <div class="track__stats">${esc(fmtDate(track.date))} · ${fmtViews(views(track))} ko'rish</div>
            </div>
            <span class="badge">${esc(track.category)}</span>
            <span class="track__dur">${track.duration ? fmtTime(track.duration) : '–:––'}</span>
            <div class="track__actions">
                <button class="mini-btn" type="button" data-act="edit" aria-label="Tahrirlash" title="Tahrirlash">${ICON_EDIT}</button>
                <button class="mini-btn mini-btn--danger" type="button" data-act="delete" aria-label="O'chirish" title="O'chirish">${ICON_DELETE}</button>
            </div>
        </li>
    `).join('');
    $('#countLabel').textContent = `${list.length} / ${tracks.length} ta`;
    $('#emptyState').hidden = list.length > 0;
};

const update = () => {
    allBtn.classList.toggle('active', !state.filter && !state.sort);
    render();
    saveSettings();
};

const setProgress = (value) => {
    seek.style.setProperty('--p', `${Math.min(100, (value / (seek.max || 1)) * 100)}%`);
    $('#curTime').textContent = fmtTime(value);
};

const paintPlayer = (track) => {
    $('#pCover').style.background = track ? cover(track) : '';
    $('#pArtist').textContent = track ? track.artist : '';
    $('#pTitle').textContent = track ? track.title : 'Musiqa tanlanmagan';
    $('#durTime').textContent = fmtTime(track ? track.duration : 0);
};

/* ================= Pleyer ================= */
const selectTrack = (id, autoplay, time = 0) => {
    const track = byId(id);
    if (!track) return;
    currentId = id;
    counted = false;
    pendingTime = Number(time) || 0;
    audio.src = track.src;
    audio.playbackRate = SPEEDS[speed];
    seek.max = 100;
    seek.value = 0;
    setProgress(0);
    paintPlayer(track);
    update();
    if (autoplay) audio.play().catch(() => { });
};

const clearPlayer = () => {
    currentId = undefined;
    counted = false;
    pendingTime = 0;
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    seek.max = 100;
    seek.value = 0;
    setProgress(0);
    paintPlayer(null);
    update();
};

const togglePlay = () => (audio.paused ? audio.play().catch(() => { }) : audio.pause());

const step = (direction) => {
    const list = visible();
    if (!list.length) return;
    if (direction < 0 && audio.currentTime > 3) {
        audio.currentTime = 0;
        return;
    }
    const index = list.findIndex((track) => track.id === currentId);
    selectTrack(list[index < 0 ? 0 : (index + direction + list.length) % list.length].id, true);
};

const skip = (seconds) => {
    audio.currentTime = Math.max(0, Math.min(audio.duration || 0, audio.currentTime + seconds));
};

const applySpeed = () => {
    audio.defaultPlaybackRate = audio.playbackRate = SPEEDS[speed];
    $('#speedBtn').textContent = `${SPEEDS[speed]}x`;
};

const reset = (clearQuery) => {
    Object.assign(state, {
        filter: '',
        sort: '',
        query: clearQuery ? '' : state.query
    });
    filterSelect.value = sortSelect.value = '';
    searchInput.value = state.query;
    update();
};

// Audio davomiyligini aniqlash (warn = true bo'lsa, xato bo'lganda ogohlantiradi)
const probe = (track, warn = false) => {
    const el = new Audio();
    el.preload = 'metadata';
    el.onloadedmetadata = () => {
        if (!isFinite(el.duration) || !byId(track.id) || el.duration === track.duration) return;
        track.duration = el.duration;
        saveTracks();
        render();
    };
    if (warn) {
        el.onerror = () => alert(`⚠️ "${track.title}" audiosi yuklanmadi.\nAudio URL to'g'riligini tekshiring va ✏️ orqali tuzating.`);
    }
    el.src = track.src;
};

/* ================= Audio hodisalari ================= */
audio.ontimeupdate = () => {
    if (seeking) return;
    seek.value = audio.currentTime;
    setProgress(audio.currentTime);
    if (Date.now() - lastSave > 2000) saveSettings();
};

audio.onloadedmetadata = () => {
    const duration = audio.duration;
    if (!isFinite(duration)) return;
    seek.max = duration;
    $('#durTime').textContent = fmtTime(duration);
    if (pendingTime > 0 && pendingTime < duration) audio.currentTime = pendingTime;
    pendingTime = 0;
    seek.value = audio.currentTime;
    setProgress(audio.currentTime);
    const track = byId(currentId);
    if (track && Math.abs(track.duration - duration) > 1) {
        track.duration = duration;
        saveTracks();
        render();
    }
};

audio.onplay = () => {
    document.body.classList.add('playing');
    if (counted || !currentId) return;
    counted = true;
    plays[currentId] = (plays[currentId] || 0) + 1;
    store('plays', plays);
    render();
};

audio.onpause = () => {
    document.body.classList.remove('playing');
    saveSettings();
};

audio.onended = () => visible().length > 1 && step(1);

/* ================= Qo'shish / Tahrirlash / O'chirish ================= */
const validUrl = (value) => {
    if (/\s/.test(value)) return false;
    try {
        const url = new URL(value, location.href);
        return ['http:', 'https:', 'file:', 'blob:', 'data:'].includes(url.protocol);
    } catch {
        return false;
    }
};

const clearInvalid = () => form.querySelectorAll('.invalid').forEach((el) => el.classList.remove('invalid'));

const openForm = (id) => {
    const track = id ? byId(id) : null;
    editingId = track ? track.id : null;
    clearInvalid();
    form.reset();
    $('#dialogTitle').textContent = track ? 'Musiqani tahrirlash' : "Yangi musiqa qo'shish";
    $('#saveBtn').textContent = track ? 'Saqlash' : "Qo'shish";
    const el = form.elements;
    el.title.value = track ? track.title : '';
    el.artist.value = track && track.artist !== "Noma'lum" ? track.artist : '';
    el.category.value = track ? track.category : '';
    el.src.value = track ? track.src : '';
    el.cover.value = track ? track.cover : '';
    el.date.value = track ? track.date : today();
    dialog.showModal();
    el.title.focus();
};

const closeForm = () => {
    dialog.close();
    editingId = null;
};

const markInvalid = (keys) => {
    clearInvalid();
    keys.forEach((key) => form.elements[key].classList.add('invalid'));
    if (keys.length) form.elements[keys[0]].focus();
};

form.oninput = (event) => event.target.classList.remove('invalid');

form.onsubmit = (event) => {
    event.preventDefault();
    const keys = ['title', 'artist', 'category', 'src', 'cover', 'date'];
    const v = Object.fromEntries(keys.map((key) => [key, form.elements[key].value.trim()]));

    const labels = { title: 'Musiqa nomi', category: 'Kategoriya', src: 'Audio URL', date: 'Sana' };
    const missing = Object.keys(labels).filter((key) => !v[key]);
    const invalid = [...missing];
    const problems = [];

    if (missing.length) problems.push(`• Majburiy maydonlar to'ldirilmagan: ${missing.map((key) => labels[key]).join(', ')}`);
    if (v.src && !validUrl(v.src)) {
        invalid.push('src');
        problems.push("• Audio URL noto'g'ri formatda (masalan: https://site.com/song.mp3)");
    }
    if (v.cover && !validUrl(v.cover)) {
        invalid.push('cover');
        problems.push("• Muqova rasmi URL noto'g'ri formatda");
    }

    if (problems.length) {
        markInvalid(keys.filter((key) => invalid.includes(key)));
        alert(`⚠️ Xatolik!\n\n${problems.join('\n')}`);
        return;
    }

    const data = {
        title: v.title,
        artist: v.artist || "Noma'lum",
        category: v.category,
        src: v.src,
        cover: v.cover,
        date: v.date
    };

    if (editingId) {
        const track = byId(editingId);
        const srcChanged = track.src !== data.src;
        Object.assign(track, data);
        if (srcChanged) {
            track.duration = 0;
            probe(track, true);
        }
        saveTracks();
        buildFilter();
        closeForm();
        if (track.id === currentId) {
            if (srcChanged) selectTrack(track.id, !audio.paused);
            else {
                paintPlayer(track);
                update();
            }
        } else update();
        toast("Musiqa yangilandi ✓");
    } else {
        const track = { id: `m${Date.now()}`, ...data, views: 0, duration: 0 };
        tracks.push(track);
        saveTracks();
        buildFilter();
        probe(track, true);
        closeForm();
        reset(true);
        if (!currentId) selectTrack(track.id, false);
        toast("Musiqa qo'shildi ✓");
    }
};

const removeTrack = (id) => {
    const track = byId(id);
    if (!track) return;
    if (!confirm(`"${track.title}" musiqasini o'chirmoqchimisiz?`)) return;

    const wasCurrent = id === currentId;
    tracks = tracks.filter((item) => item.id !== id);
    delete plays[id];
    store('plays', plays);
    saveTracks();
    buildFilter();

    if (wasCurrent) {
        const next = visible()[0] || tracks[0];
        if (next) selectTrack(next.id, false);
        else clearPlayer();
    } else update();
    toast("Musiqa o'chirildi");
};

$('#addBtn').onclick = () => openForm();
$('#cancelBtn').onclick = closeForm;
dialog.onclick = (event) => {
    if (event.target === dialog) closeForm();
};
dialog.onclose = () => {
    editingId = null;
};

/* ================= Tugmalar ================= */
$('#playBtn').onclick = togglePlay;
$('#prevBtn').onclick = () => step(-1);
$('#nextBtn').onclick = () => step(1);
$('#backBtn').onclick = () => skip(-15);
$('#fwdBtn').onclick = () => skip(15);
$('#speedBtn').onclick = () => {
    speed = (speed + 1) % SPEEDS.length;
    applySpeed();
    saveSettings();
};

// Dark / Light rejimi localStorage'da saqlanadi
const setTheme = (dark) => {
    document.body.classList.toggle('dark', dark);
    store('theme', dark ? 'dark' : 'light');
};
$('#themeBtn').onclick = () => setTheme(!document.body.classList.contains('dark'));

$('#allBtn').onclick = () => reset(false);
$('#clearBtn').onclick = () => reset(true);

seek.oninput = () => {
    seeking = true;
    setProgress(+seek.value);
};
seek.onchange = () => {
    audio.currentTime = +seek.value;
    seeking = false;
};

searchInput.oninput = () => {
    state.query = searchInput.value;
    update();
};
filterSelect.onchange = () => {
    state.filter = filterSelect.value;
    update();
};
sortSelect.onchange = () => {
    state.sort = sortSelect.value;
    update();
};

listEl.onclick = (event) => {
    const item = event.target.closest('.track');
    if (!item) return;
    const button = event.target.closest('[data-act]');
    if (button) {
        event.stopPropagation();
        if (button.dataset.act === 'edit') openForm(item.dataset.id);
        else removeTrack(item.dataset.id);
        return;
    }
    if (item.dataset.id === currentId) togglePlay();
    else selectTrack(item.dataset.id, true);
};

listEl.onkeydown = (event) => {
    if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('.track')) {
        event.preventDefault();
        event.target.click();
    }
};

document.onkeydown = (event) => {
    if (event.key === ' ' && event.target === document.body) {
        event.preventDefault();
        togglePlay();
    }
};

window.onbeforeunload = () => saveSettings();

/* ================= Ishga tushirish ================= */
const savedTheme = load('theme', null);
document.body.classList.toggle(
    'dark',
    savedTheme ? savedTheme === 'dark' : typeof saved.dark === 'boolean' ? saved.dark : matchMedia('(prefers-color-scheme: dark)').matches
);

buildFilter();
state.filter = tests[saved.filter] ? saved.filter : '';
state.sort = SORTERS[saved.sort] ? saved.sort : '';
filterSelect.value = state.filter;
sortSelect.value = state.sort;
searchInput.value = state.query;
applySpeed();

const start = byId(saved.track) || visible()[0] || tracks[0];
if (start) selectTrack(start.id, false, start.id === saved.track ? saved.time : 0);
else clearPlayer();

tracks.forEach((track) => probe(track));