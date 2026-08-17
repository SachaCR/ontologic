/**
 * The client-side application, inlined into the generated page as a string.
 *
 * Deliberately vanilla and dependency-free: the page must open from disk with
 * no network, and a framework would add weight for a few hundred nodes of
 * static data. It reads one global, `MODEL`, embedded by the renderer.
 */
export const APP_SCRIPT = String.raw`
(function () {
  "use strict";

  var KINDS = [
    { key: "entity",      label: "Aggregates",    route: "entity" },
    { key: "valueObject", label: "Value objects", route: "value-object" },
    { key: "useCase",     label: "Use cases",     route: "use-case" },
    { key: "event",       label: "Events",        route: "event" },
    { key: "error",       label: "Errors",        route: "error" },
    { key: "invariant",   label: "Invariants",    route: "invariant" },
    { key: "repository",  label: "Repositories",  route: "repository" }
  ];

  var byId = {};
  MODEL.nodes.forEach(function (n) { byId[n.id] = n; });

  var findingsByNode = {};
  MODEL.findings.forEach(function (f) {
    (findingsByNode[f.nodeId] = findingsByNode[f.nodeId] || []).push(f);
  });

  var routeToKind = {};
  KINDS.forEach(function (k) { routeToKind[k.route] = k.key; });

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function nodesOfKind(kind) {
    return MODEL.nodes.filter(function (n) { return n.kind === kind; })
      .sort(function (a, b) { return a.name.localeCompare(b.name); });
  }

  function routeOf(node) {
    for (var i = 0; i < KINDS.length; i++) {
      if (KINDS[i].key === node.kind) return KINDS[i].route;
    }
    return node.kind;
  }

  /** Stable per-node URL. Names can repeat across modules, so ids carry the path. */
  function hrefOf(node) {
    return "#/" + routeOf(node) + "/" + encodeURIComponent(node.id);
  }

  function linkTo(id, fallback) {
    var node = byId[id];
    if (!node) return '<span class="mono faint">' + esc(fallback || id) + "</span>";
    return '<a class="mono" href="' + hrefOf(node) + '">' + esc(node.name) + "</a>";
  }

  function linkList(ids, emptyText) {
    if (!ids || ids.length === 0) return '<span class="dash">' + esc(emptyText || "—") + "</span>";
    return ids.map(function (id) { return linkTo(id); }).join('<span class="faint">, </span>');
  }

  function edgesFrom(id, kind) {
    return MODEL.edges.filter(function (e) { return e.from === id && e.kind === kind; });
  }

  function edgesTo(id, kind) {
    return MODEL.edges.filter(function (e) { return e.to === id && e.kind === kind; });
  }

  // ---------- rail ----------

  function renderRail(filter) {
    var needle = (filter || "").trim().toLowerCase();
    var html = "";

    KINDS.forEach(function (kind) {
      var all = nodesOfKind(kind.key);
      var shown = needle
        ? all.filter(function (n) { return n.name.toLowerCase().indexOf(needle) !== -1; })
        : all;

      if (shown.length === 0) return;

      html += '<div class="group">';
      html += '<div class="group__label"><span>' + esc(kind.label) + "</span>";
      html += '<span class="group__count">' + shown.length + "</span></div>";

      shown.forEach(function (node) {
        var flagged = findingsByNode[node.id] ? " navlink--flagged" : "";
        html += '<a class="navlink' + flagged + '" data-id="' + esc(node.id) + '" href="' +
          hrefOf(node) + '">' + esc(node.name) + "</a>";
      });

      html += "</div>";
    });

    if (html === "") {
      html = '<div class="group"><div class="group__label"><span>No matches</span></div></div>';
    }

    document.getElementById("nav").innerHTML = html;
    markCurrent();
  }

  function markCurrent() {
    var current = decodeURIComponent((location.hash.split("/")[2] || ""));
    var links = document.querySelectorAll(".navlink");

    for (var i = 0; i < links.length; i++) {
      if (links[i].getAttribute("data-id") === current) {
        links[i].setAttribute("aria-current", "page");
      } else {
        links[i].removeAttribute("aria-current");
      }
    }
  }

  // ---------- shared blocks ----------

  function fieldsTable(fields, caption) {
    if (!fields || fields.length === 0) {
      return '<div class="empty">' + esc(caption) + "</div>";
    }

    var rows = fields.map(function (f) {
      return "<tr><td class=\"mono\">" + esc(f.name) + "</td>" +
        '<td class="mono muted">' + esc(f.type) + "</td>" +
        '<td class="nowrap">' + (f.optional ? '<span class="chip">optional</span>' : '<span class="dash">—</span>') + "</td></tr>";
    }).join("");

    return '<div class="scroll"><table><thead><tr><th>Field</th><th>Type</th><th>Required</th></tr></thead><tbody>' +
      rows + "</tbody></table></div>";
  }

  function findingsFor(id) {
    var list = findingsByNode[id];
    if (!list) return "";

    return '<div class="section"><h2 class="section__head">Findings</h2>' +
      list.map(renderFinding).join("") + "</div>";
  }

  function renderFinding(finding) {
    var severe = finding.code === "error-missing-set-prototype" ||
      finding.code === "invariant-never-attached";

    return '<div class="finding' + (severe ? " finding--danger" : "") + '">' +
      '<div class="finding__stripe"></div><div class="finding__body">' +
      '<div class="finding__code">' + esc(finding.code) + "</div>" +
      '<p class="finding__msg">' + esc(finding.message) + "</p>" +
      '<div class="finding__where">' + esc(finding.location.file) + ":" + finding.location.line + "</div>" +
      "</div></div>";
  }

  function whereFound(node) {
    return '<p class="subtitle"><code>' + esc(node.location.file) + ":" + node.location.line + "</code></p>";
  }

  function header(node, kindLabel, prose) {
    return '<div class="crumb"><span class="chip chip--accent">' + esc(kindLabel) + "</span></div>" +
      '<h1 class="title' + (prose ? " title--prose" : "") + '">' + esc(node.name) + "</h1>" +
      whereFound(node);
  }

  // ---------- detail views ----------

  function viewEntity(node) {
    var isVo = node.kind === "valueObject";
    var html = header(node, isVo ? "Value object" : "Aggregate");

    html += '<div class="section"><h2 class="section__head">State — ' +
      '<span class="mono">' + esc(node.stateTypeName) + "</span></h2>" +
      fieldsTable(node.stateFields, "State type could not be resolved.") + "</div>";

    var behaviour = node.methods.filter(function (m) {
      return m.emits.length > 0 || m.canFail.length > 0;
    });

    if (behaviour.length > 0) {
      var rows = behaviour.map(function (m) {
        return "<tr><td class=\"mono nowrap\">" + (m.isStatic ? '<span class="faint">static </span>' : "") +
          esc(m.name) + "()</td>" +
          "<td>" + linkList(m.emits) + "</td>" +
          "<td>" + linkList(m.canFail) + "</td></tr>";
      }).join("");

      html += '<div class="section"><h2 class="section__head">Behaviour</h2>' +
        '<div class="scroll"><table><thead><tr><th>Method</th><th>Emits</th><th>Can fail with</th></tr></thead><tbody>' +
        rows + "</tbody></table></div></div>";
    }

    if (node.invariants.length > 0) {
      html += '<div class="section"><h2 class="section__head">Invariants</h2>' +
        '<div class="flow">' + node.invariants.map(function (id) {
          var inv = byId[id];
          return '<a class="flow__item" href="' + (inv ? hrefOf(inv) : "#") + '">' +
            esc(inv ? inv.description : id) + "</a>";
        }).join("") + "</div></div>";
    }

    var persisted = edgesTo(node.id, "persists");
    if (persisted.length > 0) {
      html += '<div class="section"><h2 class="section__head">Persisted by</h2>' +
        '<p>' + linkList(persisted.map(function (e) { return e.from; })) + "</p></div>";
    }

    return html + findingsFor(node.id);
  }

  function viewEvent(node) {
    var html = header(node, "Domain event");

    html += '<div class="section"><h2 class="section__head">Contract</h2>' +
      '<div class="scroll"><table><tbody>' +
      '<tr><td class="faint nowrap">Wire name</td><td class="mono">' + esc(node.eventName) + "</td></tr>" +
      '<tr><td class="faint nowrap">Version</td><td class="mono">' + esc(node.version) + "</td></tr>" +
      '<tr><td class="faint nowrap">Payload</td><td class="mono">' + esc(node.payloadTypeName) + "</td></tr>" +
      "</tbody></table></div></div>";

    html += '<div class="section"><h2 class="section__head">Payload</h2>' +
      fieldsTable(node.payloadFields, "Payload type could not be resolved.") + "</div>";

    var emitters = edgesTo(node.id, "emits");
    if (emitters.length > 0) {
      html += '<div class="section"><h2 class="section__head">Emitted by</h2><div class="flow">' +
        emitters.map(function (e) {
          var from = byId[e.from];
          return '<a class="flow__item" href="' + (from ? hrefOf(from) : "#") + '">' +
            esc(from ? from.name : e.from) +
            (e.via ? '<span class="faint">.' + esc(e.via) + "()</span>" : "") + "</a>";
        }).join("") + "</div></div>";
    }

    return html + findingsFor(node.id);
  }

  function viewError(node) {
    var html = header(node, "Domain error");

    html += '<div class="section"><h2 class="section__head">Contract</h2>' +
      '<div class="scroll"><table><tbody>' +
      '<tr><td class="faint nowrap">Discriminant</td><td class="mono">' + esc(node.errorName) + "</td></tr>" +
      '<tr><td class="faint nowrap">Context</td><td class="mono">' + esc(node.contextTypeName) + "</td></tr>" +
      '<tr><td class="faint nowrap">instanceof</td><td>' +
      (node.setsPrototype
        ? '<span class="chip chip--accent">works</span>'
        : '<span class="chip chip--danger">broken</span>') +
      "</td></tr></tbody></table></div></div>";

    html += '<div class="section"><h2 class="section__head">Context</h2>' +
      fieldsTable(node.contextFields, "No structured context.") + "</div>";

    var raisers = edgesTo(node.id, "canFail");
    if (raisers.length > 0) {
      html += '<div class="section"><h2 class="section__head">Returned by</h2><div class="flow">' +
        raisers.map(function (e) {
          var from = byId[e.from];
          return '<a class="flow__item" href="' + (from ? hrefOf(from) : "#") + '">' +
            esc(from ? from.name : e.from) +
            (e.via ? '<span class="faint">.' + esc(e.via) + "()</span>" : "") + "</a>";
        }).join("") + "</div></div>";
    }

    return html + findingsFor(node.id);
  }

  function viewInvariant(node) {
    var html = '<div class="crumb"><span class="chip chip--accent">Invariant</span></div>' +
      '<h1 class="title title--prose">' + esc(node.description) + "</h1>" +
      '<p class="subtitle"><code>' + esc(node.name) + "</code> · <code>" +
      esc(node.location.file) + ":" + node.location.line + "</code></p>";

    html += '<div class="section"><h2 class="section__head">Rule</h2><pre>' +
      esc(node.predicate || "(not available)") + "</pre></div>";

    var protects = edgesTo(node.id, "protectedBy");
    html += '<div class="section"><h2 class="section__head">Protects</h2><p>' +
      (protects.length > 0
        ? linkList(protects.map(function (e) { return e.from; }))
        : '<span class="dash">Not attached to any entity — this rule is never enforced.</span>') +
      "</p></div>";

    return html + findingsFor(node.id);
  }

  function viewRepository(node) {
    var html = header(node, "Repository");

    html += '<div class="section"><h2 class="section__head">Contract</h2>' +
      '<div class="scroll"><table><tbody>' +
      '<tr><td class="faint nowrap">Entity</td><td class="mono">' + esc(node.entityTypeName) + "</td></tr>" +
      '<tr><td class="faint nowrap">Event union</td><td class="mono">' + esc(node.eventUnionTypeName) + "</td></tr>" +
      "</tbody></table></div></div>";

    if (node.finders.length > 0) {
      var rows = node.finders.map(function (f) {
        var params = f.parameters.map(function (p) { return p.name + ": " + p.type; }).join(", ");
        return '<tr><td class="mono nowrap">' + esc(f.name) + "(" + esc(params) + ")</td>" +
          '<td class="mono muted">' + esc(f.returnType) + "</td></tr>";
      }).join("");

      html += '<div class="section"><h2 class="section__head">Domain queries</h2>' +
        '<p class="subtitle">Predicates that name a domain concept live here rather than in each use case.</p>' +
        '<div class="scroll"><table><thead><tr><th>Query</th><th>Returns</th></tr></thead><tbody>' +
        rows + "</tbody></table></div></div>";
    }

    var users = MODEL.edges.filter(function (e) {
      return e.to === node.id && (e.kind === "reads" || e.kind === "writes");
    });

    if (users.length > 0) {
      html += '<div class="section"><h2 class="section__head">Used by</h2><div class="flow">' +
        users.map(function (e) {
          var from = byId[e.from];
          return '<a class="flow__item flow__item--' + (e.kind === "writes" ? "write" : "read") +
            '" href="' + (from ? hrefOf(from) : "#") + '">' +
            '<span class="flow__verb">' + esc(e.kind) + "</span>" +
            esc(from ? from.name : e.from) + "</a>";
        }).join("") + "</div></div>";
    }

    return html + findingsFor(node.id);
  }

  function viewUseCase(node) {
    var html = '<div class="crumb"><span class="chip chip--accent">Use case</span>' +
      (node.confidence !== "high"
        ? '<span class="chip chip--warn">' + esc(node.confidence) + " confidence</span>"
        : "") + "</div>" +
      '<h1 class="title">' + esc(node.name) + "</h1>" + whereFound(node);

    var reads = edgesFrom(node.id, "reads");
    var writes = edgesFrom(node.id, "writes");

    if (reads.length > 0 || writes.length > 0) {
      html += '<div class="section"><h2 class="section__head">Aggregates touched</h2>' +
        '<p class="subtitle">A use case should read from as many aggregates as it needs and write to exactly one — ' +
        "<code>saveWithEvents</code> is the only atomic unit.</p><div class=\"flow\">";

      writes.concat(reads).forEach(function (e) {
        var to = byId[e.to];
        html += '<a class="flow__item flow__item--' + (e.kind === "writes" ? "write" : "read") +
          '" href="' + (to ? hrefOf(to) : "#") + '">' +
          '<span class="flow__verb">' + esc(e.kind) + "</span>" +
          esc(to ? to.name : e.to) + "</a>";
      });

      html += "</div></div>";
    }

    var rows = node.parameters.map(function (p) {
      return '<tr><td class="mono nowrap">' + esc(p.name) + "</td>" +
        '<td class="mono muted">' + esc(p.type) + "</td></tr>";
    }).join("");

    html += '<div class="section"><h2 class="section__head">Signature</h2>' +
      '<div class="scroll"><table><thead><tr><th>Parameter</th><th>Type</th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="2" class="dash">No parameters</td></tr>') +
      "</tbody></table></div>" +
      '<p class="subtitle" style="margin-top:10px">Returns <code>' + esc(node.returnType) + "</code></p></div>";

    html += '<div class="section"><h2 class="section__head">Can fail with</h2><p>' +
      linkList(node.canFail, "No domain failures — this use case cannot be refused.") + "</p>";

    if (node.errorUnionErased) {
      html += '<p class="subtitle" style="margin-top:8px">Recovered from the <code>err(new …)</code> ' +
        "call sites: the declared return type erases them to <code>Error</code>.</p>";
    }

    html += "</div>";

    return html + findingsFor(node.id);
  }

  // ---------- overview ----------

  function viewOverview() {
    var html = '<div class="crumb"><span>Domain model</span></div>' +
      '<h1 class="title title--prose">Overview</h1>' +
      '<p class="subtitle">Extracted from <code>' + esc(MODEL.root) + "</code></p>";

    html += '<div class="section"><div class="tiles">';
    KINDS.forEach(function (kind) {
      var count = nodesOfKind(kind.key).length;
      if (count === 0) return;
      html += '<div class="tile"><div class="tile__n">' + count + "</div>" +
        '<div class="tile__k">' + esc(kind.label) + "</div></div>";
    });
    html += "</div></div>";

    if (MODEL.findings.length > 0) {
      html += '<div class="section"><h2 class="section__head">Findings — ' +
        MODEL.findings.length + "</h2>" +
        '<p class="subtitle">Places where the codebase contradicts itself. Each links to the concept it affects.</p>' +
        MODEL.findings.map(renderFinding).join("") + "</div>";
    } else {
      html += '<div class="section"><h2 class="section__head">Findings</h2>' +
        '<div class="empty">No contradictions found.</div></div>';
    }

    if (MODEL.eventUnions.length > 0) {
      html += '<div class="section"><h2 class="section__head">Event unions</h2><div class="scroll"><table><thead>' +
        "<tr><th>Union</th><th>Members</th></tr></thead><tbody>" +
        MODEL.eventUnions.map(function (u) {
          return '<tr><td class="mono nowrap">' + esc(u.name) + "</td>" +
            '<td class="mono muted">' + esc(u.memberNames.join(" | ")) + "</td></tr>";
        }).join("") + "</tbody></table></div></div>";
    }

    return html;
  }

  // ---------- routing ----------

  var VIEWS = {
    entity: viewEntity,
    valueObject: viewEntity,
    event: viewEvent,
    error: viewError,
    invariant: viewInvariant,
    repository: viewRepository,
    useCase: viewUseCase
  };

  function render() {
    var parts = location.hash.replace(/^#\/?/, "").split("/");
    var main = document.getElementById("main");
    var html;

    if (!parts[0]) {
      html = viewOverview();
    } else {
      var node = byId[decodeURIComponent(parts[1] || "")];
      var kind = routeToKind[parts[0]];

      if (node && VIEWS[node.kind]) {
        html = VIEWS[node.kind](node);
      } else {
        html = '<h1 class="title title--prose">Not found</h1>' +
          '<p class="subtitle">No ' + esc(kind || parts[0]) +
          ' matches this address. <a href="#/">Back to the overview</a>.</p>';
      }
    }

    main.innerHTML = html;
    main.scrollTop = 0;
    window.scrollTo(0, 0);
    markCurrent();
  }

  document.getElementById("search").addEventListener("input", function (event) {
    renderRail(event.target.value);
  });

  window.addEventListener("hashchange", render);

  renderRail("");
  render();
})();
`;
