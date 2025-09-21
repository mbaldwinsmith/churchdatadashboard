const state = {
  year: 'All',
  site: 'All',
  service: 'All',
  metric: 'Attendance'
};

const monthNames = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
];

const monthRank = monthNames.reduce((acc, name, index) => {
  acc[name] = index;
  return acc;
}, {});

const elements = {
  yearSelect: document.getElementById('yearSelect'),
  siteSelect: document.getElementById('siteSelect'),
  serviceSelect: document.getElementById('serviceSelect'),
  metricRadios: document.querySelectorAll("input[name='metric']"),
  datasetStatus: document.getElementById('datasetStatus'),
  datasetUpload: document.getElementById('datasetUpload'),
  resetDataset: document.getElementById('resetDataset'),
  summaryTotal: document.getElementById('summaryTotal'),
  summaryTotalLabel: document.getElementById('summaryTotalLabel'),
  summaryAverage: document.getElementById('summaryAverage'),
  summaryPeak: document.getElementById('summaryPeak'),
  summaryPeakLabel: document.getElementById('summaryPeakLabel'),
  summaryTopGroup: document.getElementById('summaryTopGroup'),
  summaryTopGroupLabel: document.getElementById('summaryTopGroupLabel'),
  distributionLabel: document.getElementById('distributionLabel'),
  activeFilters: document.getElementById('activeFilters'),
  metricHeader: document.getElementById('metricHeader'),
  secondaryMetricHeader: document.getElementById('secondaryMetricHeader'),
  tableBody: document.getElementById('tableBody')
};

let dataset = [];
let trendChart;
let monthlyChart;
let distributionChart;
let servicesBySite = new Map();

const colors = [
  '#3f6ae0',
  '#2eb88a',
  '#f2a93b',
  '#ef5b5b',
  '#7e5bef',
  '#15aabf',
  '#f76707',
  '#20c997'
];

const REQUIRED_HEADERS = [
  'Week',
  'Date',
  'Year',
  'Month',
  'Site',
  'Service',
  'Attendance',
  'Kids Checked-in'
];

function formatNumber(value, { decimals = 0 } = {}) {
  return Number(value).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

function formatDateLabel(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

function setDatasetStatus(message, type = 'info') {
  if (!elements.datasetStatus) return;
  elements.datasetStatus.textContent = message;
  elements.datasetStatus.classList.remove('success', 'error');
  if (type === 'success') {
    elements.datasetStatus.classList.add('success');
  } else if (type === 'error') {
    elements.datasetStatus.classList.add('error');
  }
}

function parseCsvLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current);
  return values;
}

function normalizeMonth(value, date) {
  if (value) {
    const match = monthNames.find((month) => month.toLowerCase() === value.toLowerCase());
    if (match) {
      return match;
    }
  }
  return monthNames[date.getMonth()];
}

function normalizeCsvRow(entry) {
  const weekValue = Number(entry.Week);
  if (!Number.isFinite(weekValue)) {
    throw new Error('Week must be a number.');
  }
  const week = Math.round(weekValue);

  if (!entry.Date) {
    throw new Error('Date is required.');
  }

  const parsedDate = new Date(entry.Date);
  if (Number.isNaN(parsedDate.getTime())) {
    throw new Error(`Invalid Date value "${entry.Date}".`);
  }

  const site = entry.Site?.trim();
  if (!site) {
    throw new Error('Site is required.');
  }

  const service = entry.Service?.trim();
  if (!service) {
    throw new Error('Service is required.');
  }

  const attendanceValue = Number(entry.Attendance);
  if (!Number.isFinite(attendanceValue)) {
    throw new Error('Attendance must be a number.');
  }
  const attendance = Math.round(attendanceValue);

  const kidsValue = Number(entry['Kids Checked-in']);
  if (!Number.isFinite(kidsValue)) {
    throw new Error('Kids Checked-in must be a number.');
  }
  const kids = Math.round(kidsValue);

  const yearValue = entry.Year ? String(entry.Year).trim() : String(parsedDate.getFullYear());
  const monthValue = normalizeMonth(entry.Month ? String(entry.Month).trim() : '', parsedDate);

  return {
    Week: week,
    Date: entry.Date,
    Year: yearValue,
    Month: monthValue,
    Site: site,
    Service: service,
    Attendance: attendance,
    'Kids Checked-in': kids
  };
}

function parseCsv(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (!lines.length) {
    throw new Error('The CSV file is empty.');
  }

  const headers = parseCsvLine(lines[0]).map((header) => header.trim());
  const missing = REQUIRED_HEADERS.filter((header) => !headers.includes(header));

  if (missing.length) {
    throw new Error(`The CSV file is missing required columns: ${missing.join(', ')}.`);
  }

  const records = [];

  for (let index = 1; index < lines.length; index += 1) {
    const rawLine = lines[index];
    if (!rawLine.trim()) {
      continue;
    }

    const values = parseCsvLine(rawLine);
    const entry = {};
    headers.forEach((header, headerIndex) => {
      entry[header] = values[headerIndex]?.trim() ?? '';
    });

    try {
      records.push(normalizeCsvRow(entry));
    } catch (error) {
      throw new Error(`Row ${index + 1}: ${error.message}`);
    }
  }

  if (!records.length) {
    throw new Error('The CSV file does not contain any data rows.');
  }

  return records;
}

function buildServicesBySite(data) {
  const map = new Map();
  data.forEach((row) => {
    if (!map.has(row.Site)) {
      map.set(row.Site, new Set());
    }
    map.get(row.Site).add(row.Service);
  });
  servicesBySite = new Map(Array.from(map.entries()).map(([site, services]) => [site, Array.from(services).sort()]));
}

function setSelectOptions(select, options, selectedValue) {
  const opts = options
    .map((option) => `<option value="${option}">${option}</option>`)
    .join('');
  select.innerHTML = opts;
  if (selectedValue && options.includes(selectedValue)) {
    select.value = selectedValue;
  }
}

function populateFilterOptions() {
  const uniqueYears = Array.from(new Set(dataset.map((row) => row.Year))).sort();
  setSelectOptions(elements.yearSelect, ['All', ...uniqueYears], state.year);

  const uniqueSites = Array.from(new Set(dataset.map((row) => row.Site))).sort();
  setSelectOptions(elements.siteSelect, ['All', ...uniqueSites], state.site);

  updateServiceOptions(state.site);
}

function updateServiceOptions(site) {
  let services;
  if (site === 'All') {
    const allServices = new Set();
    dataset.forEach((row) => allServices.add(row.Service));
    services = Array.from(allServices).sort();
  } else {
    services = servicesBySite.get(site) || [];
  }
  const options = ['All', ...services];
  const prevService = state.service;
  setSelectOptions(elements.serviceSelect, options, prevService);
  if (!options.includes(prevService)) {
    state.service = 'All';
    elements.serviceSelect.value = 'All';
  }
}

function filterData() {
  return dataset.filter((row) => {
    const yearMatch = state.year === 'All' || row.Year === state.year;
    const siteMatch = state.site === 'All' || row.Site === state.site;
    const serviceMatch = state.service === 'All' || row.Service === state.service;
    return yearMatch && siteMatch && serviceMatch;
  });
}

function aggregateByDate(rows, metricKey) {
  const map = new Map();
  rows.forEach((row) => {
    const key = row.Date;
    if (!map.has(key)) {
      map.set(key, { date: row.Date, value: 0, week: row.Week, year: row.Year });
    }
    const record = map.get(key);
    record.value += row[metricKey];
  });
  return Array.from(map.values()).sort((a, b) => new Date(a.date) - new Date(b.date));
}

function aggregateMonthly(rows, metricKey) {
  const map = new Map();
  rows.forEach((row) => {
    const key = `${row.Year}-${row.Month}`;
    if (!map.has(key)) {
      const monthIndex = monthRank[row.Month];
      map.set(key, {
        label: `${row.Month} ${row.Year}`,
        value: 0,
        sortKey: `${row.Year}-${String(monthIndex + 1).padStart(2, '0')}`
      });
    }
    const entry = map.get(key);
    entry.value += row[metricKey];
  });
  return Array.from(map.values()).sort((a, b) => (a.sortKey > b.sortKey ? 1 : -1));
}

function getDistributionData(rows, metricKey) {
  if (!rows.length) {
    return { labels: [], values: [], dimension: 'Service' };
  }

  let dimension;
  let groupFn;
  if (state.service === 'All') {
    dimension = 'Service';
    groupFn = (row) => row.Service;
  } else if (state.site === 'All') {
    dimension = 'Site';
    groupFn = (row) => row.Site;
  } else if (state.year === 'All') {
    dimension = 'Year';
    groupFn = (row) => row.Year;
  } else {
    dimension = 'Month';
    groupFn = (row) => row.Month;
  }

  const map = new Map();
  rows.forEach((row) => {
    const key = groupFn(row);
    if (!map.has(key)) {
      map.set(key, 0);
    }
    map.set(key, map.get(key) + row[metricKey]);
  });

  const entries = Array.from(map.entries()).sort((a, b) => {
    if (dimension === 'Month') {
      return monthRank[a[0]] - monthRank[b[0]];
    }
    return a[0] > b[0] ? 1 : -1;
  });

  return {
    labels: entries.map(([label]) => label),
    values: entries.map(([, value]) => value),
    dimension
  };
}

function updateSummaries(filtered, metricKey) {
  const total = filtered.reduce((sum, row) => sum + row[metricKey], 0);
  const aggregated = aggregateByDate(filtered, metricKey);
  const average = aggregated.length ? total / aggregated.length : 0;

  elements.summaryTotal.textContent = formatNumber(total);
  elements.summaryTotalLabel.textContent = `Total ${state.metric}`;
  elements.summaryAverage.textContent = formatNumber(average, { decimals: 1 });

  if (aggregated.length) {
    const peak = aggregated.reduce((acc, item) => (item.value > acc.value ? item : acc));
    elements.summaryPeak.textContent = formatNumber(peak.value);
    elements.summaryPeakLabel.textContent = `${formatDateLabel(peak.date)} (Week ${peak.week})`;
  } else {
    elements.summaryPeak.textContent = '0';
    elements.summaryPeakLabel.textContent = 'No data available';
  }

  const distribution = getDistributionData(filtered, metricKey);
  if (distribution.values.length) {
    let maxIndex = 0;
    distribution.values.forEach((value, index) => {
      if (value > distribution.values[maxIndex]) {
        maxIndex = index;
      }
    });
    elements.summaryTopGroup.textContent = formatNumber(distribution.values[maxIndex]);
    elements.summaryTopGroupLabel.textContent = `${distribution.dimension}: ${distribution.labels[maxIndex]}`;
  } else {
    elements.summaryTopGroup.textContent = '0';
    elements.summaryTopGroupLabel.textContent = 'No grouping available';
  }
}

function generatePalette(count) {
  if (count <= colors.length) {
    return colors.slice(0, count);
  }
  const palette = [...colors];
  let index = 0;
  while (palette.length < count) {
    const base = colors[index % colors.length];
    const [r, g, b] = base
      .replace('#', '')
      .match(/.{1,2}/g)
      .map((hex) => parseInt(hex, 16));
    const factor = 0.8 + (palette.length / count) * 0.2;
    palette.push(`rgba(${Math.round(r * factor)}, ${Math.round(g * factor)}, ${Math.round(b * factor)}, 0.9)`);
    index += 1;
  }
  return palette;
}

function updateTrendChart(filtered, metricKey) {
  const aggregated = aggregateByDate(filtered, metricKey);
  const labels = aggregated.map((item) => item.date);
  const values = aggregated.map((item) => item.value);

  const chartData = {
    labels,
    datasets: [
      {
        label: state.metric,
        data: values,
        borderColor: '#3f6ae0',
        backgroundColor: 'rgba(63, 106, 224, 0.15)',
        fill: true,
        tension: 0.35,
        pointRadius: 0
      }
    ]
  };

  const options = {
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false
    },
    scales: {
      x: {
        ticks: {
          maxRotation: 0,
          callback: (value, index) => {
            const label = labels[index];
            if (!label) return '';
            const date = new Date(label);
            return `${date.getMonth() + 1}/${date.getDate()}`;
          }
        },
        grid: {
          display: false
        }
      },
      y: {
        beginAtZero: true,
        ticks: {
          callback: (value) => formatNumber(value)
        }
      }
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          title: (items) => items.map((item) => formatDateLabel(item.label)),
          label: (item) => `${state.metric}: ${formatNumber(item.parsed.y)}`
        }
      }
    }
  };

  if (!trendChart) {
    const ctx = document.getElementById('trendChart');
    trendChart = new Chart(ctx, {
      type: 'line',
      data: chartData,
      options
    });
  } else {
    trendChart.data = chartData;
    trendChart.options = options;
    trendChart.update();
  }
}

function updateMonthlyChart(filtered, metricKey) {
  const aggregated = aggregateMonthly(filtered, metricKey);
  const labels = aggregated.map((item) => item.label);
  const values = aggregated.map((item) => item.value);

  const chartData = {
    labels,
    datasets: [
      {
        label: state.metric,
        data: values,
        backgroundColor: 'rgba(46, 184, 138, 0.7)',
        borderRadius: 6
      }
    ]
  };

  const options = {
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false
    },
    scales: {
      x: {
        ticks: {
          maxRotation: 60,
          minRotation: 30
        },
        grid: { display: false }
      },
      y: {
        beginAtZero: true,
        ticks: {
          callback: (value) => formatNumber(value)
        }
      }
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (item) => `${state.metric}: ${formatNumber(item.parsed.y)}`
        }
      }
    }
  };

  if (!monthlyChart) {
    const ctx = document.getElementById('monthlyChart');
    monthlyChart = new Chart(ctx, {
      type: 'bar',
      data: chartData,
      options
    });
  } else {
    monthlyChart.data = chartData;
    monthlyChart.options = options;
    monthlyChart.update();
  }
}

function updateDistributionChart(filtered, metricKey) {
  const distribution = getDistributionData(filtered, metricKey);
  elements.distributionLabel.textContent = `Share by ${distribution.dimension.toLowerCase()}`;

  const chartData = {
    labels: distribution.labels,
    datasets: [
      {
        label: state.metric,
        data: distribution.values,
        backgroundColor: generatePalette(distribution.labels.length)
      }
    ]
  };

  const options = {
    maintainAspectRatio: false,
    interaction: {
      mode: 'nearest',
      intersect: true
    },
    plugins: {
      legend: {
        position: 'bottom'
      },
      tooltip: {
        callbacks: {
          label: (item) => {
            const value = item.parsed;
            return `${item.label}: ${formatNumber(value)}`;
          }
        }
      }
    }
  };

  if (!distributionChart) {
    const ctx = document.getElementById('distributionChart');
    distributionChart = new Chart(ctx, {
      type: 'pie',
      data: chartData,
      options
    });
  } else {
    distributionChart.data = chartData;
    distributionChart.options = options;
    distributionChart.update();
  }
}

function updateTable(filtered) {
  const metricKey = state.metric;
  const secondaryKey = metricKey === 'Attendance' ? 'Kids Checked-in' : 'Attendance';

  elements.metricHeader.textContent = metricKey;
  elements.secondaryMetricHeader.textContent = secondaryKey;

  const sorted = [...filtered].sort((a, b) => {
    const dateDiff = new Date(b.Date) - new Date(a.Date);
    if (dateDiff !== 0) return dateDiff;
    if (a.Site !== b.Site) return a.Site > b.Site ? 1 : -1;
    if (a.Service !== b.Service) return a.Service > b.Service ? 1 : -1;
    return 0;
  });

  const rows = sorted.slice(0, 50).map((row) => {
    return `
      <tr>
        <td>${row.Week}</td>
        <td>${formatDateLabel(row.Date)}</td>
        <td>${row.Site}</td>
        <td>${row.Service}</td>
        <td>${formatNumber(row[metricKey])}</td>
        <td>${formatNumber(row[secondaryKey])}</td>
      </tr>`;
  });

  elements.tableBody.innerHTML = rows.join('');
}

function updateActiveFilters() {
  let yearLabel;
  if (state.year === 'All') {
    const years = Array.from(new Set(dataset.map((row) => row.Year))).sort();
    if (years.length > 1) {
      yearLabel = `all years (${years[0]}–${years[years.length - 1]})`;
    } else if (years.length === 1) {
      yearLabel = `the year ${years[0]}`;
    } else {
      yearLabel = 'all available years';
    }
  } else {
    yearLabel = `the year ${state.year}`;
  }

  let siteLabel;
  if (state.site === 'All') {
    const sites = Array.from(new Set(dataset.map((row) => row.Site))).sort();
    if (sites.length > 1) {
      siteLabel = 'all sites';
    } else if (sites.length === 1) {
      siteLabel = `${sites[0]} site`;
    } else {
      siteLabel = 'available sites';
    }
  } else {
    siteLabel = `${state.site} site`;
  }
  const serviceLabel = state.service === 'All' ? 'all services' : `${state.service} service`;
  const metricLabel = state.metric === 'Attendance' ? 'attendance' : 'kids check-ins';

  elements.activeFilters.textContent = `Showing ${metricLabel} for ${serviceLabel} at ${siteLabel} across ${yearLabel}.`;
}

function updateDashboard() {
  const filtered = filterData();
  const metricKey = state.metric;

  updateSummaries(filtered, metricKey);
  updateTrendChart(filtered, metricKey);
  updateMonthlyChart(filtered, metricKey);
  updateDistributionChart(filtered, metricKey);
  updateTable(filtered);
  updateActiveFilters();
}

function attachEventListeners() {
  elements.yearSelect.addEventListener('change', (event) => {
    state.year = event.target.value;
    updateDashboard();
  });

  elements.siteSelect.addEventListener('change', (event) => {
    state.site = event.target.value;
    updateServiceOptions(state.site);
    updateDashboard();
  });

  elements.serviceSelect.addEventListener('change', (event) => {
    state.service = event.target.value;
    updateDashboard();
  });

  elements.metricRadios.forEach((radio) => {
    radio.addEventListener('change', (event) => {
      state.metric = event.target.value;
      updateDashboard();
    });
  });

  if (elements.datasetUpload) {
    elements.datasetUpload.addEventListener('change', handleDatasetUpload);
  }

  if (elements.resetDataset) {
    elements.resetDataset.addEventListener('click', () => {
      loadPlaceholderDataset('success');
    });
  }
}

function applyDataset(data, { message, type = 'info' } = {}) {
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('The dataset must contain at least one row.');
  }

  dataset = data;
  buildServicesBySite(dataset);

  state.year = 'All';
  state.site = 'All';
  state.service = 'All';

  populateFilterOptions();
  elements.yearSelect.value = 'All';
  elements.siteSelect.value = 'All';
  elements.serviceSelect.value = 'All';

  updateDashboard();

  if (elements.datasetUpload) {
    elements.datasetUpload.value = '';
  }

  const defaultMessage = `Loaded ${formatNumber(dataset.length)} rows.`;
  setDatasetStatus(message || defaultMessage, type);
}

function handleDatasetUpload(event) {
  const input = event.target;
  const file = input.files && input.files[0];
  if (!file) {
    return;
  }

  if (!file.name.toLowerCase().endsWith('.csv')) {
    setDatasetStatus('Please choose a CSV file.', 'error');
    input.value = '';
    return;
  }

  const reader = new FileReader();

  reader.onload = () => {
    try {
      if (typeof reader.result !== 'string') {
        throw new Error('Unable to read the file as text.');
      }
      const text = reader.result;
      const parsed = parseCsv(text);
      applyDataset(parsed, {
        message: `Loaded ${formatNumber(parsed.length)} rows from ${file.name}.`,
        type: 'success'
      });
    } catch (error) {
      console.error('Failed to parse uploaded dataset', error);
      setDatasetStatus(error.message, 'error');
      input.value = '';
    }
  };

  reader.onerror = () => {
    console.error('Failed to read uploaded dataset', reader.error);
    setDatasetStatus('Unable to read the selected file. Please try again.', 'error');
    input.value = '';
  };

  reader.readAsText(file);
}

async function loadPlaceholderDataset(feedbackType = 'info') {
  try {
    setDatasetStatus('Loading placeholder dataset…');
    const response = await fetch('data/attendance.json', { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }
    const data = await response.json();
    applyDataset(data, {
      message: `Using placeholder dataset generated for Central and North sites (2022–2024). Rows available: ${formatNumber(data.length)}.`,
      type: feedbackType
    });
  } catch (error) {
    console.error('Failed to load placeholder dataset', error);
    setDatasetStatus('Unable to load the placeholder dataset. Upload a CSV file to continue.', 'error');
  }
}

function initialize() {
  attachEventListeners();
  loadPlaceholderDataset();
}

initialize();
