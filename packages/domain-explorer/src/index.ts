import type { DomainModel } from "./extract/model";
import { buildProgram, type BuildProgramOptions } from "./extract/program";
import { extractEntities } from "./extract/entities";
import { extractEvents } from "./extract/events";
import { extractErrors } from "./extract/errors";
import { extractInvariants } from "./extract/invariants";
import { extractRepositories } from "./extract/repositories";
import { extractUseCases } from "./extract/useCases";
import { extractReadModels } from "./extract/readModels";
import { linkModel } from "./extract/link";
import {
  aggregateRoots,
  extractSubEntities,
  linkContainment,
} from "./extract/containment";
import { computeFindings, keepEventUnions } from "./extract/findings";
import { buildGraphLayouts } from "./render/graph";

export type * from "./extract/model";
export type { BuildProgramOptions } from "./extract/program";
export { renderHtml } from "./render/html";

/**
 * Analyse an Ontologic codebase and return its domain model.
 *
 * Extraction is deliberately separate from rendering: the model is plain
 * serialisable data, so it can be asserted on in tests, written out as JSON, or
 * fed to something other than the bundled HTML renderer.
 */
export function extractModel(options: BuildProgramOptions): DomainModel {
  const ctx = buildProgram(options);

  const entities = extractEntities(ctx);
  const { events, unions } = extractEvents(ctx);
  const errors = extractErrors(ctx);
  const invariants = extractInvariants(ctx);
  const repositories = extractRepositories(ctx);

  // Use cases are detected after repositories: the repository names are what
  // let the extractor tell which constructor parameters are aggregates, and
  // which un-migrated functions still look like use cases.
  const { useCases, unmarked } = extractUseCases(ctx, {
    repositoryNames: new Set(repositories.map((r) => r.name)),
    entities,
    repositories,
  });

  // Read models need the union aliases so `ReadModel<LibraryEvent>` can be
  // resolved to the events that alias names.
  const { readModels, undeclared } = extractReadModels(
    ctx,
    unions,
    new Set(repositories.map((r) => r.name)),
  );

  // Sub-entities are discovered through containment, so they can only be found
  // once the entities that hold them have been extracted.
  const subEntities = extractSubEntities(ctx, entities);

  const nodes = [
    ...entities,
    ...subEntities,
    ...events,
    ...errors,
    ...invariants,
    ...repositories,
    ...useCases,
    ...readModels,
  ];

  const edges = [...linkModel(nodes), ...linkContainment(nodes)];
  const eventUnions = keepEventUnions(unions, nodes);

  const model: DomainModel = {
    root: ctx.root,
    nodes,
    edges,
    eventUnions,
    findings: computeFindings(nodes, eventUnions, unmarked, undeclared),
    aggregateRoots: aggregateRoots(nodes, edges),
    graphs: [],
  };

  // Needs the finished graph, so it runs last.
  model.graphs = buildGraphLayouts(model);

  return model;
}
