// FICTIONAL prototype data. Homes, prices and places are invented for demonstration.
// Coordinates are approximate positions in east Bengaluru.

window.WORK_PLACES = {
  itpl: { name: 'Whitefield (ITPL)', lat: 12.9857, lng: 77.7362 },
  manyata: { name: 'Manyata Tech Park', lat: 13.0475, lng: 77.6210 },
  ecity: { name: 'Electronic City', lat: 12.8456, lng: 77.6603 },
  koramangala: { name: 'Koramangala', lat: 12.9352, lng: 77.6245 },
  mg: { name: 'MG Road', lat: 12.9756, lng: 77.6066 }
};

window.PLACES = [
  { type: 'school', name: 'Greenfield Public School', lat: 12.9890, lng: 77.6990 },
  { type: 'school', name: 'Sunbeam International School', lat: 12.9700, lng: 77.7230 },
  { type: 'school', name: 'Little Oaks Primary', lat: 13.0040, lng: 77.7480 },
  { type: 'hospital', name: 'Eastside Multispeciality Hospital', lat: 12.9810, lng: 77.7120 },
  { type: 'hospital', name: 'CarePoint Clinic', lat: 12.9560, lng: 77.7380 },
  { type: 'park', name: 'Lakeview Park', lat: 12.9940, lng: 77.6880 },
  { type: 'park', name: 'Kundalahalli Lake walk', lat: 12.9620, lng: 77.7160 },
  { type: 'park', name: 'Hoodi Green', lat: 12.9950, lng: 77.7210 },
  { type: 'metro', name: 'Metro station (Hoodi)', lat: 12.9890, lng: 77.7110 },
  { type: 'metro', name: 'Metro station (KR Puram)', lat: 13.0010, lng: 77.6750 },
  { type: 'metro', name: 'Metro station (Kadugodi)', lat: 12.9970, lng: 77.7570 },
  { type: 'shops', name: 'Phoenix-style mall (fictional)', lat: 12.9960, lng: 77.6960 },
  { type: 'shops', name: 'Daily market, Brookefield', lat: 12.9680, lng: 77.7110 },
  { type: 'shops', name: 'Whitefield high street', lat: 12.9800, lng: 77.7480 }
];

// Fact helper: v = value, l = 'Verified' | 'Estimated' | 'Unknown', s = source shown on tap
function F(v, l, s) { return { v: v, l: l, s: s }; }

window.HOMES = [
  {
    id: 'lakeside', name: 'Lakeside Towers', area: 'Mahadevapura', lat: 12.9925, lng: 77.6935,
    price: 124, bhk: 3, listedBy: 'Builder', confirmedDays: 0,
    carpet: F(1420, 'Verified', 'K-RERA filing, matches listing'),
    pets: F(true, 'Verified', 'Society bylaws shared by builder'),
    lift: F(true, 'Verified', 'K-RERA filing'), parking: F(true, 'Verified', '1 covered slot, sale agreement draft'),
    ready: F(true, 'Verified', 'Occupancy certificate on K-RERA'), age: 3,
    safety: F(0.75, 'Estimated', 'Based on area reviews and street lighting data'),
    community: F(0.8, 'Estimated', 'Clubhouse and 600+ families, from listing'),
    rental: F(0.65, 'Estimated', '38 similar rentals listed nearby in 6 months'),
    rera: F('Registered', 'Verified', 'K-RERA, checked 21 Nov'),
    concerns: [], photo: 'images/homes/lakeside.svg'
  },
  {
    id: 'palmgrove', name: 'Palm Grove Residency', area: 'Hoodi', lat: 12.9905, lng: 77.7185,
    price: 118, bhk: 3, listedBy: 'Owner', confirmedDays: 2,
    carpet: F(null, 'Unknown', 'Sources disagree: listing says 1,380 sq ft, K-RERA filing says 1,190 sq ft'),
    pets: F(null, 'Unknown', 'Not mentioned in the listing; bylaws not seen'),
    lift: F(true, 'Verified', 'K-RERA filing'), parking: F(true, 'Estimated', 'Owner mentions parking; slot type unclear'),
    ready: F(true, 'Verified', 'Resale, occupied since 2019'), age: 7,
    safety: F(0.7, 'Estimated', 'Based on area reviews'),
    community: F(null, 'Unknown', 'No information on residents or amenities'),
    rental: F(0.7, 'Estimated', 'Close to ITPL; 51 similar rentals nearby'),
    rera: F('Registered · 2 complaints (2025)', 'Verified', 'K-RERA: 2 complaints about late handover, 1 resolved'),
    concerns: ['Carpet area: the listing and the K-RERA filing disagree (1,380 vs 1,190 sq ft).', 'Builder has 2 complaints on K-RERA about late handover (1 resolved).'],
    photo: 'images/homes/palmgrove.svg'
  },
  {
    id: 'cedar', name: 'Cedar Court', area: 'Brookefield', lat: 12.9655, lng: 77.7175,
    price: 109, bhk: 3, listedBy: 'Broker', confirmedDays: 5,
    carpet: F(1250, 'Verified', 'K-RERA filing'),
    pets: F(true, 'Verified', 'Society bylaws (copy seen by broker, uploaded)'),
    lift: F(true, 'Verified', 'K-RERA filing'), parking: F(true, 'Verified', '1 covered slot'),
    ready: F(true, 'Verified', 'Occupancy certificate'), age: 9,
    safety: F(0.8, 'Estimated', 'Based on area reviews'),
    community: F(null, 'Unknown', 'No information on residents or amenities'),
    rental: F(0.55, 'Estimated', '22 similar rentals nearby'),
    rera: F('Registered', 'Verified', 'K-RERA, checked 18 Nov'),
    concerns: [], photo: 'images/homes/cedar.svg'
  },
  {
    id: 'banyan', name: 'Banyan Heights', area: 'KR Puram', lat: 13.0055, lng: 77.6985,
    price: 112, bhk: 3, listedBy: 'Broker', confirmedDays: 9,
    carpet: F(1310, 'Verified', 'K-RERA filing'),
    pets: F(null, 'Unknown', 'Broker unsure; bylaws not seen'),
    lift: F(true, 'Verified', 'K-RERA filing'), parking: F(null, 'Unknown', 'Not stated'),
    ready: F(true, 'Verified', 'Occupancy certificate'), age: 5,
    safety: F(null, 'Unknown', 'Too few reviews for this street'),
    community: F(0.6, 'Estimated', 'Mid-size society, from listing'),
    rental: F(0.6, 'Estimated', 'Near metro; 30 similar rentals'),
    rera: F('Registered', 'Verified', 'K-RERA, checked 15 Nov'),
    concerns: [], photo: 'images/homes/banyan.svg'
  },
  {
    id: 'orchid', name: 'Orchid Enclave', area: 'Whitefield', lat: 12.9815, lng: 77.7420,
    price: 136, bhk: 3, listedBy: 'Builder', confirmedDays: 1,
    carpet: F(1560, 'Verified', 'K-RERA filing'),
    pets: F(true, 'Verified', 'Society bylaws'),
    lift: F(true, 'Verified', 'K-RERA filing'), parking: F(true, 'Verified', '2 covered slots'),
    ready: F(true, 'Verified', 'Occupancy certificate'), age: 2,
    safety: F(0.85, 'Estimated', 'Based on area reviews'),
    community: F(0.85, 'Estimated', 'Large gated community, from listing'),
    rental: F(0.75, 'Estimated', 'Walk to ITPL; 64 similar rentals'),
    rera: F('Registered', 'Verified', 'K-RERA, checked 20 Nov'),
    concerns: [], photo: 'images/homes/orchid.svg'
  },
  {
    id: 'maple', name: 'Maple Woods', area: 'Kadugodi', lat: 12.9985, lng: 77.7600,
    price: 105, bhk: 3, listedBy: 'Builder', confirmedDays: 3,
    carpet: F(1330, 'Verified', 'K-RERA filing'),
    pets: F(true, 'Verified', 'Draft bylaws in sale agreement'),
    lift: F(true, 'Verified', 'K-RERA plan'), parking: F(true, 'Verified', '1 covered slot'),
    ready: F(false, 'Verified', 'Under construction; K-RERA completion date Dec 2027'), age: null,
    safety: F(0.65, 'Estimated', 'Developing area; few reviews'),
    community: F(0.7, 'Estimated', 'Planned clubhouse, from brochure'),
    rental: F(0.8, 'Estimated', 'Near metro and ITPL; strong rental demand'),
    rera: F('Registered · completion Dec 2027', 'Verified', 'K-RERA filing'),
    concerns: ['Under construction: handover depends on the builder meeting the Dec 2027 K-RERA date.'],
    photo: 'images/homes/maple.svg'
  },
  {
    id: 'silveroak', name: 'Silver Oak Apartments', area: 'Hoodi', lat: 12.9935, lng: 77.7240,
    price: 128, bhk: 3, listedBy: 'Owner', confirmedDays: 4,
    carpet: F(1380, 'Verified', 'Sale deed copy'),
    pets: F(false, 'Verified', 'Society bylaws: no dogs over 10 kg'),
    lift: F(true, 'Verified', 'Visit report'), parking: F(true, 'Verified', '1 covered slot'),
    ready: F(true, 'Verified', 'Occupied'), age: 11,
    safety: F(0.7, 'Estimated', 'Based on area reviews'),
    community: F(0.65, 'Estimated', 'From listing'),
    rental: F(0.6, 'Estimated', '40 similar rentals nearby'),
    rera: F('Pre-RERA project', 'Verified', 'Completed before RERA; title checks needed'),
    concerns: ['Completed before RERA: title and approvals must be checked separately.'],
    photo: 'images/homes/silveroak.svg'
  },
  {
    id: 'greenleaf', name: 'Greenleaf Residency', area: 'Varthur', lat: 12.9395, lng: 77.7480,
    price: 95, bhk: 3, listedBy: 'Owner', confirmedDays: 12,
    carpet: F(1290, 'Verified', 'K-RERA filing'),
    pets: F(true, 'Verified', 'Society bylaws'),
    lift: F(true, 'Verified', 'K-RERA filing'), parking: F(true, 'Verified', 'Open parking'),
    ready: F(true, 'Verified', 'Occupancy certificate'), age: 6,
    safety: F(0.6, 'Estimated', 'Based on area reviews'),
    community: F(0.7, 'Estimated', 'From listing'),
    rental: F(0.45, 'Estimated', 'Fewer renters this far out'),
    rera: F('Registered', 'Verified', 'K-RERA, checked 10 Nov'),
    concerns: ['Availability last confirmed 12 days ago.'], photo: 'images/homes/greenleaf.svg'
  },
  {
    id: 'ivy', name: 'Ivy Terrace', area: 'Whitefield', lat: 12.9880, lng: 77.7330,
    price: 129, bhk: 3, listedBy: 'Broker', confirmedDays: 6,
    carpet: F(1120, 'Verified', 'K-RERA filing'),
    pets: F(true, 'Estimated', 'Broker says pets are fine; bylaws not seen'),
    lift: F(true, 'Verified', 'K-RERA filing'), parking: F(true, 'Verified', '1 covered slot'),
    ready: F(true, 'Verified', 'Occupancy certificate'), age: 4,
    safety: F(0.8, 'Estimated', 'Based on area reviews'),
    community: F(0.75, 'Estimated', 'From listing'),
    rental: F(0.8, 'Estimated', 'Walk to ITPL; high rental demand'),
    rera: F('Registered', 'Verified', 'K-RERA, checked 19 Nov'),
    concerns: [], photo: 'images/homes/ivy.svg'
  },
  {
    id: 'sunrise', name: 'Sunrise Meadows', area: 'Marathahalli', lat: 12.9575, lng: 77.7005,
    price: 98, bhk: 2, listedBy: 'Owner', confirmedDays: 2,
    carpet: F(980, 'Verified', 'Sale deed copy'),
    pets: F(true, 'Verified', 'Society bylaws'),
    lift: F(true, 'Verified', 'Visit report'), parking: F(true, 'Verified', '1 covered slot'),
    ready: F(true, 'Verified', 'Occupied'), age: 8,
    safety: F(0.7, 'Estimated', 'Based on area reviews'),
    community: F(0.6, 'Estimated', 'From listing'),
    rental: F(0.7, 'Estimated', 'Popular rental area'),
    rera: F('Registered', 'Verified', 'K-RERA, checked 12 Nov'),
    concerns: [], photo: 'images/homes/sunrise.svg'
  }
];
