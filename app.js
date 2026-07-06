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
  currentRankingTab: 'top' // Активна вкладка віджета рейтингу: 'top' або 'anti'
};

/**
 * Головна точка входу: виконується при завантаженні DOM
 */
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  initCharts();
  setupEventListeners();
  setupLayerToggle();
  loadProjectData();
});

/**
 * 1. Ініціалізація базової карти Leaflet (з урахуванням розширеної бічної панелі 600px)
 */
function initMap() {
  const mapContainer = document.getElementById('map');
  if (!mapContainer) return;

  // Центруємо карту на Черкаській області (скориговано центр та масштаб до 8.2 для ідеального вписування)
  appState.mapInstance = L.map('map', {
    zoomControl: false,
    attributionControl: false,
    zoomSnap: 0.1 // Дозволяємо дробовий масштаб для точного відображення меж області
  }).setView([49.25, 31.40], 8.2);

  // Додаємо елемент керування зумом у верхній правий кут
  L.control.zoom({ position: 'topright' }).addTo(appState.mapInstance);

  // Підключаємо базовий тайловий шар CartoDB Positron (світлий лаконічний стиль)
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 18,
    subdomains: 'abcd'
  }).addTo(appState.mapInstance);

  // Ініціалізуємо легенду карти через L.control
  initLegend();
}

/**
 * Ініціалізація легенди карти через L.control
 * Використовує офіційну термінологію Державної казначейської служби України
 */
function initLegend() {
  const legend = L.control({ position: 'bottomright' });

  legend.onAdd = function () {
    const div = L.DomUtil.create('div', 'map-floating-legend');
    div.innerHTML = `
      <div class="legend-title">Рівень виконання плану за звітний період</div>
      <div class="legend-items">
        <div class="legend-item">
          <span class="color-box" style="background: #335145;"></span>
          <span>Виконано та перевиконано</span>
        </div>
        <div class="legend-item">
          <span class="color-box" style="background: #C5A059;"></span>
          <span>Ризик невиконання</span>
        </div>
        <div class="legend-item">
          <span class="color-box" style="background: #A7333F;"></span>
          <span>Критичне недовиконання</span>
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
 * 2. Завантаження файлів проекту (GeoJSON для ТГ і Районів, та CSV з фінансами)
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

  // 3. Завантажуємо CSV фінансових даних
  loadCsvData();
}

/**
 * Завантаження та парсинг CSV через PapaParse
 * Враховує можливу різницю у назві файлу та кодуванні Windows-1251 / UTF-8
 */
function loadCsvData() {
  const filePaths = ['data/financial_data.csv', 'data/finanacial_data.csv'];

  const tryFetchCsv = (index) => {
    if (index >= filePaths.length) {
      console.error('Жоден CSV файл не знайдено');
      return;
    }
    const currentPath = filePaths[index];
    Papa.parse(currentPath, {
      download: true,
      header: true,
      skipEmptyLines: true,
      encoding: 'windows-1251',
      complete: (results) => {
        if (results && results.data && results.data.length > 0) {
          processFinancialData(results.data);
        } else {
          tryFetchCsv(index + 1);
        }
      },
      error: () => {
        tryFetchCsv(index + 1);
      }
    });
  };

  tryFetchCsv(0);
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
 * Допоміжна функція для визначення району громади
 */
function getHromadaRayon(row) {
  if (row['Район']) return String(row['Район']).trim();
  if (row['район']) return String(row['район']).trim();
  if (row['Район області']) return String(row['Район області']).trim();

  // Якщо в CSV немає окремої колонки району, шукаємо у властивостях hromadyGeoJson
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

  // 3.1. Динамічне відображення звітної дати
  const reportDateEl = document.getElementById('report-date');
  if (reportDateEl) {
    const firstRow = rawData[0] || {};
    const reportDate = firstRow['Звітна дата'] || firstRow['Дата'] || null;
    reportDateEl.textContent = reportDate ? reportDate : 'Немає даних';
  }

  // 3.2. Виділення Обласного бюджету для Блоку А (Постійний макро-рівень)
  const oblastRowRaw = rawData.find(row => {
    const name = String(row['бюджет'] || '').trim().toLowerCase();
    return name === 'обласний бюджет' || name.includes('обласний бюджет');
  });

  if (oblastRowRaw) {
    const planPeriod = parseNum(oblastRowRaw['План на звітний період (зі змінами)'] || oblastRowRaw['План на період (уточн)']);
    const fact = parseNum(oblastRowRaw['Фактичне виконання за звітний період'] || oblastRowRaw['Фактичні надходження']);
    const execRate = planPeriod > 0 ? Number(((fact / planPeriod) * 100).toFixed(1)) : 0;

    appState.oblastData = {
      name: oblastRowRaw['бюджет'] || 'Обласний бюджет',
      planPeriodRaw: planPeriod,
      factRaw: fact,
      execRate: execRate
    };
  }
  updateBlockA();

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

    return {
      id: String(row.id || `hromada-${index}`).trim(),
      бюджет: String(row['бюджет'] || '').trim(),
      rayon: rayonName,
      'Рівень річного бюджету': row['Рівень річного бюджету'] || 'Громада',
      planPeriodRaw: planPeriod,
      factRaw: fact,
      planYearRaw: planYear,
      factPrevYearRaw: factPrevYear,
      execPeriodPercent: execPeriodPercent,
      devThousand: devThousand,
      execYearPercent: execYearPercent,
      growthRate: growthRate
    };
  });

  // Сортуємо ТГ за % виконання та призначаємо місця в рейтингу
  processedHromadas.sort((a, b) => b.execPeriodPercent - a.execPeriodPercent);
  processedHromadas.forEach((item, idx) => { item.rankPeriod = idx + 1; });
  appState.data = processedHromadas;

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
        factPrevYearRaw: 0
      };
    }
    acc[rName].planPeriodRaw += (row.planPeriodRaw || 0);
    acc[rName].factRaw += (row.factRaw || 0);
    acc[rName].planYearRaw += (row.planYearRaw || 0);
    acc[rName].factPrevYearRaw += (row.factPrevYearRaw || 0);
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
 * Колірна шкала (Choropleth) за рівнем виконання плану за звітний період
 * Використовує строгу інституційну колірну палітру
 */
function getColor(percent) {
  if (percent === null || percent === undefined || isNaN(percent) || percent === 0) {
    return '#cbd5e1'; // Немає даних (нейтральний світло-сірий)
  }
  if (percent >= 100) {
    return '#335145'; // 100% і більше (Виконано та перевиконано - Brunswick Green)
  } else if (percent >= 95) {
    return '#C5A059'; // 95% – 100% (Ризик невиконання - приглушений гірчично-золотий)
  } else {
    return '#A7333F'; // Менше 95% (Критичне недовиконання - глибокий теракотовий)
  }
}

/**
 * 6. Оновлення відображення Блоку А («Обласний бюджет»)
 */
function updateBlockA() {
  const planEl = document.getElementById('oblastPlanVal');
  const factEl = document.getElementById('oblastFactVal');
  const rateEl = document.getElementById('oblastExecRateVal');

  if (!planEl || !factEl || !rateEl) return;

  if (appState.oblastData) {
    planEl.textContent = formatMoneyK(appState.oblastData.planPeriodRaw);
    factEl.textContent = formatMoneyK(appState.oblastData.factRaw);
    rateEl.textContent = formatPercent(appState.oblastData.execRate);
    // Оскільки фон Блоку А тепер темно-зелений (#335145), для тексту відсотка використовуємо контрастний світлий або золотий колір
    if (appState.oblastData.execRate >= 100) {
      rateEl.style.color = '#ffffff'; // Чистий білий для 100%+ на темно-зеленому фоні
    } else if (appState.oblastData.execRate >= 95) {
      rateEl.style.color = '#C5A059'; // Гірчично-золотий для зони ризику
    } else {
      rateEl.style.color = '#ff8a8a'; // Світло-червоний/теракотовий для недовиконання
    }
  } else {
    planEl.textContent = '0,0 тис. грн';
    factEl.textContent = '0,0 тис. грн';
    rateEl.textContent = '0,0%';
  }
}

/**
 * 7. Малювання карти в залежності від обраного шару (Громади чи Райони)
 */
function renderMap() {
  if (!appState.mapInstance) return;

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
        fillColor: getColor(val),
        weight: isSelected ? 3.5 : (appState.activeLayerType === 'districts' ? 2.5 : 1.2),
        opacity: 1,
        color: isSelected ? '#C5A059' : '#334155',
        fillOpacity: isSelected ? 0.95 : 0.8
      };
    },
    onEachFeature: (feature, layer) => {
      const finance = feature.properties.finance || {};
      const name = finance['бюджет'] || feature.properties.hromada || feature.properties.rayon || 'Територія';
      const execRate = finance.execPeriodPercent || 0;
      const layerTitle = appState.activeLayerType === 'hromady' ? 'Громада' : 'Зведений район';

      const tooltipContent = `
        <div class="custom-tooltip-content">
          <h4>${name}</h4>
          <p><strong>Рівень:</strong> ${layerTitle}</p>
          <p><strong>План на звітний період:</strong> ${formatMoneyK(finance.planPeriodRaw)}</p>
          <p><strong>Фактичні надходження:</strong> ${formatMoneyK(finance.factRaw)}</p>
          <p><strong>Рівень виконання плану:</strong> <span style="font-weight:700; color:${getColor(execRate)}">${formatPercent(execRate)}</span></p>
          <p><strong>Відхилення:</strong> <span class="${(finance.devThousand || 0) >= 0 ? 'text-success' : 'text-danger'}">${formatDeviation(finance.devThousand)}</span></p>
        </div>
      `;
      layer.bindTooltip(tooltipContent, { sticky: true, direction: 'auto' });

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
    // При скиданні вибору або натисканні на "Зведений звіт" повертаємо карту до початкового виду усієї області
    appState.mapInstance.setView([49.25, 31.40], 8.2, { animate: true, duration: 0.8 });
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
      document.getElementById('kpiExecPeriodRate').textContent = formatPercent(row.execPeriodPercent);

      document.getElementById('kpiFact').textContent = formatMoneyK(row.factRaw);
      const devEl = document.getElementById('kpiDeviation');
      devEl.textContent = formatDeviation(row.devThousand);
      devEl.className = (row.devThousand || 0) >= 0 ? 'text-success' : 'text-danger';

      document.getElementById('kpiPlanYear').textContent = formatMoneyK(row.planYearRaw);
      document.getElementById('kpiExecYearRate').textContent = formatPercent(row.execYearPercent);

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
  document.getElementById('kpiExecPeriodRate').textContent = formatPercent(totalExecPeriod);

  document.getElementById('kpiFact').textContent = formatMoneyK(totalFact);
  const devEl = document.getElementById('kpiDeviation');
  devEl.textContent = formatDeviation(totalDevThousand);
  devEl.className = totalDevThousand >= 0 ? 'text-success' : 'text-danger';

  document.getElementById('kpiPlanYear').textContent = formatMoneyK(totalPlanYear);
  document.getElementById('kpiExecYearRate').textContent = formatPercent(totalExecYear);

  document.getElementById('kpiFactPrevYear').textContent = formatMoneyK(totalFactPrevYear);
  document.getElementById('kpiGrowthRate').textContent = formatPercent(totalGrowth);
}

/**
 * 11. Оновлення аналітичного віджета «Топ-10 лідерів / Антирейтинг»
 * Адаптується під активний шар: показує або рейтинг ТГ, або рейтинг 4-х районів
 */
function updateRankingWidget() {
  const topUl = document.getElementById('rankingListTop');
  const antiUl = document.getElementById('rankingListAnti');
  const selectEl = document.getElementById('rankingMetricSelect');
  const titleEl = document.getElementById('rankingWidgetTitle');

  if (!topUl || !antiUl || !selectEl) return;

  const metricKey = selectEl.value;
  const currentDataset = appState.activeLayerType === 'hromady' ? appState.data : appState.districtData;

  if (titleEl) {
    titleEl.textContent = appState.activeLayerType === 'hromady' ? 'Рейтинг громад (ТГ)' : 'Рейтинг районів';
  }

  const sorted = [...currentDataset].sort((a, b) => (b[metricKey] || 0) - (a[metricKey] || 0));

  const topItems = sorted.slice(0, 10);
  const antiItems = sorted.slice(-10).reverse();

  const formatVal = (row) => {
    const val = row[metricKey] || 0;
    if (metricKey === 'devThousand') {
      return `<span class="${val >= 0 ? 'text-success' : 'text-danger'}">${formatDeviation(val)}</span>`;
    }
    return `<span>${formatPercent(val)}</span>`;
  };

  topUl.innerHTML = topItems.map((row, idx) => {
    const isSelected = row.id === appState.selectedId;
    return `
      <li class="ranking-item ${isSelected ? 'selected-ranking-item' : ''}" data-id="${row.id}">
        <div class="ranking-item-left">
          <span class="rank-pos-badge rank-top-pos">#${row.rankPeriod || idx + 1}</span>
          <span class="ranking-hromada-name" title="${row['бюджет']}">${row['бюджет']}</span>
        </div>
        <div class="ranking-item-value">${formatVal(row)}</div>
      </li>
    `;
  }).join('');

  antiUl.innerHTML = antiItems.map((row, idx) => {
    const isSelected = row.id === appState.selectedId;
    return `
      <li class="ranking-item ${isSelected ? 'selected-ranking-item' : ''}" data-id="${row.id}">
        <div class="ranking-item-left">
          <span class="rank-pos-badge rank-anti-pos">#${row.rankPeriod || sorted.length - idx}</span>
          <span class="ranking-hromada-name" title="${row['бюджет']}">${row['бюджет']}</span>
        </div>
        <div class="ranking-item-value">${formatVal(row)}</div>
      </li>
    `;
  }).join('');

  document.querySelectorAll('.ranking-item[data-id]').forEach(item => {
    item.addEventListener('click', () => {
      const id = item.getAttribute('data-id');
      selectCommunity(id === appState.selectedId ? null : id);
    });
  });
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
          legend: { position: 'top', labels: { boxWidth: 10, font: { size: 11, weight: 'bold' } } },
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
    : validData.slice(0, 5); // Для зведеного звіту показуємо Топ-5

  const labels = displayData.map(r => {
    let name = r['бюджет'] || '';
    return name.replace(/ (сільська|міська|селищна).*$/, '');
  });

  const isSingle = displayData.length === 1;

  appState.barChart.data = {
    labels: labels,
    datasets: [
      {
        label: 'План на звітний період',
        data: displayData.map(r => (r.planPeriodRaw || 0) / 1000),
        backgroundColor: '#C5A059', // Гірчично-золотий для планових показників
        barThickness: isSingle ? 22 : 16,
        borderRadius: 4
      },
      {
        label: 'Фактичні надходження',
        data: displayData.map(r => (r.factRaw || 0) / 1000),
        // Динамічний колір стовпчика факту залежно від відсотка виконання
        backgroundColor: displayData.map(r => getColor(r.execPeriodPercent || 0)),
        barThickness: isSingle ? 22 : 16,
        borderRadius: 4
      }
    ]
  };
  appState.barChart.update();
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