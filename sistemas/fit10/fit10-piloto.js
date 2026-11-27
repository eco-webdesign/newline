/* Piloto local Fit10. Sem crase / template literal (WAF Interago). */
(function () {
  "use strict";

  /* Base publica: pasta deste script no jsDelivr (eco-webdesign/newline). */
  var FIT10_ASSETS_BASE = (function () {
    var script = document.currentScript;
    if (script && script.src) {
      return script.src.replace(/[^\/]+$/, "");
    }
    return "https://cdn.jsdelivr.net/gh/eco-webdesign/newline@main/sistemas/fit10/";
  })();
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

  async function start() {
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
