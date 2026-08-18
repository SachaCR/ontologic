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

  var activeKinds = {};   // empty means "everything"
  var railItems = [];     // flat, in display order — the keyboard walks this
  var cursor = -1;

  function anyFilterOn() {
    for (var key in activeKinds) if (activeKinds[key]) return true;
    return false;
  }

  function passesFilter(node) {
    return !anyFilterOn() || activeKinds[node.kind];
  }

  function navlinkHtml(node) {
    var flagged = findingsByNode[node.id] ? " navlink--flagged" : "";

    return '<a class="navlink' + flagged + '" data-kind="' + esc(node.kind) +
      '" data-id="' + esc(node.id) + '" href="' + hrefOf(node) + '">' +
      '<span class="navlink__dot"></span>' +
      '<span class="navlink__text">' + esc(node.name) + "</span></a>";
  }

  function groupHtml(label, nodes, className) {
    var html = '<div class="group ' + (className || "") + '">' +
      '<div class="group__label"><span>' + esc(label) + "</span>" +
      '<span class="group__count">' + nodes.length + "</span></div>";

    nodes.forEach(function (node) {
      railItems.push(node);
      html += navlinkHtml(node);
    });

    return html + "</div>";
  }

  /**
   * The rail is grouped by aggregate rather than by kind, so it reads as the
   * domain rather than as a type index: everything belonging to an aggregate sits
   * under it. Anything not reachable from a root falls into a trailing group.
   */
  function renderRail(filter) {
    var needle = (filter || "").trim().toLowerCase();
    railItems = [];

    var matches = function (node) {
      return passesFilter(node) &&
        (!needle || node.name.toLowerCase().indexOf(needle) !== -1);
    };

    var claimed = {};
    var html = "";

    var roots = (MODEL.aggregateRoots || []).map(function (id) { return byId[id]; })
      .filter(Boolean);

    if (roots.length === 0) roots = nodesOfKind("entity");

    roots.forEach(function (root) {
      var members = [root].concat(descendantsOf(root.id));
      var shown = [];

      members.forEach(function (node) {
        if (claimed[node.id]) return;
        claimed[node.id] = true;
        if (matches(node)) shown.push(node);
      });

      if (shown.length > 0) html += groupHtml(root.name, shown, "group--aggregate");
    });

    var rest = MODEL.nodes.filter(function (n) {
      return !claimed[n.id] && matches(n);
    });

    KINDS.forEach(function (kind) {
      var nodes = rest.filter(function (n) { return n.kind === kind.key; })
        .sort(function (a, b) { return a.name.localeCompare(b.name); });

      if (nodes.length > 0) html += groupHtml(kind.label, nodes);
    });

    if (html === "") {
      html = '<div class="group"><div class="group__label"><span>No matches</span></div></div>';
    }

    document.getElementById("nav").innerHTML = html;
    cursor = -1;
    markCurrent();
  }

  /** Everything reachable from an aggregate by containment, plus what it emits. */
  function descendantsOf(rootId) {
    var seen = {};
    var out = [];
    var queue = [rootId];

    while (queue.length > 0) {
      var id = queue.shift();

      MODEL.edges.forEach(function (edge) {
        if (edge.from !== id) return;
        if (edge.kind !== "contains" && edge.kind !== "emits" &&
            edge.kind !== "protectedBy" && edge.kind !== "canFail") return;
        if (seen[edge.to] || edge.to === rootId) return;

        var node = byId[edge.to];
        if (!node) return;

        seen[edge.to] = true;
        out.push(node);
        queue.push(edge.to);
      });
    }

    var order = { entity: 0, subEntity: 1, valueObject: 2, event: 3, invariant: 4, error: 5 };

    return out.sort(function (a, b) {
      var d = (order[a.kind] === undefined ? 9 : order[a.kind]) -
        (order[b.kind] === undefined ? 9 : order[b.kind]);
      return d !== 0 ? d : a.name.localeCompare(b.name);
    });
  }

  function renderFilters() {
    var html = KINDS.map(function (kind) {
      var on = !!activeKinds[kind.key];
      return '<button class="filter" type="button" data-kind="' + esc(kind.key) +
        '" data-filter="' + esc(kind.key) + '" aria-pressed="' + on + '">' +
        esc(kind.label) + "</button>";
    }).join("");

    document.getElementById("filters").innerHTML = html;
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

  /** Move the keyboard cursor through the visible rail results. */
  function moveCursor(delta) {
    if (railItems.length === 0) return;

    cursor += delta;
    if (cursor < 0) cursor = 0;
    if (cursor >= railItems.length) cursor = railItems.length - 1;

    var links = document.querySelectorAll(".navlink[data-id]");
    for (var i = 0; i < links.length; i++) links[i].classList.remove("is-active");

    var target = links[cursor];
    if (target) {
      target.classList.add("is-active");
      target.scrollIntoView({ block: "nearest" });
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
    return '<div class="crumb"><span class="chip chip--kind" data-kind="' + esc(node.kind) +
      '">' + esc(kindLabel) + "</span></div>" +
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
        var params = (m.parameters || []).map(function (p) {
          return p.name + ": " + p.type;
        }).join(", ");

        return "<tr><td>" +
          '<span class="mono nowrap">' +
          (m.isStatic ? '<span class="faint">static </span>' : "") +
          "<b>" + esc(m.name) + "</b>(" + esc(params) + ")</span>" +
          '<span class="sig">→ ' + esc(m.returnType) + "</span></td>" +
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
    var html = '<div class="crumb"><span class="chip chip--kind" data-kind="invariant">Invariant</span></div>' +
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
    var html = header(node, node.isPort ? "Repository port" : "Repository");

    html += '<div class="section"><h2 class="section__head">Contract</h2>' +
      '<div class="scroll"><table><tbody>' +
      '<tr><td class="faint nowrap">Entity</td><td class="mono">' + esc(node.entityTypeName) + "</td></tr>" +
      '<tr><td class="faint nowrap">Event union</td><td class="mono">' + esc(node.eventUnionTypeName) + "</td></tr>" +
      (node.implementations && node.implementations.length
        ? '<tr><td class="faint nowrap">Implemented by</td><td class="mono">' +
          esc(node.implementations.join(", ")) + "</td></tr>"
        : "") +
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
    var actionLabel = node.actionKind === "unknown" ? "action" : node.actionKind;

    var html = '<div class="crumb"><span class="chip chip--kind" data-kind="useCase">Use case</span>' +
      '<span class="chip">' + esc(actionLabel) + "</span>" +
      (node.actionKind === "unknown"
        ? '<span class="chip chip--warn">action declared outside this codebase</span>'
        : "") + "</div>" +
      '<h1 class="title">' + esc(node.name) + "</h1>" + whereFound(node);

    html += '<div class="section"><h2 class="section__head">Asked to</h2>' +
      '<p class="subtitle">' +
      (node.actionKind === "query"
        ? "A <strong>query</strong>: it reads and writes nothing. The action type says so — " +
          "nobody has to scan the body for a <code>save</code>."
        : node.actionKind === "command"
          ? "A <strong>command</strong>: an intent to change state, which the domain may refuse."
          : "The action type could not be resolved to a <code>Command</code> or a " +
            "<code>Query</code> — it is declared outside the analysed codebase.") +
      '</p><p class="mono">' +
      (node.actionName ? "<strong>" + esc(node.actionName) + "</strong> &middot; " : "") +
      "<code>" + esc(node.actionTypeName) + "</code></p></div>";

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

    var rows = node.dependencies.map(function (p) {
      return '<tr><td class="mono nowrap">' + esc(p.name) + "</td>" +
        '<td class="mono muted">' + esc(p.type) + "</td></tr>";
    }).join("");

    html += '<div class="section"><h2 class="section__head">Dependencies</h2>' +
      '<div class="scroll"><table><thead><tr><th>Constructor parameter</th><th>Type</th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="2" class="dash">No dependencies</td></tr>') +
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
      html += '<div class="tile" data-kind="' + esc(kind.key) + '"><div class="tile__n">' +
        count + "</div>" +
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

  // ---------- explorer ----------

  var KIND_LABEL = {
    entity: "Aggregate",
    subEntity: "Sub-entity",
    valueObject: "Value object",
    event: "Event",
    error: "Error",
    invariant: "Invariant",
    repository: "Repository",
    useCase: "Use case",
    behaviour: "Behaviour"
  };

  function containedOf(id) {
    return MODEL.edges.filter(function (e) { return e.from === id && e.kind === "contains"; });
  }

  function referencesOf(id) {
    return MODEL.edges.filter(function (e) { return e.from === id && e.kind === "references"; });
  }

  /** Behaviours are addressed as '<entityId>::<method>' — they are not model nodes. */
  function behaviourId(node, method) { return node.id + "::" + method.name; }

  function behaviourOf(ref) {
    var parts = ref.split("::");
    var owner = byId[parts[0]];
    if (!owner || !owner.methods) return null;

    for (var i = 0; i < owner.methods.length; i++) {
      if (owner.methods[i].name === parts[1]) {
        return { owner: owner, method: owner.methods[i] };
      }
    }
    return null;
  }

  /** How many blocks the next level would show — drives the count badge. */
  function childCount(node) {
    if (node.kind === "event" || node.kind === "error" || node.kind === "invariant") return 0;

    var behaviours = (node.methods || []).filter(function (m) {
      return m.emits.length > 0 || m.canFail.length > 0;
    });

    return containedOf(node.id).length + behaviours.length;
  }

  function blockHtml(node, extraClass) {
    var count = childCount(node);
    var terminal = count === 0;
    var cls = "block block--" + node.kind + (extraClass ? " " + extraClass : "") +
      (terminal ? " block--terminal" : "");

    var inner =
      '<span class="block__kind">' + esc(KIND_LABEL[node.kind] || node.kind) + "</span>" +
      '<span class="block__name">' + esc(node.name) + "</span>" +
      '<span class="block__meta">' +
      (terminal
        ? '<a class="mono" href="' + hrefOf(node) + '">details →</a>'
        : '<span class="block__count">' + count + "</span> inside") +
      "</span>";

    // Terminal blocks are a div, not an anchor: nothing to drill into.
    return terminal
      ? '<div class="' + cls + '" data-kind="' + esc(node.kind) + '">' + inner + "</div>"
      : '<a class="' + cls + '" data-kind="' + esc(node.kind) + '" href="#/explore/' +
        encodeURIComponent(node.id) + '">' + inner + "</a>";
  }

  function behaviourBlockHtml(node, method) {
    var count = method.emits.length + method.canFail.length;

    return '<a class="block" data-kind="useCase" href="#/explore/' +
      encodeURIComponent(behaviourId(node, method)) + '">' +
      '<span class="block__kind">Behaviour</span>' +
      '<span class="block__name">' + esc(method.name) + "()</span>" +
      '<span class="block__meta"><span class="block__count">' + count +
      "</span> outcome" + (count === 1 ? "" : "s") + "</span></a>";
  }

  /**
   * Group children that came from the same union alias. A tool holds
   * 'WorkflowNodeOutputType' — nine classes — and nine sibling blocks per tool
   * says less than one labelled family does.
   */
  function groupedBlocks(edges) {
    var families = {};
    var loose = [];

    edges.forEach(function (edge) {
      var node = byId[edge.to];
      if (!node) return;

      var family = familyFor(edge.from, node);
      if (family) {
        (families[family] = families[family] || []).push(node);
      } else {
        loose.push(node);
      }
    });

    var html = loose.length
      ? '<div class="blocks">' + loose.map(function (n) { return blockHtml(n); }).join("") + "</div>"
      : "";

    Object.keys(families).forEach(function (name) {
      var members = families[name];
      html += '<div class="family" style="margin-top:10px">' +
        '<div class="family__label">any one of <b>' + esc(name) + "</b> · " +
        members.length + " kinds</div>" +
        '<div class="blocks">' +
        members.map(function (n) { return blockHtml(n); }).join("") +
        "</div></div>";
    });

    return html;
  }

  function familyFor(holderId, target) {
    var holder = byId[holderId];
    if (!holder || !holder.containedRefs) return null;

    for (var i = 0; i < holder.containedRefs.length; i++) {
      var ref = holder.containedRefs[i];
      if (ref.symbol === target.name && ref.family) return ref.family;
    }
    return null;
  }

  function trailHtml(segments) {
    var html = '<nav class="trail" aria-label="Explorer path">';

    segments.forEach(function (segment, index) {
      if (index > 0) html += '<span class="trail__sep">›</span>';

      if (index === segments.length - 1) {
        html += '<span class="trail__here">' + esc(segment.label) + "</span>";
      } else {
        html += '<a href="' + segment.href + '">' + esc(segment.label) + "</a>";
      }
    });

    return html + "</nav>";
  }

  /** The chain from an aggregate root down to 'node', following contains edges. */
  function pathTo(node) {
    var chain = [node];
    var guard = 0;

    while (guard++ < 20) {
      var parent = MODEL.edges.filter(function (e) {
        return e.kind === "contains" && e.to === chain[0].id;
      })[0];

      if (!parent) break;
      var parentNode = byId[parent.from];
      if (!parentNode || chain.indexOf(parentNode) !== -1) break;
      chain.unshift(parentNode);
    }

    return chain;
  }

  function viewExplorer(target) {
    // Level 4: a behaviour, addressed as owner::method.
    if (target && target.indexOf("::") !== -1) {
      var found = behaviourOf(target);
      if (found) return viewBehaviour(found.owner, found.method);
    }

    var node = byId[target];
    if (!node) return viewExplorerRoots();

    var segments = pathTo(node).map(function (n) {
      return { label: n.name, href: "#/explore/" + encodeURIComponent(n.id) };
    });
    segments.unshift({ label: "Aggregates", href: "#/explore" });

    var html = trailHtml(segments) +
      '<div class="crumb"><span class="chip chip--kind" data-kind="' + esc(node.kind) + '">' +
      esc(KIND_LABEL[node.kind] || node.kind) + "</span></div>" +
      '<h1 class="title">' + esc(node.name) + "</h1>" +
      '<p class="subtitle"><a href="' + hrefOf(node) + '">Full detail</a> · <code>' +
      esc(node.location.file) + "</code></p>";

    var contained = containedOf(node.id);
    if (contained.length > 0) {
      html += '<div class="section"><h2 class="section__head">Contains</h2>' +
        groupedBlocks(contained) + "</div>";
    }

    var behaviours = (node.methods || []).filter(function (m) {
      return m.emits.length > 0 || m.canFail.length > 0;
    });

    if (behaviours.length > 0) {
      html += '<div class="section"><h2 class="section__head">Behaviours</h2><div class="blocks">' +
        behaviours.map(function (m) { return behaviourBlockHtml(node, m); }).join("") +
        "</div></div>";
    }

    var references = referencesOf(node.id);
    if (references.length > 0) {
      html += '<div class="section"><h2 class="section__head">References</h2>' +
        '<p class="subtitle">Named by id, not held — following one leaves this aggregate.</p>' +
        '<div class="blocks">' + references.map(function (edge) {
          var to = byId[edge.to];
          if (!to) return "";
          return '<a class="block block--ref" href="#/explore/' + encodeURIComponent(to.id) + '">' +
            '<span class="block__kind">via ' + esc(edge.via) + "</span>" +
            '<span class="block__name">' + esc(to.name) + "</span></a>";
        }).join("") + "</div></div>";
    }

    if (contained.length === 0 && behaviours.length === 0 && references.length === 0) {
      html += '<div class="section"><div class="empty">Nothing below this — see ' +
        '<a href="' + hrefOf(node) + '">its detail page</a> for state and payload.</div></div>';
    }

    return html;
  }

  function viewBehaviour(owner, method) {
    var segments = pathTo(owner).map(function (n) {
      return { label: n.name, href: "#/explore/" + encodeURIComponent(n.id) };
    });
    segments.unshift({ label: "Aggregates", href: "#/explore" });
    segments.push({ label: method.name + "()", href: "#" });

    var html = trailHtml(segments) +
      '<div class="crumb"><span class="chip chip--kind" data-kind="useCase">Behaviour</span></div>' +
      '<h1 class="title">' + esc(owner.name) + "." + esc(method.name) + "()</h1>" +
      '<p class="subtitle">Returns <code>' + esc(method.returnType) + "</code></p>";

    if (method.emits.length > 0) {
      html += '<div class="section"><h2 class="section__head">Produces</h2><div class="blocks">' +
        method.emits.map(function (id) {
          var n = byId[id];
          return n ? blockHtml(n) : "";
        }).join("") + "</div></div>";
    } else {
      html += '<div class="section"><h2 class="section__head">Produces</h2>' +
        '<div class="empty">No event is named in the signature. Some methods return a ' +
        "wrapper carrying the aggregate's event union rather than a specific event, in " +
        "which case what they emit is not determinable from the type alone.</div></div>";
    }

    if (method.canFail.length > 0) {
      html += '<div class="section"><h2 class="section__head">Can fail with</h2><div class="blocks">' +
        method.canFail.map(function (id) {
          var n = byId[id];
          return n ? blockHtml(n) : "";
        }).join("") + "</div></div>";
    }

    return html;
  }

  function viewExplorerRoots() {
    var roots = (MODEL.aggregateRoots || []).map(function (id) { return byId[id]; })
      .filter(Boolean);

    // Fall back to every entity when nothing contains anything — a codebase with
    // no sub-entities has no roots to distinguish.
    if (roots.length === 0) roots = nodesOfKind("entity");

    var html = trailHtml([{ label: "Aggregates", href: "#/explore" }]) +
      '<h1 class="title title--prose">Explorer</h1>' +
      '<p class="subtitle">Start at an aggregate and drill down: what it contains, then its ' +
      "behaviours, then the events and errors each one produces.</p>";

    html += '<div class="section">' +
      (roots.length
        ? '<div class="blocks">' + roots.map(function (n) { return blockHtml(n); }).join("") + "</div>"
        : '<div class="empty">No aggregates found.</div>') +
      "</div>";

    var orphans = nodesOfKind("valueObject").filter(function (vo) {
      return MODEL.edges.filter(function (e) {
        return e.kind === "contains" && e.to === vo.id;
      }).length === 0;
    });

    if (orphans.length > 0) {
      html += '<div class="section"><h2 class="section__head">Unattached value objects</h2>' +
        '<p class="subtitle">Nothing was found holding these. They may be built and used ' +
        "transiently, or held in a way that cannot be seen statically.</p>" +
        '<div class="blocks">' + orphans.map(function (n) { return blockHtml(n); }).join("") +
        "</div></div>";
    }

    return html;
  }

  function legendHtml(entries) {
    return '<div class="legend">' + entries.map(function (entry) {
      return '<span class="legend__item" data-kind="' + esc(entry[0]) + '">' +
        '<span class="legend__swatch"></span>' + esc(entry[1]) + "</span>";
    }).join("") + "</div>";
  }

  // ---------- graph ----------

  var BOX_W = 172, BOX_H = 24;

  // Same three-hue system as the rest of the page: structure, facts, application.
  // Members of a family differ by fill weight, not by hue.
  var GRAPH_FILL = {
    entity: "var(--t-structure-soft)",
    subEntity: "var(--t-structure-soft)",
    valueObject: "var(--surface)",
    event: "var(--t-fact-soft)",
    family: "var(--surface-sunken)"
  };

  var GRAPH_STROKE = {
    entity: "var(--t-structure)",
    subEntity: "var(--t-structure)",
    valueObject: "var(--t-structure)",
    event: "var(--t-fact)",
    family: "var(--line-strong)"
  };

  function truncate(text, max) {
    return text.length > max ? text.slice(0, max - 1) + "…" : text;
  }

  /**
   * Draw a precomputed layout. All the decisions were made at generation time;
   * this only turns coordinates into SVG.
   */
  function graphSvg(layout) {
    var edges = "";
    var boxes = "";

    layout.edges.forEach(function (edge) {
      var a = layout.nodes[edge.from];
      var b = layout.nodes[edge.to];
      if (!a || !b) return;

      var x1 = a.x + BOX_W, y1 = a.y + BOX_H / 2;
      var x2 = b.x, y2 = b.y + BOX_H / 2;
      var mid = (x1 + x2) / 2;

      edges += '<path d="M ' + x1 + " " + y1 + " C " + mid + " " + y1 + ", " +
        mid + " " + y2 + ", " + x2 + " " + y2 +
        '" fill="none" stroke="var(--line-strong)" stroke-width="1"/>';
    });

    layout.nodes.forEach(function (node) {
      var label = node.kind === "family"
        ? truncate(node.label, 18) + " ×" + node.count
        : truncate(node.label, 22);

      var box =
        '<rect x="' + node.x + '" y="' + node.y + '" width="' + BOX_W +
        '" height="' + BOX_H + '" rx="4" fill="' +
        (GRAPH_FILL[node.kind] || "var(--surface)") + '" stroke="' +
        (GRAPH_STROKE[node.kind] || "var(--line-strong)") + '" stroke-width="1"' +
        (node.kind === "family" ? ' stroke-dasharray="3 2"' : "") + "/>" +
        '<text x="' + (node.x + 9) + '" y="' + (node.y + 16) +
        '" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="' +
        (node.kind === "event" ? "10.5" : "11.5") + '" fill="var(--ink)">' +
        esc(label) + "</text>";

      boxes += node.id
        ? '<a href="#/explore/' + encodeURIComponent(node.id) + '">' + box + "</a>"
        : box;
    });

    return '<svg viewBox="0 0 ' + layout.width + " " + layout.height +
      '" width="' + layout.width + '" height="' + layout.height +
      '" role="img" aria-label="Structure of ' + esc(layout.title) + '">' +
      edges + boxes + "</svg>";
  }

  function viewGraph(target) {
    var graphs = MODEL.graphs || [];

    var html = '<h1 class="title title--prose">Graph</h1>' +
      '<p class="subtitle">Each aggregate root with what it holds and the events those ' +
      "produce. Errors are left out — this view is about structure.</p>";

    if (graphs.length === 0) {
      return html + '<div class="empty">No aggregates found.</div>';
    }

    var selected = graphs[0];
    for (var i = 0; i < graphs.length; i++) {
      if (graphs[i].rootId === target) selected = graphs[i];
    }

    if (graphs.length > 1) {
      html += '<div class="flow" style="margin-bottom:16px">' + graphs.map(function (g) {
        return '<a class="flow__item' +
          (g.rootId === selected.rootId ? " flow__item--write" : "") +
          '" href="#/graph/' + encodeURIComponent(g.rootId) + '">' +
          esc(g.title) + "</a>";
      }).join("") + "</div>";
    }

    html += '<div class="scroll" style="padding:6px">' + graphSvg(selected) + "</div>";

    html += '<div class="section"><h2 class="section__head">Legend</h2>' +
      legendHtml([
        ["entity", "aggregate or sub-entity"],
        ["valueObject", "value object"],
        ["event", "event"],
        ["family", "family — any one of N"]
      ]) +
      '<p class="subtitle" style="margin-top:10px">Every box links into the Explorer.</p>' +
      "</div>";

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
    } else if (parts[0] === "explore") {
      html = viewExplorer(decodeURIComponent(parts.slice(1).join("/") || ""));
    } else if (parts[0] === "graph") {
      html = viewGraph(decodeURIComponent(parts.slice(1).join("/") || ""));
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

  var searchBox = document.getElementById("search");

  searchBox.addEventListener("input", function (event) {
    renderRail(event.target.value);
  });

  document.getElementById("filters").addEventListener("click", function (event) {
    var button = event.target.closest("[data-filter]");
    if (!button) return;

    var kind = button.getAttribute("data-filter");
    activeKinds[kind] = !activeKinds[kind];

    renderFilters();
    renderRail(searchBox.value);
  });

  document.addEventListener("keydown", function (event) {
    // "/" focuses the filter box from anywhere, the way search boxes usually do.
    if (event.key === "/" && event.target !== searchBox) {
      event.preventDefault();
      searchBox.focus();
      searchBox.select();
      return;
    }

    if (event.key === "Escape") {
      searchBox.value = "";
      activeKinds = {};
      renderFilters();
      renderRail("");
      searchBox.blur();
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      moveCursor(event.key === "ArrowDown" ? 1 : -1);
      return;
    }

    if (event.key === "Enter" && cursor >= 0 && railItems[cursor]) {
      event.preventDefault();
      location.hash = hrefOf(railItems[cursor]);
    }
  });

  window.addEventListener("hashchange", render);

  renderFilters();
  renderRail("");
  render();
})();
`;
