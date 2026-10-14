// "4 hours", "1 hour": what the redesign calls credit hours everywhere a student reads them (never "cr").
export const hoursText = n => (typeof n === 'number' ? `${n} ${n === 1 ? 'hour' : 'hours'}` : '— hours')
