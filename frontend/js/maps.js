// Google Maps JavaScript is loaded only when a public browser key is configured.
let mapsApiPromise;

export function loadMaps(apiKey) {
  if (window.google?.maps?.importLibrary) return Promise.resolve(window.google.maps);
  if (!apiKey) return Promise.reject(new Error("Google Maps browser key is not configured."));
  if (!mapsApiPromise) {
    mapsApiPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly&loading=async`;
      script.async = true;
      script.onerror = () => { mapsApiPromise = null; reject(new Error("Google Maps could not be loaded. Check the browser key and API restrictions.")); };
      script.onload = () => window.google?.maps?.importLibrary
        ? resolve(window.google.maps)
        : reject(new Error("Google Maps loaded without its JavaScript library."));
      document.head.append(script);
    });
  }
  return mapsApiPromise;
}

const CITY_BIAS = {
  Bengaluru: { lat: 12.9716, lng: 77.5946 },
  Hyderabad: { lat: 17.385, lng: 78.4867 },
  "Delhi NCR": { lat: 28.6139, lng: 77.209 },
};

export async function mountPlaceSearch(host, { apiKey, city, onSelect, onError }) {
  const maps = await loadMaps(apiKey);
  if (!host.isConnected) return;
  const { PlaceAutocompleteElement } = await maps.importLibrary("places");
  if (!host.isConnected) return;
  const picker = new PlaceAutocompleteElement();
  picker.placeholder = `Search ${city} in Google Maps`;
  picker.includedRegionCodes = ["in"];
  const center = CITY_BIAS[city];
  if (center) picker.locationBias = { center, radius: 45_000 };
  host.replaceChildren(picker);
  picker.addEventListener("gmp-select", async ({ placePrediction }) => {
    try {
      const place = placePrediction.toPlace();
      await place.fetchFields({ fields: ["id", "displayName", "formattedAddress", "location", "viewport"] });
      if (!place.location) throw new Error("Google Maps could not find coordinates for that place.");
      onSelect({
        label: place.displayName || place.formattedAddress,
        address: place.formattedAddress || place.displayName,
        latitude: place.location.lat(),
        longitude: place.location.lng(),
        place_id: place.id || null,
        geocode_source: "google",
        viewport: place.viewport || null,
      });
    } catch (error) { onError(error); }
  });
}

function decodePolyline(encoded) {
  const points = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let result = 0, shift = 0, byte;
    do { byte = encoded.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    result = 0; shift = 0;
    do { byte = encoded.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}

export async function drawGoogleRoute(canvas, result, origin, destination, apiKey) {
  const maps = await loadMaps(apiKey);
  if (!canvas.isConnected) return;
  const { Map } = await maps.importLibrary("maps");
  if (!canvas.isConnected) return;
  const map = new Map(canvas, {
    center: { lat: (origin.latitude + destination.latitude) / 2, lng: (origin.longitude + destination.longitude) / 2 },
    zoom: 11,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
    gestureHandling: "cooperative",
  });
  const start = { lat: origin.latitude, lng: origin.longitude };
  const end = { lat: destination.latitude, lng: destination.longitude };
  new maps.Marker({ map, position: start, title: "Home pickup" });
  new maps.Marker({ map, position: end, title: "Office drop-off" });
  const line = new maps.Polyline({ path: decodePolyline(result.encoded_polyline), geodesic: false,
    strokeColor: "#18794e", strokeOpacity: 0.9, strokeWeight: 5, map });
  const bounds = new maps.LatLngBounds();
  line.getPath().forEach((point) => bounds.extend(point));
  map.fitBounds(bounds, 36);
}

export async function drawGooglePoint(canvas, location, apiKey) {
  const maps = await loadMaps(apiKey);
  if (!canvas.isConnected) return;
  const { Map } = await maps.importLibrary("maps");
  if (!canvas.isConnected) return;
  const position = { lat: location.latitude, lng: location.longitude };
  const map = new Map(canvas, { center: position, zoom: 15, mapTypeControl: false,
    streetViewControl: false, fullscreenControl: false, gestureHandling: "cooperative" });
  new maps.Marker({ map, position, title: location.label });
}
