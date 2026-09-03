////////////////
// PARAMETERS //
////////////////

const queryString = window.location.search;
const urlParams = new URLSearchParams(queryString);

// Weather info
const weatherLocation = urlParams.get("weatherLocation") || "Jakarta";
const alertDisplayDuration = GetIntParam("alertDuration", 4) * 1000; // ms an alert stays visible

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
const showTiktok = GetBoolParam("showTiktok", true);
const tiktokService = (urlParams.get("tiktokService") || "both").toLowerCase(); // 'both', 'tikfinity', 'indofinity', 'none'
const tikfinityPort = GetIntParam("tikfinityPort", 21213);
const indofinityPort = GetIntParam("indofinityPort", 62024);
const tikfinityHost = urlParams.get("tikfinityHost") || "localhost";
const indofinityHost = urlParams.get("indofinityHost") || "localhost";

// Alert event filters
const enableFollow = GetBoolParam("enableFollow", true);
const enableSubscribe = GetBoolParam("enableSubscribe", true);
const enableShare = GetBoolParam("enableShare", true);
const enableGift = GetBoolParam("enableGift", true);

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

function FormatDuration(ms) {
	const totalSeconds = Math.floor(ms / 1000);
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

///////////////////////
// DYNAMIC ISLAND    //
///////////////////////

const dynamicIsland = document.getElementById('dynamicIsland');
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

function GetTimeNowText() {
	const now = new Date();
	return now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).replace(/\./g, ':');
}

function GetLiveDurationText() {
	let startMs = widgetStartTime;
	const rawStart = urlParams.get("streamStartedAt");
	if (rawStart) {
		const timeMatch = rawStart.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
		if (timeMatch) {
			const now = new Date();
			const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), parseInt(timeMatch[1], 10), parseInt(timeMatch[2], 10), parseInt(timeMatch[3] || 0, 10));
			if (startDate.getTime() > now.getTime()) {
				startDate.setDate(startDate.getDate() - 1); // Started yesterday
			}
			startMs = startDate.getTime();
		} else {
			const parsed = Date.parse(rawStart);
			if (!isNaN(parsed) && parsed <= Date.now()) {
				startMs = parsed;
			}
		}
	}

	const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
	const hours = Math.floor(elapsedSeconds / 3600);
	const minutes = Math.floor((elapsedSeconds % 3600) / 60);
	const seconds = elapsedSeconds % 60;

	const pad = (n) => String(n).padStart(2, '0');
	return `Live • ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

// Rotate through info panels
// Purple icons = date/time & weather, yellow icons = event-related (duration, viewers)
const infoPanels = [
	{
		id: 'date',
		icon: ALERT_ICONS.calendar, // purple calendar
		ticks: false,
		text: () => {
			const now = new Date();
			return now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
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
		text: () => `${viewerCount ?? 0} penonton`
	}
];

function CycleInfo() {
	if (isAlertActive) return;
	currentPanelIndex = (currentPanelIndex + 1) % infoPanels.length;
	UpdateInfoText();
}

function UpdateInfoText() {
	if (isAlertActive) return;
	islandText.textContent = infoPanels[currentPanelIndex].text();
	islandIcon.src = infoPanels[currentPanelIndex].icon;
	islandIcon.classList.remove('hidden');

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
	}, alertDisplayDuration);
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
			islandText.textContent = currentPanel.text();
		}
	}, 1000);
}

function StopSecondTicker() {
	if (secondTicker) {
		clearInterval(secondTicker);
		secondTicker = null;
	}
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
}

InitInfoLoop();

/////////////////////
// ALERT SYSTEM    //
/////////////////////

const alertQueue = [];
let alertLocked = false;
const recentAlerts = new Map();

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

	const { icon, text, title, subtext, avatar } = alertData;

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
	if (islandSubtext) islandSubtext.classList.remove('alert-content-pop');
	if (islandEventIcon) islandEventIcon.classList.remove('alert-content-pop');
	void dynamicIsland.offsetWidth; // Force reflow
	dynamicIsland.classList.add('alert-pop');
	if (islandAvatar) islandAvatar.classList.add('alert-content-pop');
	islandText.classList.add('alert-content-pop');
	if (islandSubtext) islandSubtext.classList.add('alert-content-pop');
	if (islandEventIcon) islandEventIcon.classList.add('alert-content-pop');

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
	}, alertDisplayDuration);
}

// Global test helpers for preview / dev
window.testWidget = function () {
	TriggerAlert({
		icon: ALERT_ICONS.gift,
		text: 'Geseki sent Galaxy x1!',
		title: 'Geseki',
		subtext: 'sent Galaxy x1!',
		avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&auto=format&fit=crop&q=80'
	});
};
window.testAlert = TriggerAlert;
window.ALERT_ICONS = ALERT_ICONS;

/////////////////////////
// STREAMER.BOT CLIENT //
/////////////////////////

let streamerBotStatus = { connected: false, disconnected: false, error: false };
let client = null;

const enableStreamerbot = GetBoolParam("enableStreamerbot", true);
const sbAddress = urlParams.get("address") || urlParams.get("streamerBotServerAddress") || "127.0.0.1";
const sbPort = urlParams.get("port") || urlParams.get("streamerBotServerPort") || "8080";

if (enableStreamerbot && typeof StreamerbotClient !== 'undefined') {
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
			text: `${user} followed!`,
			title: user,
			subtext: 'followed!',
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
			text: `${user} subscribed!`,
			title: user,
			subtext: 'subscribed!',
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
			text: `${user} shared the live!`,
			title: user,
			subtext: 'shared the live!',
			avatar: avatar
		});
	});

	client.on('TikTok.Gift', (response) => {
		if (!enableGift) return;
		console.debug('[Streamer.bot][TikTok.Gift]', response.data);
		const user = response.data.userName || response.data.user || 'Someone';
		const gift = response.data.giftName || 'a gift';
		const repeatCount = response.data.repeatCount || 1;
		const action = `sent ${gift}${repeatCount > 1 ? ` x${repeatCount}` : ''}!`;
		const avatar = response.data.userProfileImageUrl || response.data.profileImageUrl || response.data.avatar || '';
		TriggerAlert({
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
	if (!showTiktok || (tiktokService !== 'tikfinity' && tiktokService !== 'both')) {
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
	if (!showTiktok || (tiktokService !== 'indofinity' && tiktokService !== 'both')) {
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

function handleTikTokEvent(event, tiktokData, source) {
	if (!tiktokData) return;

	const userName = tiktokData.nickname || tiktokData.uniqueId || 'Someone';
	const avatar = tiktokData.profilePictureUrl || tiktokData.profilePicture || tiktokData.avatarThumb || tiktokData.user?.profilePictureUrl || '';

	switch (event) {
		case 'roomUser': {
			if (tiktokData.viewerCount !== undefined) {
				viewerCount = Number(tiktokData.viewerCount);
				// If viewer count panel is active and no alert is showing, update text immediately
				if (currentPanelIndex === 3 && !isAlertActive) {
					UpdateInfoText();
				}
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
			const action = `sent ${giftName}${repeatCount > 1 ? ` x${repeatCount}` : ''}!`;
			TriggerAlert({
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
				text: `${userName} subscribed!`,
				title: userName,
				subtext: 'subscribed!',
				avatar: avatar
			});
			break;
		}

		case 'follow': {
			if (!enableFollow) return;
			TriggerAlert({
				icon: ALERT_ICONS.follow,
				text: `${userName} followed!`,
				title: userName,
				subtext: 'followed!',
				avatar: avatar
			});
			break;
		}

		case 'share': {
			if (!enableShare) return;
			TriggerAlert({
				icon: ALERT_ICONS.share,
				text: `${userName} shared the live!`,
				title: userName,
				subtext: 'shared the live!',
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
