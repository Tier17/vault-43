// Loads the map libraries (served locally from vendor/) once, on demand.

let pending = null;

function script(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`could not load ${src}`));
    document.head.append(s);
  });
}

export function loadGeo() {
  if (!pending) {
    pending = (async () => {
      await script('vendor/d3-array.min.js');
      await script('vendor/d3-geo.min.js');
      await script('vendor/topojson-client.min.js');
      const world = await fetch('vendor/countries-110m.json').then((r) => r.json());
      const countries = window.topojson.feature(world, world.objects.countries).features;
      const borders = window.topojson.mesh(world, world.objects.countries, (a, b) => a !== b);
      const coast = window.topojson.mesh(world, world.objects.countries, (a, b) => a === b);
      return { d3: window.d3, countries, borders, coast };
    })();
  }
  return pending;
}
