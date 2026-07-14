/**
 * ============================================================================
 * BUDGET DATA BRIDGE — Шар прив'язки даних до UI
 * Версія: 2.0 (flat-table architecture / export.csv)
 * ============================================================================
 *
 * Цей файл підключає словники з budget-schema.js до існуючого HTML-інтерфейсу
 * без жодних змін у розмітці чи стилях.
 *
 * Залежності (мають бути підключені ДО цього файлу у <head> або перед </body>):
 *   1. budget-schema.js  — TAX_TYPES, INDICATORS, getBudgetValue, formatForDisplay
 *   2. app.js            — appState, updateDashboard, updateRankingWidget, ...
 *
 * Точка входу:
 *   - initDataBridge()   → викликається після завантаження DOM
 * ============================================================================
 */

// ---------------------------------------------------------------------------
// 0. ВНУТРІШНІЙ СТАН МОДУЛЯ
// ---------------------------------------------------------------------------

/**
 * Поточний обраний тип надходжень.
 * Зберігається як одне з значень TAX_TYPES (наприклад, 'total', 'pdfo').
 * За замовчуванням — загальний бюджет.
 * @type {string}
 */
let currentTaxType = TAX_TYPES.TOTAL;

// ---------------------------------------------------------------------------
// 1. ГОЛОВНИЙ КОНТРОЛЕР: Випадаючий список "Джерело даних"
// ---------------------------------------------------------------------------

/**
 * Ініціалізує слухач події на селекторі типу податку.
 *
 * HTML-елемент: <select id="taxSourceSelect">
 * Очікувані значення <option value="..."> відповідають TAX_TYPES:
 *   total | pdfo | single | excise_fuel | excise_retail | land_retail | property | other
 *
 * При зміні значення:
 *   1. Зберігає новий тип у currentTaxType
 *   2. Оновлює appState (для сумісності з існуючим app.js)
 *   3. Викликає updateDashboard() для перемалювання всього UI
 */
function initTaxSourceSelector() {
  const taxSelect = document.getElementById('taxSourceSelect');
  if (!taxSelect) {
    console.warn('[Bridge] Елемент #taxSourceSelect не знайдено.');
    return;
  }

  // Встановлюємо початкове значення відповідно до дефолтного TAX_TYPES.TOTAL
  taxSelect.value = currentTaxType;

  taxSelect.addEventListener('change', (e) => {
    const selectedValue = e.target.value;

    // Перевіряємо, чи значення є валідним TAX_TYPES ключем
    const isValidTaxType = Object.values(TAX_TYPES).includes(selectedValue);
    if (!isValidTaxType) {
      console.warn(`[Bridge] Невалідне значення селектора: "${selectedValue}". Очікується одне з:`, Object.values(TAX_TYPES));
      return;
    }

    currentTaxType = selectedValue;

    // Синхронізуємо з існуючим appState для сумісності зі старим кодом
    if (typeof appState !== 'undefined') {
      appState.currentTaxType = currentTaxType;
    }

    console.log(`[Bridge] Обрано тип надходжень: ${currentTaxType} (${TAX_LABELS[currentTaxType] || currentTaxType})`);

    // Оновлюємо весь дашборд
    updateDashboardByTaxType(currentTaxType);
  });

  console.log('[Bridge] Селектор типу податку ініціалізовано.');
}

// ---------------------------------------------------------------------------
// 2. УПРАВЛІННЯ ВИДИМІСТЮ: Кругова діаграма ("Бублик")
// ---------------------------------------------------------------------------

/**
 * Контролює видимість контейнера з Donut Chart (#structureChartContainer).
 *
 * Логіка:
 *   - TAX_TYPES.TOTAL → контейнер видимий (display: 'block' або попередній стан)
 *   - Будь-який інший тип → контейнер прихований (display: 'none')
 *
 * @param {string} taxType — поточне значення з TAX_TYPES
 */
function toggleStructureChartVisibility(taxType) {
  const container = document.getElementById('structureChartContainer');
  if (!container) return;

  const isTotal = (!taxType || taxType === 'total' || (typeof TAX_TYPES !== 'undefined' && taxType === TAX_TYPES.TOTAL));
  if (isTotal) {
    container.style.display = 'block';
  } else {
    container.style.display = 'none';
  }
}

// ---------------------------------------------------------------------------
// 3. КАЛЬКУЛЯТОР МЕТРИК ДЛЯ ГРОМАДИ
// ---------------------------------------------------------------------------

/**
 * Розраховує 4 ключові аналітичні метрики для одного рядка даних.
 *
 * Використовує getBudgetValue() з budget-schema.js для безпечного читання
 * та авто-парсингу значень з плоскої таблиці.
 *
 * @param {Object} row      — рядок даних з globalData (або appState.data)
 * @param {string} taxType  — один із TAX_TYPES
 * @returns {{
 *   execPeriodPercent: number,  Рівень виконання за період (%)
 *   devThousand: number,        Відхилення від плану (тис. грн)
 *   execYearPercent: number,    Рівень виконання річного плану (%)
 *   growthRate: number          Темп росту до минулого року (%)
 * }}
 */
function calcCommunityMetrics(row, taxType) {
  const factCurrent    = getBudgetValue(row, taxType, INDICATORS.FACT_CURRENT)    ?? 0;
  const periodPlan     = getBudgetValue(row, taxType, INDICATORS.PERIOD_PLAN_MODIFIED) ?? 0;
  const annualPlan     = getBudgetValue(row, taxType, INDICATORS.ANNUAL_PLAN_MODIFIED) ?? 0;
  const factPrevYear   = getBudgetValue(row, taxType, INDICATORS.FACT_PREVIOUS_YEAR)   ?? 0;

  // 3.1 Рівень виконання за звітний період (%)
  // (FACT_CURRENT / PERIOD_PLAN_MODIFIED) * 100 — якщо план = 0, повертаємо 0
  const execPeriodPercent = periodPlan > 0
    ? Number(((factCurrent / periodPlan) * 100).toFixed(1))
    : 0;

  // 3.2 Відхилення від плану (тис. грн)
  // FACT_CURRENT - PERIOD_PLAN_MODIFIED, переведено в тис. грн
  const devThousand = Number(((factCurrent - periodPlan) / 1000).toFixed(1));

  // 3.3 Рівень виконання річного плану (%)
  const execYearPercent = annualPlan > 0
    ? Number(((factCurrent / annualPlan) * 100).toFixed(1))
    : 0;

  // 3.4 Темп росту до минулого року (%)
  const growthRate = factPrevYear > 0
    ? Number(((factCurrent / factPrevYear) * 100).toFixed(1))
    : 0;

  return { execPeriodPercent, devThousand, execYearPercent, growthRate };
}

// ---------------------------------------------------------------------------
// 4. ТРАНСФОРМАЦІЯ МАСИВУ ДАНИХ ДЛЯ ПОТОЧНОГО ТИПУ ПОДАТКУ
// ---------------------------------------------------------------------------

/**
 * Перетворює сирий масив рядків (з export.csv) на збагачений масив громад
 * з розрахованими метриками для обраного типу надходжень.
 *
 * Використовується замість processFinancialData() при flat-table архітектурі.
 *
 * @param {Object[]} rawRows — рядки з PapaParse (ключі = назви колонок)
 * @param {string}   taxType — поточний TAX_TYPES
 * @returns {Object[]} масив збагачених об'єктів громад
 */
function transformDataByTaxType(rawRows, taxType) {
  if (!rawRows || rawRows.length === 0) return [];

  // Визначаємо поле з іменем громади (display_name або бюджет)
  const getName = (row) =>
    (row.display_name || row['бюджет'] || row['Бюджет'] || '').trim();

  return rawRows
    .filter(row => {
      const name = getName(row).toLowerCase();
      // Виключаємо обласний та районні бюджети — лише громади
      return (
        name !== '' &&
        !name.includes('обласний бюджет') &&
        !name.includes('районний') &&
        !name.includes('район')
      );
    })
    .map((row, index) => {
      const metrics = calcCommunityMetrics(row, taxType);

      // Додаткові сирі значення (для KPI-карток та графіків)
      const factCurrent  = getBudgetValue(row, taxType, INDICATORS.FACT_CURRENT)        ?? 0;
      const periodPlan   = getBudgetValue(row, taxType, INDICATORS.PERIOD_PLAN_MODIFIED) ?? 0;
      const annualPlan   = getBudgetValue(row, taxType, INDICATORS.ANNUAL_PLAN_MODIFIED) ?? 0;
      const factPrevYear = getBudgetValue(row, taxType, INDICATORS.FACT_PREVIOUS_YEAR)   ?? 0;

      return {
        // Ідентифікатори
        id:       String(row.id || `hromada-${index}`).trim(),
        бюджет:   getName(row),
        rayon:    row.rayon_name ? row.rayon_name.trim() : 'Невизначений район',
        'Рівень річного бюджету': row['Рівень річного бюджету'] || 'Громада',

        // Сирі числові значення (тис. грн або грн — як в CSV)
        planPeriodRaw:   periodPlan,
        factRaw:         factCurrent,
        planYearRaw:     annualPlan,
        factPrevYearRaw: factPrevYear,

        // Розраховані метрики
        ...metrics,

        // Посилання на оригінальний рядок (для доступу до всіх колонок)
        _raw: row,
        _taxType: taxType,
      };
    });
}

// ---------------------------------------------------------------------------
// 5. РЕЙТИНГ ГРОМАД: Топ-10 / Антирейтинг
// ---------------------------------------------------------------------------

/**
 * Повертає відсортований та нарізаний масив для рейтингового списку.
 *
 * @param {Object[]} data         — збагачений масив з transformDataByTaxType()
 * @param {string}   metricKey    — ключ метрики: 'execPeriodPercent' | 'devThousand' |
 *                                               'execYearPercent' | 'growthRate'
 * @param {boolean}  isLeaderboard — true → DESC (лідери), false → ASC (антирейтинг)
 * @returns {Object[]} масив до 10 елементів
 */
function getTop10Communities(data, metricKey, isLeaderboard) {
  if (!data || data.length === 0) return [];

  // 1. Попереднє очищення (фільтрація): відкидаємо ті громади/райони,
  // де І ПЛАН, І ФАКТ дорівнюють 0 (або null) для поточного податку.
  const filtered = data.filter(row => {
    const plan = row.planPeriodRaw ?? 0;
    const fact = row.factRaw ?? 0;
    if (Math.abs(plan) < 0.001 && Math.abs(fact) < 0.001) return false;
    return true;
  });

  // 2. Сортуємо: якщо лідери (isLeaderboard === true) → DESC, якщо антирейтинг (false) → ASC
  const sorted = [...filtered].sort((a, b) => {
    const av = a[metricKey] ?? 0;
    const bv = b[metricKey] ?? 0;
    return isLeaderboard ? bv - av : av - bv;
  });

  return sorted.slice(0, 10);
}

/**
 * Форматує значення метрики для відображення у рядку рейтингу.
 *
 * @param {Object}  row           — об'єкт громади
 * @param {string}  metricKey     — ключ метрики
 * @param {boolean} isLeaderboard — true = лідери (зелений), false = антирейтинг (червоний)
 * @returns {string} HTML-рядок зі стилізованим значенням
 */
function formatRankingValue(row, metricKey, isLeaderboard) {
  const val = row[metricKey] ?? 0;

  // Колір визначається виключно позицією списку (лідер / антирейтинг)
  const color = isLeaderboard === false ? '#c23b66' : '#0ea76c';

  if (metricKey === 'devThousand') {
    const formatted = formatForDisplay(Math.abs(val) * 1000, 'currency');
    const prefix = val >= 0 ? '+' : '−';
    return `<span style="color:${color}; font-weight:700;">${prefix}${formatted}</span>`;
  }

  // Відсоткові метрики
  const formatted = formatForDisplay(val, 'percent');
  return `<span style="color:${color}; font-weight:800;">${formatted}</span>`;
}

/**
 * Рендерить список рейтингу в DOM-контейнер.
 *
 * @param {HTMLElement} ulEl        — <ul> для виведення
 * @param {Object[]}    items       — масив рядків (до 10)
 * @param {string}      metricKey   — ключ метрики
 * @param {boolean}     isLeaderboard
 * @param {Object[]}    fullSorted  — повний відсортований масив (для відображення загального рейтингу)
 */
function renderRankingList(ulEl, items, metricKey, isLeaderboard, fullSorted) {
  if (!ulEl) return;

  if (items.length === 0) {
    ulEl.innerHTML = '<li class="ranking-item"><span class="ranking-hromada-name">Немає даних</span></li>';
    return;
  }

  ulEl.innerHTML = items.map((row, idx) => {
    const isSelected = typeof appState !== 'undefined' && row.id === appState.selectedId;

    // Колір лівої бордер-полоски: зелений для лідерів, червоний для антирейтингу
    const borderColor = isLeaderboard ? '#0ea76c' : '#c23b66';

    // Позиція в загальному відсортованому масиві (для нумерації)
    const globalRank = fullSorted
      ? fullSorted.findIndex(r => r.id === row.id) + 1
      : idx + 1;

    const badgeClass = isLeaderboard ? 'rank-top-pos' : 'rank-anti-pos';
    const formattedVal = formatRankingValue(row, metricKey, isLeaderboard);
    const displayName  = row['бюджет'] || row.display_name || `Громада ${idx + 1}`;

    return `
      <li class="ranking-item ${isSelected ? 'selected-ranking-item' : ''}"
          data-id="${row.id}"
          style="border-left: 4px solid ${borderColor};">
        <div class="ranking-item-left">
          <span class="rank-pos-badge ${badgeClass}">#${globalRank}</span>
          <span class="ranking-hromada-name" title="${displayName}">${displayName}</span>
        </div>
        <div class="ranking-item-value">${formattedVal}</div>
      </li>
    `;
  }).join('');

  // Прив'язуємо кліки на елементи рейтингу (вибір громади на карті)
  ulEl.querySelectorAll('.ranking-item[data-id]').forEach(item => {
    item.addEventListener('click', () => {
      const id = item.getAttribute('data-id');
      if (typeof selectCommunity === 'function') {
        selectCommunity(id === (appState && appState.selectedId) ? null : id);
      }
    });
  });
}

/**
 * Головна функція оновлення всього віджета рейтингу.
 * Зчитує обрану метрику з селектора, будує Top-10 та Антирейтинг.
 *
 * @param {Object[]} enrichedData — збагачений масив від transformDataByTaxType()
 */
function updateRankingWidgetBySchema(enrichedData) {
  const topUl    = document.getElementById('rankingListTop');
  const antiUl   = document.getElementById('rankingListAnti');
  const selectEl = document.getElementById('rankingMetricSelect');
  const titleEl  = document.getElementById('rankingWidgetTitle');

  if (!topUl || !antiUl || !selectEl) return;

  const metricKey = selectEl.value || 'execPeriodPercent';

  if (titleEl) {
    titleEl.textContent = (typeof appState !== 'undefined' && appState.activeLayerType === 'districts')
      ? 'Рейтинг районів області'
      : 'Рейтинг громад (ТГ)';
  }

  const dataset = enrichedData || (typeof appState !== 'undefined' ? (appState.activeLayerType === 'districts' ? appState.districtData : appState.data) : []);
  if (!dataset || dataset.length === 0) return;

  // Фільтруємо нульові громади перед побудовою списків та визначенням рангів
  const filtered = dataset.filter(row => {
    const plan = row.planPeriodRaw ?? 0;
    const fact = row.factRaw ?? 0;
    if (Math.abs(plan) < 0.001 && Math.abs(fact) < 0.001) return false;
    return true;
  });

  // Повний відсортований масив для правильної нумерації позицій (#1, #2, ...)
  const fullSortedDesc = [...filtered].sort((a, b) => (b[metricKey] ?? 0) - (a[metricKey] ?? 0));
  const fullSortedAsc  = [...filtered].sort((a, b) => (a[metricKey] ?? 0) - (b[metricKey] ?? 0));

  const topItems  = getTop10Communities(filtered, metricKey, true);
  const antiItems = getTop10Communities(filtered, metricKey, false);

  renderRankingList(topUl,  topItems,  metricKey, true,  fullSortedDesc);
  renderRankingList(antiUl, antiItems, metricKey, false, fullSortedAsc);
}

// ---------------------------------------------------------------------------
// 6. ГОЛОВНА ФУНКЦІЯ ОНОВЛЕННЯ ДАШБОРДУ
// ---------------------------------------------------------------------------

/**
 * Оркеструє оновлення всіх компонентів UI при зміні типу надходжень.
 *
 * Порядок операцій:
 *   1. Перевіряє наявність глобальних даних
 *   2. Трансформує дані для нового taxType
 *   3. Оновлює appState для сумісності з chart/map логікою
 *   4. Контролює видимість бублика
 *   5. Оновлює рейтинговий віджет
 *   6. Оновлює решту UI через існуючу updateDashboard()
 *
 * @param {string} taxType — одне із значень TAX_TYPES
 */
function updateDashboardByTaxType(taxType) {
  // Перевірка наявності глобальних даних
  const rawData = (typeof appState !== 'undefined' && appState._rawData)
    ? appState._rawData
    : (typeof globalData !== 'undefined' ? globalData : null);

  if (!rawData || rawData.length === 0) {
    console.warn('[Bridge] Дані ще не завантажені. Чекаємо...');
    return;
  }

  // Трансформуємо сирі дані в збагачений масив для обраного типу
  const enrichedData = transformDataByTaxType(rawData, taxType);

  if (enrichedData.length === 0) {
    console.warn('[Bridge] Після трансформації даних масив порожній для taxType:', taxType);
  }

  // Зберігаємо в appState для використання в chart/map функціях
  if (typeof appState !== 'undefined') {
    appState.data = enrichedData;
    appState.currentTaxType = taxType;
    // Перераховуємо районні агрегати — використовуємо taxType-aware aggregateDataByDistrict
    // якщо доступний, інакше fallback на calculateDistrictAggregates
    if (typeof aggregateDataByDistrict === 'function' && appState._rawData) {
      appState.districtData = aggregateDataByDistrict(appState._rawData, taxType);
    } else if (typeof calculateDistrictAggregates === 'function') {
      appState.districtData = calculateDistrictAggregates(enrichedData);
    }
    // Оновляємо прив'язку до GeoJSON
    if (typeof linkDataToGeoJson === 'function') {
      linkDataToGeoJson();
    }
  }

  // Оновлюємо кольори та тултипи карти без повного перемалювання шару
  updateMapColorsByTax(taxType, enrichedData);

  // Управляємо видимістю кругової діаграми
  toggleStructureChartVisibility(taxType);

  // Оновлюємо рейтинговий віджет через новий Schema-aware рендерер
  updateRankingWidgetBySchema(enrichedData);

  // Динамічне управління видимістю Обласного бюджету (Блок А)
  const blockAEl = document.getElementById('blockA') || document.querySelector('.block-a');
  if (blockAEl) {
    const isTotalOrPdfo = (taxType === 'total' || taxType === 'pdfo' || (typeof TAX_TYPES !== 'undefined' && (taxType === TAX_TYPES.TOTAL || taxType === TAX_TYPES.PDFO)));
    if (isTotalOrPdfo) {
      blockAEl.style.display = 'block';
    } else {
      blockAEl.style.display = 'none';
      console.log(`[Bridge] Приховуємо Обласний бюджет для податку: ${taxType}`);
    }
  }

  // ПРИМУСОВЕ ОНОВЛЕННЯ ОБЛАСНОГО БЮДЖЕТУ
  if (typeof updateBlockA === 'function') updateBlockA(taxType);

  // Оновлюємо решту UI через існуючу логіку app.js
  if (typeof updateDashboard === 'function') {
    updateDashboard();
  }

  // Додаткові віджети, які потребують taxType-аварного перерахунку
  if (typeof updateAsOfDate === 'function') updateAsOfDate();
}

// ---------------------------------------------------------------------------
// 5a. АГРЕГАЦІЯ ДАНИХ ПО РАЙОНАХ (для шару "Districts")
// ---------------------------------------------------------------------------

// HROMADA_TO_RAYON словник видалено — район тепер читається напряму з поля rayon_name у CSV.

/**
 * Агрегує фінансові показники усіх ТГ за 4-ма районами для поточного taxType.
 *
 * Назва району береться напряму з поля `rayon_name` у кожному рядку CSV.
 * Рядки без `rayon_name` або з назвою "Обласний бюджет" ігноруються.
 *
 * Зіставлення з districts.json: поле `бюджет` агрегату формується як `"${rayonKey} район"`,
 * що відповідає `feature.properties.rayon` у GeoJSON (наприклад, "Черкаський район").
 *
 * @param {Object[]} rawRows — сирі рядки з export.csv
 * @param {string}   taxType — поточний TAX_TYPES
 * @returns {Object[]} масив із 4-х районних агрегатів (включаючи метрики)
 */
function aggregateDataByDistrict(rawRows, taxType) {
  if (!rawRows || rawRows.length === 0) return [];

  const districtMap = {};

  rawRows.forEach(row => {
    // Читаємо район прямо з колонки rayon_name (базове очищення пробілів)
    const rayonKey = row.rayon_name ? row.rayon_name.trim() : '';

    // Пропускаємо рядки без району або з технічними зведеними рядками
    if (!rayonKey) return;
    if (rayonKey.toLowerCase().includes('обласний')) return;

    if (!districtMap[rayonKey]) {
      districtMap[rayonKey] = {
        id:           rayonKey,
        'бюджет':      `${rayonKey} район`,  // відповідає feature.properties.rayon у GeoJSON
        rayon:        rayonKey,
        display_name: `${rayonKey} район`,
        planPeriodRaw:   0,
        factRaw:         0,
        planYearRaw:     0,
        factPrevYearRaw: 0,
        hromadaCount:    0,
      };
    }

    const d = districtMap[rayonKey];
    const fact   = getBudgetValue(row, taxType, INDICATORS.FACT_CURRENT)         ?? 0;
    const plan   = getBudgetValue(row, taxType, INDICATORS.PERIOD_PLAN_MODIFIED) ?? 0;
    const planY  = getBudgetValue(row, taxType, INDICATORS.ANNUAL_PLAN_MODIFIED) ?? 0;
    const factPY = getBudgetValue(row, taxType, INDICATORS.FACT_PREVIOUS_YEAR)   ?? 0;

    d.factRaw         += fact;
    d.planPeriodRaw   += plan;
    d.planYearRaw     += planY;
    d.factPrevYearRaw += factPY;
    d.hromadaCount++;
  });

  // Розраховуємо метрики для кожного районного агрегату
  return Object.values(districtMap).map(d => {
    const execPeriodPercent = d.planPeriodRaw > 0
      ? Number(((d.factRaw / d.planPeriodRaw) * 100).toFixed(1)) : 0;
    const devThousand = Number(((d.factRaw - d.planPeriodRaw) / 1000).toFixed(1));
    const execYearPercent = d.planYearRaw > 0
      ? Number(((d.factRaw / d.planYearRaw) * 100).toFixed(1)) : 0;
    const growthRate = d.factPrevYearRaw > 0
      ? Number(((d.factRaw / d.factPrevYearRaw) * 100).toFixed(1)) : 0;
    return { ...d, execPeriodPercent, devThousand, execYearPercent, growthRate };
  });
}

// ---------------------------------------------------------------------------
// 5b. ОНОВЛЕННЯ КАРТИ: кольори шару + тултипи без перемалювання
// ---------------------------------------------------------------------------

/**
 * Перефарбовує полігони Leaflet і оновлює тултипи залежно від обраного taxType.
 * Використовує eachLayer() без повного перемалювання, що значно швидше.
 *
 * Логіка зіставлення громади з enrichedData:
 *   - робимо нечутливе до реєстру та зайвих пробілів порівняння назви
 *   - вважаємо поле display_name або бюджет реальною назвою
 *   - при зіставленні застосовуємо setStyle + setTooltipContent
 *
 * @param {string}   taxType      — поточний TAX_TYPES
 * @param {Object[]} enrichedData — масив збагачених громад з transformDataByTaxType()
 */
function updateMapColorsByTax(taxType, enrichedData) {
  // Карта може бути ще не ініціалізована або шар відсутній
  if (
    typeof appState === 'undefined' ||
    !appState.mapLayer
  ) return;

  const targetData = (appState.activeLayerType === 'districts' && appState.districtData && appState.districtData.length > 0)
    ? appState.districtData
    : (enrichedData && enrichedData.length > 0 ? enrichedData : (appState.data || []));

  if (!targetData || targetData.length === 0) return;

  // Будуємо пошуковий індекс для швидкого O(1)-пошуку за назвою та ID
  const byName = new Map();
  targetData.forEach(row => {
    const key = (row['бюджет'] || row.display_name || row.rayon || '').trim().toLowerCase();
    if (key) byName.set(key, row);
    if (row.id) byName.set(String(row.id).trim().toLowerCase(), row);
    if (row.rayon) byName.set(row.rayon.trim().toLowerCase(), row);
  });

  const taxLabel = (typeof TAX_LABELS !== 'undefined')
    ? TAX_LABELS[taxType] || 'Загальні надходження'
    : 'Загальні надходження';

  const isDistricts = appState.activeLayerType === 'districts';

  appState.mapLayer.eachLayer(layer => {
    const feature  = layer.feature;
    if (!feature) return;

    const props    = feature.properties || {};
    const finance  = props.finance     || {};

    // Назва території з двох джерел: finance-об'єкт або GeoJSON-властивості
    const rawName  = (finance['бюджет'] || finance.rayon || props.hromada || props.rayon || props.name || '').trim();
    const rawId    = (finance.id || props.id || '').trim();
    const lookupKey = rawName.toLowerCase();
    const lookupId  = rawId.toLowerCase();

    // Спробуємо знайти територію в targetData
    let match = byName.get(lookupKey) || (lookupId ? byName.get(lookupId) : null);

    if (!match && isDistricts) {
      const pRayon = (props.rayon || props.name || '').trim().toLowerCase();
      if (pRayon) {
        match = targetData.find(r => (r.rayon || r['бюджет'] || '').trim().toLowerCase() === pRayon);
      }
    }

    if (!match) {
      // Територію не знайдено — профарбовуємо в сірий і переходим
      layer.setStyle({ fillColor: '#cbd5e1', fillOpacity: 0.5 });
      return;
    }

    // Оновлюємо колір полігону (зберігаємо weight/opacity незмінними)
    const newColor = getCommunityColor(match.execPeriodPercent);
    const isSelected = (appState.selectedId === (match.id || rawId));
    layer.setStyle({
      fillColor: newColor,
      fillOpacity: isSelected ? 0.95 : 0.8,
      color: isSelected ? '#C5A059' : '#334155',
      weight: isSelected ? 3.5 : (isDistricts ? 2.5 : 1.2)
    });

    // Оновлюємо вміст тултипа, використовуючи збережену builder-функцію
    if (typeof layer._buildTooltip === 'function') {
      // Оновлюємо finance в feature.properties, щоб builder читав актуальні дані
      feature.properties.finance = match;
      layer.setTooltipContent(layer._buildTooltip(match));
    } else {
      // Фолбек: будуємо тултип безпосередньо
      const execRate = match.execPeriodPercent || 0;
      const layerTitle = isDistricts ? 'Зведений район' : 'Громада';
      const html = `
        <div class="custom-tooltip-content">
          <h4>${rawName}</h4>
          <p><strong>Рівень:</strong> ${layerTitle} &nbsp;|&nbsp; <em>${taxLabel}</em></p>
          <p><strong>План на період:</strong> ${formatMoneyK(match.planPeriodRaw)}</p>
          <p><strong>Фактичні надходження:</strong> ${formatMoneyK(match.factRaw)}</p>
          <p><strong>Виконання плану:</strong>
            <span style="font-weight:700; color:${newColor}">${formatPercent(execRate)}</span>
          </p>
          <p><strong>Відхилення:</strong>
            <span class="${(match.devThousand || 0) >= 0 ? 'text-success' : 'text-danger'}">${formatDeviation(match.devThousand)}</span>
          </p>
        </div>`;
      layer.setTooltipContent(html);
      feature.properties.finance = match;
    }
  });

  console.log(`[Bridge] Карту перефарбовано для taxType: ${taxType} (шар: ${appState.activeLayerType})`);
}

// ---------------------------------------------------------------------------
// 7. СЛУХАЧ НА ЗМІНУ МЕТРИКИ РЕЙТИНГУ (повторний рендер без перерахунку)
// ---------------------------------------------------------------------------

/**
 * При зміні метрики у #rankingMetricSelect перерендерюємо рейтинг
 * з поточними вже трансформованими даними (без повторного парсингу CSV).
 */
function initRankingMetricListener() {
  const metricSelect = document.getElementById('rankingMetricSelect');
  if (!metricSelect) return;

  // Замінюємо існуючий слухач зміни метрики на наш Schema-aware варіант
  metricSelect.addEventListener('change', () => {
    const currentData = typeof appState !== 'undefined'
      ? (appState.activeLayerType === 'districts' ? appState.districtData : appState.data)
      : [];
    if (currentData && currentData.length > 0) {
      updateRankingWidgetBySchema(currentData);
    }
  });
}

// ---------------------------------------------------------------------------
// 8. ТОЧКА ВХОДУ: initDataBridge()
// ---------------------------------------------------------------------------

/**
 * Головна функція ініціалізації модуля.
 * Має викликатися після DOMContentLoaded та після завантаження app.js.
 *
 * @example
 *   // У кінці DOMContentLoaded в app.js або в окремому <script>:
 *   document.addEventListener('DOMContentLoaded', () => {
 *     initDataBridge();
 *   });
 */
function initDataBridge() {
  initTaxSourceSelector();
  initRankingMetricListener();

  // Зберігаємо посилання на функцію оновлення в appState для доступу з app.js
  if (typeof appState !== 'undefined') {
    appState._bridgeUpdate = updateDashboardByTaxType;
    appState.currentTaxType = currentTaxType;
  }

  console.log('[Bridge] Data Bridge ініціалізовано. Поточний тип:', currentTaxType);
}

// ---------------------------------------------------------------------------
// 9. ХЕЛПЕР: збагачення одного рядка для KPI-карток
// ---------------------------------------------------------------------------

/**
 * Повертає об'єкт з усіма форматованими значеннями для KPI-карток
 * одного рядка даних. Зручно для тултипів та профілю громади.
 *
 * @param {Object} row     — рядок з CSV (ключі = назви колонок)
 * @param {string} taxType — поточний TAX_TYPES
 * @returns {{
 *   planPeriod: string,
 *   fact: string,
 *   deviation: string,
 *   planYear: string,
 *   factPrevYear: string,
 *   execPeriodPercent: string,
 *   execYearPercent: string,
 *   growthRate: string,
 *   reportDate: string
 * }}
 */
function getFormattedKPI(row, taxType) {
  const fact       = getBudgetValue(row, taxType, INDICATORS.FACT_CURRENT)        ?? 0;
  const planPeriod = getBudgetValue(row, taxType, INDICATORS.PERIOD_PLAN_MODIFIED) ?? 0;
  const planYear   = getBudgetValue(row, taxType, INDICATORS.ANNUAL_PLAN_MODIFIED) ?? 0;
  const prevYear   = getBudgetValue(row, taxType, INDICATORS.FACT_PREVIOUS_YEAR)   ?? 0;
  const dateVal    = getBudgetValue(row, taxType, INDICATORS.REPORT_DATE);

  const metrics = calcCommunityMetrics(row, taxType);

  const deviation = fact - planPeriod;

  return {
    planPeriod:         formatForDisplay(planPeriod / 1000, 'number') + ' тис. грн',
    fact:               formatForDisplay(fact       / 1000, 'number') + ' тис. грн',
    deviation:          (deviation >= 0 ? '+' : '') + formatForDisplay(deviation / 1000, 'number') + ' тис. грн',
    planYear:           formatForDisplay(planYear   / 1000, 'number') + ' тис. грн',
    factPrevYear:       formatForDisplay(prevYear   / 1000, 'number') + ' тис. грн',
    execPeriodPercent:  formatForDisplay(metrics.execPeriodPercent, 'percent'),
    execYearPercent:    formatForDisplay(metrics.execYearPercent,   'percent'),
    growthRate:         formatForDisplay(metrics.growthRate,        'percent'),
    reportDate:         dateVal ? formatForDisplay(dateVal, 'date') : '—',
  };
}
