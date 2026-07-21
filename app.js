// =========================================================================
// MOSVAR AI FITNESS TRACKER v2.0
// app.js - Multi-Mode AI Pose Detection
// =========================================================================

// --- Elemen UI ---
const videoElement = document.getElementById('webcam');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');
const statusWrapper = document.getElementById('status-wrapper');
const statusText = document.getElementById('status-text');
const angleText = document.getElementById('angle-text');
const countText = document.getElementById('pushup-count');
const modeBadge = document.getElementById('mode-badge');
const angleLabel = document.getElementById('angle-label');
const toast = document.getElementById('toast');

// Panel reps vs timer
const repsGroup = document.getElementById('reps-group');
const timerGroup = document.getElementById('timer-group');
const plankTimerEl = document.getElementById('plank-timer');

// Layar
const loadingScreen = document.getElementById('loading-screen');
const menuScreen = document.getElementById('menu-screen');
const workoutScreen = document.getElementById('workout-screen');

// History
const menuHistoryList = document.getElementById('menu-history-list');
const backToMenuBtn = document.getElementById('back-to-menu-btn');

// --- Variabel Kontrol ---
let pushUpCount = 0;
let posisiState = "UP";
let sedangTurun = false;
let currentMode = 'pushup';
let isWorkoutActive = false;
let cameraInstance = null;

// --- Variabel Timer Plank ---
let plankTimerInterval = null;
let plankElapsedSeconds = 0;
let isPlankActive = false;
let plankStartTime = null;

// =========================================================================
// KONFIGURASI MODE LATIHAN
// =========================================================================
const MODE_CONFIG = {
    pushup: {
        title: 'PUSH UP',
        label: 'SUDUT SIKU',
        isTimerMode: false,
        landmarks: { A: 11, B: 13, C: 15, hip: 23 },
        thresholdUp: 160,
        thresholdDown: 100,
        thresholdPartial: 130,
        checkPosition: (landmarks) => {
            const bahu = landmarks[11], pinggul = landmarks[23], pergelangan = landmarks[15];
            const selisihY = Math.abs(bahu.y - pinggul.y);
            const bahuDiatasTangan = pergelangan.y > bahu.y;
            return selisihY < 0.25 && bahuDiatasTangan;
        },
        getAngle: (landmarks) => hitungSudut(landmarks[11], landmarks[13], landmarks[15])
    },
    pullup: {
        title: 'PULL UP',
        label: 'SUDUT SIKU',
        isTimerMode: false,
        landmarks: { A: 11, B: 13, C: 15, hip: 23 },
        thresholdUp: 160,
        thresholdDown: 70,
        thresholdPartial: 100,
        checkPosition: (landmarks) => {
            const bahu = landmarks[11], pergelangan = landmarks[15];
            return pergelangan.y < bahu.y;
        },
        getAngle: (landmarks) => hitungSudut(landmarks[11], landmarks[13], landmarks[15])
    },
    situp: {
        title: 'SIT UP',
        label: 'SUDUT PINGGUL',
        isTimerMode: false,
        landmarks: { A: 11, B: 23, C: 25, hip: 23 },
        thresholdUp: 120,
        thresholdDown: 60,
        thresholdPartial: 90,
        checkPosition: () => true,
        getAngle: (landmarks) => hitungSudut(landmarks[11], landmarks[23], landmarks[25])
    },
    squat: {
        title: 'SQUAT',
        label: 'SUDUT LUTUT',
        isTimerMode: false,
        landmarks: { A: 23, B: 25, C: 27, hip: 23 },
        thresholdUp: 160,
        thresholdDown: 90,
        thresholdPartial: 120,
        checkPosition: (landmarks) => {
            const pinggul = landmarks[23], lutut = landmarks[25];
            return pinggul.y < lutut.y;
        },
        getAngle: (landmarks) => hitungSudut(landmarks[23], landmarks[25], landmarks[27])
    },
    plank: {
        title: 'PLANK',
        label: 'SUDUT TUBUH',
        isTimerMode: true,
        landmarks: { A: 11, B: 23, C: 27, hip: 23 },
        thresholdPerfect: 160,
        thresholdMin: 140,
        checkPosition: (landmarks) => {
            const bahu = landmarks[11], pinggul = landmarks[23];
            const horizontal = Math.abs(bahu.y - pinggul.y) < 0.2;
            return horizontal;
        },
        getAngle: (landmarks) => hitungSudut(landmarks[11], landmarks[23], landmarks[27])
    },
    jumpingjack: {
        title: 'JUMPING JACK',
        label: 'SUDUT KAKI',
        isTimerMode: false,
        landmarks: { A: 23, B: 25, C: 27, hip: 23 },
        thresholdUp: 30,
        thresholdDown: 60,
        thresholdPartial: 45,
        checkPosition: (landmarks) => landmarks[23].visibility > 0.5,
        getAngle: (landmarks) => {
            const kiri = hitungSudut(landmarks[24], landmarks[26], landmarks[28]);
            const kanan = hitungSudut(landmarks[23], landmarks[25], landmarks[27]);
            return (kiri + kanan) / 2;
        }
    }
};

// =========================================================================
// FUNGSI MATEMATIKA & PEMBANTU
// =========================================================================
function hitungSudut(A, B, C) {
    let radians = Math.atan2(C.y - B.y, C.x - B.x) - Math.atan2(A.y - B.y, A.x - B.x);
    let angle = Math.abs((radians * 180.0) / Math.PI);
    if (angle > 180.0) angle = 360.0 - angle;
    return angle;
}

function getTanggalHariIni() {
    const hari = new Date();
    const dd = String(hari.getDate()).padStart(2, '0');
    const mm = String(hari.getMonth() + 1).padStart(2, '0');
    const yyyy = hari.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
}

function putarSuara(teks) {
    let speech = new SpeechSynthesisUtterance(teks);
    speech.lang = 'id-ID';
    speech.rate = 1.1;
    window.speechSynthesis.speak(speech);
}

function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
}

function formatTimer(seconds) {
    const m = String(Math.floor(seconds / 60)).padStart(2, '0');
    const s = String(seconds % 60).padStart(2, '0');
    return `${m}:${s}`;
}

// =========================================================================
// TIMER PLANK
// =========================================================================
function startPlankTimer() {
    if (isPlankActive) return;
    isPlankActive = true;
    plankStartTime = Date.now();

    plankTimerInterval = setInterval(() => {
        plankElapsedSeconds = Math.floor((Date.now() - plankStartTime) / 1000);
        plankTimerEl.textContent = formatTimer(plankElapsedSeconds);

        if (plankElapsedSeconds > 0 && plankElapsedSeconds % 10 === 0) {
            putarSuara(`${plankElapsedSeconds} detik`);
        }
    }, 1000);
}

function stopPlankTimer() {
    if (!isPlankActive) return;
    isPlankActive = false;
    clearInterval(plankTimerInterval);
    plankTimerInterval = null;
}

function resetPlankTimer() {
    stopPlankTimer();
    plankElapsedSeconds = 0;
    plankTimerEl.textContent = '00:00';
}

// =========================================================================
// NAVIGASI LAYAR
// =========================================================================
function showMenu() {
    loadingScreen.classList.add('hidden');
    menuScreen.classList.remove('hidden');
    workoutScreen.classList.remove('active');
    isWorkoutActive = false;
    simpanProgressKeLokal();
    resetPlankTimer();
    renderMenuHistory();
}

function showWorkout(mode) {
    currentMode = mode;
    const config = MODE_CONFIG[mode];

    modeBadge.textContent = config.title;
    angleLabel.textContent = config.label;
    pushUpCount = 0;
    countText.innerText = '0';
    posisiState = "UP";
    sedangTurun = false;

    if (config.isTimerMode) {
        repsGroup.classList.add('hidden');
        timerGroup.classList.remove('hidden');
        resetPlankTimer();
    } else {
        repsGroup.classList.remove('hidden');
        timerGroup.classList.add('hidden');
    }

    menuScreen.classList.add('hidden');
    workoutScreen.classList.add('active');
    isWorkoutActive = true;

    showToast(`Mode: ${config.title}`);

    if (!cameraInstance) {
        startCamera();
    }
}

// Event listener menu cards
document.querySelectorAll('.menu-card').forEach(card => {
    card.addEventListener('click', () => {
        const mode = card.dataset.mode;
        showWorkout(mode);
    });
});

// Back to menu
backToMenuBtn.addEventListener('click', () => {
    showMenu();
});

// =========================================================================
// MEDIAPIPE POSE AI
// =========================================================================
const pose = new Pose({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
});

pose.setOptions({
    modelComplexity: 1,
    smoothLandmarks: true,
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.6
});

pose.onResults(onResults);

function onResults(results) {
    if (!results.image) return;

    const imgWidth = results.image.width;
    const imgHeight = results.image.height;
    const screenW = window.innerWidth;
    const screenH = window.innerHeight;

    // Canvas internal = screen size (penting!)
    if (canvasElement.width !== screenW || canvasElement.height !== screenH) {
        canvasElement.width = screenW;
        canvasElement.height = screenH;
    }

    canvasCtx.save();
    canvasCtx.clearRect(0, 0, screenW, screenH);

    // Cover scaling manual: video memenuhi screen tanpa distortion
    const imgRatio = imgWidth / imgHeight;
    const screenRatio = screenW / screenH;
    let drawW, drawH, offsetX, offsetY;

    if (imgRatio > screenRatio) {
        // Video lebih lebar → scale by height, crop sisi
        drawH = screenH;
        drawW = drawH * imgRatio;
        offsetX = (screenW - drawW) / 2;
        offsetY = 0;
    } else {
        // Video lebih tinggi → scale by width, crop atas/bawah
        drawW = screenW;
        drawH = drawW / imgRatio;
        offsetX = 0;
        offsetY = (screenH - drawH) / 2;
    }

    // Draw video frame dengan cover scaling + mirror
    canvasCtx.translate(screenW, 0);
    canvasCtx.scale(-1, 1);
    canvasCtx.drawImage(results.image, offsetX, offsetY, drawW, drawH);

    if (!results.poseLandmarks) {
        statusWrapper.className = "status-container status-invalid";
        statusText.innerHTML = "BELUM SIAP";
        angleText.innerText = "0°";

        if (currentMode === 'plank') stopPlankTimer();

        canvasCtx.restore();
        return;
    }

    const koneksiPose = window.POSE_CONNECTIONS || [];
    drawConnectors(canvasCtx, results.poseLandmarks, koneksiPose, {
        color: 'rgba(0, 255, 136, 0.6)',
        lineWidth: 3
    });
    drawLandmarks(canvasCtx, results.poseLandmarks, {
        color: '#0bfbff',
        lineWidth: 1,
        radius: 4
    });
    canvasCtx.restore();

    const config = MODE_CONFIG[currentMode];
    const landmarks = results.poseLandmarks;

    const posisiValid = config.checkPosition(landmarks);

    if (!posisiValid) {
        statusWrapper.className = "status-container status-warn";
        statusText.innerHTML = "BELUM SIAP";
        angleText.innerText = "0°";

        if (config.isTimerMode) stopPlankTimer();
        return;
    }

    const sudut = config.getAngle(landmarks);
    angleText.innerText = `${Math.round(sudut)}°`;

    // ===================== MODE TIMER (PLANK) =====================
    if (config.isTimerMode) {
        if (sudut > config.thresholdPerfect) {
            statusWrapper.className = "status-container status-valid";
            statusText.innerHTML = "SEMPURNA";
            startPlankTimer();
        } else if (sudut > config.thresholdMin) {
            statusWrapper.className = "status-container status-warn";
            statusText.innerHTML = "TETAP";
            startPlankTimer();
        } else {
            statusWrapper.className = "status-container status-invalid";
            statusText.innerHTML = "TURUN";
            stopPlankTimer();
        }
        return;
    }

    // ===================== MODE REPETISI =====================
    statusWrapper.className = "status-container status-valid";
    statusText.innerHTML = "SIAP";

    if (sudut > config.thresholdUp) {
        if (posisiState === "DOWN" && sedangTurun === true) {
            pushUpCount++;
            posisiState = "UP";
            sedangTurun = false;
            countText.innerText = pushUpCount;
            putarSuara(pushUpCount.toString());
        } else if (posisiState === "DOWN" && sedangTurun === false) {
            putarSuara("Turun kurang dalam");
            posisiState = "UP";
        }
    }

    if (sudut < config.thresholdDown) {
        posisiState = "DOWN";
        sedangTurun = true;
    } else if (sudut < config.thresholdPartial && posisiState === "UP") {
        posisiState = "DOWN";
        sedangTurun = false;
    }
}

// =========================================================================
// KAMERA
// =========================================================================
function startCamera() {
    const isPortrait = window.innerHeight > window.innerWidth;

    cameraInstance = new Camera(videoElement, {
        onFrame: async () => {
            if (videoElement.readyState >= 2) {
                await pose.send({ image: videoElement });
            }
        },
        // Kunci aspect ratio sesuai orientasi HP
        width: isPortrait ? 480 : 640,
        height: isPortrait ? 640 : 480
    });

    cameraInstance.start().catch(err => {
        console.error("Akses kamera ditolak:", err);
        statusText.innerHTML = "ERROR KAMERA";
        showToast("Akses kamera ditolak!");
    });
}

// =========================================================================
// HISTORY & LOCAL STORAGE
// =========================================================================
function simpanProgressKeLokal() {
    let riwayatLatihan = JSON.parse(localStorage.getItem('logaz_history')) || {};
    const tanggalHariIni = getTanggalHariIni();
    const config = MODE_CONFIG[currentMode];

    if (config.isTimerMode) {
        if (plankElapsedSeconds > 0) {
            const modeKey = `${tanggalHariIni}_${currentMode}`;
            let durasiSebelumnya = riwayatLatihan[modeKey] || 0;
            riwayatLatihan[modeKey] = Math.max(durasiSebelumnya, plankElapsedSeconds);
            localStorage.setItem('logaz_history', JSON.stringify(riwayatLatihan));
        }
    } else {
        if (pushUpCount > 0) {
            const modeKey = `${tanggalHariIni}_${currentMode}`;
            let repsSebelumnya = riwayatLatihan[modeKey] || 0;
            riwayatLatihan[modeKey] = repsSebelumnya + pushUpCount;
            localStorage.setItem('logaz_history', JSON.stringify(riwayatLatihan));
        }
    }

    pushUpCount = 0;
    countText.innerText = '0';
    resetPlankTimer();
}

window.addEventListener('beforeunload', function () {
    simpanProgressKeLokal();
});

function renderMenuHistory() {
    if (!menuHistoryList) return;
    tampilkanRiwayatKalender();
}

function tampilkanRiwayatKalender() {
    if (!menuHistoryList) return;
    menuHistoryList.innerHTML = '';
    let riwayatLatihan = JSON.parse(localStorage.getItem('logaz_history')) || {};
    const listTanggal = Object.keys(riwayatLatihan).reverse();

    if (listTanggal.length === 0) {
        menuHistoryList.innerHTML = `<div class="history-empty">Belum ada riwayat aktivitas latihan.</div>`;
        return;
    }

    listTanggal.forEach(key => {
        const [tanggal, mode] = key.split('_');
        const config = MODE_CONFIG[mode];
        const modeName = config?.title || mode.toUpperCase();
        const isTimer = config?.isTimerMode || false;
        const value = riwayatLatihan[key];
        const displayValue = isTimer ? formatTimer(value) : `${value} Reps`;

        const itemHTML = `
            <div class="history-item">
                <div>
                    <div class="history-date"><i class="fa-regular fa-calendar-check"></i> ${tanggal}</div>
                    <div style="font-size: 0.65rem; color: var(--primary-neon); margin-top: 2px; font-family: var(--font-head);">${modeName}</div>
                </div>
                <div class="history-reps">${displayValue}</div>
            </div>
        `;
        menuHistoryList.insertAdjacentHTML('beforeend', itemHTML);
    });
}

// =========================================================================
// INIT
// =========================================================================
window.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        loadingScreen.classList.add('hidden');
        renderMenuHistory();
    }, 2800);
});