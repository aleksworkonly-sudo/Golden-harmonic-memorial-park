'use strict';

const { requireCondition } = require('./errors');
const manilaFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit'
});

function timestamp(value) {
  requireCondition(Number.isSafeInteger(value) && value >= 0 && value <= 253402271999999,
    'INVALID_DATE', 'Use a valid timestamp in milliseconds.');
  return value;
}

function manilaDate(value) {
  const parts = Object.fromEntries(manilaFormatter.formatToParts(new Date(timestamp(value)))
    .map(({ type, value: part }) => [type, part]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function parseDate(value) {
  requireCondition(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value),
    'INVALID_DATE', 'Use a YYYY-MM-DD calendar date.');
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(`${value}T00:00:00.000Z`);
  requireCondition(year >= 1970 && Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value, 'INVALID_DATE', 'Calendar date does not exist.');
  return { year, month, day };
}

// Always pass the ORIGINAL anchor plus the installment sequence, not the previous clamped date.
function addCalendarMonths(anchor, months) {
  const { year, month, day } = parseDate(anchor);
  requireCondition(Number.isSafeInteger(months) && months >= 0 && months <= 1200,
    'INVALID_DATE', 'Month offset is outside the supported range.');
  const absoluteMonth = year * 12 + month - 1 + months;
  const nextYear = Math.floor(absoluteMonth / 12);
  const nextMonth = absoluteMonth % 12 + 1;
  requireCondition(nextYear <= 9999, 'INVALID_DATE', 'Calendar date is outside the supported range.');
  const lastDay = new Date(Date.UTC(nextYear, nextMonth, 0)).getUTCDate();
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
}

function reservationDeadline(reservedAt) {
  return addCalendarMonths(manilaDate(reservedAt), 3);
}

function installmentDueDate(depositReceivedAt, sequence) {
  requireCondition(Number.isInteger(sequence) && sequence >= 1 && sequence <= 60,
    'INVALID_DATE', 'Installment sequence must be between 1 and 60.');
  return addCalendarMonths(manilaDate(depositReceivedAt), sequence);
}

module.exports = { timestamp, manilaDate, parseDate, addCalendarMonths, reservationDeadline, installmentDueDate };
