const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const { createCursor } = require('ghost-cursor');
const fs = require('fs');

const TARGET_HOTELS = ['Koloa Landing', 'Koa Kea', 'Grand Hyatt Kauai', '1 Hotel Hanalei Bay'];
// Alternate names to search for in results text
const HOTEL_ALIASES = {
  'Koa Kea': ["Koa Kea", "Ko'a Kea", "Ko a Kea", "Koa'Kea"]
};
const START = new Date(2026, 4, 15);
const END = new Date(2026, 5, 15);
const NIGHTS = [6, 7, 8];
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// --- Anti-detection config ---
const MIN_DELAY = 30000;  // 30s min between searches
const MAX_DELAY = 60000;  // 60s max
const PROXY = process.env.PROXY_URL || null; // e.g. socks5://host:port
function randomDelay() { return MIN_DELAY + Math.random() * (MAX_DELAY - MIN_DELAY); }
function humanDelay(min=300, max=800) { return new Promise(r => setTimeout(r, min + Math.random() * (max - min))); }

function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function fmtISO(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }

async function randomScroll(page) {
  const scrolls = 2 + Math.floor(Math.random() * 3);
  for (let i = 0; i < scrolls; i++) {
    const amount = 100 + Math.floor(Math.random() * 400);
    await page.evaluate((a) => window.scrollBy(0, a), amount);
    await humanDelay(200, 600);
  }
}

async function doSearch(page, cursor, checkin, checkout) {
  await page.goto('https://www.costcotravel.com/Hotels', { waitUntil: 'networkidle2', timeout: 60000 });
  await humanDelay(2000, 4000);
  
  // Random initial mouse movement — look around the page like a human
  await cursor.moveTo({ x: 400 + Math.random() * 600, y: 200 + Math.random() * 300 });
  await humanDelay(500, 1500);

  // --- DESTINATION ---
  const destEl = await page.$('#hotelDestination');
  await cursor.click(destEl);
  await humanDelay(300, 600);
  await page.type('#hotelDestination', 'Kauai', { delay: 100 + Math.random() * 100 });
  await humanDelay(3000, 5000);

  // Wait for autocomplete
  for (let i = 0; i < 20; i++) {
    await humanDelay(400, 600);
    const found = await page.evaluate(() => {
      for (const item of document.querySelectorAll('li.destination')) {
        if (item.textContent.includes('Kauai') && item.getBoundingClientRect().height > 0) return true;
      }
      return false;
    });
    if (found) break;
  }

  // Click Kauai with ghost-cursor (human-like path)
  const acRect = await page.evaluate(() => {
    for (const item of document.querySelectorAll('li.destination')) {
      if (item.textContent.includes('Kauai') && item.getBoundingClientRect().height > 0) {
        const r = item.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      }
    }
  });
  if (!acRect) throw new Error('No autocomplete');
  await cursor.moveTo(acRect);
  await humanDelay(100, 300);
  await page.mouse.click(acRect.x, acRect.y);
  await humanDelay(1500, 3000);

  // --- CHECK-IN DATE ---
  const calBtn = await page.evaluate(() => {
    const t = document.querySelectorAll('button.ui-datepicker-trigger');
    for (const b of t) {
      const r = b.getBoundingClientRect();
      if (r.height > 0) {
        const ci = document.getElementById('checkInDateWidget');
        const cr = ci.getBoundingClientRect();
        if (Math.abs(r.y - cr.y) < 30) return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      }
    }
  });
  await cursor.moveTo(calBtn);
  await humanDelay(100, 200);
  await page.mouse.click(calBtn.x, calBtn.y);
  await humanDelay(600, 1000);

  // Navigate to checkin month
  const ciMonth = MONTH_NAMES[checkin.getMonth()];
  for (let i = 0; i < 12; i++) {
    const has = await page.evaluate((m) => {
      const dp = document.getElementById('ui-datepicker-div');
      if (!dp) return false;
      for (const t of dp.querySelectorAll('.ui-datepicker-title')) { if (t.textContent.includes(m)) return true; }
      return false;
    }, ciMonth);
    if (has) break;
    const n = await page.evaluate(() => { const b = document.querySelector('button.ui-datepicker-next'); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    await cursor.moveTo(n);
    await humanDelay(100, 200);
    await page.mouse.click(n.x, n.y);
    await humanDelay(300, 500);
  }

  // Click checkin day
  const ciDay = await page.evaluate((day, month) => {
    const dp = document.getElementById('ui-datepicker-div');
    for (const g of dp.querySelectorAll('.ui-datepicker-group')) {
      const t = g.querySelector('.ui-datepicker-title');
      if (t && t.textContent.includes(month)) {
        for (const a of g.querySelectorAll('td a.ui-state-default')) {
          if (a.textContent.trim() === String(day)) { const r = a.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }
        }
      }
    }
  }, checkin.getDate(), ciMonth);
  await cursor.moveTo(ciDay);
  await humanDelay(100, 200);
  await page.mouse.click(ciDay.x, ciDay.y);
  await humanDelay(1000, 2000);

  // --- CHECK-OUT DATE ---
  await humanDelay(800, 1500);
  const coMonth = MONTH_NAMES[checkout.getMonth()];
  let coDay = await page.evaluate((day, month) => {
    const dp = document.getElementById('ui-datepicker-div');
    if (!dp || dp.style.display === 'none') return null;
    for (const g of dp.querySelectorAll('.ui-datepicker-group')) {
      const t = g.querySelector('.ui-datepicker-title');
      if (t && t.textContent.includes(month)) {
        for (const a of g.querySelectorAll('td a.ui-state-default')) {
          if (a.textContent.trim() === String(day)) { const r = a.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }
        }
      }
    }
    return null;
  }, checkout.getDate(), coMonth);

  if (!coDay) {
    const cal2 = await page.evaluate(() => {
      const t = Array.from(document.querySelectorAll('button.ui-datepicker-trigger')).filter(b => b.getBoundingClientRect().height > 0);
      if (t.length >= 2) { const r = t[1].getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }
    });
    if (cal2) { await cursor.moveTo(cal2); await humanDelay(100, 200); await page.mouse.click(cal2.x, cal2.y); await humanDelay(600, 1000); }
    for (let i = 0; i < 5; i++) {
      const has = await page.evaluate((m) => {
        const dp = document.getElementById('ui-datepicker-div');
        if (!dp) return false;
        for (const t of dp.querySelectorAll('.ui-datepicker-title')) { if (t.textContent.includes(m)) return true; }
        return false;
      }, coMonth);
      if (has) break;
      const n = await page.evaluate(() => { const b = document.querySelector('button.ui-datepicker-next'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
      if (n) { await cursor.moveTo(n); await humanDelay(100, 200); await page.mouse.click(n.x, n.y); await humanDelay(300, 500); }
    }
    coDay = await page.evaluate((day, month) => {
      const dp = document.getElementById('ui-datepicker-div');
      if (!dp) return null;
      for (const g of dp.querySelectorAll('.ui-datepicker-group')) {
        const t = g.querySelector('.ui-datepicker-title');
        if (t && t.textContent.includes(month)) {
          for (const a of g.querySelectorAll('td a.ui-state-default')) {
            if (a.textContent.trim() === String(day)) { const r = a.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }
          }
        }
      }
      return null;
    }, checkout.getDate(), coMonth);
  }
  if (coDay) { await cursor.moveTo(coDay); await humanDelay(100, 200); await page.mouse.click(coDay.x, coDay.y); await humanDelay(1000, 2000); }

  // Small random scroll before clicking search
  await randomScroll(page);
  await humanDelay(500, 1000);

  // --- CLICK SEARCH ---
  const sb = await page.evaluate(() => {
    for (const b of document.querySelectorAll('button')) {
      if (b.textContent.trim() === 'Search' && b.offsetParent !== null) {
        const r = b.getBoundingClientRect();
        if (r.width > 0) return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      }
    }
  });
  if (!sb) throw new Error('No search button');
  await cursor.moveTo(sb);
  await humanDelay(200, 400);
  await page.mouse.click(sb.x, sb.y);

  // Wait for results
  try { await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }); } catch (e) {}
  await humanDelay(8000, 12000);

  // Scroll like a human browsing results
  for (let i = 0; i < 10; i++) {
    try { await page.evaluate(() => window.scrollBy(0, 400 + Math.random() * 400)); } catch (e) { break; }
    await humanDelay(400, 800);
  }
  await humanDelay(2000, 4000);

  return await page.evaluate(() => document.body.innerText);
}

function extractAll(text) {
  const results = [];
  for (const hotel of TARGET_HOTELS) {
    // Try main name and aliases
    const names = [hotel, ...(HOTEL_ALIASES[hotel] || [])];
    let idx = -1;
    for (const name of names) {
      idx = text.toLowerCase().indexOf(name.toLowerCase());
      if (idx !== -1) break;
    }
    if (idx === -1) continue;
    const chunk = text.substring(idx, idx + 2000);
    let price = null;
    const totalMatch = chunk.match(/\$([\d,]+\.\d{2})\s*\n\s*Total Price/);
    if (totalMatch) price = parseFloat(totalMatch[1].replace(/,/g, ''));
    else {
      const altMatch = chunk.match(/\$([\d,]+\.\d{2})\s*\n?\s*Total Price includes/);
      if (altMatch) price = parseFloat(altMatch[1].replace(/,/g, ''));
      else {
        const prices = [...chunk.matchAll(/\$([\d,]+\.\d{2})/g)].map(m => parseFloat(m[1].replace(/,/g, ''))).filter(p => p > 500);
        if (prices.length) price = prices[prices.length - 1];
      }
    }
    let perTraveler = null;
    const ptMatch = chunk.match(/\$([\d,]+\.\d{2})\s*\n\s*Per traveler/);
    if (ptMatch) perTraveler = parseFloat(ptMatch[1].replace(/,/g, ''));
    let shopCard = null;
    const scMatch = chunk.match(/USD\s*([\d,]+)\s*Digital Costco Shop Card/i);
    if (scMatch) shopCard = parseInt(scMatch[1].replace(/,/g, ''));
    let extras = '';
    const extrasMatch = chunk.match(/Included Extras\s*\n([\s\S]*?)(?=View Details|Mandatory|$)/);
    if (extrasMatch) extras = extrasMatch[1].trim().replace(/\n+/g, ' | ');
    let resortFee = '';
    const feeMatch = chunk.match(/(Mandatory.*?resort fee.*?)(?:\n|View|$)/i);
    if (feeMatch) resortFee = feeMatch[1].trim();
    else if (chunk.toLowerCase().includes('resort fee included')) resortFee = 'Resort fee included';
    let packageIncludes = '';
    const pkgMatch = chunk.match(/Package Includes:(.*?)(?:\n|Options)/);
    if (pkgMatch) packageIncludes = pkgMatch[1].trim();
    let roomType = '';
    const roomMatch = chunk.match(/Reviews\)\s*\n\s*(.*?)\s*\n\s*Map/);
    if (roomMatch) roomType = roomMatch[1].trim();
    const recommended = chunk.includes('COSTCO RECOMMENDS');
    if (price) results.push({ hotel, price, perTraveler, shopCard, extras, resortFee, packageIncludes, roomType, recommended });
  }
  return results;
}

(async () => {
  console.log('🌺 Kauai Hotel Scraper v2 — Stealth + Ghost Cursor + Slow Pacing\n');

  const args = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--window-size=1920,1080'];
  if (PROXY) { args.push(`--proxy-server=${PROXY}`); console.log(`Using proxy: ${PROXY}`); }

  const browser = await puppeteer.launch({ headless: 'new', executablePath: '/usr/bin/chromium', args });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  const cursor = createCursor(page);

  let allResults = [];
  try { allResults = JSON.parse(fs.readFileSync('prices.json', 'utf-8')); } catch (e) {}
  const done = new Set(allResults.map(r => `${r.checkin}_${r.nights}`));

  let searchNum = 0, consecutiveFails = 0, totalSuccess = 0;
  const total = NIGHTS.reduce((sum, n) => { let c = 0, d = new Date(START); while (addDays(d, n) <= END) { c++; d = addDays(d, 1); } return sum + c; }, 0);

  for (const nights of NIGHTS) {
    let checkin = new Date(START);
    while (true) {
      const checkout = addDays(checkin, nights);
      if (checkout > END) break;
      searchNum++;
      const key = `${fmtISO(checkin)}_${nights}`;
      if (done.has(key)) { checkin = addDays(checkin, 1); continue; }

      console.log(`[${searchNum}/${total}] ${fmtISO(checkin)} → ${fmtISO(checkout)} (${nights}N)`);
      let success = false;
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const text = await doSearch(page, cursor, checkin, checkout);
          const extracted = extractAll(text);
          for (const item of extracted) {
            allResults.push({
              checkin: fmtISO(checkin), checkout: fmtISO(checkout), nights,
              hotel: item.hotel, price: item.price, perNight: Math.round(item.price / nights),
              perTraveler: item.perTraveler, shopCard: item.shopCard, extras: item.extras,
              resortFee: item.resortFee, packageIncludes: item.packageIncludes,
              roomType: item.roomType, recommended: item.recommended
            });
            let line = `  ✓ ${item.hotel}: $${item.price.toLocaleString()} ($${Math.round(item.price / nights)}/night)`;
            if (item.shopCard) line += ` | $${item.shopCard} Shop Card`;
            console.log(line);
          }
          const missing = TARGET_HOTELS.filter(h => !extracted.find(e => e.hotel === h));
          if (missing.length) console.log(`  ✗ Missing: ${missing.join(', ')}`);
          fs.writeFileSync('prices.json', JSON.stringify(allResults, null, 2));
          success = true; consecutiveFails = 0; totalSuccess++; break;
        } catch (e) {
          console.log(`  Attempt ${attempt}: ${e.message}`);
          await humanDelay(5000, 8000);
        }
      }
      if (!success) {
        consecutiveFails++;
        if (consecutiveFails >= 5) { console.log(`\n5 consecutive failures after ${totalSuccess} successful searches. Stopping.`); break; }
      }

      const delay = randomDelay();
      console.log(`  (waiting ${Math.round(delay/1000)}s)`);
      await new Promise(r => setTimeout(r, delay));
      checkin = addDays(checkin, 1);
    }
    if (consecutiveFails >= 5) break;
  }

  console.log(`\n=== DONE: ${allResults.length} prices (${totalSuccess} new searches) ===\n`);
  for (const hotel of TARGET_HOTELS) {
    const hp = allResults.filter(r => r.hotel === hotel).sort((a, b) => a.price - b.price);
    if (hp.length) { const b = hp[0]; console.log(`🏆 ${hotel}: $${b.price.toLocaleString()} ($${b.perNight}/night) — ${b.checkin} → ${b.checkout} (${b.nights}N)`); }
    else console.log(`❌ ${hotel}: No prices found`);
  }
  await browser.close();
})();
