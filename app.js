const videoElement = document.getElementById('webcam');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');

// Mengambil elemen UI Dashboard & Loading
let modelSudahSiap = false;
const loadingScreen = document.getElementById('loading-screen');
const loadingStatus = document.getElementById('loading-status');

const statusCard = document.getElementById('status-card');
const statusIcon = document.getElementById('status-icon');
const statusText = document.getElementById('status-text');
const angleText = document.getElementById('angle-text');
const countText = document.getElementById('pushup-count');

// 1. Konfigurasi Awal MediaPipe Pose
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

// 2. Variabel Kontrol Logika Push-Up & Counter
let pushUpCount = 0;
let posisiState = "UP";       
let sedangTurun = false;     

// 3. Fungsi Matematika Menghitung Sudut Siku (Bahu - Siku - Pergelangan)
function hitungSudut(A, B, C) {
    let radians = Math.atan2(C.y - B.y, C.x - B.x) - Math.atan2(A.y - B.y, A.x - B.x);
    let angle = Math.abs((radians * 180.0) / Math.PI);
    if (angle > 180.0) angle = 360.0 - angle;
    return angle;
}

// 4. Fungsi Utama Pemrosesan Frame Video (Real-time)
function onResults(results) {
  // Sembunyikan loading screen begitu AI berhasil memproses frame pertama
  if (!modelSudahSiap) {
      modelSudahSiap = true;
      loadingStatus.innerText = "Kamera Siap!";
      setTimeout(() => {
          loadingScreen.classList.add('fade-out');
      }, 500); 
  }

  // Jika tubuh tidak terdeteksi sama sekali oleh AI
  if (!results.poseLandmarks) {
      statusCard.className = "card status-invalid";
      statusIcon.innerHTML = `<i class="fa-solid fa-user-slash"></i>`;
      statusText.innerHTML = "Tubuh Tidak Terdeteksi";
      angleText.innerText = "0°";
      return;
  }

  canvasCtx.save();
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
  
  // Gambar video mentah kamera ke latar belakang canvas
  canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

  // Gambar Garis Sambungan dan Titik Sendi AI di Layar
  drawConnectors(canvasCtx, results.poseLandmarks, POSE_CONNECTIONS, {color: '#00FF00', lineWidth: 4});
  drawLandmarks(canvasCtx, results.poseLandmarks, {color: '#FF0000', lineWidth: 2});

  // Mengambil koordinat sendi utama (Menggunakan sisi kiri tubuh)
  const bahu = results.poseLandmarks[11];
  const siku = results.poseLandmarks[13];
  const pergelangan = results.poseLandmarks[15];
  const pinggul = results.poseLandmarks[23];

  // --- FILTER VALIDASI POSISI PUSH-UP KETAT ---
  // A. Mengukur kesetaraan tinggi Y antara bahu dan pinggul (posisi horizontal/tiarap)
  const selisihY_BahuPinggul = Math.abs(bahu.y - pinggul.y);
  
  // B. Memastikan posisi bahu berada di atas pergelangan tangan (posisi menumpu beban)
  const bahuDiatasTangan = pergelangan.y > bahu.y;

  // Toleransi selisih Y maksimal 0.25 untuk mendefinisikan posisi tiarap/plank
  const apakahPosisiPushUp = selisihY_BahuPinggul < 0.25 && bahuDiatasTangan;

  // Jika posisi tubuh salah (misal: pengguna sedang duduk atau berdiri menghadap kamera)
  if (!apakahPosisiPushUp) {
      statusCard.className = "card status-invalid";
      statusIcon.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i>`;
      statusText.innerHTML = "Bukan Posisi Push-Up";
      angleText.innerText = "0°";
      
      canvasCtx.restore();
      return; 
  }

  // --- JIKA POSISI TUBUH BENAR, STRATEGI HITUNG PUSH-UP DIMULAI ---
  statusCard.className = "card status-valid";
  statusIcon.innerHTML = `<i class="fa-solid fa-circle-check"></i>`;
  statusText.innerHTML = "Posisi SIAP!";

  // Hitung sudut lekukan siku saat ini
  const sudutSiku = hitungSudut(bahu, siku, pergelangan);
  angleText.innerText = `${Math.round(sudutSiku)}°`;

  // Logika Evaluasi Gerakan Lengan
  if (sudutSiku > 160) { 
      
      // Jika sebelumnya dari bawah dan penurunannya dalam -> HITUNGAN SAH!
      if (posisiState === "DOWN" && sedangTurun === true) {
          pushUpCount++;
          posisiState = "UP";
          sedangTurun = false;
          countText.innerText = pushUpCount;
          putarSuara(pushUpCount.toString()); 
      } 
      // DETEKSI KESALAHAN: Jika tangan kembali lurus padahal turunnya tadi kurang dalam
      else if (posisiState === "DOWN" && sedangTurun === false) {
          putarSuara("Turun kurang dalam");
          posisiState = "UP";
      }
  }

  // Kondisi Badan Turun ke Bawah
  if (sudutSiku < 100) {
      posisiState = "DOWN";
      sedangTurun = true;
  } else if (sudutSiku < 130 && posisiState === "UP") {
      posisiState = "DOWN";
      sedangTurun = false; 
  }

  canvasCtx.restore();
}

// 5. Fungsi Pemicu Suara Pengingat (Menggunakan Web Speech API Browser)
function putarSuara(teks) {
    let speech = new SpeechSynthesisUtterance(teks);
    speech.lang = 'id-ID'; 
    speech.rate = 1.1;     
    window.speechSynthesis.speak(speech);
}

// 6. Mengaktifkan dan Mengalirkan Kamera Laptop
const camera = new Camera(videoElement, {
  onFrame: async () => {
    await pose.send({image: videoElement});
  },
  width: 640,
  height: 480
});
camera.start();