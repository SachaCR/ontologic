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
    { key: "entity",      label: "Aggregates & entities", route: "entity" },
    { key: "valueObject", label: "Value objects", route: "value-object" },
    { key: "useCase",     label: "Use cases",     route: "use-case" },
    { key: "event",       label: "Events",        route: "event" },
    { key: "error",       label: "Errors",        route: "error" },
    { key: "invariant",   label: "Invariants",    route: "invariant" },
    { key: "repository",  label: "Repositories",  route: "repository" },
    { key: "readModel",   label: "Read models",   route: "read-model" }
  ];

  var byId = {};
  MODEL.nodes.forEach(function (n) { byId[n.id] = n; });

  /**
   * Whether a use-case board shows the views built from its events. Kept in
   * module scope rather than storage, like the kind filters: it should outlive
   * navigation, and there is nothing to gain from outliving a reload.
   */
  var showConsumers = true;

  var findingsByNode = {};
  MODEL.findings.forEach(function (f) {
    (findingsByNode[f.nodeId] = findingsByNode[f.nodeId] || []).push(f);
  });

  var routeToKind = {};
  KINDS.forEach(function (k) { routeToKind[k.route] = k.key; });

  /**
   * Aggregate roots, as a lookup.
   *
   * "entity" in the model means "extends DomainEntity", which is not the same
   * question as "is an aggregate root": an entity held by another entity is
   * contained, and must not wear the same badge or colour as the root that
   * holds it.
   */
  var rootIds = {};
  (function () {
    var declared = (MODEL.aggregateRoots || []).filter(function (id) { return byId[id]; });

    // Nothing contains anything: there is no hierarchy to distinguish, so every
    // entity stands on its own. The rail and the graph layout assume the same.
    if (declared.length === 0) {
      MODEL.nodes.forEach(function (n) { if (n.kind === "entity") rootIds[n.id] = true; });
      return;
    }

    declared.forEach(function (id) { rootIds[id] = true; });
  })();

  /**
   * Top level: nothing holds this. Structural only — it says where a thing sits,
   * not what it is called. The rail groups by it, the diagrams are keyed by it,
   * and every breadcrumb starts at one.
   */
  function isRoot(node) {
    return node.kind === "entity" && rootIds[node.id] === true;
  }

  /**
   * An aggregate is an entity that actually aggregates: a top-level one holding
   * at least one entity or value object of its own.
   *
   * A top-level entity holding nothing is just an entity. It is still a root —
   * it still anchors a diagram and a rail group — but calling it an aggregate
   * claims a structure it does not have.
   */
  function isAggregate(node) {
    return isRoot(node) && containedOf(node.id).length > 0;
  }

  function sortByName(nodes) {
    return nodes.sort(function (a, b) { return a.name.localeCompare(b.name); });
  }

  function rootNodes() {
    return sortByName(MODEL.nodes.filter(isRoot));
  }

  function aggregateNodes() {
    return sortByName(MODEL.nodes.filter(isAggregate));
  }

  /** Everything with identity that is not an aggregate. */
  function plainEntities() {
    return sortByName(MODEL.nodes.filter(function (n) {
      return n.kind === "subEntity" || (n.kind === "entity" && !isAggregate(n));
    }));
  }

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
    // Anything with state and identity is one object with one page, whatever
    // route it came in on. "domain" is that page.
    if (node.kind === "entity" || node.kind === "subEntity" ||
        node.kind === "valueObject") {
      return "domain";
    }

    // The router branch is plural; KINDS says "use-case". Both resolve, which is
    // exactly the kind of accident this function now exists to prevent.
    if (node.kind === "useCase") return "use-cases";

    for (var i = 0; i < KINDS.length; i++) {
      if (KINDS[i].key === node.kind) return KINDS[i].route;
    }

    return node.kind;
  }

  /**
   * The address of a node. The only one — every link to an object goes through
   * here, so clicking the same thing in the rail, in a list, on the board or in
   * the diagram lands on the same page.
   */
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

    return '<a class="navlink' + flagged + '" data-kind="' + esc(kindAttr(node)) +
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

    var roots = rootNodes();

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
    var parts = location.hash.replace(/^#\/?/, "").split("/");
    var route = parts[0] || "";
    var current = decodeURIComponent(parts[1] || "");
    var links = document.querySelectorAll(".navlink");

    for (var i = 0; i < links.length; i++) {
      var link = links[i];
      var view = link.getAttribute("data-view");

      // Concept links match on the node they point at; the two view links match
      // on the branch, since everything that is not a use case hangs off the
      // overview.
      var on = view === null
        ? link.getAttribute("data-id") === current
        : view === (route === "use-cases" ? "use-cases" : "");

      if (on) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
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

  function header(node, label, prose) {
    return '<div class="crumb"><span class="chip chip--kind" data-kind="' + esc(kindAttr(node)) +
      '">' + esc(label) + "</span></div>" +
      '<h1 class="title' + (prose ? " title--prose" : "") + '">' + esc(node.name) + "</h1>" +
      // The doc comment, same as the card shows. Without it a reader loses the
      // one sentence explaining the thing at the moment they open it.
      (node.description
        ? '<p class="subtitle">' + esc(node.description) + "</p>"
        : "") +
      whereFound(node);
  }

  // ---------- detail views ----------

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
          return '<a class="flow__item"' +
            (from ? ' data-kind="' + esc(kindAttr(from)) + '"' : "") +
            ' href="' + (from ? hrefOf(from) : "#") + '">' +
            esc(from ? from.name : e.from) +
            (e.via ? '<span class="faint">.' + esc(e.via) + "()</span>" : "") + "</a>";
        }).join("") + "</div></div>";
    }

    var consumers = consumersOf(node.id);

    if (consumers.length > 0) {
      html += '<div class="section"><h2 class="section__head">Consumed by</h2>' +
        '<p class="subtitle">Views built from this event. They read it; none of ' +
        "them can refuse it.</p>" +
        '<div class="flow">' + consumers.map(function (e) {
          var from = byId[e.from];
          return '<a class="flow__item" data-kind="readModel" href="' +
            (from ? hrefOf(from) : "#") + '">' +
            esc(from ? from.name : e.from) + "</a>";
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
          return '<a class="flow__item"' +
            (from ? ' data-kind="' + esc(kindAttr(from)) + '"' : "") +
            ' href="' + (from ? hrefOf(from) : "#") + '">' +
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

  /**
   * Events by class name. A read model's declared union names classes, while
   * its subscriptions name wire names, so comparing the two needs both.
   */
  var eventByClassName = {};
  MODEL.nodes.forEach(function (n) {
    if (n.kind === "event") eventByClassName[n.name] = n;
  });

  /**
   * A node by its written name, for links to things named outside the graph.
   * First match wins: two nodes can share a name across bounded contexts, and
   * guessing which one a caller meant would be worse than linking either.
   */
  function nodeNamed(name) {
    for (var i = 0; i < MODEL.nodes.length; i++) {
      if (MODEL.nodes[i].name === name) return MODEL.nodes[i];
    }
    return null;
  }

  /** Everything that consumes this event, the mirror of "Emitted by". */
  function consumersOf(id) {
    return MODEL.edges.filter(function (e) {
      return e.to === id && e.kind === "consumes";
    });
  }

  /**
   * Everything that asks this read model something, by two routes — because a
   * read model does not have to persist through a repository. The library
   * example's does, so its readers are one hop through the repository it
   * writes; the Postgres views in the workflow-v2 corpus write their own
   * tables, and the only way to their readers is the calls queriedBy
   * collected. (No backticks in here: this whole file is one template.)
   *
   * Shared with the overview card, so the count there is the list here.
   */
  function readersOf(node) {
    var readers = [];
    var seen = {};

    function add(name, href, kind, note) {
      if (seen[name]) return;
      seen[name] = true;
      readers.push({ name: name, href: href, kind: kind, note: note });
    }

    storesOf(node).forEach(function (storeId) {
      edgesTo(storeId, "reads").forEach(function (edge) {
        var asker = byId[edge.from];
        if (!asker || asker.kind !== "useCase") return;
        add(asker.name, hrefOf(asker), kindAttr(asker), "");
      });
    });

    (node.queriedBy || []).forEach(function (site) {
      // A reader is not necessarily a domain concept — it may be a service or a
      // consumer script — so it becomes a page link only when the model holds a
      // node by that name. When it does not, the file travels in the label:
      // "repaint" alone says nothing, and there is no page to click through to.
      var known = nodeNamed(site.name);
      var label = known
        ? site.name
        : site.kind === "module"
          ? site.location.file
          : site.location.file + " \u00b7 " + site.name;

      add(
        label,
        known ? hrefOf(known) : "",
        known ? kindAttr(known) : "",
        site.methods.join(", ")
      );
    });

    return readers;
  }

  /** The repositories a read model saves through, as ids that resolve. */
  function storesOf(node) {
    return edgesFrom(node.id, "writes")
      .map(function (edge) { return edge.to; })
      .filter(function (id) { return !!byId[id]; });
  }

  function viewReadModel(node) {
    var html = header(node, "Read model");

    var consumed = edgesFrom(node.id, "consumes");

    html += '<div class="section"><h2 class="section__head">Built from</h2>';

    if (node.consumesEverything) {
      html += '<p class="subtitle">Listens with a wildcard, so every event in ' +
        "the model reaches it.</p>";
    }

    html += consumed.length > 0
      ? '<div class="cards">' + consumed.map(function (edge) {
          return byId[edge.to] ? detailCard(byId[edge.to]) : "";
        }).join("") + "</div>"
      : '<div class="empty">No event this codebase publishes reaches it.</div>';

    html += "</div>";

    // The gap between the two is worth showing: a union wider than the handlers
    // is either room left for later or a subscription someone forgot to write.
    var heard = node.declaredEventNames || [];
    var unheard = heard.filter(function (name) {
      var event = eventByClassName[name];
      return !node.consumesEverything && event &&
        node.consumedEventNames.indexOf(event.eventName) === -1;
    });

    if (unheard.length > 0) {
      html += '<div class="section"><h2 class="section__head">Declared but not heard</h2>' +
        '<p class="subtitle"><code>' + esc(node.eventUnionTypeName) +
        "</code> admits these too, but no handler is registered for them.</p>" +
        '<div class="flow">' + unheard.map(function (name) {
          var event = eventByClassName[name];
          return '<a class="flow__item" data-kind="event" href="' +
            (event ? hrefOf(event) : "#") + '">' + esc(name) + "</a>";
        }).join("") + "</div></div>";
    }

    // What it maintains is one hop through the repositories it writes to, so it
    // needs no edge kind of its own.
    var stores = storesOf(node);

    var built = [];
    var seenBuilt = {};

    stores.forEach(function (storeId) {
      edgesFrom(storeId, "persists").forEach(function (edge) {
        if (seenBuilt[edge.to] || !byId[edge.to]) return;
        seenBuilt[edge.to] = true;
        built.push(byId[edge.to]);
      });
    });

    if (built.length > 0) {
      html += '<div class="section"><h2 class="section__head">Builds</h2>' +
        '<p class="subtitle">What it keeps up to date, and where \u2014 through ' +
        stores.map(function (id) { return linkTo(id); }).join(", ") + ".</p>" +
        '<div class="cards">' +
        built.map(function (entity) { return blockHtml(entity); }).join("") +
        "</div></div>";
    }

    var askedBy = readersOf(node);

    html += '<div class="section"><h2 class="section__head">Queried by</h2>' +
      '<p class="subtitle">What reads this view. They ask; this decides ' +
      "nothing.</p>";

    html += askedBy.length > 0
      ? '<div class="flow">' + askedBy.map(function (asker) {
          var attrs = (asker.kind ? ' data-kind="' + esc(asker.kind) + '"' : "") +
            (asker.note ? ' title="' + esc(asker.note) + '"' : "");

          return asker.href
            ? '<a class="flow__item"' + attrs + ' href="' + asker.href + '">' +
              esc(asker.name) + "</a>"
            : '<span class="flow__item"' + attrs + ">" + esc(asker.name) +
              "</span>";
        }).join("") + "</div>"
      : '<div class="empty">Nothing in this codebase asks it.</div>';

    html += "</div>";

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
            '"' + (from ? ' data-kind="' + esc(kindAttr(from)) + '"' : "") +
            ' href="' + (from ? hrefOf(from) : "#") + '">' +
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

  /** One sticky note. */
  function noteHtml(o) {
    var inner =
      '<span class="note__kind">' + esc(o.kind) + "</span>" +
      '<span class="note__name">' + esc(o.name) + "</span>" +
      (o.detail ? '<span class="note__detail">' + esc(o.detail) + "</span>" : "");

    // Notes are a fixed size, so long names are clipped. The full text stays
    // reachable: the title shows it on hover, and the note links through to the
    // detail page.
    var full = o.name + (o.detail ? " \u00b7 " + o.detail : "");
    var title = ' title="' + esc(full) + '"';

    return o.href
      ? '<a class="note" data-kind="' + esc(o.tone) + '"' + title +
        ' href="' + o.href + '">' + inner + "</a>"
      : '<span class="note" data-kind="' + esc(o.tone) + '"' + title + ">" +
        inner + "</span>";
  }

  /**
   * The views built from a rank's events, once each.
   *
   * Deduped across the rank: two events landing in one write often feed the same
   * view, and drawing it twice would suggest two of them.
   */
  function consumerTailHtml(outcomeIds) {
    var seen = {};
    var models = [];

    outcomeIds.forEach(function (id) {
      var event = byId[id];
      if (!event || event.kind !== "event") return;

      consumersOf(event.id).forEach(function (edge) {
        if (seen[edge.from]) return;
        seen[edge.from] = true;
        if (byId[edge.from]) models.push(byId[edge.from]);
      });
    });

    if (models.length === 0) return "";

    return '<span class="board__consumers">' +
      '<span class="board__arrow">&#8594;</span>' +
      '<div class="board__rank' + (models.length > 1 ? " board__rank--many" : "") + '">' +
      models.map(function (model) {
        return noteHtml({
          tone: "readModel",
          kind: "Read model",
          name: model.name,
          detail: model.consumesEverything ? "every event" : "",
          href: hrefOf(model)
        });
      }).join("") +
      "</div></span>";
  }

  /**
   * The board: the happy path, then one row per way the use case can be refused.
   *
   * Each row reads left to right as a complete story — the steps taken, then
   * where it ended. Repeating the prefix is the point: a failure row is a
   * scenario you can read on its own.
   */
  function boardHtml(node) {
    if (!node.paths || node.paths.length === 0) return "";

    var isQuery = node.actionKind === "query";
    var actionTone = isQuery ? "query" : "command";

    function pathHtml(path) {
      var html = '<div class="board__path">' +
        noteHtml({
          tone: actionTone,
          kind: isQuery ? "Query" : "Command",
          name: node.actionName || node.actionTypeName,
          detail: ""
        });

      path.steps.forEach(function (step) {
        var target = step.nodeId ? byId[step.nodeId] : null;

        html += '<span class="board__arrow">&#8594;</span>' +
          noteHtml({
            tone: target ? kindAttr(target) : "entity",
            kind: step.kind === "write" ? "Writes" : step.kind === "read" ? "Reads" : "Calls",
            name: step.name,
            detail: step.detail,
            href: target ? hrefOf(target) : ""
          });
      });

      if (path.outcome.length > 0) {
        // One rank, not a sequence: events reaching the same saveWithEvents are
        // written together, and errors leaving the same guard are alternatives.
        // Either way none of them follows another.
        var many = path.outcome.length > 1;
        var isSuccess = path.kind === "success";

        html += '<span class="board__arrow">&#8594;</span>' +
          '<div class="board__rank' + (many ? " board__rank--many" : "") + '">';

        path.outcome.forEach(function (id, index) {
          var outcome = byId[id];

          if (many && index > 0 && !isSuccess) {
            html += '<span class="board__alt">or</span>';
          }

          html += noteHtml({
            tone: isSuccess ? "event" : "error",
            kind: isSuccess ? "Event" : "Error",
            name: outcome ? outcome.name : id,
            detail: outcome && outcome.eventName ? outcome.eventName : "",
            href: outcome ? hrefOf(outcome) : ""
          });
        });

        html += "</div>";

        // Downstream of the events, so a second arrow and a second rank. Folding
        // these into the rank above would say they happen alongside the events
        // rather than because of them.
        if (isSuccess) html += consumerTailHtml(path.outcome);
      } else if (path.kind === "success" && isQuery && node.returnsStateTypeName) {
        // A query hands back state rather than recording an event. This is not
        // the read-model concept — that is a view built from events, and it has
        // its own pages.
        html += '<span class="board__arrow">&#8594;</span>' +
          noteHtml({
            tone: "query",
            kind: "Returns",
            name: node.returnsStateTypeName,
            detail: ""
          });
      }

      return html + "</div>";
    }

    var success = node.paths.filter(function (p) { return p.kind === "success"; });
    var failures = node.paths.filter(function (p) { return p.kind === "failure"; });

    // Only worth a control if this codebase has views to show.
    var hasConsumers = MODEL.edges.some(function (e) { return e.kind === "consumes"; });

    var head = hasConsumers
      ? '<div class="section__bar"><h2 class="section__head">Board</h2>' +
        '<button class="toggle" type="button" data-kind="readModel" data-consumers-toggle ' +
        'aria-pressed="' + showConsumers + '">Read models</button></div>'
      : '<h2 class="section__head">Board</h2>';

    var html = '<div class="section">' + head +
      '<div class="board" data-consumers="' + (showConsumers ? "on" : "off") +
      '"><div class="board__inner">';

    success.forEach(function (path) {
      html += '<div class="board__row"><div class="board__label">Happy path</div>' +
        pathHtml(path) + "</div>";
    });

    failures.forEach(function (path, index) {
      html += '<div class="board__row board__row--failure">' +
        '<div class="board__label">Failure path ' + (index + 1) + "</div>" +
        pathHtml(path) + "</div>";
    });

    html += "</div></div>";

    if (failures.length === 0) {
      html += '<p class="subtitle" style="margin-top:10px">No domain failure \u2014 ' +
        "this use case cannot be refused.</p>";
    }

    if (node.eventsUndetermined) {
      html += '<p class="subtitle" style="margin-top:10px">Something passed to ' +
        "<code>saveWithEvents</code> could not be traced to an event class, so the " +
        "happy path may be incomplete.</p>";
    }

    return html + "</div>";
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

    html += boardHtml(node);

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

  /**
   * The groups the overview counts, in the order it counts them.
   *
   * One entry drives both the counter and the screen it opens, so the number and
   * the page behind it cannot disagree. Aggregates and entities share one kind
   * in the model and are split here on containment.
   *
   * An entry carrying a blurb is served by the generic list screen; the two
   * without one — aggregates and use cases — have hand-written screens the
   * router reaches first.
   */
  var GROUPS = [
    {
      route: "domain", kind: "entity", label: "Aggregates",
      nodes: aggregateNodes
    },
    {
      route: "entity", kind: "subEntity", label: "Entities",
      blurb: "Objects with an identity that hold nothing of their own \u2014 either " +
        "inside an aggregate, or standing alone.",
      nodes: plainEntities
    },
    {
      route: "value-object", kind: "valueObject", label: "Value objects",
      blurb: "Immutable and compared by value \u2014 two with the same contents are the " +
        "same thing.",
      nodes: function () { return nodesOfKind("valueObject"); }
    },
    {
      route: "use-cases", kind: "command", label: "Use cases",
      nodes: function () { return nodesOfKind("useCase"); }
    },
    {
      route: "event", kind: "event", label: "Events",
      blurb: "Facts already recorded. Each one is named in the past tense.",
      nodes: function () { return nodesOfKind("event"); }
    },
    {
      route: "error", kind: "error", label: "Errors",
      blurb: "Refusals a behaviour can return \u2014 expected outcomes, not exceptions.",
      nodes: function () { return nodesOfKind("error"); }
    },
    {
      route: "invariant", kind: "invariant", label: "Invariants",
      blurb: "Rules that must hold before a change is allowed through.",
      nodes: function () { return nodesOfKind("invariant"); }
    },
    {
      route: "repository", kind: "repository", label: "Repositories",
      blurb: "The ports through which aggregates are loaded and saved.",
      nodes: function () { return nodesOfKind("repository"); }
    },
    {
      route: "read-model", kind: "readModel", label: "Read models",
      blurb: "Views built by listening to events rather than written to directly. " +
        "They answer questions; they decide nothing.",
      nodes: function () { return nodesOfKind("readModel"); }
    }
  ];

  var groupByRoute = {};
  GROUPS.forEach(function (g) { groupByRoute[g.route] = g; });

  function viewOverview() {
    var html = '<h1 class="title">Overview</h1>' +
      '<p class="subtitle">Extracted from <code>' + esc(MODEL.root) + "</code>. " +
      "Every count opens what it counted.</p>";

    html += '<div class="section"><div class="tiles">';
    GROUPS.forEach(function (group) {
      var count = group.nodes().length;
      if (count === 0) return;
      html += '<a class="tile" data-kind="' + esc(group.kind) +
        '" href="#/' + esc(group.route) + '"><div class="tile__n">' +
        count + "</div>" +
        '<div class="tile__k">' + esc(group.label) + "</div></a>";
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

    return html;
  }

  /**
   * Every node in one group, as a grid — where an overview counter leads.
   */
  function viewKindList(route) {
    var group = groupByRoute[route];
    if (!group || !group.blurb) return "";

    var nodes = group.nodes();

    return trailHtml([
        { label: "Overview", href: "#/" },
        { label: group.label }
      ]) +
      '<h1 class="title">' + esc(group.label) + " \u2014 " + nodes.length + "</h1>" +
      '<p class="subtitle">' + esc(group.blurb) + "</p>" +
      '<div class="section">' +
      (nodes.length
        ? '<div class="cards">' + nodes.map(function (n) { return blockHtml(n); }).join("") +
          "</div>"
        : '<div class="empty">None found.</div>') +
      "</div>";
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
    readModel: "Read model",
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
    readModel: "RM",
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
    // A contained entity reads as an entity; only a root wears the aggregate colour.
    if (node.kind === "entity" && !isAggregate(node)) return "subEntity";
    return node.kind;
  }

  function badgeOf(node) {
    if (node.kind === "useCase") {
      return node.actionKind === "query" ? "QRY" : "CMD";
    }
    if (node.kind === "entity" && !isAggregate(node)) return "ENT";
    return KIND_BADGE[node.kind] || "";
  }

  function labelOf(node) {
    if (node.kind === "entity" && !isAggregate(node)) return "Entity";
    return KIND_LABEL[node.kind] || node.kind;
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

    // Cards are a fixed height, so long names and descriptions are clipped. The
    // full text stays reachable: the title shows it on hover, and the card links
    // through to the detail page.
    var full = o.name + (o.desc ? " \u2014 " + o.desc : "");
    var title = ' title="' + esc(full) + '"';

    return o.href
      ? '<a class="' + cls + '" data-kind="' + esc(o.kind) + '"' + title +
        ' href="' + o.href + '">' + inner + "</a>"
      : '<div class="' + cls + '" data-kind="' + esc(o.kind) + '"' + title + ">" +
        inner + "</div>";
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

    if (node.kind === "readModel") {
      var consumed = edgesFrom(node.id, "consumes").length;
      if (node.consumesEverything) parts.push("every event");
      else if (consumed) parts.push(consumed + " event" + (consumed === 1 ? "" : "s"));
      var readers = readersOf(node).length;
      if (readers) parts.push(readers + " reader" + (readers === 1 ? "" : "s"));
    }

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

  function blockHtml(node, extraClass) {
    return cardHtml({
      kind: kindAttr(node),
      name: node.name,
      mono: true,
      badge: badgeOf(node),
      desc: node.description || "",
      stats: statsOf(node),
      tinted: true,
      extra: extraClass,
      href: hrefOf(node)
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

  /**
   * The head of a breadcrumb: which list this object belongs to. A lone entity
   * is not in the aggregates screen, so its trail must not claim it is.
   */
  function trailHead(node) {
    var top = pathTo(node)[0];

    return top && isAggregate(top)
      ? [{ label: "Overview", href: "#/" }, { label: "Aggregates", href: "#/domain" }]
      : [{ label: "Overview", href: "#/" }, { label: "Entities", href: "#/entity" }];
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

  /** Every id a node's methods name, once each, in the order they appear. */
  function acrossMethods(node, field) {
    var seen = {};
    var ids = [];

    (node.methods || []).forEach(function (method) {
      (method[field] || []).forEach(function (id) {
        if (seen[id]) return;
        seen[id] = true;
        ids.push(id);
      });
    });

    return ids;
  }

  function detailCards(ids) {
    return '<div class="cards">' + ids.map(function (id) {
      return byId[id] ? detailCard(byId[id]) : "";
    }).join("") + "</div>";
  }

  /**
   * The page for one object that carries state and identity — an aggregate, an
   * entity inside one, a sub-entity, or a value object.
   *
   * There is exactly one of these per object. There used to be two: a structural
   * view reached from the lists and the diagram, and a detail view reached from
   * the rail. Which one you got depended on where you clicked, which is not a
   * property of the thing you clicked. The sections below are the union of both,
   * ordered as: what it is, what shape it has, what it does, what it holds.
   */
  function viewObject(node) {
    var segments = pathTo(node).map(function (n) {
      return { label: n.name, href: hrefOf(n) };
    });

    segments = trailHead(node).concat(segments);

    var body = trailHtml(segments) +
      '<h1 class="title">' + esc(node.name) + " " + esc(labelOf(node)) + "</h1>" +
      (node.description ? '<p class="subtitle">' + esc(node.description) + "</p>" : "") +
      whereFound(node) +
      legendHtml(DOMAIN_LEGEND);

    var invariants = node.invariants || [];

    // What is always true of this object comes first — it frames everything
    // below rather than trailing it.
    if (invariants.length > 0) {
      body += '<div class="section"><h2 class="section__head">Invariants</h2>' +
        '<div class="flow">' + invariants.map(function (id) {
          var inv = byId[id];
          return '<a class="flow__item" data-kind="invariant" href="' +
            (inv ? hrefOf(inv) : "#") + '">' +
            esc(inv ? inv.description : id) + "</a>";
        }).join("") + "</div></div>";
    }

    // Then the shape: the lists further down only make sense once you can see
    // what holds what.
    var graph = graphFor(node);

    if (graph) {
      body += '<div class="section"><h2 class="section__head">Structure</h2>' +
        '<p class="subtitle">' +
        (isAggregate(node)
          ? "What this aggregate holds, and the events those produce. " +
            "Errors are left out — this is about structure."
          : isRoot(node)
            ? "This entity holds nothing of its own. The events it produces, " +
              "and nothing else."
            : "Where " + esc(node.name) + " sits inside " + esc(graph.title) + ".") +
        "</p>" +
        graphBlockHtml(graph, node.id) +
        legendHtml(GRAPH_LEGEND) +
        "</div>";
    }

    var behaviours = (node.methods || []).filter(function (m) {
      return m.emits.length > 0 || m.canFail.length > 0;
    });

    if (behaviours.length > 0) {
      body += '<div class="section"><h2 class="section__head">Behaviours</h2>' +
        '<div class="cards">' +
        behaviours.map(function (m) { return behaviourBlockHtml(node, m); }).join("") +
        "</div></div>";
    }

    // The roll-up: a behaviour card carries only counts, and this is what those
    // count. Everything here is also reachable one level deeper, per behaviour.
    var emitted = acrossMethods(node, "emits");
    var raised = acrossMethods(node, "canFail");

    if (emitted.length > 0) {
      body += '<div class="section"><h2 class="section__head">Events emitted</h2>' +
        detailCards(emitted) + "</div>";
    }

    if (raised.length > 0) {
      body += '<div class="section"><h2 class="section__head">Errors raised</h2>' +
        detailCards(raised) + "</div>";
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
        '<p class="subtitle">Named by id, not held — following one leaves this aggregate.</p>' +
        '<div class="cards">' + references.map(function (edge) {
          var to = byId[edge.to];
          if (!to) return "";
          return cardHtml({
            kind: kindAttr(to),
            name: to.name,
            mono: true,
            badge: badgeOf(to),
            desc: "Referenced by id via " + edge.via + ".",
            href: hrefOf(to)
          });
        }).join("") + "</div></div>";
    }

    var persisted = edgesTo(node.id, "persists");

    if (persisted.length > 0) {
      body += '<div class="section"><h2 class="section__head">Persisted by</h2>' +
        "<p>" + linkList(persisted.map(function (e) { return e.from; })) + "</p></div>";
    }

    body += findingsFor(node.id);

    var fields = node.stateFields || [];
    if (fields.length === 0) return body;

    // The state type name rides in the inspector label, so the detail page's
    // "State — <Type>" heading survives without a second table of the same rows.
    return '<div class="main--split"><div class="main__body">' + body + "</div>" +
      inspectorHtml({
        name: node.name,
        kind: kindAttr(node),
        badge: badgeOf(node),
        desc: node.description || "",
        label: "State &mdash; <span class=\"mono\">" + esc(node.stateTypeName) + "</span>",
        fields: fields.map(function (f) {
          return {
            name: f.name,
            type: f.type,
            note: f.optional ? "Optional" : ""
          };
        })
      }) + "</div>";
  }

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
      return { label: n.name, href: hrefOf(n) };
    });
    segments = trailHead(owner).concat(segments);
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

  /** The legend bar under every object header. */
  var DOMAIN_LEGEND = [
    ["entity", "Aggregate"],
    ["subEntity", "Entity"],
    ["valueObject", "Value object"],
    ["behaviour", "Behaviour"],
    ["event", "Event"],
    ["error", "Error"],
    ["invariant", "Invariant"],
    ["repository", "Repository"],
    ["readModel", "Read model"]
  ];

  /** Screen 1 — every aggregate in the model. */
  function viewDomainRoots() {
    var roots = aggregateNodes();

    var html = trailHtml([
        { label: "Overview", href: "#/" },
        { label: "Aggregates" }
      ]) +
      '<h1 class="title">Aggregates \u2014 ' + roots.length + "</h1>" +
      '<p class="subtitle">Top-level objects that hold others \u2014 nothing holds these, ' +
      "and each is one atomic write. Open one to see what it contains and what it can do.</p>" +
      legendHtml(DOMAIN_LEGEND);

    html += '<div class="section">' +
      (roots.length
        ? '<div class="cards">' + roots.map(function (n) { return blockHtml(n); }).join("") + "</div>"
        : '<div class="empty">Nothing here aggregates anything \u2014 every entity in ' +
          'this model stands alone. See <a href="#/entity">Entities</a>.</div>') +
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

  // ---------- theme ----------

  var THEME_KEY = "ontologic-theme";

  /**
   * Three states, matching the three the stylesheet defines: no attribute means
   * follow the system, and an explicit value overrides it in either direction.
   */
  function currentTheme() {
    var set = document.documentElement.getAttribute("data-theme");
    return set === "light" || set === "dark" ? set : "system";
  }

  function applyTheme(choice) {
    if (choice === "system") {
      document.documentElement.removeAttribute("data-theme");
    } else {
      document.documentElement.setAttribute("data-theme", choice);
    }

    try {
      if (choice === "system") localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, choice);
    } catch (e) {
      // Storage can be blocked on file:// — the choice still applies, it just
      // does not survive a reload.
    }

    markTheme();
  }

  function markTheme() {
    var now = currentTheme();
    var buttons = document.querySelectorAll("[data-theme-set]");

    for (var i = 0; i < buttons.length; i++) {
      buttons[i].setAttribute(
        "aria-pressed",
        buttons[i].getAttribute("data-theme-set") === now ? "true" : "false",
      );
    }
  }

  function wireTheme() {
    var group = document.getElementById("theme");
    if (!group) return;

    group.addEventListener("click", function (event) {
      var button = event.target.closest("[data-theme-set]");
      if (button) applyTheme(button.getAttribute("data-theme-set"));
    });

    markTheme();
  }

  // ---------- graph ----------

  // Geometry, mirroring GRAPH_GEOMETRY in render/graph.ts so unfolding a family
  // can re-place the tree with the same rule the generator used. A test asserts
  // the two agree.
  var BOX_W = 172, BOX_H = 24, COLUMN = 208, ROW = 30, PAD = 16;

  /** Family boxes the reader has opened, keyed by "<rootId>#<index>". */
  var unfolded = {};

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
   * The diagram for whichever aggregate a node belongs to. Layouts are keyed by
   * root, so a contained entity borrows the one for the root above it.
   */
  function graphFor(node) {
    var graphs = MODEL.graphs || [];
    var trail = pathTo(node);
    var rootId = trail.length > 0 ? trail[0].id : node.id;

    for (var i = 0; i < graphs.length; i++) {
      if (graphs[i].rootId === rootId) return graphs[i];
    }

    return null;
  }

  /** A family member reads the way it would have if it were never collapsed. */
  function memberKind(node) {
    if (!node) return "valueObject";
    return node.kind === "valueObject" || node.kind === "event"
      ? node.kind
      : "subEntity";
  }

  /**
   * The layout with every opened family unfolded back into its members.
   *
   * The generator decided the tree (render/graph.ts) and this only re-runs its
   * placement rule over a bigger one: depth sets x, leaves stack down a running
   * cursor, and a parent centres between its first and last child. That works
   * because a collapsed family is only ever collapsed when none of its members
   * has children — so unfolding adds leaves and never a new decision.
   */
  function placedGraph(layout) {
    var nodes = layout.nodes.map(function (n) {
      return {
        id: n.id, label: n.label, kind: n.kind, count: n.count,
        memberIds: n.memberIds, open: false, x: 0, y: 0
      };
    });

    var kids = nodes.map(function () { return []; });
    layout.edges.forEach(function (edge) { kids[edge.from].push(edge.to); });

    nodes.slice().forEach(function (node, index) {
      if (!node.memberIds || !unfolded[layout.rootId + "#" + index]) return;
      node.open = true;

      node.memberIds.forEach(function (id) {
        var member = byId[id];

        kids[index].push(nodes.length);
        kids.push([]);
        nodes.push({
          id: id,
          label: member ? member.name : id,
          kind: memberKind(member),
          open: false,
          x: 0, y: 0
        });
      });
    });

    var cursor = 0;

    var place = function (index, depth) {
      var node = nodes[index];
      node.x = PAD + depth * COLUMN;

      if (kids[index].length === 0) {
        node.y = cursor;
        cursor += ROW;
        return;
      }

      kids[index].forEach(function (child) { place(child, depth + 1); });

      var first = nodes[kids[index][0]];
      var last = nodes[kids[index][kids[index].length - 1]];
      node.y = (first.y + last.y) / 2;
    };

    place(0, 0);

    var edges = [];
    kids.forEach(function (list, from) {
      list.forEach(function (to) { edges.push({ from: from, to: to }); });
    });

    var maxX = nodes.reduce(function (max, n) { return Math.max(max, n.x); }, 0);

    return {
      rootId: layout.rootId,
      title: layout.title,
      nodes: nodes,
      edges: edges,
      width: maxX + BOX_W + PAD,
      height: Math.max(cursor + PAD * 2, BOX_H + PAD * 2)
    };
  }

  function graphSvg(source, currentId) {
    var layout = placedGraph(source);
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

    layout.nodes.forEach(function (node, index) {
      var family = node.kind === "family";

      var label = family
        ? truncate(node.label, 16) + " ×" + node.count
        : truncate(node.label, 22);

      // The box for the node whose page this is, so a contained entity can see
      // where it sits rather than having to find its own name.
      var here = !!currentId && node.id === currentId;

      var box =
        '<rect x="' + node.x + '" y="' + node.y + '" width="' + BOX_W +
        '" height="' + BOX_H + '" rx="4" fill="' +
        (GRAPH_FILL[node.kind] || "var(--surface)") + '" stroke="' +
        (GRAPH_STROKE[node.kind] || "var(--line-strong)") + '" stroke-width="' +
        (here ? "2.5" : "1") + '"' +
        (family ? ' stroke-dasharray="3 2"' : "") + "/>" +
        '<text x="' + (node.x + 9) + '" y="' + (node.y + 16) +
        '" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="' +
        (node.kind === "event" ? "10.5" : "11.5") + '" font-weight="' +
        (here ? "700" : "400") + '" fill="var(--ink)">' +
        esc(label) + "</text>";

      if (family) {
        // A caret rather than a link: the box stands for several nodes, so there
        // is nowhere for it to navigate to. Opening it is the only thing it does.
        box += '<text x="' + (node.x + BOX_W - 9) + '" y="' + (node.y + 16) +
          '" text-anchor="end" font-size="11" fill="var(--ink)">' +
          (node.open ? "\u25be" : "\u25b8") + "</text>";

        boxes += '<g class="gfold" role="button" tabindex="0" data-unfold="' +
          esc(layout.rootId + "#" + index) + '" aria-expanded="' + node.open +
          '" aria-label="' + esc(node.label) + ", " + node.count + ' of them">' +
          box + "</g>";
        return;
      }

      boxes += node.id
        ? '<a href="' + (byId[node.id] ? hrefOf(byId[node.id]) : "#") + '">' +
          box + "</a>"
        : box;
    });

    return '<svg viewBox="0 0 ' + layout.width + " " + layout.height +
      '" width="' + layout.width + '" height="' + layout.height +
      '" role="img" aria-label="Structure of ' + esc(layout.title) + '">' +
      edges + boxes + "</svg>";
  }

  /**
   * The diagram in its scroll container. Unfolding redraws only what is inside
   * it, so the reader keeps their scroll position and the rest of the page.
   */
  function graphBlockHtml(layout, currentId) {
    return '<div class="scroll" style="padding:6px" data-graph="' +
      esc(layout.rootId) + '" data-current="' + esc(currentId || "") + '">' +
      graphSvg(layout, currentId) + "</div>";
  }

  function redrawGraph(container) {
    var rootId = container.getAttribute("data-graph");
    var graphs = MODEL.graphs || [];

    for (var i = 0; i < graphs.length; i++) {
      if (graphs[i].rootId !== rootId) continue;
      container.innerHTML = graphSvg(graphs[i], container.getAttribute("data-current"));
      return;
    }
  }

  /** Show or hide the read models on every board at once. */
  function toggleConsumers(target) {
    var hit = target && target.closest
      ? target.closest("[data-consumers-toggle]")
      : null;
    if (!hit) return false;

    showConsumers = !showConsumers;
    hit.setAttribute("aria-pressed", String(showConsumers));

    var boards = document.querySelectorAll("[data-consumers]");
    for (var i = 0; i < boards.length; i++) {
      boards[i].setAttribute("data-consumers", showConsumers ? "on" : "off");
    }

    return true;
  }

  /** Open or close the family box the event landed on. */
  function toggleUnfold(target) {
    var hit = target && target.closest ? target.closest("[data-unfold]") : null;
    if (!hit) return false;

    var key = hit.getAttribute("data-unfold");
    if (unfolded[key]) delete unfolded[key];
    else unfolded[key] = true;

    var container = hit.closest("[data-graph]");
    if (!container) return true;

    redrawGraph(container);

    // The members appear one column to the right of the box, usually past the
    // edge of the scroll box. Without this the reader clicks and sees a gap open
    // where the box was, with what they asked for off-screen.
    var opened = container.querySelector(
      '[data-unfold="' + key + '"][aria-expanded="true"]'
    );
    var box = opened && opened.querySelector("rect");

    if (box) {
      var right = Number(box.getAttribute("x")) + COLUMN + BOX_W + PAD;
      if (right > container.clientWidth) {
        container.scrollLeft = right - container.clientWidth;
      }
    }

    return true;
  }

  /** Reads the diagram, not the page — the concept legend above covers the rest. */
  var GRAPH_LEGEND = [
    ["entity", "aggregate root"],
    ["subEntity", "entity it holds"],
    ["valueObject", "value object"],
    ["event", "event"],
    ["family", "family — any one of N, click to open"]
  ];

  // ---------- routing ----------

  /**
   * The one view per kind. The router consults this and nothing else once it has
   * a node, so an object cannot render differently depending on how it was
   * reached.
   */
  var VIEWS = {
    entity: viewObject,
    subEntity: viewObject,
    valueObject: viewObject,
    event: viewEvent,
    error: viewError,
    invariant: viewInvariant,
    repository: viewRepository,
    readModel: viewReadModel,
    useCase: viewUseCase
  };

  function render() {
    var parts = location.hash.replace(/^#\/?/, "").split("/");
    var route = parts[0] || "";
    var target = decodeURIComponent(parts.slice(1).join("/") || "");

    // The standalone graph screen is gone — the diagram belongs to the aggregate
    // it describes. Rewrite the address rather than render something else at it,
    // and replace rather than push, so Back does not bounce off the redirect.
    if (route === "graph") {
      location.replace(
        "#/domain" + (target ? "/" + encodeURIComponent(target) : "")
      );
      return;
    }

    var main = document.getElementById("main");

    main.innerHTML = viewFor(route, target);
    main.scrollTop = 0;
    window.scrollTo(0, 0);
    markCurrent();
  }

  /**
   * What to draw.
   *
   * The object decides, never the address: an id is resolved and dispatched on
   * its kind before the route is looked at, so every address that names the same
   * node renders the same page. The route only picks a screen when there is no
   * node to pick one — a list, or the overview.
   */
  function viewFor(route, target) {
    // A behaviour is not a node; it is addressed as owner::method.
    if (target.indexOf("::") !== -1) {
      var found = behaviourOf(target);
      if (found) return viewBehaviour(found.owner, found.method);
    }

    var node = byId[target];
    if (node && VIEWS[node.kind]) return VIEWS[node.kind](node);

    if (!route) return viewOverview();

    // "explore" is the pre-redesign address, kept so saved links still work.
    if (route === "domain" || route === "explore") return viewDomainRoots();
    if (route === "use-cases" || route === "use-case") return viewUseCases();

    var list = viewKindList(route);
    if (list) return list;

    return '<h1 class="title">Not found</h1>' +
      '<p class="subtitle">No ' + esc(routeToKind[route] || route) +
      ' matches this address. <a href="#/">Back to the overview</a>.</p>';
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

  document.addEventListener("click", function (event) {
    if (toggleUnfold(event.target)) event.preventDefault();
    else if (toggleConsumers(event.target)) event.preventDefault();
  });

  document.addEventListener("keydown", function (event) {
    // A focused family box opens on Enter or Space, before Enter is read as
    // "open whatever the rail cursor is on".
    if (event.key === "Enter" || event.key === " ") {
      if (toggleUnfold(event.target)) {
        event.preventDefault();
        return;
      }
    }

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

  wireTheme();
  renderFilters();
  renderRail("");
  render();
})();
`;
