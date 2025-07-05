const MAP_STYLE = "https://api.maptiler.com/maps/0197dc02-f415-76e6-a860-fc5b1805cd22/style.json?key=4XkkKpwhltbHeFPyQbNh"; // Replace with your own Maptiler key for production!
// ========== CONFIGURATION ==========
const DEFAULT_ZOOM = 16;
const PIRATE_ICON = "images/pirate.png";
const TREASURE_ICON = "images/treasure.png";

// --- Utility functions ---
function randomPointNear([lat, lng], maxMeters) {
  const r = maxMeters / 111000;
  const u = Math.random();
  const v = Math.random();
  const w = r * Math.sqrt(u);
  const t = 2 * Math.PI * v;
  const dx = w * Math.cos(t);
  const dy = w * Math.sin(t);
  const newLat = lat + dy;
  const newLng = lng + dx / Math.cos(lat * Math.PI / 180);
  return [newLat, newLng];
}
function distanceMeters([lat1, lng1], [lat2, lng2]) {
  const R = 6371e3;
  const φ1 = lat1 * Math.PI/180, φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1)*Math.PI/180;
  const Δλ = (lng2-lng1)*Math.PI/180;
  const a = Math.sin(Δφ/2)*Math.sin(Δφ/2) +
      Math.cos(φ1)*Math.cos(φ2) *
      Math.sin(Δλ/2)*Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}
function getBearingBetween([lat1, lng1], [lat2, lng2]) {
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δλ = (lng2 - lng1) * Math.PI / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1)*Math.sin(φ2) -
      Math.sin(φ1)*Math.cos(φ2)*Math.cos(Δλ);
  let θ = Math.atan2(y, x);
  θ = θ * 180 / Math.PI;
  return (θ + 360) % 360;
}

// --- Game State ---
let map, userMarker, pirateIconEl, treasureMarker, userCoords, treasureCoords;
let win = false;
let currentHeading = null;

// --- UI ---
function showMessage(msg) {
  const el = document.getElementById('game-message');
  el.textContent = msg;
  el.style.display = 'block';
}
function hideMessage() {
  const el = document.getElementById('game-message');
  el.textContent = '';
  el.style.display = 'none';
}

// --- Pirate Marker with Arrow ---
function createAnimatedPirateIcon() {
    // Marker container
    const el = document.createElement('div');
    el.className = 'pirate-marker';
    el.style.position = 'relative';
    el.style.width = "64px";
    el.style.height = "64px";

    // Player icon (centered, static)
    const pirateImg = document.createElement('img');
    pirateImg.src = PIRATE_ICON;
    pirateImg.alt = "Player";
    pirateImg.style.width = "64px";
    pirateImg.style.height = "64px";
    pirateImg.style.position = "absolute";
    pirateImg.style.left = "0";
    pirateImg.style.top = "0";
    pirateImg.style.zIndex = 1;
    pirateImg.className = "bobbing-img";

    // BIGGER Arrow (orbiting)
    const arrow = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    arrow.setAttribute("id", "arrow");
    arrow.setAttribute("viewBox", "0 0 64 64");
    arrow.setAttribute("width", "64");     // was 32, now 64 for bigger arrow
    arrow.setAttribute("height", "64");
    arrow.style.position = 'absolute';
    arrow.style.left = "0";               // center over player icon
    arrow.style.top = "0";
    arrow.style.transformOrigin = "50% 50%";
    arrow.style.zIndex = 2;
    // arrow.setAttribute("class", "arrow-image");
    arrow.style.pointerEvents = "none";
    arrow.innerHTML = `<polygon points="32,8 44,32 38,32 38,56 26,56 26,32 20,32" fill="#effcff" stroke="#233" stroke-width="2"/>`;

    el.appendChild(pirateImg);
    el.appendChild(arrow);

    return el;
}
// --- Marker CSS ---
function injectPirateCSS() {
    const css = `
  @keyframes bob {
    0% { transform: translateY(0);}
    50% { transform: translateY(-10px);}
    100% { transform: translateY(0);}
  }
  
  @keyframes scale {
  0% { transform: scale(1);}
  50% { transform: scale(1.15);}
  100% { transform: scale(1);}
}
  .bobbing-img {
    animation: bob 1.2s infinite ease-in-out;
    will-change: transform;
  }
  
  .arrow-image {
    animation: scale 1.2s infinite ease-in-out;
    will-change: transform;
  }
  
  .pirate-marker {
    filter: drop-shadow(0 2px 40px #0008);
  }
  .treasure-marker {
    filter: drop-shadow(0 0 6px gold);
  }
  `;
    const style = document.createElement('style');
    style.innerHTML = css;
    document.head.appendChild(style);
}

// --- Treasure Marker ---
function addTreasureMarker(coords) {
  const el = document.createElement('div');
  el.className = 'treasure-marker';
  el.style.width = "75px";
  el.style.height = "75px";
  el.style.backgroundImage = `url(${TREASURE_ICON})`;
  el.style.backgroundSize = "contain";
  el.style.backgroundRepeat = "no-repeat";
  return new maplibregl.Marker({element: el})
      .setLngLat([coords[1], coords[0]])
      .addTo(map);
}
function updatePirateMarker(coords) {
    if (!userMarker) {

        pirateIconEl = createAnimatedPirateIcon();
        userMarker = new maplibregl.Marker({element: pirateIconEl, anchor: 'center'})
            .setLngLat([coords[1], coords[0]]) // [lng, lat]
            .addTo(map);
    } else {
        console.log("Yes user marker")
        // 17.959835529327393 59.28586586827325
        userMarker.setLngLat([coords[1], coords[0]]); // [lng, lat]
    }
}

const marker = document.querySelector('.maplibregl-user-location-dot');
if (marker) marker.style.display = 'none';

// --- Win Check ---
function checkWinCondition() {
  if (!userCoords || !treasureCoords || win) return;
  const dist = distanceMeters(userCoords, treasureCoords);
  if (dist <= 15) {
    win = true;
    showMessage("🏴‍☠️ You found the treasure!");
  }
}

// --- Arrow Rotation ---
function updateArrow() {
    if (!userCoords || !treasureCoords || currentHeading === null) return;
    const bearingToTreasure = getBearingBetween(userCoords, treasureCoords);
    let rotation = bearingToTreasure - currentHeading;
    if (rotation > 180) rotation -= 360;
    if (rotation < -180) rotation += 360;

    if (pirateIconEl) {
        const arrow = pirateIconEl.querySelector('#arrow');
        if (arrow) {
            // Move arrow out from center (e.g. 48px for bigger arrow)
            arrow.style.transform = `rotate(${rotation}deg) translateY(-48px)`;
        }
    }
}

function handleOrientation(event) {
    console.log("Orientt", event)
  let heading;
  if (typeof event.webkitCompassHeading !== "undefined") {
    heading = event.webkitCompassHeading;
  } else if (typeof event.alpha !== "undefined") {
    heading = 360 - event.alpha;
  }
  if (heading !== undefined && heading !== null) {
    if (heading < 0) heading += 360;
    currentHeading = heading;
    updateArrow();
  }
}
function setupOrientationListener() {
  if (window.DeviceOrientationEvent) {
    function requestOrientationPermission() {
      if (
          typeof DeviceOrientationEvent.requestPermission === "function"
      ) {
        DeviceOrientationEvent.requestPermission()
            .then((response) => {
              if (response == "granted") {
                window.addEventListener("deviceorientation", handleOrientation, true);
              }
            })
            .catch(console.error);
      } else {
        window.addEventListener("deviceorientation", handleOrientation, true);
      }
    }
    window.addEventListener("click", requestOrientationPermission, { once: true });
  }
}

// --- Main Game Flow ---
function onPosition(position) {
  const { latitude, longitude } = position.coords;
    console.log("On Position")
  userCoords = [latitude, longitude];
  if (!map) {
      console.log("There is map")
    map = new maplibregl.Map({
      container: 'map',
      style: MAP_STYLE,
      center: [longitude, latitude],
      zoom: DEFAULT_ZOOM,
      attributionControl: true
    });
    map.on('load', () => {
      injectPirateCSS();
      updatePirateMarker(userCoords);
      treasureCoords = randomPointNear(userCoords, 150);
      treasureMarker = addTreasureMarker(treasureCoords);
      map.fitBounds([
        [longitude, latitude],
        [treasureCoords[1], treasureCoords[0]]
      ], {padding: 120, maxZoom: DEFAULT_ZOOM});
      setupOrientationListener();
      updateArrow();
    });
  } else {
      console.log("Else map ")
    updatePirateMarker(userCoords);
    updateArrow();
  }
  checkWinCondition();
}
function onError(err) {
  showMessage('⚓ Location access is required to play the game. Please enable location.');
}
function startTracking() {
  if (!navigator.geolocation) {
    showMessage('Geolocation is not supported by your browser.');
    return;
  }

    showMessage('Go get that treasure.');
  navigator.geolocation.getCurrentPosition(onPosition, onError, {enableHighAccuracy:true});
  navigator.geolocation.watchPosition(pos => {
    onPosition(pos);
    checkWinCondition();
  }, onError, {enableHighAccuracy:true, maximumAge:2000, timeout:7000});
}

// --- Start Game ---
hideMessage();
showMessage('Finding your location...');
window.onload = startTracking;