/* Piloto local Fit10. Sem crase / template literal (WAF Interago). */
(function () {
  "use strict";

  var FIT10_ASSETS_BASE = "assets/sistemas/fit10/";
  var GLB_NAME = "perfil-duo.glb";

  var steps = [
    { start: 0, end: 0.24, parts: [{ name: "Perfil_Duo", offset: [-0.12, 0, 0] }] },
    { start: 0.30, end: 0.55, parts: [{ name: "Curva_90", offset: [0.135, 0, 0] }] },
    {
      start: 0.61,
      end: 0.91,
      parts: [
        { name: "Haste_Esquerda", offset: [0, 0.13, 0] },
        { name: "Haste_Direita", offset: [0, 0.13, 0], delay: 0.035 }
      ]
    }
  ];

  var loadEl = document.getElementById("fit10Load");
  var loadHint = document.getElementById("fit10LoadHint");

  function setLoadHint(text) {
    if (loadHint) loadHint.textContent = text;
  }

  function hideLoader() {
    if (!loadEl) return;
    loadEl.hidden = true;
  }

  function showLoaderError(message) {
    setLoadHint(message);
    if (loadEl) {
      var mark = loadEl.querySelector(".fit10Load__mark");
      if (mark) mark.style.animation = "none";
    }
  }

  function progressBetween(progress, start, end) {
    return Fit10Assets.MathUtils.clamp((progress - start) / (end - start), 0, 1);
  }

  function bindMovements(model) {
    return steps.flatMap(function (step) {
      return step.parts.map(function (part) {
        var object = model.getObjectByName(part.name);
        if (!object) throw new Error("Peca ausente no GLB: " + part.name);
        return {
          object: object,
          rest: object.position.clone(),
          offset: new Fit10Assets.Vector3(part.offset[0], part.offset[1], part.offset[2]),
          start: step.start + (part.delay || 0),
          end: step.end
        };
      });
    });
  }

  function findFraming(parts, direction) {
    var Vector3 = Fit10Assets.Vector3;
    var Box3 = Fit10Assets.Box3;
    var right = new Vector3().crossVectors(new Vector3(0, 1, 0), direction).normalize();
    var up = new Vector3().crossVectors(direction, right);
    var projected = new Box3();

    parts.forEach(function (part) {
      var box = new Box3().setFromObject(part.object, true);
      var min = box.min;
      var max = box.max;
      [min.x, max.x].forEach(function (x) {
        [min.y, max.y].forEach(function (y) {
          [min.z, max.z].forEach(function (z) {
            var point = new Vector3(x, y, z);
            [point, point.clone().add(part.offset)].forEach(function (position) {
              projected.expandByPoint(new Vector3(
                position.dot(right),
                position.dot(up),
                position.dot(direction)
              ));
            });
          });
        });
      });
    });

    var center = projected.getCenter(new Vector3());
    var target = new Vector3()
      .addScaledVector(right, center.x)
      .addScaledVector(up, center.y)
      .addScaledVector(direction, center.z);
    return { target: target, size: projected.getSize(new Vector3()) };
  }

  /* Evita preto absoluto (#000). Sobe para grafite Newline (~#242020). */
  function softenMaterials(root) {
    root.traverse(function (node) {
      if (!node.isMesh || !node.material) return;
      var mats = Array.isArray(node.material) ? node.material : [node.material];
      mats.forEach(function (mat) {
        if (!mat || !mat.color) return;
        var c = mat.color;
        if (c.r + c.g + c.b < 0.08) {
          c.setRGB(0.141, 0.125, 0.125);
        }
        if (mat.metalness !== undefined && mat.metalness > 0.92) {
          mat.metalness = 0.78;
        }
        if (mat.roughness !== undefined && mat.roughness < 0.12) {
          mat.roughness = 0.22;
        }
      });
    });
  }

  function applyPose(parts, progress, reduced) {
    var pose = progress;
    if (reduced) {
      var last = steps[0];
      for (var i = 0; i < steps.length; i++) {
        if (progress >= steps[i].start) last = steps[i];
      }
      pose = last.end;
    }

    parts.forEach(function (part) {
      var fraction = progressBetween(pose, part.start, part.end);
      var eased = fraction * fraction * (3 - 2 * fraction);
      part.object.visible = pose >= part.start;
      part.object.position.copy(part.rest).addScaledVector(part.offset, 1 - eased);
    });
  }

  function setupViewer(model, canvas, stage, titleClearEl) {
    var renderer = new Fit10Assets.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = Fit10Assets.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;

    var scene = new Fit10Assets.Scene();
    var room = new Fit10Assets.RoomEnvironment();
    var pmrem = new Fit10Assets.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(room, 0.04).texture;
    scene.environmentIntensity = 0.86;
    pmrem.dispose();
    room.dispose();

    softenMaterials(model);
    scene.add(model);
    scene.add(new Fit10Assets.HemisphereLight(0xf8f7ff, 0xc4b7a2, 1.1));
    var key = new Fit10Assets.DirectionalLight(0xfff6e8, 2.2);
    key.position.set(0.8, 1.2, 1.6);
    scene.add(key);

    var parts = bindMovements(model);
    var direction = new Fit10Assets.Vector3(0.74, 0.67, 1.38).normalize();
    var framing = findFraming(parts, direction);
    var camera = new Fit10Assets.OrthographicCamera(-1, 1, 1, -1, 0.01, 12);
    camera.position.copy(framing.target).addScaledVector(direction, 1.5);
    camera.lookAt(framing.target);

    var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    var pendingFrame = null;
    var progress = 0;

    function queueFrame() {
      if (pendingFrame === null) pendingFrame = requestAnimationFrame(renderFrame);
    }

    function resize() {
      var width = stage.clientWidth;
      var height = stage.clientHeight;
      if (!width || !height) return;
      var titleClearance = 0;
      if (titleClearEl) {
        titleClearance = titleClearEl.offsetTop + titleClearEl.offsetHeight;
      }
      var unitsPerPixel = 1.16 * Math.max(
        framing.size.x / width,
        framing.size.y / Math.max(1, height - titleClearance)
      );
      var verticalOffset = titleClearance * unitsPerPixel / 2;
      camera.left = -width * unitsPerPixel / 2;
      camera.right = width * unitsPerPixel / 2;
      camera.top = height * unitsPerPixel / 2 + verticalOffset;
      camera.bottom = -height * unitsPerPixel / 2 + verticalOffset;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      queueFrame();
    }

    function renderFrame() {
      pendingFrame = null;
      applyPose(parts, progress, reducedMotion.matches);
      renderer.render(scene, camera);
    }

    function setProgress(value) {
      progress = Fit10Assets.MathUtils.clamp(value, 0, 1);
      queueFrame();
    }

    if (typeof gsap !== "undefined" && typeof ScrollTrigger !== "undefined") {
      gsap.registerPlugin(ScrollTrigger);
      ScrollTrigger.create({
        trigger: stage.parentElement,
        start: "top top+=72",
        end: "bottom bottom",
        scrub: true,
        onUpdate: function (self) {
          setProgress(self.progress);
        }
      });
    } else {
      window.addEventListener("scroll", function () {
        var sequence = stage.parentElement;
        var scrollDistance = Math.max(1, sequence.clientHeight - stage.clientHeight);
        var top = -sequence.getBoundingClientRect().top;
        setProgress(Fit10Assets.MathUtils.clamp(top / scrollDistance, 0, 1));
      }, { passive: true });
    }

    window.addEventListener("resize", queueFrame);
    window.addEventListener("pageshow", queueFrame);
    reducedMotion.addEventListener("change", queueFrame);
    if (typeof ResizeObserver !== "undefined") {
      new ResizeObserver(resize).observe(stage);
    } else {
      window.addEventListener("resize", resize);
    }

    resize();
    setProgress(0);
    return { setProgress: setProgress, queueFrame: queueFrame };
  }

  function setupStaticAssembled(model, canvas, stage, titleClearEl) {
    /* Modulos / acessorios: modelo montado, sem orbit livre. */
    softenMaterials(model);
    model.traverse(function (node) {
      if (node.isMesh) node.visible = true;
    });

    var renderer = new Fit10Assets.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = Fit10Assets.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    var scene = new Fit10Assets.Scene();
    var room = new Fit10Assets.RoomEnvironment();
    var pmrem = new Fit10Assets.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(room, 0.04).texture;
    scene.environmentIntensity = 0.8;
    pmrem.dispose();
    room.dispose();
    scene.add(model);
    scene.add(new Fit10Assets.HemisphereLight(0xf8f7ff, 0xc4b7a2, 1.0));
    var key = new Fit10Assets.DirectionalLight(0xfff6e8, 1.8);
    key.position.set(0.6, 1.0, 1.4);
    scene.add(key);

    var box = new Fit10Assets.Box3().setFromObject(model, true);
    var size = box.getSize(new Fit10Assets.Vector3());
    var target = box.getCenter(new Fit10Assets.Vector3());
    var direction = new Fit10Assets.Vector3(0.74, 0.67, 1.38).normalize();
    var camera = new Fit10Assets.OrthographicCamera(-1, 1, 1, -1, 0.01, 12);
    camera.position.copy(target).addScaledVector(direction, 1.5);
    camera.lookAt(target);

    function resize() {
      var width = stage.clientWidth;
      var height = stage.clientHeight;
      if (!width || !height) return;
      var titleClearance = titleClearEl ? titleClearEl.offsetTop + titleClearEl.offsetHeight : 0;
      var unitsPerPixel = 1.2 * Math.max(size.x / width, size.y / Math.max(1, height - titleClearance));
      var verticalOffset = titleClearance * unitsPerPixel / 2;
      camera.left = -width * unitsPerPixel / 2;
      camera.right = width * unitsPerPixel / 2;
      camera.top = height * unitsPerPixel / 2 + verticalOffset;
      camera.bottom = -height * unitsPerPixel / 2 + verticalOffset;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      renderer.render(scene, camera);
    }

    if (typeof ResizeObserver !== "undefined") {
      new ResizeObserver(resize).observe(stage);
    }
    window.addEventListener("resize", resize);
    resize();

    if (typeof gsap !== "undefined" && typeof ScrollTrigger !== "undefined") {
      gsap.registerPlugin(ScrollTrigger);
      ScrollTrigger.create({
        trigger: stage.parentElement,
        start: "top bottom",
        end: "bottom top",
        onEnter: resize,
        onEnterBack: resize
      });
    }
  }

  function buildFamily(group, brandName) {
    var wrap = document.createElement("div");
    wrap.className = "fichaTec fichaTec--variants";

    var family = document.createElement("div");
    family.className = "fichaTec__family";
    family.innerHTML =
      '<p class="fichaTec__familyTitle">Ficha tecnica</p>' +
      '<span class="fichaTec__familyBrand">' + brandName + '<span class="fichaTec__dot">.</span></span>';
    wrap.appendChild(family);

    var rows = document.createElement("div");
    rows.className = "fichaTec__rows";

    group.forEach(function (item, index) {
      var vid = "fit10Var_" + item.id + "_" + index;
      var article = document.createElement("article");
      article.className = "fichaTec__row";

      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "fichaTec__rowHead";
      btn.id = vid + "_btn";
      btn.setAttribute("aria-expanded", "false");
      btn.setAttribute("aria-controls", vid + "_panel");
      btn.innerHTML =
        '<span class="fichaTec__rowMedia">' + item.mediaLabel + "</span>" +
        '<span class="fichaTec__rowLabel">' + item.label + "</span>";

      var panel = document.createElement("div");
      panel.className = "fichaTec__rowPanel";
      panel.id = vid + "_panel";
      panel.setAttribute("role", "region");
      panel.setAttribute("aria-labelledby", vid + "_btn");
      panel.hidden = true;

      var inner = document.createElement("div");
      inner.className = "fichaTec__rowPanelInner fichaTec__rowPanelInner--tableOnly";

      var tableWrap = document.createElement("div");
      tableWrap.className = "fichaTec__tableWrap";
      var table = document.createElement("table");
      table.className = "fichaTec__dataTable";
      table.innerHTML =
        "<thead><tr><th>Referencia</th><th>Descricao</th><th>Etapa</th><th>Nota</th></tr></thead>";
      var tbody = document.createElement("tbody");
      item.rows.forEach(function (row) {
        var tr = document.createElement("tr");
        tr.innerHTML =
          "<td>" + row.ref + "</td>" +
          "<td>" + row.descricao + "</td>" +
          "<td>" + row.etapa + "</td>" +
          "<td>" + row.nota + "</td>";
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      tableWrap.appendChild(table);
      inner.appendChild(tableWrap);

      if (item.gerais && item.gerais.length) {
        var notes = document.createElement("p");
        notes.className = "fichaTec__notes";
        notes.textContent = item.gerais.join(" ");
        inner.appendChild(notes);
      }

      panel.appendChild(inner);
      article.appendChild(btn);
      article.appendChild(panel);
      rows.appendChild(article);

      btn.addEventListener("click", function () {
        var open = btn.getAttribute("aria-expanded") === "true";
        var parent = wrap;
        parent.querySelectorAll(".fichaTec__rowHead").forEach(function (other) {
          other.setAttribute("aria-expanded", "false");
        });
        parent.querySelectorAll(".fichaTec__rowPanel").forEach(function (otherPanel) {
          otherPanel.classList.remove("is-open");
          otherPanel.hidden = true;
        });
        if (!open) {
          btn.setAttribute("aria-expanded", "true");
          panel.hidden = false;
          panel.classList.add("is-open");
        }
        if (typeof ScrollTrigger !== "undefined") {
          ScrollTrigger.refresh();
        }
      });
    });

    wrap.appendChild(rows);

    var foot = document.createElement("div");
    foot.className = "fichaTec__sheetFoot";
    foot.innerHTML =
      '<div class="fichaTec__specCol">' +
      '<p class="fichaTec__generalTitle">Observacoes do piloto</p>' +
      '<ul class="fichaTec__generalList">' +
      "<li>Tabelas no estilo ficha tecnica Newline (acordeao).</li>" +
      "<li>Conteudo de modulos e acessorios e estrutural ate o material completo.</li>" +
      "</ul></div>";
    wrap.appendChild(foot);

    return wrap;
  }

  function renderCatalogs() {
    var data = window.Fit10Catalog || {};
    var map = [
      { el: "catalogBases", group: data.bases || [], brand: "Fit10 Bases" },
      { el: "catalogModulos", group: data.modulos || [], brand: "Fit10 Modulos" },
      { el: "catalogAcessorios", group: data.acessorios || [], brand: "Fit10 Acessorios" }
    ];
    map.forEach(function (entry) {
      var host = document.getElementById(entry.el);
      if (!host) return;
      host.appendChild(buildFamily(entry.group, entry.brand));
    });
  }

  function glbUrl() {
    if (location.protocol === "file:" && Fit10Assets.modeloLocal) {
      return Fit10Assets.modeloLocal;
    }
    return new URL(FIT10_ASSETS_BASE + GLB_NAME, document.baseURI).href;
  }

  /* Scroll cue wave: port fiel da Orchestrated (canvas risco + flicks em loop). */
  function initScrollCue() {
    var wrap = document.getElementById("fit10ScrollCue");
    var canvas = document.getElementById("fit10ScrollCueWave");
    var hero = document.querySelector("#fit10Sistema .pdtHero");
    if (!wrap || !canvas || !hero) return;

    var ctx = canvas.getContext("2d");
    if (!ctx) return;

    var CFG = {
      speed: 85,
      damping: 0.8,
      spread: 0.12,
      flickMin: 2.6,
      flickMax: 5,
      flickShort: 0.22,
      flickLong: 0.42,
      intervalMin: 1.5,
      intervalMax: 2.8,
      humps: 0.35,
      lineWidth: 1.2,
      alpha: 0.9,
      trimDistance: 140,
      fadeAt: 1,
      backAt: 8,
      hoverStrength: 0.3,
      hoverMax: 5,
      hoverReach: 40,
      hoverWidth: 14,
      hoverSpring: 220,
      hoverDamping: 8
    };

    function randRange(min, max) {
      return min + Math.random() * (max - min);
    }

    var cssW = 0;
    var cssH = 0;
    var dpr = 1;
    var offsets = new Float32Array(52);
    var history = new Float32Array(960);
    var histWrite = 0;
    var flickTime = 0;
    var nextFlickAt = 0.6;
    var flick = { start: -1, length: 0.3, size: 0, hump: false };
    var reveal = { low: 0, high: 1 };
    var hidden = false;
    var hover = { y: 0, offset: 0, velocity: 0, target: 0 };
    var lastPointerX = null;
    var lastTs = performance.now();
    var rafId = 0;
    var needsDraw = true;
    var reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

    function resizeCanvas() {
      cssW = canvas.clientWidth || 32;
      cssH = canvas.clientHeight || 45;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(cssW * dpr));
      canvas.height = Math.max(1, Math.round(cssH * dpr));
    }

    function flickSample() {
      var e = (flickTime - flick.start) / flick.length;
      if (flick.start < 0 || e >= 1 || e < 0) return 0;
      var envelope = Math.sin(Math.PI * e);
      if (flick.hump) return flick.size * envelope * envelope;
      return flick.size * Math.sin(2 * Math.PI * e) * envelope;
    }

    function historyAt(age) {
      var t = Math.min(histWrite - 1, histWrite - 1 - 240 * age);
      if (t < 0 || t < histWrite - 960 + 1) return 0;
      var i = Math.floor(t);
      var a = history[i % 960];
      var b = history[(i + 1) % 960];
      return a + (b - a) * (t - i);
    }

    function rebuildOffsets() {
      var step = cssH / 51;
      var i;
      for (i = 0; i < 52; i++) {
        var age = (51 - i) * step / CFG.speed;
        var spread = CFG.spread * age;
        var sample;
        if (spread > 1e-4) {
          sample =
            (historyAt(age - spread) +
              2 * historyAt(age - spread / 2) +
              2 * historyAt(age) +
              2 * historyAt(age + spread / 2) +
              historyAt(age + spread)) /
            8;
        } else {
          sample = historyAt(age);
        }
        offsets[i] = sample * Math.exp(-CFG.damping * age);
        if (hover.offset !== 0) {
          var dy = i * step - hover.y;
          var tip = Math.min(1, (51 - i) / 8);
          offsets[i] +=
            hover.offset *
            Math.exp(-(dy * dy) / (2 * CFG.hoverWidth * CFG.hoverWidth)) *
            tip;
        }
      }
    }

    function onPointerMove(ev) {
      var prevX = lastPointerX;
      lastPointerX = ev.clientX;
      if (ev.pointerType !== "mouse" || prevX === null || hidden || reduced.matches) return;
      var rect = canvas.getBoundingClientRect();
      var dist = Math.abs(ev.clientX - (rect.left + rect.width / 2));
      if (dist > CFG.hoverReach || ev.clientY < rect.top - 8 || ev.clientY > rect.bottom) return;
      var strength = 1 - dist / CFG.hoverReach;
      hover.y = ev.clientY - rect.top;
      hover.target = Math.max(
        -CFG.hoverMax,
        Math.min(CFG.hoverMax, hover.target + (ev.clientX - prevX) * CFG.hoverStrength * strength)
      );
    }

    function stepHover(dt) {
      var remain = Math.min(dt, 0.05);
      while (remain > 1e-6) {
        var slice = Math.min(0.004166666666666667, remain);
        hover.target *= Math.exp(-slice / 0.08);
        hover.velocity +=
          (CFG.hoverSpring * (hover.target - hover.offset) - CFG.hoverDamping * hover.velocity) *
          slice;
        hover.offset += hover.velocity * slice;
        remain -= slice;
      }
      if (
        Math.abs(hover.offset) < 0.005 &&
        Math.abs(hover.velocity) < 0.05 &&
        Math.abs(hover.target) < 0.005
      ) {
        hover.offset = 0;
        hover.velocity = 0;
        hover.target = 0;
      }
    }

    function stepWave(dt) {
      var remain = Math.min(dt, 0.05);
      while (remain > 1e-6) {
        var slice = Math.min(0.004166666666666667, remain);
        flickTime += slice;
        if (flickTime >= nextFlickAt) {
          flick = {
            start: flickTime,
            length: randRange(CFG.flickShort, CFG.flickLong),
            size: randRange(CFG.flickMin, CFG.flickMax) * (Math.random() < 0.5 ? -1 : 1),
            hump: Math.random() < CFG.humps
          };
          nextFlickAt = flickTime + flick.length + randRange(CFG.intervalMin, CFG.intervalMax);
        }
        history[histWrite % 960] = flickSample();
        histWrite += 1;
        remain -= slice;
      }
      rebuildOffsets();
    }

    function draw() {
      if (!ctx) return;
      var mid = cssW / 2;
      var step = cssH / 51;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);
      var top = cssH * (1 - reveal.high);
      var bottom = cssH * (1 - reveal.low);
      if (bottom - top < 0.25) return;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, top, cssW, bottom - top);
      ctx.clip();
      ctx.globalAlpha = CFG.alpha;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = CFG.lineWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(mid + offsets[0], 0);
      var i;
      for (i = 1; i < 51; i++) {
        var cx = mid + (offsets[i] + offsets[i + 1]) / 2;
        var cy = (i + 0.5) * step;
        ctx.quadraticCurveTo(mid + offsets[i], i * step, cx, cy);
      }
      ctx.lineTo(mid + offsets[51], cssH);
      ctx.stroke();
      ctx.restore();
    }

    function updateVisibility() {
      var heroRect = hero.getBoundingClientRect();
      var scrolled = Math.max(0, -heroRect.top);
      if (hidden) {
        if (scrolled <= CFG.backAt) {
          hidden = false;
          reveal.high = 1;
          wrap.classList.add("is-visible");
          wrap.classList.remove("is-fading");
        }
        return;
      }
      reveal.low = Math.min(1, Math.max(0, scrolled / CFG.trimDistance));
      if (reveal.low >= Math.min(CFG.fadeAt, 0.999)) {
        hidden = true;
        wrap.classList.add("is-fading");
        wrap.classList.remove("is-visible");
      } else {
        wrap.classList.add("is-visible");
        wrap.classList.remove("is-fading");
      }
    }

    function tick(now) {
      rafId = requestAnimationFrame(tick);
      if (document.hidden) return;
      var dt = (now - lastTs) / 1000;
      lastTs = now;
      updateVisibility();
      if (hidden || reveal.high - reveal.low <= 0.001) {
        if (needsDraw) {
          draw();
          needsDraw = false;
        }
        return;
      }
      needsDraw = true;
      if (canvas.clientWidth !== cssW || canvas.clientHeight !== cssH) resizeCanvas();
      if (!reduced.matches) {
        stepHover(dt);
        stepWave(dt);
      } else {
        offsets.fill(0);
      }
      draw();
    }

    resizeCanvas();
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("resize", resizeCanvas);
    wrap.classList.add("is-visible");
    rafId = requestAnimationFrame(tick);

    return function destroy() {
      cancelAnimationFrame(rafId);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("resize", resizeCanvas);
    };
  }

  async function start() {
    initScrollCue();
    renderCatalogs();
    setLoadHint("Carregando modelo 3D...");

    if (typeof Fit10Assets === "undefined") {
      showLoaderError("Biblioteca 3D nao carregou. Confira vendor/three.js.");
      return;
    }

    try {
      var url = glbUrl();
      var loaded = await new Fit10Assets.GLTFLoader().loadAsync(url);
      var model = loaded.scene;
      /* Clonar antes da animacao: GLB ja vem montado (rest). */
      var modelModulos = model.clone(true);
      var modelAcessorios = model.clone(true);

      var modCanvas = document.getElementById("cenaModulos");
      var modStage = document.getElementById("palcoModulos");
      var modOverlay = document.getElementById("overlayModulos");
      if (modCanvas && modStage) {
        setupStaticAssembled(modelModulos, modCanvas, modStage, modOverlay);
      }

      var accCanvas = document.getElementById("cenaAcessorios");
      var accStage = document.getElementById("palcoAcessorios");
      var accOverlay = document.getElementById("overlayAcessorios");
      if (accCanvas && accStage) {
        setupStaticAssembled(modelAcessorios, accCanvas, accStage, accOverlay);
      }

      var basesCanvas = document.getElementById("cenaBases");
      var basesStage = document.getElementById("palcoBases");
      var basesOverlay = document.getElementById("overlayBases");
      if (basesCanvas && basesStage) {
        setupViewer(model, basesCanvas, basesStage, basesOverlay);
      }

      hideLoader();
      if (typeof ScrollTrigger !== "undefined") {
        ScrollTrigger.refresh();
      }
    } catch (error) {
      console.error("Nao foi possivel carregar a composicao 3D.", error);
      showLoaderError("Falha ao carregar o GLB. Sirva a pasta via http.server.");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
