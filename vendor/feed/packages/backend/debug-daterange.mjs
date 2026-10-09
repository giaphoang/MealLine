// Debug DateRangeResolver for "Today" filter
import { DateRangeResolver } from './src/utils/dateRangeResolver.js';

console.log('=== DATE RANGE RESOLVER DEBUGGING ===');

// Simulate current time from evidence
const currentTime = new Date('2025-07-22T02:14:48.742Z'); // Current server UTC time
console.log('Current Server Time (UTC):', currentTime.toISOString());
console.log('Current Server Time (Local):', currentTime.toString());
console.log('');

// Test "Today" (1d) range resolution
console.log('RESOLVING "TODAY" (1d) RANGE:');
const todayRange = DateRangeResolver.resolveTimeRange('1d', currentTime);
console.log('Start Date:', todayRange.startDate.toISOString());
console.log('End Date:', todayRange.endDate.toISOString());
console.log('TimeZone:', todayRange.timeZone);
console.log('');

// Show what this means in Pacific time
console.log('PACIFIC TIME INTERPRETATION:');
console.log('Start Date (Pacific):', todayRange.startDate.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
console.log('End Date (Pacific):', todayRange.endDate.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
console.log('');

// What SHOULD the range be for a Pacific user's "Today"?
console.log('WHAT SHOULD PACIFIC "TODAY" RANGE BE:');
const pacificNow = new Date(currentTime.toLocaleString('sv-SE', { timeZone: 'America/Los_Angeles' }));
console.log('Pacific Current Time:', pacificNow.toString());

// Start of day in Pacific time
const pacificStartOfDay = new Date(pacificNow);
pacificStartOfDay.setHours(0, 0, 0, 0);
console.log('Pacific Start of Day:', pacificStartOfDay.toString());

// Convert Pacific start of day to UTC  
const utcOffsetMs = pacificNow.getTimezoneOffset() * 60 * 1000;
const pacificStartOfDayUTC = new Date(pacificStartOfDay.getTime() - utcOffsetMs);
console.log('Pacific Start of Day (UTC):', pacificStartOfDayUTC.toISOString());

// This is what the range SHOULD be for Pacific user's "Today"
console.log('');
console.log('CORRECT RANGE FOR PACIFIC USER TODAY:');
console.log('Should start at:', pacificStartOfDayUTC.toISOString());
console.log('Should end at:', currentTime.toISOString());
