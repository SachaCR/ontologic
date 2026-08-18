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
      '<h1 class="title">' + esc(node.description) + "</h1>" +
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

  /** Screen 5 — every command and query in the model. */
  function viewUseCases() {
    var all = nodesOfKind("useCase");
    var commands = all.filter(function (n) { return n.actionKind !== "query"; });
    var queries = all.filter(function (n) { return n.actionKind === "query"; });

    var html = trailHtml([{ label: "Use Cases", href: "#/use-cases" }]) +
      '<h1 class="title">Use Cases</h1>' +
      '<p class="subtitle">All commands and queries in your domain. Click to see what each ' +
      "use case touches.</p>" +
      legendHtml([
        ["command", "Command"],
        ["query", "Query"],
        ["entity", "Aggregate"],
        ["event", "Event"],
        ["error", "Error"]
      ]);

    if (all.length === 0) {
      return html + '<div class="empty">No use cases found. A use case declares itself with ' +
        "<code>implements UseCase&lt;Action, Output, Errors&gt;</code>; without that marker its " +
        "action cannot be determined. See the Overview for anything flagged as unmarked.</div>";
    }

    if (commands.length) {
      html += '<div class="section"><h2 class="section__head">Commands</h2>' +
        '<div class="cards cards--wide">' +
        commands.map(useCaseCard).join("") + "</div></div>";
    }

    if (queries.length) {
      html += '<div class="section"><h2 class="section__head">Queries</h2>' +
        '<div class="cards cards--wide">' +
        queries.map(useCaseCard).join("") + "</div></div>";
    }

    return html;
  }

  /** The aggregates a use case touches, as the design's outlined tags. */
  function touchTags(node) {
    var seen = {};
    var tags = [];

    edgesFrom(node.id, "writes").concat(edgesFrom(node.id, "reads")).forEach(function (edge) {
      aggregatesBehind(edge.to).forEach(function (entity) {
        if (seen[entity.id]) return;
        seen[entity.id] = true;
        tags.push('<span class="tag">' + esc(entity.name) + "</span>");
      });
    });

    return tags.join("");
  }

  /**
   * A use case names repositories, not aggregates. The design shows aggregates,
   * so follow the port to what it persists.
   */
  function aggregatesBehind(repositoryId) {
    return edgesFrom(repositoryId, "persists")
      .map(function (edge) { return byId[edge.to]; })
      .filter(Boolean);
  }

  function useCaseCard(node) {
    return cardHtml({
      kind: kindAttr(node),
      name: node.name,
      badge: badgeOf(node),
      desc: node.description || "",
      tags: touchTags(node),
      href: hrefOf(node)
    });
  }

  /** Screen 6 — one use case in full. */
  function viewUseCase(node) {
    var isQuery = node.actionKind === "query";

    var html = trailHtml([
      { label: "Use Cases", href: "#/use-cases" },
      { label: node.name, href: "#" }
    ]) +
      '<div class="crumb"><span class="badge" data-kind="' + esc(kindAttr(node)) + '">' +
      esc(badgeOf(node)) + "</span>" +
      (node.actionKind === "unknown"
        ? '<span class="chip chip--warn">action declared outside this codebase</span>'
        : "") + "</div>" +
      '<h1 class="title">' + esc(node.name) + "</h1>" +
      '<p class="subtitle">' + esc(node.description ||
        (isQuery
          ? "A query: it reads and writes nothing."
          : "A command: an intent to change state, which the domain may refuse.")) +
      "</p>";

    // The action, as the shape a caller has to supply.
    html += '<div class="section"><h2 class="section__head">' +
      (isQuery ? "Query input" : "Command input") + "</h2><pre>" +
      '<span class="k">' + esc(node.actionTypeName) + "</span> {" +
      (node.actionFields.length
        ? node.actionFields.map(function (f) {
            return "\n  " + esc(f.name) + (f.optional ? "?" : "") +
              ': <span class="t">' + esc(f.type) + "</span>";
          }).join(",") + "\n"
        : "") +
      "}</pre>" +
      (node.actionName
        ? '<p class="subtitle" style="margin-top:10px">Dispatched as <code>' +
          esc(node.actionName) + "</code></p>"
        : "") +
      "</div>";

    var writes = edgesFrom(node.id, "writes");
    var reads = edgesFrom(node.id, "reads");

    // An aggregate that is both read and written appears once, as written —
    // several use cases load through the same repository they save to.
    var touched = [];
    var touchedBy = {};

    writes.concat(reads).forEach(function (edge) {
      aggregatesBehind(edge.to).forEach(function (entity) {
        if (touchedBy[entity.id]) return;
        touchedBy[entity.id] = true;
        touched.push({
          entity: entity,
          kind: edge.kind,
          via: byId[edge.to] ? byId[edge.to].name : "a repository"
        });
      });
    });

    if (touched.length > 0) {
      html += '<div class="section"><h2 class="section__head">Aggregates &amp; entities involved</h2>' +
        '<p class="subtitle">A use case reads from as many aggregates as it needs and writes to ' +
        "exactly one \u2014 <code>saveWithEvents</code> is the only atomic unit.</p>" +
        '<div class="cards">';

      touched.forEach(function (t) {
        html += cardHtml({
          kind: kindAttr(t.entity),
          name: t.entity.name,
          mono: true,
          badge: badgeOf(t.entity),
          desc: (t.kind === "writes" ? "Written through " : "Read through ") + t.via + ".",
          href: "#/domain/" + encodeURIComponent(t.entity.id)
        });
      });

      html += "</div></div>";
    }

    // Events are the aggregate's, not this use case's — the extractor does not
    // correlate a use-case body with the entity methods it calls.
    var events = {};
    writes.forEach(function (edge) {
      aggregatesBehind(edge.to).forEach(function (entity) {
        edgesFrom(entity.id, "emits").forEach(function (e) { events[e.to] = true; });
        containedTree(entity.id).forEach(function (child) {
          edgesFrom(child.id, "emits").forEach(function (e) { events[e.to] = true; });
        });
      });
    });

    var eventIds = Object.keys(events);
    if (eventIds.length > 0) {
      html += '<div class="section"><h2 class="section__head">Events its aggregate can emit</h2>' +
        '<p class="subtitle">Every event the written aggregate declares \u2014 not only the ones ' +
        "this use case causes. Which of them a given call produces is not determinable from " +
        "the types alone.</p><div class=\"cards\">" +
        eventIds.map(function (id) {
          var n = byId[id];
          return n ? detailCard(n) : "";
        }).join("") + "</div></div>";
    }

    html += '<div class="section"><h2 class="section__head">Errors raised</h2>';
    html += node.canFail.length
      ? '<div class="cards">' + node.canFail.map(function (id) {
          var n = byId[id];
          return n ? detailCard(n) : "";
        }).join("") + "</div>"
      : '<div class="empty">No domain failures \u2014 this use case cannot be refused.</div>';

    if (node.errorUnionErased) {
      html += '<p class="subtitle" style="margin-top:10px">Recovered from the ' +
        "<code>err(new \u2026)</code> call sites: the declared return type erases them to " +
        "<code>Error</code>.</p>";
    }
    html += "</div>";

    // The flow strip: command, then each aggregate, then what comes out.
    html += '<div class="section"><h2 class="section__head">Flow</h2><div class="flow">' +
      '<span class="flow__item" data-kind="' + esc(kindAttr(node)) + '">' +
      esc(node.actionName || node.actionTypeName) + "</span>";

    touched.forEach(function (t) {
      html += '<span class="flow__arrow">&#8594;</span>' +
        '<a class="flow__item' + (t.kind === "reads" ? " flow__item--read" : "") +
        '" data-kind="' + esc(kindAttr(t.entity)) + '" href="#/domain/' +
        encodeURIComponent(t.entity.id) + '">' +
        '<span class="flow__verb">' + esc(t.kind) + "</span>" + esc(t.entity.name) + "</a>";
    });

    if (node.returnsStateTypeName) {
      html += '<span class="flow__arrow">&#8594;</span>' +
        '<span class="flow__item" data-kind="event">' + esc(node.returnsStateTypeName) + "</span>";
    }

    html += "</div></div>";

    var rows = node.dependencies.map(function (dep) {
      return '<tr><td class="mono nowrap">' + esc(dep.name) + "</td>" +
        '<td class="mono muted">' + esc(dep.type) + "</td></tr>";
    }).join("");

    html += '<div class="section"><h2 class="section__head">Dependencies</h2>' +
      '<div class="scroll"><table><thead><tr><th>Constructor parameter</th><th>Type</th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="2" class="dash">No dependencies</td></tr>') +
      "</tbody></table></div>" +
      '<p class="subtitle" style="margin-top:10px">Returns <code>' +
      esc(node.returnType) + "</code></p></div>";

    return html + findingsFor(node.id);
  }

  // ---------- overview ----------

  function viewOverview() {
    var html = '<div class="crumb"><span>Domain model</span></div>' +
      '<h1 class="title">Overview</h1>' +
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

  /** Short badge, the way the design labels a card. */
  var KIND_BADGE = {
    entity: "AGG",
    subEntity: "ENT",
    valueObject: "VO",
    event: "EVENT",
    error: "ERROR",
    invariant: "INV",
    repository: "REPO",
    behaviour: "FN"
  };

  /**
   * The colour channel for a node. Use cases split by what they are asked to do,
   * so a command and a query never share a colour.
   */
  function kindAttr(node) {
    if (node.kind === "useCase") {
      return node.actionKind === "query" ? "query" : "command";
    }
    return node.kind;
  }

  function badgeOf(node) {
    if (node.kind === "useCase") {
      return node.actionKind === "query" ? "QRY" : "CMD";
    }
    return KIND_BADGE[node.kind] || "";
  }

  /**
   * One card. Every grid on the page is built from this.
   *
   * The description slot collapses when the codebase has no doc comment, which
   * is the common case rather than the exception — the name, badge and stats row
   * have to carry the card on their own.
   */
  function cardHtml(o) {
    var cls = "card" +
      (o.tinted ? " card--tinted" : "") +
      (o.extra ? " " + o.extra : "");

    var inner =
      '<div class="card__top">' +
      '<span class="card__name' + (o.mono ? " card__name--mono" : "") + '">' +
      esc(o.name) + "</span>" +
      (o.badge ? '<span class="badge">' + esc(o.badge) + "</span>" : "") +
      (o.href ? '<span class="card__go">Explore &#8594;</span>' : "") +
      "</div>" +
      (o.desc ? '<p class="card__desc">' + esc(o.desc) + "</p>" : "") +
      (o.tags ? '<div class="tags">' + o.tags + "</div>" : "") +
      (o.stats && o.stats.length
        ? '<div class="card__stats"><span class="card__stat">' +
          esc(o.stats.join(" \u00b7 ")) + "</span></div>"
        : "");

    return o.href
      ? '<a class="' + cls + '" data-kind="' + esc(o.kind) + '" href="' + o.href + '">' +
        inner + "</a>"
      : '<div class="' + cls + '" data-kind="' + esc(o.kind) + '">' + inner + "</div>";
  }

  function containedOf(id) {
    return MODEL.edges.filter(function (e) { return e.from === id && e.kind === "contains"; });
  }

  /** Everything an aggregate holds, transitively. */
  function containedTree(id, seen) {
    seen = seen || {};
    var out = [];

    containedOf(id).forEach(function (edge) {
      if (seen[edge.to]) return;
      seen[edge.to] = true;

      var node = byId[edge.to];
      if (!node) return;

      out.push(node);
      out = out.concat(containedTree(node.id, seen));
    });

    return out;
  }

  /** "6 behaviours · 4 events · 3 errors", counted across the whole aggregate. */
  function statsOf(node) {
    var all = [node].concat(containedTree(node.id));
    var behaviours = 0;
    var events = {};
    var errors = {};

    all.forEach(function (n) {
      (n.methods || []).forEach(function (m) {
        if (m.emits.length > 0 || m.canFail.length > 0) behaviours++;
        m.emits.forEach(function (id) { events[id] = true; });
        m.canFail.forEach(function (id) { errors[id] = true; });
      });
    });

    var eventCount = Object.keys(events).length;
    var errorCount = Object.keys(errors).length;
    var parts = [];

    if (behaviours) parts.push(behaviours + " behaviour" + (behaviours === 1 ? "" : "s"));
    if (eventCount) parts.push(eventCount + " event" + (eventCount === 1 ? "" : "s"));
    if (errorCount) parts.push(errorCount + " error" + (errorCount === 1 ? "" : "s"));

    return parts;
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
    var terminal = childCount(node) === 0;

    return cardHtml({
      kind: kindAttr(node),
      name: node.name,
      mono: true,
      badge: badgeOf(node),
      desc: node.description || "",
      stats: statsOf(node),
      tinted: true,
      extra: extraClass,
      // Terminal cards link to the detail page; the rest drill down.
      href: terminal
        ? hrefOf(node)
        : "#/domain/" + encodeURIComponent(node.id)
    });
  }

  function behaviourBlockHtml(node, method) {
    var stats = [];
    if (method.emits.length) {
      stats.push(method.emits.length + " event" + (method.emits.length === 1 ? "" : "s"));
    }
    if (method.canFail.length) {
      stats.push(method.canFail.length + " error" + (method.canFail.length === 1 ? "" : "s"));
    }

    return cardHtml({
      kind: "behaviour",
      name: method.name + "()",
      mono: true,
      desc: method.description || "",
      stats: stats,
      tinted: true,
      href: "#/domain/" + encodeURIComponent(behaviourId(node, method))
    });
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
      ? '<div class="cards">' + loose.map(function (n) { return blockHtml(n); }).join("") + "</div>"
      : "";

    Object.keys(families).forEach(function (name) {
      var members = families[name];
      html += '<div class="family" style="margin-top:12px">' +
        '<div class="family__label">any one of <b>' + esc(name) + "</b> \u00b7 " +
        members.length + " kinds</div>" +
        '<div class="cards">' +
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
    if (!node) return viewDomainRoots();

    var segments = pathTo(node).map(function (n) {
      return { label: n.name, href: "#/domain/" + encodeURIComponent(n.id) };
    });
    segments.unshift({ label: "Domain Model", href: "#/domain" });

    var body = trailHtml(segments) +
      '<h1 class="title">' + esc(node.name) + " " +
      esc(KIND_LABEL[node.kind] || node.kind) + "</h1>" +
      '<p class="subtitle">' + esc(node.description ||
        "Behaviours, entities and value objects inside " + node.name + ".") + "</p>" +
      legendHtml(DOMAIN_LEGEND);

    var behaviours = (node.methods || []).filter(function (m) {
      return m.emits.length > 0 || m.canFail.length > 0;
    });

    if (behaviours.length > 0) {
      body += '<div class="section"><h2 class="section__head">Behaviours</h2>' +
        '<div class="cards">' +
        behaviours.map(function (m) { return behaviourBlockHtml(node, m); }).join("") +
        "</div></div>";
    }

    // The design separates what an aggregate holds by kind rather than listing
    // it as one mixed grid.
    var contained = containedOf(node.id);
    var entityEdges = contained.filter(function (e) {
      var to = byId[e.to];
      return to && to.kind !== "valueObject";
    });
    var valueEdges = contained.filter(function (e) {
      var to = byId[e.to];
      return to && to.kind === "valueObject";
    });

    if (entityEdges.length > 0) {
      body += '<div class="section"><h2 class="section__head">Entities</h2>' +
        groupedBlocks(entityEdges) + "</div>";
    }

    if (valueEdges.length > 0) {
      body += '<div class="section"><h2 class="section__head">Value objects (immutable)</h2>' +
        groupedBlocks(valueEdges) + "</div>";
    }

    var references = referencesOf(node.id);
    if (references.length > 0) {
      body += '<div class="section"><h2 class="section__head">References</h2>' +
        '<p class="subtitle">Named by id, not held \u2014 following one leaves this aggregate.</p>' +
        '<div class="cards">' + references.map(function (edge) {
          var to = byId[edge.to];
          if (!to) return "";
          return cardHtml({
            kind: kindAttr(to),
            name: to.name,
            mono: true,
            badge: badgeOf(to),
            desc: "Referenced by id via " + edge.via + ".",
            href: "#/domain/" + encodeURIComponent(to.id)
          });
        }).join("") + "</div></div>";
    }

    if (contained.length === 0 && behaviours.length === 0 && references.length === 0) {
      body += '<div class="section"><div class="empty">Nothing below this \u2014 see ' +
        '<a href="' + hrefOf(node) + '">its detail page</a> for state and payload.</div></div>';
    }

    // Screen 3: the fields inspector, for anything that carries state.
    var fields = node.stateFields || [];
    if (fields.length === 0) return body;

    return '<div class="main--split"><div class="main__body">' + body + "</div>" +
      inspectorHtml({
        name: node.name,
        kind: kindAttr(node),
        badge: badgeOf(node),
        desc: node.description || "",
        label: "Fields &amp; metadata",
        fields: fields.map(function (f) {
          return {
            name: f.name,
            type: f.type,
            note: f.optional ? "Optional" : ""
          };
        })
      }) + "</div>";
  }

  /** The right-hand detail panel from screens 3 and 4. */
  function inspectorHtml(o) {
    var html = '<aside class="inspector" data-kind="' + esc(o.kind) + '">' +
      '<div class="inspector__top">' +
      '<span class="inspector__name">' + esc(o.name) + "</span>" +
      (o.badge ? '<span class="badge badge--soft">' + esc(o.badge) + "</span>" : "") +
      "</div>";

    if (o.desc) html += '<p class="card__desc">' + esc(o.desc) + "</p>";

    html += '<div class="inspector__label">' + o.label + "</div>";

    html += o.fields.length
      ? o.fields.map(function (f) {
          return '<div class="field"><div class="field__top">' +
            '<span class="field__name">' + esc(f.name) + "</span>" +
            '<span class="field__type">' + esc(f.type) + "</span></div>" +
            (f.note ? '<p class="field__note">' + esc(f.note) + "</p>" : "") +
            "</div>";
        }).join("")
      : '<div class="empty">None declared.</div>';

    return html + "</aside>";
  }

  /** Screen 4 — the events and errors one behaviour produces. */
  function viewBehaviour(owner, method) {
    var segments = pathTo(owner).map(function (n) {
      return { label: n.name, href: "#/domain/" + encodeURIComponent(n.id) };
    });
    segments.unshift({ label: "Domain Model", href: "#/domain" });
    segments.push({ label: method.name + "()", href: "#" });

    var body = trailHtml(segments) +
      '<h1 class="title title--mono">' + esc(method.name) + "() \u2014 Events &amp; Errors</h1>" +
      '<p class="subtitle">' + esc(method.description ||
        "Domain events published and errors raised by this behaviour.") + "</p>" +
      legendHtml([["event", "Domain event"], ["error", "Error"]]);

    body += '<div class="section"><h2 class="section__head">Events emitted</h2>';
    body += method.emits.length
      ? '<div class="cards cards--one">' + method.emits.map(function (id) {
          var n = byId[id];
          return n ? detailCard(n) : "";
        }).join("") + "</div>"
      : '<div class="empty">No event is named in the signature. Some methods return a ' +
        "wrapper carrying the aggregate's event union rather than a specific event, in " +
        "which case what they emit is not determinable from the type alone.</div>";
    body += "</div>";

    if (method.canFail.length > 0) {
      body += '<div class="section"><h2 class="section__head">Errors raised</h2>' +
        '<div class="cards cards--one">' + method.canFail.map(function (id) {
          var n = byId[id];
          return n ? detailCard(n) : "";
        }).join("") + "</div></div>";
    }

    body += '<div class="section"><h2 class="section__head">Behaviour signature</h2>' +
      "<pre>" + signatureHtml(method) + "</pre></div>";

    return '<div class="main--split"><div class="main__body">' + body + "</div>" +
      inspectorHtml({
        name: method.name + "()",
        kind: "behaviour",
        badge: "FN",
        desc: method.description || "",
        label: "Parameters",
        fields: method.parameters.map(function (param) {
          return { name: param.name, type: param.type, note: "" };
        }).concat([{ name: "returns", type: method.returnType, note: "Return type" }])
      }) + "</div>";
  }

  /** A card for an event or error, where the payload matters more than a count. */
  function detailCard(node) {
    return cardHtml({
      kind: kindAttr(node),
      name: node.name,
      mono: true,
      badge: badgeOf(node),
      desc: node.description || "",
      tinted: true,
      href: hrefOf(node)
    });
  }

  /** name(param: Type, ...): Return, lightly coloured. */
  function signatureHtml(method) {
    var params = method.parameters.map(function (param) {
      return '<span class="p">' + esc(param.name) + '</span>: <span class="t">' +
        esc(param.type) + "</span>";
    }).join(", ");

    return '<span class="k">' + esc(method.name) + "</span>(" + params +
      '): <span class="t">' + esc(method.returnType) + "</span>";
  }

  /** The legend bar the design puts under every Domain Model header. */
  var DOMAIN_LEGEND = [
    ["entity", "Aggregate"],
    ["subEntity", "Entity"],
    ["valueObject", "Value object"],
    ["behaviour", "Behaviour"],
    ["event", "Event"],
    ["error", "Error"],
    ["invariant", "Invariant"],
    ["repository", "Repository"]
  ];

  /** Screen 1 — every aggregate and root entity in the model. */
  function viewDomainRoots() {
    var roots = (MODEL.aggregateRoots || []).map(function (id) { return byId[id]; })
      .filter(Boolean);

    // Fall back to every entity when nothing contains anything — a codebase with
    // no sub-entities has no roots to distinguish.
    if (roots.length === 0) roots = nodesOfKind("entity");

    var html = trailHtml([{ label: "Domain Model", href: "#/domain" }]) +
      '<h1 class="title">Aggregates &amp; Entities</h1>' +
      '<p class="subtitle">All aggregates and root entities in your domain model. ' +
      "Click to explore behaviours, events, and errors.</p>" +
      legendHtml(DOMAIN_LEGEND);

    html += '<div class="section">' +
      (roots.length
        ? '<div class="cards">' + roots.map(function (n) { return blockHtml(n); }).join("") + "</div>"
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
        '<div class="cards">' + orphans.map(function (n) { return blockHtml(n); }).join("") +
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

  // The same concept colours as the cards. Kept as a second mapping because SVG
  // attributes cannot read the [data-kind] custom properties.
  var GRAPH_FILL = {
    entity: "var(--c-aggregate-soft)",
    subEntity: "var(--c-entity-soft)",
    valueObject: "var(--c-value-soft)",
    event: "var(--c-event-soft)",
    family: "var(--surface-sunken)"
  };

  var GRAPH_STROKE = {
    entity: "var(--c-aggregate)",
    subEntity: "var(--c-entity)",
    valueObject: "var(--c-value)",
    event: "var(--c-event)",
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

    var html = '<h1 class="title">Graph</h1>' +
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
    } else if (parts[0] === "domain" || parts[0] === "explore") {
      // "explore" is the pre-redesign address, kept so saved links still work.
      html = viewExplorer(decodeURIComponent(parts.slice(1).join("/") || ""));
    } else if (parts[0] === "use-cases") {
      var useCaseId = decodeURIComponent(parts.slice(1).join("/") || "");
      html = byId[useCaseId] ? viewUseCase(byId[useCaseId]) : viewUseCases();
    } else if (parts[0] === "graph") {
      html = viewGraph(decodeURIComponent(parts.slice(1).join("/") || ""));
    } else {
      var node = byId[decodeURIComponent(parts[1] || "")];
      var kind = routeToKind[parts[0]];

      if (node && VIEWS[node.kind]) {
        html = VIEWS[node.kind](node);
      } else {
        html = '<h1 class="title">Not found</h1>' +
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
