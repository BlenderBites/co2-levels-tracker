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

    const years = Object.keys(avgCO2ByYear);
    const avgCO2Values = years.map(year => avgCO2ByYear[year]);

    // Replace null values with NaN to prevent charting issues
    const avgCO2ValuesCleaned = avgCO2Values.map(value => value !== null ? value : NaN);

    window.co2Chart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: years,
            datasets: [{
                label: 'Average CO₂ Levels (ppm)',
                data: avgCO2ValuesCleaned,
                backgroundColor: ['rgba(54, 162, 235, 0.5)', 'rgba(255, 99, 132, 0.5)'],
                borderColor: ['rgba(54, 162, 235, 1)', 'rgba(255, 99, 132, 1)'],
                borderWidth: 1,
            }],
        },
        options: {
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'CO₂ Levels (ppm)',
                    },
                },
                x: {
                    title: {
                        display: true,
                        text: 'Year',
                    },
                },
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const value = context.parsed.y;
                            return isNaN(value) ? 'No data available' : `Average CO₂: ${value.toFixed(2)} ppm`;
                        },
                    },
                },
            },
        },
    });
}

// Plot data overlays on the map
function plotDataOverlays(points) {
    // Clear any existing data layers
    if (window.dataLayer) {
        map.removeLayer(window.dataLayer);
    }

    // Create a layer group for the data points
    window.dataLayer = L.layerGroup();

    // Add data points to the layer
    points.forEach(feature => {
        const lat = feature.geometry.coordinates[1];
        const lon = feature.geometry.coordinates[0];
        const co2Value = feature.properties.co2;
        const year = feature.properties.year;

        // Determine color based on year
        let color;
        if (year == 2019) {
            color = 'blue';
        } else if (year == 2023) {
            color = 'red';
        } else {
            color = 'gray';
        }

        // Create a circle marker
        const marker = L.circleMarker([lat, lon], {
            radius: 5,
            fillColor: color,
            color: color,
            weight: 1,
            opacity: 1,
            fillOpacity: 0.8,
        }).bindPopup(`Year: ${year}<br>CO₂: ${co2Value.toFixed(2)} ppm`);

        window.dataLayer.addLayer(marker);
    });

    // Add the data layer to the map
    window.dataLayer.addTo(map);
}

// Add legend to the map
function addLegend() {
    const legend = L.control({ position: 'bottomright' });

    legend.onAdd = function(map) {
        const div = L.DomUtil.create('div', 'info legend');
        const categories = ['2019', '2023'];

        const colors = {
            '2019': 'blue',
            '2023': 'red',
        };

        div.innerHTML = '<strong>Year</strong><br>';
        for (let i = 0; i < categories.length; i++) {
            div.innerHTML +=
                `<i style="background:${colors[categories[i]]}; width: 18px; height: 18px; display: inline-block;"></i> ${categories[i]}<br>`;
        }
        return div;
    };

    legend.addTo(map);
}

// Initialize everything after the DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    loadAllCO2Data(initMap);
});