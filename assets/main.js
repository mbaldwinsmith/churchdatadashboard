import { monthRank, parseCsv, parseIsoDateLocal } from './csvParser.mjs';
import { MAX_FILE_SIZE_BYTES, describeFileSize } from './csvSecurity.mjs';

const state = {
  year: ['All'],
  site: ['All'],
  service: ['All'],
  metric: 'Attendance',
  distributionDimension: 'Service'
};

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
  summaryAverageGrowth: document.getElementById('summaryAverageGrowth'),
  summaryAverageGrowthLabel: document.getElementById('summaryAverageGrowthLabel'),
  distributionLabel: document.getElementById('distributionLabel'),
  activeFilters: document.getElementById('activeFilters'),
  metricHeader: document.getElementById('metricHeader'),
  secondaryMetricHeader: document.getElementById('secondaryMetricHeader'),
  tableBody: document.getElementById('tableBody'),
  trendChartCanvas: document.getElementById('trendChart'),
  monthlyChartCanvas: document.getElementById('monthlyChart'),
  distributionChartCanvas: document.getElementById('distributionChart'),
  distributionChartServiceCanvas: document.getElementById('distributionChartService'),
  distributionChartSiteCanvas: document.getElementById('distributionChartSite'),
  distributionChartYearCanvas: document.getElementById('distributionChartYear')
};

const distributionLayoutQuery =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(min-width: 1024px)')
    : {
        matches: false,
        addEventListener: null,
        addListener: null
      };

let dataset = [];
let trendChart;
let monthlyChart;
let distributionChart;
const distributionChartsByDimension = {
  Service: null,
  Site: null,
  Year: null
};
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

function setChartAreaState(canvas, hasData) {
  if (!canvas) return;
  const chartArea = canvas.closest('.chart-area');
  if (!chartArea) return;
  chartArea.classList.toggle('is-empty', !hasData);
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

function calculateAverageGrowth(aggregated) {
  if (!Array.isArray(aggregated) || aggregated.length < 2) {
    const startDate = aggregated && aggregated[0] ? aggregated[0].date : null;
    const endDate = aggregated && aggregated[aggregated.length - 1]
      ? aggregated[aggregated.length - 1].date
      : null;
    return {
      value: 0,
      periods: 0,
      startDate,
      endDate,
      hasBaseline: false,
      hasRange: false
    };
  }

  const baselineIndex = aggregated.findIndex((entry) => entry.value > 0);
  const startEntry = baselineIndex !== -1 ? aggregated[baselineIndex] : aggregated[0];
  const lastEntry = aggregated[aggregated.length - 1];

  if (baselineIndex === -1) {
    return {
      value: 0,
      periods: aggregated.length - 1,
      startDate: startEntry.date,
      endDate: lastEntry.date,
      hasBaseline: false,
      hasRange: aggregated.length > 1
    };
  }

  const slice = aggregated.slice(baselineIndex);

  if (slice.length < 2) {
    return {
      value: 0,
      periods: 0,
      startDate: startEntry.date,
      endDate: lastEntry.date,
      hasBaseline,
      hasRange: false
    };
  }

  const xs = slice.map((_, index) => index);
  const ys = slice.map((entry) => entry.value);
  const meanX = xs.reduce((sum, value) => sum + value, 0) / xs.length;
  const meanY = ys.reduce((sum, value) => sum + value, 0) / ys.length;

  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < xs.length; index += 1) {
    const dx = xs[index] - meanX;
    numerator += dx * (ys[index] - meanY);
    denominator += dx * dx;
  }

  const slope = denominator === 0 ? 0 : numerator / denominator;
  const intercept = meanY - slope * meanX;
  const trendStart = intercept;
  const trendEnd = slope * xs[xs.length - 1] + intercept;
  const hasBaseline = trendStart > 0;

  if (!hasBaseline) {
    return {
      value: 0,
      periods: slice.length - 1,
      startDate: startEntry.date,
      endDate: lastEntry.date,
      hasBaseline: false,
      hasRange: true
    };
  }

  const percentChange = ((trendEnd - trendStart) / trendStart) * 100;

  return {
    value: percentChange,
    periods: slice.length - 1,
    startDate: startEntry.date,
    endDate: lastEntry.date,
    hasBaseline,
    hasRange: true
  };
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

  const growthStats = calculateAverageGrowth(aggregated);
  const startLabel = growthStats.startDate ? formatDateLabel(growthStats.startDate) : null;
  const endLabel = growthStats.endDate ? formatDateLabel(growthStats.endDate) : null;
  if (growthStats.periods > 0) {
    const sign = growthStats.value > 0 ? '+' : growthStats.value < 0 ? '−' : '';
    const formattedValue = formatNumber(Math.abs(growthStats.value), { decimals: 1 });
    elements.summaryAverageGrowth.textContent = `${sign}${formattedValue}%`;

    if (startLabel && endLabel) {
      elements.summaryAverageGrowthLabel.textContent = `Average trendline change from ${startLabel} to ${endLabel}`;
    } else {
      elements.summaryAverageGrowthLabel.textContent = 'Average trendline change across the selected period';
    }
  } else {
    elements.summaryAverageGrowth.textContent = '0%';

    if (aggregated.length < 2) {
      elements.summaryAverageGrowthLabel.textContent = 'Select at least two weeks to see trendline change';
    } else if (!growthStats.hasBaseline) {
      if (startLabel && endLabel) {
        elements.summaryAverageGrowthLabel.textContent = `Trendline change from ${startLabel} to ${endLabel} requires a non-zero starting week`;
      } else {
        elements.summaryAverageGrowthLabel.textContent = 'Trendline change requires a non-zero starting week';
      }
    } else if (!growthStats.hasRange) {
      if (startLabel && endLabel) {
        elements.summaryAverageGrowthLabel.textContent = `Trendline change from ${startLabel} to ${endLabel} requires additional week-over-week data`;
      } else {
        elements.summaryAverageGrowthLabel.textContent = 'Trendline change requires additional week-over-week data';
      }
    } else {
      elements.summaryAverageGrowthLabel.textContent = 'Trendline change not available for the selected period';
    }
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
  setChartAreaState(elements.trendChartCanvas, hasData);

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
  setChartAreaState(elements.monthlyChartCanvas, hasData);

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
  const metricDescription = getMetricDescription(state.metric);
  const dimensions = ['Service', 'Site', 'Year'];
  const distributionDataMap = dimensions.reduce((acc, dimension) => {
    acc[dimension] = getDistributionData(filtered, metricKey, dimension);
    return acc;
  }, {});
  const activeDistribution = distributionDataMap[state.distributionDimension] || distributionDataMap.Service;
  const showAllDimensions = distributionLayoutQuery.matches;

  if (showAllDimensions) {
    elements.distributionLabel.textContent = 'Share by service, site, and year';
  } else {
    elements.distributionLabel.textContent = `Share by ${activeDistribution.dimension.toLowerCase()}`;
  }

  const areaHasData = showAllDimensions
    ? dimensions.some((dimension) => distributionDataMap[dimension].values.length > 0)
    : activeDistribution.values.length > 0;
  setChartAreaState(elements.distributionChartCanvas, areaHasData);

  const buildChartData = (distribution) => ({
    labels: distribution.labels,
    datasets: [
      {
        label: state.metric,
        data: distribution.values,
        backgroundColor: generatePalette(distribution.labels.length)
      }
    ]
  });

  const buildOptions = () => ({
    maintainAspectRatio: false,
    interaction: {
      mode: 'nearest',
      intersect: true
    },
    layout: {
      padding: {
        bottom: 24
      }
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
  });

  const applyChartUpdate = (chartInstance, canvas, distribution) => {
    if (!canvas) {
      return chartInstance;
    }

    const dimensionLabel = distribution.dimension.toLowerCase();
    const hasData = distribution.values.length > 0;
    updateChartAriaLabel(
      canvas,
      hasData
        ? `Pie chart showing ${metricDescription} by ${dimensionLabel}.`
        : `Pie chart showing ${metricDescription} by ${dimensionLabel}. No data available for the current filters.`
    );

    if (!chartInstance) {
      return new Chart(canvas, {
        type: 'pie',
        data: buildChartData(distribution),
        options: buildOptions()
      });
    }

    chartInstance.data = buildChartData(distribution);
    chartInstance.options = buildOptions();
    chartInstance.update();
    return chartInstance;
  };

  distributionChart = applyChartUpdate(distributionChart, elements.distributionChartCanvas, activeDistribution);

  const shouldUpdateAllDimensions = showAllDimensions || Object.values(distributionChartsByDimension).some((chart) => chart);

  if (shouldUpdateAllDimensions) {
    const canvasMap = {
      Service: elements.distributionChartServiceCanvas,
      Site: elements.distributionChartSiteCanvas,
      Year: elements.distributionChartYearCanvas
    };

    dimensions.forEach((dimension) => {
      const canvas = canvasMap[dimension];
      const distribution = distributionDataMap[dimension];
      distributionChartsByDimension[dimension] = applyChartUpdate(
        distributionChartsByDimension[dimension],
        canvas,
        distribution
      );

      if (showAllDimensions && distributionChartsByDimension[dimension]) {
        distributionChartsByDimension[dimension].resize();
      }
    });
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

  if (!sorted.length) {
    const emptyRow = document.createElement('tr');
    emptyRow.className = 'table-empty-state';
    const emptyCell = document.createElement('td');
    emptyCell.colSpan = 6;
    emptyCell.textContent = 'No data matches your filters yet—try widening them.';
    emptyRow.appendChild(emptyCell);
    fragment.appendChild(emptyRow);
  } else {
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
  }

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

const handleDistributionLayoutChange = () => {
  updateDashboard();
};

if (typeof distributionLayoutQuery.addEventListener === 'function') {
  distributionLayoutQuery.addEventListener('change', handleDistributionLayoutChange);
} else if (typeof distributionLayoutQuery.addListener === 'function') {
  distributionLayoutQuery.addListener(handleDistributionLayoutChange);
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

  if (file.size === 0) {
    setDatasetStatus('The selected file is empty.', 'error');
    input.value = '';
    return;
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    setDatasetStatus(
      `The selected file is too large. The maximum supported size is ${describeFileSize(MAX_FILE_SIZE_BYTES)}.`,
      'error'
    );
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
