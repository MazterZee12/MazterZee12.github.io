/* =====================================================================
   BLOK 1: LATAR (JANGAN DIUBAH)
   Disalin apa adanya dari background.html. Satu-satunya perubahan:
   tombol #themeBtn bawaan diganti MutationObserver yang memantau
   atribut data-theme pada <html> (lihat bagian paling bawah blok ini).
   ===================================================================== */
(function () {
  var root = document.documentElement;
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var TAU = Math.PI * 2;

  var mx = 0.5, my = 0.5, tx = 0.5, ty = 0.5;               // posisi mouse (0..1)
  var darkTarget = root.getAttribute("data-theme") === "dark" ? 1 : 0;
  var dark = darkTarget;                                     // nilai yang dianimasikan

  function pointer(x, y) {
    tx = x / window.innerWidth; ty = y / window.innerHeight;
    root.style.setProperty("--mx", x + "px");
    root.style.setProperty("--my", y + "px");
  }
  window.addEventListener("mousemove", function (e) { pointer(e.clientX, e.clientY); });
  window.addEventListener("touchmove", function (e) {
    if (e.touches[0]) pointer(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: true });

  /* =============== SHADER AURORA (WebGL) =============== */
  var VERT = "attribute vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }";

  var FRAG = `
  #ifdef GL_FRAGMENT_PRECISION_HIGH
  precision highp float;
  #else
  precision mediump float;
  #endif
  uniform vec2  u_res;
  uniform float u_time;
  uniform vec2  u_mouse;
  uniform float u_dark;

  float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float noise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    float a = hash(i), b = hash(i + vec2(1.0, 0.0)), c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
  }
  float fbm(vec2 p){
    float v = 0.0, a = 0.5;
    mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
    for (int i = 0; i < 5; i++) { v += a * noise(p); p = m * p; a *= 0.5; }
    return v;
  }

  void main(){
    vec2 res = u_res;
    float s = min(res.x, res.y);
    vec2 p = (gl_FragCoord.xy - 0.5 * res) / s;
    vec2 m = (u_mouse * res - 0.5 * res) / s;
    float t = u_time * 0.045;

    // domain warping: bentuk mengalir seperti asap / aurora
    vec2 q = vec2(fbm(p * 1.5 + t), fbm(p * 1.5 + vec2(5.2, 1.3) - t));
    vec2 r = vec2(fbm(p * 1.5 + 3.0 * q + vec2(1.7, 9.2) + 1.5 * t),
                  fbm(p * 1.5 + 3.0 * q + vec2(8.3, 2.8) - 1.2 * t));
    float f = fbm(p * 1.4 + 3.0 * r);

    vec3 green  = vec3(0.13, 0.77, 0.37);
    vec3 purple = vec3(0.43, 0.36, 0.99);
    vec3 cyan   = vec3(0.02, 0.71, 0.83);

    vec3 col = mix(purple, green, smoothstep(0.2, 0.8, f));
    col = mix(col, cyan, smoothstep(0.35, 0.9, length(q)));

    float md   = length(p - m);
    float glow = exp(-md * md * 7.0);                       // cahaya di sekitar kursor
    float body = smoothstep(0.25, 0.95, f);
    float ridge = pow(1.0 - abs(2.0 * f - 1.0), 7.0);       // urat cahaya tipis

    // dasar mode terang dibuat abu-biru lembut (tidak menyilaukan)
    vec3 base = mix(vec3(0.835, 0.855, 0.915), vec3(0.043, 0.063, 0.125), u_dark);
    float strength = mix(0.58, 0.62, u_dark);

    vec3 outc = mix(base, col, clamp(body * strength + glow * 0.28, 0.0, 1.0));
    outc = mix(outc, col, ridge * mix(0.20, 0.0, u_dark));                 // mode terang
    outc += col * ridge * 0.32 * u_dark * (0.6 + glow);                    // mode gelap

    float vig = smoothstep(1.25, 0.25, length(p) * 1.1);
    outc = mix(outc, outc * vig, mix(0.22, 0.35, u_dark));

    gl_FragColor = vec4(clamp(outc, 0.0, 1.0), 1.0);
  }`;

  var glc = document.getElementById("gl");
  var gl = glc.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power" });
  var uRes, uTime, uMouse, uDark, glOK = false;

  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(s)); return null; }
    return s;
  }

  if (gl) {
    var vs = compile(gl.VERTEX_SHADER, VERT), fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (vs && fs) {
      var prog = gl.createProgram();
      gl.attachShader(prog, vs); gl.attachShader(prog, fs);
      gl.linkProgram(prog);
      if (gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        gl.useProgram(prog);
        var buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        var loc = gl.getAttribLocation(prog, "a");
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        uRes = gl.getUniformLocation(prog, "u_res");
        uTime = gl.getUniformLocation(prog, "u_time");
        uMouse = gl.getUniformLocation(prog, "u_mouse");
        uDark = gl.getUniformLocation(prog, "u_dark");
        glOK = true;
      }
    }
  }
  if (!glOK) glc.style.display = "none";                     // pakai gradasi fallback

  var RES_SCALE = 0.6;                                       // resolusi render (lebih kecil = lebih ringan)
  function resizeGL() {
    if (!glOK) return;
    glc.width = Math.max(2, Math.floor(window.innerWidth * RES_SCALE));
    glc.height = Math.max(2, Math.floor(window.innerHeight * RES_SCALE));
    gl.viewport(0, 0, glc.width, glc.height);
  }

  function drawGL(now) {
    if (!glOK) return;
    gl.uniform2f(uRes, glc.width, glc.height);
    gl.uniform1f(uTime, reduce ? 20.0 : now / 1000);
    gl.uniform2f(uMouse, mx, 1 - my);
    gl.uniform1f(uDark, dark);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /* =============== DEBU BINTANG + BOKEH (canvas 2D) =============== */
  var sc = document.getElementById("stars");
  var ctx = sc.getContext("2d");
  var W = 0, H = 0, parts = [], HUES = [160, 190, 270];

  function makeParticle(bokeh) {
    return {
      bokeh: bokeh,
      x: Math.random() * W,
      y: Math.random() * H,
      r: bokeh ? Math.random() * 30 + 14 : Math.random() * 1.2 + 0.5,   // bokeh besar, debu kecil
      vx: (Math.random() - 0.5) * (bokeh ? 0.12 : 0.06),
      vy: -(Math.random() * (bokeh ? 0.18 : 0.10) + 0.03),
      z: bokeh ? Math.random() * 0.5 + 0.5 : Math.random() * 0.6 + 0.1,  // kedalaman (untuk parallax)
      tw: Math.random() * TAU,
      twSpeed: Math.random() * 0.02 + 0.004,
      hue: HUES[Math.floor(Math.random() * HUES.length)],
      a: bokeh ? Math.random() * 0.07 + 0.04 : Math.random() * 0.5 + 0.3
    };
  }

  function resizeStars() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    sc.width = W * dpr; sc.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var nStars = Math.max(40, Math.min(140, Math.floor((W * H) / 9000)));
    var nBokeh = Math.max(6, Math.min(18, Math.floor((W * H) / 90000)));
    parts = [];
    var i;
    for (i = 0; i < nStars; i++) parts.push(makeParticle(false));
    for (i = 0; i < nBokeh; i++) parts.push(makeParticle(true));
  }

  function drawStars() {
    ctx.clearRect(0, 0, W, H);
    var d = dark > 0.5;
    ctx.globalCompositeOperation = d ? "lighter" : "source-over";
    var px = mx - 0.5, py = my - 0.5;

    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (!reduce) {
        p.x += p.vx; p.y += p.vy; p.tw += p.twSpeed;
        if (p.y < -p.r * 2) { p.y = H + p.r * 2; p.x = Math.random() * W; }
        if (p.x < -p.r * 2) p.x = W + p.r * 2;
        else if (p.x > W + p.r * 2) p.x = -p.r * 2;
      }
      var x = p.x - px * p.z * 70;                          // parallax mengikuti kursor
      var y = p.y - py * p.z * 70;

      if (p.bokeh) {
        var a = p.a * (0.7 + 0.3 * Math.sin(p.tw));
        var c = d ? "hsla(" + p.hue + ",90%,70%," : "hsla(0,0%,100%,";
        var g = ctx.createRadialGradient(x, y, p.r * 0.15, x, y, p.r);
        g.addColorStop(0, c + (a * 0.5) + ")");
        g.addColorStop(0.85, c + a + ")");
        g.addColorStop(1, c + "0)");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y, p.r, 0, TAU); ctx.fill();
        ctx.strokeStyle = c + (a * 1.6) + ")";              // tepi lensa tipis
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(x, y, p.r * 0.92, 0, TAU); ctx.stroke();
      } else {
        var a2 = p.a * (0.4 + 0.6 * Math.abs(Math.sin(p.tw)));
        var core = d ? "hsla(" + p.hue + ",90%,82%," : "rgba(255,255,255,";
        ctx.fillStyle = core + (d ? a2 : a2 * 0.9) + ")";
        ctx.beginPath(); ctx.arc(x, y, p.r, 0, TAU); ctx.fill();
        ctx.fillStyle = core + (a2 * 0.15) + ")";           // halo kecil
        ctx.beginPath(); ctx.arc(x, y, p.r * 3.2, 0, TAU); ctx.fill();
      }
    }
    ctx.globalCompositeOperation = "source-over";
  }

  /* =============== LOOP & TEMA =============== */
  function frame(now) {
    mx += (tx - mx) * 0.06;                                  // mouse dibuat halus
    my += (ty - my) * 0.06;
    dark += (darkTarget - dark) * 0.08;                      // transisi tema halus
    drawGL(now || 0);
    drawStars();
    if (!reduce) requestAnimationFrame(frame);
  }

  /* PERUBAHAN: pantau data-theme di <html>, tombol tema mana pun otomatis mengubah latar */
  new MutationObserver(function () {
    var next = root.getAttribute("data-theme") === "dark" ? 1 : 0;
    if (next === darkTarget) return;
    darkTarget = next;
    if (reduce) { dark = darkTarget; frame(0); }
  }).observe(root, { attributes: true, attributeFilter: ["data-theme"] });

  window.addEventListener("resize", function () { resizeGL(); resizeStars(); if (reduce) frame(0); });
  resizeGL(); resizeStars();
  frame(0);
  if (!reduce) requestAnimationFrame(frame);
})();


/* =====================================================================
   BLOK 2: HALAMAN PORTFOLIO
   ===================================================================== */
(function () {
  "use strict";

  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- GANTI: konfigurasi ---------- */
  var GITHUB_USER = "YOUR_GITHUB_USERNAME";  // username GitHub (bagian setelah github.com/)
  var YOUR_EMAIL  = "you@example.com";       // email tujuan form kontak

  /* ================= TRANSLATIONS (semua teks ada di sini) ================= */
  var I18N = {
    en: {
      skip: "Skip to content",
      nav_home: "Home", nav_about: "About", nav_skills: "Skills", nav_projects: "Projects",
      nav_certs: "Certifications", nav_contact: "Contact",
      hero_hello: "Hello, I'm", hero_role: "Web Developer | Data Enthusiast | Cyber Security | Programmer", hero_into: "I'm into",
      btn_projects: "View Projects", btn_cv: "Download CV",
      about_title: "About", about_role: "Web Developer | Data Enthusiast | Cyber Security | Programmer",
      about_desc: "I'm an Information Technology student who enjoys building clean, practical websites and turning raw data into clear insights. I like projects where design and logic meet, from small web apps to data dashboards. I'm currently looking for an internship where I can learn from a team and contribute to real products.",
      lbl_age: "Age", lbl_location: "Location", lbl_study: "Study", lbl_email: "Email",
      skills_title: "Skills", cat_lang: "Languages", cat_web: "Web", cat_data: "Data", cat_tools: "Tools",
      cat_gh: "From GitHub", gh_repo: "repo", gh_repos: "repos",
      gh_loading: "Loading from GitHub...", gh_ok: "Most used languages across my public repositories.",
      gh_fail: "GitHub data is unavailable right now.",
      projects_title: "Projects", btn_live: "Live", btn_code: "Code",
      p1: "Describe the result: for example, a dashboard that cut weekly reporting time from 3 hours to 20 minutes.",
      p2: "Describe the impact: for example, an online store used by 50 customers in its first month.",
      p3: "Describe the outcome: for example, a data analysis that found the top 3 factors behind late deliveries.",
      p4: "Describe the result: for example, a small game that won 2nd place in a campus competition.",
      certs_title: "Education & Certifications", edu_title: "Education", cert_title: "Certifications",
      edu1: "Diploma in Information Technology, Your University | 2025 - Present",
      edu2: "Science Major, SMAN 1 Labuhan Deli | 2022 - 2025",
      cert1: "Certification name, Issuer | Year",
      cert2: "Certification name, Issuer | Year",
      cert3: "Certification name, Issuer | Year",
      contact_title: "Get in touch",
      contact_desc: "Open to internships, collaborations, and new projects. Send a message and I'll reply soon.",
      btn_email: "Email me", f_name: "Name", f_email: "Email", f_msg: "Message", btn_send: "Send",
      foot_text: "Thanks for visiting my portfolio. Connect with me on social media.",
      foot_links: "Quick links", foot_connect: "Connect", foot_top: "Back to top",
      typed: ["Web Development", "Data Analysis", "Clean Design", "Problem Solving" , "Cyber Security", "Programming"]
    },
    id: {
      skip: "Langsung ke konten",
      nav_home: "Beranda", nav_about: "Tentang", nav_skills: "Keahlian", nav_projects: "Proyek",
      nav_certs: "Sertifikasi", nav_contact: "Kontak",
      hero_hello: "Halo, saya", hero_role: "Web Developer | Penggemar Data | Keamanan Ciber | Programmer", hero_into: "Saya tertarik pada",
      btn_projects: "Lihat Proyek", btn_cv: "Unduh CV",
      about_title: "Tentang", about_role: "Web Developer | Penggemar Data | Keamanan Ciber | Programmer",
      about_desc: "Saya mahasiswa Teknologi Informasi yang senang membuat website yang rapi dan berguna, serta mengubah data mentah menjadi wawasan yang jelas. Saya suka proyek yang memadukan desain dan logika, mulai dari aplikasi web kecil sampai dashboard data. Saat ini saya mencari magang untuk belajar dari tim dan berkontribusi pada produk nyata.",
      lbl_age: "Usia", lbl_location: "Lokasi", lbl_study: "Studi", lbl_email: "Email",
      skills_title: "Keahlian", cat_lang: "Bahasa Pemrograman", cat_web: "Web", cat_data: "Data", cat_tools: "Alat",
      cat_gh: "Dari GitHub", gh_repo: "repo", gh_repos: "repo",
      gh_loading: "Memuat dari GitHub...", gh_ok: "Bahasa yang paling sering dipakai di repositori publik saya.",
      gh_fail: "Data GitHub sedang tidak tersedia.",
      projects_title: "Proyek", btn_live: "Live", btn_code: "Kode",
      p1: "Jelaskan hasilnya: misalnya dashboard yang memangkas waktu laporan mingguan dari 3 jam menjadi 20 menit.",
      p2: "Jelaskan dampaknya: misalnya toko online yang dipakai 50 pelanggan di bulan pertama.",
      p3: "Jelaskan hasilnya: misalnya analisis data yang menemukan 3 faktor utama penyebab keterlambatan pengiriman.",
      p4: "Jelaskan hasilnya: misalnya game kecil yang meraih juara 2 di lomba kampus.",
      certs_title: "Pendidikan & Sertifikasi", edu_title: "Pendidikan", cert_title: "Sertifikasi",
      edu1: "Diploma Teknologi Informasi, Universitas Anda | 2025 - Sekarang",
      edu2: "Jurusan IPA, SMAN 1 Labuhan Deli | 2022 - 2025",
      cert1: "Nama sertifikat, Penerbit | Tahun",
      cert2: "Nama sertifikat, Penerbit | Tahun",
      cert3: "Nama sertifikat, Penerbit | Tahun",
      contact_title: "Hubungi saya",
      contact_desc: "Terbuka untuk magang, kolaborasi, dan proyek baru. Kirim pesan dan saya akan segera membalas.",
      btn_email: "Kirim email", f_name: "Nama", f_email: "Email", f_msg: "Pesan", btn_send: "Kirim",
      foot_text: "Terima kasih sudah mengunjungi portofolio saya. Terhubung dengan saya lewat media sosial.",
      foot_links: "Quick links", foot_connect: "Connect", foot_top: "Back to top",
      typed: ["Pengembangan Web", "Analisis Data", "Desain Rapi", "Pemecahan Masalah", "Keamanan Cyber", "Programming"]
      
    }
  };

  /* Bahasa default: Inggris. Pilihan pengguna disimpan. */
  var lang = "en";
  try { lang = localStorage.getItem("lang") || "en"; } catch (e) {}
  if (!I18N[lang]) lang = "en";

  var ghData = null;      // [{name, count}] dari GitHub
  var ghState = "idle";   // idle | loading | ok | fail

  function applyLang(l) {
    lang = l;
    document.documentElement.lang = l;
    var dict = I18N[l];
    $$("[data-i18n]").forEach(function (el) {
      var k = el.getAttribute("data-i18n");
      if (dict[k] !== undefined) el.textContent = dict[k];
    });
    var sel = $("#langSelect");
    if (sel) sel.value = l;
    try { localStorage.setItem("lang", l); } catch (e) {}
    renderGH();
    resetTyping();
  }

  /* ================= THEME ================= */
  var root = document.documentElement;
  $("#themeToggle").addEventListener("click", function () {
    var t = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", t);           // latar ikut berubah lewat MutationObserver
    try { localStorage.setItem("theme", t); } catch (e) {}
  });

  /* ================= TYPING EFFECT ================= */
  var typedEl = $("#typed");
  var tIndex = 0, cIndex = 0, deleting = false, typeTimer = null;

  function typeLoop() {
    var words = I18N[lang].typed;
    var word = words[tIndex % words.length];
    if (!deleting) {
      cIndex++;
      typedEl.textContent = word.slice(0, cIndex);
      if (cIndex === word.length) { deleting = true; typeTimer = setTimeout(typeLoop, 1400); return; }
      typeTimer = setTimeout(typeLoop, 90);
    } else {
      cIndex--;
      typedEl.textContent = word.slice(0, cIndex);
      if (cIndex === 0) { deleting = false; tIndex++; typeTimer = setTimeout(typeLoop, 350); return; }
      typeTimer = setTimeout(typeLoop, 45);
    }
  }
  function resetTyping() {
    clearTimeout(typeTimer);
    tIndex = 0; cIndex = 0; deleting = false;
    if (reduceMotion) { typedEl.textContent = I18N[lang].typed.join(", "); return; }
    typedEl.textContent = "";
    typeLoop();
  }

  /* ================= GITHUB LANGUAGES ================= */
  var GH_TTL = 60 * 60 * 1000; // cache 1 jam (batas API tanpa login: 60 permintaan/jam/IP)

  function ghConfigured() { return GITHUB_USER && GITHUB_USER.indexOf("YOUR_") !== 0; }

  function countLangs(repos) {
    var map = {};
    repos.forEach(function (r) {
      if (r.fork || !r.language) return;
      map[r.language] = (map[r.language] || 0) + 1;
    });
    return Object.keys(map).map(function (k) { return { name: k, count: map[k] }; })
      .sort(function (a, b) { return b.count - a.count; }).slice(0, 8);
  }

  function renderGH() {
    var group = $("#ghGroup");
    if (!ghConfigured()) { group.hidden = true; return; }
    group.hidden = false;
    var dict = I18N[lang], list = $("#ghTags"), note = $("#ghNote");
    list.innerHTML = "";
    if (ghState === "loading") { note.textContent = dict.gh_loading; return; }
    if (ghState === "fail" || !ghData || !ghData.length) { note.textContent = dict.gh_fail; return; }
    ghData.forEach(function (it) {
      var li = document.createElement("li");
      li.textContent = it.name + " \u00B7 " + it.count + " " + (it.count === 1 ? dict.gh_repo : dict.gh_repos);
      list.appendChild(li);
    });
    note.textContent = dict.gh_ok;
  }

  function loadGH() {
    if (!ghConfigured()) { renderGH(); return; }
    var key = "ghLangs", cached = null;
    try { cached = JSON.parse(localStorage.getItem(key)); } catch (e) {}
    if (cached && cached.user === GITHUB_USER && Date.now() - cached.t < GH_TTL) {
      ghData = cached.data; ghState = "ok"; renderGH(); return;
    }
    ghState = "loading"; renderGH();
    fetch("https://api.github.com/users/" + encodeURIComponent(GITHUB_USER) + "/repos?per_page=100&sort=updated")
      .then(function (res) { if (!res.ok) throw new Error(res.status); return res.json(); })
      .then(function (repos) {
        ghData = countLangs(repos); ghState = "ok";
        try { localStorage.setItem(key, JSON.stringify({ user: GITHUB_USER, t: Date.now(), data: ghData })); } catch (e) {}
        renderGH();
      })
      .catch(function () { ghState = "fail"; renderGH(); });
  }

  /* ================= MOBILE MENU ================= */
  var navLinks = $("#navLinks"), burger = $("#burger");
  function setMenu(open) {
    navLinks.classList.toggle("open", open);
    burger.setAttribute("aria-expanded", open ? "true" : "false");
  }
  burger.addEventListener("click", function () { setMenu(!navLinks.classList.contains("open")); });
  $$("a", navLinks).forEach(function (a) { a.addEventListener("click", function () { setMenu(false); }); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && navLinks.classList.contains("open")) { setMenu(false); burger.focus(); }
  });

  /* ================= ACTIVE LINK ON SCROLL ================= */
  var sections = $$("main section[id]");
  var links = $$("a", navLinks);
  function onScroll() {
    var y = window.scrollY + 140;
    var current = sections[0].id;
    sections.forEach(function (s) { if (s.offsetTop <= y) current = s.id; });
    if (window.innerHeight + window.scrollY >= document.body.scrollHeight - 4) current = sections[sections.length - 1].id;
    links.forEach(function (a) {
      var on = a.getAttribute("href") === "#" + current;
      a.classList.toggle("active", on);
      if (on) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current");
    });
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ================= SCROLL REVEAL ================= */
  var revealEls = $$(".reveal");
  if ("IntersectionObserver" in window && !reduceMotion) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("show"); io.unobserve(en.target); }
      });
    }, { threshold: 0.12 });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add("show"); });
  }

  /* ================= CONTACT FORM (membuka aplikasi email) ================= */
  $("#contactForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var name = $("#cName").value.trim();
    var email = $("#cEmail").value.trim();
    var msg = $("#cMsg").value.trim();
    var subject = encodeURIComponent("Portfolio message from " + name);
    var body = encodeURIComponent(msg + "\n\n" + name + " (" + email + ")");
    window.location.href = "mailto:" + YOUR_EMAIL + "?subject=" + subject + "&body=" + body;
  });

  /* ================= INIT ================= */
  $("#langSelect").addEventListener("change", function (e) { applyLang(e.target.value); });
  $("#year").textContent = new Date().getFullYear();
  applyLang(lang);
  loadGH();
})();
