#!/usr/bin/env node
// Run this on your desktop: node costco-scraper.js
// Requires: npm install puppeteer (full, not puppeteer-core — it bundles Chromium)
// Or: npm install puppeteer-core (if you have Chrome/Brave installed)

const puppeteer = require('puppeteer');
const fs = require('fs');

const TARGET_HOTELS = ['Koloa Landing', 'Koa Kea', 'Grand Hyatt Kauai', '1 Hotel Hanalei Bay'];
const START = new Date(2026, 4, 15); // May 15
const END = new Date(2026, 5, 15);   // June 15
const NIGHTS = [6, 7, 8];

function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function fmtISO(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }

async function clickDate(page, day, monthName) {
  const pos = await page.evaluate((day, monthName) => {
    const dp = document.getElementById('ui-datepicker-div');
    if (!dp) return null;
    for (const group of dp.querySelectorAll('.ui-datepicker-group')) {
      const title = group.querySelector('.ui-datepicker-title');
      if (title && title.textContent.includes(monthName)) {
        for (const a of group.querySelectorAll('td a.ui-state-default')) {
          if (a.textContent.trim() === String(day)) {
            const r = a.getBoundingClientRect();
            return { x: r.x + r.width/2, y: r.y + r.height/2 };
          }
        }
      }
    }
    return null;
  }, day, monthName);
  if (pos) await page.mouse.click(pos.x, pos.y);
  return !!pos;
}

async function navigateCalendarTo(page, targetMonth, targetYear) {
  for (let i = 0; i < 15; i++) {
    const current = await page.evaluate(() => {
      const dp = document.getElementById('ui-datepicker-div');
      if (!dp) return null;
      const titles = dp.querySelectorAll('.ui-datepicker-title');
      return Array.from(titles).map(t => t.textContent.trim());
    });
    if (!current) break;
    const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const target = monthNames[targetMonth] + ' ' + targetYear;
    if (current.some(t => t.includes(target))) return true;
    
    const next = await page.evaluate(() => {
      const btn = document.querySelector('button.ui-datepicker-next');
      if (btn && !btn.classList.contains('ui-state-disabled')) {
        const r = btn.getBoundingClientRect();
        return { x: r.x + r.width/2, y: r.y + r.height/2 };
      }
      return null;
    });
    if (!next) break;
    await page.mouse.click(next.x, next.y);
    await new Promise(r => setTimeout(r, 400));
  }
  return false;
}

async function openCalendar(page, fieldId) {
  const trigger = await page.evaluate((fieldId) => {
    const field = document.getElementById(fieldId);
    if (!field) return null;
    const fieldRect = field.getBoundingClientRect();
    const triggers = document.querySelectorAll('button.ui-datepicker-trigger');
    for (const t of triggers) {
      const r = t.getBoundingClientRect();
      if (r.height > 0 && Math.abs(r.y - fieldRect.y) < 30) {
        return { x: r.x + r.width/2, y: r.y + r.height/2 };
      }
    }
    return null;
  }, fieldId);
  if (trigger) {
    await page.mouse.click(trigger.x, trigger.y);
    await new Promise(r => setTimeout(r, 800));
  }
}

async function doSearch(page, checkin, checkout) {
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  
  await page.goto('https://www.costcotravel.com/Hotels', { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(r => setTimeout(r, 3000));
  
  // Destination
  await page.click('#hotelDestination');
  await new Promise(r => setTimeout(r, 300));
  await page.type('#hotelDestination', 'Kauai', { delay: 150 });
  
  // Wait for autocomplete
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 500));
    const found = await page.evaluate(() => {
      for (const item of document.querySelectorAll('li.destination')) {
        if (item.textContent.includes('Kauai') && item.getBoundingClientRect().height > 0) return true;
      }
      return false;
    });
    if (found) break;
  }
  
  // Click Kauai suggestion
  const acRect = await page.evaluate(() => {
    for (const item of document.querySelectorAll('li.destination')) {
      if (item.textContent.includes('Kauai') && item.getBoundingClientRect().height > 0) {
        const r = item.getBoundingClientRect();
        return { x: r.x + r.width/2, y: r.y + r.height/2 };
      }
    }
  });
  if (!acRect) throw new Error('Kauai autocomplete not found');
  await page.mouse.click(acRect.x, acRect.y);
  await new Promise(r => setTimeout(r, 2000));
  
  // Check-in date via calendar
  await openCalendar(page, 'checkInDateWidget');
  await navigateCalendarTo(page, checkin.getMonth(), checkin.getFullYear());
  await clickDate(page, checkin.getDate(), monthNames[checkin.getMonth()]);
  await new Promise(r => setTimeout(r, 1500));
  
  // Check-out date
  // Calendar may auto-open for checkout
  const dpVisible = await page.evaluate(() => {
    const dp = document.getElementById('ui-datepicker-div');
    return dp && dp.style.display !== 'none';
  });
  if (!dpVisible) await openCalendar(page, 'checkOutDateWidget');
  
  if (checkout.getMonth() !== checkin.getMonth()) {
    await navigateCalendarTo(page, checkout.getMonth(), checkout.getFullYear());
  }
  await clickDate(page, checkout.getDate(), monthNames[checkout.getMonth()]);
  await new Promise(r => setTimeout(r, 2000));
  
  // Click Search
  const searchBtn = await page.evaluate(() => {
    for (const btn of document.querySelectorAll('button')) {
      if (btn.textContent.trim() === 'Search' && btn.offsetParent !== null) {
        const r = btn.getBoundingClientRect();
        if (r.width > 0) return { x: r.x + r.width/2, y: r.y + r.height/2 };
      }
    }
    return null;
  });
  if (!searchBtn) throw new Error('Search button not found');
  await page.mouse.click(searchBtn.x, searchBtn.y);
  
  // Wait for results — poll for up to 60 seconds
  for (let i = 0; i < 12; i++) {
    await new Promise(r => setTimeout(r, 5000));
    if (page.url().includes('/h=')) break;
    const hasResults = await page.evaluate(() => document.body.innerText.includes('Total Price'));
    if (hasResults) break;
  }
  
  if (!page.url().includes('/h=')) {
    const hasResults = await page.evaluate(() => document.body.innerText.includes('Total Price'));
    if (!hasResults) throw new Error('Results did not load');
  }
  
  // Scroll to load all results
  for (let i = 0; i < 8; i++) {
    await page.evaluate(() => window.scrollBy(0, 600));
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
  console.log('🌺 Kauai Hotel Price Scraper — Costco Travel');
  console.log('Opening browser (you may see a Chrome window)...\n');
  
  const browser = await puppeteer.launch({
    headless: false, // VISIBLE browser — less likely to be blocked
    args: ['--window-size=1920,1080', '--disable-blink-features=AutomationControlled']
  });
  
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => { Object.defineProperty(navigator, 'webdriver', { get: () => false }); });
  await page.setViewport({ width: 1920, height: 1080 });

  const allResults = [];
  try { const existing = JSON.parse(fs.readFileSync('prices.json', 'utf-8')); allResults.push(...existing); } catch(e) {}
  const done = new Set(allResults.map(r => `${r.checkin}_${r.nights}`));
  
  let searchNum = 0, consecutiveFails = 0;
  const total = NIGHTS.reduce((sum, n) => { let c=0, d=new Date(START); while(addDays(d,n)<=END){c++;d=addDays(d,1);} return sum+c; }, 0);
  
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
            allResults.push({ checkin: fmtISO(checkin), checkout: fmtISO(checkout), nights, hotel, price, perNight: Math.round(price/nights) });
            console.log(`  ✓ ${hotel}: $${price.toLocaleString()} ($${Math.round(price/nights)}/night)`);
          }
          
          const missing = TARGET_HOTELS.filter(h => !prices[h]);
          if (missing.length) console.log(`  ✗ Not found: ${missing.join(', ')}`);
          
          fs.writeFileSync('prices.json', JSON.stringify(allResults, null, 2));
          success = true;
          consecutiveFails = 0;
          break;
        } catch(e) {
          console.log(`  Attempt ${attempt}: ${e.message}`);
          await new Promise(r => setTimeout(r, 3000));
        }
      }
      
      if (!success) {
        consecutiveFails++;
        if (consecutiveFails >= 5) { console.log('\n5 consecutive failures. Stopping.'); break; }
      }
      
      await new Promise(r => setTimeout(r, 2000));
      checkin = addDays(checkin, 1);
    }
    if (consecutiveFails >= 5) break;
  }
  
  console.log(`\n=== DONE: ${allResults.length} prices from ${searchNum} searches ===\n`);
  for (const hotel of TARGET_HOTELS) {
    const hp = allResults.filter(r => r.hotel === hotel).sort((a, b) => a.price - b.price);
    if (hp.length) {
      const b = hp[0];
      console.log(`🏆 ${hotel}: $${b.price.toLocaleString()} ($${b.perNight}/night) — ${b.checkin} → ${b.checkout} (${b.nights}N)`);
    } else {
      console.log(`❌ ${hotel}: No prices found`);
    }
  }
  
  await browser.close();
  console.log('\nPrices saved to prices.json');
})();
