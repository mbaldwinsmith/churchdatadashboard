const fs = require('fs');
const path = require('path');

const services = [
  { site: 'Central', service: '9am', baseAttendance: 200, baseKids: 50 },
  { site: 'Central', service: '11am', baseAttendance: 180, baseKids: 30 },
  { site: 'Central', service: '6pm', baseAttendance: 60, baseKids: 5 },
  { site: 'North', service: '10am', baseAttendance: 80, baseKids: 20 }
];

const years = [2022, 2023, 2024];
const attendanceGrowth = 0.13;
const kidsGrowth = 0.15;

const easterDates = {
  2022: new Date('2022-04-17'),
  2023: new Date('2023-04-09'),
  2024: new Date('2024-03-31')
};

function getFirstSunday(year) {
  const date = new Date(year, 0, 1);
  while (date.getDay() !== 0) {
    date.setDate(date.getDate() + 1);
  }
  return date;
}

function getSundays(year) {
  const sundays = [];
  const date = getFirstSunday(year);
  let week = 1;

  while (date.getFullYear() === year) {
    sundays.push({ week, date: new Date(date) });
    date.setDate(date.getDate() + 7);
    week += 1;
  }

  return sundays;
}

function gaussianBoost(date, center, widthDays, amplitude) {
  const diffDays = Math.abs((date - center) / (1000 * 60 * 60 * 24));
  return amplitude * Math.exp(-Math.pow(diffDays / widthDays, 2));
}

function seasonalMultiplier(date, year) {
  const month = date.getMonth();
  let multiplier = 1;

  const easterDate = easterDates[year];
  const christmasDate = new Date(`${year}-12-24`);

  if (easterDate) {
    multiplier += gaussianBoost(date, easterDate, 10, 0.25);
  }
  multiplier += gaussianBoost(date, christmasDate, 8, 0.3);

  if (month >= 5 && month <= 7) {
    multiplier -= 0.12;
  }
  if (month === 8) {
    multiplier -= 0.05;
  }

  return Math.max(multiplier, 0.6);
}

function weeklyNoise(intensity = 0.08) {
  const u1 = Math.random();
  const u2 = Math.random();
  const randStdNormal = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return randStdNormal * intensity;
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toMonthString(date) {
  return date.toLocaleString('en-US', { month: 'long' });
}

function generateData() {
  const rows = [];

  years.forEach((year, yearIndex) => {
    const sundays = getSundays(year);

    services.forEach(({ site, service, baseAttendance, baseKids }) => {
      const attendanceBase = baseAttendance * Math.pow(1 + attendanceGrowth, yearIndex);
      const kidsBase = baseKids * Math.pow(1 + kidsGrowth, yearIndex);

      sundays.forEach(({ week, date }) => {
        const seasonal = seasonalMultiplier(date, year);
        const intraYearTrend = 1 + (week - 1) * 0.0025;

        const attendanceMean = attendanceBase * seasonal * intraYearTrend;
        const kidsMean = kidsBase * seasonal * (1 + (week - 1) * 0.003);

        const attendance = Math.max(0, Math.round(attendanceMean * (1 + weeklyNoise(0.07))));
        const kids = Math.max(0, Math.round(kidsMean * (1 + weeklyNoise(0.09))));

        rows.push({
          Week: week,
          Date: formatDate(date),
          Year: String(year),
          Month: toMonthString(date),
          Site: site,
          Service: service,
          Attendance: attendance,
          'Kids Checked-in': kids
        });
      });
    });
  });

  return rows;
}

function toCSV(data) {
  const headers = [
    'Week',
    'Date',
    'Year',
    'Month',
    'Site',
    'Service',
    'Attendance',
    'Kids Checked-in'
  ];
  const escape = (value) => {
    if (typeof value === 'string' && /[",\n]/.test(value)) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  };
  const lines = [headers.join(',')];
  data.forEach((row) => {
    const values = headers.map((header) => escape(row[header]));
    lines.push(values.join(','));
  });
  return lines.join('\n');
}

function main() {
  const data = generateData();
  const outDir = path.join(__dirname, '..', 'data');

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const jsonPath = path.join(outDir, 'attendance.json');
  const csvPath = path.join(outDir, 'attendance.csv');

  fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2));
  fs.writeFileSync(csvPath, toCSV(data));

  console.log(`Generated ${data.length} rows.`);
  console.log(`JSON saved to ${jsonPath}`);
  console.log(`CSV saved to ${csvPath}`);
}

main();
