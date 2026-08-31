const { app, BrowserWindow, WebContentsView, ipcMain, session, shell, Menu, dialog, nativeImage, desktopCapturer, clipboard, Notification, powerMonitor } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const { makeWindowOpenPolicy } = require('./window-policy');
const https = require('https');
const fs = require('fs');

const SIDEBAR_WIDTH = 68;
const TOP_BAR = 44;
const FRAME = 8;

// Medien starten NICHT von allein beim Laden, sondern erst nach einem echten
// Klick auf die Seite. WICHTIG: die Chrome-Standardstufe
// 'document-user-activation-required' reicht NICHT – Chrome lässt viel besuchte
// Seiten (hoher Media-Engagement-Index, z. B. YouTube) trotzdem autoplayen.
// 'user-gesture-required' ignoriert diesen Bonus und verlangt immer eine Geste
// → YouTube spielt nach dem Neuöffnen von Verti nicht mehr von selbst los
// (Freddys Wunsch 24.08.2026). Muss vor app-ready gesetzt werden.
app.commandLine.appendSwitch('autoplay-policy', 'user-gesture-required');
const BROWSER_ID = 'browser';
const BROWSER_BAR = 93;    // Tabs + Adresszeile (10% größer)
const BOOKMARK_BAR = 37;   // Lesezeichenleiste (nur wenn Lesezeichen da sind)
const SUGGEST_H = 300;     // Höhe des Vorschlags-Dropdowns (Shell wächst dann)
function browserBarHeight() { return BROWSER_BAR + (state && Array.isArray(state.bookmarks) && state.bookmarks.length ? BOOKMARK_BAR : 0); }
const isMac = process.platform === 'darwin';

// Entwickeln/Testen mit eigenem Profil, ohne das echte Verti-Profil (und eine
// laufende Verti-Instanz) zu stören: VERTI_USER_DATA=/pfad/testprofil npx electron .
if (process.env.VERTI_USER_DATA) app.setPath('userData', process.env.VERTI_USER_DATA);

// Nur EINE Verti-Instanz pro Profil. Liefen zwei Prozesse auf derselben
// Session (persist:apps) — z.B. die installierte App und eine Dev-Version —,
// stritten sie sich um die Live-Verbindungen von Kalender/WhatsApp/Spotify
// (Google-Push, WebSockets) und blockierten sie gegenseitig: Die Apps luden
// nicht mehr, obwohl das Netz da war (im echten Browser lief alles). Zwei
// Prozesse auf einem Profil riskieren zudem dessen Beschädigung (LevelDB/
// Safe Storage) — vermutlich ein Teil des Chaos vom 21.08. Die zweite
// Instanz beendet sich und holt die erste nach vorn. Testprofile
// (VERTI_USER_DATA) haben einen eigenen Pfad und damit einen eigenen Lock,
// stören die installierte App also nicht.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

const DEFAULT_APPS = [
  { id: 'browser', name: 'Verti Browser', url: 'https://verti.browser/', icon: 'icons/verti-browser.svg' },
  { id: 'calendar', name: 'Google Kalender', url: 'https://calendar.google.com/', icon: 'https://ssl.gstatic.com/calendar/images/dynamiclogo_2020q4/calendar_31_2x.png' },
  { id: 'whatsapp', name: 'WhatsApp', url: 'https://web.whatsapp.com/', icon: 'icons/whatsapp.png' },
  { id: 'todoist', name: 'Todoist', url: 'https://app.todoist.com/app/upcoming' },
  { id: 'chatgpt', name: 'ChatGPT', url: 'https://chatgpt.com/' },
];

// IMPERIO-Standard-Apps erscheinen in der Bibliothek in einem eigenen Bereich oben
const IMPERIO_IDS = ['browser', 'calendar', 'stackfield', 'claude', 'chatgpt', 'imperio-tools', 'gdrive'];

// App-Bibliothek nach Themen sortiert. Reihenfolge der Kategorien + Zuordnung
// je App-id. Neue Kategorien (z. B. „Banking") erscheinen automatisch, sobald
// eine App diese category bekommt. Nicht gelistete Apps landen unter „Weitere".
const CATEGORY_ORDER = ['IMPERIO', 'KI', 'Kommunikation', 'Produktivität', 'Cloud-Speicher', 'Developer-Tools', 'Design', 'Arbeit & Business', 'Banking & Finanzen', 'Unterhaltung', 'Soziales', 'News & Wetter', 'Lernen', 'Shopping', 'Reise', 'Gesundheit & Fitness'];
const CATEGORIES = {
  'browser': 'IMPERIO', 'imperio-tools': 'IMPERIO',
  'chatgpt': 'KI', 'claude': 'KI', 'gemini': 'KI', 'perplexity': 'KI', 'deepl': 'KI', 'microsoftcopilot': 'KI', 'grok': 'KI', 'mistrallechat': 'KI', 'notebooklm': 'KI', 'midjourney': 'KI', 'elevenlabs': 'KI', 'poe': 'KI', 'huggingface': 'KI', 'suno': 'KI', 'ideogram': 'KI',
  'whatsapp': 'Kommunikation', 'telegram': 'Kommunikation', 'slack': 'Kommunikation', 'teams': 'Kommunikation', 'discord': 'Kommunikation', 'messenger': 'Kommunikation', 'zoom': 'Kommunikation', 'meet': 'Kommunikation', 'gmail': 'Kommunikation', 'outlook': 'Kommunikation', 'googlechat': 'Kommunikation', 'skype': 'Kommunikation', 'webex': 'Kommunikation', 'protonmail': 'Kommunikation', 'gmx': 'Kommunikation', 'webde': 'Kommunikation',
  'calendar': 'Produktivität', 'todoist': 'Produktivität', 'stackfield': 'Produktivität', 'notion': 'Produktivität', 'trello': 'Produktivität', 'asana': 'Produktivität', 'airtable': 'Produktivität', 'miro': 'Produktivität', 'office': 'Produktivität', 'gdocs': 'Produktivität', 'gsheets': 'Produktivität', 'evernote': 'Produktivität', 'onenote': 'Produktivität', 'googlekeep': 'Produktivität', 'clickup': 'Produktivität', 'mondaycom': 'Produktivität', 'jira': 'Produktivität', 'confluence': 'Produktivität', 'coda': 'Produktivität', 'calendly': 'Produktivität', 'zapier': 'Produktivität', 'make': 'Produktivität', 'smartsheet': 'Produktivität',
  'dropbox': 'Cloud-Speicher', 'gdrive': 'Cloud-Speicher', 'gphotos': 'Cloud-Speicher', 'onedrive': 'Cloud-Speicher', 'icloud': 'Cloud-Speicher', 'box': 'Cloud-Speicher', 'mega': 'Cloud-Speicher', 'pcloud': 'Cloud-Speicher', 'wetransfer': 'Cloud-Speicher', 'protondrive': 'Cloud-Speicher',
  'github': 'Developer-Tools', 'gitlab': 'Developer-Tools', 'bitbucket': 'Developer-Tools', 'replit': 'Developer-Tools', 'codepen': 'Developer-Tools', 'codesandbox': 'Developer-Tools', 'stackblitz': 'Developer-Tools', 'vercel': 'Developer-Tools', 'netlify': 'Developer-Tools', 'cloudflare': 'Developer-Tools', 'awsconsole': 'Developer-Tools', 'googlecloud': 'Developer-Tools', 'microsoftazure': 'Developer-Tools', 'digitalocean': 'Developer-Tools', 'postman': 'Developer-Tools', 'linear': 'Developer-Tools',
  'figma': 'Design', 'canva': 'Design', 'adobeexpress': 'Design', 'adobecreativecloud': 'Design', 'photopea': 'Design', 'framer': 'Design', 'penpot': 'Design', 'dribbble': 'Design', 'behance': 'Design',
  'weclapp': 'Arbeit & Business', 'getresponse': 'Arbeit & Business', 'hubspot': 'Arbeit & Business', 'salesforce': 'Arbeit & Business', 'pipedrive': 'Arbeit & Business', 'zoho': 'Arbeit & Business', 'shopify': 'Arbeit & Business', 'mailchimp': 'Arbeit & Business', 'brevo': 'Arbeit & Business', 'lexoffice': 'Arbeit & Business', 'sevdesk': 'Arbeit & Business', 'datev': 'Arbeit & Business', 'xero': 'Arbeit & Business', 'quickbooks': 'Arbeit & Business', 'zendesk': 'Arbeit & Business', 'intercom': 'Arbeit & Business', 'freshdesk': 'Arbeit & Business', 'personio': 'Arbeit & Business', 'docusign': 'Arbeit & Business',
  'paypal': 'Banking & Finanzen', 'stripe': 'Banking & Finanzen', 'wise': 'Banking & Finanzen', 'n26': 'Banking & Finanzen', 'revolut': 'Banking & Finanzen', 'klarna': 'Banking & Finanzen', 'comdirect': 'Banking & Finanzen', 'dkb': 'Banking & Finanzen', 'ing': 'Banking & Finanzen', 'sparkasse': 'Banking & Finanzen', 'commerzbank': 'Banking & Finanzen', 'traderepublic': 'Banking & Finanzen', 'scalablecapital': 'Banking & Finanzen', 'coinbase': 'Banking & Finanzen', 'binance': 'Banking & Finanzen',
  'youtube': 'Unterhaltung', 'spotify': 'Unterhaltung', 'netflix': 'Unterhaltung', 'disney': 'Unterhaltung', 'amazonprimevideo': 'Unterhaltung', 'applemusic': 'Unterhaltung', 'appletv': 'Unterhaltung', 'twitch': 'Unterhaltung', 'soundcloud': 'Unterhaltung', 'deezer': 'Unterhaltung', 'amazonmusic': 'Unterhaltung', 'youtubemusic': 'Unterhaltung', 'dazn': 'Unterhaltung', 'audible': 'Unterhaltung', 'plex': 'Unterhaltung', 'wowsky': 'Unterhaltung', 'crunchyroll': 'Unterhaltung',
  'x': 'Soziales', 'linkedin': 'Soziales', 'instagram': 'Soziales', 'facebook': 'Soziales', 'reddit': 'Soziales', 'pinterest': 'Soziales', 'tiktok': 'Soziales', 'threads': 'Soziales', 'snapchat': 'Soziales', 'bluesky': 'Soziales', 'xing': 'Soziales', 'mastodon': 'Soziales', 'tumblr': 'Soziales',
  'googlenews': 'News & Wetter', 'tagesschau': 'News & Wetter', 'spiegel': 'News & Wetter', 'zeitonline': 'News & Wetter', 'faz': 'News & Wetter', 'handelsblatt': 'News & Wetter', 'bbc': 'News & Wetter', 'cnn': 'News & Wetter', 'reuters': 'News & Wetter', 'theguardian': 'News & Wetter', 'bloomberg': 'News & Wetter', 'wettercom': 'News & Wetter', 'accuweather': 'News & Wetter', 'feedly': 'News & Wetter', 'pocket': 'News & Wetter',
  'duolingo': 'Lernen', 'coursera': 'Lernen', 'udemy': 'Lernen', 'khanacademy': 'Lernen', 'linkedinlearning': 'Lernen', 'skillshare': 'Lernen', 'edx': 'Lernen', 'babbel': 'Lernen', 'brilliant': 'Lernen', 'quizlet': 'Lernen', 'wikipedia': 'Lernen', 'googleclassroom': 'Lernen',
  'amazon': 'Shopping', 'ebay': 'Shopping', 'etsy': 'Shopping', 'aliexpress': 'Shopping', 'zalando': 'Shopping', 'otto': 'Shopping', 'ikea': 'Shopping', 'mediamarkt': 'Shopping', 'idealo': 'Shopping', 'temu': 'Shopping', 'shein': 'Shopping',
  'gmaps': 'Reise', 'bookingcom': 'Reise', 'airbnb': 'Reise', 'googleflights': 'Reise', 'skyscanner': 'Reise', 'expedia': 'Reise', 'tripadvisor': 'Reise', 'deutschebahn': 'Reise', 'flixbus': 'Reise', 'uber': 'Reise', 'lufthansa': 'Reise', 'kayak': 'Reise',
  'myfitnesspal': 'Gesundheit & Fitness', 'strava': 'Gesundheit & Fitness', 'fitbit': 'Gesundheit & Fitness', 'googlefit': 'Gesundheit & Fitness', 'peloton': 'Gesundheit & Fitness', 'headspace': 'Gesundheit & Fitness', 'calm': 'Gesundheit & Fitness', 'doctolib': 'Gesundheit & Fitness', 'oura': 'Gesundheit & Fitness',
};

const CATALOG = [
  ...DEFAULT_APPS,
  { id: 'imperio-tools', name: 'IMPERIO Tools', url: 'https://imperio-tools.netlify.app/', icon: 'icons/imperio-tools.png' },
  { id: 'gmail', name: 'Gmail', url: 'https://mail.google.com/' },
  { id: 'gdrive', name: 'Google Drive', url: 'https://drive.google.com/', icon: 'https://ssl.gstatic.com/images/branding/product/2x/drive_2020q4_48dp.png' },
  { id: 'stackfield', name: 'Stackfield', url: 'https://www.stackfield.com/', icon: 'icons/stackfield.png' },
  { id: 'notion', name: 'Notion', url: 'https://app.notion.com/' },
  { id: 'slack', name: 'Slack', url: 'https://app.slack.com/client' },
  { id: 'telegram', name: 'Telegram', url: 'https://web.telegram.org/', icon: 'icons/telegram.png' },
  { id: 'messenger', name: 'Messenger', url: 'https://www.messenger.com/' },
  { id: 'claude', name: 'Claude', url: 'https://claude.ai/' },
  { id: 'gemini', name: 'Gemini', url: 'https://gemini.google.com/' },
  { id: 'linkedin', name: 'LinkedIn', url: 'https://www.linkedin.com/' },
  { id: 'x', name: 'X', url: 'https://x.com/' },
  { id: 'youtube', name: 'YouTube', url: 'https://www.youtube.com/' },
  { id: 'spotify', name: 'Spotify', url: 'https://open.spotify.com/' },
  { id: 'github', name: 'GitHub', url: 'https://github.com/' },
  { id: 'figma', name: 'Figma', url: 'https://www.figma.com/' },
  // Kommunikation
  { id: 'teams', name: 'Microsoft Teams', url: 'https://teams.microsoft.com/' },
  { id: 'discord', name: 'Discord', url: 'https://discord.com/channels/@me' },
  { id: 'zoom', name: 'Zoom', url: 'https://app.zoom.us/' },
  { id: 'meet', name: 'Google Meet', url: 'https://meet.google.com/' },
  // Zusammenarbeit
  { id: 'trello', name: 'Trello', url: 'https://trello.com/' },
  { id: 'asana', name: 'Asana', url: 'https://app.asana.com/' },
  { id: 'miro', name: 'Miro', url: 'https://miro.com/app/dashboard/' },
  { id: 'canva', name: 'Canva', url: 'https://www.canva.com/' },
  { id: 'airtable', name: 'Airtable', url: 'https://airtable.com/' },
  { id: 'dropbox', name: 'Dropbox', url: 'https://www.dropbox.com/home' },
  { id: 'office', name: 'Microsoft 365', url: 'https://www.office.com/' },
  // Google-Welt: Docs/Sheets/Maps teilen sich Domains, darum feste Icon-Adressen
  { id: 'gdocs', name: 'Google Docs', url: 'https://docs.google.com/document/', icon: 'https://ssl.gstatic.com/docs/documents/images/kix-favicon7.ico' },
  { id: 'gsheets', name: 'Google Sheets', url: 'https://docs.google.com/spreadsheets/', icon: 'https://ssl.gstatic.com/docs/spreadsheets/favicon3.ico' },
  { id: 'gmaps', name: 'Google Maps', url: 'https://www.google.com/maps', icon: 'https://www.google.com/s2/favicons?domain=maps.google.com&sz=64' },
  { id: 'gphotos', name: 'Google Fotos', url: 'https://photos.google.com/' },
  // Werkzeuge
  { id: 'deepl', name: 'DeepL', url: 'https://www.deepl.com/translator' },
  { id: 'perplexity', name: 'Perplexity', url: 'https://www.perplexity.ai/' },
  // Social
  { id: 'instagram', name: 'Instagram', url: 'https://www.instagram.com/' },
  { id: 'facebook', name: 'Facebook', url: 'https://www.facebook.com/' },
  { id: 'reddit', name: 'Reddit', url: 'https://www.reddit.com/' },
  { id: 'pinterest', name: 'Pinterest', url: 'https://www.pinterest.com/' },
  // Weitere Business-Apps (Freddy 24.08.)
  { id: 'getresponse', name: 'GetResponse', url: 'https://app.getresponse.com/' },
  { id: 'weclapp', name: 'weclapp', url: 'https://www.weclapp.com/' },
  { id: 'microsoftcopilot', name: 'Microsoft Copilot', url: 'https://copilot.microsoft.com/' },
  { id: 'grok', name: 'Grok', url: 'https://grok.com/' },
  { id: 'mistrallechat', name: 'Mistral / Le Chat', url: 'https://chat.mistral.ai/' },
  { id: 'notebooklm', name: 'NotebookLM', url: 'https://notebooklm.google.com/' },
  { id: 'midjourney', name: 'Midjourney', url: 'https://www.midjourney.com/' },
  { id: 'elevenlabs', name: 'ElevenLabs', url: 'https://elevenlabs.io/' },
  { id: 'poe', name: 'Poe', url: 'https://poe.com/' },
  { id: 'huggingface', name: 'Hugging Face', url: 'https://huggingface.co/' },
  { id: 'suno', name: 'Suno', url: 'https://suno.com/' },
  { id: 'ideogram', name: 'Ideogram', url: 'https://ideogram.ai/' },
  { id: 'outlook', name: 'Outlook', url: 'https://outlook.office.com/mail/' },
  { id: 'googlechat', name: 'Google Chat', url: 'https://chat.google.com/' },
  { id: 'skype', name: 'Skype', url: 'https://web.skype.com/' },
  { id: 'webex', name: 'Webex', url: 'https://web.webex.com/' },
  { id: 'protonmail', name: 'Proton Mail', url: 'https://mail.proton.me/' },
  { id: 'gmx', name: 'GMX', url: 'https://www.gmx.net/' },
  { id: 'webde', name: 'Web.de', url: 'https://web.de/' },
  { id: 'evernote', name: 'Evernote', url: 'https://www.evernote.com/client/web' },
  { id: 'onenote', name: 'OneNote', url: 'https://www.onenote.com/' },
  { id: 'googlekeep', name: 'Google Keep', url: 'https://keep.google.com/' },
  { id: 'clickup', name: 'ClickUp', url: 'https://app.clickup.com/' },
  { id: 'mondaycom', name: 'monday.com', url: 'https://monday.com/' },
  { id: 'jira', name: 'Jira', url: 'https://www.atlassian.com/software/jira' },
  { id: 'confluence', name: 'Confluence', url: 'https://www.atlassian.com/software/confluence' },
  { id: 'coda', name: 'Coda', url: 'https://coda.io/' },
  { id: 'calendly', name: 'Calendly', url: 'https://calendly.com/event_types/user/me' },
  { id: 'zapier', name: 'Zapier', url: 'https://zapier.com/app/dashboard' },
  { id: 'make', name: 'Make', url: 'https://www.make.com/' },
  { id: 'smartsheet', name: 'Smartsheet', url: 'https://app.smartsheet.com/' },
  { id: 'onedrive', name: 'OneDrive', url: 'https://onedrive.live.com/' },
  { id: 'icloud', name: 'iCloud', url: 'https://www.icloud.com/' },
  { id: 'box', name: 'Box', url: 'https://app.box.com/' },
  { id: 'mega', name: 'MEGA', url: 'https://mega.nz/' },
  { id: 'pcloud', name: 'pCloud', url: 'https://my.pcloud.com/' },
  { id: 'wetransfer', name: 'WeTransfer', url: 'https://wetransfer.com/' },
  { id: 'protondrive', name: 'Proton Drive', url: 'https://drive.proton.me/' },
  { id: 'gitlab', name: 'GitLab', url: 'https://gitlab.com/' },
  { id: 'bitbucket', name: 'Bitbucket', url: 'https://bitbucket.org/' },
  { id: 'replit', name: 'Replit', url: 'https://replit.com/' },
  { id: 'codepen', name: 'CodePen', url: 'https://codepen.io/' },
  { id: 'codesandbox', name: 'CodeSandbox', url: 'https://codesandbox.io/' },
  { id: 'stackblitz', name: 'StackBlitz', url: 'https://stackblitz.com/' },
  { id: 'vercel', name: 'Vercel', url: 'https://vercel.com/dashboard' },
  { id: 'netlify', name: 'Netlify', url: 'https://app.netlify.com/' },
  { id: 'cloudflare', name: 'Cloudflare', url: 'https://dash.cloudflare.com/' },
  { id: 'awsconsole', name: 'AWS Console', url: 'https://console.aws.amazon.com/' },
  { id: 'googlecloud', name: 'Google Cloud', url: 'https://console.cloud.google.com/' },
  { id: 'microsoftazure', name: 'Microsoft Azure', url: 'https://portal.azure.com/' },
  { id: 'digitalocean', name: 'DigitalOcean', url: 'https://cloud.digitalocean.com/' },
  { id: 'postman', name: 'Postman', url: 'https://web.postman.co/' },
  { id: 'linear', name: 'Linear', url: 'https://linear.app/' },
  { id: 'adobeexpress', name: 'Adobe Express', url: 'https://express.adobe.com/' },
  { id: 'adobecreativecloud', name: 'Adobe Creative Cloud', url: 'https://creativecloud.adobe.com/' },
  { id: 'photopea', name: 'Photopea', url: 'https://www.photopea.com/' },
  { id: 'framer', name: 'Framer', url: 'https://www.framer.com/' },
  { id: 'penpot', name: 'Penpot', url: 'https://design.penpot.app/' },
  { id: 'dribbble', name: 'Dribbble', url: 'https://dribbble.com/' },
  { id: 'behance', name: 'Behance', url: 'https://www.behance.net/' },
  { id: 'hubspot', name: 'HubSpot', url: 'https://app.hubspot.com/' },
  { id: 'salesforce', name: 'Salesforce', url: 'https://login.salesforce.com/' },
  { id: 'pipedrive', name: 'Pipedrive', url: 'https://app.pipedrive.com/' },
  { id: 'zoho', name: 'Zoho', url: 'https://www.zoho.com/' },
  { id: 'shopify', name: 'Shopify', url: 'https://admin.shopify.com/' },
  { id: 'mailchimp', name: 'Mailchimp', url: 'https://login.mailchimp.com/' },
  { id: 'brevo', name: 'Brevo', url: 'https://app.brevo.com/' },
  { id: 'lexoffice', name: 'Lexoffice', url: 'https://app.lexoffice.de/' },
  { id: 'sevdesk', name: 'sevDesk', url: 'https://my.sevdesk.de/' },
  { id: 'datev', name: 'DATEV', url: 'https://apps.datev.de/' },
  { id: 'xero', name: 'Xero', url: 'https://login.xero.com/' },
  { id: 'quickbooks', name: 'QuickBooks', url: 'https://qbo.intuit.com/' },
  { id: 'zendesk', name: 'Zendesk', url: 'https://www.zendesk.com/' },
  { id: 'intercom', name: 'Intercom', url: 'https://app.intercom.com/' },
  { id: 'freshdesk', name: 'Freshdesk', url: 'https://freshdesk.com/' },
  { id: 'personio', name: 'Personio', url: 'https://login.personio.com/' },
  { id: 'docusign', name: 'DocuSign', url: 'https://account.docusign.com/' },
  { id: 'paypal', name: 'PayPal', url: 'https://www.paypal.com/' },
  { id: 'stripe', name: 'Stripe', url: 'https://dashboard.stripe.com/' },
  { id: 'wise', name: 'Wise', url: 'https://wise.com/' },
  { id: 'n26', name: 'N26', url: 'https://app.n26.com/' },
  { id: 'revolut', name: 'Revolut', url: 'https://app.revolut.com/' },
  { id: 'klarna', name: 'Klarna', url: 'https://app.klarna.com/' },
  { id: 'comdirect', name: 'Comdirect', url: 'https://www.comdirect.de/' },
  { id: 'dkb', name: 'DKB', url: 'https://www.dkb.de/' },
  { id: 'ing', name: 'ING', url: 'https://www.ing.de/' },
  { id: 'sparkasse', name: 'Sparkasse', url: 'https://www.sparkasse.de/' },
  { id: 'commerzbank', name: 'Commerzbank', url: 'https://www.commerzbank.de/' },
  { id: 'traderepublic', name: 'Trade Republic', url: 'https://app.traderepublic.com/' },
  { id: 'scalablecapital', name: 'Scalable Capital', url: 'https://de.scalable.capital/' },
  { id: 'coinbase', name: 'Coinbase', url: 'https://www.coinbase.com/' },
  { id: 'binance', name: 'Binance', url: 'https://www.binance.com/' },
  { id: 'netflix', name: 'Netflix', url: 'https://www.netflix.com/' },
  { id: 'disney', name: 'Disney+', url: 'https://www.disneyplus.com/' },
  { id: 'amazonprimevideo', name: 'Amazon Prime Video', url: 'https://www.primevideo.com/' },
  { id: 'applemusic', name: 'Apple Music', url: 'https://music.apple.com/' },
  { id: 'appletv', name: 'Apple TV+', url: 'https://tv.apple.com/' },
  { id: 'twitch', name: 'Twitch', url: 'https://www.twitch.tv/' },
  { id: 'soundcloud', name: 'SoundCloud', url: 'https://soundcloud.com/' },
  { id: 'deezer', name: 'Deezer', url: 'https://www.deezer.com/' },
  { id: 'amazonmusic', name: 'Amazon Music', url: 'https://music.amazon.de/' },
  { id: 'youtubemusic', name: 'YouTube Music', url: 'https://music.youtube.com/' },
  { id: 'dazn', name: 'DAZN', url: 'https://www.dazn.com/' },
  { id: 'audible', name: 'Audible', url: 'https://www.audible.de/' },
  { id: 'plex', name: 'Plex', url: 'https://app.plex.tv/' },
  { id: 'wowsky', name: 'WOW / Sky', url: 'https://www.wowtv.de/' },
  { id: 'crunchyroll', name: 'Crunchyroll', url: 'https://www.crunchyroll.com/' },
  { id: 'tiktok', name: 'TikTok', url: 'https://www.tiktok.com/' },
  { id: 'threads', name: 'Threads', url: 'https://www.threads.net/' },
  { id: 'snapchat', name: 'Snapchat', url: 'https://web.snapchat.com/' },
  { id: 'bluesky', name: 'Bluesky', url: 'https://bsky.app/' },
  { id: 'xing', name: 'Xing', url: 'https://www.xing.com/' },
  { id: 'mastodon', name: 'Mastodon', url: 'https://mastodon.social/' },
  { id: 'tumblr', name: 'Tumblr', url: 'https://www.tumblr.com/' },
  { id: 'googlenews', name: 'Google News', url: 'https://news.google.com/' },
  { id: 'tagesschau', name: 'Tagesschau', url: 'https://www.tagesschau.de/' },
  { id: 'spiegel', name: 'Spiegel', url: 'https://www.spiegel.de/' },
  { id: 'zeitonline', name: 'Zeit Online', url: 'https://www.zeit.de/' },
  { id: 'faz', name: 'FAZ', url: 'https://www.faz.net/' },
  { id: 'handelsblatt', name: 'Handelsblatt', url: 'https://www.handelsblatt.com/' },
  { id: 'bbc', name: 'BBC', url: 'https://www.bbc.com/' },
  { id: 'cnn', name: 'CNN', url: 'https://www.cnn.com/' },
  { id: 'reuters', name: 'Reuters', url: 'https://www.reuters.com/' },
  { id: 'theguardian', name: 'The Guardian', url: 'https://www.theguardian.com/' },
  { id: 'bloomberg', name: 'Bloomberg', url: 'https://www.bloomberg.com/' },
  { id: 'wettercom', name: 'Wetter.com', url: 'https://www.wetter.com/' },
  { id: 'accuweather', name: 'AccuWeather', url: 'https://www.accuweather.com/' },
  { id: 'feedly', name: 'Feedly', url: 'https://feedly.com/' },
  { id: 'pocket', name: 'Pocket', url: 'https://getpocket.com/' },
  { id: 'duolingo', name: 'Duolingo', url: 'https://www.duolingo.com/' },
  { id: 'coursera', name: 'Coursera', url: 'https://www.coursera.org/' },
  { id: 'udemy', name: 'Udemy', url: 'https://www.udemy.com/' },
  { id: 'khanacademy', name: 'Khan Academy', url: 'https://www.khanacademy.org/' },
  { id: 'linkedinlearning', name: 'LinkedIn Learning', url: 'https://www.linkedin.com/learning/' },
  { id: 'skillshare', name: 'Skillshare', url: 'https://www.skillshare.com/' },
  { id: 'edx', name: 'edX', url: 'https://www.edx.org/' },
  { id: 'babbel', name: 'Babbel', url: 'https://my.babbel.com/' },
  { id: 'brilliant', name: 'Brilliant', url: 'https://brilliant.org/' },
  { id: 'quizlet', name: 'Quizlet', url: 'https://quizlet.com/' },
  { id: 'wikipedia', name: 'Wikipedia', url: 'https://www.wikipedia.org/' },
  { id: 'googleclassroom', name: 'Google Classroom', url: 'https://classroom.google.com/' },
  { id: 'amazon', name: 'Amazon', url: 'https://www.amazon.de/' },
  { id: 'ebay', name: 'eBay', url: 'https://www.ebay.de/' },
  { id: 'etsy', name: 'Etsy', url: 'https://www.etsy.com/' },
  { id: 'aliexpress', name: 'AliExpress', url: 'https://www.aliexpress.com/' },
  { id: 'zalando', name: 'Zalando', url: 'https://www.zalando.de/' },
  { id: 'otto', name: 'Otto', url: 'https://www.otto.de/' },
  { id: 'ikea', name: 'IKEA', url: 'https://www.ikea.com/de/' },
  { id: 'mediamarkt', name: 'MediaMarkt', url: 'https://www.mediamarkt.de/' },
  { id: 'idealo', name: 'Idealo', url: 'https://www.idealo.de/' },
  { id: 'temu', name: 'Temu', url: 'https://www.temu.com/' },
  { id: 'shein', name: 'Shein', url: 'https://www.shein.com/' },
  { id: 'bookingcom', name: 'Booking.com', url: 'https://www.booking.com/' },
  { id: 'airbnb', name: 'Airbnb', url: 'https://www.airbnb.de/' },
  { id: 'googleflights', name: 'Google Flights', url: 'https://www.google.com/travel/flights' },
  { id: 'skyscanner', name: 'Skyscanner', url: 'https://www.skyscanner.de/' },
  { id: 'expedia', name: 'Expedia', url: 'https://www.expedia.de/' },
  { id: 'tripadvisor', name: 'TripAdvisor', url: 'https://www.tripadvisor.de/' },
  { id: 'deutschebahn', name: 'Deutsche Bahn', url: 'https://www.bahn.de/' },
  { id: 'flixbus', name: 'FlixBus', url: 'https://www.flixbus.de/' },
  { id: 'uber', name: 'Uber', url: 'https://www.uber.com/' },
  { id: 'lufthansa', name: 'Lufthansa', url: 'https://www.lufthansa.com/' },
  { id: 'kayak', name: 'Kayak', url: 'https://www.kayak.de/' },
  { id: 'myfitnesspal', name: 'MyFitnessPal', url: 'https://www.myfitnesspal.com/' },
  { id: 'strava', name: 'Strava', url: 'https://www.strava.com/' },
  { id: 'fitbit', name: 'Fitbit', url: 'https://www.fitbit.com/' },
  { id: 'googlefit', name: 'Google Fit', url: 'https://fit.google.com/' },
  { id: 'peloton', name: 'Peloton', url: 'https://members.onepeloton.com/' },
  { id: 'headspace', name: 'Headspace', url: 'https://www.headspace.com/' },
  { id: 'calm', name: 'Calm', url: 'https://www.calm.com/' },
  { id: 'doctolib', name: 'Doctolib', url: 'https://www.doctolib.de/' },
  { id: 'oura', name: 'Oura', url: 'https://cloud.ouraring.com/' },
];

const stateFile = () => path.join(app.getPath('userData'), 'window-state.json');

function loadState() {
  let s;
  try {
    s = JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
  } catch {
    s = {};
  }
  const apps = (Array.isArray(s.apps) && s.apps.length ? s.apps : DEFAULT_APPS)
    // Stammdaten (URL, Name, Icon) sind Katalog-Sache und werden für schon
    // gespeicherte Apps übernommen. Sonst blieben Katalog-Verbesserungen —
    // etwa Todoist, das direkt in „Demnächst" statt „Heute" startet — bei
    // bestehenden Nutzern hängen, weil deren window-state.json die alte URL
    // hält. saveState() schreibt die aktuelle Seite NICHT pro App zurück, es
    // geht also keine „zuletzt besuchte Seite" verloren. Reihenfolge und
    // Auswahl der Apps bleiben dem Nutzer; URLs kann er ohnehin nicht ändern.
    .map((a) => {
      const cat = CATALOG.find((c) => c.id === a.id);
      return cat ? { ...a, name: cat.name, url: cat.url, icon: cat.icon || a.icon } : a;
    });
  // Der Verti-Browser ist immer vorinstalliert und sitzt fix ganz oben
  if (!apps.some((a) => a.id === BROWSER_ID)) {
    const b = CATALOG.find((c) => c.id === BROWSER_ID);
    if (b) apps.unshift({ id: b.id, name: b.name, url: b.url, icon: b.icon });
  } else {
    const bi = apps.findIndex((a) => a.id === BROWSER_ID);
    if (bi > 0) { const [b] = apps.splice(bi, 1); apps.unshift(b); }
  }
  return {
    bounds: s.bounds || { width: 1400, height: 900 },
    activeApp: s.activeApp || 'calendar',
    apps,
    lastUrls: s.lastUrls && typeof s.lastUrls === 'object' ? s.lastUrls : {}, // zuletzt besuchte Seite je App
    zoom: s.zoom && typeof s.zoom === 'object' ? s.zoom : {}, // Zoomstufe je App
    browser: s.browser && typeof s.browser === 'object' ? s.browser : null, // offene Browser-Tabs
    bookmarks: Array.isArray(s.bookmarks) ? s.bookmarks : [], // Lesezeichen
    history: Array.isArray(s.history) ? s.history : [], // Browser-Verlauf
    externalLinks: s.externalLinks === 'system' ? 'system' : 'verti', // externe Links: im Verti-Browser (Standard) oder System-Browser
    theme: s.theme === 'light' ? 'light' : 'dark', // Darstellung: dunkel (Standard) oder hell
    themeColor: FARBWELTEN.includes(s.themeColor) ? s.themeColor : 'graphit', // Farbwelt der Oberflaeche
    mutedApps: Array.isArray(s.mutedApps) ? s.mutedApps.filter((x) => typeof x === 'string') : [], // pro App stummgeschaltet (kein Badge, keine Meldung)
    onboarded: s.onboarded === true, // Ersteinrichtung schon durchlaufen?
  };
}

// ---------- Letzte Seite pro App ----------
// Nach einem Neustart macht jede App dort weiter, wo man war (Stackfield-Raum,
// Kalenderwoche …), statt auf der Startseite (Freddys Wunsch 22.08.2026). Gemerkt
// wird nur eine Adresse derselben Site wie die Katalog-URL: Login-Seiten
// (accounts.google.com), Fremdseiten und Katalog-Umzüge (notion.so → notion.com)
// fallen damit raus, dann gilt wieder die Katalog-URL. „Zur Startseite" bleibt
// der Weg zurück zur Katalog-URL.
function sameSite(url, appUrl) {
  try {
    const a = new URL(url), b = new URL(appUrl);
    if (a.protocol !== 'https:' && a.protocol !== 'http:') return false;
    return a.host === b.host || a.host.endsWith('.' + b.host);
  } catch {
    return false;
  }
}
function startUrlFor(appDef) {
  const last = state.lastUrls[appDef.id];
  return last && sameSite(last, appDef.url) ? last : appDef.url;
}
// Anmeldeseiten nicht merken (z.B. app.todoist.com/auth/login liegt auf demselben
// Host): bekannte Login-Adressen (isAuthUrl) plus typische Pfadmuster
function looksLikeAuth(url) {
  if (isAuthUrl(url)) return true;
  try { return /(^|\/)(login|log-in|signin|sign-in|auth|oauth|sso)(\/|$)/i.test(new URL(url).pathname); } catch { return false; }
}
function rememberUrl(appDef, url) {
  if (!sameSite(url, appDef.url) || looksLikeAuth(url) || state.lastUrls[appDef.id] === url) return;
  state.lastUrls[appDef.id] = url;
  saveState();
}

// ---------- Zoom pro App ----------
// Cmd/Strg + Plus/Minus/0 im Menü „Ansicht". Gezählt wird in Prozent
// (100 % = Originalgröße), Schritte von 10 %. Beim Ändern erscheint kurz eine
// Prozentanzeige mittig über der App (showZoomOverlay). Die Stufe wird je App
// gemerkt und bei jedem Seitenladen wieder angewandt.
const ZOOM_MIN = 50, ZOOM_MAX = 200, ZOOM_STEP = 10;
function zoomPercent(id) {
  let v = state.zoom[id];
  if (v === undefined) return 100;
  // Migration: bis 1.1.2 wurde die Electron-Zoomstufe gespeichert (~ -4..6).
  // Solche Kleinwerte in Prozent umrechnen (Faktor 1,2^Stufe).
  if (v < ZOOM_MIN) v = Math.round(Math.pow(1.2, v) * 100);
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(v / ZOOM_STEP) * ZOOM_STEP));
}
function applyZoom(id) {
  const wc = views[id] && views[id].webContents;
  if (wc && !wc.isDestroyed()) wc.setZoomFactor(zoomPercent(id) / 100);
}
function zoomActive(dir) { // dir: +1 größer, -1 kleiner, 0 zurück auf 100 %
  if (!activeId || !views[activeId]) return;
  const percent = dir === 0 ? 100 : Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoomPercent(activeId) + dir * ZOOM_STEP));
  views[activeId].webContents.setZoomFactor(percent / 100);
  if (percent === 100) delete state.zoom[activeId];
  else state.zoom[activeId] = percent;
  saveState();
  showZoomOverlay(percent);
}

// Kurze, gläserne Prozentanzeige mittig über der App. Eigenes rahmenloses,
// transparentes, klick-durchlässiges Fenster (die App-Views liegen als native
// Ebene über der Sidebar, ein DOM-Overlay der Sidebar wäre also verdeckt).
// focusable:false + showInactive: stiehlt der App NICHT den Tastatur-Fokus
// (sonst bräche Leertaste=Play/Pause).
let zoomHud = null, zoomHudTimer = null;
const ZOOM_HUD = 'data:text/html;charset=utf-8,' + encodeURIComponent(`<!doctype html><meta charset="utf-8"><body style="margin:0;overflow:hidden;background:transparent;-webkit-user-select:none">
<div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center">
  <div id="p" style="font:600 26px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#fff;background:rgba(28,28,34,0.86);border:0.5px solid rgba(255,255,255,0.18);border-radius:14px;padding:14px 22px;box-shadow:0 10px 34px rgba(0,0,0,0.4);font-variant-numeric:tabular-nums">100%</div>
</div>
<script>window.__z=(v)=>{document.getElementById('p').textContent=v+'%'}</script></body>`);
function showZoomOverlay(percent) {
  if (!win || win.isDestroyed() || !win.isVisible()) return;
  const b = win.getContentBounds();
  const W = 116, H = 64;
  const x = Math.round(b.x + SIDEBAR_WIDTH + (b.width - SIDEBAR_WIDTH - W) / 2);
  const y = Math.round(b.y + TOP_BAR + (b.height - TOP_BAR - H) / 2);
  if (!zoomHud || zoomHud.isDestroyed()) {
    zoomHud = new BrowserWindow({
      width: W, height: H, x, y,
      frame: false, transparent: true, hasShadow: false, resizable: false,
      movable: false, focusable: false, skipTaskbar: true, show: false,
      parent: win && !win.isDestroyed() ? win : undefined,
    });
    zoomHud.setIgnoreMouseEvents(true);
    zoomHud.loadURL(ZOOM_HUD);
  } else {
    zoomHud.setBounds({ x, y, width: W, height: H });
  }
  const paint = () => { if (zoomHud && !zoomHud.isDestroyed()) zoomHud.webContents.executeJavaScript(`window.__z && window.__z(${percent})`).catch(() => {}); };
  if (zoomHud.webContents.isLoading()) zoomHud.webContents.once('did-finish-load', paint); else paint();
  zoomHud.showInactive();
  clearTimeout(zoomHudTimer);
  zoomHudTimer = setTimeout(() => { if (zoomHud && !zoomHud.isDestroyed()) zoomHud.hide(); }, 900);
}

let state = null;
let win = null;
const views = {};
let activeId = null;
// Verti-Browser: die Leiste (Tabs+Adresse) ist views['browser'] (eine WebContentsView
// mit browser.html); die eigentlichen Seiten sind eigene Tab-Views hier drunter.
const browserTabs = new Map(); // key -> WebContentsView
const browserFav = new Map();  // key -> Favicon-URL
let browserActive = null;      // key des aktiven Tabs
let browserSeq = 0;
let browserSuggestOpen = false; // Vorschlags-Dropdown offen → Shell wächst
let libraryOpen = false;
let quitting = false; // Cmd+Q/Update-Installation: echtes Beenden statt Verstecken (Mac)
app.on('before-quit', () => { quitting = true; });
let saveTimer = null;

function saveState() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      if (win && !win.isDestroyed()) {
        state.bounds = win.getBounds();
        state.activeApp = activeId;
        fs.writeFileSync(stateFile(), JSON.stringify(state));
      }
    } catch {}
  }, 300);
}

// Login-Popups müssen in der App bleiben (gleiche Session), sonst landet die
// Anmeldung im externen Browser, wo sie der App nichts bringt.
// host matcht exakt oder als Subdomain; path (falls gesetzt) den Pfadanfang.
const AUTH_TARGETS = [
  { host: 'accounts.google.com' },
  { host: 'accounts.youtube.com' },
  { host: 'appleid.apple.com' },
  { host: 'login.microsoftonline.com' },
  { host: 'login.live.com' },
  { host: 'login.yahoo.com' },
  { host: 'auth.openai.com' },
  { host: 'auth0.com' },
  { host: 'okta.com' },
  { host: 'id.atlassian.com' },
  // Facebook nutzt versionierte Dialog-Pfade: /v25.0/dialog/oauth
  { host: 'facebook.com', path: /^\/(v\d+(\.\d+)?\/)?(dialog|login)([/.?]|$)/ },
  { host: 'github.com', path: /^\/(login|session)([/?]|$)/ },
  { host: 'linkedin.com', path: /^\/(oauth|checkpoint)([/?]|$)/ },
  { host: 'slack.com', path: /^\/(signin|sso|openid|workspace-signin)([/?]|$)/ },
  { host: 'stackfield.com', path: /^\/login/ },
  { host: 'claude.ai', path: /^\/(login|oauth)([/?]|$)/ },
  // Notion startet sein Google-Login-Popup auf einer eigenen Notion-URL.
  // App läuft seit 1.0.19 auf app.notion.com (notion.com), Altbestand auf notion.so.
  { host: 'notion.so', path: /^\/(login|verifyNoPopupBlocker|googlepopupredirect)/i },
  { host: 'notion.com', path: /^\/(login|verifyNoPopupBlocker|googlepopupredirect)/i },
];

function isAuthUrl(url) {
  // Leere/about:blank-Popups nutzen viele OAuth-Flows als Startpunkt
  if (!url || url === 'about:blank') return true;
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
  return AUTH_TARGETS.some(
    (t) => (u.host === t.host || u.host.endsWith('.' + t.host)) && (!t.path || t.path.test(u.pathname))
  );
}

// shell.openExternal ist ShellExecute: nur harmlose Protokolle rauslassen,
// file://, UNC-Pfade und Custom-Protokolle aus Webinhalt verwerfen
function openExternally(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return;
  }
  // Neben Web und Mail auch die Protokolle der Apps durchlassen, die in Vertis
  // Katalog stehen: Meeting-Links (Zoom, Teams, Webex), Telefon/SMS und
  // Kalender-Abos starben vorher still, obwohl Kalender und Teams eingebaut
  // sind. Bewusst eine feste Liste - file://, UNC-Pfade und beliebige eigene
  // Protokolle aus Webinhalt bleiben draussen (shell.openExternal ist
  // ShellExecute und wuerde sonst Programme starten).
  const ERLAUBT = [
    'http:', 'https:', 'mailto:', 'tel:', 'sms:', 'facetime:',
    'webcal:',                                   // Kalender-Abo
    'zoommtg:', 'zoomus:',                       // Zoom
    'msteams:',                                  // Microsoft Teams
    'slack:',                                    // Slack
    'webex:', 'wbx:',                            // Webex
    'spotify:',                                  // Spotify
  ];
  if (ERLAUBT.includes(u.protocol)) shell.openExternal(url);
}

// Popouts einer installierten App (z.B. Gmail "In neuem Fenster verfassen")
// gehören in die App-Session, nicht in den externen Browser
function isInstalledAppUrl(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
  return (state?.apps || []).some((a) => {
    try {
      const appHost = new URL(a.url).host;
      return u.host === appHost || u.host.endsWith('.' + appHost);
    } catch {
      return false;
    }
  });
}

// Popups erben von Electron nur sicherheitsrelevante webPreferences — Preload
// und Argumente müssen ausdrücklich mit, sonst läuft das Google-Login-Popup
// („Mit Google anmelden" bei Notion, Todoist …) ohne die JS-Seite der Tarnung
// (so war es bis 1.0.18).
function popupWindowOptions(width, height) {
  return {
    width,
    height,
    autoHideMenuBar: true,
    webPreferences: viewWebPreferences(),
  };
}

// Die Fenster-Regel lebt in window-policy.js (ohne Electron-Abhaengigkeit,
// damit sie ohne laufende App durchgetestet werden kann:
// node scripts/test-window-policy.js). Hier nur noch die Verdrahtung.
const windowOpenPolicy = makeWindowOpenPolicy({
  isAuthUrl,
  isInstalledAppUrl,
  popupWindowOptions,
  browserOpenExternal: (u) => browserOpenExternal(u),
  log: app.isPackaged ? null : (...a) => console.log(...a),
});

// Von uns erlaubte Popup-Fenster bekommen dieselbe Policy. Den Chrome-UA
// erben sie über die Session (ses.setUserAgent) — KEIN wc.setUserAgent hier:
// das Popup navigiert beim Adoptieren oft schon, und setUserAgent mit
// laufender Navigation zerstört deren NavigationRequest (Chromium-CHECK,
// Absturz — die Ursache des 1.0.15–1.0.17-Startabsturzes).
function adoptChildWindow(child) {
  child.webContents.setWindowOpenHandler(windowOpenPolicy(child.webContents));
  child.webContents.on('did-create-window', (grandchild) => adoptChildWindow(grandchild));
  attachMouseNav(child.webContents);
  attachContextMenu(child.webContents);
}

// Pro App: CSS/JS gegen "Lade unsere Desktop-App"-Werbung der Web-Apps.
// Der JS-Wächter fasst nur Bereiche außerhalb des Chat-Fensters (#main) an,
// damit niemals echte Nachrichten ausgeblendet werden.
const APP_TWEAKS = {
  whatsapp: {
    css: '[data-testid="intro_panel_v2_title_card"] { display: none !important; }',
    js: `(() => {
      const AD = /^(Hol dir WhatsApp für (Windows|Mac)|Get WhatsApp for (Windows|Mac)|Lade WhatsApp für (Windows|Mac) herunter|Download WhatsApp for (Windows|Mac))$/i;
      const hide = (el) => { if (el && el.style) el.style.setProperty('display', 'none', 'important'); };
      const sweep = () => {
        for (const a of document.querySelectorAll('a[href*="whatsapp.com/download"], a[href*="ms-windows-store"], a[href*="apps.microsoft.com"]')) {
          if (!a.closest('#main')) hide(a.closest('[role="listitem"]') || a);
        }
        for (const el of document.querySelectorAll('span, h1, h2')) {
          if (el.childElementCount === 0 && AD.test((el.textContent || '').trim()) && !el.closest('#main')) {
            hide(el.closest('[role="button"], a') || el.parentElement);
          }
        }
      };
      let timer = null;
      const queueSweep = () => { clearTimeout(timer); timer = setTimeout(sweep, 400); };
      sweep();
      new MutationObserver(queueSweep).observe(document.body, { childList: true, subtree: true });
    })();`,
  },
};

// Chrome-like UA so Google sign-in and WhatsApp Web accept the embedded browser
function chromeUserAgent() {
  const os = isMac ? 'Macintosh; Intel Mac OS X 10_15_7' : 'Windows NT 10.0; Win64; x64';
  return `Mozilla/5.0 (${os}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome.split('.')[0]}.0.0.0 Safari/537.36`;
}

// Googles Login-Bot-Erkennung lehnt Electron ab, egal wie Chrome-ähnlich die
// Header aussehen (sie prüft auch per JavaScript-Fingerabdruck). Ausweg wie
// bei Ferdium & Co.: Auf den Google-Anmelde-Domains gibt sich Verti als
// Firefox aus — der kennt weder Client-Hints noch userAgentData, es gibt
// also nichts, was sich widersprechen könnte. Alle anderen Seiten bekommen
// unverändert den Chrome-UA (bewährt seit 1.0.0, keine Extra-Header).
// Gemessen (Sonde 22.08.2026): Chrome-UA ohne Client-Hints → Ablehnung
// „rrk=46"; Firefox-Header → Google prüft das Konto ganz normal.
// Die Versionsnummer läuft grob mit (Mozilla: alle vier Wochen eine Haupt-
// version, 144 erschien am 14.10.2025, wir melden immer eine dahinter),
// damit Google die Tarnung nicht irgendwann als veralteten Browser abweist.
function firefoxUserAgent() {
  const major = 143 + Math.floor((Date.now() - Date.UTC(2025, 9, 14)) / (28 * 864e5));
  const os = isMac ? 'Macintosh; Intel Mac OS X 10.15' : 'Windows NT 10.0; Win64; x64';
  return `Mozilla/5.0 (${os}; rv:${major}.0) Gecko/20100101 Firefox/${major}.0`;
}
const FIREFOX_UA = firefoxUserAgent();
const GOOGLE_AUTH_HOSTS = new Set(['accounts.google.com', 'accounts.youtube.com']);

// webPreferences aller App-Views und der von uns erlaubten Login-Popups.
// Die Firefox-Kennung reist als Argument mit, damit view-preload.js exakt
// dieselbe Zeichenkette wie die Header-Tarnung setzt (eine Quelle).
function viewWebPreferences(muted) {
  const args = [`--verti-firefox-ua=${FIREFOX_UA}`];
  if (muted) args.push('--verti-muted=1');
  return {
    partition: 'persist:apps',
    spellcheck: true,
    // Versteckte Views NICHT drosseln. Chromium drosselt normalerweise alles,
    // was nicht sichtbar ist (Timer nach ~5 Min auf 1x/Minute) — in Verti sind
    // aber IMMER alle Apps bis auf eine versteckt, und genau die sollen
    // weiterlaufen: Badges und Benachrichtigungen (WhatsApp, Stackfield) hängen
    // daran, und eine abgerissene Verbindung kann sich sonst nicht mehr selbst
    // erholen (Verdacht beim ChatGPT-Hänger: Wiederverbinden lief gedrosselt
    // nicht mehr, die Seite blieb im Zustand „antwortet noch" stehen und nahm
    // deshalb keine neue Nachricht mehr an).
    // Nebenwirkung (bekannt, Electron #42378): lange versteckte Views können
    // beim Zurückschalten weiß bleiben — dagegen läuft bereits das
    // webContents.invalidate() beim App-Wechsel.
    backgroundThrottling: false,
    preload: path.join(__dirname, 'view-preload.js'),
    additionalArguments: args,
  };
}

function isGoogleAuthUrl(url) {
  try {
    return GOOGLE_AUTH_HOSTS.has(new URL(url).host);
  } catch {
    return false;
  }
}

function applyGoogleAuthDisguise(ses) {
  ses.webRequest.onBeforeSendHeaders((details, cb) => {
    const headers = details.requestHeaders;
    if (isGoogleAuthUrl(details.url)) {
      headers['User-Agent'] = FIREFOX_UA;
      for (const key of Object.keys(headers)) {
        if (key.toLowerCase().startsWith('sec-ch-ua')) delete headers[key];
      }
    }
    cb({ requestHeaders: headers });
  });
}

// Einmalige Selbstheilung (v1.0.11): Bis v1.0.10 hat Googles Blockade die
// Anmelde-Cookies "verseucht" — die Sperre klebte am Profil, selbst nachdem
// die App sauber auftrat.
//
// ENTFERNT in 1.0.15: Die frühere Selbstheilung (cleanupGoogleAuthOnce) rief
// beim Start ses.clearStorageData für Google-Dienste auf. Auf Profilen mit viel
// Google-Speicher (Kalender/Gmail/Drive – Service-Worker + Cache) stürzte genau
// dieses Leeren den Hauptprozess beim Start ab (macOS 26 / Electron 43, V8/JIT).
// Der Google-Login funktioniert über die Firefox-Tarnung unten auch ohne dieses
// Aufräumen; ein hartes Storage-Löschen am Start ist zu riskant und fliegt raus.

// ENTFERNT in 1.0.18 — URSACHE DES STARTABSTURZES von 1.0.15–1.0.17:
// Hier stand attachGoogleAuthUaSwitch(), das wc.setUserAgent synchron in
// did-start-navigation/did-redirect-navigation aufrief, damit
// navigator.userAgent auf der Google-Anmeldeseite zum Firefox-Header passt.
// setUserAgent mit laufender (pending) Navigation löst in Chromium aber
// SetUserAgentOverride → Reload → Zerstörung des laufenden NavigationRequest
// aus dessen eigenem Event heraus aus → CHECK-Abbruch (EXC_BREAKPOINT in
// ~NavigationRequest, Hauptprozess tot ~1s nach Start). Der Crash traf nur
// Profile, die auf die Anmeldeseite UMGELEITET wurden — auf eingeloggten
// Profilen blieb er unsichtbar, deshalb wurde er tagelang überall anders
// gesucht. NIE wieder setUserAgent aus Navigations-Events aufrufen!
// Die JS-Kennung stellt jetzt view-preload.js per Property-Override um
// (rein lesend, kein Navigations-Eingriff; seit 1.0.19 per
// webFrame.executeJavaScript, weil Googles CSP eingefügte <script>-Elemente
// still verwirft); die Header macht weiterhin applyGoogleAuthDisguise oben.

// Die Browser-Seitenkarte lebt in der Sidebar-Ebene, und die App-Ansichten
// liegen DARUEBER - eine eingeblendete Karte waere sonst unsichtbar dahinter
// (genau der Fehler, den der "Verbesserung"-Knopf schon hatte). Statt die
// Ansichten wie bei den Einstellungen komplett auszublenden, machen wir ihnen
// rechts Platz: dann bleibt die Seite daneben sichtbar, wie bei Shift.
const BROWSER_PANEL_W = 340;
let browserPanelOpen = false;
function setBrowserPanel(offen) {
  browserPanelOpen = !!offen;
  layoutViews();
}
ipcMain.on('browser-panel-state', (e, offen) => setBrowserPanel(offen));

function layoutViews() {
  if (!win) return;
  const [w, h] = win.getContentSize();
  for (const id of Object.keys(views)) {
    views[id].setBounds({
      x: SIDEBAR_WIDTH,
      y: TOP_BAR,
      width: w - SIDEBAR_WIDTH - FRAME - (browserPanelOpen ? BROWSER_PANEL_W : 0),
      height: id === BROWSER_ID ? browserBarHeight() + (browserSuggestOpen ? SUGGEST_H : 0) : h - TOP_BAR - FRAME,
    });
  }
  layoutBrowserTabs();
}

// Nach Systemschlaf sind die WebContentsViews oft schwarz (Chromium verliert die
// GPU-/Compositor-Fläche). Betroffene Ansichten werden markiert und beim nächsten
// Anzeigen neu geladen – wie ein manueller Refresh, nur automatisch.
const staleViews = new Set();
const staleBrowserTabs = new Set();
function reloadWc(wc) { try { if (wc && !wc.isDestroyed()) wc.reload(); } catch (e) {} }
// electron-updater sammelt heruntergeladene Installer unter <cache>/verti-updater
// und räumt sie nicht selbst weg. Beim Start (dann läuft kein Download) entfernen.
function cleanupUpdateCache() {
  try {
    const base = app.getPath('cache');
    for (const nm of new Set(['verti-updater', app.getName() + '-updater', app.getName().toLowerCase() + '-updater'])) {
      const dir = path.join(base, nm);
      if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    }
  } catch (e) {}
}
function switchApp(id) {
  if (!views[id]) return;
  libraryOpen = false;
  const prevActive = activeId;
  activeId = id;
  clearBadge(id); // Öffnen = gelesen (das Ausblenden regelt effectiveBadge)
  if (prevActive && prevActive !== id) recomputeBadge(prevActive); // verlassene App → Titel-Badge ggf. wieder zeigen
  if (id === BROWSER_ID) {
    if (browserActive && staleBrowserTabs.delete(browserActive)) reloadWc(browserTabs.get(browserActive) && browserTabs.get(browserActive).webContents);
  } else if (staleViews.delete(id)) {
    reloadWc(views[id].webContents); // nach Aufwachen einmal neu laden
  }
  for (const [vid, view] of Object.entries(views)) {
    view.setVisible(vid === id);
  }
  layoutViews();
  if (id !== BROWSER_ID && views[id]) { try { views[id].webContents.invalidate(); } catch (e) {} } // Todoist & Co.: veralteten/halben Anstrich nach dem Anzeigen auffrischen
  if (id === BROWSER_ID && browserTabs.size === 0) browserRestoreOrNew();
  if (id !== BROWSER_ID && browserSuggestOpen) browserSuggestOpen = false;
  browserApplyVisibility();
  // Tastatur-Fokus in die App (bzw. den aktiven Browser-Tab) geben, damit
  // App-Tastenkürzel (z.B. Leertaste = Play/Pause) sofort greifen
  try { (activeWebContents() || views[id].webContents).focus(); } catch {}
  win.webContents.send('active-app', id);
  sendNavStateFor(id);
  saveState();
}

// ---------- Ungelesen-Badges ----------
// Die meisten Messenger schreiben ihre ungelesenen Nachrichten in den
// Seitentitel ("(3) WhatsApp"); daraus speisen sich die Sidebar-Badges.
// Bei diesen Apps darf die Zahl überall im Titel stehen; bei allen anderen
// nur ganz vorn, sonst machen Inhalts-Titel wie "Top 10 (2024)" falsche Badges.
const TITLE_BADGE_APPS = new Set(['whatsapp', 'gmail', 'telegram', 'messenger', 'slack', 'linkedin', 'x', 'discord', 'teams', 'instagram', 'facebook']);
// Drei Quellen: Titel-Zahl (exakt, für die Apps oben), die von der Seite
// selbst gemeldete Zahl (Favico.js-Hook in view-preload.js – so zählt
// Stackfield seine Ungelesenen exakt) und gezählte Web-Benachrichtigungen
// (für alle übrigen). titleCounts ist absolut, notifCounts wird pro Meldung
// hochgezählt und beim Öffnen genullt. pageCounts hat Vorrang vor notifCounts
// und wird beim Öffnen NICHT genullt: Die Seite setzt sie selbst auf 0, sobald
// gelesen wurde (wie ihr eigenes Favicon).
const titleCounts = {};
const notifCounts = {};
const pageCounts = {};
const badges = {};
// Welche App gerade hörbar Ton ausgibt (Spotify/YouTube im Hintergrund).
// Die Sidebar zeigt daran ein kleines „spielt gerade"-Zeichen.
const audible = {};

function parseUnread(id, title) {
  const t = String(title || '');
  const m = TITLE_BADGE_APPS.has(id) ? /\((\d+)\)/.exec(t) : /^\((\d+)\)/.exec(t);
  return m ? Math.min(999, parseInt(m[1], 10)) : 0;
}

function isMuted(id) { return !!(state && Array.isArray(state.mutedApps) && state.mutedApps.includes(id)); }
function effectiveBadge(id) {
  if (isMuted(id)) return 0; // stumm: kein Badge
  // Titel-fähige Apps zählen NUR über den Titel (sonst Doppelzählung), alle
  // anderen über die von der Seite gemeldete Zahl, ersatzweise über
  // eingegangene Benachrichtigungen
  if (TITLE_BADGE_APPS.has(id)) {
    // Offen UND sichtbar = gesehen → am aktiven App-Icon kein Badge. Im
    // Hintergrund (oder wenn das Fenster versteckt ist) zeigt der Titel-Zähler
    // das Badge – so verschwindet es nicht dauerhaft beim Öffnen.
    if (id === activeId && win && !win.isDestroyed() && win.isVisible() && !win.isMinimized()) return 0;
    return titleCounts[id] || 0;
  }
  if (pageCounts[id] !== undefined) return pageCounts[id];
  return notifCounts[id] || 0;
}

function recomputeBadge(id) {
  const count = effectiveBadge(id);
  if ((badges[id] || 0) === count) return;
  if (count) badges[id] = count;
  else delete badges[id];
  broadcastBadges();
}

function setTitleBadge(id, count) {
  titleCounts[id] = count;
  recomputeBadge(id);
}

function addNotif(id) {
  if (TITLE_BADGE_APPS.has(id)) return; // die zählen über den Titel
  // Gerade sichtbar offen → kein Badge nötig (bei verstecktem oder
  // minimiertem Fenster sieht der Nutzer die App nicht → zählen)
  if (id === activeId && win && !win.isDestroyed() && win.isVisible() && !win.isMinimized()) return;
  notifCounts[id] = Math.min(999, (notifCounts[id] || 0) + 1);
  recomputeBadge(id);
}

function setPageBadge(id, count) {
  pageCounts[id] = Math.min(999, Math.max(0, Math.round(Number(count) || 0)));
  recomputeBadge(id);
}

function clearBadge(id) {
  // Titel-Apps: der Seitentitel ist maßgeblich, nicht „geöffnet = gelesen".
  // Sonst verschwindet das Badge beim Öffnen und kommt nicht zurück, wenn die
  // App ihren Titel nicht erneut meldet (WhatsApp-Bug bei Cindy). Das
  // Ausblenden am offenen Icon regelt effectiveBadge über activeId/Sichtbarkeit.
  if (!TITLE_BADGE_APPS.has(id)) titleCounts[id] = 0;
  notifCounts[id] = 0;
  recomputeBadge(id);
}

// App entfernt → auch die gemeldete Zahl vergessen
function forgetBadge(id) {
  delete pageCounts[id];
  clearBadge(id);
}

function broadcastBadges() {
  if (!win || win.isDestroyed()) return;
  win.webContents.send('badges', badges);
  if (isMac) {
    const total = Object.values(badges).reduce((a, b) => a + b, 0);
    app.setBadgeCount(total);
  }
  // Windows: das Overlay-Icon malt die Sidebar per Canvas und schickt es
  // über 'set-overlay' zurück
}

ipcMain.handle('get-badges', () => badges);
ipcMain.handle('get-audio', () => audible);
function broadcastAudio() {
  if (win && !win.isDestroyed()) win.webContents.send('audio', audible);
}
function setAudio(id, on) {
  if (!!audible[id] === !!on) return;
  if (on) audible[id] = true; else delete audible[id];
  broadcastAudio();
}
// Welche App steckt hinter einem IPC-Absender? (Login-Popups haben dasselbe
// Preload, gehören aber zu keiner View → null)
function appIdOf(sender) {
  for (const [id, view] of Object.entries(views)) {
    if (view.webContents === sender) return id;
  }
  return null;
}
// Signale aus view-preload.js: Web-Benachrichtigung gefeuert, Seite meldet
// ihre Ungelesen-Zahl (Favico.js), Nutzer hat eine Meldung angeklickt
ipcMain.on('verti-app-notify', (e) => {
  const id = appIdOf(e.sender);
  if (id) addNotif(id);
});
ipcMain.on('verti-app-badge', (e, count) => {
  const id = appIdOf(e.sender);
  if (id) setPageBadge(id, count);
});
ipcMain.on('verti-app-notify-click', (e) => {
  const id = appIdOf(e.sender);
  if (!id || !win || win.isDestroyed()) return;
  // Klick auf die Meldung → Verti nach vorn und zur App springen (die Seite
  // selbst kann aus einer versteckten View heraus kein Fenster holen)
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  if (id !== activeId) switchApp(id);
});
ipcMain.handle('get-pending-update', () => (pendingUpdate ? pendingUpdate.version : null));
ipcMain.on('open-update-popup', () => {
  if (pendingUpdate && !updateDialogOpen) openUpdatePopup(pendingUpdate);
});

ipcMain.on('set-overlay', (e, dataUrl, total) => {
  if (isMac || !win || win.isDestroyed()) return;
  if (dataUrl) win.setOverlayIcon(nativeImage.createFromDataURL(dataUrl), `${total} ungelesen`);
  else win.setOverlayIcon(null, '');
});

// ---------- Maus-Seitentasten (Zurück/Vorwärts) ----------
// Die Daumentasten kommen als Maustaste „back"/„forward" an (Mac: Button 3/4,
// Windows: XButton1/2). Chromium würde damit selbst navigieren, aber nur,
// wenn die Seite das mouseUp nicht verbraucht – Kalender, Stackfield & Co.
// fangen Mausereignisse gern ab, dann passiert nichts. Deshalb: Taste VOR
// der Seite abfangen (before-mouse-event + preventDefault; die Seite sieht
// sie gar nicht, Chromium navigiert also auch nicht doppelt) und selbst
// navigieren. Windows schickt für Maus-/Treibertasten außerdem
// WM_APPCOMMAND (app-command), Mac-Treiber wie Logi Options+ schicken statt
// Tasten eine Wischgeste (swipe, s. createWindow); ein kurzer Riegel
// verhindert, dass zwei Wege dieselbe Taste doppelt auslösen. Tastatur
// (Cmd+[ / Cmd+]) läuft übers Menü.
let lastMouseNav = { dir: '', at: 0 };
function mouseNav(wc, dir) {
  const now = Date.now();
  if (lastMouseNav.dir === dir && now - lastMouseNav.at < 250) return;
  lastMouseNav = { dir, at: now };
  if (!wc || wc.isDestroyed()) return;
  if (libraryOpen && wc === activeWebContents()) {
    // Bibliothek offen: Maus-Zurück schließt sie, Vorwärts tut nichts
    if (dir === 'back') closeLibrary();
    return;
  }
  const nh = wc.navigationHistory;
  if (dir === 'back' && nh.canGoBack()) nh.goBack();
  else if (dir === 'forward' && nh.canGoForward()) nh.goForward();
}
// target: welche WebContents navigiert werden (Sidebar → die aktive App)
function attachMouseNav(wc, target = () => wc) {
  wc.on('before-mouse-event', (e, m) => {
    if (m.button !== 'back' && m.button !== 'forward') return;
    e.preventDefault();
    if (m.type === 'mouseUp') mouseNav(target(), m.button);
  });
}
function activeWebContents() {
  if (activeId === BROWSER_ID) {
    const v = browserTabs.get(browserActive);
    return v && !v.webContents.isDestroyed() ? v.webContents : null;
  }
  return activeId && views[activeId] ? views[activeId].webContents : null;
}

// ---------- Verti-Browser ----------
const NEWTAB_FILE = 'browser-newtab.html';
function browserToUrl(input) {
  const t = String(input || '').trim();
  if (!t) return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) return t;                 // hat Schema
  if (/^(localhost|\d{1,3}(\.\d{1,3}){3})(:\d+)?(\/|$)/i.test(t)) return 'http://' + t;
  if (/^[^\s]+\.[^\s]{2,}([\/?#]|$)/.test(t) && !t.includes(' ')) return 'https://' + t; // sieht wie Domain aus
  return 'https://www.google.com/search?q=' + encodeURIComponent(t);  // sonst Suche
}
function createBrowserShell(appDef) {
  const view = new WebContentsView({ webPreferences: { preload: path.join(__dirname, 'browser-preload.js') } });
  view.webContents.loadFile('browser.html');
  view.setVisible(false);
  win.contentView.addChildView(view);
  views[appDef.id] = view;
}
function layoutBrowserTabs() {
  if (!win) return;
  const [w, h] = win.getContentSize();
  const bar = browserBarHeight();
  const b = { x: SIDEBAR_WIDTH, y: TOP_BAR + bar, width: w - SIDEBAR_WIDTH - FRAME - (browserPanelOpen ? BROWSER_PANEL_W : 0), height: h - TOP_BAR - bar - FRAME };
  for (const v of browserTabs.values()) v.setBounds(b);
}
function browserApplyVisibility() {
  const show = !libraryOpen && activeId === BROWSER_ID;
  for (const [key, v] of browserTabs) v.setVisible(show && key === browserActive);
}
function sendBrowserUpdate() {
  const shell = views[BROWSER_ID];
  if (!shell || shell.webContents.isDestroyed()) return;
  const tabs = [...browserTabs.entries()].map(([key, v]) => ({
    key,
    active: key === browserActive,
    title: v.webContents.isDestroyed() ? '' : (v.webContents.getTitle() || 'Neuer Tab'),
    favicon: browserFav.get(key) || '',
  }));
  shell.webContents.send('browser:tabs', tabs);
  const av = browserTabs.get(browserActive);
  if (av && !av.webContents.isDestroyed()) {
    const nh = av.webContents.navigationHistory;
    const url = av.webContents.getURL();
    shell.webContents.send('browser:state', {
      url: url.endsWith('/' + NEWTAB_FILE) || url.includes(NEWTAB_FILE) ? '' : url,
      canGoBack: nh.canGoBack(), canGoForward: nh.canGoForward(), loading: av.webContents.isLoading(),
      bookmarked: isBookmarked(url),
    });
  } else {
    shell.webContents.send('browser:state', { url: '', canGoBack: false, canGoForward: false, loading: false });
  }
  if (activeId === BROWSER_ID) sendNavStateFor(BROWSER_ID);
  browserPersist();
}
function browserNewTab(url) {
  if (!win) return;
  const key = 'bt' + (++browserSeq);
  const view = new WebContentsView({ webPreferences: viewWebPreferences() });
  const wc = view.webContents;
  wc.setUserAgent(chromeUserAgent());
  wc.on('will-prevent-unload', (e) => e.preventDefault());
  wc.setWindowOpenHandler(({ url: u }) => {
    if (isAuthUrl(u)) return { action: 'allow', overrideBrowserWindowOptions: popupWindowOptions(520, 680) };
    if (u && u !== 'about:blank') browserNewTab(u); // Links / window.open → neuer Tab
    return { action: 'deny' };
  });
  wc.on('did-create-window', (child) => adoptChildWindow(child));
  attachMouseNav(wc);
  attachContextMenu(wc);
  const upd = () => sendBrowserUpdate();
  wc.on('page-title-updated', (e, title) => { browserRecordHistory(wc.getURL(), title, browserFav.get(key)); upd(); });
  wc.on('did-navigate', (e, url) => { browserRecordHistory(url, wc.getTitle(), browserFav.get(key)); upd(); });
  wc.on('did-navigate-in-page', upd);
  wc.on('did-start-loading', upd);
  wc.on('did-stop-loading', upd);
  wc.on('page-favicon-updated', (e, favs) => { browserFav.set(key, (favs && favs[0]) || ''); sendBrowserUpdate(); });
  win.contentView.addChildView(view, 0); // unter die Shell, damit das Dropdown die Seite überdeckt
  browserTabs.set(key, view);
  browserActive = key;
  if (url) wc.loadURL(url); else wc.loadFile(NEWTAB_FILE);
  layoutBrowserTabs();
  browserApplyVisibility();
  try { wc.focus(); } catch {}
  sendBrowserUpdate();
}
function browserCloseTab(key) {
  const v = browserTabs.get(key);
  if (!v) return;
  const keys = [...browserTabs.keys()];
  const idx = keys.indexOf(key);
  browserTabs.delete(key);
  browserFav.delete(key);
  try { win.contentView.removeChildView(v); } catch {}
  try { v.webContents.close(); } catch {}
  if (browserActive === key) {
    const next = keys[idx + 1] || keys[idx - 1] || null;
    browserActive = next;
    if (!next) { browserNewTab(); return; } // nie ganz leer
  }
  layoutBrowserTabs();
  browserApplyVisibility();
  const av = browserTabs.get(browserActive);
  if (av) { try { av.webContents.focus(); } catch {} }
  sendBrowserUpdate();
}
function browserSwitchTab(key) {
  if (!browserTabs.has(key)) return;
  browserActive = key;
  if (staleBrowserTabs.delete(key)) reloadWc(browserTabs.get(key) && browserTabs.get(key).webContents);
  browserApplyVisibility();
  const av = browserTabs.get(key);
  if (av) { try { av.webContents.focus(); } catch {} }
  sendBrowserUpdate();
}
function browserActiveWc() {
  const v = browserTabs.get(browserActive);
  return v && !v.webContents.isDestroyed() ? v.webContents : null;
}

// ---- Verlauf ----
function browserRecordHistory(url, title, favicon) {
  if (!/^https?:/i.test(url) || url.includes(NEWTAB_FILE)) return;
  if (!state.history) state.history = [];
  const i = state.history.findIndex((h) => h.url === url);
  const entry = { url, title: title || (i >= 0 ? state.history[i].title : '') || url, favicon: favicon || (i >= 0 ? state.history[i].favicon : '') || '', ts: 0 };
  if (i >= 0) state.history.splice(i, 1);
  state.history.unshift(entry);
  if (state.history.length > 1000) state.history.length = 1000;
  saveState();
}

// ---- Vorschläge (Verlauf + Google-Autocomplete) ----
function fetchGoogleSuggest(q) {
  return new Promise((resolve) => {
    const url = 'https://suggestqueries.google.com/complete/search?client=firefox&hl=de&q=' + encodeURIComponent(q);
    let done = false; const finish = (v) => { if (!done) { done = true; resolve(v); } };
    try {
      const req = https.get(url, { timeout: 2500, headers: { 'User-Agent': chromeUserAgent() } }, (res) => {
        let data = '';
        res.on('data', (c) => { data += c; if (data.length > 200000) req.destroy(); });
        res.on('end', () => { try { const j = JSON.parse(data); finish(Array.isArray(j[1]) ? j[1].filter((x) => typeof x === 'string') : []); } catch { finish([]); } });
      });
      req.on('error', () => finish([]));
      req.on('timeout', () => { req.destroy(); finish([]); });
    } catch { finish([]); }
  });
}
async function browserSuggest(text) {
  const shell = views[BROWSER_ID];
  if (!shell || shell.webContents.isDestroyed()) return;
  const q = String(text || '').trim();
  const send = (items) => shell.webContents.send('browser:suggestions', { text: q, items });
  if (!q) { send([]); return; }
  const ql = q.toLowerCase();
  const hist = (state.history || [])
    .filter((h) => h.url.toLowerCase().includes(ql) || (h.title || '').toLowerCase().includes(ql))
    .slice(0, 3)
    .map((h) => ({ kind: 'history', label: h.title || h.url, sub: h.url, value: h.url }));
  const seen = new Set(hist.map((h) => h.value));
  const sugs = await fetchGoogleSuggest(q);
  const search = [];
  for (const x of sugs) { if (search.length >= 6 - hist.length) break; if (!seen.has(x)) search.push({ kind: 'search', label: x, value: x }); }
  send([...hist, ...search]);
}

// Externe Links (aus Apps, Popups, Kontextmenü) öffnen – Standard: im Verti-
// Browser (aktives Icon springt hoch, neuer Tab). Einstellung 'system' öffnet
// stattdessen im Standard-Browser (Chrome/Safari …). Die Umschaltung kommt
// später in die Einstellungsseite.
function browserOpenExternal(url) {
  if (!url) return;
  if (!state || state.externalLinks === 'system' || !views[BROWSER_ID]) { openExternally(url); return; }
  if (win && !win.isDestroyed() && !win.isVisible()) win.show();
  switchApp(BROWSER_ID);
  browserNewTab(url);
}

// ---- Lesezeichen ----
function isBookmarked(url) {
  return !!(state && state.bookmarks && state.bookmarks.some((b) => b.url === url));
}
function sendBrowserBookmarks() {
  const shell = views[BROWSER_ID];
  if (shell && !shell.webContents.isDestroyed()) shell.webContents.send('browser:bookmarks', (state && state.bookmarks) || []);
}
function browserToggleBookmark() {
  const wc = browserActiveWc();
  if (!wc) return;
  const url = wc.getURL();
  if (!/^https?:/i.test(url) || url.includes(NEWTAB_FILE)) return; // Neuer-Tab-Seite nicht merken
  if (!state.bookmarks) state.bookmarks = [];
  const i = state.bookmarks.findIndex((b) => b.url === url);
  if (i >= 0) state.bookmarks.splice(i, 1);
  else state.bookmarks.push({ url, title: wc.getTitle() || url, favicon: browserFav.get(browserActive) || '' });
  saveState();
  layoutViews();            // Leisten-Höhe ändert sich, wenn erstes/letztes Lesezeichen
  sendBrowserBookmarks();
  sendBrowserUpdate();
}
function browserRemoveBookmark(url) {
  if (!state.bookmarks) return;
  const i = state.bookmarks.findIndex((b) => b.url === url);
  if (i < 0) return;
  state.bookmarks.splice(i, 1);
  saveState();
  layoutViews();
  sendBrowserBookmarks();
  sendBrowserUpdate();
}

// Tastenkürzel wie in Chrome (Cmd/Strg + T/W/L). Cmd+W schließt NUR einen Tab,
// wenn der Browser aktiv ist – sonst auf dem Mac Fenster verstecken, unter
// Windows nichts (kein versehentliches Beenden, s. CLAUDE.md).
function browserCmdNewTab() {
  if (activeId === BROWSER_ID) browserNewTab();
  else switchApp(BROWSER_ID);
}
function browserCmdCloseTab() {
  if (activeId === BROWSER_ID) { if (browserActive) browserCloseTab(browserActive); }
  else if (isMac && win && !win.isDestroyed()) win.close();
}
function browserCmdFocusAddress() {
  if (activeId === BROWSER_ID && views[BROWSER_ID]) views[BROWSER_ID].webContents.send('browser:focus-address');
}

// Offene Tabs merken und nach Neustart wiederherstellen
function browserPersist() {
  if (!state) return;
  if (browserTabs.size === 0) return; // vor dem ersten Öffnen die gespeicherte Sitzung nicht leeren
  const keys = [...browserTabs.keys()];
  const tabs = keys.map((k) => {
    const wc = browserTabs.get(k).webContents;
    const u = wc.isDestroyed() ? '' : wc.getURL();
    return /^https?:/i.test(u) && !u.includes(NEWTAB_FILE) ? u : null; // Neuer-Tab-Seite → null
  });
  state.browser = { tabs, active: keys.indexOf(browserActive) };
  saveState();
}
function browserRestoreOrNew() {
  const saved = state && state.browser;
  if (saved && Array.isArray(saved.tabs) && saved.tabs.length) {
    saved.tabs.slice(0, 20).forEach((u) => browserNewTab(u || undefined));
    const keys = [...browserTabs.keys()];
    const k = keys[saved.active] || keys[keys.length - 1];
    if (k) browserActive = k;
    browserApplyVisibility();
    const av = browserTabs.get(browserActive);
    if (av) { try { av.webContents.focus(); } catch {} }
    sendBrowserUpdate();
  } else {
    browserNewTab();
  }
}

// ---------- Downloads ----------
const DOWNLOAD_SOUND = 'Submarine'; // Ton bei fertigem Download (macOS-Warnton-Name); leicht änderbar
// Ohne Nachfrage in den Downloads-Ordner (Freddys Wunsch 22.08.2026), danach eine
// Mitteilung; Klick darauf zeigt die Datei im Finder/Explorer. Gleichnamige
// Dateien bekommen „(2)", „(3)" … Gilt für App-Views und Login-/App-Popups.
function uniqueFileName(dir, name) {
  const ext = path.extname(name);
  const base = path.basename(name, ext);
  let candidate = name;
  for (let i = 2; fs.existsSync(path.join(dir, candidate)); i++) candidate = `${base} (${i})${ext}`;
  return candidate;
}
// sound (nur macOS): Name eines System-Warntons (System-Einstellungen › Ton ›
// Warnton), z. B. 'Pop', 'Glass', 'Blow', 'Bottle', 'Submarine', 'Tink'.
function notify(title, body, onClick, sound) {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body, ...(isMac && sound ? { sound } : {}) });
  if (onClick) n.on('click', onClick);
  n.show();
}
function setupDownloads(ses) {
  ses.on('will-download', (e, item) => {
    const dir = app.getPath('downloads');
    const name = uniqueFileName(dir, item.getFilename() || 'Download');
    const target = path.join(dir, name);
    item.setSavePath(target); // kein Dialog
    item.once('done', (ev, result) => {
      if (result === 'completed') {
        if (isMac && app.dock) app.dock.downloadFinished(target);
        notify('Download fertig', name, () => shell.showItemInFolder(target), DOWNLOAD_SOUND);
      } else if (result === 'interrupted') {
        notify('Download abgebrochen', name);
      }
    });
  });
}

// ---------- Rechtsklick-Menü in den Apps ----------
// Electron bringt keins mit; ohne gab es kein Kopieren/Einfügen per Maus und
// keine Rechtschreibvorschläge, obwohl die Prüfung läuft (Freddys Wunsch
// 22.08.2026). Inhalt richtet sich nach der Stelle: Wort, Link, Bild, Textfeld,
// Auswahl. Alle Aktionen laufen explizit über die jeweiligen WebContents,
// Menü-Rollen würden die Sidebar treffen.
function attachContextMenu(wc) {
  wc.on('context-menu', (e, p) => {
    const items = [];
    const sep = () => { if (items.length && items[items.length - 1].type !== 'separator') items.push({ type: 'separator' }); };
    if (p.misspelledWord) {
      const suggestions = (p.dictionarySuggestions || []).slice(0, 5);
      for (const word of suggestions) items.push({ label: word, click: () => wc.replaceMisspelling(word) });
      if (!suggestions.length) items.push({ label: 'Keine Vorschläge', enabled: false });
      items.push({ label: 'Zum Wörterbuch hinzufügen', click: () => wc.session.addWordToSpellCheckerDictionary(p.misspelledWord) });
      sep();
    }
    if (p.linkURL) {
      const inTab = [...browserTabs.values()].some((v) => v.webContents === wc);
      items.push(
        { label: inTab ? 'Link in neuem Tab öffnen' : 'Im Verti-Browser öffnen', click: () => browserOpenExternal(p.linkURL) },
        { label: 'Link kopieren', click: () => clipboard.writeText(p.linkURL) },
      );
      sep();
    }
    if (p.mediaType === 'image' && p.srcURL) {
      items.push(
        { label: 'Bild kopieren', click: () => wc.copyImageAt(p.x, p.y) },
        { label: 'Bild in Downloads sichern', click: () => wc.downloadURL(p.srcURL) },
        { label: 'Bildadresse kopieren', click: () => clipboard.writeText(p.srcURL) },
      );
      sep();
    }
    const f = p.editFlags || {};
    if (p.isEditable) {
      items.push(
        { label: 'Rückgängig', enabled: !!f.canUndo, click: () => wc.undo() },
        { label: 'Wiederholen', enabled: !!f.canRedo, click: () => wc.redo() },
        { type: 'separator' },
        { label: 'Ausschneiden', enabled: !!f.canCut, click: () => wc.cut() },
        { label: 'Kopieren', enabled: !!f.canCopy, click: () => wc.copy() },
        { label: 'Einfügen', enabled: !!f.canPaste, click: () => wc.paste() },
        { label: 'Alles auswählen', enabled: !!f.canSelectAll, click: () => wc.selectAll() },
      );
      sep();
    } else if (p.selectionText && p.selectionText.trim()) {
      items.push({ label: 'Kopieren', click: () => wc.copy() });
      sep();
    }
    items.push({ label: 'Neu laden', click: () => wc.reload() });
    Menu.buildFromTemplate(items).popup({ window: BrowserWindow.fromWebContents(wc) || win });
  });
}

function createView(appDef) {
  if (appDef.id === BROWSER_ID) return createBrowserShell(appDef);
  const view = new WebContentsView({ webPreferences: viewWebPreferences(isMuted(appDef.id)) });
  view.webContents.setUserAgent(chromeUserAgent());
  view.webContents.loadURL(startUrlFor(appDef));
  view.webContents.on('dom-ready', () => pushMuted(appDef.id));
  // Eine Web-App darf mit ihrem beforeunload nie das Schließen/Beenden von Verti
  // blockieren (sonst hängt u. a. das Update-quitAndInstall) → immer zulassen
  view.webContents.on('will-prevent-unload', (e) => e.preventDefault());
  view.webContents.setWindowOpenHandler(windowOpenPolicy(view.webContents));
  view.webContents.on('did-create-window', (child) => adoptChildWindow(child));
  attachMouseNav(view.webContents);
  attachContextMenu(view.webContents);
  view.webContents.on('audio-state-changed', (e) => {
    const on = typeof e.audible === 'boolean' ? e.audible : view.webContents.isCurrentlyAudible();
    setAudio(appDef.id, on);
  });
  view.webContents.on('did-finish-load', () => applyZoom(appDef.id));
  // Selbstheilung: stuerzt der Renderer ab oder scheitert das Laden, blieb die
  // App bisher einfach weiss stehen, bis jemand es selbst merkte (Verti hatte
  // gar keine Behandlung dafuer). Jetzt einmal automatisch neu laden, mit
  // etwas Abstand; nur EIN Versuch je Zwischenfall, damit eine dauerhaft
  // kaputte Seite keine Endlosschleife dreht.
  let heiltGerade = false;
  const heile = (grund) => {
    if (heiltGerade) return;
    heiltGerade = true;
    setTimeout(() => {
      try {
        if (!view.webContents.isDestroyed()) view.webContents.reload();
      } catch (e) {}
      setTimeout(() => { heiltGerade = false; }, 30000); // Sperre wieder loesen
    }, 1500);
  };
  view.webContents.on('render-process-gone', (_e, d) => {
    if (d && d.reason !== 'clean-exit') heile(d.reason);
  });
  view.webContents.on('did-fail-load', (_e, code, desc, url, isMain) => {
    // -3 (ABORTED) ist normal bei jeder Weiterleitung, kein Fehler
    if (isMain && code !== -3) heile(code + ' ' + desc);
  });
  const tweaks = APP_TWEAKS[appDef.id];
  if (tweaks) {
    view.webContents.on('dom-ready', () => {
      if (tweaks.css) view.webContents.insertCSS(tweaks.css).catch(() => {});
      if (tweaks.js) view.webContents.executeJavaScript(tweaks.js).catch(() => {});
    });
  }
  view.setVisible(false);
  try { view.setBorderRadius(10); } catch {}
  const onNavigated = (e, url) => {
    if (appDef.id === activeId) sendNavStateFor(appDef.id);
    rememberUrl(appDef, url);
  };
  view.webContents.on('did-navigate', onNavigated);
  view.webContents.on('did-navigate-in-page', onNavigated);
  view.webContents.on('page-title-updated', (_e, title) => setTitleBadge(appDef.id, parseUnread(appDef.id, title)));
  win.contentView.addChildView(view);
  views[appDef.id] = view;
}

function sendNavStateFor(id) {
  if (!win) return;
  let nh = null;
  if (id === BROWSER_ID) { const wc = browserActiveWc(); nh = wc ? wc.navigationHistory : null; }
  else if (views[id]) nh = views[id].webContents.navigationHistory;
  win.webContents.send('nav-state', {
    canGoBack: nh ? nh.canGoBack() : false,
    canGoForward: nh ? nh.canGoForward() : false,
  });
}

function navHome(id) {
  const appDef = state.apps.find((a) => a.id === id);
  if (appDef && views[id]) views[id].webContents.loadURL(appDef.url);
}

// Zurück/Vorwärts/Startseite für die aktive App (Menü, Top-Leiste, Maus).
// Ist die App-Bibliothek offen, heißt „Zurück" bzw. „Startseite": Bibliothek
// schließen und zur App zurück (Freddys Wunsch 22.08.2026: der Pfeil oben soll
// aus der Bibliothek rausführen, nicht nur das ✕); Vorwärts tut dort nichts.
function closeLibrary() {
  setLibrary(false);
  switchApp(activeId && views[activeId] ? activeId : state.apps[0].id);
}
function navBackActive() {
  if (libraryOpen) return closeLibrary();
  const wc = activeWebContents();
  if (wc && wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
}
function navForwardActive() {
  if (libraryOpen) return;
  const wc = activeWebContents();
  if (wc && wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward();
}
function navHomeActive() {
  if (libraryOpen) return closeLibrary();
  if (activeId) navHome(activeId);
}

let screenPickerWin = null;
// Öffnet den Bildschirm-Auswahldialog und liefert das gewählte
// desktopCapturer-Quellobjekt (oder null bei Abbruch)
function pickScreenSource() {
  return new Promise(async (resolve) => {
    if (screenPickerWin && !screenPickerWin.isDestroyed()) {
      try { screenPickerWin.close(); } catch {}
    }
    let sources = [];
    try {
      sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 320, height: 200 },
      });
    } catch {
      return resolve(null);
    }
    if (!sources.length) return resolve(null);
    const list = sources.map((s) => ({
      id: s.id,
      name: s.name || (s.id.startsWith('screen') ? 'Bildschirm' : 'Fenster'),
      kind: s.id.startsWith('screen') ? 'screen' : 'window',
      thumb: s.thumbnail ? s.thumbnail.toDataURL() : '',
    }));
    const pw = new BrowserWindow({
      width: 640, height: 520,
      resizable: false, minimizable: false, maximizable: false, fullscreenable: false,
      frame: false, transparent: true, skipTaskbar: true, show: false,
      parent: win && !win.isDestroyed() ? win : undefined, modal: true,
      webPreferences: { preload: path.join(__dirname, 'screen-picker-preload.js') },
    });
    screenPickerWin = pw;
    let done = false;
    const finish = (id) => {
      if (done) return;
      done = true;
      const chosen = id ? sources.find((s) => s.id === id) : null;
      if (!pw.isDestroyed()) pw.close();
      resolve(chosen || null);
    };
    const onChoose = (e, id) => {
      if (BrowserWindow.fromWebContents(e.sender) === pw) finish(id);
    };
    ipcMain.on('screen-picker:choose', onChoose);
    pw.on('closed', () => {
      ipcMain.removeListener('screen-picker:choose', onChoose);
      screenPickerWin = null;
      if (!done) { done = true; resolve(null); }
    });
    pw.loadFile('screen-picker.html');
    pw.webContents.once('did-finish-load', () => {
      if (pw.isDestroyed()) return;
      pw.webContents.send('screen-picker:sources', list);
      pw.show();
    });
  });
}

function createWindow() {
  state = loadState();

  const ses = session.fromPartition('persist:apps');
  ses.setUserAgent(chromeUserAgent());
  // Rechtschreibpruefung war zwar an (spellcheck: true), aber ohne gesetzte
  // Sprache pruefte Chromium gegen Englisch - deutsche Nutzer sahen in JEDER
  // App rote Wellen unter korrektem Deutsch.
  // Gemessen (29.08.2026, Electron 43/macOS): Chromium normalisiert die Liste
  // auf "de" und nutzt auf dem Mac die System-Rechtschreibpruefung; unter
  // Windows greift die Liste direkt. Deshalb einfach Deutsch + Englisch
  // anfragen und die Verfuegbarkeit vorher pruefen, damit nichts wirft.
  try {
    const da = ses.availableSpellCheckerLanguages || [];
    const wunsch = ['de-DE', 'en-US'].filter((l) => da.includes(l));
    if (wunsch.length) ses.setSpellCheckerLanguages(wunsch);
  } catch (e) {}
  applyGoogleAuthDisguise(ses);
  ladeErweiterungen(ses); // gemerkte Erweiterungen wiederherstellen (Electron tut das nicht selbst)
  if (!state.onboarded) setTimeout(zeigeOnboarding, 600); // Ersteinrichtung nur beim allerersten Start
  // Login-Popups laufen teils in der Default-Session, bevor sie adoptiert werden
  applyGoogleAuthDisguise(session.defaultSession);
  ses.setPermissionRequestHandler((wc, permission, cb) => {
    cb(['notifications', 'media', 'clipboard-read', 'clipboard-sanitized-write', 'fullscreen'].includes(permission));
  });
  setupDownloads(ses);
  setupDownloads(session.defaultSession);
  // Bildschirmfreigabe (Zoom/Meet/Teams): eigener Auswahldialog, damit der
  // Nutzer Bildschirm oder Fenster wählen kann
  ses.setDisplayMediaRequestHandler((request, callback) => {
    pickScreenSource().then((source) => {
      // Kein Audio mitteilen; nur das gewählte Video-Quellobjekt oder Abbruch
      callback(source ? { video: source } : {});
    }).catch(() => callback({}));
  }, { useSystemPicker: false });

  win = new BrowserWindow({
    ...state.bounds,
    minWidth: 900,
    minHeight: 600,
    // Dev-Version (npx electron .) kenntlich machen, damit sie nicht mit der
    // installierten App verwechselt wird (Sidebar zeigt dazu ein rotes Etikett)
    title: app.isPackaged ? 'Verti' : 'Verti (Dev)',
    titleBarStyle: 'hidden',
    ...(isMac
      ? { trafficLightPosition: { x: 18, y: 16 } }
      : { titleBarOverlay: { color: '#22242c', symbolColor: '#ffffff', height: TOP_BAR - 1 } }),
    backgroundColor: state.theme === 'light' ? '#e7e5df' : '#22242c',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  win.loadFile('sidebar.html');
  // Seitentasten über der Sidebar navigieren die aktive App
  attachMouseNav(win.webContents, activeWebContents);
  if (isMac) {
    // Logi Options+ & Co. setzen „Zurück/Vorwärts" der Maus-Seitentasten auf
    // dem Mac als Wischgeste um (gemessen 22.08.2026 mit scripts/mouse-probe.js:
    // swipe left/right, keine Maustaste, kein Tastenkürzel – deshalb griff
    // before-mouse-event bei Freddy nicht). Dieselbe Geste kommt vom Trackpad
    // mit drei Fingern („Zwischen Seiten wischen"). Richtung wie in Chrome und
    // Firefox: deltaX>0 (Electron „left") = zurück, deltaX<0 („right") = vor.
    win.on('swipe', (e, dir) => {
      if (dir === 'left') mouseNav(activeWebContents(), 'back');
      else if (dir === 'right') mouseNav(activeWebContents(), 'forward');
    });
  } else {
    // Windows meldet Maus-/Treibertasten zusätzlich als app-command
    win.on('app-command', (e, cmd) => {
      if (cmd === 'browser-backward') mouseNav(activeWebContents(), 'back');
      else if (cmd === 'browser-forward') mouseNav(activeWebContents(), 'forward');
    });
  }

  for (const appDef of state.apps) {
    createView(appDef);
  }

  win.on('resize', () => { layoutViews(); saveState(); });
  win.on('move', saveState);
  win.on('closed', () => { win = null; });
  // Mac: Schließen versteckt das Fenster nur. Die App-Views laufen weiter,
  // also kommen Dock-Badge und Benachrichtigungen auch bei geschlossenem
  // Fenster weiter an (Freddys Wunsch 22.08.2026); vorher starben die Views
  // mit dem Fenster und das Dock-Icon blieb stumm. Dock-Klick holt das
  // Fenster zurück (app 'activate'), Cmd+Q beendet wirklich (before-quit).
  // Windows: Schließen bleibt Beenden (window-all-closed).
  win.on('close', (e) => {
    if (!isMac || quitting) return;
    e.preventDefault();
    if (win.isFullScreen()) {
      win.once('leave-full-screen', () => { if (win && !win.isDestroyed()) win.hide(); });
      win.setFullScreen(false);
    } else {
      win.hide();
    }
  });
  // Fenster kommt zurück → die aktive App gilt als geöffnet (wie beim
  // App-Wechsel: Öffnen = gelesen)
  win.on('show', () => { if (activeId) clearBadge(activeId); });
  win.on('hide', () => { if (zoomHud && !zoomHud.isDestroyed()) zoomHud.hide(); if (activeId) recomputeBadge(activeId); });

  win.webContents.once('did-finish-load', () => {
    win.webContents.send('theme', state.theme, state.themeColor);
    switchApp(views[state.activeApp] ? state.activeApp : state.apps[0].id);
  });
}

function setLibrary(open) {
  libraryOpen = open;
  for (const view of Object.values(views)) {
    view.setVisible(!open && undefined !== activeId && views[activeId] === view);
  }
  browserApplyVisibility();
}

ipcMain.on('switch-app', (e, id) => switchApp(id));
ipcMain.on('reload-app', (e, id) => views[id] && views[id].webContents.reload());
ipcMain.on('nav-back', navBackActive);
ipcMain.on('nav-forward', navForwardActive);
ipcMain.on('nav-home', navHomeActive);
// Verti-Browser
ipcMain.on('browser:ready', () => { if (browserTabs.size === 0 && activeId === BROWSER_ID) browserRestoreOrNew(); else sendBrowserUpdate(); sendBrowserBookmarks(); if (views[BROWSER_ID]) views[BROWSER_ID].webContents.send('theme', state.theme, state.themeColor); });
ipcMain.on('browser:new-tab', () => browserNewTab());
ipcMain.on('browser:close-tab', (e, key) => browserCloseTab(key));
ipcMain.on('browser:switch-tab', (e, key) => browserSwitchTab(key));
ipcMain.on('browser:navigate', (e, text) => { const wc = browserActiveWc(); const u = browserToUrl(text); if (wc && u) wc.loadURL(u); });
ipcMain.on('browser:back', () => { const wc = browserActiveWc(); if (wc && wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack(); });
ipcMain.on('browser:forward', () => { const wc = browserActiveWc(); if (wc && wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward(); });
ipcMain.on('browser:reload', () => { const wc = browserActiveWc(); if (wc) wc.reload(); });
ipcMain.on('browser:stop', () => { const wc = browserActiveWc(); if (wc) wc.stop(); });
ipcMain.on('browser:toggle-bookmark', browserToggleBookmark);
ipcMain.on('browser:remove-bookmark', (e, url) => browserRemoveBookmark(url));
ipcMain.on('browser:open-bookmark', (e, url) => { const wc = browserActiveWc(); if (wc && url) wc.loadURL(url); });
ipcMain.on('browser:suggest', (e, text) => browserSuggest(text));
ipcMain.on('browser:suggest-open', () => { if (!browserSuggestOpen) { browserSuggestOpen = true; layoutViews(); } });
ipcMain.on('browser:suggest-close', () => { if (browserSuggestOpen) { browserSuggestOpen = false; layoutViews(); } });
ipcMain.handle('get-apps', () => state.apps);
// ---------- Einstellungen (Theme, externe Links) ----------
// Farbwelten der Oberflaeche (Einstellungen -> Darstellung). "graphit" ist der
// Standard und zugleich das neue, etwas hellere Dunkel (vorher #22242c).
// Die Werte muessen zu den CSS-Bloecken in sidebar.html/browser.html passen.
const FARBWELTEN = ['graphit', 'marine', 'wald', 'kupfer', 'pflaume', 'rubin'];
const FENSTER_BG = {
  graphit: { dark: '#2a2c36', light: '#efece6' },
  marine:  { dark: '#232a3a', light: '#e9edf5' },
  wald:    { dark: '#232f2a', light: '#e8f0ea' },
  kupfer:  { dark: '#322a26', light: '#f4ece6' },
  pflaume: { dark: '#2c2635', light: '#efe9f5' },
  rubin:   { dark: '#33262a', light: '#f6e9ec' },
};
function themeBg() {
  const f = (state && FENSTER_BG[state.themeColor]) || FENSTER_BG.graphit;
  return state && state.theme === 'light' ? f.light : f.dark;
}
function broadcastTheme() {
  if (win && !win.isDestroyed()) { try { win.setBackgroundColor(themeBg()); } catch {} win.webContents.send('theme', state.theme, state.themeColor); }
  if (views[BROWSER_ID] && !views[BROWSER_ID].webContents.isDestroyed()) views[BROWSER_ID].webContents.send('theme', state.theme, state.themeColor);
}
ipcMain.handle('get-settings', () => ({ theme: (state && state.theme) || 'dark', themeColor: (state && state.themeColor) || 'graphit', farbwelten: FARBWELTEN, externalLinks: (state && state.externalLinks) || 'verti', mutedApps: (state && state.mutedApps) || [] }));
ipcMain.on('set-theme', (e, t) => { if (!state) return; state.theme = t === 'light' ? 'light' : 'dark'; saveState(); broadcastTheme(); });
ipcMain.on('set-theme-color', (e, f) => {
  if (!state || !FARBWELTEN.includes(f)) return;
  state.themeColor = f;
  saveState();
  broadcastTheme();
});
ipcMain.on('set-external-links', (e, m) => { if (!state) return; state.externalLinks = m === 'system' ? 'system' : 'verti'; saveState(); });
// Stumm-Status an die betroffene View schicken (view-preload unterdrückt dann Meldungen)
function pushMuted(id) {
  const v = views[id];
  if (v && v.webContents && !v.webContents.isDestroyed()) v.webContents.send('verti-muted', isMuted(id));
}
ipcMain.on('set-app-muted', (e, id, muted) => {
  if (!state || !id) return;
  const set = new Set(Array.isArray(state.mutedApps) ? state.mutedApps : []);
  if (muted) set.add(id); else set.delete(id);
  state.mutedApps = [...set];
  saveState();
  recomputeBadge(id); // Badge sofort ein-/ausblenden
  pushMuted(id);
});
// Einstellungen: manuell nach Updates suchen (Ergebnis inline in der Seite)
ipcMain.handle('settings:check-updates', async () => {
  if (!app.isPackaged) return { status: 'dev' };
  try {
    updateNotifiedFor = null; updateForcedShownFor = null; // Popup/Zwang danach wieder
    const r = await getAutoUpdater().checkForUpdates();
    const v = r && r.updateInfo && r.updateInfo.version;
    if (v && isNewerVersion(v, app.getVersion())) return { status: 'available', version: v };
    return { status: 'current', version: app.getVersion() };
  } catch { return { status: 'error' }; }
});
// Das Admin-Panel (Verbesserungs-Meldungen) ist nur fuer Freddy gedacht und
// erscheint deshalb nur auf SEINEN Rechnern in den Einstellungen. Kein
// Sicherheitsmerkmal - das Panel selbst verlangt eine echte Anmeldung -,
// sondern nur, damit Mitarbeiter den Eintrag gar nicht erst sehen.
const ADMIN_PANEL_URL = 'https://freddyveee.github.io/verti/admin.html';
function istAdminRechner() {
  if (process.env.VERTI_ADMIN === '1') return true;
  try {
    return /frederic|freddy/i.test(require('os').hostname() || '');
  } catch (e) {
    return false;
  }
}
ipcMain.handle('get-app-info', () => ({ version: app.getVersion(), packaged: app.isPackaged, admin: istAdminRechner() }));
ipcMain.on('open-admin', () => {
  if (!istAdminRechner()) return;
  switchApp(BROWSER_ID);
  browserNewTab(ADMIN_PANEL_URL);
});
// Kompatibilitaets-Check: eine lokale Seite, die alle Beruehrungsflaechen
// zwischen Verti und beliebigen Web-Apps durchspielt (Fenster, Meldungen,
// Downloads, Medien, Anmeldung, Zwischenablage, Darstellung, Deep-Links).
// Vor jedem Release einmal oeffnen, besonders nach einem Electron-Update -
// dann sieht man in Minuten, welche Flaeche sich verschoben hat.
// ---------- Ersteinrichtung (Onboarding) ----------
// Laeuft genau einmal beim allerersten Start. Vier Schritte nach dem Vorbild
// von Shift: Willkommen, Standardbrowser, Daten uebernehmen, Apps auswaehlen.
// Fenster ohne Rahmen ueber dem Hauptfenster, wie das Update-Popup.
let onboardWin = null;

// Lesezeichen aus einem vorhandenen Chromium-Browser lesen. Deren Datei
// "Bookmarks" ist unverschluesseltes JSON - anders als Cookies oder
// Passwoerter, die wir bewusst NICHT anfassen.
function chromeProfile(unterordner) {
  const home = app.getPath('home');
  return process.platform === 'darwin'
    ? path.join(home, 'Library', 'Application Support', ...unterordner)
    : path.join(home, 'AppData', 'Local', ...unterordner);
}
const LESEZEICHEN_QUELLEN = [
  { name: 'Google Chrome', pfad: () => chromeProfile(process.platform === 'darwin' ? ['Google', 'Chrome', 'Default', 'Bookmarks'] : ['Google', 'Chrome', 'User Data', 'Default', 'Bookmarks']) },
  { name: 'Microsoft Edge', pfad: () => chromeProfile(process.platform === 'darwin' ? ['Microsoft Edge', 'Default', 'Bookmarks'] : ['Microsoft', 'Edge', 'User Data', 'Default', 'Bookmarks']) },
  { name: 'Brave', pfad: () => chromeProfile(process.platform === 'darwin' ? ['BraveSoftware', 'Brave-Browser', 'Default', 'Bookmarks'] : ['BraveSoftware', 'Brave-Browser', 'User Data', 'Default', 'Bookmarks']) },
];
function sammleLesezeichen(knoten, raus) {
  if (!knoten) return;
  if (Array.isArray(knoten.children)) for (const k of knoten.children) sammleLesezeichen(k, raus);
  if (knoten.type === 'url' && /^https?:/.test(knoten.url || '')) {
    raus.push({ url: knoten.url, title: String(knoten.name || knoten.url).slice(0, 120) });
  }
}
function gefundeneQuellen() {
  return LESEZEICHEN_QUELLEN.map((q) => {
    try {
      const p = q.pfad();
      if (!fs.existsSync(p)) return null;
      const roh = JSON.parse(fs.readFileSync(p, 'utf8'));
      const raus = [];
      for (const wurzel of Object.values(roh.roots || {})) sammleLesezeichen(wurzel, raus);
      return raus.length ? { name: q.name, anzahl: raus.length } : null;
    } catch (e) { return null; }
  }).filter(Boolean);
}
ipcMain.handle('onboard:quellen', () => gefundeneQuellen());
ipcMain.handle('onboard:import', (e, quelle) => {
  const q = LESEZEICHEN_QUELLEN.find((x) => x.name === quelle);
  if (!q) return { ok: false };
  try {
    const roh = JSON.parse(fs.readFileSync(q.pfad(), 'utf8'));
    const raus = [];
    for (const wurzel of Object.values(roh.roots || {})) sammleLesezeichen(wurzel, raus);
    if (!state.bookmarks) state.bookmarks = [];
    const da = new Set(state.bookmarks.map((b) => b.url));
    let neu = 0;
    for (const b of raus) if (!da.has(b.url)) { state.bookmarks.push(b); da.add(b.url); neu++; }
    saveState();
    sendBrowserBookmarks();
    return { ok: true, anzahl: neu };
  } catch (err) { return { ok: false, error: err.message } }
});
// Verti als Standardbrowser anmelden. WICHTIG: setAsDefaultProtocolClient
// kehrt SOFORT zurueck, auf dem Mac steht die Systemrueckfrage danach noch
// offen. Der Rueckgabewert sagt also nur "angefragt", nicht "erledigt" - eine
// Erfolgs- oder Fehlermeldung an dieser Stelle waere schlicht geraten.
// Deshalb fragt die Seite anschliessend per onboard:iststandard nach.
// (In der Dev-Version nennt macOS die App "Electron", weil das Bundle
// Electron.app heisst; in der gebauten App steht dort Verti.)
ipcMain.handle('onboard:standardbrowser', () => {
  try {
    app.setAsDefaultProtocolClient('http');
    app.setAsDefaultProtocolClient('https');
  } catch (e) {}
  return { angefragt: true };
});
ipcMain.handle('onboard:iststandard', () => {
  try {
    return { ist: app.isDefaultProtocolClient('http') && app.isDefaultProtocolClient('https') };
  } catch (e) { return { ist: false }; }
});
ipcMain.handle('onboard:vorschlaege', () => {
  // Vorauswahl: die IMPERIO-Apps. Der Browser ist ohnehin fest dabei.
  return CATALOG
    .filter((c) => c.id !== BROWSER_ID)
    .map((c) => ({ id: c.id, name: c.name, icon: c.icon, url: c.url, category: CATEGORIES[c.id] || 'Weitere', empfohlen: IMPERIO_IDS.includes(c.id) }));
});
ipcMain.handle('onboard:fertig', (e, ids) => {
  try {
    const gewaehlt = Array.isArray(ids) ? ids : [];
    const behalten = state.apps.filter((a) => a.id === BROWSER_ID);
    for (const id of gewaehlt) {
      if (id === BROWSER_ID) continue;
      const c = CATALOG.find((x) => x.id === id);
      if (c && !behalten.some((a) => a.id === id)) behalten.push({ id: c.id, name: c.name, url: c.url, icon: c.icon });
    }
    state.apps = behalten;
    state.onboarded = true;
    saveState();
  } catch (err) {}
  if (onboardWin && !onboardWin.isDestroyed()) onboardWin.close();
  app.relaunch();
  app.exit(0);
  return { ok: true };
});
ipcMain.on('onboard:abbrechen', () => {
  state.onboarded = true;
  saveState();
  if (onboardWin && !onboardWin.isDestroyed()) onboardWin.close();
});
function zeigeOnboarding() {
  if (onboardWin) return;
  const cb = win && !win.isDestroyed() ? win.getContentBounds() : null;
  onboardWin = new BrowserWindow({
    ...(cb ? { x: cb.x, y: cb.y, width: cb.width, height: cb.height } : { width: 1100, height: 800 }),
    frame: false, transparent: true, hasShadow: false, resizable: false,
    maximizable: false, minimizable: false, fullscreenable: false,
    skipTaskbar: true, show: false, alwaysOnTop: true,
    webPreferences: { preload: path.join(__dirname, 'onboarding-preload.js') },
  });
  // Wie beim Update-Popup: kein Elternfenster, dafuer von Hand nachfuehren
  const folge = () => {
    if (!onboardWin || onboardWin.isDestroyed() || !win || win.isDestroyed()) return;
    const b = win.getContentBounds();
    try { onboardWin.setBounds({ x: b.x, y: b.y, width: b.width, height: b.height }); } catch (e) {}
  };
  if (win && !win.isDestroyed()) { win.on('move', folge); win.on('resize', folge); }
  onboardWin.loadFile('onboarding.html');
  onboardWin.webContents.once('did-finish-load', () => { folge(); onboardWin.show(); });
  onboardWin.on('closed', () => {
    if (win && !win.isDestroyed()) { win.off('move', folge); win.off('resize', folge); }
    onboardWin = null;
  });
}

// ---------- Chrome-Erweiterungen ----------
// Electron kann nur ENTPACKTE Erweiterungs-Ordner laden (gemessen 31.08.2026:
// loadExtension funktioniert, und Content-Skripte wirken auch in Vertis
// App-Ansichten). Wir merken uns die Ordner-Pfade und laden sie bei jedem
// Start neu - Electron behaelt sie nicht ueber Neustarts hinweg.
// WICHTIG fuer den Nutzer: eine Erweiterung laeuft in derselben Session wie
// ALLE eingeloggten Apps, sie sieht also potenziell alles. Deshalb die
// Warnung im Hinzufuegen-Dialog.
const extFile = () => path.join(app.getPath('userData'), 'extensions.json');
function ladeExtListe() {
  try { return JSON.parse(fs.readFileSync(extFile(), 'utf8')).pfade || []; } catch (e) { return []; }
}
function speichereExtListe(pfade) {
  try { fs.writeFileSync(extFile(), JSON.stringify({ pfade }, null, 2)); } catch (e) {}
}
// Beim Start alle gemerkten Erweiterungen laden. Fehlende Ordner (verschoben
// oder geloescht) fliegen still aus der Liste, statt jedes Mal zu scheitern.
async function ladeErweiterungen(ses) {
  const pfade = ladeExtListe();
  const ok = [];
  for (const p of pfade) {
    try {
      await ses.extensions.loadExtension(p, { allowFileAccess: true });
      ok.push(p);
    } catch (e) {
      console.log('[erweiterung] konnte nicht geladen werden:', p, e.message);
    }
  }
  if (ok.length !== pfade.length) speichereExtListe(ok);
}
function erweiterungenListe(ses) {
  const pfade = ladeExtListe();
  try {
    return ses.extensions.getAllExtensions().map((e) => ({
      id: e.id, name: e.name, version: e.version,
      beschreibung: (e.manifest && e.manifest.description) || '',
      pfad: e.path,
      merkbar: pfade.includes(e.path),
    }));
  } catch (e) { return []; }
}
ipcMain.handle('ext:list', () => erweiterungenListe(session.fromPartition('persist:apps')));
ipcMain.handle('ext:add', async () => {
  const w = BrowserWindow.getFocusedWindow() || win;
  const r = await dialog.showOpenDialog(w, {
    title: 'Erweiterung hinzufügen',
    message: 'Wähle den entpackten Ordner der Erweiterung (der mit der manifest.json).',
    properties: ['openDirectory'],
    buttonLabel: 'Hinzufügen',
  });
  if (r.canceled || !r.filePaths[0]) return { ok: false };
  const ordner = r.filePaths[0];
  if (!fs.existsSync(path.join(ordner, 'manifest.json'))) {
    return { ok: false, error: 'In diesem Ordner liegt keine manifest.json. Das ist keine entpackte Erweiterung.' };
  }
  try {
    const ses = session.fromPartition('persist:apps');
    const ext = await ses.extensions.loadExtension(ordner, { allowFileAccess: true });
    const pfade = ladeExtListe();
    if (!pfade.includes(ordner)) { pfade.push(ordner); speichereExtListe(pfade); }
    return { ok: true, name: ext.name };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});
ipcMain.handle('ext:remove', (e, id) => {
  const ses = session.fromPartition('persist:apps');
  const alle = erweiterungenListe(ses);
  const treffer = alle.find((x) => x.id === id);
  try { ses.extensions.removeExtension(id); } catch (err) {}
  if (treffer) speichereExtListe(ladeExtListe().filter((p) => p !== treffer.pfad));
  return { ok: true };
});
// Puzzle-Symbol in der Browser-Leiste: oeffnet die Einstellungen, dort liegt
// der Abschnitt "Erweiterungen". Bewusst keine eigene Seite - so gibt es nur
// EINEN Ort fuer Einstellungen statt zwei.
ipcMain.on('browser:open-extensions', () => {
  if (win && !win.isDestroyed()) win.webContents.send('open-settings-section', 'erweiterungen');
});
// Zahnrad in der Browser-Leiste: normale Einstellungen, ohne Sprung zu den
// Erweiterungen. Puzzle = Erweiterungen, Zahnrad = Einstellungen - vorher
// fuehrte das Puzzle einfach in die allgemeinen Einstellungen, was verwirrte.
// Zahnrad in der Browser-Leiste oeffnet die Browser-Seitenkarte (Schnell-
// zugriff), NICHT die allgemeinen Verti-Einstellungen. Vorbild ist Shifts
// "Quick Settings": Tabs, Erweiterungen, Downloads, Darstellung.
ipcMain.on('browser:open-settings', () => {
  if (win && !win.isDestroyed()) win.webContents.send('open-browser-panel');
});
ipcMain.on('open-downloads-folder', () => {
  try { shell.openPath(app.getPath('downloads')); } catch (e) {}
});
ipcMain.handle('history:count', () => (state && Array.isArray(state.history) ? state.history.length : 0));
ipcMain.handle('history:clear', () => {
  try { state.history = []; saveState(); } catch (e) {}
  return { ok: true };
});

ipcMain.on('open-compat-check', () => {
  if (!istAdminRechner()) return;
  switchApp(BROWSER_ID);
  browserNewTab(pathToFileURL(path.join(__dirname, 'kompatibilitaets-check.html')).href);
});

// ---------- „Verbesserungen": Feedback landet in Supabase ----------
// Der anon-Key ist öffentlich unkritisch (nur INSERT per Row-Level-Security);
// Lesen/Abhaken kann nur der eingeloggte Admin im Panel.
const SUPABASE_URL = 'https://dganalwiakzgrskkvrvs.supabase.co';        // z.B. https://xxxx.supabase.co
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRnYW5hbHdpYWt6Z3Jza2t2cnZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc4NTU1NzksImV4cCI6MjEwMzQzMTU3OX0.tpCNNNLkWgbKoVAbeQ66VdfG6TxnndOUF1d_E4d8iTk';
ipcMain.handle('feedback:send', async (e, payload) => {
  try {
    const topic = String((payload && payload.topic) || '').trim().slice(0, 200);
    const description = String((payload && payload.description) || '').trim().slice(0, 4000);
    const sender = String((payload && payload.sender) || '').trim().slice(0, 120);
    if (!topic || !description) return { ok: false, error: 'Bitte Thema und Vorschlag ausfüllen.' };
    if (!/^https?:\/\//.test(SUPABASE_URL)) return { ok: false, error: 'Feedback ist noch nicht eingerichtet.' };
    let osUser = '', host = '';
    try { osUser = require('os').userInfo().username || ''; } catch (_) {}
    try { host = require('os').hostname() || ''; } catch (_) {}
    const row = {
      topic, description,
      sender: sender || osUser || null,
      app: activeId || null,
      device: [host, process.platform].filter(Boolean).join(' / ') || null,
      version: app.getVersion(),
    };
    const bodyStr = JSON.stringify(row);
    const u = new URL(SUPABASE_URL.replace(/\/+$/, '') + '/rest/v1/feedback');
    const res = await new Promise((resolve, reject) => {
      const req = https.request({
        method: 'POST', hostname: u.hostname, port: 443, path: u.pathname + u.search,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(bodyStr),
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
          'Prefer': 'return=minimal',
        },
      }, (r) => { let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => resolve({ status: r.statusCode, body: d })); });
      req.on('error', reject);
      req.setTimeout(15000, () => req.destroy(new Error('Zeitüberschreitung')));
      req.write(bodyStr); req.end();
    });
    if (res.status >= 200 && res.status < 300) return { ok: true };
    return { ok: false, error: 'Konnte nicht senden (HTTP ' + res.status + ').' };
  } catch (err) {
    return { ok: false, error: (err && err.message) || 'Netzwerkfehler.' };
  }
});
// Die Sidebar fragt nach dem Start einmal nach: Das erste 'active-app' aus
// switchApp (did-finish-load) kommt, bevor sie ihre Empfänger registriert
// hat, und verpuffte → kein Icon war markiert, bis man klickte (bis 1.0.20).
ipcMain.handle('get-active-app', () => {
  if (activeId) sendNavStateFor(activeId);
  return activeId;
});
// App-Kennzeichnung: die Stufe beschreibt UNSERE Zusage, nicht die Qualitaet
// der fremden App. "geprueft" = von Hand durchgespielt (Anmeldung, Kern-
// funktion, Badges), mit sichtbarem Datum. Alles andere gilt als
// "unterstuetzt": laedt im automatischen Katalog-Durchlauf, mehr versprechen
// wir nicht. "experimentell" = bekannt wackelig.
// Bewusst eine eigene Datei, damit sich die Liste ohne Code-Aenderung pflegen
// laesst. Faellt sie aus, gilt einfach ueberall "unterstuetzt".
let APP_STATUS = { geprueft: {}, experimentell: [] };
try {
  const roh = JSON.parse(fs.readFileSync(path.join(__dirname, 'app-status.json'), 'utf8'));
  APP_STATUS = { geprueft: roh.geprueft || {}, experimentell: roh.experimentell || [] };
} catch (e) {}
function appStatus(id) {
  if (APP_STATUS.experimentell.includes(id)) return { stufe: 'experimentell' };
  if (APP_STATUS.geprueft[id]) return { stufe: 'geprueft', datum: APP_STATUS.geprueft[id] };
  return { stufe: 'unterstuetzt' };
}
ipcMain.handle('get-catalog', () => CATALOG.map((c) => ({ ...c, imperio: IMPERIO_IDS.includes(c.id), category: CATEGORIES[c.id] || 'Weitere', ...appStatus(c.id) })));
ipcMain.handle('get-category-order', () => CATEGORY_ORDER);
ipcMain.on('open-library', () => setLibrary(true));
ipcMain.on('close-library', closeLibrary);

ipcMain.on('add-app', (e, appDef) => {
  if (!appDef || !appDef.id || !appDef.url || views[appDef.id]) return;
  let url;
  try {
    url = new URL(appDef.url);
  } catch {
    return;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return;
  const clean = { id: String(appDef.id), name: String(appDef.name || url.hostname), url: url.href };
  if (typeof appDef.icon === 'string') clean.icon = appDef.icon;
  state.apps.push(clean);
  createView(clean);
  buildMenu();
  saveState();
  win.webContents.send('apps-changed', state.apps);
  switchApp(clean.id);
});

function removeApp(id) {
  if (id === BROWSER_ID) return; // Browser ist fix, nicht entfernbar
  if (!views[id] || state.apps.length <= 1) return;
  const view = views[id];
  win.contentView.removeChildView(view);
  view.webContents.close();
  delete views[id];
  forgetBadge(id);
  setAudio(id, false);
  delete state.lastUrls[id];
  delete state.zoom[id];
  state.apps = state.apps.filter((a) => a.id !== id);
  buildMenu();
  saveState();
  win.webContents.send('apps-changed', state.apps);
  if (activeId === id) {
    activeId = null;
    if (!libraryOpen) switchApp(state.apps[0].id);
  }
}

ipcMain.on('remove-app', (e, id) => removeApp(id));

ipcMain.on('reorder-apps', (e, ids) => {
  if (!Array.isArray(ids)) return;
  const byId = Object.fromEntries(state.apps.map((a) => [a.id, a]));
  const reordered = ids.map((id) => byId[id]).filter(Boolean);
  // Der Browser ist oben fix und nicht Teil der sortierbaren Liste
  const browser = state.apps.find((a) => a.id === BROWSER_ID);
  const expected = state.apps.length - (browser ? 1 : 0);
  if (reordered.length !== expected) return;
  state.apps = browser ? [browser, ...reordered] : reordered;
  buildMenu();
  saveState();
  win.webContents.send('apps-changed', state.apps);
});

ipcMain.on('app-context-menu', (e, id) => {
  const appDef = state.apps.find((a) => a.id === id);
  if (!appDef) return;
  const menu = Menu.buildFromTemplate([
    { label: appDef.name, enabled: false },
    { type: 'separator' },
    { label: 'Neu laden', click: () => views[id] && views[id].webContents.reload() },
    { label: 'Zur Startseite', click: () => navHome(id) },
    { type: 'separator' },
    // Stoerungsmeldung pro App. Wichtig ist die Pflichtfrage im Formular
    // ("Geht es in deinem normalen Browser?"): sie trennt einen Verti-Fehler
    // von einer Aenderung beim App-Anbieter und macht 209 Apps ueberhaupt
    // erst handhabbar - sonst landet jede fremde Web-App-Aenderung bei uns.
    {
      label: 'Diese App funktioniert nicht \u2026',
      click: () => win && win.webContents.send('report-app-problem', { id, name: appDef.name }),
    },
    {
      label: 'Entfernen',
      enabled: state.apps.length > 1 && id !== BROWSER_ID,
      visible: id !== BROWSER_ID,
      click: () => removeApp(id),
    },
  ]);
  menu.popup({ window: win });
});

function buildMenu() {
  const appSwitchItems = state.apps.slice(0, 9).map((a, i) => ({
    label: a.name,
    accelerator: `CmdOrCtrl+${i + 1}`,
    click: () => switchApp(a.id),
  }));
  const template = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { label: 'Nach Updates suchen…', click: () => checkForUpdatesManually() },
        { type: 'separator' },
        { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'Ansicht',
      submenu: [
        ...appSwitchItems,
        { type: 'separator' },
        {
          label: 'Aktive App neu laden',
          accelerator: 'CmdOrCtrl+R',
          click: () => { const wc = activeWebContents(); if (wc) wc.reload(); else if (activeId && views[activeId]) views[activeId].webContents.reload(); },
        },
        { type: 'separator' },
        { label: 'Vergrößern', accelerator: 'CmdOrCtrl+Plus', click: () => zoomActive(1) },
        // zweiter Weg für Tastaturen, auf denen „+" nur über Shift+= erreichbar ist
        { label: 'Vergrößern', accelerator: 'CmdOrCtrl+=', visible: false, acceleratorWorksWhenHidden: true, click: () => zoomActive(1) },
        { label: 'Verkleinern', accelerator: 'CmdOrCtrl+-', click: () => zoomActive(-1) },
        { label: 'Originalgröße', accelerator: 'CmdOrCtrl+0', click: () => zoomActive(0) },
        // Browser-Tastenkürzel (greifen nur, wenn der Verti-Browser aktiv ist)
        { label: 'Neuer Tab', accelerator: 'CmdOrCtrl+T', visible: false, acceleratorWorksWhenHidden: true, click: browserCmdNewTab },
        { label: 'Tab schließen', accelerator: 'CmdOrCtrl+W', visible: false, acceleratorWorksWhenHidden: true, click: browserCmdCloseTab },
        { label: 'Adresse fokussieren', accelerator: 'CmdOrCtrl+L', visible: false, acceleratorWorksWhenHidden: true, click: browserCmdFocusAddress },
        { type: 'separator' },
        {
          label: 'Zurück',
          accelerator: 'CmdOrCtrl+[',
          click: navBackActive,
        },
        {
          label: 'Vorwärts',
          accelerator: 'CmdOrCtrl+]',
          click: navForwardActive,
        },
        {
          label: 'Zur Startseite',
          accelerator: 'CmdOrCtrl+Shift+H',
          click: navHomeActive,
        },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        // Entwicklerwerkzeuge für die gerade sichtbare App bzw. den Browser-Tab.
        // Ohne die war jeder Fehler INNERHALB einer Web-App blind zu suchen
        // (Ursachensuche ging nur über eigens gebaute Sonden). Bewusst mit
        // Tastenkürzel und sichtbar im Menü, damit auch Mitarbeiter bei einer
        // Rückmeldung schnell Konsole/Netzwerk zeigen können.
        {
          label: 'Entwicklerwerkzeuge',
          accelerator: isMac ? 'Alt+Cmd+I' : 'Ctrl+Shift+I',
          click: () => {
            const wc = activeWebContents();
            if (!wc || wc.isDestroyed()) return;
            if (wc.isDevToolsOpened()) wc.closeDevTools();
            else wc.openDevTools({ mode: 'detach' });
          },
        },
      ],
    },
    // Windows: kein 'close'-Role im Fenstermenü, sonst beendet Strg+W die komplette App
    isMac ? { role: 'windowMenu' } : { label: 'Fenster', submenu: [{ role: 'minimize' }, { role: 'zoom' }] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------- Auto-Update ----------
// Beide Plattformen identisch (seit die App signiert ist): Hinweis-Popup mit
// Release-Notes, Nutzer bestätigt aktiv, dann Download + Installation über
// electron-updater (GitHub Releases; Mac braucht Verti-Mac.zip + latest-mac.yml).
// Kurzer Takt, damit der lila Update-Knopf im laufenden Betrieb zügig
// erscheint; zusätzlich wird bei Fenster-Fokus geprüft (gedrosselt)
const UPDATE_CHECK_INTERVAL = 15 * 60 * 1000;
const UPDATE_CHECK_MIN_GAP = 5 * 60 * 1000;
const appStartedAt = Date.now();
let updateNotifiedFor = null;
// Gefundenes, noch nicht installiertes Update — speist den lila
// "Update verfügbar"-Knopf in der Top-Bar (App läuft oft tagelang durch)
let pendingUpdate = null;
let updateDialogOpen = false;
let updateWin = null;
let updateForced = false;      // erzwungenes Update: Hauptfenster gesperrt, kein "Später"
let allowForcedClose = false;  // Notausgang bei Fehler erlaubt das Schließen
let updateForcedShownFor = null; // erzwungenes Popup je Version nur einmal pro App-Lauf
let downloadWatchdog = null;   // fängt einen hängenden Download ab (kein Aussperren)
function armDownloadWatchdog() {
  clearDownloadWatchdog();
  downloadWatchdog = setTimeout(() => { sendUpdateState({ mode: 'error' }); }, 3 * 60 * 1000);
}
function clearDownloadWatchdog() { if (downloadWatchdog) { clearTimeout(downloadWatchdog); downloadWatchdog = null; } }

// Lila Update-Popup (update.html). Ein Fenster für alle Zustände:
// Update-Hinweis mit Release-Notes, Download-Fortschritt, Konfetti nach dem Update.
function openUpdatePopup(payload) {
  if (updateWin) {
    updateWin.focus();
    return;
  }
  updateDialogOpen = true;
  updateForced = !!(payload && payload.forced);
  allowForcedClose = false;
  // Das Popup ist ein Kindfenster des Hauptfensters: ist das nur versteckt
  // (Mac, Schließen = Verstecken), erst wieder zeigen, sonst bleibt es unsichtbar
  if (win && !win.isDestroyed() && !win.isVisible()) win.show();
  // Erzwungen: das Popup deckt das GANZE Fenster ab (dunkler Schleier + Karte,
  // in update.html) und fängt alle Klicks ab -> die Apps dahinter sind blockiert,
  // OHNE das Hauptfenster per setEnabled zu sperren. Genau dieses Sperren erzeugte
  // auf macOS den weißen Schleier und machte das Popup selbst unbedienbar. Sonst:
  // kleine Karte mittig.
  const cb = win && !win.isDestroyed() ? win.getContentBounds() : null;
  let bounds;
  if (updateForced && cb) {
    bounds = { x: cb.x, y: cb.y, width: cb.width, height: cb.height };
  } else {
    // Fenster großzügiger als die Karte (400 breit), damit der weiche Schatten
    // ringsum ausläuft statt am Fensterrand hart abgeschnitten zu werden
    const width = 560, height = 720;
    bounds = cb
      ? { x: Math.round(cb.x + (cb.width - width) / 2), y: Math.round(cb.y + (cb.height - height) / 2), width, height }
      : { width, height };
  }
  updateWin = new BrowserWindow({
    ...bounds,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
    alwaysOnTop: updateForced,
    // Erzwungen KEIN parent: macOS koppelt ein Kindfenster an den gesperrten
    // Zustand des Elternfensters (auch wenn wir nicht mehr setEnabled nutzen).
    parent: (win && !win.isDestroyed() && !updateForced) ? win : undefined,
    webPreferences: { preload: path.join(__dirname, 'update-preload.js') },
  });
  updateWin.on('close', (e) => {
    // Nicht schließbar, solange erzwungen – außer der Nutzer hat den Notausgang
    // bei einem Fehler bestätigt oder die App wird gerade beendet (Update-Neustart)
    if (updateForced && !allowForcedClose && !quitting) e.preventDefault();
  });
  // Ohne Elternfenster (s.o.) wandert das Popup NICHT mit, wenn man Verti
  // verschiebt oder in der Größe ändert – der dunkle Schleier blieb dann an der
  // alten Stelle liegen und war vom Fenster abgekoppelt (29.08.2026 beobachtet,
  // Verti wurde während des Ladens verschoben). Deshalb von Hand nachführen.
  const folgeFenster = () => {
    if (!updateWin || updateWin.isDestroyed() || !win || win.isDestroyed()) return;
    const b = win.getContentBounds();
    try {
      if (updateForced) {
        updateWin.setBounds({ x: b.x, y: b.y, width: b.width, height: b.height });
      } else {
        const s = updateWin.getBounds();
        updateWin.setBounds({
          x: Math.round(b.x + (b.width - s.width) / 2),
          y: Math.round(b.y + (b.height - s.height) / 2),
          width: s.width, height: s.height,
        });
      }
    } catch (e) {}
  };
  if (win && !win.isDestroyed()) {
    win.on('move', folgeFenster);
    win.on('resize', folgeFenster);
  }

  updateWin.loadFile('update.html');
  updateWin.webContents.once('did-finish-load', () => {
    if (!updateWin) return;
    updateWin.webContents.send('verti-update:state', payload);
    folgeFenster(); // Fenster kann während des Ladens verschoben worden sein
    updateWin.show();
  });
  updateWin.on('closed', () => {
    if (win && !win.isDestroyed()) {
      win.off('move', folgeFenster);
      win.off('resize', folgeFenster);
    }
    updateWin = null;
    updateDialogOpen = false;
    updateForced = false;
    allowForcedClose = false;
    clearDownloadWatchdog();
    if (win && !win.isDestroyed()) { try { win.setEnabled(true); } catch (e) {} }
  });
}

// Erzwungenes Update: das blockierende Popup erscheint, sobald ein Update
// vorliegt UND das Fenster sichtbar ist – nicht mehr nur in den ersten 90 s nach
// Prozessstart. (Auf dem Mac läuft Verti durch, das Fenster wird beim Schließen
// nur versteckt, darum kam das erzwungene Popup früher praktisch nie.) Je Version
// nur einmal pro App-Lauf; beim nächsten Nach-vorn-Holen greift es erneut.
function maybeForceUpdate() {
  if (!pendingUpdate || updateDialogOpen) return;
  if (updateForcedShownFor === pendingUpdate.version) return;
  if (!win || win.isDestroyed() || !win.isVisible() || win.isMinimized()) return;
  updateForcedShownFor = pendingUpdate.version;
  openUpdatePopup({ ...pendingUpdate, forced: true });
}

function sendUpdateState(payload) {
  if (updateWin && !updateWin.isDestroyed()) updateWin.webContents.send('verti-update:state', payload);
}

ipcMain.on('verti-update:action', (_e, action) => {
  if (action === 'update') {
    sendUpdateState({ mode: 'downloading', percent: 0 });
    if (updateForced) armDownloadWatchdog();
    getAutoUpdater().downloadUpdate().catch(() => {
      // Beim nächsten Check wieder anbieten
      updateNotifiedFor = null;
      clearDownloadWatchdog();
      sendUpdateState({ mode: 'error' });
    });
    return;
  }
  if (action === 'defer') {
    // Notausgang bei erzwungenem Update, wenn es (z. B. offline) nicht klappt:
    // Sperre lösen, Popup schließen; beim nächsten Start greift die Sperre erneut
    allowForcedClose = true;
    if (updateWin) updateWin.close();
    return;
  }
  if (updateWin) updateWin.close();
});

// Erster Start nach einem Update? Dann gibt es Konfetti. Erkannt über eine
// Marker-Datei mit der zuletzt gestarteten Version; beim allerersten Lauf der
// Marker-Datei zählt eine bestehende Installation (vorhandene Session-Daten)
// als frisches Update. Muss vor createWindow laufen, das legt die Session an.
function detectUpdateJustHappened() {
  if (!app.isPackaged) return false;
  const file = path.join(app.getPath('userData'), 'last-version.json');
  let prev = null;
  try {
    prev = JSON.parse(fs.readFileSync(file, 'utf8')).version;
  } catch {}
  const cur = app.getVersion();
  if (prev === cur) return false;
  try {
    fs.writeFileSync(file, JSON.stringify({ version: cur }));
  } catch {}
  if (prev) return isNewerVersion(cur, prev);
  return fs.existsSync(path.join(app.getPath('userData'), 'Partitions'));
}

function isNewerVersion(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d > 0;
  }
  return false;
}

function getAutoUpdater() {
  const { autoUpdater } = require('electron-updater');
  return autoUpdater;
}

// Release-Notes für den Dialog aufbereiten: electron-updater liefert HTML
// (aus dem Markdown des GitHub-Release), die GitHub-API rohes Markdown
function releaseNotesText(notes) {
  const raw = typeof notes === 'string' ? notes : Array.isArray(notes) ? notes.map((n) => n && n.note).filter(Boolean).join('\n') : '';
  return raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|ul|ol|h[1-6])>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/^[-*] /gm, '• ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function setupAutoUpdate() {
  if (!app.isPackaged) return; // im Entwicklungsmodus (npm start) nichts tun
  const autoUpdater = getAutoUpdater();
  // Erst fragen, dann laden: der Nutzer soll sehen, was sich ändert,
  // und das Update aktiv anstoßen statt es still im Hintergrund zu bekommen
  autoUpdater.autoDownload = false;
  // Nie still beim App-Beenden installieren: wird der Installer vom
  // Windows-Shutdown abgewürgt, bleibt eine kaputte Installation zurück
  // (electron-builder #7807). Installiert wird nur über 'Jetzt neu starten'.
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.on('error', () => {});
  autoUpdater.on('update-available', (info) => {
    pendingUpdate = { mode: 'available', version: info.version, notes: releaseNotesText(info.releaseNotes) };
    if (win && !win.isDestroyed()) win.webContents.send('update-pill', pendingUpdate.version);
    maybeForceUpdate();
  });
  autoUpdater.on('download-progress', (p) => {
    if (updateForced) armDownloadWatchdog();
    sendUpdateState({ mode: 'downloading', percent: p.percent });
  });
  autoUpdater.on('update-downloaded', () => {
    // Download passiert nur nach Klick auf 'Jetzt aktualisieren',
    // der Neustart ist also schon abgesegnet
    clearDownloadWatchdog();
    sendUpdateState({ mode: 'installing' });
    setTimeout(() => {
      quitting = true;
      autoUpdater.quitAndInstall();
      // Sicherheitsnetz: hängt das Beenden doch (z. B. an einer Seite), nach
      // 10 s hart nachhelfen – der Installer hat die neue Version dann schon
      // vorbereitet und übernimmt beim Neustart
      setTimeout(() => { try { app.exit(0); } catch (e) {} }, 10000);
    }, 1500);
  });
  let lastCheck = 0;
  const throttledCheck = () => {
    if (Date.now() - lastCheck < UPDATE_CHECK_MIN_GAP) return;
    lastCheck = Date.now();
    autoUpdater.checkForUpdates().catch(() => {});
  };
  throttledCheck();
  setInterval(throttledCheck, UPDATE_CHECK_INTERVAL);
  if (win && !win.isDestroyed()) {
    // Beim Nach-vorn-Holen (Mac: Fenster war nur versteckt) neu prüfen und ein
    // wartendes Update sofort erzwingen
    win.on('focus', () => { throttledCheck(); maybeForceUpdate(); });
    win.on('show', maybeForceUpdate);
    win.on('restore', maybeForceUpdate);
  }
}

async function checkForUpdatesManually() {
  if (!app.isPackaged) {
    dialog.showMessageBox(win, { message: 'Update-Suche gibt es nur in der installierten App.' });
    return;
  }
  const autoUpdater = getAutoUpdater();
  try {
    // Update-Popup auch dann wieder zeigen, wenn es schon mal kam
    updateNotifiedFor = null; updateForcedShownFor = null;
    const result = await autoUpdater.checkForUpdates();
    const v = result?.updateInfo?.version;
    if (!v || !isNewerVersion(v, app.getVersion())) {
      dialog.showMessageBox(win, { message: `Verti ${app.getVersion()} ist aktuell.` });
      return;
    }
    // Manuell gesucht → Popup direkt öffnen ('update-available' hat
    // pendingUpdate gerade befüllt)
    if (pendingUpdate && !updateDialogOpen) openUpdatePopup(pendingUpdate);
  } catch {
    dialog.showMessageBox(win, { message: 'Update-Suche fehlgeschlagen. Bitte später erneut versuchen.' });
  }
}

app.whenReady().then(async () => {
  // castLabs ECS (Electron for Content Security, seit 1.0.21 für Spotify/DRM):
  // Widevine-CDM installieren bzw. aktualisieren, bevor Views entstehen.
  // components gibt es nur im castLabs-Build; mit normalem Electron wird
  // der Block übersprungen.
  const { components } = require('electron');
  if (components) {
    try { await components.whenReady(); } catch (e) { console.error('Widevine-CDM:', e); }
  }
  // Fallback-UA für alle WebContents ohne eigenen Override (v.a. Login-Popups):
  // sonst meldet navigator.userAgent dort Electron und Google blockt den Login
  app.userAgentFallback = chromeUserAgent();
  // Windows: AppUserModelID muss der appId entsprechen, sonst funktionieren Benachrichtigungen nicht sauber
  if (!isMac) app.setAppUserModelId('rocks.imperio.verti');
  if (app.isPackaged) {
    app.setLoginItemSettings({ openAtLogin: true });
  }
  const justUpdated = detectUpdateJustHappened();
  createWindow();
  buildMenu();
  setupAutoUpdate();
  cleanupUpdateCache();
  powerMonitor.on('resume', () => {
    // Aufwachen aus dem Schlaf: alle Ansichten als „muss neu laden" markieren,
    // die gerade sichtbare sofort neu laden, die übrigen beim nächsten Öffnen.
    for (const vid of Object.keys(views)) if (vid !== BROWSER_ID) staleViews.add(vid);
    for (const k of browserTabs.keys()) staleBrowserTabs.add(k);
    if (activeId === BROWSER_ID) {
      if (browserActive && staleBrowserTabs.delete(browserActive)) reloadWc(browserTabs.get(browserActive) && browserTabs.get(browserActive).webContents);
    } else if (activeId && staleViews.delete(activeId)) {
      reloadWc(views[activeId] && views[activeId].webContents);
    }
  });
  if (justUpdated) {
    // Kurz warten, bis das Hauptfenster steht, dann Konfetti
    setTimeout(() => openUpdatePopup({ mode: 'celebrate', version: app.getVersion() }), 900);
  }

  app.on('activate', () => {
    if (win === null || BrowserWindow.getAllWindows().length === 0) {
      Object.keys(views).forEach((k) => delete views[k]);
      createWindow();
    } else if (win) {
      win.show();
    }
  });
});

app.on('window-all-closed', () => {
  // Mac: kommt praktisch nicht vor (Schließen versteckt nur, s. createWindow);
  // unter Windows/Linux beendet Fenster-Schließen die App
  if (!isMac) app.quit();
});
