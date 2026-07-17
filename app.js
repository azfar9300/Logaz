// =========================================================================
// 1. INISIALISASI ELEMEN UI & VARIABEL UTAMA
// =========================================================================
const videoElement = document.getElementById('webcam');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');

const statusWrapper = document.getElementById('status-wrapper');
const statusText = document.getElementById('status-text');
const angleText = document.getElementById('angle-text');
const countText = document.getElementById('pushup-count');

// Modal Riwayat Latihan
const historyModal = document.getElementById('history-modal');
const openHistoryBtn = document.getElementById('open-history-btn');
const closeHistoryBtn = document.getElementById('close-history-btn');
const historyContainer = document.getElementById('history-items-container');

// Modal Panduan Prosedur (BARU)
const infoModal = document.getElementById('info-modal');
const openInfoBtn = document.getElementById('open-info-btn');
const closeInfoBtn = document.getElementById('close-info-btn');

let pushUpCount = 0;
let posisiState = "UP";       
let sedangTurun = false;     

// =========================================================================
// 2. FUNGSI MATEMATIKA & PEMBANTU (HELPERS)
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

// =========================================================================
// 3. KONFIGURASI MEDIAPIPE POSE AI
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

// =========================================================================
// 4. FUNGSI UTAMA PEMROSESAN FRAME VIDEO (REAL-TIME DETEKSI)
// =========================================================================
function onResults(results) {
  if (!results.image) return;

  const imgWidth = results.image.width;
  const imgHeight = results.image.height;

  // Kunci resolusi internal kanvas tepat 1:1 dengan resolusi video asli kamera
  // Ini otomatis menghilangkan bug zoom karena resolusi gambar dan wadahnya sinkron
  if (canvasElement.width !== imgWidth || canvasElement.height !== imgHeight) {
      canvasElement.width = imgWidth;
      canvasElement.height = imgHeight;
  }

  // Bersihkan layar kanvas setiap frame baru
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

  canvasCtx.save();
  
  // Gambar frame video secara utuh sesuai resolusi aslinya (Tanpa di-crop)
  canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

  // JIKA LANDMARKS TIDAK TERDETEKSI
  if (!results.poseLandmarks) {
      statusWrapper.className = "status-container status-invalid";
      statusText.innerHTML = "BELUM SIAP"; 
      angleText.innerText = "0°";
      canvasCtx.restore();
      return;
  }

  // JIKA TERDETEKSI, SKALA KOORDINAT AI SESUAIKAN DENGAN UKURAN KANVAS ASLI
  canvasCtx.scale(canvasElement.width, canvasElement.height);

  // Karena tidak ada pemotongan gambar (clipping), mapping koordinat jadi lebih sederhana dan ringan
  const adjustedLandmarks = results.poseLandmarks.map(landmark => {
      return {
          x: landmark.x,
          y: landmark.y,
          z: landmark.z,
          visibility: landmark.visibility
      };
  });

  // Gambar koneksi poin tubuh (Cyan & Putih Premium) pas di atas badan
  const koneksiPose = window.POSE_CONNECTIONS || [];
  drawConnectors(canvasCtx, adjustedLandmarks, koneksiPose, {color: '#00bcd4', lineWidth: 0.006});
  drawLandmarks(canvasCtx, adjustedLandmarks, {color: '#ffffff', lineWidth: 0.002, radius: 0.007});
  
  canvasCtx.restore();

  // -------------------------------------------------------------------------
  // LOGIKA HITUNGAN PUSH UP (Sisa kode di bawahnya tetap sama seperti sebelumnya...)
  // -------------------------------------------------------------------------
  const bahu = results.poseLandmarks[11];
  const siku = results.poseLandmarks[13];
  const pergelangan = results.poseLandmarks[15];
  const pinggul = results.poseLandmarks[23];

  const selisihY_BahuPinggul = Math.abs(bahu.y - pinggul.y);
  const bahuDiatasTangan = pergelangan.y > bahu.y;
  const apakahPosisiPushUp = selisihY_BahuPinggul < 0.25 && bahuDiatasTangan;

  if (!apakahPosisiPushUp) {
      statusWrapper.className = "status-container status-warn";
      statusText.innerHTML = "BELUM SIAP"; 
      angleText.innerText = "0°";
      return; 
  }

  statusWrapper.className = "status-container status-valid";
  statusText.innerHTML = "SIAP";

  const sudutSiku = hitungSudut(bahu, siku, pergelangan);
  angleText.innerText = `${Math.round(sudutSiku)}°`;

  if (sudutSiku > 160) { 
      if (posisiState === "DOWN" && sedangTurun === true) {
          pushUpCount++;
          posisiState = "UP";
          sedangTurun = false;
          countText.innerText = pushUpCount;
          putarSuara(pushUpCount.toString()); 
      } 
      else if (posisiState === "DOWN" && sedangTurun === false) {
          putarSuara("Turun kurang dalam");
          posisiState = "UP";
      }
  }

  if (sudutSiku < 100) {
      posisiState = "DOWN";
      sedangTurun = true;
  } else if (sudutSiku < 130 && posisiState === "UP") {
      posisiState = "DOWN";
      sedangTurun = false; 
  }
}

// =========================================================================
// 5. LOGIKA PENYIMPANAN OTOMATIS & POP-UP MODAL (KALENDER & INFO)
// =========================================================================
function simpanProgressKeLokal() {
    let riwayatLatihan = JSON.parse(localStorage.getItem('logaz_history')) || {};
    const tanggalHariIni = getTanggalHariIni();

    if (pushUpCount > 0) {
        let repsSebelumnya = riwayatLatihan[tanggalHariIni] || 0;
        riwayatLatihan[tanggalHariIni] = repsSebelumnya + pushUpCount;
        localStorage.setItem('logaz_history', JSON.stringify(riwayatLatihan));
        
        pushUpCount = 0;
        countText.innerText = pushUpCount;
    }
}

window.addEventListener('beforeunload', function () {
    simpanProgressKeLokal();
});

function tampilkanRiwayatKalender() {
    historyContainer.innerHTML = ''; 
    let riwayatLatihan = JSON.parse(localStorage.getItem('logaz_history')) || {};
    const listTanggal = Object.keys(riwayatLatihan).reverse();

    if (listTanggal.length === 0) {
        historyContainer.innerHTML = `<p style="text-align:center; color:#64748b; font-size:0.9rem; padding: 1.5rem 0;">Belum ada riwayat aktifitas latihan.</p>`;
        return;
    }

    listTanggal.forEach(tanggal => {
        const itemHTML = `
            <div class="history-item">
                <div class="history-date"><i class="fa-regular fa-calendar-check"></i> ${tanggal}</div>
                <div class="history-reps">${riwayatLatihan[tanggal]} Reps</div>
            </div>
        `;
        historyContainer.insertAdjacentHTML('beforeend', itemHTML);
    });
}

// Event Listeners untuk Modal Kalender
openHistoryBtn.addEventListener('click', () => {
    tampilkanRiwayatKalender();
    historyModal.style.display = 'flex';
});
closeHistoryBtn.addEventListener('click', () => {
    historyModal.style.display = 'none';
});

// Event Listeners untuk Modal Info Prosedur (BARU)
openInfoBtn.addEventListener('click', () => {
    infoModal.style.display = 'flex';
});
closeInfoBtn.addEventListener('click', () => {
    infoModal.style.display = 'none';
});

// Tutup modal otomatis jika klik area background luar luar modal manapun
window.addEventListener('click', (e) => {
    if (e.target === historyModal) historyModal.style.display = 'none';
    if (e.target === infoModal) infoModal.style.display = 'none';
});

// =========================================================================
// 6. MENJALANKAN KAMERA LAPTOP / HP 
// =========================================================================
const camera = new Camera(videoElement, {
  onFrame: async () => {
    if (videoElement.readyState >= 2) {
        await pose.send({image: videoElement});
    }
  },
  width: window.innerWidth > window.innerHeight ? 640 : 480,
  height: window.innerWidth > window.innerHeight ? 480 : 640
});

camera.start().catch(err => {
    console.error("Akses kamera ditolak atau gagal:", err);
    statusText.innerHTML = "ERROR KAMERA";
});