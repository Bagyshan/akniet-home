/* 3D logo in the footer (Three.js); the flat image stays if WebGL or loading fails */
const box = document.getElementById('logo3d');
const loadScript = src => new Promise((ok, fail) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = fail; document.head.appendChild(s); });

async function start() {
  const [THREE, { GLTFLoader }, { MeshoptDecoder }, { RoomEnvironment }] = await Promise.all([
    import('three'),
    import('three/addons/loaders/GLTFLoader.js'),
    import('three/addons/libs/meshopt_decoder.module.js'),
    import('three/addons/environments/RoomEnvironment.js'),
    loadScript(box.dataset.model), // path from the page, so it works from any folder
  ]);
  const canvas = box.querySelector('canvas');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  const key = new THREE.PointLight(0xffc27a, 6, 10, 1.5); key.position.set(1.2, 1, 2.2); scene.add(key);

  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(window.aknietLogoGLB);
  const model = gltf.scene;
  const gold = new THREE.MeshStandardMaterial({ color: 0xd5a039, metalness: 1, roughness: 0.3 });
  model.traverse(o => { if (o.isMesh) o.material = gold; });
  // centre the logo on its own axis and scale it to 1 unit wide
  const bbox = new THREE.Box3().setFromObject(model), size = bbox.getSize(new THREE.Vector3());
  model.position.sub(bbox.getCenter(new THREE.Vector3()));
  const spin = new THREE.Group(); spin.add(model); spin.scale.setScalar(1 / size.x); scene.add(spin);
  const H = size.y / size.x, Dz = size.z / size.x, TILT = 0.15;

  // camera distance that keeps every corner of the logo inside the frame at any spin angle and tilt
  const camera = new THREE.PerspectiveCamera(22, 1, 0.1, 30);
  const corners = [];
  for (const x of [-0.5, 0.5]) for (const y of [-H / 2, H / 2]) for (const z of [-Dz / 2, Dz / 2]) corners.push(new THREE.Vector3(x, y, z));
  const poses = [];
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 36) for (const tx of [-TILT, 0, TILT]) poses.push(new THREE.Euler(tx, a, 0));
  const fit = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h;
    const ty = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 0.94, tx = ty * camera.aspect, v = new THREE.Vector3();
    let dist = 0;
    for (const e of poses) for (const c of corners) {
      v.copy(c).applyEuler(e);
      dist = Math.max(dist, v.z + Math.abs(v.x) / tx, v.z + Math.abs(v.y) / ty);
    }
    camera.position.set(0, 0, dist);
    camera.updateProjectionMatrix(); render();
  };
  const render = () => renderer.render(scene, camera);

  // motion: slow steady spin (one turn ≈ 30 s) + drag with inertia; tilt follows the pointer
  let angle = 0.35, vel = 0, tiltX = 0, tiltTo = 0, drag = null, visible = false, raf = 0, last = 0;
  const BASE = reduce ? 0 : 0.21;
  canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, t: performance.now() }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', e => {
    const r = canvas.getBoundingClientRect();
    tiltTo = ((e.clientY - r.top) / r.height - 0.5) * TILT * 2;
    if (!drag) return;
    const dx = e.clientX - drag.x, now = performance.now();
    angle += dx * 0.012; vel = dx * 0.012 / Math.max(16, now - drag.t) * 1000;
    drag = { x: e.clientX, t: now };
    if (!raf) render(), spin.rotation.y = angle;
  });
  const release = () => { drag = null; };
  canvas.addEventListener('pointerup', release); canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('pointerleave', () => { tiltTo = 0; });

  const loop = t => {
    const dt = Math.min(0.05, (t - (last || t)) / 1000); last = t;
    if (!drag) { angle += (BASE + vel) * dt; vel *= Math.pow(0.12, dt); }
    tiltX += (tiltTo - tiltX) * Math.min(1, dt * 6);
    spin.rotation.set(tiltX, angle, 0);
    render();
    raf = visible && !reduce ? requestAnimationFrame(loop) : 0;
  };
  new IntersectionObserver(([en]) => {
    visible = en.isIntersecting;
    if (visible && !raf && !reduce) { last = 0; raf = requestAnimationFrame(loop); }
  }).observe(box);

  box.classList.add('ready');
  new ResizeObserver(fit).observe(canvas);
  spin.rotation.y = angle; fit();
}

// load only when the footer gets close; on any failure the flat logo stays
const io = new IntersectionObserver(([en]) => {
  if (!en.isIntersecting) return; io.disconnect();
  start().catch(() => box.classList.remove('ready'));
}, { rootMargin: '800px 0px' });
io.observe(box);
