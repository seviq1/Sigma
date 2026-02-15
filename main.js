const canvas = document.querySelector("#game");
const scoreEl = document.querySelector("#score");
const levelEl = document.querySelector("#level");
const linesEl = document.querySelector("#lines");
const restartBtn = document.querySelector("#restart");
const overlay = document.querySelector("#overlay");

const scene = new THREE.Scene();
scene.background = new THREE.Color("#0b0f1a");

const camera = new THREE.PerspectiveCamera(
  45,
  canvas.clientWidth / canvas.clientHeight,
  0.1,
  100
);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio || 1);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(5, 10, 7);
scene.add(dirLight);

const GRID_WIDTH = 6;
const GRID_DEPTH = 6;
const GRID_HEIGHT = 12;
const BLOCK_SIZE = 1;
const DROP_BASE_INTERVAL = 900;

const grid = Array.from({ length: GRID_WIDTH }, () =>
  Array.from({ length: GRID_HEIGHT }, () => Array(GRID_DEPTH).fill(null))
);

const blockGeometry = new THREE.BoxGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
const ghostMaterial = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  opacity: 0.15,
  transparent: true,
});

const pieceMaterials = [
  new THREE.MeshStandardMaterial({ color: "#6c7bff" }),
  new THREE.MeshStandardMaterial({ color: "#f76c6c" }),
  new THREE.MeshStandardMaterial({ color: "#f7d86c" }),
  new THREE.MeshStandardMaterial({ color: "#6cf7b0" }),
  new THREE.MeshStandardMaterial({ color: "#c56cff" }),
];

const SHAPES = [
  [
    { x: 0, z: 0 },
    { x: 1, z: 0 },
    { x: -1, z: 0 },
    { x: 2, z: 0 },
  ],
  [
    { x: 0, z: 0 },
    { x: 1, z: 0 },
    { x: 0, z: 1 },
    { x: -1, z: 0 },
  ],
  [
    { x: 0, z: 0 },
    { x: 1, z: 0 },
    { x: 0, z: 1 },
    { x: 1, z: 1 },
  ],
  [
    { x: 0, z: 0 },
    { x: -1, z: 0 },
    { x: 1, z: 0 },
    { x: -1, z: 1 },
  ],
  [
    { x: 0, z: 0 },
    { x: 1, z: 0 },
    { x: 0, z: -1 },
    { x: 0, z: 1 },
  ],
];

let currentPiece = null;
let ghostGroup = null;
let dropInterval = DROP_BASE_INTERVAL;
let score = 0;
let level = 1;
let clearedLines = 0;
let paused = false;
let lastDropTime = 0;

const boardGroup = new THREE.Group();
scene.add(boardGroup);

const boardOutline = new THREE.BoxGeometry(
  GRID_WIDTH,
  GRID_HEIGHT,
  GRID_DEPTH
);
const outlineMaterial = new THREE.MeshBasicMaterial({
  color: 0x4a5572,
  wireframe: true,
});
const outlineMesh = new THREE.Mesh(boardOutline, outlineMaterial);
outlineMesh.position.set(
  (GRID_WIDTH - 1) / 2,
  (GRID_HEIGHT - 1) / 2,
  (GRID_DEPTH - 1) / 2
);
scene.add(outlineMesh);

function updateRendererSize() {
  const { clientWidth, clientHeight } = canvas;
  renderer.setSize(clientWidth, clientHeight, false);
  camera.aspect = clientWidth / clientHeight;
  camera.updateProjectionMatrix();
}

function positionCamera() {
  camera.position.set(10, 12, 10);
  camera.lookAt(
    new THREE.Vector3(
      (GRID_WIDTH - 1) / 2,
      (GRID_HEIGHT - 1) / 2,
      (GRID_DEPTH - 1) / 2
    )
  );
}

function spawnPiece() {
  const shape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
  const material =
    pieceMaterials[Math.floor(Math.random() * pieceMaterials.length)];
  const group = new THREE.Group();
  const blocks = shape.map((block) => {
    const mesh = new THREE.Mesh(blockGeometry, material);
    group.add(mesh);
    return { ...block, mesh };
  });
  currentPiece = {
    blocks,
    group,
    position: { x: Math.floor(GRID_WIDTH / 2), y: GRID_HEIGHT - 1, z: Math.floor(GRID_DEPTH / 2) },
  };
  scene.add(group);
  updatePieceMeshes();
  createGhost();
  if (collides(currentPiece.position, currentPiece.blocks)) {
    gameOver();
  }
}

function createGhost() {
  if (ghostGroup) {
    scene.remove(ghostGroup);
  }
  ghostGroup = new THREE.Group();
  currentPiece.blocks.forEach(() => {
    const mesh = new THREE.Mesh(blockGeometry, ghostMaterial);
    ghostGroup.add(mesh);
  });
  scene.add(ghostGroup);
  updateGhost();
}

function updateGhost() {
  if (!ghostGroup || !currentPiece) return;
  let ghostPos = { ...currentPiece.position };
  while (!collides({ ...ghostPos, y: ghostPos.y - 1 }, currentPiece.blocks)) {
    ghostPos.y -= 1;
  }
  currentPiece.blocks.forEach((block, index) => {
    const mesh = ghostGroup.children[index];
    mesh.position.set(
      ghostPos.x + block.x,
      ghostPos.y,
      ghostPos.z + block.z
    );
  });
}

function updatePieceMeshes() {
  if (!currentPiece) return;
  currentPiece.blocks.forEach((block) => {
    block.mesh.position.set(
      currentPiece.position.x + block.x,
      currentPiece.position.y,
      currentPiece.position.z + block.z
    );
  });
  updateGhost();
}

function collides(position, blocks) {
  return blocks.some((block) => {
    const x = position.x + block.x;
    const y = position.y;
    const z = position.z + block.z;
    if (
      x < 0 ||
      x >= GRID_WIDTH ||
      z < 0 ||
      z >= GRID_DEPTH ||
      y < 0
    ) {
      return true;
    }
    return grid[x][y] && grid[x][y][z];
  });
}

function movePiece(deltaX, deltaZ) {
  if (!currentPiece || paused) return;
  const nextPosition = {
    ...currentPiece.position,
    x: currentPiece.position.x + deltaX,
    z: currentPiece.position.z + deltaZ,
  };
  if (!collides(nextPosition, currentPiece.blocks)) {
    currentPiece.position = nextPosition;
    updatePieceMeshes();
  }
}

function rotatePiece(direction) {
  if (!currentPiece || paused) return;
  const rotated = currentPiece.blocks.map((block) => {
    return direction > 0
      ? { ...block, x: -block.z, z: block.x }
      : { ...block, x: block.z, z: -block.x };
  });
  if (!collides(currentPiece.position, rotated)) {
    currentPiece.blocks = rotated.map((block, index) => ({
      ...block,
      mesh: currentPiece.blocks[index].mesh,
    }));
    updatePieceMeshes();
  }
}

function dropPiece() {
  if (!currentPiece || paused) return;
  const nextPosition = {
    ...currentPiece.position,
    y: currentPiece.position.y - 1,
  };
  if (!collides(nextPosition, currentPiece.blocks)) {
    currentPiece.position = nextPosition;
    updatePieceMeshes();
  } else {
    lockPiece();
  }
}

function hardDrop() {
  if (!currentPiece || paused) return;
  while (!collides({ ...currentPiece.position, y: currentPiece.position.y - 1 }, currentPiece.blocks)) {
    currentPiece.position.y -= 1;
    score += 2;
  }
  updatePieceMeshes();
  lockPiece();
}

function lockPiece() {
  currentPiece.blocks.forEach((block) => {
    const x = currentPiece.position.x + block.x;
    const y = currentPiece.position.y;
    const z = currentPiece.position.z + block.z;
    grid[x][y][z] = block.mesh;
    boardGroup.add(block.mesh);
  });
  scene.remove(currentPiece.group);
  currentPiece = null;
  clearLayers();
  spawnPiece();
}

function clearLayers() {
  let cleared = 0;
  for (let y = 0; y < GRID_HEIGHT; y += 1) {
    let full = true;
    for (let x = 0; x < GRID_WIDTH; x += 1) {
      for (let z = 0; z < GRID_DEPTH; z += 1) {
        if (!grid[x][y][z]) {
          full = false;
          break;
        }
      }
      if (!full) break;
    }
    if (full) {
      cleared += 1;
      for (let x = 0; x < GRID_WIDTH; x += 1) {
        for (let z = 0; z < GRID_DEPTH; z += 1) {
          const mesh = grid[x][y][z];
          if (mesh) {
            boardGroup.remove(mesh);
            mesh.geometry.dispose();
          }
        }
      }
      for (let shiftY = y; shiftY < GRID_HEIGHT - 1; shiftY += 1) {
        for (let x = 0; x < GRID_WIDTH; x += 1) {
          for (let z = 0; z < GRID_DEPTH; z += 1) {
            grid[x][shiftY][z] = grid[x][shiftY + 1][z];
            const mesh = grid[x][shiftY][z];
            if (mesh) {
              mesh.position.y -= 1;
            }
          }
        }
      }
      for (let x = 0; x < GRID_WIDTH; x += 1) {
        for (let z = 0; z < GRID_DEPTH; z += 1) {
          grid[x][GRID_HEIGHT - 1][z] = null;
        }
      }
      y -= 1;
    }
  }
  if (cleared > 0) {
    clearedLines += cleared;
    score += cleared * 100;
    level = 1 + Math.floor(clearedLines / 5);
    dropInterval = Math.max(250, DROP_BASE_INTERVAL - (level - 1) * 70);
  }
  updateHUD();
}

function updateHUD() {
  scoreEl.textContent = score;
  levelEl.textContent = level;
  linesEl.textContent = clearedLines;
}

function gameOver() {
  paused = true;
  overlay.textContent = "Koniec gry";
  overlay.classList.remove("hidden");
}

function togglePause() {
  if (!currentPiece) return;
  paused = !paused;
  overlay.textContent = paused ? "Pauza" : "";
  overlay.classList.toggle("hidden", !paused);
}

function resetGame() {
  for (let x = 0; x < GRID_WIDTH; x += 1) {
    for (let y = 0; y < GRID_HEIGHT; y += 1) {
      for (let z = 0; z < GRID_DEPTH; z += 1) {
        const mesh = grid[x][y][z];
        if (mesh) {
          boardGroup.remove(mesh);
        }
        grid[x][y][z] = null;
      }
    }
  }
  if (currentPiece) {
    scene.remove(currentPiece.group);
  }
  if (ghostGroup) {
    scene.remove(ghostGroup);
  }
  score = 0;
  level = 1;
  clearedLines = 0;
  dropInterval = DROP_BASE_INTERVAL;
  paused = false;
  overlay.classList.add("hidden");
  updateHUD();
  spawnPiece();
}

function animate(timestamp) {
  requestAnimationFrame(animate);
  if (!paused && currentPiece) {
    if (timestamp - lastDropTime > dropInterval) {
      dropPiece();
      lastDropTime = timestamp;
    }
  }
  renderer.render(scene, camera);
}

window.addEventListener("keydown", (event) => {
  switch (event.key) {
    case "ArrowLeft":
      movePiece(-1, 0);
      break;
    case "ArrowRight":
      movePiece(1, 0);
      break;
    case "ArrowUp":
      movePiece(0, -1);
      break;
    case "ArrowDown":
      movePiece(0, 1);
      break;
    case "q":
    case "Q":
      rotatePiece(-1);
      break;
    case "e":
    case "E":
      rotatePiece(1);
      break;
    case " ":
      hardDrop();
      break;
    case "p":
    case "P":
      togglePause();
      break;
    default:
      break;
  }
});

restartBtn.addEventListener("click", resetGame);

window.addEventListener("resize", () => {
  updateRendererSize();
});

updateRendererSize();
positionCamera();
spawnPiece();
requestAnimationFrame(animate);
