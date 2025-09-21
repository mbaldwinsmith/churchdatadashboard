const state = {
  year: ['All'],
  site: ['All'],
  service: ['All'],
  metric: 'Attendance',
  distributionDimension: 'Service'
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
  yearToggle: document.getElementById('yearToggle'),
  siteToggle: document.getElementById('siteToggle'),
  serviceToggle: document.getElementById('serviceToggle'),
  metricRadios: document.querySelectorAll("input[name='metric']"),
  datasetStatus: document.getElementById('datasetStatus'),
  datasetUpload: document.getElementById('datasetUpload'),
  resetDataset: document.getElementById('resetDataset'),
  distributionToggle: document.getElementById('distributionToggle'),
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
  tableBody: document.getElementById('tableBody'),
  trendChartCanvas: document.getElementById('trendChart'),
  monthlyChartCanvas: document.getElementById('monthlyChart'),
  distributionChartCanvas: document.getElementById('distributionChart')
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

function getActiveSelections(stateKey) {
  const value = state[stateKey];
  if (Array.isArray(value)) {
    return [...value];
  }
  if (value === undefined || value === null) {
    state[stateKey] = [];
    return [];
  }
  state[stateKey] = [value];
  return [...state[stateKey]];
}

function applySelection(stateKey, selections, options = []) {
  const optionSet = new Set(options);
  const hasAllOption = optionSet.has('All');
  const fallback = options.length ? (hasAllOption ? 'All' : options[0]) : 'All';
  let normalized = [];

  selections.forEach((value) => {
    if (value === 'All' && hasAllOption) {
      normalized = ['All'];
    } else if (value !== 'All') {
      const isAllowed = !options.length || optionSet.has(value);
      if (isAllowed && !normalized.includes(value)) {
        normalized.push(value);
      }
    }
  });

  if (!normalized.length) {
    normalized = fallback ? [fallback] : [];
  }

  if (normalized.length > 1 && normalized.includes('All')) {
    normalized = ['All'];
  }

  if (options.length) {
    normalized = options.filter((option) => normalized.includes(option));
  }

  state[stateKey] = normalized;
  return normalized;
}

function matchesSelection(selections, value) {
  return !selections.length || selections.includes('All') || selections.includes(value);
}

function formatList(items) {
  if (!items.length) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

function formatNumber(value, { decimals = 0 } = {}) {
  return Number(value).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

function formatDateLabel(dateString) {
  const date = parseIsoDateLocal(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

function parseIsoDateLocal(value) {
  if (typeof value !== 'string') {
    throw new Error(`Invalid Date value "${value}".`);
  }

  const parts = value.split('-');
  if (parts.length !== 3) {
    throw new Error(`Invalid Date value "${value}".`);
  }

  const [yearPart, monthPart, dayPart] = parts;
  const year = Number(yearPart);
  const month = Number(monthPart);
  const day = Number(dayPart);

  if (![year, month, day].every((part) => Number.isInteger(part))) {
    throw new Error(`Invalid Date value "${value}".`);
  }

  const date = new Date(year, month - 1, day);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    throw new Error(`Invalid Date value "${value}".`);
  }

  return date;
}

function getMetricDescription(metricKey) {
  if (metricKey === 'Attendance') {
    return 'attendance';
  }
  if (metricKey === 'Kids Checked-in') {
    return 'kids check-ins';
  }
  return String(metricKey || '').toLowerCase();
}

function updateChartAriaLabel(canvas, description) {
  if (!canvas) return;
  canvas.setAttribute('aria-label', description);
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

  const parsedDate = parseIsoDateLocal(entry.Date);

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

function updateToggleGroupSelection(container, selectedValue) {
  if (!container) return;
  const buttons = container.querySelectorAll('.toggle-button');
  buttons.forEach((button) => {
    const isActive = button.dataset.value === selectedValue;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-checked', isActive ? 'true' : 'false');
    button.setAttribute('tabindex', isActive ? '0' : '-1');
  });
}

function renderToggleOptions(container, options, stateKey) {
  if (!container) return;
  if (!options.length) {
    container.innerHTML = '';
    state[stateKey] = [];
    return;
  }

  const selections = applySelection(stateKey, getActiveSelections(stateKey), options);
  const selectionSet = new Set(selections);

  container.innerHTML = '';
  options.forEach((option) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'toggle-button';
    button.dataset.value = option;
    button.textContent = option;
    button.setAttribute('role', 'checkbox');
    const isActive = selectionSet.has(option);
    if (isActive) {
      button.classList.add('active');
    }
    button.setAttribute('aria-checked', isActive ? 'true' : 'false');
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    button.tabIndex = 0;
    container.appendChild(button);
  });
}

function updateMultiToggleSelection(container, stateKey) {
  if (!container) return;
  const selections = Array.isArray(state[stateKey]) ? state[stateKey] : [];
  const selectionSet = new Set(selections);
  container.querySelectorAll('.toggle-button').forEach((button) => {
    const value = button.dataset.value;
    const isActive = selectionSet.has(value);
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-checked', isActive ? 'true' : 'false');
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
}

function populateFilterOptions() {
  const uniqueYears = Array.from(new Set(dataset.map((row) => row.Year))).sort();
  renderToggleOptions(elements.yearToggle, ['All', ...uniqueYears], 'year');

  const uniqueSites = Array.from(new Set(dataset.map((row) => row.Site))).sort();
  renderToggleOptions(elements.siteToggle, ['All', ...uniqueSites], 'site');

  updateServiceOptions();
}

function updateServiceOptions() {
  const siteSelections = getActiveSelections('site');
  const servicesSet = new Set();

  if (!siteSelections.length || siteSelections.includes('All')) {
    dataset.forEach((row) => servicesSet.add(row.Service));
  } else {
    siteSelections.forEach((site) => {
      const services = servicesBySite.get(site) || [];
      services.forEach((service) => servicesSet.add(service));
    });
  }

  const options = ['All', ...Array.from(servicesSet).sort()];
  renderToggleOptions(elements.serviceToggle, options, 'service');
}

function filterData() {
  const yearSelections = getActiveSelections('year');
  const siteSelections = getActiveSelections('site');
  const serviceSelections = getActiveSelections('service');
  return dataset.filter((row) => {
    const yearMatch = matchesSelection(yearSelections, row.Year);
    const siteMatch = matchesSelection(siteSelections, row.Site);
    const serviceMatch = matchesSelection(serviceSelections, row.Service);
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
  return Array.from(map.values()).sort(
    (a, b) => parseIsoDateLocal(a.date) - parseIsoDateLocal(b.date)
  );
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

function getDistributionData(rows, metricKey, requestedDimension = 'Service') {
  const dimensionMap = new Map([
    ['Service', (row) => row.Service],
    ['Site', (row) => row.Site],
    ['Year', (row) => row.Year]
  ]);

  const dimension = dimensionMap.has(requestedDimension) ? requestedDimension : 'Service';
  const groupFn = dimensionMap.get(dimension);

  if (!rows.length || !groupFn) {
    return { labels: [], values: [], dimension };
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
    if (dimension === 'Year') {
      return a[0].localeCompare(b[0], undefined, { numeric: true });
    }
    return String(a[0]).localeCompare(String(b[0]), undefined, { numeric: true, sensitivity: 'base' });
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

  const distribution = getDistributionData(filtered, metricKey, state.distributionDimension);
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
    elements.summaryTopGroupLabel.textContent = 'No data for selected grouping';
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
  const metricDescription = getMetricDescription(state.metric);

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
            const date = parseIsoDateLocal(label);
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

  const hasData = aggregated.length > 0;
  updateChartAriaLabel(
    elements.trendChartCanvas,
    hasData
      ? `Line chart showing weekly ${metricDescription} totals.`
      : `Line chart showing weekly ${metricDescription} totals. No data available for the current filters.`
  );

  if (!trendChart) {
    trendChart = new Chart(elements.trendChartCanvas, {
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
  const metricDescription = getMetricDescription(state.metric);

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

  const hasData = aggregated.length > 0;
  updateChartAriaLabel(
    elements.monthlyChartCanvas,
    hasData
      ? `Bar chart showing monthly ${metricDescription} totals.`
      : `Bar chart showing monthly ${metricDescription} totals. No data available for the current filters.`
  );

  if (!monthlyChart) {
    monthlyChart = new Chart(elements.monthlyChartCanvas, {
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
  const distribution = getDistributionData(filtered, metricKey, state.distributionDimension);
  elements.distributionLabel.textContent = `Share by ${distribution.dimension.toLowerCase()}`;
  const metricDescription = getMetricDescription(state.metric);
  const dimensionDescription = distribution.dimension.toLowerCase();

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

  const hasData = distribution.values.length > 0;
  updateChartAriaLabel(
    elements.distributionChartCanvas,
    hasData
      ? `Pie chart showing ${metricDescription} by ${dimensionDescription}.`
      : `Pie chart showing ${metricDescription} by ${dimensionDescription}. No data available for the current filters.`
  );

  if (!distributionChart) {
    distributionChart = new Chart(elements.distributionChartCanvas, {
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
    const dateDiff = parseIsoDateLocal(b.Date) - parseIsoDateLocal(a.Date);
    if (dateDiff !== 0) return dateDiff;
    if (a.Site !== b.Site) return a.Site > b.Site ? 1 : -1;
    if (a.Service !== b.Service) return a.Service > b.Service ? 1 : -1;
    return 0;
  });

  const fragment = document.createDocumentFragment();

  const createCell = (value) => {
    const cell = document.createElement('td');
    cell.textContent = value;
    return cell;
  };

  sorted.slice(0, 50).forEach((row) => {
    const tableRow = document.createElement('tr');

    tableRow.append(
      createCell(row.Week),
      createCell(formatDateLabel(row.Date)),
      createCell(row.Site),
      createCell(row.Service),
      createCell(formatNumber(row[metricKey])),
      createCell(formatNumber(row[secondaryKey]))
    );

    fragment.appendChild(tableRow);
  });

  elements.tableBody.replaceChildren(fragment);
}

function updateActiveFilters() {
  const yearSelections = getActiveSelections('year');
  const siteSelections = getActiveSelections('site');
  const serviceSelections = getActiveSelections('service');

  const availableYears = Array.from(new Set(dataset.map((row) => row.Year))).sort();
  let yearLabel;
  if (!yearSelections.length || yearSelections.includes('All')) {
    if (availableYears.length > 1) {
      yearLabel = `all years (${availableYears[0]}–${availableYears[availableYears.length - 1]})`;
    } else if (availableYears.length === 1) {
      yearLabel = `the year ${availableYears[0]}`;
    } else {
      yearLabel = 'all available years';
    }
  } else if (yearSelections.length === 1) {
    yearLabel = `the year ${yearSelections[0]}`;
  } else {
    yearLabel = `the years ${formatList(yearSelections)}`;
  }

  const availableSites = Array.from(new Set(dataset.map((row) => row.Site))).sort();
  let siteLabel;
  if (!siteSelections.length || siteSelections.includes('All')) {
    if (availableSites.length > 1) {
      siteLabel = 'all sites';
    } else if (availableSites.length === 1) {
      siteLabel = `${availableSites[0]} site`;
    } else {
      siteLabel = 'available sites';
    }
  } else if (siteSelections.length === 1) {
    siteLabel = `${siteSelections[0]} site`;
  } else {
    siteLabel = `${formatList(siteSelections)} sites`;
  }

  let serviceLabel;
  if (!serviceSelections.length || serviceSelections.includes('All')) {
    serviceLabel = 'all services';
  } else if (serviceSelections.length === 1) {
    serviceLabel = `${serviceSelections[0]} service`;
  } else {
    serviceLabel = `${formatList(serviceSelections)} services`;
  }
  const metricLabel = getMetricDescription(state.metric);

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

function registerSingleSelectToggle(container, stateKey, { onChange } = {}) {
  if (!container) return;

  container.addEventListener('click', (event) => {
    const button = event.target.closest('.toggle-button');
    if (!button || !container.contains(button)) {
      return;
    }
    const value = button.dataset.value;
    if (!value || state[stateKey] === value) {
      return;
    }

    state[stateKey] = value;
    updateToggleGroupSelection(container, value);
    if (typeof onChange === 'function') {
      onChange(value);
    }
    button.focus();
    updateDashboard();
  });

  container.addEventListener('keydown', (event) => {
    const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
    if (!keys.includes(event.key)) {
      return;
    }
    event.preventDefault();
    const buttons = Array.from(container.querySelectorAll('.toggle-button'));
    if (!buttons.length) {
      return;
    }
    const currentIndex = buttons.findIndex((btn) => btn.dataset.value === state[stateKey]);
    let targetIndex = currentIndex >= 0 ? currentIndex : 0;

    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      targetIndex = targetIndex <= 0 ? buttons.length - 1 : targetIndex - 1;
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      targetIndex = targetIndex === buttons.length - 1 ? 0 : targetIndex + 1;
    } else if (event.key === 'Home') {
      targetIndex = 0;
    } else if (event.key === 'End') {
      targetIndex = buttons.length - 1;
    }

    const targetButton = buttons[targetIndex];
    if (targetButton) {
      targetButton.focus();
      targetButton.click();
    }
  });
}

function registerMultiSelectToggle(container, stateKey, { onChange } = {}) {
  if (!container) return;

  container.addEventListener('click', (event) => {
    const button = event.target.closest('.toggle-button');
    if (!button || !container.contains(button)) {
      return;
    }

    const value = button.dataset.value;
    if (!value) {
      return;
    }

    const options = Array.from(container.querySelectorAll('.toggle-button')).map((btn) => btn.dataset.value);
    const current = getActiveSelections(stateKey);
    let next;

    if (value === 'All') {
      next = ['All'];
    } else {
      const hasValue = current.includes(value);
      if (hasValue) {
        next = current.filter((item) => item !== value && item !== 'All');
      } else {
        next = current.filter((item) => item !== 'All');
        next.push(value);
      }

      if (!next.length) {
        next = ['All'];
      }
    }

    const normalized = applySelection(stateKey, next, options);
    updateMultiToggleSelection(container, stateKey);

    if (typeof onChange === 'function') {
      onChange(normalized);
    }

    button.focus();
    updateDashboard();
  });

  container.addEventListener('keydown', (event) => {
    const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
    if (!keys.includes(event.key)) {
      return;
    }

    const buttons = Array.from(container.querySelectorAll('.toggle-button'));
    if (!buttons.length) {
      return;
    }

    const currentIndex = buttons.indexOf(document.activeElement);
    let targetIndex = currentIndex >= 0 ? currentIndex : 0;

    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      targetIndex = targetIndex <= 0 ? buttons.length - 1 : targetIndex - 1;
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      targetIndex = targetIndex === buttons.length - 1 ? 0 : targetIndex + 1;
    } else if (event.key === 'Home') {
      targetIndex = 0;
    } else if (event.key === 'End') {
      targetIndex = buttons.length - 1;
    }

    const targetButton = buttons[targetIndex];
    if (targetButton) {
      targetButton.focus();
    }

    event.preventDefault();
  });
}

function attachEventListeners() {
  registerMultiSelectToggle(elements.yearToggle, 'year');
  registerMultiSelectToggle(elements.siteToggle, 'site', {
    onChange: () => {
      updateServiceOptions();
    }
  });
  registerMultiSelectToggle(elements.serviceToggle, 'service');
  registerSingleSelectToggle(elements.distributionToggle, 'distributionDimension');
  updateToggleGroupSelection(elements.distributionToggle, state.distributionDimension);

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

  state.year = ['All'];
  state.site = ['All'];
  state.service = ['All'];

  populateFilterOptions();

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
      message: `Using placeholder dataset generated for demonstration across multiple sites and years. Rows available: ${formatNumber(data.length)}.`,
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
