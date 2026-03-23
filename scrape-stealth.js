const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const fs = require('fs');

const TARGET_HOTELS = ['Koloa Landing', 'Koa Kea', 'Grand Hyatt Kauai', '1 Hotel Hanalei Bay'];
const START = new Date(2026, 4, 15);
const END = new Date(2026, 5, 15);
const NIGHTS = [6, 7, 8];
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function fmtISO(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }

async function doSearch(page, checkin, checkout) {
  await page.goto('https://www.costcotravel.com/Hotels', { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(r => setTimeout(r, 3000));

  // Destination
  await page.click('#hotelDestination');
  await page.type('#hotelDestination', 'Kauai', { delay: 150 });
  await new Promise(r => setTimeout(r, 4000));
  const ac = await page.evaluate(() => {
    for (const i of document.querySelectorAll('li.destination')) {
      if (i.textContent.includes('Kauai') && i.getBoundingClientRect().height > 0) {
        const r = i.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      }
    }
  });
  if (!ac) throw new Error('No autocomplete');
  await page.mouse.click(ac.x, ac.y);
  await new Promise(r => setTimeout(r, 2000));

  // Check-in calendar
  const cal = await page.evaluate(() => {
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
  await page.mouse.click(cal.x, cal.y);
  await new Promise(r => setTimeout(r, 800));

  // Navigate to checkin month
  const ciMonth = MONTH_NAMES[checkin.getMonth()];
  for (let i = 0; i < 12; i++) {
    const has = await page.evaluate((m) => {
      const dp = document.getElementById('ui-datepicker-div');
      if (!dp) return false;
      for (const t of dp.querySelectorAll('.ui-datepicker-title')) {
        if (t.textContent.includes(m)) return true;
      }
      return false;
    }, ciMonth);
    if (has) break;
    const n = await page.evaluate(() => { const b = document.querySelector('button.ui-datepicker-next'); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    await page.mouse.click(n.x, n.y);
    await new Promise(r => setTimeout(r, 400));
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
  await page.mouse.click(ciDay.x, ciDay.y);
  await new Promise(r => setTimeout(r, 1500));

  // Checkout
  await new Promise(r => setTimeout(r, 1000));
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
    if (cal2) { await page.mouse.click(cal2.x, cal2.y); await new Promise(r => setTimeout(r, 800)); }
    // Navigate if needed
    for (let i = 0; i < 5; i++) {
      const has = await page.evaluate((m) => {
        const dp = document.getElementById('ui-datepicker-div');
        if (!dp) return false;
        for (const t of dp.querySelectorAll('.ui-datepicker-title')) { if (t.textContent.includes(m)) return true; }
        return false;
      }, coMonth);
      if (has) break;
      const n = await page.evaluate(() => { const b = document.querySelector('button.ui-datepicker-next'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
      if (n) { await page.mouse.click(n.x, n.y); await new Promise(r => setTimeout(r, 400)); }
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
  if (coDay) { await page.mouse.click(coDay.x, coDay.y); await new Promise(r => setTimeout(r, 1500)); }

  // Click search
  const sb = await page.evaluate(() => {
    for (const b of document.querySelectorAll('button')) {
      if (b.textContent.trim() === 'Search' && b.offsetParent !== null) {
        const r = b.getBoundingClientRect();
        if (r.width > 0) return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      }
    }
  });
  if (!sb) throw new Error('No search button');
  await page.mouse.click(sb.x, sb.y);

  // Wait for navigation + results
  try { await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 45000 }); } catch (e) {}
  await new Promise(r => setTimeout(r, 10000));

  // Scroll
  for (let i = 0; i < 6; i++) {
    try { await page.evaluate(() => window.scrollBy(0, 600)); } catch (e) { break; }
    await new Promise(r => setTimeout(r, 500));
  }
  await new Promise(r => setTimeout(r, 3000));

  return await page.evaluate(() => document.body.innerText);
}

function extractPrices(text) {
  const results = {};
  for (const hotel of TARGET_HOTELS) {
    const idx = text.toLowerCase().indexOf(hotel.toLowerCase());
    if (idx === -1) continue;
    const chunk = text.substring(idx, idx + 1500);
    const totalMatch = chunk.match(/\$([\d,]+\.\d{2})\s*\n\s*Total Price/);
    if (totalMatch) { results[hotel] = parseFloat(totalMatch[1].replace(/,/g, '')); continue; }
    const altMatch = chunk.match(/\$([\d,]+\.\d{2})\s*\n?\s*Total Price includes/);
    if (altMatch) { results[hotel] = parseFloat(altMatch[1].replace(/,/g, '')); continue; }
    const prices = [...chunk.matchAll(/\$([\d,]+\.\d{2})/g)].map(m => parseFloat(m[1].replace(/,/g, ''))).filter(p => p > 500);
    if (prices.length) results[hotel] = prices[prices.length - 1];
  }
  return results;
}

(async () => {
  console.log('🌺 Kauai Hotel Scraper — Costco Travel (stealth mode)\n');

  const browser = await puppeteer.launch({
    headless: 'new', executablePath: '/usr/bin/chromium',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--window-size=1920,1080']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  let allResults = [];
  try { allResults = JSON.parse(fs.readFileSync('prices.json', 'utf-8')); } catch (e) {}
  const done = new Set(allResults.map(r => `${r.checkin}_${r.nights}`));

  let searchNum = 0, consecutiveFails = 0;
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
          const text = await doSearch(page, checkin, checkout);
          const prices = extractPrices(text);
          for (const [hotel, price] of Object.entries(prices)) {
            allResults.push({ checkin: fmtISO(checkin), checkout: fmtISO(checkout), nights, hotel, price, perNight: Math.round(price / nights) });
            console.log(`  ✓ ${hotel}: $${price.toLocaleString()} ($${Math.round(price / nights)}/night)`);
          }
          const missing = TARGET_HOTELS.filter(h => !prices[h]);
          if (missing.length) console.log(`  ✗ Missing: ${missing.join(', ')}`);
          fs.writeFileSync('prices.json', JSON.stringify(allResults, null, 2));
          success = true; consecutiveFails = 0; break;
        } catch (e) {
          console.log(`  Attempt ${attempt}: ${e.message}`);
          await new Promise(r => setTimeout(r, 3000));
        }
      }
      if (!success) { consecutiveFails++; if (consecutiveFails >= 5) { console.log('5 consecutive failures. Stopping.'); break; } }
      await new Promise(r => setTimeout(r, 2000));
      checkin = addDays(checkin, 1);
    }
    if (consecutiveFails >= 5) break;
  }

  console.log(`\n=== DONE: ${allResults.length} prices ===\n`);
  for (const hotel of TARGET_HOTELS) {
    const hp = allResults.filter(r => r.hotel === hotel).sort((a, b) => a.price - b.price);
    if (hp.length) { const b = hp[0]; console.log(`🏆 ${hotel}: $${b.price.toLocaleString()} ($${b.perNight}/night) — ${b.checkin} → ${b.checkout} (${b.nights}N)`); }
    else console.log(`❌ ${hotel}: No prices found`);
  }
  await browser.close();
})();
