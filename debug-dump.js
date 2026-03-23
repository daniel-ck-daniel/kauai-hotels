const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const { createCursor } = require('ghost-cursor');
const fs = require('fs');

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function humanDelay(min=300, max=800) { return new Promise(r => setTimeout(r, min + Math.random() * (max - min))); }

(async () => {
  const browser = await puppeteer.launch({ headless: false, args: ['--window-size=1920,1080'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  const cursor = createCursor(page);

  await page.goto('https://www.costcotravel.com/Hotels', { waitUntil: 'networkidle2', timeout: 60000 });
  await humanDelay(2000, 3000);

  // Destination
  const destEl = await page.$('#hotelDestination');
  await cursor.click(destEl);
  await humanDelay(300, 600);
  await page.type('#hotelDestination', 'Kauai', { delay: 120 });
  await humanDelay(3000, 5000);

  const ac = await page.evaluate(() => {
    for (const i of document.querySelectorAll('li.destination')) {
      if (i.textContent.includes('Kauai') && i.getBoundingClientRect().height > 0) {
        const r = i.getBoundingClientRect(); return { x: r.x + r.width/2, y: r.y + r.height/2 };
      }
    }
  });
  await cursor.moveTo(ac);
  await humanDelay(100, 200);
  await page.mouse.click(ac.x, ac.y);
  await humanDelay(1500, 2500);

  // Check-in: May 16
  const calBtn = await page.evaluate(() => {
    const t = document.querySelectorAll('button.ui-datepicker-trigger');
    for (const b of t) { const r = b.getBoundingClientRect(); if (r.height > 0) { const ci = document.getElementById('checkInDateWidget'); const cr = ci.getBoundingClientRect(); if (Math.abs(r.y - cr.y) < 30) return { x: r.x + r.width/2, y: r.y + r.height/2 }; } }
  });
  await cursor.moveTo(calBtn);
  await humanDelay(100, 200);
  await page.mouse.click(calBtn.x, calBtn.y);
  await humanDelay(600, 1000);

  for (let i = 0; i < 12; i++) {
    const has = await page.evaluate(() => { const dp = document.getElementById('ui-datepicker-div'); if (!dp) return false; for (const t of dp.querySelectorAll('.ui-datepicker-title')) { if (t.textContent.includes('May')) return true; } return false; });
    if (has) break;
    const n = await page.evaluate(() => { const b = document.querySelector('button.ui-datepicker-next'); const r = b.getBoundingClientRect(); return { x: r.x + r.width/2, y: r.y + r.height/2 }; });
    await cursor.moveTo(n);
    await humanDelay(100, 200);
    await page.mouse.click(n.x, n.y);
    await humanDelay(300, 500);
  }

  const d16 = await page.evaluate(() => { const dp = document.getElementById('ui-datepicker-div'); for (const g of dp.querySelectorAll('.ui-datepicker-group')) { const t = g.querySelector('.ui-datepicker-title'); if (t && t.textContent.includes('May')) { for (const a of g.querySelectorAll('td a.ui-state-default')) { if (a.textContent.trim() === '16') { const r = a.getBoundingClientRect(); return { x: r.x + r.width/2, y: r.y + r.height/2 }; } } } } });
  await cursor.moveTo(d16);
  await humanDelay(100, 200);
  await page.mouse.click(d16.x, d16.y);
  await humanDelay(1000, 2000);

  // Check-out: May 22
  await humanDelay(800, 1200);
  let d22 = await page.evaluate(() => { const dp = document.getElementById('ui-datepicker-div'); if (!dp || dp.style.display === 'none') return null; for (const g of dp.querySelectorAll('.ui-datepicker-group')) { const t = g.querySelector('.ui-datepicker-title'); if (t && t.textContent.includes('May')) { for (const a of g.querySelectorAll('td a.ui-state-default')) { if (a.textContent.trim() === '22') { const r = a.getBoundingClientRect(); return { x: r.x + r.width/2, y: r.y + r.height/2 }; } } } } return null; });
  if (!d22) {
    const cal2 = await page.evaluate(() => { const t = Array.from(document.querySelectorAll('button.ui-datepicker-trigger')).filter(b => b.getBoundingClientRect().height > 0); if (t.length >= 2) { const r = t[1].getBoundingClientRect(); return { x: r.x + r.width/2, y: r.y + r.height/2 }; } });
    if (cal2) { await cursor.moveTo(cal2); await humanDelay(100, 200); await page.mouse.click(cal2.x, cal2.y); await humanDelay(600, 1000); }
    d22 = await page.evaluate(() => { const dp = document.getElementById('ui-datepicker-div'); if (!dp) return null; for (const g of dp.querySelectorAll('.ui-datepicker-group')) { const t = g.querySelector('.ui-datepicker-title'); if (t && t.textContent.includes('May')) { for (const a of g.querySelectorAll('td a.ui-state-default')) { if (a.textContent.trim() === '22') { const r = a.getBoundingClientRect(); return { x: r.x + r.width/2, y: r.y + r.height/2 }; } } } } return null; });
  }
  if (d22) { await cursor.moveTo(d22); await humanDelay(100, 200); await page.mouse.click(d22.x, d22.y); await humanDelay(1000, 2000); }

  // Click search
  await page.evaluate(() => { for (const b of document.querySelectorAll('button')) { if (b.textContent.trim() === 'Search' && b.offsetParent !== null) { b.scrollIntoView({ block: 'center' }); return; } } });
  await humanDelay(500, 1000);
  const sb = await page.evaluate(() => { for (const b of document.querySelectorAll('button')) { if (b.textContent.trim() === 'Search' && b.offsetParent !== null) { const r = b.getBoundingClientRect(); if (r.width > 0) return { x: r.x + r.width/2, y: r.y + r.height/2 }; } } });
  await cursor.moveTo(sb);
  await humanDelay(200, 400);
  await page.mouse.click(sb.x, sb.y);

  // Wait for results
  console.log('Waiting for results...');
  try { await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }); } catch (e) {}
  await humanDelay(8000, 12000);

  // Scroll to load everything
  for (let i = 0; i < 15; i++) {
    try { await page.evaluate(() => window.scrollBy(0, 600)); } catch (e) { break; }
    await humanDelay(400, 600);
  }
  await humanDelay(3000, 5000);

  // Dump FULL page text
  const text = await page.evaluate(() => document.body.innerText);
  fs.writeFileSync('debug-fulltext.txt', text);
  console.log(`\nFull page text saved to debug-fulltext.txt (${text.length} chars)`);
  console.log('URL:', page.url());

  // Also dump just the chunks around each hotel
  for (const hotel of ['Koloa Landing', 'Koa Kea', "Ko\u02BBa Kea", "Ko`a Kea", 'Grand Hyatt Kauai', '1 Hotel Hanalei Bay']) {
    const idx = text.toLowerCase().indexOf(hotel.toLowerCase());
    if (idx === -1) continue;
    const chunk = text.substring(idx, idx + 2000);
    console.log(`\n========== ${hotel} (at char ${idx}) ==========`);
    console.log(chunk);
  }

  await browser.close();
})();
