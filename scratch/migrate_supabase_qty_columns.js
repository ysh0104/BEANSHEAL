// Supabase SQL Alter Query Test for total_qty and quantity
const https = require('https');

console.log("Alter queries to run in Supabase SQL Editor if columns are INTEGER:");
console.log(`
ALTER TABLE ecount_items ALTER COLUMN total_qty TYPE NUMERIC(18, 4);
ALTER TABLE ecount_inventory ALTER COLUMN quantity TYPE NUMERIC(18, 4);
`);
