// ZIP → county FIPS resolution.
//
// Uses the Census Geocoder API as the source of truth, with a small
// localStorage cache so we don't hammer the network. The API returns a
// Federal Information Processing Standards code that uniquely identifies
// each county (5 digits: 2-digit state + 3-digit county). We store with
// an underscore separator (e.g. '13_021') to keep them human-readable.

const CACHE_KEY = 'tabula:zip_to_county_cache';
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;  // 30 days
const GEOCODER_URL = 'https://geocoding.geo.census.gov/geocoder/geographies/address';

function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveCache(cache) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch { /* quota */ }
}

/**
 * Resolve a ZIP code to a county FIPS code.
 *
 * @param {string} zip  5-digit US ZIP (extra characters are stripped)
 * @returns {Promise<{fips: string, county_name: string, state_code: string, confidence: 'high'|'low'|'none'} | null>}
 */
export async function resolveZipToCounty(zip) {
  const z = (zip || '').toString().replace(/[^\d]/g, '').slice(0, 5);
  if (z.length !== 5) return null;

  const cache = loadCache();
  const hit = cache[z];
  if (hit && (Date.now() - hit.cachedAt) < CACHE_TTL_MS) {
    return hit.result;
  }

  try {
    // We use a "ZIP centroid" address approximation by passing zip as the
    // street. For unambiguous cases this returns a single county. We mark
    // confidence accordingly.
    const params = new URLSearchParams({
      zip: z,
      benchmark: 'Public_AR_Current',
      vintage: 'Current_Current',
      format: 'json',
      layers: '82', // Counties
    });
    // The Census endpoint accepts a "address" form, but for ZIP-only we
    // can use the "onelineaddress" endpoint instead.
    const url = `https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress?address=${encodeURIComponent(z)}&benchmark=Public_AR_Current&vintage=Current_Current&format=json&layers=82`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Census geocoder ${res.status}`);
    const json = await res.json();
    const matches = json?.result?.addressMatches || [];
    if (matches.length === 0) {
      cache[z] = { cachedAt: Date.now(), result: null };
      saveCache(cache);
      return null;
    }
    const counties = matches[0]?.geographies?.['Counties'] || [];
    if (counties.length === 0) {
      cache[z] = { cachedAt: Date.now(), result: null };
      saveCache(cache);
      return null;
    }
    const c = counties[0];
    const fips = `${c.STATE}_${c.COUNTY}`;
    const result = {
      fips,
      county_name: c.NAME,
      state_code: null,  // we leave this null; irs-county.js can derive from prefix
      confidence: counties.length === 1 ? 'high' : 'low',
    };
    cache[z] = { cachedAt: Date.now(), result };
    saveCache(cache);
    return result;
  } catch (err) {
    console.warn('ZIP→county resolution failed:', err.message);
    return null;
  }
}

/** Drop the entire cache (used by the IRS standards refresh script). */
export function clearZipCache() {
  try { localStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }
}
