import type { SystemStatus, ScraperStatus, LiveFlight } from '../types';

export const fixtureSystemStatus: SystemStatus = {
  dataState: 'MOCK',
  updatedAt: new Date().toISOString(),
  sources: [
    { name: 'IndiGo', status: 'Healthy', lastUpdate: '2 min ago', records: 4281 },
    { name: 'Air India', status: 'Healthy', lastUpdate: '4 min ago', records: 3904 },
    { name: 'Air India Express', status: 'Healthy', lastUpdate: '5 min ago', records: 2506 },
    { name: 'Akasa Air', status: 'Healthy', lastUpdate: '5 min ago', records: 2107 },
    { name: 'SpiceJet', status: 'Delayed', lastUpdate: '18 min ago', records: 1783 },
  ],
  scrapingAgents: { online: 6, total: 6 },
  postgresql: 'Healthy',
  mathEngine: 'Healthy',
  lastScrapeAgo: '3 min ago',
  recordsToday: 18402,
  rejected: 217,
  duplicates: 96,
  outliers: 34,
  browserAgent: {
    status: 'Running',
    browserConnected: true,
    source: 'IndiGo',
    route: 'DEL → BOM',
    stage: 'Collecting prices',
    recordsThisTask: 284,
  },
};

export const fixtureScraperStatus: ScraperStatus = {
  status: 'idle',
  browser_connected: false,
  source: null,
  route: null,
  stage: null,
  records_collected: null,
  started_at: null,
  last_activity_at: null,
};

/** Realistic mock flights over Indian air corridors. */
export const fixtureLiveFlights: LiveFlight[] = [
  { id: '800b0a', icao24: '800b0a', callsign: 'IGO2135', lat: 24.8, lon: 77.5, alt: 10972, heading: 165, velocity: 230, onGround: false, lastContact: Math.floor(Date.now() / 1000) - 10 },
  { id: '800c14', icao24: '800c14', callsign: 'AIC302', lat: 20.1, lon: 75.2, alt: 11278, heading: 200, velocity: 245, onGround: false, lastContact: Math.floor(Date.now() / 1000) - 5 },
  { id: '800a91', icao24: '800a91', callsign: 'SEJ411', lat: 15.4, lon: 78.8, alt: 9753, heading: 175, velocity: 215, onGround: false, lastContact: Math.floor(Date.now() / 1000) - 8 },
  { id: '800d22', icao24: '800d22', callsign: 'AKJ107', lat: 19.5, lon: 73.2, alt: 10058, heading: 45, velocity: 220, onGround: false, lastContact: Math.floor(Date.now() / 1000) - 12 },
  { id: '800e33', icao24: '800e33', callsign: 'IGO617', lat: 26.2, lon: 80.5, alt: 11582, heading: 250, velocity: 238, onGround: false, lastContact: Math.floor(Date.now() / 1000) - 3 },
  { id: '800f44', icao24: '800f44', callsign: 'VTI845', lat: 13.8, lon: 77.1, alt: 7620, heading: 310, velocity: 195, onGround: false, lastContact: Math.floor(Date.now() / 1000) - 15 },
  { id: '801055', icao24: '801055', callsign: 'AIC512', lat: 22.9, lon: 88.1, alt: 10363, heading: 270, velocity: 240, onGround: false, lastContact: Math.floor(Date.now() / 1000) - 7 },
  { id: '801166', icao24: '801166', callsign: 'IGO309', lat: 17.5, lon: 78.5, alt: 10668, heading: 350, velocity: 225, onGround: false, lastContact: Math.floor(Date.now() / 1000) - 9 },
];
