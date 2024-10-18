// Initialize variables
let map;
let drawnItems = new L.FeatureGroup();
let co2Data = {};

// Load CO2 data for all years
function loadAllCO2Data(callback) {
    const years = [2019, 2023];
    let loadedYears = 0;

    years.forEach(year => {
        const filename = `oco3_LtCO2_${year}_processed.csv`;
        console.log('Loading data from:', filename);
        fetch(filename)
            .then(response => response.text())
            .then(csvText => {
                console.log('Data loaded for year:', year);
                const data = Papa.parse(csvText, { header: true }).data;
                console.log('Parsed data length for year', year, ':', data.length);
                co2Data[year] = data;
                loadedYears++;
                if (loadedYears === years.length) {
                    callback();
                }
            })
            .catch(error => console.error(`Error loading CO₂ data for year ${year}:`, error));
    });
}

// Initialize the map
function initMap() {
    map = L.map('map').setView([0, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: 'Map data © OpenStreetMap contributors',
    }).addTo(map);

    map.addLayer(drawnItems);

    const drawControl = new L.Control.Draw({
        edit: { featureGroup: drawnItems },
        draw: {
            polygon: true,
            polyline: false,
            rectangle: false,
            circle: false,
            marker: false,
            circlemarker: false,
        },
    });
    map.addControl(drawControl);

    map.on(L.Draw.Event.CREATED, function (e) {
        console.log('Polygon drawn');
        drawnItems.clearLayers();
        drawnItems.addLayer(e.layer);
        updateMapAndChart();
    });

    // Add legend to the map
    addLegend();
}

// Update map and chart based on selected area
function updateMapAndChart() {
    // Check if data is loaded
    if (!co2Data[2019] || !co2Data[2023]) {
        console.error('CO₂ data not loaded yet.');
        return;
    }

    // Proceed to plot data
    plotData();
}

// Plot data on map and chart
function plotData() {
    const years = [2019, 2023];
    const avgCO2ByYear = {};
    let pointsWithinAllYears = [];

    // Filter data within the drawn polygon
    const polygonLayer = drawnItems.getLayers()[0];
    if (!polygonLayer) return;

    const polygon = polygonLayer.toGeoJSON();
    const turfPolygon = turf.polygon(polygon.geometry.coordinates);

    years.forEach(year => {
        const data = co2Data[year];

        // Prepare data points for filtering
        const points = data.map(d => {
            const lat = parseFloat(d.latitude);
            const lon = parseFloat(d.longitude);
            const co2Value = parseFloat(d.co2);
            if (isNaN(lat) || isNaN(lon) || isNaN(co2Value)) {
                return null; // Skip invalid data
            }
            return {
                type: 'Feature',
                properties: { co2: co2Value, year: year },
                geometry: {
                    type: 'Point',
                    coordinates: [lon, lat],
                },
            };
        }).filter(point => point !== null);

        const pointsWithin = turf.pointsWithinPolygon(
            { type: 'FeatureCollection', features: points },
            turfPolygon
        );

        // Collect points for data overlays
        pointsWithinAllYears = pointsWithinAllYears.concat(pointsWithin.features);

        // Calculate average CO2
        const co2Values = pointsWithin.features.map(f => f.properties.co2);

        if (co2Values.length === 0) {
            console.warn(`No CO₂ data available in the selected area for year ${year}.`);
            avgCO2ByYear[year] = null;
        } else {
            const avgCO2 = co2Values.reduce((sum, val) => sum + val, 0) / co2Values.length;
            avgCO2ByYear[year] = avgCO2;
        }
    });

    // Update chart
    displayChart(avgCO2ByYear);

    // Plot data overlays on the map
    plotDataOverlays(pointsWithinAllYears);
}

// Display the chart
function displayChart(avgCO2ByYear) {
    const ctx = document.getElementById('co2Chart').getContext('2d');

    if (window.co2Chart instanceof Chart) {
        window.co2Chart.destroy();
    }

    const years 