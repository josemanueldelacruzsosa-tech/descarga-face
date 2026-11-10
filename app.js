const VISION_VERSION = "1.2.2";
const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VISION_VERSION}/wasm`;
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

const stage = document.querySelector("#camera-stage");
const video = document.querySelector("#camera-video");
const canvas = document.querySelector("#filter-canvas");
const context = canvas.getContext("2d");
const startButton = document.querySelector("#start-button");
const switchButton = document.querySelector("#switch-camera");
const statusMessage = document.querySelector("#status-message");
const livePill = document.querySelector("#live-pill");
const liveLabel = document.querySelector("#live-label");
const stageHint = document.querySelector("#stage-hint");
const trackingIndicator = document.querySelector("#tracking-indicator");

let faceLandmarker;
let cameraStream;
let animationFrame;
let facingMode = "user";
let lastVideoTime = -1;
let lastDetectionTime = 0;
let isStarting = false;

const filterImage = new Image();
filterImage.src = "./assets/mask.svg";
filterImage.addEventListener("error", () => {
  showError("No se pudo cargar el filtro. Recarga la página para intentarlo de nuevo.");
});

function setStatus(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.classList.toggle("is-error", isError);
}

function showError(message) {
  setStatus(message, true);
  liveLabel.textContent = "NO DISPONIBLE";
  trackingIndicator.hidden = true;
}

function setCameraActive(active) {
  stage.classList.toggle("is-live", active);
  livePill.classList.toggle("is-live", active);
  switchButton.hidden = !active;
  startButton.classList.toggle("is-stop", active);
  startButton.querySelector("span").textContent = active ? "Detener cámara" : "Probar con mi cámara";
  startButton.disabled = false;
  startButton.setAttribute("aria-label", active ? "Detener cámara" : "Probar con mi cámara");
  if (!active) {
    liveLabel.textContent = "LISTO PARA EMPEZAR";
    stageHint.textContent = "Activa la cámara para probar el filtro";
    trackingIndicator.hidden = true;
  }
}

async function loadFaceLandmarker() {
  if (faceLandmarker) return faceLandmarker;
  setStatus("Preparando el filtro por primera vez…");
  const { FaceLandmarker, FilesetResolver } = await import(
    `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VISION_VERSION}/vision_bundle.mjs`
  );
  const vision = await FilesetResolver.forVisionTasks(WASM_URL);
  const options = {
    baseOptions: { modelAssetPath: MODEL_URL },
    runningMode: "VIDEO",
    numFaces: 1,
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: false
  };
  try {
    faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      ...options,
      baseOptions: { ...options.baseOptions, delegate: "GPU" }
    });
  } catch (gpuError) {
    try {
      faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        ...options,
        baseOptions: { ...options.baseOptions, delegate: "CPU" }
      });
    } catch (cpuError) {
      throw new Error(`No se pudo iniciar el detector en GPU (${gpuError.message}) ni en CPU (${cpuError.message}).`);
    }
  }
  return faceLandmarker;
}

async function startCamera() {
  if (isStarting) return;
  isStarting = true;
  startButton.disabled = true;
  setStatus("Solicitando permiso para usar la cámara…");

  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("La cámara requiere una conexión segura (HTTPS) y un navegador compatible.");
    }

    cameraStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode,
        width: { ideal: 720 },
        height: { ideal: 960 }
      }
    });
    video.srcObject = cameraStream;
    await video.play();

    try {
      await loadFaceLandmarker();
    } catch (error) {
      stopCamera();
      throw new Error(`No se pudo cargar el seguimiento facial. Comprueba tu conexión e inténtalo de nuevo. (${error.message})`);
    }

    lastVideoTime = -1;
    lastDetectionTime = 0;
    setCameraActive(true);
    liveLabel.textContent = "CÁMARA ACTIVA";
    setStatus("Coloca tu cara en el centro y el filtro te seguirá.");
    animationFrame = requestAnimationFrame(renderFrame);
  } catch (error) {
    stopCamera();
    let message = error.message || "No se pudo iniciar la cámara.";
    if (error.name === "NotAllowedError") {
      message = "No hay permiso para la cámara. Actívalo en los ajustes del navegador.";
    } else if (error.name === "NotFoundError") {
      message = "No se encontró una cámara disponible en este dispositivo.";
    } else if (error.name === "NotReadableError") {
      message = "La cámara está ocupada o no disponible. Cierra otras apps que la estén usando e inténtalo otra vez.";
    } else if (error.name === "OverconstrainedError") {
      message = "La cámara no admite la configuración solicitada.";
    }
    showError(message);
  } finally {
    isStarting = false;
    startButton.disabled = false;
  }
}

function stopCamera() {
  if (animationFrame) cancelAnimationFrame(animationFrame);
  animationFrame = undefined;
  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = undefined;
  }
  video.pause();
  video.srcObject = null;
  context.clearRect(0, 0, canvas.width, canvas.height);
  setCameraActive(false);
  if (!statusMessage.classList.contains("is-error")) {
    setStatus("No se guarda ni se envía ningún vídeo.");
  }
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.round(rect.width * pixelRatio);
  const height = Math.round(rect.height * pixelRatio);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function landmarkPoint(landmarks, index) {
  return {
    x: landmarks[index].x * video.videoWidth,
    y: landmarks[index].y * video.videoHeight
  };
}

function drawFilter(landmarks) {
  const leftTemple = landmarkPoint(landmarks, 127);
  const rightTemple = landmarkPoint(landmarks, 356);
  const forehead = landmarkPoint(landmarks, 10);
  const chin = landmarkPoint(landmarks, 152);
  const center = landmarkPoint(landmarks, 1);
  const faceWidth = Math.hypot(rightTemple.x - leftTemple.x, rightTemple.y - leftTemple.y);
  const faceHeight = Math.hypot(chin.x - forehead.x, chin.y - forehead.y);
  const angle = Math.atan2(rightTemple.y - leftTemple.y, rightTemple.x - leftTemple.x);
  const coverScale = Math.max(canvas.width / video.videoWidth, canvas.height / video.videoHeight);
  const offsetX = (canvas.width - video.videoWidth * coverScale) / 2;
  const offsetY = (canvas.height - video.videoHeight * coverScale) / 2;

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.save();
  context.setTransform(
    -coverScale, 0, 0, coverScale,
    canvas.width - offsetX, offsetY
  );
  context.translate(center.x, center.y);
  context.rotate(angle);
  const width = faceWidth * 1.45;
  const height = Math.max(faceHeight * 1.42, width * 1.05);
  if (filterImage.complete && filterImage.naturalWidth) {
    context.globalAlpha = 0.96;
    context.drawImage(filterImage, -width / 2, -height * 0.623, width, height);
  }
  context.restore();
}

function renderFrame(now) {
  if (!cameraStream || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    animationFrame = requestAnimationFrame(renderFrame);
    return;
  }

  resizeCanvas();
  const detectionInterval = 1000 / 30;
  if (video.currentTime !== lastVideoTime && now - lastDetectionTime >= detectionInterval) {
    lastVideoTime = video.currentTime;
    lastDetectionTime = now;
    let result;
    try {
      result = faceLandmarker.detectForVideo(video, now);
    } catch (error) {
      stopCamera();
      showError(`El seguimiento facial se detuvo: ${error.message}`);
      return;
    }
    const landmarks = result.faceLandmarks[0];
    if (landmarks) {
      drawFilter(landmarks);
      liveLabel.textContent = "CÁMARA ACTIVA";
      stageHint.textContent = "Mueve la cabeza: tu criatura te sigue";
      trackingIndicator.hidden = false;
      setStatus("Rostro detectado. ¡Prueba distintos gestos!");
    } else {
      context.clearRect(0, 0, canvas.width, canvas.height);
      liveLabel.textContent = "BUSCANDO TU CARA";
      stageHint.textContent = "Acerca tu cara y mira hacia la cámara";
      trackingIndicator.hidden = true;
      setStatus("No detecto una cara todavía. Ajusta la luz o la posición.");
    }
  }
  animationFrame = requestAnimationFrame(renderFrame);
}

startButton.addEventListener("click", () => {
  if (cameraStream) stopCamera();
  else startCamera();
});

switchButton.addEventListener("click", async () => {
  const nextFacingMode = facingMode === "user" ? "environment" : "user";
  stopCamera();
  facingMode = nextFacingMode;
  await startCamera();
});

window.addEventListener("pagehide", stopCamera);
window.addEventListener("resize", resizeCanvas);

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((error) => {
      console.error("No se pudo registrar la aplicación instalable:", error);
    });
  });
}
