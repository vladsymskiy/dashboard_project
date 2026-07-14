/**
 * ============================================================================
 * БЮДЖЕТНИЙ ДАШБОРД ГРОМАД ТА РАЙОНІВ ЧЕРКАСЬКОЇ ОБЛАСТІ
 * Основний файл логіки програми (Vanilla JavaScript, Leaflet, Chart.js, PapaParse)
 * ============================================================================
 */

// Глобальний стан додатку (Store)
let appState = {
  data: [],                // Масив оброблених даних по громадах (ТГ) - без Обласного та Районних бюджетів
  districtData: [],        // Масив агрегованих даних по 4 районах області
  oblastData: null,        // Окремий об'єкт для Обласного бюджету (для Блоку А)
  hromadyGeoJson: null,    // GeoJSON полігонів територіальних громад
  districtsGeoJson: null,  // GeoJSON полігонів 4-х районів області
  activeLayerType: 'hromady', // Поточний активний шар карти: 'hromady' (за замовчуванням) або 'districts'
  selectedId: null,        // ID обраної території (null = режим зведеного звіту)
  mapLayer: null,          // Поточний векторний шар на карті Leaflet
  mapInstance: null,       // Екземпляр карти L.map
  barChart: null,          // Екземпляр графіка Chart.js
  structureChartInstance: null, // Екземпляр діаграми-бублика Chart.js (Donut Chart)
  currentTaxSource: 'data/Всього.csv', // Поточне джерело даних (тип податку)
  currentTaxType: 'total', // Поточний тип надходжень (TAX_TYPES) — використовується Bridge
  _rawData: null,          // Сирі дані z CSV (зберігаються Bridge для перерахунку при зміні типу)
  currentRankingTab: 'top' // Активна вкладка віджета рейтингу: 'top' або 'anti'
};

/**
 * Головна точка входу: виконується при завантаженні DOM
 */
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  initCharts();
  initUI();           // Центрування заголовків та підказки для графіків
  setupEventListeners();
  setupLayerToggle();
  // loadProjectData завантажує export.csv і після цього викликає initDataBridge()
  loadProjectData();
});

/**
 * Ініціалізація UI: центрування заголовків віджетів та підказки для редагтованих легенд графіків.
 * Не змінює HTML/CSS — працює через inline-стилі виключно.
 */
function initUI() {
  // 1. Центруємо заголовок поточної території (назва громади / зведений звіт)
  const titleEl = document.getElementById('selectedCommunityTitle');
  if (titleEl) titleEl.style.textAlign = 'center';

  // 2. Центруємо заголовок віджета рейтингу
  const rankingTitleEl = document.getElementById('rankingWidgetTitle');
  if (rankingTitleEl) rankingTitleEl.style.textAlign = 'center';

  // 3. Центруємо заголовок графіка порівняння
  const chartTitleEl = document.getElementById('chartTitle');
  if (chartTitleEl) chartTitleEl.style.textAlign = 'center';

  // 4. Центруємо заголовок "H2" профільної секції
  const profileTitleWrapper = document.querySelector('.profile-title-wrapper');
  if (profileTitleWrapper) profileTitleWrapper.style.textAlign = 'center';

  // 5. Підказка для легенди графіка порівняння
  const barChartHeader = document.querySelector('.mini-chart-card .mini-chart-header');
  if (barChartHeader && !barChartHeader.querySelector('.chart-legend-hint')) {
    barChartHeader.style.textAlign = 'center';
    const h4 = barChartHeader.querySelector('h4');
    if (h4) h4.style.textAlign = 'center';

    const hint = document.createElement('p');
    hint.className = 'chart-legend-hint';
    hint.style.cssText = 'margin:2px 0 6px; font-size:11px; font-style:italic; color:#64748b; text-align:center; display:flex; align-items:center; justify-content:center; gap:4px;';
    hint.innerHTML = `<svg class="heroicon" style="width:14px;height:14px;flex-shrink:0;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" /></svg><span>Натисніть на елемент легенди нижче, щоб приховати його на графіку</span>`;
    barChartHeader.appendChild(hint);
  }

  // 6. Підказка для легенди бублика (структура надходжень)
  const structureContainer = document.getElementById('structureChartContainer');
  const structureHeader = structureContainer && structureContainer.querySelector('.mini-chart-header');
  if (structureHeader) {
    structureHeader.style.textAlign = 'center';
    const h4 = structureHeader.querySelector('h4');
    if (h4) h4.style.textAlign = 'center';

    if (!structureHeader.querySelector('.chart-legend-hint')) {
      const hint2 = document.createElement('p');
      hint2.className = 'chart-legend-hint';
      hint2.style.cssText = 'margin:2px 0 6px; font-size:11px; font-style:italic; color:#64748b; text-align:center; display:flex; align-items:center; justify-content:center; gap:4px;';
      hint2.innerHTML = `<svg class="heroicon" style="width:14px;height:14px;flex-shrink:0;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" /></svg><span>Натисніть на елемент легенди нижче, щоб приховати його на графіку</span>`;
      structureHeader.appendChild(hint2);
    }
  }

  console.log('[UI] Ініціалізація UI завершена.');
}

/**
 * 1. Ініціалізація базової карти Leaflet (з урахуванням розширеної бічної панелі 600px)
 */
function initMap() {
  const mapContainer = document.getElementById('map');
  if (!mapContainer) return;

  // Центруємо карту на Черкаській області (зум 8.5 для комфортного відображення)
  appState.mapInstance = L.map('map', {
    zoomControl: false,
    attributionControl: false,
    zoomSnap: 0.1,
    minZoom: 7.5,
    maxBoundsViscosity: 1.0
  }).setView([49.25, 31.40], 8.5);

  // Скориговані межі: розширено зверху і знизу, щоб вершок карти не зрізався
  const bounds = [[47.8, 29.0], [50.8, 33.5]];
  appState.mapInstance.setMaxBounds(bounds);

  // Додаємо елемент керування зумом у верхній правий кут
  L.control.zoom({ position: 'topright' }).addTo(appState.mapInstance);

  // Підключаємо базовий тайловий шар CartoDB Positron (світлий лаконічний стиль)
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 18,
    subdomains: 'abcd'
  }).addTo(appState.mapInstance);

  // Ініціалізуємо легенду карти через L.control
  initLegend();

  // Корекція розміру Leaflet при зміні макету
  appState.mapInstance.invalidateSize();
}

/**
 * Ініціалізація легенди карти через L.control
 * Використовує офіційну термінологію Державної казначейської служби України
 */
function initLegend() {
  const legend = L.control({ position: 'bottomright' });

  legend.onAdd = function () {
    const div = L.DomUtil.create('div', 'map-floating-legend legend info');
    div.style.minWidth = '250px';
    div.style.whiteSpace = 'nowrap';
    div.style.padding = '10px 14px';
    div.innerHTML = `
      <div class="legend-title">Рівень виконання плану за звітний період, %</div>
      <div class="legend-items">
        <div class="legend-item">
          <span class="color-box" style="background: #0ea76c;"></span>
          <span>100% і більше (Виконано)</span>
        </div>
        <div class="legend-item">
          <span class="color-box" style="background: #e8a020;"></span>
          <span>90% – 99.9% (Зона ризику)</span>
        </div>
        <div class="legend-item">
          <span class="color-box" style="background: #c23b66;"></span>
          <span>Менше 90% (Недовиконання)</span>
        </div>
        <div class="legend-item">
          <span class="color-box" style="background: #cbd5e1;"></span>
          <span>Немає даних</span>
        </div>
      </div>
    `;
    return div;
  };

  legend.addTo(appState.mapInstance);
}

/**
 * 2. Завантаження файлів проекту (GeoJSON для ТГ і Районів, та єдиний CSV export.csv)
 * Нова архітектура: лише один плоский файл export.csv — без fallback-ів та перемикань.
 */
async function loadProjectData() {
  // 1. Завантажуємо GeoJSON громад
  try {
    const resHromady = await fetch('data/hromady.json');
    if (resHromady.ok) {
      appState.hromadyGeoJson = await resHromady.json();
    } else {
      console.error('Не вдалося завантажити data/hromady.json');
    }
  } catch (err) {
    console.error('Помилка завантаження hromady.json:', err);
  }

  // 2. Завантажуємо GeoJSON районів
  try {
    const resDistricts = await fetch('data/districts.json');
    if (resDistricts.ok) {
      appState.districtsGeoJson = await resDistricts.json();
    } else {
      console.error('Не вдалося завантажити data/districts.json');
    }
  } catch (err) {
    console.error('Помилка завантаження districts.json:', err);
  }

  // 3. Завантажуємо єдиний плоский файл даних (UTF-8, крапка як роздільник дробів)
  Papa.parse('data/export.csv', {
    download: true,
    header: true,
    skipEmptyLines: true,
    encoding: 'UTF-8',
    complete: (results) => {
      if (!results || !results.data || results.data.length === 0) {
        console.error('[App] data/export.csv порожній або не знайдений.');
        return;
      }
      console.log(`[App] Завантажено ${results.data.length} рядків з data/export.csv`);

      // Зберігаємо сирі дані + рядок Обласного бюджету до глобального стану
      appState._rawData = results.data;
      appState.oblastRow = results.data.find(row => {
        const name = (row.display_name || row['бюджет'] || '').trim().toLowerCase();
        return name.includes('обласний');
      }) || null;
      appState._dataReady = true;  // Прапор готовності даних

      // Обробляємо дані (Блок А, GeoJSON, карта) через існуючу логіку
      processFinancialData(results.data);

      // Запускаємо Bridge після того, як дані готові
      if (typeof initDataBridge === 'function') {
        initDataBridge();
      }

      // ★ ВОРОТА ГОТОВНОСТІ: фарбуємо карту, лише якщо шар GeoJSON вже існує (mapLayer != null)
      if (
        appState.mapLayer &&
        typeof updateMapColorsByTax === 'function' &&
        typeof transformDataByTaxType === 'function'
      ) {
        const initEnriched = transformDataByTaxType(appState._rawData, TAX_TYPES.TOTAL);
        updateMapColorsByTax(TAX_TYPES.TOTAL, initEnriched);
        console.log('[App] Стартове фарбування карти (дані вже були готові раніше).');
      } else {
        console.log('[App] Дані завантажені, але mapLayer ще не готовий — фарбування відбудеться всередині renderMap.');
      }

      // Примусовий старт дашборду з загальними даними
      if (typeof updateDashboardByTaxType === 'function') {
          appState.currentTaxType = 'total';
          updateDashboardByTaxType('total');
          console.log("Дашборд успішно ініціалізовано з дефолтним типом: total");
      }
    },
    error: (err) => {
      console.error('[App] Помилка завантаження data/export.csv:', err);
    }
  });
}

/**
 * Допоміжна функція безпечного парсингу чисел з текстів у форматі CSV
 * (видаляє пробіли, замінює коми на крапки)
 */
function parseNum(val) {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return val;
  const cleaned = String(val).replace(/\s+/g, '').replace(/,/g, '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

/**
 * Допоміжна функція для визначення району громади.
 * Пріоритет: rayon_name (нова flat-table колонка) → старі колонки → GeoJSON lookup.
 */
function getHromadaRayon(row) {
  // Пріоритет 1: нова колонка rayon_name у flat-table export.csv
  if (row.rayon_name && row.rayon_name.trim()) return row.rayon_name.trim();

  // Пріоритет 2: старі легасі-колонки (для зворотної сумісності)
  if (row['Район']) return String(row['Район']).trim();
  if (row['район']) return String(row['район']).trim();
  if (row['Район області']) return String(row['Район області']).trim();

  // Пріоритет 3: GeoJSON-пошук як fallback
  if (appState.hromadyGeoJson && appState.hromadyGeoJson.features) {
    const feat = appState.hromadyGeoJson.features.find(f => {
      const fId = String(f.properties.id || '').trim();
      const fName = String(f.properties.hromada || '').trim();
      const rId = String(row.id || '').trim();
      const rName = String(row['бюджет'] || '').trim();
      return (rId !== '' && fId === rId) || (rName !== '' && fName === rName);
    });
    if (feat && feat.properties && feat.properties.rayon) {
      return String(feat.properties.rayon).trim();
    }
  }
  return 'Невизначений район';
}

/**
 * 3. Комплексна обробка фінансових даних з CSV
 * Жорстка фільтрація, розрахунок похідних показників для ТГ та агрегація для Районів
 */
function processFinancialData(rawData) {
  if (!rawData || rawData.length === 0) return;

  // 3.1. Динамічне відображення звітної дати (оновлення через updateAsOfDate після ініціалізації Bridge)
  const reportDateEl = document.getElementById('report-date');
  if (reportDateEl) {
    const firstRow = rawData[0] || {};
    // Підтримка як flat-table (total_report_date), так і старих колонок
    const reportDate = firstRow['total_report_date']
      || firstRow['Звітна дата']
      || firstRow['Дата']
      || null;
    if (reportDate) {
      // Форматуємо ISO-дату у dd.mm.yyyy
      const d = new Date(reportDate);
      reportDateEl.textContent = !isNaN(d.getTime())
        ? new Intl.DateTimeFormat('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d)
        : reportDate;
    } else {
      reportDateEl.textContent = 'Немає даних';
    }
  }

  // 3.2. Обласний бюджет для Блоку А
  // appState.oblastRow вже збережено в loadProjectData; тут лише ініціалізуємо appState.oblastData
  if (appState.oblastRow && typeof getBudgetValue === 'function') {
    const taxType = appState.currentTaxType || TAX_TYPES.TOTAL;
    const plan = getBudgetValue(appState.oblastRow, taxType, INDICATORS.PERIOD_PLAN_MODIFIED) ?? 0;
    const fact = getBudgetValue(appState.oblastRow, taxType, INDICATORS.FACT_CURRENT) ?? 0;
    const execRate = plan > 0 ? Number(((fact / plan) * 100).toFixed(1)) : 0;
    appState.oblastData = { planPeriodRaw: plan, factRaw: fact, execRate };
  }
  updateBlockA(appState.currentTaxType || TAX_TYPES.TOTAL);

  // 3.3. Жорстка фільтрація для масиву громад (ТГ)
  // ПОВНІСТЮ виключаємо "Обласний бюджет" і УСІ рядки, що містять слово "районний"
  const filteredRows = rawData.filter(row => {
    if (!row['бюджет'] && !row.id) return false;
    const name = String(row['бюджет'] || '').trim().toLowerCase();

    if (name.includes('обласний бюджет')) return false;
    if (name.includes('районний')) return false; // Ігноруємо районні транзитні бюджети
    return true;
  });

  // 3.4. Розрахунок метрик для кожної ТГ
  console.log("Ось точні назви стовпців з вашого CSV:", Object.keys(filteredRows[0]));
  const processedHromadas = filteredRows.map((row, index) => {
    const planPeriod = parseNum(row['План на звітний період (зі змінами)'] || row['План на період (уточн)']);
    const fact = parseNum(row['Фактичне виконання за звітний період'] || row['Фактичні надходження']);
    const planYear = parseNum(row['Річний план (зі змінами)'] || row['План на рік (уточн)']);
    const factPrevYear = parseNum(row['Фактичні надходження аналогічного періоду минулого року'] || row['Факт минулого року']);

    // % виконання плану на звітний період
    const execPeriodPercent = planPeriod > 0 ? Number(((fact / planPeriod) * 100).toFixed(1)) : 0;

    // Відхилення від плану в тисячах гривень
    const devThousand = Number(((fact - planPeriod) / 1000).toFixed(1));

    // % виконання річного плану
    const execYearPercent = planYear > 0 ? Number(((fact / planYear) * 100).toFixed(1)) : 0;

    // Темп росту до минулого року (%)
    const growthRate = factPrevYear > 0 ? Number(((fact / factPrevYear) * 100).toFixed(1)) : 0;

    const rayonName = getHromadaRayon(row);

    const factPdfo = parseNum(row['Факт ПДФО'] || row['ПДФО (факт)'] || row['ПДФО факт'] || row['ПДФО']);
    const factEdyny = parseNum(row['Факт Єдиний податок'] || row['Єдиний податок (факт)'] || row['Єдиний податок факт'] || row['Єдиний податок']);
    const factAkcyz = parseNum(row['Факт Акциз'] || row['Акциз (факт)'] || row['Акциз факт'] || row['Акцизний податок (факт)'] || row['Акциз']);

    return {
      id: String(row.id || `hromada-${index}`).trim(),
      бюджет: String(row['бюджет'] || '').trim(),
      rayon: rayonName,
      'Рівень річного бюджету': row['Рівень річного бюджету'] || 'Громада',
      planPeriodRaw: planPeriod,
      factRaw: fact,
      planYearRaw: planYear,
      factPrevYearRaw: factPrevYear,
      factPdfoRaw: factPdfo,
      factEdynyRaw: factEdyny,
      factAkcyzRaw: factAkcyz,
      execPeriodPercent: execPeriodPercent,
      devThousand: devThousand,
      execYearPercent: execYearPercent,
      growthRate: growthRate
    };
  });

  // Sorts TG by % execution and assigns ranking positions
  processedHromadas.sort((a, b) => b.execPeriodPercent - a.execPeriodPercent);
  processedHromadas.forEach((item, idx) => { item.rankPeriod = idx + 1; });
  appState.data = processedHromadas;

  // Додатковий захист: якщо _rawData ще не встановлено з loadProjectData, зберегти тут
  if (!appState._rawData) appState._rawData = rawData;

  // 3.5. Динамічна агрегація даних для шару "Райони"
  appState.districtData = calculateDistrictAggregates(appState.data);

  // 3.6. Прив'язка даних до GeoJSON та оновлення екрану
  linkDataToGeoJson();
  updateDashboard();
}

/**
 * 4. Динамічна агрегація даних для 4-х укрупнених районів
 * Проходить по масиву ТГ (де вже виключені обласний та районні бюджети),
 * групує за назвою району та підсумовує фінансові показники.
 */
function calculateDistrictAggregates(hromadaArray) {
  if (!hromadaArray || hromadaArray.length === 0) return [];

  // Групування через reduce за ключем rayon
  const districtMap = hromadaArray.reduce((acc, row) => {
    const rName = row.rayon || 'Невизначений район';
    if (!acc[rName]) {
      acc[rName] = {
        rayon: rName,
        planPeriodRaw: 0,
        factRaw: 0,
        planYearRaw: 0,
        factPrevYearRaw: 0,
        factPdfoRaw: 0,
        factEdynyRaw: 0,
        factAkcyzRaw: 0
      };
    }
    acc[rName].planPeriodRaw += (row.planPeriodRaw || 0);
    acc[rName].factRaw += (row.factRaw || 0);
    acc[rName].planYearRaw += (row.planYearRaw || 0);
    acc[rName].factPrevYearRaw += (row.factPrevYearRaw || 0);
    acc[rName].factPdfoRaw += (row.factPdfoRaw || 0);
    acc[rName].factEdynyRaw += (row.factEdynyRaw || 0);
    acc[rName].factAkcyzRaw += (row.factAkcyzRaw || 0);
    return acc;
  }, {});

  // Розрахунок відсотків та відхилень на основі підсумків
  const aggregatedList = Object.values(districtMap).map((dist, idx) => {
    const planP = dist.planPeriodRaw;
    const fact = dist.factRaw;
    const planY = dist.planYearRaw;
    const factPrev = dist.factPrevYearRaw;

    const execPeriodPercent = planP > 0 ? Number(((fact / planP) * 100).toFixed(1)) : 0;
    const devThousand = Number(((fact - planP) / 1000).toFixed(1));
    const execYearPercent = planY > 0 ? Number(((fact / planY) * 100).toFixed(1)) : 0;
    const growthRate = factPrev > 0 ? Number(((fact / factPrev) * 100).toFixed(1)) : 0;

    return {
      id: `district-${idx}`,
      бюджет: dist.rayon,
      rayon: dist.rayon,
      'Рівень річного бюджету': 'Район області',
      planPeriodRaw: planP,
      factRaw: fact,
      planYearRaw: planY,
      factPrevYearRaw: factPrev,
      factPdfoRaw: dist.factPdfoRaw,
      factEdynyRaw: dist.factEdynyRaw,
      factAkcyzRaw: dist.factAkcyzRaw,
      execPeriodPercent: execPeriodPercent,
      devThousand: devThousand,
      execYearPercent: execYearPercent,
      growthRate: growthRate,
      isDistrictAggregate: true
    };
  });

  // Сортуємо райони за % виконання та призначаємо ранг
  aggregatedList.sort((a, b) => b.execPeriodPercent - a.execPeriodPercent);
  aggregatedList.forEach((item, idx) => { item.rankPeriod = idx + 1; });

  return aggregatedList;
}

/**
 * 5. Прив'язка фінансових об'єктів до GeoJSON полігонів ТГ та Районів
 */
function linkDataToGeoJson() {
  // Прив'язка для шару Громад
  if (appState.hromadyGeoJson && appState.data.length > 0) {
    appState.hromadyGeoJson.features.forEach(feature => {
      const featId = String(feature.properties.id || '').trim();
      const featName = String(feature.properties.hromada || '').trim();

      const matchedRow = appState.data.find(r => r.id === featId || r['бюджет'] === featName);
      if (matchedRow) {
        feature.properties.finance = matchedRow;
      }
    });
  }

  // Прив'язка для шару Районів
  if (appState.districtsGeoJson && appState.districtData.length > 0) {
    appState.districtsGeoJson.features.forEach(feature => {
      const featRayon = String(feature.properties.rayon || feature.properties.name || '').trim();

      const matchedRow = appState.districtData.find(r => {
        return r.rayon.toLowerCase() === featRayon.toLowerCase() ||
          r['бюджет'].toLowerCase() === featRayon.toLowerCase();
      });
      if (matchedRow) {
        feature.properties.finance = matchedRow;
      }
    });
  }
}

/**
 * Колірна шкала (Choropleth) за рівнем виконання плану за звітний період.
 * Пороги відповідають легенді карти у правому нижньому куті.
 *
 * @param {number|null} percent — (FACT_CURRENT / PERIOD_PLAN_MODIFIED) * 100
 * @returns {string} HEX-код кольору
 */
function getCommunityColor(percent) {
  if (percent === null || percent === undefined || isNaN(percent) || percent === 0) {
    return '#cbd5e1'; // Немає даних — нейтральний сірий
  }
  if (percent >= 100) {
    return '#0ea76c'; // ≥ 100 % — Виконано та перевиконано (яскравий зелений)
  }
  if (percent >= 90) {
    return '#e8a020'; // 90–99 % — Ризик невиконання (апельсиново-золотий)
  }
  return '#c23b66';   // < 90 % — Критичне недовиконання (пурпурно-рожевий)
}

/**
 * Псевдонім для зворотної сумісності з рядками, що ще використовують getColor().
 * @deprecated Використовуй getCommunityColor() напряму.
 */
const getColor = getCommunityColor;

/**
 * 6. Оновлення відображення Блоку А («Обласний бюджет»).
 * Працює виключно з appState.oblastRow (збережений при першому завантаженні CSV).
 * Перераховує значення для переданого taxType без повторного пошуку.
 *
 * @param {string} [taxType] — поточний тип надходжень (TAX_TYPES), default = appState.currentTaxType
 */
function updateBlockA(taxType) {
  const row = appState.oblastRow;

  // Якщо рядок обласного бюджету не знайдено — зупиняємось
  if (!row) {
    console.error("Рядок Обласного бюджету не знайдено в appState.oblastRow");
    return;
  }

  console.log("Оновлюємо Макро-рівень для податку:", taxType);

  // 1. Витягуємо чисті числа за допомогою нашого словника
  const tx = taxType || appState.currentTaxType || TAX_TYPES.TOTAL;

  // Динамічне управління видимістю Обласного бюджету (Блок А)
  const blockAEl = document.getElementById('blockA') || document.querySelector('.block-a');
  if (blockAEl) {
    const isTotalOrPdfo = (tx === 'total' || tx === 'pdfo' || (typeof TAX_TYPES !== 'undefined' && (tx === TAX_TYPES.TOTAL || tx === TAX_TYPES.PDFO)));
    if (isTotalOrPdfo) {
      blockAEl.style.display = 'block';
    } else {
      blockAEl.style.display = 'none';
      console.log(`[App] Приховуємо Обласний бюджет для податку: ${tx}`);
      return;
    }
  }

  const factValue = typeof getBudgetValue === 'function' ? (getBudgetValue(row, tx, INDICATORS.FACT_CURRENT) || 0) : 0;
  const planValue = typeof getBudgetValue === 'function' ? (getBudgetValue(row, tx, INDICATORS.PERIOD_PLAN_MODIFIED) || 0) : 0;

  // 2. Рахуємо відсоток виконання
  const percentValue = planValue > 0 ? (factValue / planValue) * 100 : 0;

  // Кешуємо для використання в інших місцях (updateDashboard тощо)
  appState.oblastData = { planPeriodRaw: planValue, factRaw: factValue, execRate: Number(percentValue.toFixed(1)) };

  // 3. Знаходимо елементи в HTML (підтримка як стандартних id зі схеми, так і id з верстки)
  const planEl = document.querySelector('#oblast-plan') || document.getElementById('oblastPlan') || document.getElementById('oblastPlanVal');
  const factEl = document.querySelector('#oblast-fact') || document.getElementById('oblastFact') || document.getElementById('oblastFactVal');
  const percentEl = document.querySelector('#oblast-percent') || document.getElementById('oblastPercent') || document.getElementById('oblastExecRateVal');

  // 4. Виводимо красиві відформатовані значення на екран
  if (planEl) planEl.textContent = (typeof formatMoneyK === 'function' ? formatMoneyK(planValue) : (typeof formatForDisplay === 'function' ? formatForDisplay(planValue, 'number') + " тис. грн" : planValue + " тис. грн"));
  if (factEl) factEl.textContent = (typeof formatMoneyK === 'function' ? formatMoneyK(factValue) : (typeof formatForDisplay === 'function' ? formatForDisplay(factValue, 'number') + " тис. грн" : factValue + " тис. грн"));

  if (percentEl) {
    percentEl.textContent = (typeof formatPercent === 'function' ? formatPercent(percentValue) : (typeof formatForDisplay === 'function' ? formatForDisplay(percentValue, 'percent') : percentValue.toFixed(1) + "%"));

    // Оновлюємо колір відсотка (зелений/жовтий/червоний) згідно з новими порогами
    percentEl.style.color = percentValue >= 100 ? '#0ea76c' : (percentValue >= 90 ? '#e8a020' : '#c23b66');
  }
}

/**
 * 7. Малювання карти в залежності від обраного шару (Громади чи Райони)
 */
function renderMap() {
  if (!appState.mapInstance) return;

  // Корекція розміру Leaflet при зміні макету
  appState.mapInstance.invalidateSize();

  if (appState.mapLayer) {
    appState.mapInstance.removeLayer(appState.mapLayer);
  }

  const currentGeoJson = appState.activeLayerType === 'hromady' ? appState.hromadyGeoJson : appState.districtsGeoJson;
  if (!currentGeoJson) return;

  appState.mapLayer = L.geoJSON(currentGeoJson, {
    style: (feature) => {
      const finance = feature.properties.finance || {};
      const val = finance.execPeriodPercent || 0;
      const featId = finance.id || String(feature.properties.id || feature.properties.rayon || '').trim();
      const isSelected = appState.selectedId === featId;

      return {
        fillColor: getCommunityColor(val),
        weight: isSelected ? 3.5 : (appState.activeLayerType === 'districts' ? 2.5 : 1.2),
        opacity: 1,
        color: isSelected ? '#C5A059' : '#334155',
        fillOpacity: isSelected ? 0.95 : 0.8
      };
    },
    onEachFeature: (feature, layer) => {
      const finance = feature.properties.finance || {};
      const name = finance['бюджет'] || feature.properties.hromada || feature.properties.rayon || 'Територія';
      const layerTitle = appState.activeLayerType === 'hromady' ? 'Громада' : 'Зведений район';

      // Генеруємо тултип через bridge-хелпер, якщо доступний
      const buildTooltip = (finData) => {
        const execRate = finData.execPeriodPercent || 0;
        const taxLabel = (typeof TAX_LABELS !== 'undefined' && appState.currentTaxType)
          ? TAX_LABELS[appState.currentTaxType] || 'Загальні надходження'
          : 'Загальні надходження';
        return `
          <div class="custom-tooltip-content">
            <h4>${name}</h4>
            <p><strong>Рівень:</strong> ${layerTitle} &nbsp;|&nbsp; <em>${taxLabel}</em></p>
            <p><strong>План на період:</strong> ${formatMoneyK(finData.planPeriodRaw)}</p>
            <p><strong>Фактичні надходження:</strong> ${formatMoneyK(finData.factRaw)}</p>
            <p><strong>Виконання плану:</strong>
              <span style="font-weight:700; color:${getCommunityColor(execRate)}">${formatPercent(execRate)}</span>
            </p>
            <p><strong>Відхилення:</strong>
              <span class="${(finData.devThousand || 0) >= 0 ? 'text-success' : 'text-danger'}">${formatDeviation(finData.devThousand)}</span>
            </p>
          </div>`;
      };

      layer.bindTooltip(buildTooltip(finance), { sticky: true, direction: 'auto' });

      // Зберігаємо функцію побудови тултипа на шарі для оновлення без перемалювання карти
      layer._buildTooltip = buildTooltip;

      layer.on({
        click: () => {
          const targetId = finance.id || String(feature.properties.id || feature.properties.rayon || '').trim();
          selectCommunity(targetId === appState.selectedId ? null : targetId);
        },
        mouseover: (e) => {
          const l = e.target;
          l.setStyle({ weight: 3.5, color: '#0f172a', fillOpacity: 0.95 });
          l.bringToFront();
        },
        mouseout: (e) => {
          appState.mapLayer.resetStyle(e.target);
        }
      });
    }
  }).addTo(appState.mapInstance);

  // Автоматичне фокусування на контурах регіону без зайвих порожніх полів
  if (!appState.selectedId && appState.mapLayer) {
    try {
      appState.mapInstance.fitBounds(appState.mapLayer.getBounds(), { padding: [20, 20] });
    } catch (err) {
      console.warn('[App] fitBounds помилка:', err);
    }
  }

  // ФІКС СІРОЇ КАРТИ: Примусове розфарбовування одразу після появи карти на екрані
  if (appState._dataReady && typeof updateMapColorsByTax === 'function') {
    const startTax = appState.currentTaxType || 'total';
    const enrichedData = appState.activeLayerType === 'districts'
      ? (appState.districtData || [])
      : ((typeof transformDataByTaxType === 'function')
          ? transformDataByTaxType(appState._rawData, startTax)
          : (appState.data || []));
    updateMapColorsByTax(startTax, enrichedData);
    console.log("Map successfully colored on startup/layer switch!");
  }
}

/**
 * 8. Перемикач шарів карти («Громади» та «Райони»)
 */
function setupLayerToggle() {
  const btnHromady = document.getElementById('layerBtnHromady');
  const btnDistricts = document.getElementById('layerBtnDistricts');

  if (!btnHromady || !btnDistricts) return;

  btnHromady.addEventListener('click', () => {
    if (appState.activeLayerType === 'hromady') return;
    appState.activeLayerType = 'hromady';
    appState.selectedId = null; // Скидаємо вибір території при зміні шару

    btnHromady.classList.add('active');
    btnDistricts.classList.remove('active');
    updateDashboard();
  });

  btnDistricts.addEventListener('click', () => {
    if (appState.activeLayerType === 'districts') return;
    appState.activeLayerType = 'districts';
    appState.selectedId = null;

    btnDistricts.classList.add('active');
    btnHromady.classList.remove('active');
    updateDashboard();
  });
}

/**
 * Вибір території або скидання вибору
 */
function selectCommunity(id) {
  appState.selectedId = id;
  const resetBtn = document.getElementById('resetSelectionBtn');
  if (resetBtn) resetBtn.disabled = (id === null);

  // Зумування карти до обраного полігону або скидання до загального виду
  if (id && appState.mapLayer && appState.mapInstance) {
    appState.mapLayer.eachLayer(layer => {
      const finance = layer.feature && layer.feature.properties ? layer.feature.properties.finance : null;
      const featId = finance ? finance.id : String(layer.feature.properties.id || layer.feature.properties.rayon || '').trim();

      if (featId === id) {
        try {
          appState.mapInstance.fitBounds(layer.getBounds(), { maxZoom: 11, padding: [40, 40] });
        } catch (err) { }
      }
    });
  } else if (!id && appState.mapInstance) {
    // При скиданні вибору або натисканні на "Зведений звіт" повертаємо карту до центру області
    if (appState.mapLayer) {
      try {
        appState.mapInstance.fitBounds(appState.mapLayer.getBounds(), { padding: [20, 20] });
      } catch (err) { }
    } else {
      appState.mapInstance.setView([49.25, 31.40], 8.5, { animate: true, duration: 0.8 });
    }
  }

  updateDashboard();
}

/**
 * 9. Комплексне оновлення дашборду (Карта, Профіль, Рейтинг та Графік)
 */
function updateDashboard() {
  renderMap();
  updateSidebarProfile();
  updateRankingWidget();
  updateMiniChart();
  updateStructureChart();
  updateAsOfDate();
  // Передаємо поточний taxType, щоб Block A завжди показував актуальні дані
  updateBlockA(appState.currentTaxType || TAX_TYPES.TOTAL);
}

/**
 * 10. Оновлення профілю Блоку Б (або зведеного звіту за активним шаром)
 */
function updateSidebarProfile() {
  const titleEl = document.getElementById('selectedCommunityTitle');
  const badgeEl = document.getElementById('profileBadge');
  const rankBox = document.getElementById('communityRankBadge');
  const rankVal = document.getElementById('communityRankValue');

  if (!titleEl || !badgeEl) return;

  const currentDataset = appState.activeLayerType === 'hromady' ? appState.data : appState.districtData;

  // Режим обраної конкретної території (ТГ або Район)
  if (appState.selectedId) {
    const row = currentDataset.find(r => r.id === appState.selectedId);
    if (row) {
      titleEl.textContent = row['бюджет'] || `Територія ID: ${row.id}`;
      badgeEl.textContent = row['Рівень річного бюджету'] || (appState.activeLayerType === 'hromady' ? 'Громада' : 'Район області');

      if (row.rankPeriod) {
        rankVal.textContent = `#${row.rankPeriod}`;
        rankBox.classList.remove('hidden');
      } else {
        rankBox.classList.add('hidden');
      }
      document.getElementById('kpiPlanPeriod').textContent = formatMoneyK(row.planPeriodRaw);
      const ratePeriodEl = document.getElementById('kpiExecPeriodRate');
      ratePeriodEl.textContent = formatPercent(row.execPeriodPercent);
      ratePeriodEl.style.color = getColor(row.execPeriodPercent); // Динамічний колір для % виконання

      // 3. Фактичні надходження — нейтральний інституційний колір (без семантики)
      const factEl = document.getElementById('kpiFact');
      factEl.textContent = formatMoneyK(row.factRaw);
      factEl.style.color = '#335145';

      const devEl = document.getElementById('kpiDeviation');
      devEl.textContent = formatDeviation(row.devThousand);
      devEl.style.color = getColor(row.execPeriodPercent); // Динамічний колір для Відхилення
      devEl.className = (row.devThousand || 0) >= 0 ? 'text-success' : 'text-danger';

      document.getElementById('kpiPlanYear').textContent = formatMoneyK(row.planYearRaw);
      const rateYearEl = document.getElementById('kpiExecYearRate');
      rateYearEl.textContent = formatPercent(row.execYearPercent);
      rateYearEl.style.color = getColor(row.execYearPercent); // Динамічний колір для % виконання

      document.getElementById('kpiFactPrevYear').textContent = formatMoneyK(row.factPrevYearRaw);
      document.getElementById('kpiGrowthRate').textContent = formatPercent(row.growthRate);
      return;
    }
  }

  // Стан за замовчуванням (клік поза картою / зведений звіт активного шару)
  titleEl.textContent = appState.activeLayerType === 'hromady'
    ? "Зведений бюджет всіх громад області"
    : "Зведений бюджет всіх районів області";
  badgeEl.textContent = "Зведений звіт";
  if (rankBox) rankBox.classList.add('hidden');

  let totalPlanPeriod = 0, totalFact = 0, totalPlanYear = 0, totalFactPrevYear = 0;

  currentDataset.forEach(r => {
    totalPlanPeriod += (r.planPeriodRaw || 0);
    totalFact += (r.factRaw || 0);
    totalPlanYear += (r.planYearRaw || 0);
    totalFactPrevYear += (r.factPrevYearRaw || 0);
  });

  const totalExecPeriod = totalPlanPeriod > 0 ? Number(((totalFact / totalPlanPeriod) * 100).toFixed(1)) : 0;
  const totalDevThousand = Number(((totalFact - totalPlanPeriod) / 1000).toFixed(1));
  const totalExecYear = totalPlanYear > 0 ? Number(((totalFact / totalPlanYear) * 100).toFixed(1)) : 0;
  const totalGrowth = totalFactPrevYear > 0 ? Number(((totalFact / totalFactPrevYear) * 100).toFixed(1)) : 0;

  document.getElementById('kpiPlanPeriod').textContent = formatMoneyK(totalPlanPeriod);
  const ratePeriodEl = document.getElementById('kpiExecPeriodRate');
  ratePeriodEl.textContent = formatPercent(totalExecPeriod);
  ratePeriodEl.style.color = getColor(totalExecPeriod); // Динамічний колір для %

  // 3. Фактичні надходження — нейтральний інституційний колір (без семантики)
  const factEl = document.getElementById('kpiFact');
  factEl.textContent = formatMoneyK(totalFact);
  factEl.style.color = '#335145';

  const devEl = document.getElementById('kpiDeviation');
  devEl.textContent = formatDeviation(totalDevThousand);
  devEl.style.color = getColor(totalExecPeriod); // Динамічний колір для Відхилення
  devEl.className = totalDevThousand >= 0 ? 'text-success' : 'text-danger';

  document.getElementById('kpiPlanYear').textContent = formatMoneyK(totalPlanYear);
  const rateYearEl = document.getElementById('kpiExecYearRate');
  rateYearEl.textContent = formatPercent(totalExecYear);
  rateYearEl.style.color = getColor(totalExecYear); // Динамічний колір для %

  document.getElementById('kpiFactPrevYear').textContent = formatMoneyK(totalFactPrevYear);
  document.getElementById('kpiGrowthRate').textContent = formatPercent(totalGrowth);
}

/**
 * 11. Оновлення аналітичного віджета «Топ-10 лідерів / Антирейтинг»
 * Адаптується під активний шар: показує або рейтинг ТГ, або рейтинг 4-х районів
 */
function updateRankingWidget() {
  const currentDataset = appState.activeLayerType === 'hromady' ? appState.data : appState.districtData;
  if (typeof updateRankingWidgetBySchema === 'function') {
    updateRankingWidgetBySchema(currentDataset);
  }
}

/**
 * 12. Ініціалізація ГОРИЗОНТАЛЬНОЇ діаграми Chart.js (indexAxis: 'y')
 */
function initCharts() {
  if (typeof Chart === 'undefined') return;
  Chart.defaults.color = '#334155';
  Chart.defaults.font.family = 'e-Ukraine';

  const barEl = document.getElementById('barChart');
  if (barEl) {
    const barCtx = barEl.getContext('2d');
    appState.barChart = new Chart(barCtx, {
      type: 'bar',
      data: { labels: [], datasets: [] },
      options: {
        indexAxis: 'y', // Горизонтальна орієнтація діаграми
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11, weight: 'bold' } } },
          tooltip: {
            callbacks: {
              label: function (context) {
                return `${context.dataset.label}: ${context.parsed.x.toLocaleString('uk-UA', { minimumFractionDigits: 1 })} тис. грн`;
              }
            }
          }
        },
        scales: {
          x: {
            display: false, // Прибрати відображення осі X та нулів
            grid: { display: false }
          },
          y: {
            grid: { display: false }, // Прибрати сітку
            ticks: { font: { size: 11, weight: '600' } }
          }
        }
      }
    });
  }

  // Ініціалізація діаграми-бублика структури надходжень (Donut Chart)
  // Легенда: 7 складових відповідно до TAX_LABELS (без 'total')
  const structureEl = document.getElementById('structureChart');
  if (structureEl) {
    const structureCtx = structureEl.getContext('2d');
    appState.structureChartInstance = new Chart(structureCtx, {
      type: 'doughnut',
      data: {
        labels: [
          'ПДФО',
          'Єдиний податок',
          'Акциз на пальне',
          'Акциз роздрібний',
          'Плата за землю',
          'Податок на майно',
          'Інші надходження'
        ],
        datasets: [{
          data: [0, 0, 0, 0, 0, 0, 0],
          backgroundColor: [
            '#0D9488', // ПДФО (контрастний бірюзовий / Teal)
            '#D97706', // Єдиний податок (теплий бурштиновий / Amber)
            '#4F46E5', // Акциз на пальне
            '#5C6B73', // Акциз роздрібний
            '#16A34A', // Плата за землю
            '#9333EA', // Податок на майно
            '#A8A29E'  // Інші надходження
          ],
          borderWidth: 2,
          borderColor: '#ffffff',
          hoverOffset: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '65%',
        plugins: {
          legend: {
            position: 'right',
            labels: { boxWidth: 12, padding: 12, font: { size: 10, weight: '600' } }
          },
          tooltip: {
            callbacks: {
              title: function () { return ''; },
              label: function (context) {
                const val = context.parsed || 0;
                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                const pct = total > 0 ? ((val / total) * 100).toFixed(1) + '%' : '0%';
                return `${context.label}: ${val.toLocaleString('uk-UA', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} тис. грн (${pct})`;
              }
            }
          }
        }
      }
    });
  }
}

/**
 * 13. Оновлення даних ГОРИЗОНТАЛЬНОЇ діаграми
 * Тонкі стовпчики (barThickness: 16-20px), синій план та динамічний колір факту
 */
function updateMiniChart() {
  if (!appState.barChart) return;

  const currentDataset = appState.activeLayerType === 'hromady' ? appState.data : appState.districtData;
  const validData = currentDataset.filter(r => r['бюджет']);

  const displayData = appState.selectedId
    ? validData.filter(r => r.id === appState.selectedId)
    : [...validData].sort((a, b) => (b.factRaw || 0) - (a.factRaw || 0)).slice(0, 5); // Топ-5 за фактичними надходженнями

  const labels = displayData.map(r => {
    let name = r['бюджет'] || '';
    return name.replace(/ (сільська|міська|селищна).*$/, '');
  });

  const isSingle = displayData.length === 1;

  // Динамічний заголовок графіка залежно від обраного податку
  const chartTitleEl = document.getElementById('chartTitle');
  if (chartTitleEl) {
    const taxLabel = (typeof TAX_LABELS !== 'undefined' && appState.currentTaxType)
      ? (TAX_LABELS[appState.currentTaxType] || 'Всі надходження')
      : 'Всі надходження';
    if (appState.currentTaxType === 'total' || !appState.currentTaxType) {
      chartTitleEl.textContent = 'План та факт: Всі надходження (тис. грн)';
    } else {
      chartTitleEl.textContent = `Порівняння планових та фактичних показників: ${taxLabel} (тис. грн)`;
    }
  }

  appState.barChart.data = {
    labels: labels,
    datasets: [
      {
        label: 'План на звітний період',
        data: displayData.map(r => (r.planPeriodRaw || 0) / 1000),
        backgroundColor: '#1A365D', // 4. Статичний темно-синій колір для Плану
        barThickness: isSingle ? 22 : 16,
        borderRadius: 4
      },
      {
        label: 'Фактичні надходження',
        data: displayData.map(r => (r.factRaw || 0) / 1000),
        backgroundColor: '#A67C52', // 4. Статичний бронзовий колір для Факту
        barThickness: isSingle ? 22 : 16,
        borderRadius: 4
      }
    ]
  };
  appState.barChart.update();
}

/**
 * 14. Оновлення діаграми структури надходжень (Donut Chart).
 * Відображається ЛИШЕ коли currentTaxType === 'total'.
 * Показує розбивку за 7 складовими через getBudgetValue().
 */
function updateStructureChart() {
  const container = document.getElementById('structureChartContainer');
  if (!container || !appState.structureChartInstance) return;

  // Жорстка перевірка: показуємо лише для загального бюджету
  const isTotal = (!appState.currentTaxType || appState.currentTaxType === 'total' || (typeof TAX_TYPES !== 'undefined' && appState.currentTaxType === TAX_TYPES.TOTAL));
  if (!isTotal) {
    container.style.display = 'none';
    return;
  }
  container.style.display = 'block';

  // Збираємо дані: або для однієї обраної громади, або зведено по всіх
  const currentDataset = appState.activeLayerType === 'hromady'
    ? appState.data
    : appState.districtData;

  // Ідентифікуємо сирі рядки для розрахунку
  // При flat-table архітектурі використовуємо getBudgetValue по _rawData
  const rawRows = appState._rawData || [];

  // 7 складових (без 'total')
  const taxKeys = [
    TAX_TYPES.PDFO,
    TAX_TYPES.SINGLE,
    TAX_TYPES.EXCISE_FUEL,
    TAX_TYPES.EXCISE_RETAIL,
    TAX_TYPES.LAND_RETAIL,
    TAX_TYPES.PROPERTY,
    TAX_TYPES.OTHER,
  ];

  // Фільтруємо сирі рядки — лише ТГ (виключаємо обласний та районні)
  const communityRows = rawRows.filter(row => {
    const name = (row.display_name || row['бюджет'] || '').trim().toLowerCase();
    return name &&
      !name.includes('обласний бюджет') &&
      !name.includes('районний') &&
      !name.includes(' район');
  });

  const sums = taxKeys.map(() => 0);

  if (appState.selectedId && typeof getBudgetValue === 'function') {
    // Режим: обрана конкретна громада
    const selected = currentDataset.find(r => r.id === appState.selectedId);
    if (selected && selected._raw) {
      taxKeys.forEach((tk, i) => {
        sums[i] = getBudgetValue(selected._raw, tk, INDICATORS.FACT_CURRENT) ?? 0;
      });
    } else if (selected) {
      // Fallback через розраховані поля (для районних агрегатів)
      const mapping = ['factPdfoRaw', 'factEdynyRaw', 'factAkcyzRaw', 'factAkcyzRaw', 0, 0, 0];
      taxKeys.forEach((tk, i) => { sums[i] = selected[mapping[i]] || 0; });
    }
  } else if (typeof getBudgetValue === 'function') {
    // Режим: зведено по всіх ТГ
    communityRows.forEach(row => {
      taxKeys.forEach((tk, i) => {
        sums[i] += getBudgetValue(row, tk, INDICATORS.FACT_CURRENT) ?? 0;
      });
    });
  } else {
    // Fallback: стара логіка (якщо Bridge недоступний)
    currentDataset.forEach(r => {
      sums[0] += r.factPdfoRaw || 0;
      sums[1] += r.factEdynyRaw || 0;
      sums[2] += r.factAkcyzRaw || 0;
    });
  }

  // Переводимо в тис. грн для Chart.js
  appState.structureChartInstance.data.datasets[0].data =
    sums.map(v => Number((v / 1000).toFixed(1)));
  appState.structureChartInstance.update();
}

/**
 * 15. Оновлення поля "Дані станом на:" (#report-date).
 * Бере REPORT_DATE з першого доступного рядка через getBudgetValue,
 * форматує у dd.mm.yyyy та вставляє в #report-date.
 * Викликається автоматично при кожній зміні taxType.
 */
function updateAsOfDate() {
  const el = document.getElementById('report-date');
  if (!el) return;

  const rawRows = appState._rawData;
  if (!rawRows || rawRows.length === 0) {
    el.textContent = 'Немає даних';
    return;
  }

  const taxType = appState.currentTaxType || TAX_TYPES.TOTAL;

  // Шукаємо перший рядок, який має непорожню дату для поточного taxType
  let dateVal = null;
  for (const row of rawRows) {
    if (typeof getBudgetValue === 'function') {
      dateVal = getBudgetValue(row, taxType, INDICATORS.REPORT_DATE);
    } else {
      // Fallback: спробуємо прочитати total_report_date або Звітна дата
      const raw = row[`${taxType}_report_date`] || row['total_report_date'] || row['Звітна дата'];
      if (raw) { const d = new Date(raw); dateVal = isNaN(d) ? null : d; }
    }
    if (dateVal) break;
  }

  if (dateVal instanceof Date && !isNaN(dateVal.getTime())) {
    el.textContent = new Intl.DateTimeFormat('uk-UA', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    }).format(dateVal);
  } else {
    el.textContent = 'Немає даних';
  }
}

/**
 * 14. Налаштування обробників подій (Пошук, Вкладки, Скидання)
 */
function setupEventListeners() {
  // Швидкий пошук території за назвою
  const searchInput = document.getElementById('quickSearchInput');
  const dropdown = document.getElementById('searchResults');

  if (searchInput && dropdown) {
    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.trim().toLowerCase();
      if (query.length < 2) {
        dropdown.innerHTML = '';
        dropdown.classList.add('hidden');
        return;
      }

      const currentDataset = appState.activeLayerType === 'hromady' ? appState.data : appState.districtData;
      const matches = currentDataset.filter(r => String(r['бюджет'] || '').toLowerCase().includes(query)).slice(0, 8);

      if (matches.length === 0) {
        dropdown.innerHTML = '<div class="search-item text-muted">Нічого не знайдено</div>';
        dropdown.classList.remove('hidden');
        return;
      }

      dropdown.innerHTML = matches.map(r => `
        <div class="search-item" data-id="${r.id}">
          <span>${r['бюджет']}</span>
          <span style="font-weight:700; color:${getColor(r.execPeriodPercent)}">${formatPercent(r.execPeriodPercent)}</span>
        </div>
      `).join('');
      dropdown.classList.remove('hidden');

      dropdown.querySelectorAll('.search-item[data-id]').forEach(item => {
        item.addEventListener('click', () => {
          selectCommunity(item.getAttribute('data-id'));
          searchInput.value = '';
          dropdown.classList.add('hidden');
        });
      });
    });

    document.addEventListener('click', (e) => {
      if (!searchInput.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.classList.add('hidden');
      }
    });
  }

  // Кнопка скидання вибору (повернення до зведеного звіту)
  const resetBtn = document.getElementById('resetSelectionBtn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => selectCommunity(null));
  }

  // Перемикання вкладок віджета «Лідерство / Антирейтинг»
  const tabBtns = document.querySelectorAll('.ranking-tabs .tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const tab = btn.getAttribute('data-tab');
      appState.currentRankingTab = tab;

      const topUl = document.getElementById('rankingListTop');
      const antiUl = document.getElementById('rankingListAnti');

      if (tab === 'top') {
        if (topUl) topUl.classList.remove('hidden');
        if (antiUl) antiUl.classList.add('hidden');
      } else {
        if (topUl) topUl.classList.add('hidden');
        if (antiUl) antiUl.classList.remove('hidden');
      }
    });
  });

  // Вибір показника в селекторі віджета рейтингу
  const metricSelect = document.getElementById('rankingMetricSelect');
  if (metricSelect) {
    metricSelect.addEventListener('change', () => updateRankingWidget());
  }

  // Слухач зміни типу податку реєструється виключно в budget-data-bridge.js → initTaxSourceSelector().
  // Тут він навмисно відсутній, щоб уникнути подвійної реєстрації обробника.
}

/**
 * ============================================================================
 * ДОПОМІЖНІ ФУНКЦІЇ ФОРМАТУВАННЯ ЧИСЕЛ ТА ВАЛЮТ
 * ============================================================================
 */

function formatMoneyK(val) {
  if (val === null || val === undefined || isNaN(val)) return '0,0 тис. грн';
  const kVal = val / 1000;
  return kVal.toLocaleString('uk-UA', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' тис. грн';
}

function formatPercent(val) {
  if (val === null || val === undefined || isNaN(val)) return '0,0%';
  return Number(val).toLocaleString('uk-UA', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
}

function formatDeviation(val) {
  if (val === null || val === undefined || isNaN(val)) return '0,0 тис. грн';
  const prefix = val > 0 ? '+' : '';
  return prefix + Number(val).toLocaleString('uk-UA', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' тис. грн';
}