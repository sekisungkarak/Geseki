////////////////
// PARAMETERS //
////////////////

const queryString = window.location.search;
const urlParams = new URLSearchParams(queryString);

// Weather info
const weatherLocation = urlParams.get("weatherLocation") || "Jakarta";
// Durasi alert (detik -> ms). Dipakai HANYA untuk alert.
const alertDisplayDuration = GetIntParam("alertDuration", 4) * 1000;

// Durasi rotasi panel info (tanggal / jam / durasi / cuaca / penonton).
// Sengaja terpisah dari alertDisplayDuration supaya antrean padat tidak
// mempercepat putaran info.
const infoCycleDuration = GetIntParam("infoDuration", 4) * 1000;

// ---- Durasi alert dinamis saat antrean padat ----
// Antrean = event yang MASIH MENUNGGU (alertQueue.length), tidak termasuk
// alert yang sedang tayang.
const queueThreshold = GetIntParam("queueThreshold", 2);        // <= ini -> pakai alertDisplayDuration
const alertDurationMinMs = GetFloatParam("alertDurationMin", 1.5) * 1000;
const burstFullBacklog = GetIntParam("burstFullBacklog", 6);    // backlog >= ini -> durasi minimum

// Floor absolut: animasi pop 0.38s + transisi pill 0.35s harus sempat selesai.
const MIN_ALERT_FLOOR_MS = 1000;

// Custom Font (System font or Google Font)
const font = urlParams.get("font") || "";
if (font) {
	const cleanFont = font.trim();
	const fontLink = document.createElement("link");
	fontLink.rel = "stylesheet";
	fontLink.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(cleanFont).replace(/%20/g, '+')}:wght@400;500;600;700;800;900&display=swap`;
	document.head.appendChild(fontLink);

	document.body.style.fontFamily = `'${cleanFont}', "Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif`;
}

// TikTok parameters (ChatRD-style)
const tiktokService = (urlParams.get("tiktokService") || "both").toLowerCase(); // 'both', 'tikfinity', 'indofinity', 'none'
const tikfinityPort = GetIntParam("tikfinityPort", 21213);
const indofinityPort = GetIntParam("indofinityPort", 62024);
const tikfinityHost = urlParams.get("tikfinityHost") || "localhost";
const indofinityHost = urlParams.get("indofinityHost") || "localhost";

// Live detection (TikTok LIVE Studio -> Stream Deck Socket.IO channel)
const enableLiveDetect = GetBoolParam("enableLiveDetect", true);
const liveStudioPort = GetIntParam("liveStudioPort", 0); // 0 = auto-scan
const offlineText = urlParams.get("offlineText") || "Stream Offline";
const offlineViewersText = urlParams.get("offlineViewersText") || "-";

// Alert event filters
const followMessage = urlParams.get("followMessage") || "followed!";
const subscribeMessage = urlParams.get("subscribeMessage") || "subscribed!";
const shareMessage = urlParams.get("shareMessage") || "shared the live!";
const giftMessage = urlParams.get("giftMessage") || "sent {gift} x{count}!";

const enableFollow = GetBoolParam("enableFollow", true);
const enableSubscribe = GetBoolParam("enableSubscribe", true);
const enableShare = GetBoolParam("enableShare", true);
const enableGift = GetBoolParam("enableGift", true);
const enableFirstChatter = GetBoolParam("enableFirstChatter", true);

/////////////
// HELPERS //
/////////////

function GetIntParam(paramName, defaultValue) {
	const paramValue = urlParams.get(paramName);
	if (paramValue === null) return defaultValue;
	const intValue = parseInt(paramValue, 10);
	return isNaN(intValue) ? defaultValue : intValue;
}

function GetBoolParam(paramName, defaultValue) {
	const paramValue = urlParams.get(paramName);
	if (paramValue === null) return defaultValue;
	const val = String(paramValue).toLowerCase();
	if (val === 'true' || val === '1') return true;
	if (val === 'false' || val === '0') return false;
	return defaultValue;
}

// Sama seperti GetIntParam tapi menerima desimal (parseInt memotong 1.5 -> 1).
function GetFloatParam(paramName, defaultValue) {
	const paramValue = urlParams.get(paramName);
	if (paramValue === null) return defaultValue;
	const floatValue = parseFloat(paramValue);
	return isNaN(floatValue) ? defaultValue : floatValue;
}

function FormatDuration(ms) {
	const totalSeconds = Math.floor(ms / 1000);
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// Format angka penonton — mengikuti formatNumber() milik ChatRD
// (js/chatrd.js:639). Compact: >= 1.000.000 -> "1.2M", >= 1.000 -> "1.5K",
// di bawah itu apa adanya. Angka "1.234.567" yang panjang bikin pill
// dynamic island melebar, jadi format compact lebih cocok di sini.
function FormatViewers(count) {
	let n = Number(count);
	if (!isFinite(n) || isNaN(n) || n < 0) return '0';
	n = Math.floor(n);

	if (n >= 1000000) {
		let s = (n / 1000000).toFixed(1);
		if (s.endsWith('.0')) s = s.slice(0, -2);
		return s + 'M';
	}
	if (n >= 1000) {
		let s = (n / 1000).toFixed(1);
		if (s.endsWith('.0')) s = s.slice(0, -2);
		return s + 'K';
	}
	return n.toString();
}

///////////////////////
// DYNAMIC ISLAND    //
///////////////////////

const dynamicIsland = document.getElementById('dynamicIsland');
if ((urlParams.get("widgetStyle") || "solid") === "solid") {
	dynamicIsland.classList.add("style-solid");
}
const islandAvatar = document.getElementById('islandAvatar');
const islandIcon = document.getElementById('islandIcon');
const islandContent = document.getElementById('islandContent');
const islandText = document.getElementById('islandText');
const islandSubtext = document.getElementById('islandSubtext');
const islandEventIcon = document.getElementById('islandEventIcon');
const islandAlert = document.getElementById('islandAlert');
const alertIcon = document.getElementById('alertIcon');
const alertText = document.getElementById('alertText');

if (islandAvatar) {
	islandAvatar.onerror = () => {
		islandAvatar.classList.add('hidden');
		islandIcon.classList.remove('hidden');
	};
}

// Icon sources matching date and time style (Icons8 Fluency Systems Filled)
const ALERT_ICONS = {
	calendar: 'https://img.icons8.com/fluency-systems-filled/96/8A2BE2/calendar.png',
	clock: 'https://img.icons8.com/fluency-systems-filled/96/8A2BE2/clock.png',
	weather: 'https://img.icons8.com/fluency-systems-filled/96/8A2BE2/partly-cloudy-day.png',
	timer: 'https://img.icons8.com/fluency-systems-filled/96/FFD700/timer.png',
	viewers: 'https://img.icons8.com/fluency-systems-filled/96/FFD700/visible.png',
	gift: 'https://img.icons8.com/fluency-systems-filled/96/FF0050/gift.png',
	follow: 'https://img.icons8.com/fluency-systems-filled/96/00F2FE/add-user-male.png',
	subscribe: 'https://img.icons8.com/fluency-systems-filled/96/FFD700/star.png',
	share: 'https://img.icons8.com/fluency-systems-filled/96/00F2FE/share.png',
	like: 'https://img.icons8.com/fluency-systems-filled/96/FF0050/like.png'
};

let weatherData = null;
let viewerCount = null;
let currentPanelIndex = 0;
let cycleTimer = null;
let secondTicker = null;
let isAlertActive = false;
const widgetStartTime = Date.now();

// ---- Status live (dari deteksi LIVE Studio) ----
// null = belum diketahui, 0 = offline, 1 = paused, 2 = live
let liveStatus = null;
// Waktu mulai live yang sudah disepakati (ms). Diisi dari deteksi / localStorage / manual.
let liveStartedAtMs = null;
// Penanda: waktu mulai berasal dari localStorage (reload), bukan sesi baru.
let liveStartFromStorage = false;

// Teks panel durasi: offline -> "Stream Offline", live -> "Live • HH:MM:SS"
// Waktu mulai HANYA dari deteksi LIVE Studio (liveStartedAtMs).
function GetLiveDurationText() {
	if (liveStatus !== 2) return offlineText;

	const startMs = liveStartedAtMs !== null ? liveStartedAtMs : widgetStartTime;

	const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
	const hours = Math.floor(elapsedSeconds / 3600);
	const minutes = Math.floor((elapsedSeconds % 3600) / 60);
	const seconds = elapsedSeconds % 60;

	const pad = (n) => String(n).padStart(2, '0');
	return `Live • ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

const appLanguage = urlParams.get("language") || "id";

// Mengaktifkan bahasa pilihan untuk dayjs (jika dimuat)
if (typeof dayjs !== 'undefined') {
	dayjs.locale(appLanguage);
}

function GetTimeNowText() {
	const timeFormat = urlParams.get("timeFormat") || "HH:mm:ss A";
	if (typeof dayjs !== 'undefined') {
		return dayjs().format(timeFormat);
	}
	return new Date().toLocaleTimeString('id-ID');
}

// Rotate through info panels
// Purple icons = date/time & weather, yellow icons = event-related (duration, viewers)
const infoPanels = [
	{
		id: 'date',
		icon: ALERT_ICONS.calendar, // purple calendar
		ticks: false,
		text: () => {
			const dateFormat = urlParams.get("dateFormat") || "dddd, DD MMMM YYYY";
			if (typeof dayjs !== 'undefined') {
				return dayjs().format(dateFormat);
			}
			return new Date().toLocaleDateString('id-ID');
		}
	},
	{
		id: 'time',
		icon: ALERT_ICONS.clock, // purple clock
		ticks: true,
		text: () => GetTimeNowText()
	},
	{
		id: 'duration',
		icon: ALERT_ICONS.timer, // yellow stopwatch
		ticks: true,
		text: () => GetLiveDurationText()
	},
	{
		id: 'weather',
		icon: ALERT_ICONS.weather, // purple weather
		ticks: false,
		text: () => {
			if (weatherData) {
				return `${weatherData.desc} • ${weatherData.tempC}°C`;
			}
			return 'Cuaca tidak tersedia';
		}
	},
	{
		id: 'viewers',
		icon: ALERT_ICONS.viewers, // yellow eye
		ticks: false,
		text: () => {
			if (liveStatus !== 2) return offlineViewersText;
			return `${FormatViewers(viewerCount ?? 0)} penonton`;
		},
		// ChatRD menyimpan nilai mentah di data-viewers agar bisa dijumlahkan
		// lintas platform. Di sini belum ada gabungan, tapi pola yang sama
		// dipakai supaya angka aslinya tidak hilang setelah diformat.
		rawViewers: () => (liveStatus === 2 ? Math.max(0, Math.floor(Number(viewerCount) || 0)) : 0)
	}
];

function CycleInfo() {
	if (isAlertActive) return;
	currentPanelIndex = (currentPanelIndex + 1) % infoPanels.length;
	UpdateInfoText();
}

function UpdateInfoText(animate = true) {
	if (isAlertActive) return;
	ApplyInfoPanel(animate);
}

// Perbarui panel penonton TANPA animasi bounce.
// Dipakai oleh poll deteksi live, tick per detik, dan pembaruan viewer count
// supaya tampilan tidak berkedut terus-menerus.
function RefreshInfoText() {
	if (isAlertActive) return;
	ApplyInfoPanel(false);
}

// Terapkan perubahan jumlah penonton.
// Angka diperbarui HANYA bila panel penonton sedang tampil (index 4),
// dan dilakukan tanpa bounce — persis perilaku ChatRD, yang menulis
// textContent + dataset.viewers tanpa memicu animasi masuk lagi.
function UpdateViewerCount() {
	if (isAlertActive) return;

	const panel = infoPanels[currentPanelIndex];
	if (!panel || panel.id !== 'viewers') return; // panel lain: diam

	if (typeof panel.rawViewers === 'function') {
		islandText.dataset.viewers = String(panel.rawViewers());
	}

	const nextText = panel.text();
	if (islandText.textContent !== nextText) {
		islandText.textContent = nextText;
	}
}

function ApplyInfoPanel(animate) {
	if (isAlertActive) return;
	const panel = infoPanels[currentPanelIndex];
	if (!panel) return;

	const nextText = panel.text();

	// Mode senyap: cukup tulis ulang teks bila benar-benar berubah.
	// Tidak menyentuh elemen lain dan tidak memicu animasi apa pun.
	if (!animate) {
		if (islandText.textContent !== nextText) {
			islandText.textContent = nextText;
		}
		return;
	}

	// Mode rotasi / render awal: isi ulang panel + animasi bounce.
	islandText.textContent = nextText;
	islandIcon.src = panel.icon;
	islandIcon.classList.remove('hidden');

	// Simpan nilai mentah seperti ChatRD (span.dataset.viewers).
	// Berguna untuk inspeksi/debug dan siap dipakai bila nanti widget
	// perlu menjumlahkan penonton lintas platform.
	if (typeof panel.rawViewers === 'function') {
		islandText.dataset.viewers = String(panel.rawViewers());
	} else if (islandText.dataset.viewers) {
		delete islandText.dataset.viewers;
	}

	if (islandAvatar) {
		islandAvatar.classList.add('hidden');
		islandAvatar.src = '';
	}
	if (islandSubtext) {
		islandSubtext.classList.add('hidden');
		islandSubtext.textContent = '';
	}
	if (islandEventIcon) {
		islandEventIcon.classList.add('hidden');
		islandEventIcon.src = '';
	}

	// Small bounce animation each time panel changes
	islandIcon.classList.remove('bounce-in', 'alert-content-pop');
	islandText.classList.remove('bounce-in', 'alert-content-pop');
	void islandText.offsetWidth; // force reflow to restart animation
	islandIcon.classList.add('bounce-in');
	islandText.classList.add('bounce-in');
}

function StartCycleTimer() {
	StopCycleTimer();
	cycleTimer = setInterval(() => {
		if (!isAlertActive) {
			CycleInfo();
		}
	}, infoCycleDuration);
	StartSecondTicker();
}

function StopCycleTimer() {
	if (cycleTimer) {
		clearInterval(cycleTimer);
		cycleTimer = null;
	}
	StopSecondTicker();
}

function StartSecondTicker() {
	StopSecondTicker();
	secondTicker = setInterval(() => {
		if (isAlertActive) return;
		const currentPanel = infoPanels[currentPanelIndex];
		if (currentPanel && currentPanel.ticks) {
			// Jam berdetak tiap detik: perbarui teks saja, tanpa bounce.
			RefreshInfoText();
		}
	}, 1000);
}

function StopSecondTicker() {
	if (secondTicker) {
		clearInterval(secondTicker);
		secondTicker = null;
	}
}

/////////////////////////////////////////////
// TIKTOK LIVE STUDIO - DETEKSI STATUS LIVE //
/////////////////////////////////////////////

// Protokol Stream Deck LIVE Studio (terverifikasi di 1.35.2).
// Port tidak tetap; LIVE Studio memilih salah satu dari daftar ini.
const LIVE_STUDIO_PORTS = [28189, 39728, 34246, 42205, 38534, 40825, 40622];
const LS_SOCKET_PATH = '/socket.io/';
const LS_SOCKET_PROTOCOL = 'streamdeck_ttls_v1';
const LS_EVENT_JOIN_ROOM = 'stream_deck/join_room';
const LS_EVENT_SYNC_SETTINGS = 'stream_deck/sync_settings';

const LS_STATUS = { offline: 0, paused: 1, live: 2 };
const LS_POLL_INTERVAL = 2500;      // status tidak di-push, harus dipoll
const LS_RETRY_INTERVAL = 10000;    // jeda bila belum terhubung
const LS_STORAGE_KEY = 'geseki-live-started-at';
const LS_MAX_AGE = 12 * 60 * 60 * 1000; // localStorage dianggap basi setelah 12 jam

let lsSocket = null;
let lsPollTimer = null;
let lsRetryTimer = null;
let lsEndpoint = null;

// localStorage: simpan waktu mulai supaya reload OBS tidak mereset durasi.
function LoadStoredStartMs() {
	try {
		const raw = localStorage.getItem(LS_STORAGE_KEY);
		if (!raw) return null;
		const ms = parseInt(raw, 10);
		if (!isFinite(ms)) return null;
		if (Date.now() - ms > LS_MAX_AGE) {
			localStorage.removeItem(LS_STORAGE_KEY);
			return null;
		}
		return ms;
	} catch (e) {
		return null; // localStorage bisa diblokir (mode private / OBS)
	}
}

function SaveStartMs(ms) {
	try {
		localStorage.setItem(LS_STORAGE_KEY, String(ms));
	} catch (e) {
		console.debug('[Geseki][LiveDetect] localStorage tidak tersedia:', e);
	}
}

function ClearStoredStartMs() {
	try {
		localStorage.removeItem(LS_STORAGE_KEY);
	} catch (e) { /* abaikan */ }
}

// Terapkan perubahan status. Dipanggil tiap kali status berubah.
// startOverrideMs: waktu mulai eksplisit (dipakai saat simulasi/uji coba).
function ApplyLiveStatus(nextStatus, startOverrideMs) {
	const prev = liveStatus;
	const changed = prev !== nextStatus;
	liveStatus = nextStatus;

	if (nextStatus === LS_STATUS.live) {
		if (startOverrideMs !== undefined && startOverrideMs !== null) {
			// Nilai eksplisit selalu menang (dipakai untuk uji coba).
			liveStartedAtMs = startOverrideMs;
			liveStartFromStorage = false;
			SaveStartMs(liveStartedAtMs);
		} else if (liveStartedAtMs === null) {
			// Belum punya waktu mulai -> ini sesi live baru (atau widget baru
			// load). Pakai waktu sekarang.
			//
			// PENTING: cukup cek `liveStartedAtMs === null` saja. JANGAN pakai
			// penanda tambahan seperti liveStartFromStorage di kondisi ini —
			// penanda itu hanya untuk menandai nilai yang dipulihkan saat
			// startup, dan menggunakannya di sini membuat poll berikutnya
			// (tiap 2.5 detik) terus menghitung ulang waktu mulai.
			liveStartedAtMs = Date.now();
			liveStartFromStorage = false;
			SaveStartMs(liveStartedAtMs);
		}
		// else: liveStartedAtMs sudah ada -> pertahankan, jangan pernah diubah
		//       oleh polling. Inilah yang membuat durasi terus bertambah.
		if (prev !== LS_STATUS.live) {
			console.debug('[Geseki][LiveDetect] LIVE, start =', new Date(liveStartedAtMs).toLocaleString('id-ID'));
		}
	} else if (prev === LS_STATUS.live || liveStartFromStorage) {
		// Live berakhir, ATAU terbukti bukan reload (status pertama = offline).
		// Reset supaya sesi berikutnya menghitung dari nol.
		liveStartedAtMs = null;
		liveStartFromStorage = false;
		ClearStoredStartMs();
		viewerCount = null;
		console.debug('[Geseki][LiveDetect] Tidak live, status =', nextStatus);
	}

	// Segarkan tampilan HANYA bila status benar-benar berubah.
	// Poll berjalan tiap 2.5 detik; tanpa penjaga ini widget akan bounce
	// terus-menerus walau statusnya tetap sama.
	if (!changed || isAlertActive) return;

	const panel = infoPanels[currentPanelIndex];
	if (panel && (panel.id === 'duration' || panel.id === 'viewers')) {
		// Transisi live <-> offline memang layak mendapat animasi,
		// karena panel berpindah antara "Stream Offline" dan "Live • ...".
		UpdateInfoText();
	}
}

function ParseSyncSettings(data) {
	let state = data;
	if (typeof state === 'string') {
		try {
			state = JSON.parse(state);
		} catch (e) {
			return null;
		}
	}
	if (!state || typeof state !== 'object') return null;
	return state;
}

function PollLiveStatus() {
	if (!lsSocket || !lsSocket.connected) return;
	lsSocket.once(LS_EVENT_SYNC_SETTINGS, (data) => {
		const state = ParseSyncSettings(data);
		if (!state || state.stream_status === undefined) return;
		ApplyLiveStatus(Number(state.stream_status));
	});
	lsSocket.emit(LS_EVENT_SYNC_SETTINGS);
}

function StopLivePolling() {
	if (lsPollTimer) {
		clearInterval(lsPollTimer);
		lsPollTimer = null;
	}
	if (lsRetryTimer) {
		clearTimeout(lsRetryTimer);
		lsRetryTimer = null;
	}
	if (lsSocket) {
		try {
			lsSocket.removeAllListeners();
			lsSocket.close();
		} catch (e) { /* abaikan */ }
		lsSocket = null;
	}
	lsEndpoint = null;
}

function ConnectLiveStudio(portIndex) {
	// socket.io-client dimuat dari CDN; bila gagal, deteksi dilewati.
	if (typeof io === 'undefined') {
		console.debug('[Geseki][LiveDetect] socket.io-client tidak tersedia, deteksi dilewati.');
		ScheduleLiveRetry(0);
		return;
	}

	const ports = liveStudioPort > 0 ? [liveStudioPort] : LIVE_STUDIO_PORTS;
	if (portIndex >= ports.length) {
		// Tidak ada port yang menerima; coba lagi nanti (LIVE Studio mungkin belum siap).
		ScheduleLiveRetry(portIndex);
		return;
	}

	const port = ports[portIndex];
	const url = `ws://127.0.0.1:${port}`;
	let socket = null;

	try {
		socket = io(url, {
			path: LS_SOCKET_PATH,
			transports: ['websocket'],
			protocols: [LS_SOCKET_PROTOCOL],
			autoConnect: false,
			reconnection: false,
			timeout: 2500
		});
	} catch (e) {
		console.debug(`[Geseki][LiveDetect] Gagal membuat socket port ${port}:`, e);
		ConnectLiveStudio(portIndex + 1);
		return;
	}

	const connectTimer = setTimeout(() => {
		try {
			socket.close();
		} catch (e) { /* abaikan */ }
		console.debug(`[Geseki][LiveDetect] Timeout port ${port}, coba port berikutnya.`);
		ConnectLiveStudio(portIndex + 1);
	}, 3500);

	socket.once('connect', () => {
		clearTimeout(connectTimer);
		lsSocket = socket;
		lsEndpoint = url;
		console.debug(`[Geseki][LiveDetect] Terhubung ke LIVE Studio di ${url}`);

		socket.emit(LS_EVENT_JOIN_ROOM);

		// Baca status pertama kali, lalu poll berkala.
		PollLiveStatus();
		if (lsPollTimer) clearInterval(lsPollTimer);
		lsPollTimer = setInterval(PollLiveStatus, LS_POLL_INTERVAL);
	});

	socket.once('connect_error', (err) => {
		clearTimeout(connectTimer);
		try {
			socket.close();
		} catch (e) { /* abaikan */ }
		console.debug(`[Geseki][LiveDetect] Port ${port} menolak koneksi:`, err && err.message);
		ConnectLiveStudio(portIndex + 1);
	});

	socket.on('disconnect', (reason) => {
		console.debug('[Geseki][LiveDetect] Terputus:', reason);
		if (lsPollTimer) {
			clearInterval(lsPollTimer);
			lsPollTimer = null;
		}
		if (reason !== 'io client disconnect') {
			ScheduleLiveRetry(0);
		}
	});

	socket.connect();
}

function ScheduleLiveRetry(portIndex) {
	if (lsRetryTimer) clearTimeout(lsRetryTimer);
	lsRetryTimer = setTimeout(() => {
		lsRetryTimer = null;
		ConnectLiveStudio(portIndex > 0 ? portIndex : 0);
	}, LS_RETRY_INTERVAL);
}

function InitLiveDetection() {
	if (!enableLiveDetect) {
		// Deteksi mati: tidak ada sumber waktu mulai lain (streamStartedAt
		// sudah dihapus). Karena itu selalu anggap live dan hitung dari
		// widgetStartTime — durasi akan nol setiap kali OBS me-reload source.
		console.debug('[Geseki][LiveDetect] Dinonaktifkan lewat pengaturan.');
		liveStatus = LS_STATUS.live;
		liveStartedAtMs = widgetStartTime;
		UpdateInfoText();
		return;
	}

	// Default "belum diketahui" (null), BUKAN offline.
	// Penting: kalau status pertama yang terbaca adalah live, kita tidak bisa
	// tahu itu reload di tengah sesi atau sesi baru. Penanda ini membedakannya
	// dari transisi offline -> live yang benar-benar baru.
	liveStatus = null;

	// Pulihkan waktu mulai dari localStorage: ini khusus untuk kasus widget
	// di-reload di tengah sesi live yang sama (OBS suka me-reload browser
	// source). Akan dibuang bila ternyata ini sesi baru.
	if (liveStartedAtMs === null) {
		const stored = LoadStoredStartMs();
		if (stored !== null) {
			liveStartedAtMs = stored;
			liveStartFromStorage = true;
		}
	}

	ConnectLiveStudio(0);
}

// Muat socket.io-client dari CDN, lalu mulai deteksi.
function LoadSocketIoAndDetect() {
	if (typeof io !== 'undefined') {
		InitLiveDetection();
		return;
	}
	const script = document.createElement('script');
	script.src = 'https://cdn.socket.io/4.7.5/socket.io.min.js';
	script.onload = () => {
		console.debug('[Geseki][LiveDetect] socket.io-client siap.');
		InitLiveDetection();
	};
	script.onerror = () => {
		console.debug('[Geseki][LiveDetect] Gagal memuat socket.io-client, deteksi dilewati.');
	};
	document.head.appendChild(script);
}

// Fetch live data in the background (standard 15-minute interval)
const WEATHER_REFRESH_INTERVAL = 15 * 60 * 1000;

async function FetchWeather() {
	try {
		const response = await fetch(`https://wttr.in/${encodeURIComponent(weatherLocation)}?format=j1`);
		const data = await response.json();
		weatherData = {
			tempC: data.current_condition[0].temp_C,
			desc: data.current_condition[0].weatherDesc[0].value
		};
	} catch (error) {
		console.debug("[Geseki] Weather data fetch failed:", error);
	}
}

// Kick off info loop
function InitInfoLoop() {
	FetchWeather();
	setInterval(FetchWeather, WEATHER_REFRESH_INTERVAL);
	UpdateInfoText();
	StartCycleTimer();
	// Deteksi status LIVE Studio (mengisi liveStatus + liveStartedAtMs)
	LoadSocketIoAndDetect();
}

InitInfoLoop();

/////////////////////
// ALERT SYSTEM    //
/////////////////////

const alertQueue = [];
let alertLocked = false;
const recentAlerts = new Map();

// Durasi alert saat ini, dihitung ulang setiap kali alert mulai tayang.
// Antrean padat -> lebih cepat; antrean surut -> kembali ke alertDisplayDuration.
function ComputeAlertDuration() {
	// Hanya event yang MASIH MENUNGGU. Alert yang sedang tayang tidak dihitung.
	const backlog = alertQueue.length;

	if (backlog <= queueThreshold) return alertDisplayDuration;

	// Interpolasi linear: threshold -> durasi normal, burstFullBacklog -> durasi minimum.
	const span = Math.max(1, burstFullBacklog - queueThreshold);
	const t = Math.min(1, (backlog - queueThreshold) / span);
	const scaled = alertDisplayDuration - t * (alertDisplayDuration - alertDurationMinMs);

	// Floor absolut menjaga animasi pop (0.38s) + transisi pill (0.35s).
	return Math.max(MIN_ALERT_FLOOR_MS, Math.round(scaled));
}

function TriggerAlert(iconOrOptions, textArg, avatarArg, titleArg, subtextArg) {
	let alertData = {};
	if (typeof iconOrOptions === 'object' && iconOrOptions !== null) {
		alertData = { ...iconOrOptions };
	} else {
		alertData = {
			icon: iconOrOptions,
			text: textArg,
			avatar: avatarArg || '',
			title: titleArg || '',
			subtext: subtextArg || ''
		};
	}

	// Deduplicate identical alerts within 4s
	const key = `${alertData.icon}:${alertData.text || alertData.title}`;
	const now = Date.now();
	if (recentAlerts.has(key) && (now - recentAlerts.get(key) < 4000)) {
		return;
	}
	recentAlerts.set(key, now);
	if (recentAlerts.size > 50) {
		for (const [k, time] of recentAlerts.entries()) {
			if (now - time > 10000) recentAlerts.delete(k);
		}
	}

	alertQueue.push(alertData);
	ProcessAlertQueue();
}

function ProcessAlertQueue() {
	if (alertLocked || alertQueue.length === 0)
		return;

	const alertData = alertQueue.shift();
	alertLocked = true;
	isAlertActive = true;
	StopCycleTimer(); // IMMEDIATELY interrupt the looping widget!

	// Dihitung SETELAH shift(): yang dihitung adalah event yang MASIH MENUNGGU.
	// Alert yang sedang tayang diputuskan durasinya di sini dan tidak dipotong
	// di tengah jalan, supaya animasi pop tidak ter-clip.
	const currentAlertDuration = ComputeAlertDuration();

	const { icon, text, title, subtext, avatar, type } = alertData;

	// Profile picture handling
	if (avatar && islandAvatar) {
		islandAvatar.src = avatar;
		islandAvatar.classList.remove('hidden');
		islandIcon.classList.add('hidden');
	} else if (islandAvatar) {
		islandAvatar.classList.add('hidden');
		islandAvatar.src = '';
		islandIcon.src = icon;
		islandIcon.classList.remove('hidden');
	}

	// Event icon on the right side if avatar is present
	if (islandEventIcon) {
		if (avatar) {
			islandEventIcon.src = icon;
			islandEventIcon.classList.remove('hidden');
		} else {
			islandEventIcon.classList.add('hidden');
			islandEventIcon.src = '';
		}
	}

	// Text and subtext (2-line layout during alert)
	if (title && subtext && islandSubtext) {
		islandText.textContent = title;
		islandSubtext.textContent = subtext;
		islandSubtext.classList.remove('hidden');
	} else {
		islandText.textContent = text || title || '';
		if (islandSubtext) {
			islandSubtext.textContent = '';
			islandSubtext.classList.add('hidden');
		}
	}

	// Trigger alert animation on the dynamic island (making it taller with .alert-active)
	dynamicIsland.classList.add('alert-active');
	dynamicIsland.classList.remove('alert-pop');
	if (islandAvatar) islandAvatar.classList.remove('alert-content-pop');
	islandText.classList.remove('bounce-in', 'alert-content-pop');
	if (islandIcon) islandIcon.classList.remove('shake-anim');
	if (islandSubtext) islandSubtext.classList.remove('alert-content-pop');
	if (islandEventIcon) islandEventIcon.classList.remove('alert-content-pop', 'shake-anim');
	void dynamicIsland.offsetWidth; // Force reflow
	dynamicIsland.classList.add('alert-pop');
	if (islandAvatar) islandAvatar.classList.add('alert-content-pop');
	islandText.classList.add('alert-content-pop');
	if (islandSubtext) islandSubtext.classList.add('alert-content-pop');
	if (islandEventIcon) islandEventIcon.classList.add('alert-content-pop');

	if (type === 'gift') {
		if (avatar && islandEventIcon) {
			islandEventIcon.classList.add('shake-anim');
		} else if (islandIcon) {
			islandIcon.classList.add('shake-anim');
		}
	}

	// Legacy #islandAlert container mirror
	if (islandAlert) {
		if (alertIcon) {
			if (alertIcon.tagName === 'IMG') alertIcon.src = icon;
			else alertIcon.innerHTML = `<img src="${icon}" style="width:20px;height:20px;object-fit:contain;">`;
		}
		if (alertText) alertText.textContent = text || `${title} ${subtext}`;
	}

	setTimeout(() => {
		if (alertQueue.length > 0) {
			alertLocked = false;
			ProcessAlertQueue(); // Show next alert in queue immediately
		} else {
			// All alerts completed: resume ambient looping widget!
			dynamicIsland.classList.remove('alert-active', 'alert-pop');
			if (islandAvatar) {
				islandAvatar.classList.add('hidden');
				islandAvatar.src = '';
			}
			if (islandEventIcon) {
				islandEventIcon.classList.add('hidden');
				islandEventIcon.src = '';
			}
			if (islandSubtext) {
				islandSubtext.classList.add('hidden');
				islandSubtext.textContent = '';
			}
			islandIcon.classList.remove('hidden');

			isAlertActive = false;
			alertLocked = false;
			UpdateInfoText();
			StartCycleTimer();
		}
	}, currentAlertDuration);
}

// Global test helpers for preview / dev
const testUser = 'sekisungkarak';
const testAvatar = '../resources/sekisungkarak_avatar.jpeg';

window.testFollow = function () {
	const msg = urlParams.get("followMessage") || "followed!";
	TriggerAlert({
		type: 'follow',
		icon: typeof ALERT_ICONS !== 'undefined' ? ALERT_ICONS.follow : '',
		text: `${testUser} ${msg.replaceAll('{name}', testUser)}`,
		title: testUser,
		subtext: msg.replaceAll('{name}', testUser),
		avatar: testAvatar
	});
};

window.testSubscribe = function () {
	const msg = urlParams.get("subscribeMessage") || "subscribed!";
	TriggerAlert({
		type: 'subscribe',
		icon: typeof ALERT_ICONS !== 'undefined' ? ALERT_ICONS.subscribe : '',
		text: `${testUser} ${msg.replaceAll('{name}', testUser)}`,
		title: testUser,
		subtext: msg.replaceAll('{name}', testUser),
		avatar: testAvatar
	});
};

window.testShare = function () {
	const msg = urlParams.get("shareMessage") || "shared the live!";
	TriggerAlert({
		type: 'share',
		icon: typeof ALERT_ICONS !== 'undefined' ? ALERT_ICONS.share : '',
		text: `${testUser} ${msg.replaceAll('{name}', testUser)}`,
		title: testUser,
		subtext: msg.replaceAll('{name}', testUser),
		avatar: testAvatar
	});
};

window.testGift = function () {
	const msg = urlParams.get("giftMessage") || "sent {gift} x{count}!";
	const action = msg.replaceAll('{name}', testUser).replaceAll('{gift}', 'Galaxy').replaceAll('{count}', '1');
	TriggerAlert({
		type: 'gift',
		icon: typeof ALERT_ICONS !== 'undefined' ? ALERT_ICONS.gift : '',
		text: `${testUser} ${action}`,
		title: testUser,
		subtext: action,
		avatar: testAvatar
	});
};

window.testWidgetSelect = function(testType) {
	if (testType === "follow") {
		window.testFollow();
	} else if (testType === "subscribe") {
		window.testSubscribe();
	} else if (testType === "share") {
		window.testShare();
	} else if (testType === "gift") {
		window.testGift();
	} else if (testType === "all") {
		window.testFollow();
		window.testSubscribe();
		window.testShare();
		window.testGift();
	}
};

window.testWidget = function() {
	const testType = urlParams.get("testAlertType") || "all";
	window.testWidgetSelect(testType);
};
window.testAlert = TriggerAlert;
window.ALERT_ICONS = ALERT_ICONS;

// Broadcaster receiver untuk menerima test murni dari jendela Pengaturan / Tab lain (OBS dll)
if (window.BroadcastChannel) {
	const bc = new BroadcastChannel('geseki_island_channel');
	bc.onmessage = function(event) {
		if (event.data && event.data.type === 'trigger_test') {
			window.testWidgetSelect(event.data.testType);
		}
	};
}

// Helper debug status live: panggil window.liveInfo() di console.
window.liveInfo = function () {
	return {
		liveStatus: liveStatus,
		arti: liveStatus === 2 ? 'LIVE' : liveStatus === 1 ? 'PAUSED' : liveStatus === 0 ? 'OFFLINE' : 'BELUM DIKETAHUI',
		endpoint: lsEndpoint,
		startedAtMs: liveStartedAtMs,
		startedAt: liveStartedAtMs ? new Date(liveStartedAtMs).toLocaleTimeString('id-ID') : null,
		viewers: viewerCount,
		enableLiveDetect: enableLiveDetect
	};
};

/////////////////////////
// STREAMER.BOT CLIENT //
/////////////////////////

let streamerBotStatus = { connected: false, disconnected: false, error: false };
let client = null;

const sbAddress = urlParams.get("address") || urlParams.get("streamerBotServerAddress") || "127.0.0.1";
const sbPort = urlParams.get("port") || urlParams.get("streamerBotServerPort") || "8080";

if (typeof StreamerbotClient !== 'undefined') {
	try {
		client = new StreamerbotClient({
			host: sbAddress,
			port: sbPort,
			autoReconnect: false,

			onConnect: (data) => {
				streamerBotStatus.connected = true;
				streamerBotStatus.disconnected = false;
				streamerBotStatus.error = false;
				console.debug('[Geseki][Streamer.bot] Connected successfully');
			},

			onDisconnect: () => {
				if (!streamerBotStatus.disconnected) {
					console.debug('[Geseki][Streamer.bot] Disconnected');
				}
				streamerBotStatus.connected = false;
				streamerBotStatus.disconnected = true;
			},

			onError: (err) => {
				if (!streamerBotStatus.error) {
					console.debug('[Geseki][Streamer.bot] Connection error:', err);
				}
				streamerBotStatus.connected = false;
				streamerBotStatus.error = true;
			}
		});
	} catch (e) {
		console.debug('[Geseki][Streamer.bot] Init error:', e);
	}
}

if (client) {
	client.on('TikTok.Follow', (response) => {
		if (!enableFollow) return;
		console.debug('[Streamer.bot][TikTok.Follow]', response.data);
		const user = response.data.userName || response.data.user || 'Someone';
		const avatar = response.data.userProfileImageUrl || response.data.profileImageUrl || response.data.avatar || '';
		TriggerAlert({
			icon: ALERT_ICONS.follow,
			text: `${user} ${followMessage.replaceAll('{name}', user)}`,
			title: user,
			subtext: followMessage.replaceAll('{name}', user),
			avatar: avatar
		});
	});

	client.on('TikTok.Subscribe', (response) => {
		if (!enableSubscribe) return;
		console.debug('[Streamer.bot][TikTok.Subscribe]', response.data);
		const user = response.data.userName || response.data.user || 'Someone';
		const avatar = response.data.userProfileImageUrl || response.data.profileImageUrl || response.data.avatar || '';
		TriggerAlert({
			icon: ALERT_ICONS.subscribe,
			text: `${user} ${subscribeMessage.replaceAll('{name}', user)}`,
			title: user,
			subtext: subscribeMessage.replaceAll('{name}', user),
			avatar: avatar
		});
	});

	client.on('TikTok.Share', (response) => {
		if (!enableShare) return;
		console.debug('[Streamer.bot][TikTok.Share]', response.data);
		const user = response.data.userName || response.data.user || 'Someone';
		const avatar = response.data.userProfileImageUrl || response.data.profileImageUrl || response.data.avatar || '';
		TriggerAlert({
			icon: ALERT_ICONS.share,
			text: `${user} ${shareMessage.replaceAll('{name}', user)}`,
			title: user,
			subtext: shareMessage.replaceAll('{name}', user),
			avatar: avatar
		});
	});

	client.on('TikTok.Gift', (response) => {
		if (!enableGift) return;
		console.debug('[Streamer.bot][TikTok.Gift]', response.data);
		const user = response.data.userName || response.data.user || 'Someone';
		const gift = response.data.giftName || 'a gift';
		const repeatCount = response.data.repeatCount || 1;
		const action = giftMessage.replaceAll('{name}', user).replaceAll('{gift}', gift).replaceAll('{count}', repeatCount);
		const avatar = response.data.userProfileImageUrl || response.data.profileImageUrl || response.data.avatar || '';
		TriggerAlert({
			type: 'gift',
			icon: ALERT_ICONS.gift,
			text: `${user} ${action}`,
			title: user,
			subtext: action,
			avatar: avatar
		});
	});
}

////////////////////////////////////////
// TIKTOK CLIENT (ChatRD Architecture) //
////////////////////////////////////////

const tikFinityStatus = { connected: false, disconnected: false, error: false };
const indoFinityStatus = { connected: false, disconnected: false, error: false };

let tikfinityWebsocket = null;
let indofinityWebsocket = null;

async function tikfinityConnection() {
	if (tiktokService !== 'tikfinity' && tiktokService !== 'both') {
		return null;
	}

	const tikfinityWebSocketURL = `ws://${tikfinityHost}:${tikfinityPort}/`;
	const reconnectDelay = 10000;
	let retryCount = 0;
	let errorLogged = false;

	function connect() {
		try {
			tikfinityWebsocket = new WebSocket(tikfinityWebSocketURL);
		} catch (err) {
			if (!errorLogged) {
				console.debug(`[Geseki][TikFinity] Connection error:`, err);
				errorLogged = true;
			}
			setTimeout(connect, reconnectDelay);
			return null;
		}

		tikfinityWebsocket.onopen = () => {
			console.debug(`[Geseki][TikFinity] Connected to TikFinity successfully!`);
			retryCount = 0;
			errorLogged = false;

			tikFinityStatus.connected = true;
			tikFinityStatus.disconnected = false;
			tikFinityStatus.error = false;
		};

		tikfinityWebsocket.onmessage = (response) => {
			try {
				const data = JSON.parse(response.data);
				const tiktokData = data.data;

				console.debug(`[Geseki][TikFinity][TikTok] ${data.event}`, data);

				handleTikTokEvent(data.event, tiktokData, 'TikFinity');
			} catch (e) {
				console.debug(`[Geseki][TikFinity] Error parsing message:`, e);
			}
		};

		tikfinityWebsocket.onclose = (event) => {
			setTimeout(() => {
				connect();
			}, reconnectDelay);

			if (tikFinityStatus.disconnected === false && tikFinityStatus.connected === true) {
				console.debug(`[Geseki][TikFinity] Disconnected.`);
			}

			tikFinityStatus.connected = false;
			tikFinityStatus.disconnected = true;
			tikFinityStatus.error = true;
		};

		tikfinityWebsocket.onerror = (error) => {
			if (!errorLogged) {
				console.debug(`[Geseki][TikFinity] Connection error:`, error);
				errorLogged = true;
			}

			if (tikfinityWebsocket && tikfinityWebsocket.readyState !== WebSocket.CLOSED) {
				tikfinityWebsocket.close();
			}

			tikFinityStatus.connected = false;
			tikFinityStatus.disconnected = true;
			tikFinityStatus.error = true;
		};

		return tikfinityWebsocket;
	}

	return connect();
}

async function indofinityConnection() {
	if (tiktokService !== 'indofinity' && tiktokService !== 'both') {
		return null;
	}

	const indofinityWebSocketURL = `ws://${indofinityHost}:${indofinityPort}/`;
	const reconnectDelay = 10000;
	let retryCount = 0;
	let errorLogged = false;

	function connect() {
		try {
			indofinityWebsocket = new WebSocket(indofinityWebSocketURL);
		} catch (err) {
			if (!errorLogged) {
				console.debug(`[Geseki][IndoFinity] Connection error:`, err);
				errorLogged = true;
			}
			setTimeout(connect, reconnectDelay);
			return null;
		}

		indofinityWebsocket.onopen = () => {
			console.debug(`[Geseki][IndoFinity] Connected to IndoFinity successfully!`);
			retryCount = 0;
			errorLogged = false;

			indoFinityStatus.connected = true;
			indoFinityStatus.disconnected = false;
			indoFinityStatus.error = false;
		};

		indofinityWebsocket.onmessage = (response) => {
			try {
				const data = JSON.parse(response.data);
				const tiktokData = data.data;

				console.debug(`[Geseki][IndoFinity][TikTok] ${data.event}`, data);

				handleTikTokEvent(data.event, tiktokData, 'IndoFinity');
			} catch (e) {
				console.debug(`[Geseki][IndoFinity] Error parsing message:`, e);
			}
		};

		indofinityWebsocket.onclose = (event) => {
			setTimeout(() => {
				connect();
			}, reconnectDelay);

			if (indoFinityStatus.disconnected === false && indoFinityStatus.connected === true) {
				console.debug(`[Geseki][IndoFinity] Disconnected.`);
			}

			indoFinityStatus.connected = false;
			indoFinityStatus.disconnected = true;
			indoFinityStatus.error = true;
		};

		indofinityWebsocket.onerror = (error) => {
			if (!errorLogged) {
				console.debug(`[Geseki][IndoFinity] Connection error:`, error);
				errorLogged = true;
			}

			if (indofinityWebsocket && indofinityWebsocket.readyState !== WebSocket.CLOSED) {
				indofinityWebsocket.close();
			}

			indoFinityStatus.connected = false;
			indoFinityStatus.disconnected = true;
			indoFinityStatus.error = true;
		};

		return indofinityWebsocket;
	}

	return connect();
}

const firstChatters = new Set();

function handleTikTokEvent(event, tiktokData, source) {
	if (!tiktokData) return;

	const userName = tiktokData.nickname || tiktokData.uniqueId || 'Someone';
	const avatar = tiktokData.profilePictureUrl || tiktokData.profilePicture || tiktokData.avatarThumb || tiktokData.user?.profilePictureUrl || '';

	switch (event) {
		case 'chat': {
			if (!enableFirstChatter) return;
			const userId = tiktokData.userId;
			if (!userId) return;

			if (!firstChatters.has(userId)) {
				firstChatters.add(userId);
				const message = tiktokData.comment || tiktokData.msg || tiktokData.text || '';

				TriggerAlert({
					icon: 'https://img.icons8.com/fluency-systems-filled/96/FFFFFF/chat.png',
					title: userName,
					subtext: message,
					text: `${userName}: ${message}`,
					avatar: avatar
				});
			}
			break;
		}

		case 'roomUser': {
			if (tiktokData.viewerCount !== undefined) {
				viewerCount = Number(tiktokData.viewerCount);
				// Angka disimpan; yang menggambar ke layar adalah rotasi panel.
				UpdateViewerCount();
			}
			break;
		}

		case 'gift': {
			if (!enableGift) return;
			// ChatRD streak handling: if it's repeating gift streak, wait until streak ends
			if (tiktokData.giftType === 1 && !tiktokData.repeatEnd) {
				return;
			}
			const giftName = tiktokData.giftName || 'a gift';
			const repeatCount = tiktokData.repeatCount || 1;
			const giftIcon = tiktokData.giftPictureUrl || ALERT_ICONS.gift;
			const action = giftMessage.replaceAll('{name}', userName).replaceAll('{gift}', giftName).replaceAll('{count}', repeatCount);
			TriggerAlert({
				type: 'gift',
				icon: giftIcon,
				text: `${userName} ${action}`,
				title: userName,
				subtext: action,
				avatar: avatar
			});
			break;
		}

		case 'subscribe': {
			if (!enableSubscribe) return;
			TriggerAlert({
				icon: ALERT_ICONS.subscribe,
				text: `${userName} ${subscribeMessage.replaceAll('{name}', userName)}`,
			title: userName,
			subtext: subscribeMessage.replaceAll('{name}', userName),
				avatar: avatar
			});
			break;
		}

		case 'follow': {
			if (!enableFollow) return;
			TriggerAlert({
				icon: ALERT_ICONS.follow,
				text: `${userName} ${followMessage.replaceAll('{name}', userName)}`,
			title: userName,
			subtext: followMessage.replaceAll('{name}', userName),
				avatar: avatar
			});
			break;
		}

		case 'share': {
			if (!enableShare) return;
			TriggerAlert({
				icon: ALERT_ICONS.share,
				text: `${userName} ${shareMessage.replaceAll('{name}', userName)}`,
			title: userName,
			subtext: shareMessage.replaceAll('{name}', userName),
				avatar: avatar
			});
			break;
		}

		case 'like': {
			// Like event
			break;
		}
	}
}

// Connect TikTok services on ready
function initTikTokServices() {
	tikfinityConnection();
	indofinityConnection();
}

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', initTikTokServices);
} else {
	initTikTokServices();
}

console.log("Geseki dynamic-island-alert loaded");

// Fallback background for direct browser viewing: OBS browser sources expose
// window.obsstudio and stay truly transparent; anywhere else (Chrome tab, etc.)
// gets a dark checkerboard so the page isn't a blinding white canvas.
if (!window.obsstudio) {
	document.body.style.backgroundColor = '#1a1a1a';
	document.body.style.backgroundImage =
		'linear-gradient(45deg, #232323 25%, transparent 25%, transparent 75%, #232323 75%),' +
		'linear-gradient(45deg, #232323 25%, transparent 25%, transparent 75%, #232323 75%)';
	document.body.style.backgroundSize = '24px 24px';
	document.body.style.backgroundPosition = '0 0, 12px 12px';
}
