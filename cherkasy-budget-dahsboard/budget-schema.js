/**
 * ============================================================================
 * BUDGET SCHEMA — Схема плоскої таблиці export.csv
 * Версія: 2.0 (flat-table architecture)
 * ============================================================================
 *
 * Кожна колонка в CSV будується за шаблоном:
 *   [TAX_TYPE]_[INDICATOR]
 * Приклад: pdfo_fact_current, single_annual_plan_expected
 *
 * Цей модуль надає:
 *   - TAX_TYPES   — словник префіксів (типи податків)
 *   - INDICATORS  — словник суфіксів (фінансові показники)
 *   - NUMERIC_INDICATORS — Set показників, що є числами (для авто-parseFloat)
 *   - getBudgetValue(row, taxType, indicator) — зчитати та розпарсити значення
 *   - formatForDisplay(value, type)           — відформатувати для UI (uk-UA)
 * ============================================================================
 */

// ---------------------------------------------------------------------------
// 1. СЛОВНИКИ (Enums / Constants)
// ---------------------------------------------------------------------------

/**
 * Префікси типів надходжень.
 * Використовуй ці константи замість "магічних рядків" у коді:
 *   TAX_TYPES.PDFO  →  'pdfo'
 */
const TAX_TYPES = Object.freeze({
  TOTAL:          'total',         // Всього
  PDFO:           'pdfo',          // ПДФО
  SINGLE:         'single',        // Єдиний податок
  EXCISE_FUEL:    'excise_fuel',   // Акциз на пальне
  EXCISE_RETAIL:  'excise_retail', // Акциз роздрібний
  LAND_RETAIL:    'land_retail',   // Плата за землю
  PROPERTY:       'property',      // Податок на майно
  OTHER:          'other',         // Інші надходження
});

/**
 * Суфікси фінансових показників.
 * INDICATORS.FACT_CURRENT  →  'fact_current'
 */
const INDICATORS = Object.freeze({
  REPORT_DATE:             'report_date',             // Звітна дата
  ANNUAL_PLAN_INITIAL:     'annual_plan_initial',     // Затверджений річний план
  ANNUAL_PLAN_MODIFIED:    'annual_plan_modified',    // Уточнений план на рік
  ANNUAL_PLAN_EXPECTED:    'annual_plan_expected',    // Очікуване виконання річного плану
  FACT_PREVIOUS_YEAR:      'fact_previous_year',      // Факт минулого року
  PERIOD_PLAN_MODIFIED:    'period_plan_modified',    // Уточнений план на період
  FACT_PER_CAPITA:         'fact_per_capita',         // Надходження на одного мешканця
  DEVIATION_YOY:           'deviation_yoy',           // Динаміка до минулого року (%)
  FACT_PREVIOUS_PERIOD:    'fact_previous_period',    // Факт минулорічного періоду
  FACT_CURRENT:            'fact_current',            // Поточний факт
});

/**
 * Перелік показників, що є числовими (всі, крім дати).
 * Використовується всередині getBudgetValue для автоматичного parseFloat.
 */
const NUMERIC_INDICATORS = new Set([
  INDICATORS.ANNUAL_PLAN_INITIAL,
  INDICATORS.ANNUAL_PLAN_MODIFIED,
  INDICATORS.ANNUAL_PLAN_EXPECTED,
  INDICATORS.FACT_PREVIOUS_YEAR,
  INDICATORS.PERIOD_PLAN_MODIFIED,
  INDICATORS.FACT_PER_CAPITA,
  INDICATORS.DEVIATION_YOY,
  INDICATORS.FACT_PREVIOUS_PERIOD,
  INDICATORS.FACT_CURRENT,
]);

// ---------------------------------------------------------------------------
// 2. ОСНОВНА ФУНКЦІЯ ЗЧИТУВАННЯ ЗНАЧЕННЯ
// ---------------------------------------------------------------------------

/**
 * Повертає значення з рядка CSV-даних за типом податку та показником.
 *
 * @param {Object} row       — об'єкт-рядок, зчитаний з CSV (ключі = назви колонок)
 * @param {string} taxType   — один із значень TAX_TYPES (наприклад, TAX_TYPES.PDFO)
 * @param {string} indicator — один із значень INDICATORS (наприклад, INDICATORS.FACT_CURRENT)
 * @returns {number|Date|null} число, Date або null, якщо колонки не існує
 *
 * @example
 *   getBudgetValue(row, TAX_TYPES.PDFO, INDICATORS.FACT_CURRENT)
 *   // Читає row['pdfo_fact_current'], повертає parseFloat(...)
 *
 *   getBudgetValue(row, TAX_TYPES.TOTAL, INDICATORS.REPORT_DATE)
 *   // Читає row['total_report_date'], повертає new Date('2026-07-09')
 */
function getBudgetValue(row, taxType, indicator) {
  const columnKey = `${taxType}_${indicator}`;
  const raw = row[columnKey];

  // Відсутня або порожня колонка → null
  if (raw === undefined || raw === null || raw === '') return null;

  // Дата: повертаємо об'єкт Date (ISO-рядок 'YYYY-MM-DD' парситься коректно)
  if (indicator === INDICATORS.REPORT_DATE) {
    const date = new Date(raw);
    return isNaN(date.getTime()) ? null : date;
  }

  // Числові показники: parseFloat (CSV вже містить крапку як роздільник)
  if (NUMERIC_INDICATORS.has(indicator)) {
    const num = parseFloat(raw);
    return isNaN(num) ? null : num;
  }

  // Fallback: повертаємо сирий рядок (на випадок нових колонок)
  return raw;
}

// ---------------------------------------------------------------------------
// 3. ФУНКЦІЯ ФОРМАТУВАННЯ ДЛЯ ВІДОБРАЖЕННЯ В UI
// ---------------------------------------------------------------------------

/**
 * Форматує сире значення (число / Date) для виведення в UI у стилі uk-UA.
 *
 * @param {number|Date|null} value — значення, отримане через getBudgetValue()
 * @param {'number'|'date'|'percent'|'currency'} type — тип форматування
 * @returns {string} відформатований рядок або '—' якщо значення відсутнє
 *
 * @example
 *   formatForDisplay(257111.02, 'number')   → '257 111,02'
 *   formatForDisplay(257111.02, 'currency') → '257 111,02 грн'
 *   formatForDisplay(12.5,      'percent')  → '12,50%'
 *   formatForDisplay(new Date('2026-07-09'), 'date') → '09.07.2026'
 */
function formatForDisplay(value, type) {
  if (value === null || value === undefined) return '\u2014';

  switch (type) {

    // --- Звичайне число з пробілами-тисячниками та комою (257 111,02) ---
    case 'number':
      return typeof value === 'number'
        ? value.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : '\u2014';

    // --- Грошова сума з підписом "грн" (257 111,02 грн) ---
    case 'currency':
      return typeof value === 'number'
        ? value.toLocaleString('uk-UA', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }) + '\u00a0грн'
        : '\u2014';

    // --- Відсоток (динаміка до минулого року: 12,50%) ---
    case 'percent':
      return typeof value === 'number'
        ? value.toLocaleString('uk-UA', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }) + '%'
        : '\u2014';

    // --- Дата у форматі DD.MM.YYYY ---
    case 'date':
      if (value instanceof Date && !isNaN(value.getTime())) {
        return new Intl.DateTimeFormat('uk-UA', {
          day:   '2-digit',
          month: '2-digit',
          year:  'numeric',
        }).format(value);
      }
      return '\u2014';

    default:
      return String(value);
  }
}

// ---------------------------------------------------------------------------
// 4. ЗРУЧНА ОБГОРТКА: зчитати + одразу відформатувати (для шаблонів/тултипів)
// ---------------------------------------------------------------------------

/**
 * Комбінує getBudgetValue + formatForDisplay в один виклик.
 * Автоматично визначає тип форматування на основі indicator.
 *
 * @param {Object} row
 * @param {string} taxType
 * @param {string} indicator
 * @returns {string} готовий рядок для виведення в UI
 *
 * @example
 *   getFormattedValue(row, TAX_TYPES.PDFO, INDICATORS.FACT_CURRENT)
 *   → '257 111,02 грн'
 *
 *   getFormattedValue(row, TAX_TYPES.TOTAL, INDICATORS.DEVIATION_YOY)
 *   → '12,50%'
 *
 *   getFormattedValue(row, TAX_TYPES.TOTAL, INDICATORS.REPORT_DATE)
 *   → '09.07.2026'
 */
function getFormattedValue(row, taxType, indicator) {
  const value = getBudgetValue(row, taxType, indicator);

  if (indicator === INDICATORS.REPORT_DATE)   return formatForDisplay(value, 'date');
  if (indicator === INDICATORS.DEVIATION_YOY) return formatForDisplay(value, 'percent');
  // Решта числових показників — грошові суми
  return formatForDisplay(value, 'currency');
}

// ---------------------------------------------------------------------------
// 5. МЕТАДАНІ ДЛЯ UI (підписи колонок для таблиць, тултипів тощо)
// ---------------------------------------------------------------------------

/**
 * Людськочитабельні підписи для типів податків (для заголовків, легенди).
 */
const TAX_LABELS = Object.freeze({
  [TAX_TYPES.TOTAL]:         'Всього',
  [TAX_TYPES.PDFO]:          'ПДФО',
  [TAX_TYPES.SINGLE]:        'Єдиний податок',
  [TAX_TYPES.EXCISE_FUEL]:   'Акциз на пальне',
  [TAX_TYPES.EXCISE_RETAIL]: 'Акциз роздрібний',
  [TAX_TYPES.LAND_RETAIL]:   'Плата за землю',
  [TAX_TYPES.PROPERTY]:      'Податок на майно',
  [TAX_TYPES.OTHER]:         'Інші надходження',
});

/**
 * Людськочитабельні підписи для показників.
 */
const INDICATOR_LABELS = Object.freeze({
  [INDICATORS.REPORT_DATE]:          'Звітна дата',
  [INDICATORS.ANNUAL_PLAN_INITIAL]:  'Затверджений річний план',
  [INDICATORS.ANNUAL_PLAN_MODIFIED]: 'Уточнений план на рік',
  [INDICATORS.ANNUAL_PLAN_EXPECTED]: 'Очікуване виконання річного плану',
  [INDICATORS.FACT_PREVIOUS_YEAR]:   'Факт минулого року',
  [INDICATORS.PERIOD_PLAN_MODIFIED]: 'Уточнений план на період',
  [INDICATORS.FACT_PER_CAPITA]:      'Надходження на одного мешканця',
  [INDICATORS.DEVIATION_YOY]:        'Динаміка до минулого року',
  [INDICATORS.FACT_PREVIOUS_PERIOD]: 'Факт минулорічного періоду',
  [INDICATORS.FACT_CURRENT]:         'Поточний факт',
});
