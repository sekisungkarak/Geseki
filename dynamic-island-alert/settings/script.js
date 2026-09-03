const widgetContainer = document.getElementById('widgetContainer');

const settingsPageURL = '../../.utilities/settings-page-builder/index.html';

const currentURL = window.location.href;

let settingsJSON;
let baseURL = currentURL;

if (baseURL.endsWith("index.html"))
	baseURL = baseURL.replace(/index\.html$/, "");

if (!baseURL.endsWith("/"))
	baseURL += "/";

settingsJSON = "?settingsJson=" + baseURL + "settings.json";

let widgetURL = "&widgetURL=" + baseURL.replace(/\/settings\/?$/, "/index.html");

console.debug("Window Ref: " + window.location.href);
console.debug("Base URL: " + baseURL);
console.debug("Settings JSON: " + settingsJSON);
console.debug("Widget URL: " + widgetURL);

widgetContainer.src = settingsPageURL + settingsJSON + widgetURL;
