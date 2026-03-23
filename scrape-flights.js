// Google Flights scraper for Southwest DEN → LIH
// Uses fast-flights Python library under the hood via child_process
// Run: pip install fast-flights && node scrape-flights.js

const { execSync } = require('child_process');
const fs = require('fs');

const START = new Date(2026, 4, 15); // May 15
const END = new Date(2026, 5, 15);   // June 15
const NIGHTS = [6, 7, 8];

function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function fmtISO(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }

function searchFlights(date, from, to) {
  const pyScript = `
import json, sys
from fast_flights import FlightData, Passengers, get_flights

try:
    result = get_flights(
        flight_data=[FlightData(date='${date}', from_airport='${from}', to_airport='${to}')],
        seat='economy',
        trip='one-way',
        passengers=Passengers(adults=1),
    )
    flights = []
    for f in result.flights:
        flights.append({
            'airline': f.name if hasattr(f, 'name') else str(f),
            'departure': str(f.departure) if hasattr(f, 'departure') else '',
            'arrival': str(f.arrival) if hasattr(f, 'arrival') else '',
            'duration': str(f.duration) if hasattr(f, 'duration') else '',
            'stops': f.stops if hasattr(f, 'stops') else 0,
            'price': str(f.price) if hasattr(f, 'price') else '',
        })
    print(json.dumps(flights))
except Exception as e:
    print(json.dumps({'error': str(e)}))
`;
  
  try {
    const output = execSync(`python -c "${pyScript.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`, {
      timeout: 30000,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
    return JSON.parse(output);
  } catch(e) {
    // Try python3
    try {
      const output = execSync(`python3 -c "${pyScript.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`, {
        timeout: 30000,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      }).trim();
      return JSON.parse(output);
    } catch(e2) {
      return { error: e2.message.substring(0, 200) };
    }
  }
}

// Simpler approach: write a Python script and call it
function writePythonScript() {
  const py = `
import json, sys, time

try:
    from fast_flights import FlightData, Passengers, get_flights
except ImportError:
    print("ERROR: fast-flights not installed. Run: pip install fast-flights")
    sys.exit(1)

date = sys.argv[1]
from_apt = sys.argv[2]
to_apt = sys.argv[3]

try:
    result = get_flights(
        flight_data=[FlightData(date=date, from_airport=from_apt, to_airport=to_apt)],
        seat='economy',
        trip='one-way',
        passengers=Passengers(adults=1),
    )
    flights = []
    for f in result.flights:
        name = ''
        if hasattr(f, 'name'): name = f.name
        elif hasattr(f, 'airline'): name = f.airline
        
        price_str = str(f.price) if hasattr(f, 'price') else ''
        
        flights.append({
            'airline': name,
            'departure': str(f.departure) if hasattr(f, 'departure') else '',
            'arrival': str(f.arrival) if hasattr(f, 'arrival') else '',
            'duration': str(f.duration) if hasattr(f, 'duration') else '',
            'stops': f.stops if hasattr(f, 'stops') else 0,
            'price': price_str,
        })
    print(json.dumps(flights))
except Exception as e:
    print(json.dumps({'error': str(e)}))
`;
  fs.writeFileSync('flight-search.py', py);
}

function searchFlightsPy(date, from_apt, to_apt) {
  const cmds = ['python', 'python3', 'py'];
  for (const cmd of cmds) {
    try {
      const output = execSync(`${cmd} flight-search.py ${date} ${from_apt} ${to_apt}`, {
        timeout: 45000,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      }).trim();
      const lines = output.split('\n');
      for (const line of lines.reverse()) {
        try { return JSON.parse(line); } catch(e) {}
      }
    } catch(e) { continue; }
  }
  return { error: 'All python commands failed' };
}

function dedupeFlights(flights) {
  const seen = new Set();
  return flights.filter(f => {
    const key = `${f.departure}|${f.arrival}|${f.price}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parsePrice(priceStr) {
  if (!priceStr) return null;
  const match = priceStr.replace(/,/g, '').match(/(\d+)/);
  return match ? parseInt(match[1]) : null;
}

(async () => {
  console.log('✈️  Southwest Flight Scraper — DEN ↔ LIH via Google Flights\n');
  
  writePythonScript();
  
  // Generate all unique departure and return dates
  const outboundDates = new Set();
  const returnDates = new Set();
  
  for (const nights of NIGHTS) {
    let checkin = new Date(START);
    while (true) {
      const checkout = addDays(checkin, nights);
      if (checkout > END) break;
      outboundDates.add(fmtISO(checkin));
      returnDates.add(fmtISO(checkout));
      checkin = addDays(checkin, 1);
    }
  }
  
  const allOutbound = [...outboundDates].sort();
  const allReturn = [...returnDates].sort();
  const uniqueDates = [...new Set([...allOutbound, ...allReturn])].sort();
  
  console.log(`Unique outbound dates: ${allOutbound.length}`);
  console.log(`Unique return dates: ${allReturn.length}`);
  console.log(`Total unique dates to search: ${uniqueDates.length} (outbound) + ${uniqueDates.length} (return)\n`);
  
  // Load existing
  let allFlights = [];
  try { allFlights = JSON.parse(fs.readFileSync('flights.json', 'utf-8')); } catch(e) {}
  const done = new Set(allFlights.map(f => `${f.date}_${f.direction}`));
  
  let searchNum = 0;
  const total = allOutbound.length + allReturn.length;
  
  // Search outbound: DEN → LIH
  console.log('=== OUTBOUND: DEN → LIH ===\n');
  for (const date of allOutbound) {
    searchNum++;
    const key = `${date}_outbound`;
    if (done.has(key)) { continue; }
    
    console.log(`[${searchNum}/${total}] Outbound ${date} DEN → LIH`);
    const result = searchFlightsPy(date, 'DEN', 'LIH');
    
    if (result.error) {
      console.log(`  ✗ ${result.error.substring(0, 80)}`);
    } else if (Array.isArray(result)) {
      // Filter for Southwest
      const swFlights = result.filter(f => 
        f.airline && f.airline.toLowerCase().includes('southwest')
      );
      const allPriced = result.filter(f => f.price);
      
      const uniqueFlights = dedupeFlights(result.filter(f => f.price));
      const swFlights = uniqueFlights.filter(f => f.airline && f.airline.toLowerCase().includes('southwest'));
      
      if (swFlights.length) {
        for (const f of swFlights) {
          const price = parsePrice(f.price);
          allFlights.push({
            date, direction: 'outbound', from: 'DEN', to: 'LIH',
            airline: f.airline, departure: f.departure, arrival: f.arrival,
            duration: f.duration, stops: f.stops, price: price, priceRaw: f.price
          });
          console.log(`  ✓ SW: ${f.departure} → ${f.arrival} | ${f.duration} | ${f.stops} stops | ${f.price}`);
        }
      } else {
        console.log(`  No Southwest flights found (${uniqueFlights.length} unique flights)`);
        if (uniqueFlights.length) {
          const cheapest = uniqueFlights.sort((a, b) => (parsePrice(a.price) || 9999) - (parsePrice(b.price) || 9999))[0];
          console.log(`  Cheapest: ${cheapest.airline} ${cheapest.price}`);
        }
      }
      
      allFlights.push({ date, direction: 'outbound', from: 'DEN', to: 'LIH', airline: '_searched', price: null });
      fs.writeFileSync('flights.json', JSON.stringify(allFlights, null, 2));
    }
    
    // Rate limit — 15-30 seconds between searches
    const delay = 15000 + Math.random() * 15000;
    console.log(`  (waiting ${Math.round(delay/1000)}s)`);
    await new Promise(r => setTimeout(r, delay));
  }
  
  // Search return: LIH → DEN
  console.log('\n=== RETURN: LIH → DEN ===\n');
  for (const date of allReturn) {
    searchNum++;
    const key = `${date}_return`;
    if (done.has(key)) { continue; }
    
    console.log(`[${searchNum}/${total}] Return ${date} LIH → DEN`);
    const result = searchFlightsPy(date, 'LIH', 'DEN');
    
    if (result.error) {
      console.log(`  ✗ ${result.error.substring(0, 80)}`);
    } else if (Array.isArray(result)) {
      const uniqueFlights = dedupeFlights(result.filter(f => f.price));
      const swFlights = uniqueFlights.filter(f => f.airline && f.airline.toLowerCase().includes('southwest'));
      
      if (swFlights.length) {
        for (const f of swFlights) {
          const price = parsePrice(f.price);
          allFlights.push({
            date, direction: 'return', from: 'LIH', to: 'DEN',
            airline: f.airline, departure: f.departure, arrival: f.arrival,
            duration: f.duration, stops: f.stops, price: price, priceRaw: f.price
          });
          console.log(`  ✓ SW: ${f.departure} → ${f.arrival} | ${f.duration} | ${f.stops} stops | ${f.price}`);
        }
      } else {
        console.log(`  No Southwest flights found (${uniqueFlights.length} unique flights)`);
        if (uniqueFlights.length) {
          const cheapest = uniqueFlights.sort((a, b) => (parsePrice(a.price) || 9999) - (parsePrice(b.price) || 9999))[0];
          console.log(`  Cheapest: ${cheapest.airline} ${cheapest.price}`);
        }
      }
      
      allFlights.push({ date, direction: 'return', from: 'LIH', to: 'DEN', airline: '_searched', price: null });
      fs.writeFileSync('flights.json', JSON.stringify(allFlights, null, 2));
    }
    
    const delay = 15000 + Math.random() * 15000;
    console.log(`  (waiting ${Math.round(delay/1000)}s)`);
    await new Promise(r => setTimeout(r, delay));
  }
  
  // Summary
  const swOutbound = allFlights.filter(f => f.direction === 'outbound' && f.airline !== '_searched' && f.price);
  const swReturn = allFlights.filter(f => f.direction === 'return' && f.airline !== '_searched' && f.price);
  
  console.log(`\n=== DONE ===`);
  console.log(`SW outbound flights found: ${swOutbound.length}`);
  console.log(`SW return flights found: ${swReturn.length}`);
  
  if (swOutbound.length) {
    const cheapest = swOutbound.sort((a, b) => a.price - b.price)[0];
    console.log(`\n✈️  Cheapest outbound: $${cheapest.price} on ${cheapest.date} (${cheapest.departure} → ${cheapest.arrival}, ${cheapest.stops} stops)`);
  }
  if (swReturn.length) {
    const cheapest = swReturn.sort((a, b) => a.price - b.price)[0];
    console.log(`✈️  Cheapest return: $${cheapest.price} on ${cheapest.date} (${cheapest.departure} → ${cheapest.arrival}, ${cheapest.stops} stops)`);
  }
  
  console.log('\nFlights saved to flights.json');
})();
