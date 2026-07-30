const https = require('https');
const http = require('http');
let puppeteer = null;
let stealth = null;
try { 
  puppeteer = require('puppeteer'); 
} catch (_) { puppeteer = null; }
// puppeteer-extra-plugin-stealth : rend le navigateur indétectable par les anti-bots
try {
  const extra = require('puppeteer-extra');
  const pluginStealth = require('puppeteer-extra-plugin-stealth');
  extra.use(pluginStealth());
  stealth = extra;
} catch (_) { stealth = null; }

class OneXBetScraper {
  constructor() {
    this.baseUrls = {
      '1xbet': process.env.ONEXBET_BASE_URL || process.env.ONE_XBET_BASE_URL || 'https://1xbet.bj'
    };
    this.browser = null;
    // Proxy optionnel : PROXY_URL=http://user:pass@proxy:host:port
    this.proxyUrl = process.env.PROXY_URL || '';
  }

  async init() {
    if (!puppeteer && !stealth) throw new Error('puppeteer non installé');
    const lib = stealth || puppeteer;
    if (!this.browser) {
      const launchArgs = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
        '--window-size=1920,1080'
      ];
      // Proxy optionnel pour contourner le blocage IP de 1xBet sur le cloud
      if (this.proxyUrl) {
        launchArgs.push(`--proxy-server=${this.proxyUrl}`);
      }
      this.browser = await lib.launch({
        headless: stealth ? true : 'new',
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        args: launchArgs,
        defaultViewport: { width: 1920, height: 1080 },
        ignoreHTTPSErrors: true,
      });
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  async _newPage() {
    await this.init();
    const page = await this.browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1366, height: 900 });
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8,ru;q=0.7',
      'Cache-Control': 'no-cache'
    });
    return page;
  }

  _fetchHtml(url, redirects = 0) {
    return new Promise((resolve, reject) => {
      const lib = url.startsWith('http://') ? http : https;
      const req = lib.get(url, {
        timeout: 20000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
          'Cache-Control': 'no-cache'
        }
      }, res => {
        const loc = res.headers.location;
        if (res.statusCode >= 300 && res.statusCode < 400 && loc && redirects < 5) {
          const next = new URL(loc, url).toString();
          res.resume();
          return resolve(this._fetchHtml(next, redirects + 1));
        }
        let data = '';
        res.setEncoding('utf8');
        res.on('data', c => data += c);
        res.on('end', () => resolve({ html: data, finalUrl: url, statusCode: res.statusCode }));
      });
      req.on('timeout', () => { req.destroy(new Error('Timeout HTML bookmaker')); });
      req.on('error', reject);
    });
  }

  _decodeHtml(s) {
    return String(s || '')
      .replace(/&quot;/g, '"').replace(/&#34;/g, '"')
      .replace(/&amp;/g, '&').replace(/&#38;/g, '&')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&#39;/g, "'").replace(/&apos;/g, "'")
      .replace(/\s+/g, ' ').trim();
  }

  _eventIdFromUrl(url) {
    const m = String(url || '').match(/\/(\d+)-[^/]*$/);
    return m ? m[1] : null;
  }

  _statusFromStartDate(startDate) {
    const t = Date.parse(startDate || '');
    if (!Number.isFinite(t)) return 'scheduled';
    const now = Date.now();
    // Si la rencontre n'a pas encore commencé → à venir
    if (t > now) return 'scheduled';
    // Si elle a commencé → "live". On ne filtre JAMAIS comme "finished" ici :
    // la page live de 1xBet ne montre que les matchs en cours ou à venir.
    // Si un match est fini, il disparaît de la page de lui-même.
    return 'live';
  }

  _parseJsonLdSportsEvents(html, game, bookmaker, pageUrl) {
    const out = [];
    const scripts = String(html || '').match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) || [];
    const visit = (node) => {
      if (!node) return;
      if (Array.isArray(node)) return node.forEach(visit);
      if (typeof node !== 'object') return;
      if (node['@type'] === 'SportsEvent') {
        const home = this._decodeHtml(node.homeTeam?.name || '').trim();
        const away = this._decodeHtml(node.awayTeam?.name || '').trim();
        if (!home || !away || home === away) return;
        const status = this._statusFromStartDate(node.startDate);
        out.push({
          officialId: this._eventIdFromUrl(node.url) || node.identifier || `${bookmaker}:${game}:${home}:${away}:${node.startDate || ''}`,
          home,
          away,
          game,
          bookmaker,
          status,
          startTime: node.startDate || null,
          marketUrl: node.url || pageUrl,
          competition: node.organizer?.name || null
        });
        return;
      }
      Object.values(node).forEach(visit);
    };

    scripts.forEach(tag => {
      const raw = tag.replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, '').trim();
      if (!raw) return;
      try { visit(JSON.parse(raw)); } catch (_) {}
    });

    const unique = new Map();
    out.forEach(e => {
      const key = `${e.bookmaker}:${e.officialId}:${e.home}:${e.away}:${e.startTime || ''}`;
      if (!unique.has(key)) unique.set(key, e);
    });
    return [...unique.values()];
  }

  async fetchResults(game) {
    // Les résultats restent alimentés par Telegram/storage dans server.js.
    // Aucune source secondaire inutile n'est appelée ici.
    console.log(`ℹ️ Résultats officiels 1xBet non utilisés pour ${game} : conservation des flux Telegram/storage.`);
    return [];
  }

  async fetchUpcoming(game, bookmaker = '1xbet') {
    bookmaker = '1xbet';
    const urls = this._getUrlsForGame(game, 'upcoming', bookmaker);
    const allEvents = [];

    // On essaie plusieurs URLs : line (à venir) puis live (en cours).
    // Les matchs déjà terminés sont filtrés par _statusFromStartDate.
    for (const targetUrl of urls) {
      console.log(`Scraping calendrier 1xbet ${game}: ${targetUrl}`);
      let events = [];

      // 1) Lecture HTML simple : 1xBet expose les rencontres dans JSON-LD SportsEvent.
      try {
        const { html, finalUrl, statusCode } = await this._fetchHtml(targetUrl);
        if (/\/block(?:$|[?#/])/i.test(finalUrl) || /\/block(?:["'<\s]|$)/i.test(html)) {
          console.warn(`⚠️ 1xBet bloque l'accès calendrier (${game}) : ${finalUrl}`);
          continue;
        }
        events = this._parseJsonLdSportsEvents(html, game, bookmaker, targetUrl);
        if (events.length) {
          console.log(`✅ 1xbet ${game}: ${events.length} rencontre(s) JSON-LD sur ${targetUrl}`);
        }
        if (!events.length && statusCode >= 400) console.warn(`⚠️ 1xbet ${game}: HTTP ${statusCode} sur ${targetUrl}`);
      } catch (e) {
        console.warn(`⚠️ Lecture HTML simple impossible (1xbet ${game} ${targetUrl}): ${e.message}`);
      }

      // 2) Fallback navigateur si disponible et aucun résultat HTML.
      if (!events.length && puppeteer) {
        try {
          const page = await this._newPage();
          try {
            await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 30000 });
            await page.waitForSelector('body', { timeout: 10000 });
            const finalUrl = page.url();
            if (/\/block(?:$|[?#/])/i.test(finalUrl)) {
              console.warn(`⚠️ 1xBet bloque l'accès calendrier (${game}) : ${finalUrl}`);
            } else {
              const html = await page.content();
              events = this._parseJsonLdSportsEvents(html, game, bookmaker, targetUrl);
              if (events.length) console.log(`✅ 1xbet ${game}: ${events.length} rencontre(s) via Puppeteer sur ${targetUrl}`);
            }
          } catch (err) {
            console.error(`Erreur scraping Puppeteer 1xbet ${game}: ${err.message}`);
          } finally {
            await page.close();
          }
        } catch (e) { /* browser launch failed */ }
      } else if (!events.length && !puppeteer) {
        console.warn(`⚠️ puppeteer non installé et aucun JSON-LD détecté pour 1xbet ${game} sur ${targetUrl}.`);
      }

      allEvents.push(...events);
    }

    // Déduplication finale par officialId + teams + startTime
    const unique = new Map();
    allEvents.forEach(e => {
      const key = `${e.bookmaker}:${e.officialId}:${e.home}:${e.away}:${e.startTime || ''}`;
      if (!unique.has(key)) unique.set(key, e);
    });
    return [...unique.values()];
  }

  _getUrlsForGame(game, type, bookmaker = '1xbet') {
    // Possibilité de forcer les URLs exactes sans modifier le code :
    // BOOKMAKER_UPCOMING_URLS='{"penalty18":["https://...","https://..."]}'
    if (type === 'upcoming' && process.env.BOOKMAKER_UPCOMING_URLS) {
      try {
        const cfg = JSON.parse(process.env.BOOKMAKER_UPCOMING_URLS);
        const direct = cfg?.[game]?.['1xbet'] || cfg?.[game];
        if (Array.isArray(direct) && direct.length) return direct;
        if (typeof direct === 'string') return [direct];
      } catch (_) {}
    }

    // IMPORTANT : ces jeux FIFA/Penalty sont des jeux VIRTUELS en continu sur 1xBet.
    // Ils n'ont PAS de page "/fr/line/" (avant-match) — tout est sur "/fr/live/".
    // Les matchs à venir et en cours sont tous listés sur la page live.
    const gameSlugs = {
      fifa4x4:   '2648573-fc-24-4x4-england-championship',
      penalty18: '1939256-fifa18-penalty',
      penalty22: '2334988-fifa22-penalty',
    };
    const slug = gameSlugs[game] || '';
    const base = this.baseUrls['1xbet'];
    // Une seule URL : la page live (contient matchs en cours + à venir)
    return [`${base}/fr/live/fifa/${slug}`];
  }

  // Rétro-compatibilité : ancien nom de méthode
  _getUrlForGame(game, type, bookmaker = '1xbet') {
    const urls = this._getUrlsForGame(game, type, bookmaker);
    return urls[0] || `${this.baseUrls['1xbet']}/fr/live/fifa`;
  }
}

module.exports = new OneXBetScraper();
