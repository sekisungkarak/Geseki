// Geseki settings-page-builder — ChatRD-style settings page (Web Awesome).
// Loads a declarative settings.json (passed as ?settingsJson=) and renders
// collapsible section cards per group, with a live widget preview iframe.

// Search parameters
const queryString = window.location.search;
const urlParams = new URLSearchParams(queryString);
let settingsJson = urlParams.get("settingsJson");
let widgetURL = urlParams.get("widgetURL");

// Fallbacks if opened directly without query parameters:
if (!settingsJson) {
    settingsJson = '../../dynamic-island-alert/settings/settings.json';
}
if (!widgetURL) {
    widgetURL = '../../dynamic-island-alert/';
}
const showUnmuteIndicator = GetBooleanParam("showUnmuteIndicator", false);

const bc = window.BroadcastChannel ? new BroadcastChannel('geseki_island_channel') : null;

// Page elements
const settingsPanel = document.getElementById('settingsPanel');
const widgetPreview = document.getElementById('widgetPreview');
const unmuteLabel = document.getElementById('unmute-label');
const widgetTitle = document.getElementById('widgetTitle');
const copyUrlButton = document.getElementById('copyUrlButton');
const loadDefaultsButton = document.getElementById('loadDefaultsButton');
const openImportModalButton = document.getElementById('openImportModal');
const importModal = document.getElementById('modalUrlImport');
const loadDefaultsModal = document.getElementById('modalLoadDefaults');

// Global variables
let settingsData = null;
let settingsMap = new Map();

// Unique localStorage key prefix per widget = the WIDGET FOLDER name.
// widgetURL looks like ".../<widget-folder>/index.html", so drop any trailing
// filename (index.html or a bare "index") before taking the last path segment.
// Using the raw last segment would yield "index.html" — a shared key that makes
// every widget overwrite each other's saved settings.
const keyPrefix = (() => {
    let segments = widgetURL.replace(/\/+$/, '').split('/').filter(Boolean);
    if (segments.length && /\.(html?|php|aspx?)$/i.test(segments[segments.length - 1])) {
        segments = segments.slice(0, -1);
    }
    return segments[segments.length - 1] || 'widget';
})();

// Header: widget name derived from the widget folder name (kebab-case -> Title Case)
if (keyPrefix) {
    widgetTitle.textContent = keyPrefix
        .split(/[-_]/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

// Header logo auto-fallback for any manual replacement (jpg, png, logo.png, etc.)
const headerLogo = document.getElementById('headerLogo');
if (headerLogo) {
    const candidateLogos = [
        '../../resources/logo/sekisungkarak_logo.jpg',
        '../../resources/logo/sekisungkarak_logo.png',
        '../../resources/logo/logo.png',
        '../../resources/logo/logo.jpg',
        '../../resources/logo/sekisungkarak.png',
        '../../resources/logo/sekisungkarak.jpg'
    ];
    let candidateIndex = 0;
    headerLogo.addEventListener('error', () => {
        candidateIndex++;
        if (candidateIndex < candidateLogos.length) {
            headerLogo.src = candidateLogos[candidateIndex];
        } else {
            headerLogo.style.display = 'none';
        }
    });
}

if (showUnmuteIndicator)
    unmuteLabel.style.display = 'inline';

importModal.querySelector('#importUrl').placeholder = `${widgetURL}?...`;

// Modals: cancel buttons close, save/confirm buttons act
importModal.querySelector('.button.cancel').addEventListener('click', () => importModal.open = false);
importModal.querySelector('.button.save').addEventListener('click', () => {
    const urlInput = importModal.querySelector('#importUrl');
    ImportSettings(urlInput.value.trim());
    urlInput.value = '';
    importModal.open = false;
});

loadDefaultsModal.querySelector('.button.cancel').addEventListener('click', () => loadDefaultsModal.open = false);
loadDefaultsModal.querySelector('.button.save').addEventListener('click', () => {
    LoadDefaultSettings();
    loadDefaultsModal.open = false;
});

// Footer buttons
async function CopyToClipboard(text) {
    // 1. Modern clipboard API
    if (navigator.clipboard && window.isSecureContext !== false) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (err) {
            console.warn('[Copy] navigator.clipboard blocked or failed, using fallback:', err);
        }
    }

    // 2. Reliable textarea + execCommand fallback (works in iframes and file:/// contexts)
    try {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.setAttribute('readonly', '');
        textArea.style.position = 'fixed';
        textArea.style.top = '-9999px';
        textArea.style.left = '-9999px';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        textArea.setSelectionRange(0, 99999);
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        if (successful) return true;
    } catch (err) {
        console.error('[Copy] Fallback execCommand error:', err);
    }

    // 3. Fallback prompt if clipboard access is strictly restricted
    window.prompt('Copy your widget URL:', text);
    return true;
}

copyUrlButton.addEventListener('click', async () => {
    const defaultHTML = copyUrlButton.innerHTML;
    try {
        const url = BuildWidgetURL();
        const success = await CopyToClipboard(url);
        if (success) {
            copyUrlButton.innerHTML = 'Copied!';
            copyUrlButton.classList.add('copied');

            setTimeout(() => {
                copyUrlButton.innerHTML = defaultHTML;
                copyUrlButton.classList.remove('copied');
            }, 3000);
        }
    } catch (err) {
        console.error('[Copy URL] Error:', err);
        copyUrlButton.innerHTML = '<i class="ri-error-warning-line"></i> Error';
        setTimeout(() => {
            copyUrlButton.innerHTML = defaultHTML;
        }, 3000);
    }
});

loadDefaultsButton.addEventListener('click', () => loadDefaultsModal.open = true);
openImportModalButton.addEventListener('click', () => importModal.open = true);


/////////////////////////////
// LOAD FROM SETTINGS.JSON //
/////////////////////////////

function LoadJSON(settingsJson) {
    fetch(settingsJson)
        .then(response => response.json())
        .then(data => {
            settingsData = data;

            // Clear the settings panel
            settingsPanel.innerHTML = '';
            
            // Clear category map so it regenerates properly on reload/reset
            window.__categoryMap = {};

            const groupedSettings = {};

            // Group settings by their 'group' property
            data.settings.forEach(setting => {
                if (!groupedSettings[setting.group]) {
                    groupedSettings[setting.group] = [];
                }
                groupedSettings[setting.group].push(setting);
            });

            let groupIndex = 0;
            const sectionIcons = ['ri-settings-4-fill', 'ri-notification-3-fill', 'ri-palette-fill', 'ri-links-fill', 'ri-slideshow-3-fill'];

            const groupIconMap = {
                'Streamer.bot Connection': 'ri-robot-2-fill',
                'Streamerbot Connection': 'ri-robot-2-fill',
                'TikTok Connection': 'ri-tiktok-fill',
                'General': 'ri-settings-4-fill',
                'Alert Events': 'ri-notification-3-fill'
            };

            // Render one collapsible section card per group
            for (const groupName in groupedSettings) {
                const section = document.createElement('wa-details');
                section.classList.add('section');

                // Determine whether section is expanded (open) or collapsed by default
                let isOpen = false;
                if (data.groups && data.groups[groupName] && data.groups[groupName].open !== undefined) {
                    isOpen = Boolean(data.groups[groupName].open);
                } else if (data.expandedGroups && data.expandedGroups.includes(groupName)) {
                    isOpen = true;
                } else if (data.collapsedGroups && data.collapsedGroups.includes(groupName)) {
                    isOpen = false;
                } else {
                    const hasExplicitOpen = groupedSettings[groupName].some(s => s.groupOpen === true || s.groupExpanded === true);
                    const hasExplicitClosed = groupedSettings[groupName].some(s => s.groupOpen === false || s.groupCollapsed === true);
                    if (hasExplicitOpen) isOpen = true;
                    else if (hasExplicitClosed) isOpen = false;
                    else isOpen = (groupIndex === 0);
                }

                if (isOpen) section.setAttribute('open', '');

                const header = document.createElement('span');
                header.classList.add('header');
                header.setAttribute('slot', 'summary');

                const title = document.createElement('span');
                title.classList.add('title');
                const icon = document.createElement('i');
                const customIcon = data.groups?.[groupName]?.icon || groupIconMap[groupName] || sectionIcons[groupIndex % sectionIcons.length];
                icon.className = customIcon;
                title.appendChild(icon);
                title.appendChild(document.createTextNode(groupName));
                header.appendChild(title);

                // ChatRD-style connection badge inside section summary
                const badgeType = data.groups?.[groupName]?.badge;
                if (badgeType) {
                    const checkSpan = document.createElement('span');
                    checkSpan.classList.add('check');
                    const statusSpan = document.createElement('span');
                    statusSpan.classList.add('status');
                    statusSpan.id = `status-${badgeType}`;

                    const dangerBadge = document.createElement('wa-badge');
                    dangerBadge.setAttribute('variant', 'danger');
                    dangerBadge.setAttribute('pill', '');

                    const successBadge = document.createElement('wa-badge');
                    successBadge.setAttribute('variant', 'success');
                    successBadge.setAttribute('pill', '');

                    statusSpan.appendChild(dangerBadge);
                    statusSpan.appendChild(successBadge);
                    checkSpan.appendChild(statusSpan);
                    header.appendChild(checkSpan);
                }

                section.appendChild(header);

                groupedSettings[groupName].forEach(setting => {
                    const configRow = document.createElement('div');
                    configRow.classList.add('config');
                    if (setting.full || setting.type === 'button') {
                        configRow.classList.add('full');
                    }
                    configRow.id = `item-${setting.id}`;

                    const infoDiv = document.createElement('div');
                    infoDiv.classList.add('info');

                    if (setting.label) {
                        const label = document.createElement('div');
                        label.classList.add('title');
                        label.textContent = setting.label;
                        infoDiv.appendChild(label);
                    }

                    if (setting.description) {
                        const description = document.createElement('div');
                        description.classList.add('description');
                        description.innerHTML = `<small>${setting.description}</small>`;
                        infoDiv.appendChild(description);
                    }

                    configRow.appendChild(infoDiv);

                    if (setting.type !== 'button') {
                        const elementDiv = document.createElement('div');
                        elementDiv.classList.add('element');
                        elementDiv.appendChild(BuildInput(setting));
                        configRow.appendChild(elementDiv);
                    }

                    section.appendChild(configRow);
                });

                // Check category of this group
                const firstSetting = groupedSettings[groupName][0];
                const categoryName = firstSetting.category;

                if (categoryName) {
                    if (!window.__categoryMap) window.__categoryMap = {};

                    if (!window.__categoryMap[categoryName]) {
                        const catSection = document.createElement('wa-details');
                        catSection.classList.add('section', 'category-section');
                        
                        // Is category expanded?
                        let catIsOpen = false;
                        if (data.categories && data.categories[categoryName] && data.categories[categoryName].open !== undefined) {
                            catIsOpen = Boolean(data.categories[categoryName].open);
                        } else {
                            catIsOpen = true;
                        }
                        if (catIsOpen) catSection.setAttribute('open', '');

                        const catHeader = document.createElement('span');
                        catHeader.classList.add('header');
                        catHeader.setAttribute('slot', 'summary');

                        const catTitle = document.createElement('span');
                        catTitle.classList.add('title');
                        const catIcon = document.createElement('i');
                        catIcon.className = data.categories?.[categoryName]?.icon || 'ri-folder-3-fill';
                        catTitle.appendChild(catIcon);
                        catTitle.appendChild(document.createTextNode(categoryName));
                        catHeader.appendChild(catTitle);
                        catSection.appendChild(catHeader);

                        // Category styles so it stands out and indents children
                        catSection.style.border = '1px solid var(--border-color)';
                        catSection.style.marginBottom = '20px';
                        catSection.style.background = 'var(--panel-color)';

                        settingsPanel.appendChild(catSection);
                        window.__categoryMap[categoryName] = catSection;
                    }

                    // Nest the group section inside the category section
                    // Add indentation styles
                    section.style.border = 'none';
                    section.style.borderTop = '1px solid var(--border-color)';
                    section.style.marginBottom = '0';
                    section.style.borderRadius = '0';
                    section.style.boxShadow = 'none';
                    window.__categoryMap[categoryName].appendChild(section);
                } else {
                    settingsPanel.appendChild(section);
                }

                groupIndex++;
            }

            ApplyShowIfVisibility();
            InitConnectionBadges();
            RefreshWidgetPreview();
            SaveSettingsToStorage();
        })
        .catch(error => {
            console.error('Error loading settings:', error);
            settingsPanel.innerHTML = `
                <div style="text-align: center; padding: 40px 20px; color: #ff5555;">
                    <i class="ri-error-warning-line" style="font-size: 32px; margin-bottom: 12px; display: block;"></i>
                    <div style="font-weight: bold; margin-bottom: 8px;">Gagal Memuat Settings JSON</div>
                    <small style="color: #888; display: block; margin-bottom: 16px;">${error.message || error}<br><br>Target: ${settingsJson}</small>
                    <button onclick="location.reload()" style="background: #333; color: #fff; border: 1px solid #444; padding: 6px 16px; border-radius: 6px; cursor: pointer;">Coba Lagi</button>
                </div>
            `;
        });
}

function BuildInput(setting) {
    const savedValue = settingsMap.has(setting.id) ? settingsMap.get(setting.id) : setting.defaultValue;
    let inputElement;

    switch (setting.type) {
        case 'text':
            inputElement = document.createElement('wa-input');
            inputElement.value = savedValue ?? '';
            inputElement.setAttribute('autocomplete', 'off');
            break;

        case 'password':
            inputElement = document.createElement('wa-input');
            inputElement.type = 'password';
            inputElement.value = savedValue ?? '';
            inputElement.setAttribute('autocomplete', 'off');
            break;

        case 'number':
            inputElement = document.createElement('wa-number-input');
            inputElement.value = savedValue ?? '';
            if (setting.min !== undefined) inputElement.min = setting.min;
            if (setting.max !== undefined) inputElement.max = setting.max;
            if (setting.step !== undefined) inputElement.step = setting.step;
            break;

        case 'checkbox':
            inputElement = document.createElement('wa-switch');
            inputElement.setAttribute('size', 'xl');
            inputElement.checked = Boolean(savedValue);
            break;

        case 'select':
            inputElement = document.createElement('wa-select');
            setting.options.forEach(option => {
                const optionElement = document.createElement('wa-option');
                optionElement.value = option.value;
                optionElement.textContent = option.label;
                inputElement.appendChild(optionElement);
            });
            inputElement.value = savedValue ?? '';
            break;

        case 'color':
            inputElement = document.createElement('wa-color-picker');
            inputElement.value = savedValue ?? '#ffffff';
            break;
        case 'font':
            inputElement = document.createElement('wa-input');
            inputElement.value = savedValue ?? '';
            inputElement.placeholder = 'Type to search font (e.g. Poppins, Inter)...';
            inputElement.setAttribute('autocomplete', 'off');
            inputElement.setAttribute('clearable', '');
            inputElement.setAttribute('list', 'fonts');

            const wireFontDatalist = () => {
                inputElement.setAttribute('list', 'fonts');
                if (inputElement.shadowRoot) {
                    const innerInput = inputElement.shadowRoot.querySelector('input');
                    if (innerInput) innerInput.setAttribute('list', 'fonts');
                    const globalDatalist = document.getElementById('fonts');
                    if (globalDatalist && !inputElement.shadowRoot.getElementById('fonts')) {
                        inputElement.shadowRoot.appendChild(globalDatalist.cloneNode(true));
                    }
                }
            };

            inputElement.addEventListener('focus', async function loadOnce() {
                inputElement.removeEventListener('focus', loadOnce);
                await PopulateFontDatalist();
                wireFontDatalist();
            }, { once: true });

            setTimeout(wireFontDatalist, 50);
            break;

        case 'button':
            inputElement = document.createElement('wa-button');
            inputElement.textContent = setting.label;
            inputElement.setAttribute('variant', 'brand');
            inputElement.addEventListener('click', () => {
                widgetPreview.contentWindow[setting.callFunction]?.();
            });
            return inputElement;

        default:
            inputElement = document.createElement('wa-input');
            inputElement.value = savedValue ?? '';
    }

    // Common: remember the setting id, persist + refresh on change
    inputElement.id = setting.id;
    inputElement.addEventListener('input', () => {
        let value;
        if (setting.type === 'checkbox')
            value = inputElement.checked;
        else if (setting.type === 'number')
            value = Number(inputElement.value);
        else
            value = inputElement.value;

        // Custom override for Auto Test Dropdown: trigger instantly without reload
        if (setting.id === 'testAlertType') {
            if (value && value !== 'none') {
                try {
                    widgetPreview.contentWindow.testWidgetSelect(value);
                    if (bc) bc.postMessage({ type: 'trigger_test', testType: value });
                } catch (e) {
                    console.error("Test trigger failed", e);
                }
            }
            return; // Skip save & refresh
        }

        settingsMap.set(setting.id, value);
        SaveSettingsToStorage();
        RefreshWidgetPreview();
        ApplyShowIfVisibility();
    });

    return inputElement;
}

function ApplyShowIfVisibility() {
    if (!settingsData) return;

    settingsData.settings.forEach(setting => {
        if (setting.showIf) {
            const itemElement = document.getElementById(`item-${setting.id}`);
            const parentInput = document.getElementById(setting.showIf);
            let shouldShow = true;

            // Walk up the chain of showIf dependencies
            let currentSetting = setting;
            while (currentSetting.showIf) {
                const parentElement = document.getElementById(currentSetting.showIf);
                if (!parentElement || !parentElement.checked) {
                    shouldShow = false;
                    break;
                }
                currentSetting = settingsData.settings.find(s => s.id === currentSetting.showIf) || {};
            }

            if (itemElement)
                itemElement.style.display = shouldShow ? 'flex' : 'none';
        }
    });
}


////////////////////////////
// SETTINGS PERSISTENCE   //
////////////////////////////

function SaveSettingsToStorage() {
    const settingsArray = Array.from(settingsMap.entries());
    const settingsArrayString = JSON.stringify(settingsArray);
    localStorage.setItem(`${keyPrefix}-settings`, settingsArrayString);
}

function LoadSettingsFromStorage() {
    const settingsMapString = localStorage.getItem(`${keyPrefix}-settings`);
    if (settingsMapString) {
        const settingsMapArray = JSON.parse(settingsMapString);
        settingsMap = new Map(settingsMapArray);
    }
}

function LoadDefaultSettings() {
    localStorage.removeItem(`${keyPrefix}-settings`);
    settingsMap = new Map();
    LoadJSON(settingsJson);
}


///////////////////////////
// URL BUILDER + PREVIEW //
///////////////////////////

function BuildWidgetURL() {
    const settings = {};

    settingsData.settings.forEach(setting => {
        if (setting.type === 'button') return; // Skip buttons

        const inputElement = document.getElementById(setting.id);
        if (!inputElement) return;

        if (setting.type === 'checkbox')
            settings[setting.id] = inputElement.checked;
        else
            settings[setting.id] = inputElement.value;
    });

    const paramString = Object.entries(settings)
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
        .join('&');

    let cleanWidgetURL = widgetURL || '../../dynamic-island-alert/';

    // Convert relative URL to full absolute URL based on window location
    try {
        cleanWidgetURL = new URL(cleanWidgetURL, window.location.href).href;
    } catch (e) {}

    // Ensure it explicitly points to index.html for OBS Studio CEF compatibility
    if (cleanWidgetURL.endsWith('/')) {
        cleanWidgetURL += 'index.html';
    } else if (!cleanWidgetURL.endsWith('index.html')) {
        cleanWidgetURL += '/index.html';
    }

    return cleanWidgetURL + (paramString ? "?" + paramString : "");
}

function RefreshWidgetPreview() {
    const url = BuildWidgetURL();
    widgetPreview.src = url;
}


///////////////////////////
// IMPORT SETTINGS (URL) //
///////////////////////////

function ImportSettings(urlString) {
    try {
        const url = new URL(urlString);

        url.searchParams.forEach((value, key) => {
            const inputElement = document.getElementById(key);
            if (inputElement != null) {
                if (inputElement.tagName === 'WA-SWITCH')
                    inputElement.checked = value.toLocaleLowerCase() == 'true';
                else
                    inputElement.value = value;

                inputElement.dispatchEvent(new Event('input'));
            }
        });
    }
    catch (error) {
        console.error('[Settings] Invalid URL passed to ImportSettings:', error);
    }
}


//////////////////////
// HELPER FUNCTIONS //
//////////////////////

function GetBooleanParam(paramName, defaultValue) {
    const urlParams = new URLSearchParams(window.location.search);
    const paramValue = urlParams.get(paramName);

    if (paramValue === null) {
        return defaultValue; // Parameter not found
    }

    const lowercaseValue = paramValue.toLowerCase(); // Handle case-insensitivity

    if (lowercaseValue === 'true') {
        return true;
    } else if (lowercaseValue === 'false') {
        return false;
    } else {
        return paramValue; // Return original string if not 'true' or 'false'
    }
}

function GetIntParam(paramName, defaultValue) {
    const urlParams = new URLSearchParams(window.location.search);
    const paramValue = urlParams.get(paramName);

    if (paramValue === null) {
        return defaultValue; // Parameter not found
    }

    const intValue = parseInt(paramValue, 10); // Parse as base 10 integer

    if (isNaN(intValue)) {
        return null;
    }

    return intValue;
}


/////////////////////////////
// LOCAL & WEB FONTS       //
/////////////////////////////

async function PopulateFontDatalist() {
    let datalistElement = document.getElementById('fonts');
    if (!datalistElement) {
        datalistElement = document.createElement('datalist');
        datalistElement.id = 'fonts';
        document.body.appendChild(datalistElement);
    }

    const defaultFonts = [
        'Arial', 'Arial Black', 'Bebas Neue', 'Calibri', 'Century Gothic', 'Comic Sans MS',
        'Consolas', 'Courier New', 'DM Sans', 'Franklin Gothic Medium', 'Futura', 'Georgia',
        'Helvetica', 'Impact', 'Inter', 'Lato', 'Lucida Sans', 'Metropolis', 'Montserrat',
        'Noto Sans', 'Open Sans', 'Oswald', 'Outfit', 'Playfair Display', 'Poppins',
        'PT Sans', 'Raleway', 'Roboto', 'Rubik', 'Segoe UI', 'Tahoma', 'Times New Roman',
        'Trebuchet MS', 'Ubuntu', 'Verdana'
    ];

    let fontFamilies = [...defaultFonts];

    if ('queryLocalFonts' in window) {
        try {
            const availableFonts = await window.queryLocalFonts();
            const localFamilies = [...new Set(availableFonts.map(font => font.family))];
            fontFamilies = [...new Set([...defaultFonts, ...localFamilies])].sort();
        } catch (err) {
            console.debug("Local Font Access API unavailable or denied, using curated font list:", err);
        }
    }

    datalistElement.innerHTML = '';
    fontFamilies.forEach(family => {
        const option = document.createElement('option');
        option.value = family;
        datalistElement.appendChild(option);
    });

    // Also attach into any wa-input shadow roots
    document.querySelectorAll('wa-input[list="fonts"]').forEach(waInput => {
        if (waInput.shadowRoot) {
            const existing = waInput.shadowRoot.getElementById('fonts');
            if (existing) existing.remove();
            waInput.shadowRoot.appendChild(datalistElement.cloneNode(true));
            const innerInput = waInput.shadowRoot.querySelector('input');
            if (innerInput) innerInput.setAttribute('list', 'fonts');
        }
    });

    console.debug(`Loaded ${fontFamilies.length} fonts into auto-suggest.`);
}


///////////////////////
// INITIALISATION    //
///////////////////////

LoadSettingsFromStorage();
PopulateFontDatalist();
LoadJSON(settingsJson);

///////////////////////////////////////
// CHATRD-STYLE CONNECTION BADGES    //
///////////////////////////////////////

function InitConnectionBadges() {
    InitStreamerBotBadge();
    InitTikTokBadge();
}

function InitStreamerBotBadge() {
    const status = document.getElementById('status-streamerbot');
    if (!status) return;

    let sbClient = null;

    function isStreamerbotEnabled() {
        const enableInput = document.getElementById('enableStreamerbot');
        if (enableInput) return enableInput.checked;
        if (settingsMap.has('enableStreamerbot')) return Boolean(settingsMap.get('enableStreamerbot'));
        return true;
    }

    function checkConnect() {
        if (!isStreamerbotEnabled()) {
            if (sbClient) {
                try { sbClient.disconnect?.(); } catch (e) {}
                sbClient = null;
            }
            status.classList.remove('connected');
            return;
        }

        const addressInput = document.getElementById('address');
        const portInput = document.getElementById('port');
        const host = addressInput?.value || settingsMap.get('address') || '127.0.0.1';
        const port = portInput?.value || settingsMap.get('port') || 8080;

        if (typeof StreamerbotClient === 'undefined') return;

        try {
            if (sbClient) {
                try { sbClient.disconnect?.(); } catch (e) {}
                sbClient = null;
            }

            sbClient = new StreamerbotClient({
                host,
                port,
                autoReconnect: false,
                onConnect: () => {
                    if (isStreamerbotEnabled()) {
                        status.classList.add('connected');
                    }
                },
                onDisconnect: () => {
                    status.classList.remove('connected');
                },
                onError: () => {
                    status.classList.remove('connected');
                }
            });
        } catch (e) {
            status.classList.remove('connected');
        }
    }

    checkConnect();
    setInterval(checkConnect, 15000);

    const enableInput = document.getElementById('enableStreamerbot');
    if (enableInput) enableInput.addEventListener('change', checkConnect);
    const addressInput = document.getElementById('address');
    if (addressInput) addressInput.addEventListener('change', checkConnect);
    const portInput = document.getElementById('port');
    if (portInput) portInput.addEventListener('change', checkConnect);
}

function InitTikTokBadge() {
    const status = document.getElementById('status-tiktok');
    if (!status) return;

    let tfWs = null;
    let ifWs = null;

    function isTikTokEnabled() {
        const showTiktokInput = document.getElementById('showTiktok');
        if (showTiktokInput) return showTiktokInput.checked;
        if (settingsMap.has('showTiktok')) return Boolean(settingsMap.get('showTiktok'));
        return true;
    }

    function getSelectedService() {
        const serviceSelect = document.getElementById('tiktokService');
        if (serviceSelect?.value) return String(serviceSelect.value).toLowerCase();
        if (settingsMap.has('tiktokService')) return String(settingsMap.get('tiktokService')).toLowerCase();
        return 'both';
    }

    function checkTikTok() {
        if (!isTikTokEnabled()) {
            if (tfWs) { try { tfWs.close(); } catch (e) {} tfWs = null; }
            if (ifWs) { try { ifWs.close(); } catch (e) {} ifWs = null; }
            status.classList.remove('connected');
            return;
        }

        const service = getSelectedService();
        const tfPortInput = document.getElementById('tikfinityPort');
        const ifPortInput = document.getElementById('indofinityPort');
        const tfPort = tfPortInput?.value || settingsMap.get('tikfinityPort') || 21213;
        const ifPort = ifPortInput?.value || settingsMap.get('indofinityPort') || 62024;

        // If NOT using IndoFinity, close and discard any existing IndoFinity socket
        if (service === 'tikfinity') {
            if (ifWs) {
                try { ifWs.close(); } catch (e) {}
                ifWs = null;
            }
        }

        // If NOT using TikFinity, close and discard any existing TikFinity socket
        if (service === 'indofinity') {
            if (tfWs) {
                try { tfWs.close(); } catch (e) {}
                tfWs = null;
            }
        }

        // Connect TikFinity if requested
        if (service === 'tikfinity' || service === 'both') {
            if (!tfWs || tfWs.readyState === WebSocket.CLOSED) {
                try {
                    tfWs = new WebSocket(`ws://localhost:${tfPort}/`);
                    tfWs.onopen = () => update();
                    tfWs.onclose = () => { tfWs = null; update(); };
                    tfWs.onerror = () => {
                        if (tfWs && tfWs.readyState !== WebSocket.CLOSED) tfWs.close();
                        tfWs = null;
                        update();
                    };
                } catch (e) {
                    tfWs = null;
                }
            }
        }

        // Connect IndoFinity if requested
        if (service === 'indofinity' || service === 'both') {
            if (!ifWs || ifWs.readyState === WebSocket.CLOSED) {
                try {
                    ifWs = new WebSocket(`ws://localhost:${ifPort}/`);
                    ifWs.onopen = () => update();
                    ifWs.onclose = () => { ifWs = null; update(); };
                    ifWs.onerror = () => {
                        if (ifWs && ifWs.readyState !== WebSocket.CLOSED) ifWs.close();
                        ifWs = null;
                        update();
                    };
                } catch (e) {
                    ifWs = null;
                }
            }
        }

        update();
    }

    function update() {
        if (!isTikTokEnabled()) {
            status.classList.remove('connected');
            return;
        }

        const service = getSelectedService();
        let isConnected = false;

        const isTfOpen = Boolean(tfWs && tfWs.readyState === WebSocket.OPEN);
        const isIfOpen = Boolean(ifWs && ifWs.readyState === WebSocket.OPEN);

        if (service === 'tikfinity') {
            isConnected = isTfOpen;
        } else if (service === 'indofinity') {
            isConnected = isIfOpen;
        } else { // 'both'
            isConnected = isTfOpen || isIfOpen;
        }

        if (isConnected) {
            status.classList.add('connected');
        } else {
            status.classList.remove('connected');
        }
    }

    checkTikTok();
    setInterval(checkTikTok, 10000);

    const showTiktokInput = document.getElementById('showTiktok');
    if (showTiktokInput) showTiktokInput.addEventListener('change', checkTikTok);

    const serviceSelect = document.getElementById('tiktokService');
    if (serviceSelect) serviceSelect.addEventListener('change', checkTikTok);

    const tfPortInput = document.getElementById('tikfinityPort');
    if (tfPortInput) tfPortInput.addEventListener('change', checkTikTok);

    const ifPortInput = document.getElementById('indofinityPort');
    if (ifPortInput) ifPortInput.addEventListener('change', checkTikTok);
}


