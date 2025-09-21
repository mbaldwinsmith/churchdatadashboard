import {
  monthNames,
  monthRank,
  parseCsv,
  parseIsoDateLocal,
  computeIsoWeek
} from './csvParser.mjs';
import { MAX_FILE_SIZE_BYTES, describeFileSize } from './csvSecurity.mjs';

const STORAGE_KEY = 'church-dashboard-state-v2';
const DEFAULT_TREND_METRICS = ['Attendance'];

const colors = {
  Attendance: {
    line: '#3f6ae0',
    fill: 'rgba(63, 106, 224, 0.15)',
    avg: '#102a83'
  },
  'Kids Checked-in': {
    line: '#2eb88a',
    fill: 'rgba(46, 184, 138, 0.18)',
    avg: '#146b4f'
  }
};

const distributionPalette = [
  '#3f6ae0',
  '#2eb88a',
  '#f2a93b',
  '#ef5b5b',
  '#7e5bef',
  '#15aabf',
  '#f76707',
  '#20c997',
  '#1f2933',
  '#ff6f91',
  '#ffd166'
];

const defaultState = {
  year: ['All'],
  site: ['All'],
  service: ['All'],
  metric: 'Attendance',
  trendMetrics: [...DEFAULT_TREND_METRICS],
  distributionDimension: 'Service',
  distributionView: 'pie',
  monthlyMode: 'grouped',
  includeZeros: false,
  search: '',
  tableSort: { key: 'Date', direction: 'desc' },
  tableLimit: 50
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
  distributionViewToggle: document.getElementById('distributionViewToggle'),
  monthlyModeToggle: document.getElementById('monthlyModeToggle'),
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
  tableHeaderCells: document.querySelectorAll('.table-wrapper thead th'),
  tableDescription: document.getElementById('tableDescription'),
  tablePageSize: document.getElementById('tablePageSize'),
  quickSearch: document.getElementById('quickSearch'),
  trendMetricToggles: document.querySelectorAll('.trend-metric'),
  includeZeros: document.getElementById('includeZeros'),
  chartCards: document.querySelectorAll('.chart-card'),
  chartExportButtons: document.querySelectorAll('[data-export]'),
  storySummary: document.getElementById('storySummary'),
  anomalyHighlights: document.getElementById('anomalyHighlights'),
  ingestNotices: document.getElementById('ingestNotices'),
  emptyState: document.getElementById('emptyState'),
  controlsSection: document.querySelector('.controls'),
  toggleButtons: document.querySelectorAll('.toggle-button')
};

const state = loadPersistedState();

let dataset = [];
let rawDataset = [];
let servicesBySite = new Map();
let serviceAliasInfo = [];
let duplicatesInfo = null;
let duplicateResolution = 'sum';
let dataRevision = 0;
let latestFilterKey = '';
let latestFilteredRows = [];

let filteredCache = { key: null, rows: [] };
const aggregationCache = new Map();

let trendChart;
let monthlyChart;
let distributionChart;
let ChartJS;
let csvWorker;

function loadPersistedState() {
  const params = new URLSearchParams(window.location.search);
  let saved = {};
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      saved = JSON.parse(stored) || {};
    }
  } catch (error) {
    console.warn('Unable to read saved preferences', error);
  }

  const parseList = (value) => {
    if (!value) return undefined;
    return value.split('|').map((item) => item.trim()).filter(Boolean);
  };

  const merged = { ...defaultState, ...saved };

  const yearParam = parseList(params.get('year'));
  const siteParam = parseList(params.get('site'));
  const serviceParam = parseList(params.get('service'));

  if (yearParam) merged.year = yearParam;
  if (siteParam) merged.site = siteParam;
  if (serviceParam) merged.service = serviceParam;

  if (params.has('metric')) merged.metric = params.get('metric');
  if (params.has('trend')) merged.trendMetrics = parseList(params.get('trend')) || merged.trendMetrics;
  if (params.has('dist')) merged.distributionDimension = params.get('dist');
  if (params.has('view')) merged.distributionView = params.get('view');
  if (params.has('month')) merged.monthlyMode = params.get('month');
  if (params.has('zeros')) merged.includeZeros = params.get('zeros') === '1';
  if (params.has('q')) merged.search = params.get('q');
  if (params.has('limit')) merged.tableLimit = Number(params.get('limit')) || merged.tableLimit;
  if (params.has('sort')) {
    const [key, direction] = params.get('sort').split(':');
    if (key) {
      merged.tableSort = { key, direction: direction === 'asc' ? 'asc' : 'desc' };
    }
  }

  return merged;
}

function persistState() {
  const safeState = {
    year: state.year,
    site: state.site,
    service: state.service,
    metric: state.metric,
    trendMetrics: state.trendMetrics,
    distributionDimension: state.distributionDimension,
    distributionView: state.distributionView,
    monthlyMode: state.monthlyMode,
    includeZeros: state.includeZeros,
    search: state.search,
    tableSort: state.tableSort,
    tableLimit: state.tableLimit
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(safeState));
  } catch (error) {
    console.warn('Unable to persist dashboard state', error);
  }

  const params = new URLSearchParams();

  const encodeList = (key, values) => {
    const selections = Array.isArray(values) ? values.filter((value) => value !== 'All') : [];
    if (selections.length) {
      params.set(key, selections.join('|'));
    }
  };

  encodeList('year', state.year);
  encodeList('site', state.site);
  encodeList('service', state.service);

  if (state.metric !== defaultState.metric) {
    params.set('metric', state.metric);
  }

  if (state.trendMetrics.sort().join('|') !== DEFAULT_TREND_METRICS.sort().join('|')) {
    params.set('trend', state.trendMetrics.join('|'));
  }

  if (state.distributionDimension !== defaultState.distributionDimension) {
    params.set('dist', state.distributionDimension);
  }

  if (state.distributionView !== defaultState.distributionView) {
    params.set('view', state.distributionView);
  }

  if (state.monthlyMode !== defaultState.monthlyMode) {
    params.set('month', state.monthlyMode);
  }

  if (state.includeZeros) {
    params.set('zeros', '1');
  }

  if (state.search) {
    params.set('q', state.search);
  }

  if (state.tableLimit !== defaultState.tableLimit) {
    params.set('limit', String(state.tableLimit));
  }

  if (state.tableSort.key !== defaultState.tableSort.key || state.tableSort.direction !== defaultState.tableSort.direction) {
    params.set('sort', `${state.tableSort.key}:${state.tableSort.direction}`);
  }

  const query = params.toString();
  const newUrl = query ? `${window.location.pathname}?${query}` : window.location.pathname;
  window.history.replaceState(null, '', newUrl);
}

function getChartModule() {
  if (ChartJS) {
    return Promise.resolve(ChartJS);
  }
  return import('https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.esm.js').then((module) => {
    ChartJS = module.Chart;
    ChartJS.defaults.font.family = getComputedStyle(document.documentElement).fontFamily;
    ChartJS.defaults.color = '#1f2933';
    ChartJS.defaults.plugins.legend.labels.usePointStyle = true;
    return ChartJS;
  });
}

function getCsvWorker() {
  if (!csvWorker) {
    csvWorker = new Worker(new URL('./csvWorker.js', import.meta.url), { type: 'module' });
  }
  return csvWorker;
}

function formatNumber(value, { decimals = 0 } = {}) {
  return Number(value || 0).toLocaleString('en-US', {
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

function toggleEmptyState(show) {
  if (!elements.emptyState) return;
  elements.emptyState.hidden = !show;
  elements.chartCards.forEach((card) => {
    card.classList.toggle('disabled', show);
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

function renderIngestNotices() {
  if (!elements.ingestNotices) return;
  elements.ingestNotices.innerHTML = '';

  const notices = [];

  if (serviceAliasInfo.length) {
    const summary = serviceAliasInfo
      .map(({ canonical, aliases }) => `${canonical} ← ${aliases.join(', ')}`)
      .join('\n');
    notices.push({
      type: 'info',
      message: 'Service aliases resolved',
      detail: summary
    });
  }

  if (duplicatesInfo && duplicatesInfo.totalGroups > 0) {
    notices.push({
      type: 'warning',
      message: `${duplicatesInfo.totalGroups} duplicate ${duplicatesInfo.totalGroups === 1 ? 'row' : 'rows'} detected (same Date, Site, Service).`,
      detail: 'Choose how duplicates should be handled.'
    });
  }

  notices.forEach((notice) => {
    const wrapper = document.createElement('div');
    wrapper.className = `ingest-notice${notice.type === 'warning' ? ' warning' : ''}${notice.type === 'error' ? ' error' : ''}`;
    const message = document.createElement('strong');
    message.textContent = notice.message;
    wrapper.appendChild(message);
    if (notice.detail) {
      const detail = document.createElement('pre');
      detail.textContent = notice.detail;
      wrapper.appendChild(detail);
    }
    elements.ingestNotices.appendChild(wrapper);
  });

  if (duplicatesInfo && duplicatesInfo.totalGroups > 0) {
    const control = document.createElement('div');
    control.className = 'ingest-notice warning';
    const label = document.createElement('label');
    label.textContent = 'Duplicate handling';
    label.style.fontWeight = '600';
    label.style.display = 'block';
    label.style.marginBottom = '0.35rem';

    const select = document.createElement('select');
    select.innerHTML = `
      <option value="sum">Sum duplicates</option>
      <option value="latest">Keep latest entry</option>
      <option value="first">Keep first entry</option>
    `;
    select.value = duplicateResolution;

    const applyButton = document.createElement('button');
    applyButton.type = 'button';
    applyButton.className = 'pill-button tertiary';
    applyButton.textContent = 'Apply';
    applyButton.style.marginTop = '0.5rem';

    applyButton.addEventListener('click', () => {
      duplicateResolution = select.value;
      const resolvedRows = resolveDuplicates(rawDataset, duplicateResolution);
      applyResolvedDataset(resolvedRows, { message: 'Duplicate handling updated.', type: 'success', skipNotices: true });
    });

    control.appendChild(label);
    control.appendChild(select);
    control.appendChild(applyButton);
    elements.ingestNotices.appendChild(control);
  }
}

function hydrateRow(row) {
  const cloned = { ...row };
  cloned.Week = Number(cloned.Week);
  cloned.Attendance = Number(cloned.Attendance);
  cloned['Kids Checked-in'] = Number(cloned['Kids Checked-in']);
  cloned.Year = String(cloned.Year ?? '');
  cloned.Month = cloned.Month || monthNames[parseIsoDateLocal(cloned.Date).getMonth()];
  cloned.Site = String(cloned.Site ?? '').trim();
  cloned.Service = String(cloned.Service ?? '').trim();

  if (!cloned.Date) {
    throw new Error('Date is required.');
  }

  const parsed = parseIsoDateLocal(cloned.Date);
  const { isoWeek, isoYear } = computeIsoWeek(parsed);
  cloned.IsoWeek = Number(cloned.IsoWeek ?? isoWeek);
  cloned.IsoYear = String(cloned.IsoYear ?? isoYear);
  const isoWeekIndex = String(cloned.IsoWeek).padStart(2, '0');
  cloned.YearWeek = cloned.YearWeek || `${cloned.IsoYear}-${isoWeekIndex}`;

  return cloned;
}

function normalizeServiceAliases(rows) {
  const canonicalMap = new Map();
  const merges = new Map();

  rows.forEach((row) => {
    const trimmed = row.Service.replace(/\s+/g, ' ').trim();
    const key = trimmed.toLowerCase();
    if (!canonicalMap.has(key)) {
      canonicalMap.set(key, trimmed);
      merges.set(trimmed, new Set([trimmed]));
      row.Service = trimmed;
    } else {
      const canonical = canonicalMap.get(key);
      merges.get(canonical).add(trimmed);
      row.Service = canonical;
    }
  });

  const summary = [];
  merges.forEach((aliases, canonical) => {
    const aliasList = Array.from(aliases).filter((alias) => alias !== canonical);
    if (aliasList.length) {
      summary.push({ canonical, aliases: aliasList });
    }
  });

  return summary;
}

function detectDuplicates(rows) {
  const groups = new Map();
  rows.forEach((row, index) => {
    const key = `${row.Date}|${row.Site}|${row.Service}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(index);
  });
  const duplicateGroups = Array.from(groups.values()).filter((indexes) => indexes.length > 1);
  return {
    totalGroups: duplicateGroups.length,
    groups
  };
}

function resolveDuplicates(rows, mode = 'sum') {
  if (!duplicatesInfo || duplicatesInfo.totalGroups === 0) {
    return rows.map((row) => ({ ...row }));
  }

  const resolved = new Map();

  rows.forEach((row, index) => {
    const key = `${row.Date}|${row.Site}|${row.Service}`;
    if (!resolved.has(key)) {
      resolved.set(key, { ...row, _sourceIndex: index });
      return;
    }

    const current = resolved.get(key);
    if (mode === 'sum') {
      current.Attendance += row.Attendance;
      current['Kids Checked-in'] += row['Kids Checked-in'];
    } else if (mode === 'latest') {
      if (index > current._sourceIndex) {
        resolved.set(key, { ...row, _sourceIndex: index });
      }
    }
  });

  return Array.from(resolved.values()).map(({ _sourceIndex, ...rest }) => rest);
}

function applyResolvedDataset(rows, { message, type = 'info', skipNotices = false } = {}) {
  dataset = rows.map((row) => ({ ...row }));
  servicesBySite = buildServicesBySite(dataset);
  dataRevision += 1;
  filteredCache = { key: null, rows: [] };
  aggregationCache.clear();
  populateFilterOptions();
  applyStateToControls();
  updateDashboard();
  if (!skipNotices) {
    renderIngestNotices();
  }
  if (elements.datasetUpload) {
    elements.datasetUpload.value = '';
  }
  const defaultMessage = `Loaded ${formatNumber(dataset.length)} rows.`;
  setDatasetStatus(message || defaultMessage, type);
  toggleEmptyState(false);
}

function ingestDataset(rows, feedback = {}) {
  rawDataset = rows.map((row) => hydrateRow(row));
  serviceAliasInfo = normalizeServiceAliases(rawDataset);
  duplicatesInfo = detectDuplicates(rawDataset);
  duplicateResolution = 'sum';
  const resolvedRows = resolveDuplicates(rawDataset, duplicateResolution);
  applyResolvedDataset(resolvedRows, feedback);
}

function buildServicesBySite(data) {
  const map = new Map();
  data.forEach((row) => {
    if (!map.has(row.Site)) {
      map.set(row.Site, new Set());
    }
    map.get(row.Site).add(row.Service);
  });
  return new Map(Array.from(map.entries()).map(([site, services]) => [site, Array.from(services).sort()]));
}

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
    normalized = normalized.filter((value) => value !== 'All');
  }

  if (options.length) {
    normalized = options.filter((option) => normalized.includes(option));
    if (!normalized.length && hasAllOption) {
      normalized = ['All'];
    }
  }

  state[stateKey] = normalized;
  return normalized;
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

function matchesSelection(selections, value) {
  return !selections.length || selections.includes('All') || selections.includes(value);
}

function computeFilterKey() {
  return [
    dataRevision,
    state.year.join('|'),
    state.site.join('|'),
    state.service.join('|'),
    state.includeZeros ? '1' : '0',
    state.search.toLowerCase()
  ].join('::');
}

function filterRows() {
  const yearSelections = getActiveSelections('year');
  const siteSelections = getActiveSelections('site');
  const serviceSelections = getActiveSelections('service');
  const query = state.search.trim().toLowerCase();

  return dataset.filter((row) => {
    const yearMatch = matchesSelection(yearSelections, row.Year);
    const siteMatch = matchesSelection(siteSelections, row.Site);
    const serviceMatch = matchesSelection(serviceSelections, row.Service);
    const zeroMatch = state.includeZeros || row.Attendance > 0;
    const searchMatch =
      !query ||
      row.Site.toLowerCase().includes(query) ||
      row.Service.toLowerCase().includes(query) ||
      row.Year.toLowerCase().includes(query) ||
      row.Month.toLowerCase().includes(query);
    return yearMatch && siteMatch && serviceMatch && zeroMatch && searchMatch;
  });
}

function getFilteredRows() {
  const key = computeFilterKey();
  if (filteredCache.key !== key) {
    filteredCache = {
      key,
      rows: filterRows()
    };
    aggregationCache.delete(key);
  }
  latestFilterKey = key;
  latestFilteredRows = filteredCache.rows;
  return filteredCache.rows;
}

function aggregateData(rows) {
  const key = latestFilterKey;
  if (!aggregationCache.has(key)) {
    const byDateMap = new Map();
    const monthlyMap = new Map();

    rows.forEach((row) => {
      const dateKey = row.Date;
      if (!byDateMap.has(dateKey)) {
        byDateMap.set(dateKey, {
          date: row.Date,
          isoWeek: row.IsoWeek,
          isoYear: row.IsoYear,
          yearWeek: row.YearWeek,
          attendance: 0,
          kids: 0
        });
      }
      const record = byDateMap.get(dateKey);
      record.attendance += row.Attendance;
      record.kids += row['Kids Checked-in'];

      const monthIndex = monthRank[row.Month];
      const monthKey = `${String(monthIndex).padStart(2, '0')}-${row.Month}`;
      if (!monthlyMap.has(monthKey)) {
        monthlyMap.set(monthKey, {
          month: row.Month,
          monthIndex,
          totals: new Map()
        });
      }
      const monthEntry = monthlyMap.get(monthKey);
      if (!monthEntry.totals.has(row.Year)) {
        monthEntry.totals.set(row.Year, { attendance: 0, kids: 0 });
      }
      const totals = monthEntry.totals.get(row.Year);
      totals.attendance += row.Attendance;
      totals.kids += row['Kids Checked-in'];
    });

    const aggregated = {
      byDate: Array.from(byDateMap.values()).sort((a, b) => parseIsoDateLocal(a.date) - parseIsoDateLocal(b.date)),
      monthly: Array.from(monthlyMap.values()).sort((a, b) => a.monthIndex - b.monthIndex)
    };
    aggregationCache.set(key, aggregated);
  }
  return aggregationCache.get(key);
}

function getDistributionData(rows, dimension) {
  const dimensionMap = new Map([
    ['Service', (row) => row.Service],
    ['Site', (row) => row.Site],
    ['Year', (row) => row.Year]
  ]);

  const dimensionKey = dimensionMap.has(dimension) ? dimension : 'Service';
  const groupFn = dimensionMap.get(dimensionKey);

  const map = new Map();
  rows.forEach((row) => {
    const key = groupFn(row);
    if (!map.has(key)) {
      map.set(key, { attendance: 0, kids: 0 });
    }
    const entry = map.get(key);
    entry.attendance += row.Attendance;
    entry.kids += row['Kids Checked-in'];
  });

  const entries = Array.from(map.entries()).sort((a, b) =>
    String(a[0]).localeCompare(String(b[0]), undefined, { numeric: true, sensitivity: 'base' })
  );

  return entries.map(([label, values]) => ({ label, ...values }));
}

function getMedian(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
}

function getRollingAverage(values, windowSize = 4) {
  return values.map((value, index) => {
    const start = Math.max(0, index - windowSize + 1);
    const window = values.slice(start, index + 1);
    const sum = window.reduce((acc, item) => acc + item, 0);
    return window.length ? sum / window.length : value;
  });
}

function updateSummaries(filtered) {
  const { byDate } = aggregateData(filtered);
  const metricKey = state.metric === 'Attendance' ? 'attendance' : 'kids';
  const total = byDate.reduce((sum, item) => sum + item[metricKey], 0);
  const average = byDate.length ? total / byDate.length : 0;

  elements.summaryTotal.textContent = formatNumber(total);
  elements.summaryTotalLabel.textContent = `Total ${state.metric}`;
  elements.summaryAverage.textContent = formatNumber(average, { decimals: 1 });

  if (byDate.length) {
    const peak = byDate.reduce((acc, item) => (item[metricKey] > acc[metricKey] ? item : acc));
    elements.summaryPeak.textContent = formatNumber(peak[metricKey]);
    elements.summaryPeakLabel.textContent = `${formatDateLabel(peak.date)} (ISO Week ${peak.isoWeek} of ${peak.isoYear})`;
  } else {
    elements.summaryPeak.textContent = '0';
    elements.summaryPeakLabel.textContent = 'No data available';
  }

  const distribution = getDistributionData(filtered, state.distributionDimension);
  if (distribution.length) {
    const metricLabel = state.metric === 'Attendance' ? 'attendance' : 'kids check-ins';
    const best = distribution.reduce((acc, entry) =>
      entry[metricKey] > acc[metricKey] ? entry : acc
    );
    elements.summaryTopGroup.textContent = formatNumber(best[metricKey]);
    elements.summaryTopGroupLabel.textContent = `${state.distributionDimension}: ${best.label}`;
    elements.summaryTopGroupLabel.setAttribute('title', `${formatNumber(best[metricKey])} ${metricLabel}`);
  } else {
    elements.summaryTopGroup.textContent = '0';
    elements.summaryTopGroupLabel.textContent = 'No data for selected grouping';
  }
}

function updateTrendChart(filtered) {
  const { byDate } = aggregateData(filtered);
  const labels = byDate.map((item) => item.date);
  const metrics = state.trendMetrics.length ? state.trendMetrics : [state.metric];

  const datasets = metrics.map((metric) => {
    const key = metric === 'Attendance' ? 'attendance' : 'kids';
    const colorConfig = colors[metric] || colors.Attendance;
    const values = byDate.map((item) => item[key]);
    const positiveValues = values.filter((value) => value > 0);
    const median = getMedian(positiveValues);
    const threshold = median * 5;
    const outlierIndexes = new Set();
    values.forEach((value, index) => {
      if (median > 0 && value >= threshold) {
        outlierIndexes.add(index);
      }
    });

    const rolling = getRollingAverage(values);

    return [
      {
        label: metric,
        data: values,
        borderColor: colorConfig.line,
        backgroundColor: colorConfig.fill,
        fill: true,
        tension: 0.35,
        pointRadius: values.map((value, index) => (outlierIndexes.has(index) ? 5 : 0)),
        pointBorderWidth: values.map((value, index) => (outlierIndexes.has(index) ? 2 : 0)),
        pointBorderColor: colorConfig.avg,
        pointBackgroundColor: values.map((value, index) => (outlierIndexes.has(index) ? '#fff' : colorConfig.line)),
        _outlierTooltip: threshold
      },
      {
        label: `${metric} (4-week avg)`,
        data: rolling,
        borderColor: colorConfig.avg,
        backgroundColor: 'transparent',
        borderDash: [6, 4],
        tension: 0.35,
        pointRadius: 0,
        fill: false
      }
    ];
  });

  const flattenedDatasets = datasets.flat();

  const metricDescription = state.trendMetrics.length > 1 ? 'metrics' : state.metric.toLowerCase();

  const hasData = byDate.length > 0;
  updateChartAriaLabel(
    document.getElementById('trendChart'),
    hasData
      ? `Line chart showing weekly ${metricDescription} totals.`
      : `Line chart showing weekly ${metricDescription} totals. No data available for the current filters.`
  );

  getChartModule().then((Chart) => {
    if (!trendChart) {
      trendChart = new Chart(document.getElementById('trendChart'), {
        type: 'line',
        data: {
          labels,
          datasets: flattenedDatasets
        },
        options: {
          maintainAspectRatio: false,
          interaction: {
            mode: 'nearest',
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
            tooltip: {
              callbacks: {
                title: (items) => items.map((item) => formatDateLabel(item.label)),
                label: (item) => {
                  const datasetMeta = item.dataset._outlierTooltip;
                  const value = formatNumber(item.parsed.y);
                  const base = `${item.dataset.label}: ${value}`;
                  if (datasetMeta && item.raw && Array.isArray(item.dataset.pointRadius)) {
                    const index = item.dataIndex;
                    if (item.dataset.pointRadius[index] > 0) {
                      return `${base} (Potential special event?)`;
                    }
                  }
                  return base;
                }
              }
            }
          },
          onClick: (evt, activeElements) => {
            if (!activeElements.length) return;
            const element = activeElements[0];
            const point = byDate[element.index];
            if (point) {
              state.year = [point.isoYear];
              updateMultiToggleSelection(elements.yearToggle, 'year');
              persistState();
              updateDashboard();
            }
          }
        }
      });
    } else {
      trendChart.data.labels = labels;
      trendChart.data.datasets = flattenedDatasets;
      trendChart.update();
    }
  });
}

function updateMonthlyChart(filtered) {
  const { monthly } = aggregateData(filtered);
  const years = Array.from(
    new Set(filtered.map((row) => row.Year)).values()
  ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const labels = monthly.map((entry) => entry.month);
  const datasets = years.map((year, index) => {
    const values = monthly.map((entry) => {
      const totals = entry.totals.get(year);
      if (!totals) return 0;
      return state.metric === 'Attendance' ? totals.attendance : totals.kids;
    });
    const baseColor = distributionPalette[index % distributionPalette.length];
    return {
      label: year,
      data: values,
      backgroundColor: baseColor,
      stack: state.monthlyMode === 'stacked' ? 'monthly' : undefined,
      borderRadius: 6
    };
  });

  const hasData = datasets.some((dataset) => dataset.data.some((value) => value > 0));
  updateChartAriaLabel(
    document.getElementById('monthlyChart'),
    hasData
      ? 'Bar chart showing monthly totals grouped by month across selected years.'
      : 'Bar chart showing monthly totals. No data available for the current filters.'
  );

  getChartModule().then((Chart) => {
    const options = {
      maintainAspectRatio: false,
      scales: {
        x: {
          stacked: state.monthlyMode === 'stacked',
          ticks: {
            maxRotation: 60,
            minRotation: 30
          },
          grid: {
            display: false
          }
        },
        y: {
          stacked: state.monthlyMode === 'stacked',
          beginAtZero: true,
          ticks: {
            callback: (value) => formatNumber(value)
          }
        }
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: (item) => `${item.dataset.label}: ${formatNumber(item.parsed.y)}`
          }
        }
      },
      onClick: (evt, activeElements) => {
        if (!activeElements.length) return;
        const element = activeElements[0];
        const datasetLabel = years[element.datasetIndex];
        if (datasetLabel) {
          state.year = [datasetLabel];
          updateMultiToggleSelection(elements.yearToggle, 'year');
          persistState();
          updateDashboard();
        }
      }
    };

    if (!monthlyChart) {
      monthlyChart = new Chart(document.getElementById('monthlyChart'), {
        type: 'bar',
        data: {
          labels,
          datasets
        },
        options
      });
    } else {
      monthlyChart.data.labels = labels;
      monthlyChart.data.datasets = datasets;
      monthlyChart.options = { ...monthlyChart.options, ...options };
      monthlyChart.update();
    }
  });
}

function updateDistributionChart(filtered) {
  const distribution = getDistributionData(filtered, state.distributionDimension);
  const metricKey = state.metric === 'Attendance' ? 'attendance' : 'kids';
  const labels = distribution.map((entry) => entry.label);
  const values = distribution.map((entry) => entry[metricKey]);

  const hasData = values.some((value) => value > 0);
  const description = hasData
    ? `Showing distribution of ${state.metric.toLowerCase()} by ${state.distributionDimension.toLowerCase()}.`
    : `Distribution of ${state.metric.toLowerCase()} by ${state.distributionDimension.toLowerCase()}. No data available.`;

  updateChartAriaLabel(document.getElementById('distributionChart'), description);
  elements.distributionLabel.textContent = `Share by ${state.distributionDimension.toLowerCase()}`;

  getChartModule().then((Chart) => {
    const config = {
      labels,
      datasets: [
        {
          label: state.metric,
          data: values,
          backgroundColor: distributionPalette.slice(0, Math.max(values.length, 1)),
          borderWidth: 1
        }
      ]
    };

    const options = {
      maintainAspectRatio: false,
      plugins: {
        tooltip: {
          callbacks: {
            label: (item) => `${item.label}: ${formatNumber(item.parsed)} ${state.metric.toLowerCase()}`
          }
        },
        legend: {
          onClick: (event, legendItem) => {
            const label = legendItem.text;
            if (label) {
              handleDistributionFilter(label);
            }
          }
        }
      },
      onClick: (event, elements) => {
        if (!elements.length) return;
        const element = elements[0];
        const label = labels[element.index];
        if (label) {
          handleDistributionFilter(label);
        }
      }
    };

    const chartType = state.distributionView === 'bar' ? 'bar' : 'pie';

    if (!distributionChart) {
      distributionChart = new Chart(document.getElementById('distributionChart'), {
        type: chartType,
        data: config,
        options
      });
    } else {
      distributionChart.config.type = chartType;
      distributionChart.data = config;
      distributionChart.options = options;
      distributionChart.update();
    }
  });
}

function handleDistributionFilter(label) {
  if (state.distributionDimension === 'Year') {
    state.year = [label];
    updateMultiToggleSelection(elements.yearToggle, 'year');
  } else if (state.distributionDimension === 'Site') {
    state.site = [label];
    updateMultiToggleSelection(elements.siteToggle, 'site');
    updateServiceOptions();
  } else {
    state.service = [label];
    updateMultiToggleSelection(elements.serviceToggle, 'service');
  }
  persistState();
  updateDashboard();
}

function updateTable(filtered) {
  const sortKey = state.tableSort.key;
  const direction = state.tableSort.direction === 'asc' ? 1 : -1;

  const sorted = [...filtered].sort((a, b) => {
    const valueA = a[sortKey];
    const valueB = b[sortKey];
    if (sortKey === 'Date') {
      return (parseIsoDateLocal(valueA) - parseIsoDateLocal(valueB)) * direction;
    }
    if (typeof valueA === 'number' && typeof valueB === 'number') {
      return (valueA - valueB) * direction;
    }
    return String(valueA).localeCompare(String(valueB), undefined, { numeric: true }) * direction;
  });

  const limit = state.tableLimit === 0 ? sorted.length : state.tableLimit;
  const rows = sorted.slice(0, limit);

  elements.tableBody.innerHTML = '';
  rows.forEach((row) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${row.IsoWeek}</td>
      <td>${formatDateLabel(row.Date)}</td>
      <td>${row.Site}</td>
      <td>${row.Service}</td>
      <td>${formatNumber(row.Attendance)}</td>
      <td>${formatNumber(row['Kids Checked-in'])}</td>
    `;
    elements.tableBody.appendChild(tr);
  });

  const descriptionLimit = state.tableLimit === 0 ? 'all available' : state.tableLimit;
  elements.tableDescription.textContent = `Showing the latest ${descriptionLimit} entries based on the selected filters.`;

  elements.tableHeaderCells.forEach((th) => {
    const key = th.dataset.key;
    th.classList.remove('sort-asc', 'sort-desc');
    if (key === sortKey) {
      th.classList.add(direction === 1 ? 'sort-asc' : 'sort-desc');
    }
  });
}

function updateMetricHeaders() {
  elements.metricHeader.textContent = state.metric;
  const secondary = state.metric === 'Attendance' ? 'Kids Checked-in' : 'Attendance';
  elements.secondaryMetricHeader.textContent = secondary;
}

function updateActiveFilters() {
  const yearSelections = getActiveSelections('year');
  const siteSelections = getActiveSelections('site');
  const serviceSelections = getActiveSelections('service');
  const metricLabel = state.metric.toLowerCase();
  const yearLabel = yearSelections.includes('All') ? 'all years' : yearSelections.join(', ');
  const siteLabel = siteSelections.includes('All') ? 'all sites' : siteSelections.join(', ');
  const serviceLabel = serviceSelections.includes('All') ? 'all services' : serviceSelections.join(', ');

  const parts = [`Showing ${metricLabel} for ${serviceLabel} at ${siteLabel} across ${yearLabel}.`];
  if (!state.includeZeros) {
    parts.push('Zero attendance entries hidden.');
  }
  if (state.search) {
    parts.push(`Search filter: "${state.search}".`);
  }

  elements.activeFilters.textContent = parts.join(' ');
}

function updateStory(filtered) {
  if (!filtered.length) {
    elements.storySummary.textContent = 'Adjust filters or upload data to generate fresh insights.';
    elements.anomalyHighlights.innerHTML = '';
    return;
  }

  const { byDate } = aggregateData(filtered);
  const metricKey = state.metric === 'Attendance' ? 'attendance' : 'kids';
  const total = byDate.reduce((sum, item) => sum + item[metricKey], 0);
  const average = byDate.length ? total / byDate.length : 0;
  const services = new Set(filtered.map((row) => row.Service)).size;
  const sites = new Set(filtered.map((row) => row.Site)).size;
  const peak = byDate.reduce((acc, item) => (item[metricKey] > acc[metricKey] ? item : acc));

  elements.storySummary.textContent = `${state.metric} averaged ${formatNumber(average, {
    decimals: 1
  })} per week across ${services} service${services === 1 ? '' : 's'} at ${sites} site${sites === 1 ? '' : 's'}. Peak reached ${formatNumber(
    peak[metricKey]
  )} on ${formatDateLabel(peak.date)} (ISO Week ${peak.isoWeek}).`;

  const highlights = [];
  const { monthly } = aggregateData(filtered);
  if (monthly.length) {
    const lastEntry = monthly[monthly.length - 1];
    const availableYears = Array.from(lastEntry.totals.keys()).sort((a, b) =>
      String(a).localeCompare(String(b), undefined, { numeric: true })
    );
    const currentYear = getActiveSelections('year').includes('All')
      ? availableYears[availableYears.length - 1]
      : getActiveSelections('year')[0];
    if (currentYear && lastEntry.totals.has(currentYear)) {
      const currentTotals = lastEntry.totals.get(currentYear);
      const currentValue = state.metric === 'Attendance' ? currentTotals.attendance : currentTotals.kids;
      const previousMonth = monthly[monthly.length - 2];
      if (previousMonth && previousMonth.totals.has(currentYear)) {
        const previousTotals = previousMonth.totals.get(currentYear);
        const previousValue = state.metric === 'Attendance' ? previousTotals.attendance : previousTotals.kids;
        if (previousValue > 0) {
          const delta = ((currentValue - previousValue) / previousValue) * 100;
          highlights.push(`${formatNumber(delta, { decimals: 1 })}% vs last month (${lastEntry.month}).`);
        }
      }
      const priorYearTotals = lastEntry.totals.get(String(Number(currentYear) - 1));
      if (priorYearTotals) {
        const priorValue = state.metric === 'Attendance' ? priorYearTotals.attendance : priorYearTotals.kids;
        if (priorValue > 0) {
          const yoy = ((currentValue - priorValue) / priorValue) * 100;
          highlights.push(`${formatNumber(yoy, { decimals: 1 })}% vs same month last year.`);
        }
      }
    }
  }

  elements.anomalyHighlights.innerHTML = '';
  highlights.slice(0, 2).forEach((text) => {
    const li = document.createElement('li');
    li.textContent = text;
    elements.anomalyHighlights.appendChild(li);
  });
}

function updateChartAriaLabel(canvas, description) {
  if (!canvas) return;
  canvas.setAttribute('aria-label', description);
}

function updateDashboard() {
  const filtered = getFilteredRows();
  updateSummaries(filtered);
  updateMetricHeaders();
  updateTrendChart(filtered);
  updateMonthlyChart(filtered);
  updateDistributionChart(filtered);
  updateTable(filtered);
  updateActiveFilters();
  updateStory(filtered);
  persistState();
}

function parseCsvOffMainThread(text) {
  return new Promise((resolve, reject) => {
    try {
      const worker = getCsvWorker();
      const handleMessage = (event) => {
        const { data } = event;
        if (!data) {
          reject(new Error('Failed to parse CSV file.'));
          return;
        }
        if (data.type === 'success') {
          resolve(data.payload);
        } else {
          reject(new Error(data.message || 'Failed to parse CSV file.'));
        }
      };
      worker.addEventListener('message', handleMessage, { once: true });
      worker.postMessage({ text });
    } catch (error) {
      reject(error);
    }
  });
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

  reader.onload = async () => {
    try {
      if (typeof reader.result !== 'string') {
        throw new Error('Unable to read the file as text.');
      }
      setDatasetStatus('Parsing CSV…');
      let parsed;
      try {
        parsed = await parseCsvOffMainThread(reader.result);
      } catch (workerError) {
        console.warn('Falling back to main-thread parser', workerError);
        parsed = parseCsv(reader.result);
      }
      ingestDataset(parsed, {
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

function loadPlaceholderDataset(feedbackType = 'info') {
  setDatasetStatus('Loading placeholder dataset…');
  fetch('data/attendance.json', { cache: 'no-store' })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }
      return response.json();
    })
    .then((data) => {
      ingestDataset(data, {
        message: `Using placeholder dataset generated for demonstration across multiple sites and years. Rows available: ${formatNumber(
          data.length
        )}.`,
        type: feedbackType
      });
    })
    .catch((error) => {
      console.error('Failed to load placeholder dataset', error);
      setDatasetStatus('Unable to load the placeholder dataset. Upload a CSV file to continue.', 'error');
      toggleEmptyState(true);
    });
}

function handleControlClicks(event) {
  const button = event.target.closest('.control-action');
  if (!button) return;
  const target = button.dataset.target;
  const action = button.dataset.action;
  const container = elements[`${target}Toggle`];
  if (!container) return;
  const options = Array.from(container.querySelectorAll('.toggle-button')).map((btn) => btn.dataset.value);
  if (!options.length) return;

  if (action === 'select') {
    const selections = options.filter((value) => value !== 'All');
    applySelection(target, selections, options);
  } else if (action === 'clear') {
    applySelection(target, ['All'], options);
  }

  updateMultiToggleSelection(container, target);
  if (target === 'site') {
    updateServiceOptions();
  }
  persistState();
  updateDashboard();
}

function attachEventListeners() {
  if (elements.controlsSection) {
    elements.controlsSection.addEventListener('click', handleControlClicks);
  }

  if (elements.yearToggle) {
    registerMultiSelectToggle(elements.yearToggle, 'year');
  }

  if (elements.siteToggle) {
    registerMultiSelectToggle(elements.siteToggle, 'site', {
      onChange: () => {
        updateServiceOptions();
      }
    });
  }

  if (elements.serviceToggle) {
    registerMultiSelectToggle(elements.serviceToggle, 'service');
  }

  registerSingleSelectToggle(elements.distributionToggle, 'distributionDimension');
  registerSingleSelectToggle(elements.distributionViewToggle, 'distributionView');
  registerSingleSelectToggle(elements.monthlyModeToggle, 'monthlyMode');

  elements.metricRadios.forEach((radio) => {
    radio.addEventListener('change', (event) => {
      state.metric = event.target.value;
      persistState();
      updateDashboard();
    });
  });

  elements.trendMetricToggles.forEach((checkbox) => {
    checkbox.addEventListener('change', () => {
      const active = Array.from(elements.trendMetricToggles)
        .filter((input) => input.checked)
        .map((input) => input.value);
      state.trendMetrics = active.length ? active : [...DEFAULT_TREND_METRICS];
      persistState();
      updateDashboard();
    });
  });

  if (elements.quickSearch) {
    elements.quickSearch.addEventListener('input', (event) => {
      state.search = event.target.value;
      persistState();
      updateDashboard();
    });
  }

  if (elements.includeZeros) {
    elements.includeZeros.addEventListener('change', (event) => {
      state.includeZeros = event.target.checked;
      persistState();
      updateDashboard();
    });
  }

  if (elements.datasetUpload) {
    elements.datasetUpload.addEventListener('change', handleDatasetUpload);
  }

  if (elements.resetDataset) {
    elements.resetDataset.addEventListener('click', () => {
      loadPlaceholderDataset('success');
    });
  }

  if (elements.tablePageSize) {
    elements.tablePageSize.addEventListener('change', (event) => {
      const value = Number(event.target.value);
      state.tableLimit = Number.isNaN(value) ? defaultState.tableLimit : value;
      persistState();
      updateDashboard();
    });
  }

  elements.tableHeaderCells.forEach((th) => {
    th.addEventListener('click', () => {
      const key = th.dataset.key;
      if (!key) return;
      if (state.tableSort.key === key) {
        state.tableSort.direction = state.tableSort.direction === 'asc' ? 'desc' : 'asc';
      } else {
        state.tableSort.key = key;
        state.tableSort.direction = key === 'Date' ? 'desc' : 'asc';
      }
      persistState();
      updateDashboard();
    });
  });

  elements.chartExportButtons.forEach((button) => {
    button.addEventListener('click', handleChartExport);
  });

  document.addEventListener('keydown', handleKeyboardShortcuts);
}

function registerSingleSelectToggle(container, stateKey) {
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
    if (stateKey === 'distributionDimension' || stateKey === 'distributionView' || stateKey === 'monthlyMode') {
      persistState();
      updateDashboard();
    }
  });
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

    persistState();
    updateDashboard();
  });
}

function handleChartExport(event) {
  const button = event.currentTarget;
  const chartKey = button.dataset.chart;
  const exportType = button.dataset.export;

  if (exportType === 'png') {
    exportChartAsPng(chartKey);
  } else if (exportType === 'csv') {
    exportFilteredCsv(chartKey);
  }
}

function exportChartAsPng(chartKey) {
  const chartMap = {
    trend: trendChart,
    monthly: monthlyChart,
    distribution: distributionChart
  };
  const chart = chartMap[chartKey];
  if (!chart) return;
  const link = document.createElement('a');
  link.href = chart.toBase64Image();
  link.download = `${chartKey}-chart.png`;
  link.click();
}

function exportFilteredCsv() {
  const rows = latestFilteredRows;
  if (!rows.length) return;
  const headers = [
    'Week',
    'IsoWeek',
    'IsoYear',
    'YearWeek',
    'Date',
    'Year',
    'Month',
    'Site',
    'Service',
    'Attendance',
    'Kids Checked-in'
  ];
  const csvLines = [headers.join(',')];
  rows.forEach((row) => {
    const values = headers.map((header) => {
      const value = row[header];
      if (typeof value === 'string' && value.includes(',')) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    });
    csvLines.push(values.join(','));
  });

  const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'filtered-attendance.csv';
  link.click();
  URL.revokeObjectURL(link.href);
}

function handleKeyboardShortcuts(event) {
  if (event.defaultPrevented) return;
  const target = event.target;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) {
    return;
  }

  if (event.key === '/') {
    event.preventDefault();
    if (elements.quickSearch) {
      elements.quickSearch.focus();
    }
  }

  if (event.key.toLowerCase() === 'a') {
    event.preventDefault();
    const options = Array.from(elements.serviceToggle.querySelectorAll('.toggle-button')).map((btn) => btn.dataset.value);
    const selections = options.filter((value) => value !== 'All');
    applySelection('service', selections, options);
    updateMultiToggleSelection(elements.serviceToggle, 'service');
    persistState();
    updateDashboard();
  }

  if (event.key.toLowerCase() === 'c') {
    event.preventDefault();
    applySelection('service', ['All']);
    updateMultiToggleSelection(elements.serviceToggle, 'service');
    persistState();
    updateDashboard();
  }
}

function applyStateToControls() {
  updateMultiToggleSelection(elements.yearToggle, 'year');
  updateMultiToggleSelection(elements.siteToggle, 'site');
  updateMultiToggleSelection(elements.serviceToggle, 'service');

  updateToggleGroupSelection(elements.distributionToggle, state.distributionDimension);
  updateToggleGroupSelection(elements.distributionViewToggle, state.distributionView);
  updateToggleGroupSelection(elements.monthlyModeToggle, state.monthlyMode);

  elements.metricRadios.forEach((radio) => {
    radio.checked = radio.value === state.metric;
  });

  elements.trendMetricToggles.forEach((checkbox) => {
    checkbox.checked = state.trendMetrics.includes(checkbox.value);
  });

  if (elements.quickSearch) {
    elements.quickSearch.value = state.search;
  }

  if (elements.includeZeros) {
    elements.includeZeros.checked = state.includeZeros;
  }

  if (elements.tablePageSize) {
    elements.tablePageSize.value = String(state.tableLimit);
  }
}

function initialize() {
  attachEventListeners();
  applyStateToControls();
  toggleEmptyState(true);
  loadPlaceholderDataset();
}

initialize();
